/**
 * ai/recommender/feedback.js — 显式反馈闭环（Phase 13）
 *
 * 此前全部训练信号是隐式的（浏览/加购/成交的回流标注）—— 信噪比有限：
 * 没看 ≠ 不喜欢，看了 ≠ 喜欢。显式反馈是用户亲口说的话：
 *   save（心愿单）    —— 最强正信号：未购但高意向，比浏览高两个信噪级
 *                       → 保存品从轮播出列（已"捕获"，不浪费坑位），
 *                         但作为内容召回锚点（"因为你保存过 X，推相似的 Y"）
 *   dislike（不感兴趣）—— 最强负信号：唯一真正的"不推我什么"的用户指令
 *                       → 全路径硬排除（含对照臂与冷启动：尊重"不再展示"
 *                         是用户控制权，不是个性化 —— GDPR 推荐透明度要求的落地）
 *
 * 与既有闭环的关系：
 *   隐式反馈（Phase 5 回流标注）继续喂学习排序 —— 显式反馈不动模型特征
 *   （8 维契约冻结），动的是候选集与召回锚 —— 信号分层，各司其职。
 *
 * GDPR：save/dislike 都按 sessionId 关联，erase 三清（store/事件/导出口径）；
 * 不感兴趣列表同样属于个人数据（它是用户偏好的画像），删除权必须可达。
 */

import { store, trackEvent } from "@/lib/db";
import { cacheDelByPrefix } from "@/lib/cache";
import { PRODUCTS } from "@/data/products"; // 纯数据源（不经 catalog service 的 cache 链）

const productById = (id) => PRODUCTS.find((p) => p.id === Number(id)) || null;

/** 会话绑定的账户反馈键（"u:<userId>"；游客返回 null —— 写入只落会话键） */
const userKeyOf = (sessionId) => {
  const bound = sessionId && store("userSessions").get(sessionId);
  return bound ? "u:" + bound.userId : null;
};

/** 心愿单：save / unsave */
export function saveItem(sessionId, productId) {
  const p = productById(productId);
  if (!sessionId || !p) throw new Error("INVALID_SAVE");
  const entry = { productId: p.id, savedAt: new Date().toISOString() };
  const list = store("savedItems").get(sessionId) || [];
  if (!list.some((x) => x.productId === p.id)) {
    list.push(entry);
    store("savedItems").set(sessionId, list);
    const uKey = userKeyOf(sessionId); // Phase 16 write-through：跨设备心愿单
    if (uKey) {
      const userList = store("savedItems").get(uKey) || [];
      if (!userList.some((x) => x.productId === p.id)) {
        userList.push(entry);
        store("savedItems").set(uKey, userList);
      }
    }
  }
  trackEvent("product_saved", { sessionId, productId: p.id });
  return getFeedback(sessionId);
}

export function unsaveItem(sessionId, productId) {
  const pid = Number(productId);
  const drop = (key) => {
    const list = store("savedItems").get(key) || [];
    const next = list.filter((x) => x.productId !== pid);
    next.length ? store("savedItems").set(key, next) : store("savedItems").delete(key);
  };
  drop(sessionId);
  const uKey = userKeyOf(sessionId);
  if (uKey) drop(uKey); // 账户侧同删 —— 跨设备不"复活"
  return getFeedback(sessionId);
}

/** 不感兴趣：dislike / undo —— 全推荐路径硬排除 */
export function dislikeItem(sessionId, productId) {
  const p = productById(productId);
  if (!sessionId || !p) throw new Error("INVALID_DISLIKE");
  const entry = { productId: p.id, at: new Date().toISOString() };
  const list = store("hiddenItems").get(sessionId) || [];
  if (!list.some((x) => x.productId === p.id)) {
    list.push(entry);
    store("hiddenItems").set(sessionId, list);
    const uKey = userKeyOf(sessionId); // Phase 16 write-through
    if (uKey) {
      const userList = store("hiddenItems").get(uKey) || [];
      if (!userList.some((x) => x.productId === p.id)) {
        userList.push(entry);
        store("hiddenItems").set(uKey, userList);
      }
    }
  }
  trackEvent("product_disliked", { sessionId, productId: p.id });
  return getFeedback(sessionId);
}

