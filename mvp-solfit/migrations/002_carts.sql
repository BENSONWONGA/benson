-- ============================================================
-- 002_carts.sql — 购物车域
-- 来源：modules/cart/service.js（会话购物车 {items:[{productId,size,width,qty}]}）
--
-- 设计要点：
--   * items 用 JSONB —— 与 Phase 1 服务层形状 1:1，数据层切换零适配逻辑
--   * 购物车生命周期短、无报表需求，不做行级展开（cart_items）—— 保持简单
--   * user_id 预留：Phase 2.5 账户体系上线后作为游客→账户购物车合并的关联键
--     （合并语义：同 product+size+width 行 qty 相加，JSONB 在应用层合并即可）
-- ============================================================

CREATE TABLE carts (
  session_id  TEXT PRIMARY KEY,
  user_id     TEXT,
  items       JSONB NOT NULL DEFAULT '[]',      -- [{productId,size,width,qty}]
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 游客→账户合并时按 user_id 反查购物车
CREATE INDEX idx_carts_user ON carts (user_id) WHERE user_id IS NOT NULL;
