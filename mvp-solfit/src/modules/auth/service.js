/**
 * modules/auth — 账户域（模块化单体 · 业务域 5/5 · Phase 16）
 *
 * 账户是被依赖最多的一站：订单归属、跨设备购物车/心愿单、GDPR 按
 * userId 口径、后续会员体系全部压在它上面。
 *
 * 设计要点：
 *   * 通行证 = 邮箱 + 密码（scrypt N=16384 派生 64B hash + 每用户 16B 盐，
 *     Node 内置 crypto —— 零外部依赖，自研边界铁律：业务域不引库）
 *   * 会话绑定：登录把当前 solfit_sid 绑到 userId（userSessions，服务端态）。
 *     不轮换 sid —— sid 由服务端随机生成 + httpOnly cookie，无 URL 注入面
 *     （会话固定攻击需要攻击者能种 cookie 值）；轮换反而会切断本会话
 *     已有的游客数据（购物车/档案/反馈）与合并链路。
 *   * 游客→账户数据迁移（adoptGuestData，登录/注册时一次完成）：
 *       1. 购物车合并（游客车 ∪ 账户车，同款数量加和）
 *       2. 心愿单/不感兴趣水合（账户列表并入会话列表 —— 会话是推荐
 *          热路径的事实源；此后反馈写入双写，见 feedback.js）
 *       3. 历史订单按 email 回填归属（游客期用同邮箱下的单都认领）
 *   * 防爆破：每邮箱失败计数 ≥5 锁 15 分钟（内存 Map；多实例部署时
 *     换 Redis —— 与 cache.js 同演进约定）
 *   * GDPR：purgeAccount/exportAccount 供 privacy 路由调用（账户级三清
 *     与可携带权）；事件流不含 userId/email（见 pipeline.js 注释）。
 */

import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { store, trackEvent } from "@/lib/db";
import { mergeCarts } from "@/modules/cart/service";
import { adoptFeedbackForUser } from "@/ai/recommender/feedback";

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const LOCK_THRESHOLD = 5;          // 失败次数阈值
const LOCK_WINDOW_MS = 15 * 60 * 1000; // 锁定时长

const _loginFails = new Map(); // emailKey -> { count, lockedUntil }

const emailKeyOf = (email) => String(email || "").trim().toLowerCase();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(String(password), salt, SCRYPT.keylen, {
    N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p,
  }).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(expectedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b); // 恒时比较 —— 不泄比对长度信息
}

/** 对外用户形态（永不带密码材料） */
const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt });

function findUserByKey(key) {
  for (const u of store("users").values()) if (u.emailKey === key) return u;
  return null;
}

// ===== 注册 / 登录 =====

export function register(sessionId, { email, password, name } = {}) {
  if (!sessionId) throw new Error("SESSION_REQUIRED");
  if (!EMAIL_RE.test(emailKeyOf(email))) throw new Error("INVALID_EMAIL");
  if (!password || String(password).length < 8) throw new Error("WEAK_PASSWORD");

  const key = emailKeyOf(email);
  if (findUserByKey(key)) throw new Error("USER_EXISTS");

  const { salt, hash } = hashPassword(password);
  const user = {
    id: randomUUID(),
    email: String(email).trim(),
    emailKey: key,
    name: name ? String(name).trim().slice(0, 80) : null,
    salt,
    passwordHash: hash,
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  };
  store("users").set(user.id, user);

  bindSession(sessionId, user.id);
  adoptGuestData(sessionId, user);
  trackEvent("user_registered", { sessionId });
  return publicUser(user);
}

export function login(sessionId, { email, password } = {}) {
  if (!sessionId) throw new Error("SESSION_REQUIRED");
  const key = emailKeyOf(email);

  // 防爆破：锁定期间直接拒绝（不提示"密码错误"，不给爆破oracle）
  const fail = _loginFails.get(key);
  if (fail?.lockedUntil) {
    if (Date.now() < fail.lockedUntil) throw new Error("ACCOUNT_LOCKED");
    _loginFails.delete(key); // 锁定过期 → 失败计数重新起算
  }

  const user = findUserByKey(key);
  if (!user || !verifyPassword(password, user.salt, user.passwordHash)) {
    const f = _loginFails.get(key) || { count: 0, lockedUntil: 0 };
    f.count++;
    if (f.count >= LOCK_THRESHOLD) {
      // 第 5 次失败即触发锁定并返回 429（不等到第 6 次才生效）
      f.lockedUntil = Date.now() + LOCK_WINDOW_MS;
      _loginFails.set(key, f);
      throw new Error("ACCOUNT_LOCKED");
    }
    _loginFails.set(key, f);
    throw new Error("INVALID_CREDENTIALS");
  }

  _loginFails.delete(key); // 成功即清账
  user.lastLoginAt = new Date().toISOString();
  store("users").set(user.id, user);

  bindSession(sessionId, user.id);
  adoptGuestData(sessionId, user);
  trackEvent("user_logged_in", { sessionId });
  return publicUser(user);
}

