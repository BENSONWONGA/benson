-- ============================================================
-- 007_product_vectors.sql — 向量检索域（Phase 14 · pgvector）
-- 兑现方案 §6.2 技术决策 #2："向量库用 pgvector 起步"，
-- 及 embeddings.js / recall.js 的演进注记："目录变大后向量路
-- 原位换 pgvector ANN，签名不变"。
--
-- 设计要点：
--   * 维度 48 = embeddings.js 的 DIMS（类目/跟高/价位带/楦型家族/
--     宽窄的 FNV 哈希维 + 合脚率数值维），L2 归一化 ⇒
--     余弦相似度 = 1 - (embedding <=> q)（cosine distance）
--   * 向量由商品属性确定性派生（FNV-1a，跨进程稳定），不含任何
--     用户数据 —— GDPR 无删除义务（embeddings.js 头注释口径不变）
--   * HNSW 索引：pgvector 0.5+ 近似最近邻，十万级目录 ANN 延迟
--     个位数毫秒；目录数十万后如需精确/召回率调参再迁专用向量库
--     （方案 §6.2："延迟真实瓶颈出现后再迁移"）
--   * 同步口径：哈希编码在 Node 侧（SQL 不可派生）—— 离线走
--     migrations/tools/sync-vectors.mjs，运行时由
--     ai/recommender/vector-store.js 幂等 upsert（首次 ANN 惰性
--     同步）；商品删除经 FK 级联清理向量行
--   * 若 embeddings.js 的 DIMS 变更，需同步修改本表 vector(48) 并
--     重跑同步（维度不匹配的写入会被 PG 拒绝 —— fail-fast）
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE product_vectors (
  product_id INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  embedding  vector(48) NOT NULL,
  synced_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE product_vectors IS
  '商品向量（48 维 L2 归一化）—— pgvector ANN 召回的检索面；确定性派生自商品属性，无用户数据（GDPR 无删除义务）';

-- HNSW 近似最近邻索引：cosine 距离（归一化向量上 <=> 与余弦一一对应）
CREATE INDEX idx_product_vectors_hnsw
  ON product_vectors USING hnsw (embedding vector_cosine_ops);
