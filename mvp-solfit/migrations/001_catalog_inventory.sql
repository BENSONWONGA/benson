-- ============================================================
-- 001_catalog_inventory.sql — 商品域 + 库存域（Phase 2 · PostgreSQL）
-- 来源：src/data/products.js + modules/inventory/service.js
--
-- 设计要点：
--   * 结构化属性（category/heel/widths/last_code）是 AI 导购防幻觉
--     的数据源 —— 必须是列，不能只藏在文案里
--   * 库存本质是 product_id × size 矩阵（与楦型强相关，与商品弱相关）
--   * Phase 1 的内存互斥锁在此落为 SELECT ... FOR UPDATE 行级锁
--   * reserved 列：支付锁定量（pending_payment 期间），可用量 = qty - reserved
--     Phase 1 流程为"先扣减、失败回滚"，reserved 留给 Phase 2.5 优化为
--     "先锁定、webhook 确认后扣减"，避免回滚路径上的库存抖动
--   * 内部金额恒为 USD（lib/currency.js 原则），币种仅为展示快照
-- ============================================================

CREATE TABLE products (
  id              INTEGER PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  category        TEXT NOT NULL,                -- Loafers/Sneakers/Heels/Sandals/Boots/Slippers
  heel            TEXT NOT NULL,                -- Flat/Low/Mid
  widths          TEXT[] NOT NULL,              -- Standard/Wide
  price_usd       NUMERIC(10,2) NOT NULL CHECK (price_usd >= 0),
  compare_at_usd  NUMERIC(10,2),
  currency        TEXT NOT NULL DEFAULT 'USD',
  rating          NUMERIC(3,2) NOT NULL DEFAULT 0,
  reviews_count   INTEGER NOT NULL DEFAULT 0,
  badge           TEXT,
  fit_stats       JSONB NOT NULL DEFAULT '{}',  -- {small,true,large} % —— 退货数据回流产物（V3 燃料）
  sizes           TEXT[] NOT NULL,               -- EU 尺码，字符串保留半码如 "38.5"
  oos             TEXT[] NOT NULL DEFAULT '{}',
  last_code       TEXT NOT NULL,                 -- 楦型库 key（W1..F2，尺码引擎核心资产）
  description     TEXT NOT NULL DEFAULT '',
  features        TEXT[] NOT NULL DEFAULT '{}',
  image_url       TEXT NOT NULL DEFAULT '',
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN products.fit_stats IS '尺码合脚统计（偏小/正好/偏大 %），由退货数据回流持续更新，AI 尺码引擎 V3 的模型特征';

-- 店铺列表按类目过滤（部分索引：只索引在售商品）
CREATE INDEX idx_products_category ON products (category) WHERE active;

-- 库存：尺码粒度矩阵。扣减走 SELECT ... FOR UPDATE（对应 modules/inventory 的锁抽象）
CREATE TABLE inventory (
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size        TEXT NOT NULL,
  qty         INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
  reserved    INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0 AND reserved <= qty),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, size)
);
