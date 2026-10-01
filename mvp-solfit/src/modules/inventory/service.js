/**
 * modules/inventory — 库存域（交易域 · 按尺码粒度）
 * 鞋类库存的本质是 productId+size 的矩阵 —— 与楦型强相关，不与商品强相关。
 * TODO(Phase 1 后半): PostgreSQL stock 表 + 行级锁扣减 + 超卖补偿
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

/** 扣减（先全量校验，避免部分扣减） */
export function decrementStock(items) {
  const shortage = checkStock(items);
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
}

/** 换码不增减总量（一对换一对）；退货入库由逆向物流回调触发（TODO Phase 2） */
export function restock(productId, size, qty = 1) {
  ensureSeed();
  const key = `${productId}:${size}`;
  store("inventory").set(key, (store("inventory").get(key) || 0) + qty);
}