export function undoDislike(sessionId, productId) {
  const pid = Number(productId);
  const drop = (key) => {
    const list = store("hiddenItems").get(key) || [];
    const next = list.filter((x) => x.productId !== pid);
    next.length ? store("hiddenItems").set(key, next) : store("hiddenItems").delete(key);
  };
  drop(sessionId);
  const uKey = userKeyOf(sessionId);
  if (uKey) drop(uKey);
  return getFeedback(sessionId);
}

/**
 * 登录水合（auth service 调用）：账户反馈列表并入会话列表 ——
 * 会话键是推荐热路径的事实源（纯 Map 读零开销），水合让任何设备
 * 登录后立即看到全部历史偏好；此后写入经 write-through 双向同步。
 */
export function adoptFeedbackForUser(sessionId, userId) {
  const mergeInto = (mapName, userEntryExtra) => {
    const map = store(mapName);
    const userList = map.get("u:" + userId) || [];
    if (!userList.length) return 0;
    const sessionList = map.get(sessionId) || [];
    let added = 0;
    for (const item of userList) {
      if (!sessionList.some((x) => x.productId === item.productId)) {
        sessionList.push({ ...item, ...userEntryExtra });
        added++;
      }
    }
    if (sessionList.length) map.set(sessionId, sessionList);
    return added;
  };
  const saved = mergeInto("savedItems");
  const hidden = mergeInto("hiddenItems");
  return { saved, hidden };
}

/** 反馈状态（GET /api/ai/feedback —— 前端徽章态回显） */
export function getFeedback(sessionId) {
  const saved = (store("savedItems").get(sessionId) || []).map((x) => ({
    ...productById(x.productId),
    savedAt: x.savedAt,
  }));
  const hidden = (store("hiddenItems").get(sessionId) || []).map((x) => x.productId);
  return { saved: saved.filter(Boolean), hiddenIds: hidden };
}

// ===== 推荐侧取数（热路径：纯 Map 读） =====

export function savedIdsOf(sessionId) {
  const list = sessionId && store("savedItems").get(sessionId);
  return new Set(list ? list.map((x) => x.productId) : []);
}

export function hiddenIdsOf(sessionId) {
  const list = sessionId && store("hiddenItems").get(sessionId);
  return new Set(list ? list.map((x) => x.productId) : []);
}

/** 最近保存的商品（内容召回锚点 —— 未购会话的"意图锚"） */
export function latestSavedProduct(sessionId) {
  const list = sessionId && store("savedItems").get(sessionId);
  if (!list?.length) return null;
  const sorted = [...list].sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
  return productById(sorted[0].productId);
}

// ===== 观测 / GDPR =====

/**
 * 反馈变更后失效本会话推荐缓存 —— 个性化路径 60s TTL 内会继续吐出
 * 被隐藏/被保存的商品，"不再展示"必须立刻生效（用户控制权 > 缓存收益）。
 * 由 route 层在每次动作成功后 await（与 privacy/erase 同一失效前缀口径）。
 */
export async function invalidateRecCache(sessionId) {
  if (sessionId) await cacheDelByPrefix(`rec:${sessionId}:`);
}

export function feedbackStats() {
  const savedMap = store("savedItems");
  const hiddenMap = store("hiddenItems");
  let totalSaves = 0;
  for (const l of savedMap.values()) totalSaves += l.length;
  let totalDislikes = 0;
  for (const l of hiddenMap.values()) totalDislikes += l.length;
  return {
    sessionsWithSaves: savedMap.size,
    totalSaves,
    sessionsWithHidden: hiddenMap.size,
    totalDislikes,
  };
}

/** GDPR 删除权 —— store 三清（事件流由 privacy/erase 统一遍历） */
export function purgeSessionFeedback(sessionId) {
  return {
    savedItems: store("savedItems").delete(sessionId) ? 1 : 0,
    hiddenItems: store("hiddenItems").delete(sessionId) ? 1 : 0,
  };
}

/** GDPR 可携带权 —— 导出口径与购物车/档案一致（商品快照 + 时间） */
export function exportSessionFeedback(sessionId) {
  return {
    saved: store("savedItems").get(sessionId) || [],
    hidden: store("hiddenItems").get(sessionId) || [],
  };
}
