-- ============================================================
-- 003_orders.sql — 订单域（财务记录 · 客诉与对账的唯一事实）
-- 来源：modules/order/service.js
--
-- 跨境关键设计（全部落库，对应 Phase 1 的 Order 结构）：
--   * 下单快照：currency / fx_rate —— 汇率漂移不影响历史订单
--   * 四金额列（USD 计价）—— GMV 与对账可直接 SQL 聚合，无需解 JSON
--   * tax_rule / shipping_method / payment / address 用 JSONB ——
--     只增不改的审计快照（税种标签、物流分区、支付引用等复合结构）
--   * GDPR：session_id / email / address 可空 —— erase 时置 NULL，
--     财务记录（金额/状态）依合规要求保留，erased_at 记录脱关联时间
--
-- 订单状态机（modules/order/service.js）：
--   pending_payment → paid | payment_failed；paid → exchanged | returned
-- ============================================================

CREATE TABLE orders (
  id              TEXT PRIMARY KEY,               -- SO-XXXXXX
  session_id      TEXT,                          -- GDPR erase → NULL
  email           TEXT,                          -- GDPR erase → NULL
  address         JSONB,                         -- 收货地址快照；GDPR erase → NULL
  region          TEXT NOT NULL,                 -- US|EU|UK|ROW（税务 + GDPR 路由，来自收货国）
  currency        TEXT NOT NULL DEFAULT 'USD',   -- 下单快照
  fx_rate         NUMERIC(12,6) NOT NULL DEFAULT 1, -- 下单快照
  subtotal_usd    NUMERIC(10,2) NOT NULL CHECK (subtotal_usd >= 0),
  shipping_usd    NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_usd         NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_usd       NUMERIC(10,2) NOT NULL CHECK (total_usd >= 0),
  tax_rule        JSONB NOT NULL,                -- {type,label,rate,provider}
  shipping_method JSONB NOT NULL,                -- {id,name,zone}
  payment         JSONB NOT NULL,                -- {provider,status,intentId?,clientSecret?,reference?}
  tracking        TEXT,
  status          TEXT NOT NULL DEFAULT 'pending_payment'
                    CHECK (status IN ('pending_payment','paid','payment_failed','exchanged','returned')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at         TIMESTAMPTZ,
  erased_at       TIMESTAMPTZ                    -- GDPR 脱关联时间戳
);

-- GDPR erase 定位 + "本会话订单"查询（/api/privacy/export、/api/orders PUT 鉴权）
CREATE INDEX idx_orders_session ON orders (session_id) WHERE session_id IS NOT NULL;
-- 运营面板：按状态过滤、按时间排序
CREATE INDEX idx_orders_status_created ON orders (status, created_at);

-- 订单行：行级展开并冗余 name/unit_price —— 商品改名/改价不影响历史订单对账
CREATE TABLE order_items (
  id              BIGSERIAL PRIMARY KEY,
  order_id        TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id      INTEGER NOT NULL,
  name            TEXT NOT NULL,                 -- 下单时商品名快照
  size            TEXT NOT NULL,
  width           TEXT NOT NULL DEFAULT 'Standard',
  qty             INTEGER NOT NULL CHECK (qty > 0),
  unit_price_usd  NUMERIC(10,2) NOT NULL,        -- 下单时单价快照
  line_total_usd  NUMERIC(10,2) NOT NULL,
  UNIQUE (order_id, product_id, size, width)
);