export function logout(sessionId) {
  const bound = boundUserId(sessionId);
  store("userSessions").delete(sessionId);
  // 会话内已合并的数据（购物车/反馈）留在会话 —— 退出不等于遗忘体验
  return { loggedOut: true, hadUser: !!bound };
}

// ===== 会话绑定 =====

function bindSession(sessionId, userId) {
  store("userSessions").set(sessionId, { userId, at: new Date().toISOString() });
}

export function boundUserId(sessionId) {
  return (sessionId && store("userSessions").get(sessionId)?.userId) || null;
}

/** 当前登录用户（无会话 cookie 的 SSR 场景安全返回 null） */
export function currentUser(sessionId) {
  const uid = boundUserId(sessionId);
  const u = uid && store("users").get(uid);
  return u ? publicUser(u) : null;
}

// ===== 游客 → 账户数据迁移（登录/注册时） =====

function adoptGuestData(sessionId, user) {
  // 1) 购物车合并：游客车 ∪ 账户车（同款数量加和），两边同写 ——
  //    会话车是本会话事实源（结账读它），账户车是跨设备水合源
  const guestCart = store("carts").get(sessionId) || { items: [] };
  const userCart = store("userCarts").get(user.id) || { items: [] };
  const merged = mergeCarts(guestCart, userCart);
  store("carts").set(sessionId, merged);
  store("userCarts").set(user.id, merged);

  // 2) 心愿单/不感兴趣水合：账户列表并入会话（此后写入双写，读仍纯会话键）
  adoptFeedbackForUser(sessionId, user.id);

  // 3) 历史订单认领：游客期用同邮箱下的单回填归属（跨设备"我的订单"的来源）
  let attributed = 0;
  for (const o of store("orders").values()) {
    if (!o.userId && o.email && emailKeyOf(o.email) === user.emailKey) {
      o.userId = user.id;
      store("orders").set(o.id, o);
      attributed++;
    }
  }
  return { cartItems: merged.items.length, attributedOrders: attributed };
}

// ===== GDPR（privacy/erase 与 privacy/export 调用） =====

/** 账户级三清：用户记录/跨设备车/反馈 user 键 + 订单脱关联（财务记录保留） */
export function purgeAccount(sessionId) {
  const uid = boundUserId(sessionId);
  if (!uid) return { account: 0, userCarts: 0, attributedOrders: 0 };

  // 订单脱关联（金额/状态保留 —— 与 sessionId 脱关联同口径）
  let attributed = 0;
  for (const o of store("orders").values()) {
    if (o.userId === uid) {
      o.userId = null;
      o.email = null;
      store("orders").set(o.id, o);
      attributed++;
    }
  }

  const cartsCleared = store("userCarts").delete(uid) ? 1 : 0;
  store("savedItems").delete("u:" + uid); // 反馈 user 键（feedback.js write-through 的落点）
  store("hiddenItems").delete("u:" + uid);
  store("users").delete(uid);
  store("userSessions").delete(sessionId);
  return { account: 1, userCarts: cartsCleared, attributedOrders: attributed };
}

/** 账户级导出（可携带权）：画像 + 全部关联订单 + 跨设备购物车与反馈 */
export function exportAccount(sessionId) {
  const uid = boundUserId(sessionId);
  const u = uid && store("users").get(uid);
  if (!u) return null;

  const orders = [...store("orders").values()]
    .filter((o) => o.userId === uid)
    .map((o) => ({ ...o, email: o.email ? mask(o.email) : null })) // 骨架期脱敏展示
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return {
    profile: publicUser(u),
    orders,
    userCart: store("userCarts").get(uid) || { items: [] },
    feedback: {
      saved: store("savedItems").get("u:" + uid) || [],
      hidden: store("hiddenItems").get("u:" + uid) || [],
    },
  };
}

function mask(email) {
  const [name, domain] = email.split("@");
  return name?.slice(0, 2) + "***@" + domain;
}
