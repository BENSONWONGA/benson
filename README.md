# NORTIV8 Full-Stack Store

这是一个从鞋类独立站前端原型扩展出来的全栈版本，当前已经补齐了可上线所需的核心后端底座：

- React + Vite 前端
- Express API 服务
- Supabase 数据库与鉴权模型
- Stripe Checkout 支付链路
- 商品、订单、后台接口基础能力

## 本地开发

1. 安装依赖

```bash
npm install
```

2. 复制环境变量

```bash
cp .env.example .env
```

3. 在 Supabase SQL Editor 执行：

```sql
\i supabase/schema.sql
```

4. 启动后端 API

```bash
npm run server:dev
```

5. 启动前端

```bash
npm run dev
```

前端默认运行在 `http://localhost:5173`，并通过 Vite 代理把 `/api/*` 转发到 `http://localhost:3000`。

## 环境变量

必填变量见 [`.env.example`](file:///workspace/.env.example)：

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_STORAGE_BUCKET`（可选，默认 `product-media`）
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `SITE_URL`
- `CORS_ORIGIN`

## 数据库结构

数据库脚本位于 [schema.sql](file:///workspace/supabase/schema.sql)，包含：

- `profiles`: 会员资料与角色
- `products`: 商品主表
- `product_variants`: 尺码 / 颜色 / 库存 / SKU
- `orders`: 订单主表
- `order_items`: 订单明细
- RLS 策略
- 新用户自动建档 trigger
- 初始化商品与变体 seed

## API

已实现接口：

- `GET /api/health`
- `GET /api/products`
- `POST /api/checkout/session`
- `POST /api/stripe/webhook`
- `GET /api/admin/orders`
- `GET /api/admin/products`
- `POST /api/admin/products`
- `POST /api/admin/media/upload`

说明：

- 下单接口会基于数据库中的商品和变体重新校验价格与库存
- 支付采用 Stripe Checkout Sessions
- 订单支付结果通过 Stripe Webhook 回写 Supabase
- webhook 会把 Stripe 地址信息回写到订单，并只在首次支付成功时扣减库存
- 商品图上传会使用 Supabase Storage；接口首次上传时会自动创建公开 bucket

## 部署到服务器

推荐方式：

1. 在服务器安装 Node.js 20+
2. 拉取仓库并执行 `npm install`
3. 配置 `.env`
4. 执行 `npm run build`
5. 用 `npm run start` 启动 Express
6. 用 Nginx/Caddy 反向代理到 `PORT=3000`
7. 在 Stripe 配置 webhook 指向：

```text
https://你的域名/api/stripe/webhook
```

8. 在 Supabase Auth 配置站点 URL 与回调域名

## 当前状态

当前版本已经具备：

- 商品数据可从数据库读取
- 购物车可创建 Stripe Checkout Session
- 支付完成后订单可通过 webhook 更新
- 会员登录 / 注册与订单中心
- 管理后台商品、变体、库存、订单、物流维护
- 商品上下架与商品图上传能力

下一步最建议继续补齐：

- 前端会员登录 / 注册界面
- 前端后台管理界面
- 订单列表、库存编辑、商品上下架 UI
- 物流地址与订单详情页
