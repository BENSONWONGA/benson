-- ============================================================
-- 005_ai_training_set.sql — 换货/退货数据回流（AI 尺码引擎 V3 训练样本）
-- 来源：modules/order/service.applyExchange + 方案文档 §5.1
--
-- 设计要点：
--   * 写入时冗余训练特征（last_code / usual_size / width_feel）——
--     训练样本自成一体，不依赖可被 GDPR 删除的 fit_profiles
--   * GDPR 平衡：session_id 可空（erase 时置 NULL），非识别性特征
--     （楦型/尺码/宽窄/退货原因）永续保留 —— 匿名化样本仍可训练
--   * reason 与 applyExchange 的 VALID_REASONS 一一对应
--   * to_size IS NULL = 纯退货；否则为换码方向（V3 协同过滤核心信号：
--     "楦型 W2 + 习惯 39 码 + 觉得偏小 → 换到 40" 是最有价值的正样本）
-- ============================================================

CREATE TABLE fit_training_set (
  id          BIGSERIAL PRIMARY KEY,
  order_id    TEXT NOT NULL,
  product_id  INTEGER NOT NULL,
  last_code   TEXT,                                -- 训练特征：楦型
  from_size   TEXT NOT NULL,
  to_size     TEXT,                                -- NULL = 纯退货
  reason      TEXT NOT NULL
                CHECK (reason IN ('too_small','too_large','quality','not_as_described','changed_mind')),
  usual_size  TEXT,                                -- 冗余自 fit_profiles（非识别性训练特征）
  width_feel  TEXT,
  region      TEXT,
  session_id  TEXT,                                 -- GDPR erase → NULL（特征保留，标识删除）
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 训练聚合：按楦型 × 原因统计（"哪个楦型偏小" 的直接答案）
CREATE INDEX idx_fts_last_code_reason ON fit_training_set (last_code, reason);
-- 按商品聚合换码方向（协同过滤的召回特征）
CREATE INDEX idx_fts_product ON fit_training_set (product_id);
