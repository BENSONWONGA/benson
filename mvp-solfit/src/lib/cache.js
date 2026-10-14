/**
 * lib/cache.js — 缓存抽象层
 *
 * Phase 1: 内存 LRU（带 TTL），开箱可用。
 * Phase 2: 配 REDIS_URL 后自动切换到 Redis，调用方零改动。
 *
 * 用途：
 *   - catalog 商品详情 / 列表（读多写少，TTL 5min）
 *   - AI 尺码推荐结果（按 profile 哈希，TTL 1h，相同输入直接命中）
 *   - 汇率 / 税费表（TTL 1h）
 */

const _store = new Map(); // key -> {value, expiresAt}
const MAX_ENTRIES = 500;

/** 惰性加载 Redis 客户端 */
let _redis = null;
function getRedis() {
  if (!process.env.REDIS_URL) return null;
  if (_redis === null) {
    try {
      // eslint-disable-next-line global-require
      const Redis = require("ioredis");
      _redis = new Redis(process.env.REDIS_URL);
    } catch (e) {
      console.warn("[cache] ioredis not available, falling back to memory cache");
      _redis = false;
    }
  }
  return _redis || null;
}

export async function cacheGet(key) {
  const r = getRedis();
  if (r) {
    const v = await r.get(key);
    return v ? JSON.parse(v) : null;
  }
  const entry = _store.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) { _store.delete(key); return null; }
  return entry.value;
}

export async function cacheSet(key, value, ttlSec = 300) {
  const r = getRedis();
  if (r) {
    await r.set(key, JSON.stringify(value), "EX", ttlSec);
    return;
  }
  // 简单淘汰：超量时删最旧（Map 保留插入顺序）
  if (_store.size >= MAX_ENTRIES) {
    const oldest = _store.keys().next().value;
    _store.delete(oldest);
  }
  _store.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
}

export async function cacheDel(key) {
  const r = getRedis();
  if (r) return r.del(key);
  _store.delete(key);
}

/**
 * 按前缀批量失效 —— GDPR erase 场景：该会话的个性化推荐缓存（rec:{sid}:*）
 * 必须立刻失效，否则被遗忘权执行后 60s 内仍会返回基于已删数据的推荐。
 */
export async function cacheDelByPrefix(prefix) {
  const r = getRedis();
  if (r) {
    let cursor = "0";
    do {
      const [next, keys] = await r.scan(cursor, "MATCH", prefix + "*", "COUNT", 100);
      cursor = next;
      if (keys.length) await r.del(...keys);
    } while (cursor !== "0");
    return;
  }
  for (const key of [..._store.keys()]) {
    if (key.startsWith(prefix)) _store.delete(key);
  }
}

/**
 * 缓存穿透保护：get → miss 则执行 fn 并回写
 * @param {string} key
 * @param {() => Promise<any>} fn
 * @param {number} ttlSec
 */
export async function cacheOrSet(key, fn, ttlSec = 300) {
  const hit = await cacheGet(key);
  if (hit !== null) return hit;
  const value = await fn();
  if (value !== null && value !== undefined) await cacheSet(key, value, ttlSec);
  return value;
}
