/**
 * lib/db.js — 数据层接入点（当前：进程内存储 + 种子数据）
 *
 * 架构约定：业务域 service 只通过本层读写持久化，不直接持有存储实现。
 * Phase 1 结束后按下面顺序替换为 PostgreSQL，service 签名不变：
 *   1. npm i pg && 把 stores 换成 SQL 实现
 *   2. catalog 加缓存（Redis）
 *   3. 事件流（Kafka/CDC）接埋点与退货数据回流 => AI 训练燃料
 *
 * 跨境注意：GDPR 分区要求欧盟用户数据落欧盟区 —— 预留 region 字段。
 */

// 进程内存储（dev / 骨架演示用；多实例部署时必须替换）
const _stores = {
  carts: new Map(),        // sessionId -> { items: [{productId, size, width, qty}] }
  fitProfiles: new Map(),  // sessionId -> FitProfile（Phase 3 迁移为账户级 + 欧盟分区）
  orders: new Map(),       // orderId -> Order
  events: [],              // 埋点事件缓冲（TODO: 换 Kafka producer）
};

export function store(name) {
  if (!(name in _stores)) throw new Error("Unknown store: " + name);
  return _stores[name];
}

/**
 * 埋点事件写入 —— AI 闭环的燃料入口
 * TODO(Phase 2): 换成 Kafka producer，topic: solfit.events
 * 现在就要把事件埋对（见方案文档 §7.3）：浏览/加购/下单/退货/换码/尺码推荐展示
 */
export function trackEvent(type, payload) {
  _stores.events.push({ type, payload, ts: new Date().toISOString() });
  if (_stores.events.length > 1000) _stores.events.shift(); // 骨架期防溢出
}

/** 会话 ID 中间件辅助：从 cookie 取或生成（无则新建） */
export function getSessionId(reqCookies, res) {
  let sid = reqCookies?.get("solfit_sid")?.value;
  if (!sid) {
    sid = "s_" + Math.random().toString(36).slice(2, 12);
    if (res) res.cookies.set("solfit_sid", sid, { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 30 });
  }
  return sid;
}
