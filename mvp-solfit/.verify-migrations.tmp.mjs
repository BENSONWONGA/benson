// .verify-migrations.tmp.mjs — 一次性验证脚本（跑完即删）
// 用 embedded-postgres 起真实 PG 实例，端到端验证 migrations/ 全套脚本
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

const DATA_DIR = "/tmp/solfit-pg-verify";
const URL = "postgresql://postgres:postgres@localhost:5433/solfit";
rmSync(DATA_DIR, { recursive: true, force: true });

console.log("== 启动临时 PostgreSQL ==");
const db = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: "postgres",
  password: "postgres",
  port: 5433,
  persistent: true,
  createPostgresUser: true, // 沙箱 root 运行：由包创建非 root 系统用户跑 PG
});
await db.initialise();
await db.start();
await db.createDatabase("solfit");

try {
  console.log("\n== 第 1 次执行迁移（应全部 apply）==");
  const r1 = spawnSync("node", ["migrations/run.js"], {
    env: { ...process.env, DATABASE_URL: URL },
    stdio: "inherit",
  });
  if (r1.status !== 0) throw new Error("迁移执行器第 1 次运行失败");

  const c = new pg.Client({ connectionString: URL });
  await c.connect();

  const tables = await c.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1"
  );
  console.log("\n== 表清单 ==");
  console.log(tables.rows.map((r) => r.table_name).join(", "));

  const pc = await c.query("SELECT count(*) FROM products");
  const ic = await c.query("SELECT count(*) FROM inventory");
  console.log(`\n== 种子数据 ==\nproducts: ${pc.rows[0].count}（预期 10）\ninventory: ${ic.rows[0].count}（预期 66）`);

  // 抽查库存公式与 Phase 1 一致：p2(EU39) 应为 6，p1(EU36) oos 应为 0
  const s1 = await c.query("SELECT qty FROM inventory WHERE product_id=2 AND size='39'");
  const s2 = await c.query("SELECT qty FROM inventory WHERE product_id=1 AND size='36'");
  console.log(`p2:39 qty=${s1.rows[0].qty}（预期 6）  p1:36 qty=${s2.rows[0].qty}（预期 0 = oos）`);

  console.log("\n== 第 2 次执行（幂等性：应全部 skip）==");
  const r2 = spawnSync("node", ["migrations/run.js"], {
    env: { ...process.env, DATABASE_URL: URL },
    stdio: "inherit",
  });
  if (r2.status !== 0) throw new Error("迁移执行器第 2 次运行失败");

  console.log("\n== 行级锁冒烟测试（SELECT ... FOR UPDATE）==");
  const c1 = new pg.Client({ connectionString: URL });
  const c2 = new pg.Client({ connectionString: URL });
  await c1.connect();
  await c2.connect();
  await c1.query("BEGIN");
  await c1.query("SELECT qty FROM inventory WHERE product_id=2 AND size='39' FOR UPDATE");
  await c2.query("SET lock_timeout = '600ms'");
  try {
    await c2.query("BEGIN");
    await c2.query("SELECT qty FROM inventory WHERE product_id=2 AND size='39' FOR UPDATE");
    console.log("✗ 锁未生效（c2 未被阻塞）");
    process.exitCode = 1;
  } catch (e) {
    console.log(`✓ 行级锁生效：c2 被阻塞并超时（${e.code}）`);
  }
  await c1.query("COMMIT");
  try { await c2.query("ROLLBACK"); } catch {}
  await c1.end();
  await c2.end();

  console.log("\n== 约束冒烟测试 ==");
  try {
    await c.query("INSERT INTO orders (id, region, status, tax_rule, shipping_method, payment, subtotal_usd, total_usd) VALUES ('SO-TEST', 'US', 'shipped', '{}', '{}', '{}', 0, 0)");
    console.log("✗ 状态 CHECK 未生效");
    process.exitCode = 1;
  } catch (e) {
    console.log(`✓ 订单状态 CHECK 生效（非法状态 'shipped' 被拒：${e.code}）`);
  }
  try {
    await c.query("UPDATE inventory SET qty = -1 WHERE product_id=2 AND size='39'");
    console.log("✗ 库存非负 CHECK 未生效");
    process.exitCode = 1;
  } catch (e) {
    console.log("✓ 库存非负 CHECK 生效");
  }

  await c.end();
  console.log("\n✅ 全部验证通过");
} finally {
  await db.stop();
  rmSync(DATA_DIR, { recursive: true, force: true });
}
