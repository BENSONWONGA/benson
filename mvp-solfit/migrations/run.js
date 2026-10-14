#!/usr/bin/env node
/**
 * migrations/run.js — 极简迁移执行器（幂等 · 事务性）
 *
 * 用法：
 *   DATABASE_URL=postgresql://user:pass@host:5432/solfit npm run db:migrate
 *   （DATABASE_URL 也可写在项目根 .env 中，本脚本会自动加载）
 *
 * 行为：
 *   1. 自动建 schema_migrations 跟踪表
 *   2. 按文件名顺序执行 migrations/*.sql（每个文件独立事务）
 *   3. 已应用的跳过；失败的回滚并退出非零码
 *   4. 云端托管 PG（Supabase/Neon/RDS 等）自动启用 TLS
 */

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

// 轻量 .env 加载（不引入 dotenv 依赖；进程环境变量优先）
(function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
})();

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("✗ DATABASE_URL 未配置（.env 或环境变量）");
    process.exit(1);
  }

  const isLocal = /localhost|127\.0\.0\.1/.test(url);
  const client = new Client({
    connectionString: url,
    ssl: isLocal ? undefined : { rejectUnauthorized: false }, // 托管 PG 默认走 TLS
  });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name      TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const { rows } = await client.query("SELECT name FROM schema_migrations");
  const applied = new Set(rows.map((r) => r.name));

  const files = fs
    .readdirSync(__dirname)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let pending = 0;
  for (const f of files) {
    if (applied.has(f)) {
      console.log("  skip  " + f);
      continue;
    }
    const sql = fs.readFileSync(path.join(__dirname, f), "utf8");
    try {
      await client.query("BEGIN");
      await client.query(sql); // 简单查询协议：单文件多语句原子执行
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [f]);
      await client.query("COMMIT");
      console.log("  apply " + f);
      pending++;
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("✗ FAILED " + f + " — 已回滚：" + err.message);
      await client.end();
      process.exit(1);
    }
  }

  console.log(pending ? "✓ " + pending + " 个迁移已应用" : "✓ 无待应用迁移");
  await client.end();
}

main().catch((e) => {
  console.error("✗ " + e.message);
  process.exit(1);
});
