-- ============================================================
-- 004_customer_events.sql — 用户域（脚型档案）+ 埋点事件流
-- 来源：modules/customer/service.js + lib/db.trackEvent + /api/events
--
-- GDPR 设计（方案文档 §7.4：第一天做对）：
--   * fit_profiles.region —— 欧盟用户个人数据落欧盟区存储的分区路由标记；
--     跨区分区部署在 Phase 3 基建落地，schema 第一天就带 region 字段
--   * events.session_id 可空 —— erase 时置 NULL；匿名计数保留
--     （已发布的聚合统计不可撤回，原始事件与个人的关联可删）
--   * 事件名与 /api/events 路由的 ALLOWED 白名单共用 snake_case 规范
--
-- 事件流演进（lib/db.js 注释的既定路线）：
--   Phase 2（本表）：直接持久化，analytics 基线由 SQL 聚合
--   Phase 2.5：Kafka producer 接入（topic: solfit.events），本表作为
--     消费者落库副本；Phase 3 按月分区（append-only，分区裁剪冷数据）
-- ============================================================

-- 脚型档案 —— AI 尺码推荐的核心数据资产（GDPR 个人数据，删除权必须可达）
CREATE TABLE fit_profiles (
  session_id     TEXT PRIMARY KEY,
  user_id        TEXT,                            -- Phase 3 升级为账户级档案
  usual_size     TEXT NOT NULL,
  usual_brand    TEXT NOT NULL,
  width_feel     TEXT NOT NULL CHECK (width_feel IN ('Narrow','Standard','Wide')),
  foot_notes     TEXT[] NOT NULL DEFAULT '{}',   -- High arch / Flat feet / Bunion
  product_id     INTEGER,                         -- 落楦型校验时的商品
  recommendation JSONB NOT NULL DEFAULT '{}',     -- {size,width,confidence,finalSize,exactMatch,...}
  region         TEXT NOT NULL DEFAULT 'US',      -- GDPR 分区路由标记
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 埋点事件流 —— AI 闭环的燃料入口
CREATE TABLE events (
  id          BIGSERIAL PRIMARY KEY,
  type        TEXT NOT NULL,                       -- product_viewed | cart_added | order_created | ...
  payload     JSONB NOT NULL DEFAULT '{}',
  session_id  TEXT,                               -- GDPR erase → NULL
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 漏斗计数：type + 时间窗（lib/analytics.baselineSnapshot 的 SQL 化）
CREATE INDEX idx_events_type_created ON events (type, created_at);
-- GDPR erase 定位本会话事件
CREATE INDEX idx_events_session ON events (session_id) WHERE session_id IS NOT NULL;
-- 漏斗自由分析（payload 特征位查询）
CREATE INDEX idx_events_payload ON events USING GIN (payload);
