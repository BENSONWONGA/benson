/**
 * modules/inventory — 库存域（交易域 · 按尺码粒度）
 * 鞋类库存的本质是 productId+size 的矩阵 —— 与楦型强相关，不与商品强相关。
 *
 * 并发安全：
 *   Phase 1（内存）：用按 key 的互斥锁序列化 check-then-decrement，防超卖。
 *   Phase 2（PostgreSQL）：withStockLock → SELECT ... FOR UPDATE NOWAIT，签名不变。
 */

import { store } from "@/lib/db";
import { PRODUCTS } from "@/data/products";

/** 库存种子：oos 尺码为 0，其余 3–9（确定性伪随机，保证骨架期稳定可测） */
function ensureSeed() {
  const m = store("inventory");
  if (m.size) return;
  for (const p of PRODUCTS) {
    for (const s of p.sizes) {
      m.set(`${p.id}:${s}`, p.oos.includes(s) ? 0 : 3 + ((p.id * 7 + Math.round(parseFloat(s)) * 13) % 7));
    }
  }
}

/** 按 key 的互斥锁队列（Phase 2 替换为 PG 行级锁） */
const _locks = new Map(); // key -> { queue: Array<() => void>, busy: boolean }

function acquire(keys) {
  // 排序避免死锁（A→B 与 B→A 同时请求）
  const sorted = [...new Set(keys)].sort();
  return new Promise((resolve) => {
    const tryAcquire = () => {
      // 所有 key 都不忙时获得锁
      const allFree = sorted.every((k) => !_locks.get(k)?.busy);
      if (allFree) {
        for (const k of sorted) {
          const entry = _locks.get(k) || { queue: [], busy: false };
          entry.busy = true;
          _locks.set(k, entry);
        }
        resolve(() => {
          for (const k of sorted) {
            const entry = _locks.get(k);
            if (entry) {
              entry.busy = false;
              const next = entry.queue.shift();
              if (next) next();
              else if (entry.queue.length === 0) _locks.delete(k);
            }
          }
        });
      } else {
        // 任一 key 忙，则挂到第一个忙 key 的队列尾部
        const busyKey = sorted.find((k) => _locks.get(k)?.busy);
        const entry = _locks.get(busyKey);
        entry.queue.push(tryAcquire);
      }
    };
    tryAcquire();
  });
}

export function getStock(productId, size) {
  ensureSeed();
  return store("inventory").get(`${productId}:${size}`) ?? 0;
}

/** 校验一批商品是否都有库存（下单前检查，返回缺货明细） */
export function checkStock(items) {
  ensureSeed();
  return items
    .filter((i) => getStock(i.productId, i.size) < i.qty)
    .map((i) => ({ productId: i.productId, size: i.size, available: getStock(i.productId, i.size) }));
}

/**
 * 扣减库存（原子化）
 * 加锁 → 校验 → 扣减 → 释放。任一缺货抛 OUT_OF_STOCK，不部分扣减。
 */
export async function decrementStock(items) {
  ensureSeed();
  const keys = items.map((i) => `${i.productId}:${i.size}`);
  const release = await acquire(keys);
  try {
    const shortage = items
      .filter((i) => getStock(i.productId, i.size) < i.qty)
      .map((i) => ({ productId: i.productId, size: i.size, available: getStock(i.productId, i.size) }));
    if (shortage.length) {
      const err = new Error("OUT_OF_STOCK");
      err.details = shortage;
      throw err;
    }
    const m = store("inventory");
    for (const i of items) {
      const key = `${i.productId}:${i.size}`;
      m.set(key, m.get(key) - i.qty);
    }
    return true;
  } finally {
    release();
  }
}

/** 退货入库（也加锁，避免与扣减竞争） */
export async function restock(productId, size, qty = 1) {
  ensureSeed();
  const key = `${productId}:${size}`;
  const release = await acquire([key]);
  try {
    store("inventory").set(key, (store("inventory").get(key) || 0) + qty);
  } finally {
    release();
  }
}
