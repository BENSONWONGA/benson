/**
 * ai/recommender/embeddings.js — 商品向量层（Phase 5：召回层原位升级）
 *
 * 兑现 recall.js 的演进注释："目录变大后此层原位换 ES 向量召回"。
 * 目录为数十 SKU 量级时，进程内向量即绰绰有余；目录过万后此文件原位换
 * pgvector/ES ANN 检索（方案文档 §6："向量库用 pgvector 起步"），签名不变。
 *
 * 编码方案 —— 结构化属性特征哈希（deterministic，零外部依赖，无需预训练）：
 *   类目/跟高/宽窄/楦型家族/价位带 → 哈希维度（带符号）
 *   合脚率（fitStats.true 占比，退货回流沉淀）→ 数值维度
 * 同义词共享维度 ⇒ 余弦相似度天然表达"结构相似"（类目>楦型>跟高>价位）。
 *
 * GDPR：向量仅由商品属性派生，不含任何用户数据 —— 无删除义务。
 */

const DIMS = 48;

/** FNV-1a 32bit —— 稳定跨进程（同一目录同一向量，可离线/在线一致性校验） */
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function addFeature(vec, name, value = 1) {
  const h = fnv1a(name);
  const idx = h % DIMS;
  const sign = (h >>> 31) & 1 ? -1 : 1; // 高位做符号 —— 降碰撞相关性
  vec[idx] += sign * value;
}

function priceBand(price) {
  if (price < 90) return "budget";
  if (price < 120) return "mid";
  return "premium";
}

/** 合脚率 —— fitStats（退货数据回流产物）向量化：true 越高越靠前 */
function fitTrueRatio(product) {
  const f = product.fitStats || {};
  const total = (f.small || 0) + (f.true || 0) + (f.large || 0);
  return total ? (f.true || 0) / total : 0.8; // 无数据商品给温和默认
}

/** 商品 → 单位向量（缓存：目录静态，进程内只算一次） */
const _vecCache = new Map();

export function productVector(product) {
  if (!product) return null;
  const cached = _vecCache.get(product.id);
  if (cached) return cached;

  const v = new Array(DIMS).fill(0);
  addFeature(v, "category=" + product.category);
  addFeature(v, "heel=" + product.heel);
  addFeature(v, "band=" + priceBand(product.price));
  addFeature(v, "last_family=" + String(product.lastCode || "")[0]); // W/H/B/F 脚感家族
  for (const w of product.widths) addFeature(v, "width=" + w);
  addFeature(v, "numeric:fit_true", fitTrueRatio(product));

  // L2 归一化 ⇒ 余弦相似度 = 点积（点积在召回循环里最便宜）
  let norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  const unit = norm ? v.map((x) => x / norm) : v;
  _vecCache.set(product.id, unit);
  return unit;
}

/** 余弦相似度（两向量均已单位化 → 点积） */
export function cosine(a, b) {
  if (!a || !b) return 0;
  let s = 0;
  for (let i = 0; i < DIMS; i++) s += a[i] * b[i];
  return s;
}

/**
 * 查询向量 —— 优先种子商品向量（PDP 相关推荐）；
 * 无种子但有行为历史时，用交互加权平均档案向量（"猜你喜欢"式个性化内容召回）。
 */
export function queryVector({ seed, userFeat, productsById }) {
  if (seed) return productVector(seed);

  // 档案向量：浏览 1× / 加购 3× / 下单 5×（与 features.js 的行为权重口径一致）
  const weights = [
    [[...userFeat.viewed], 1],
    [[...userFeat.carted], 3],
    [[...userFeat.ordered], 5],
  ];
  const acc = new Array(DIMS).fill(0);
  let total = 0;
  for (const [ids, w] of weights) {
    for (const id of ids) {
      const v = productVector(productsById(id));
      if (!v) continue;
      for (let i = 0; i < DIMS; i++) acc[i] += v[i] * w;
      total += w;
    }
  }
  if (!total) return null;
  const norm = Math.sqrt(acc.reduce((s, x) => s + x * x, 0));
  return norm ? acc.map((x) => x / norm) : null;
}
