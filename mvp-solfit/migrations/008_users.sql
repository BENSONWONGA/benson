-- ============================================================
-- 008_users.sql — 账户域（Phase 16 · 用户/购物车/订单归属）
-- 来源：modules/auth/service.js
--
-- 设计要点：
--   * 通行证 = 邮箱 + 密码（scrypt N=16384 派生 64B hash + 16B 盐）
--     —— Node 内置 crypto，零外部依赖；换 Argon2 时只改 auth service
--   * email_key（规范化小写）唯一索引 —— 查重/登录定位都用规范化键，
--     email 原样保留大小写做展示；账户体系上线前的 TODO 集中兑现
--   * 会话绑定（user_sessions）不落 PG：会话是运行时态（多实例部署时
--     换 Redis），账户才是持久态 —— 与 002_carts 的 session 定位同构
--   * orders.user_id：订单归属账户（游客单 NULL，登录后按 email 回填）；
--     GDPR erase → NULL，与 session_id/email 同口径（财务记录保留）
--   * user_carts：跨设备购物车（登录时与游客车合并，量加和）
-- ============================================================

CREATE TABLE users (
  id            TEXT PRIMARY KEY,               -- UUID（crypto.randomUUID）
  email         TEXT NOT NULL,                   -- 展示原样大小写
  email_key     TEXT NOT NULL UNIQUE,            -- 规范化（trim+lowercase）—— 查重/登录唯一键
  name          TEXT,
  password_hash TEXT NOT NULL,                   -- scrypt 64B hex
  salt          TEXT NOT NULL,                   -- 16B hex（每用户独立盐）
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ,
  erased_at     TIMESTAMPTZ                      -- GDPR 软删除标记（骨架期直接 DELETE，字段为多实例迁移预留）
);

-- 跨设备购物车：userId → 购物车快照（合并策略见 auth service mergeCarts）
CREATE TABLE user_carts (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cart       JSONB NOT NULL,                     -- { items: [{productId,size,width,qty}] }
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id)
);

-- 订单归属（Phase 16）：游客单 NULL；登录后回填 + 新单直落
ALTER TABLE orders ADD COLUMN user_id TEXT;

-- "我的订单"按账户定位；GDPR erase 定位同索引（部分索引跳过 NULL）
CREATE INDEX idx_orders_user ON orders (user_id) WHERE user_id IS NOT NULL;
