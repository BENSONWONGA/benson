/**
 * components/MasterConsole — 总后台（客户端轮询 /api/master/overview）
 * 五视图：总览 / 员工令牌（签发·吊销）/ 站点设置 / 审计日志 / 系统健康。
 * 门禁：x-master-token（骨架期默认 dev-master-token，仅老板持有）。
 *
 * 与商家后台分层：本台签发的员工令牌（st_ 前缀）供员工在
 * /admin/merchant 登录；吊销即时生效（merchant isAdmin 每请求实时查）。
 *
 * 视觉：iOS 26 液态玻璃（admin.css 的 .adm-* 命名空间，由页面外层的
 * AdminFrame 提供壁纸与令牌；本组件只做展示层，业务逻辑与 fetch 契约不变）。
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Kpi, Badge, Empty, Pills } from "@/components/admin/ui";

const TOKEN_KEY = "solfit_master_token";
const POLL_MS = 10000;

const fmtTime = (iso) => (iso || "").slice(0, 16).replace("T", " ");
const fmtDur = (sec) =>
  sec >= 86400
    ? `${Math.floor(sec / 86400)} 天 ${Math.floor((sec % 86400) / 3600)} 时`
    : sec >= 3600
      ? `${Math.floor(sec / 3600)} 时 ${Math.floor((sec % 3600) / 60)} 分`
      : `${Math.floor(sec / 60)} 分`;

const ROLE_ZH = { owner: "管理员", staff: "员工" };

/** 审计动作中文（与路由层 auditAdmin 的 action 码一一对应） */
const ACTION_ZH = {
  staff_token_created: "签发员工令牌",
  staff_token_revoked: "吊销员工令牌",
  settings_updated: "更新站点设置",
  order_shipped: "订单发货",
  inventory_restocked: "库存补货",
  product_created: "新建商品",
  product_updated: "更新商品",
  product_listed: "商品上架",
  product_unlisted: "商品下架",
  promo_created: "创建优惠码",
  promo_activated: "启用优惠码",
  promo_deactivated: "停用优惠码",
  post_created: "新建内容",
  post_updated: "更新内容",
  post_published: "内容发布",
  post_unpublished: "内容下线",
  review_removed: "删除评价",
  points_adjusted: "调整积分",
};

export default function MasterConsole() {
  const [token, setToken] = useState(null);
  const [input, setInput] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(null);
  const [tab, setTab] = useState("overview");
  const [issued, setIssued] = useState(null); // 新签发令牌（仅完整展示一次）
  const [copied, setCopied] = useState(false);

  // 员工令牌表单
  const [stName, setStName] = useState("");
  const [stRole, setStRole] = useState("staff");
  const [stNote, setStNote] = useState("");

  // 站点设置表单（data 首次到达时播种）
  const [form, setForm] = useState(null);

  useEffect(() => {
    const saved = sessionStorage.getItem(TOKEN_KEY);
    if (saved) setToken(saved);
  }, []);

  const load = useCallback(async (tk) => {
    try {
      const res = await fetch("/api/master/overview", { headers: { "x-master-token": tk }, cache: "no-store" });
      const body = await res.json();
      if (body.code !== 0) throw new Error(body.message || "bad response");
      setData(body.data);
      setError(null);
      return true;
    } catch (e) {
      setError(e.message === "MASTER_REQUIRED" ? "超管令牌错误" : e.message);
      return false;
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    load(token);
    const t = setInterval(() => load(token), POLL_MS);
    return () => clearInterval(t);
  }, [token, load]);

  useEffect(() => {
    if (data?.settings && !form) setForm({ ...data.settings });
  }, [data, form]);

  async function unlock(e) {
    e.preventDefault();
    if (await load(input)) {
      sessionStorage.setItem(TOKEN_KEY, input);
      setToken(input);
    }
  }

  async function act(url, payload, key, okNote) {
    setBusy(key); setNotice(null); setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-master-token": token },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (body.code !== 0) throw new Error(body.message);
      setNotice(okNote);
      await load(token);
      return body;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setBusy(null);
    }
  }

  function copyIssued(text) {
    navigator.clipboard?.writeText(text)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => {});
  }

  // ===== 未解锁：超管令牌门（玻璃卡片，同商家后台 Gate 质感）=====
  if (!token) {
    return (
      <div className="adm-gate">
        <form className="adm-gate-card" onSubmit={unlock}>
          <div className="adm-eyebrow">SOLFIT 总后台</div>
          <h1>老板登录</h1>
          <p className="adm-muted" style={{ fontSize: 12, marginBottom: 18 }}>
            输入超管令牌进入总后台（员工令牌由本台签发，员工请去商家后台登录）
          </p>
          <label htmlFor="master-token">超管令牌</label>
          <input
            id="master-token"
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="x-master-token"
            required
            autoFocus
          />
          {error && <p style={{ color: "var(--adm-err)", fontSize: 12, margin: "8px 0 0" }}>{error}</p>}
          <button className="adm-btn adm-btn-primary" style={{ width: "100%", marginTop: 18, height: 42 }} type="submit" disabled={!input}>
            进入总后台
          </button>
          <p className="adm-muted" style={{ fontSize: 11, marginTop: 16, lineHeight: 1.7 }}>
            骨架期默认令牌 <code>dev-master-token</code>（生产用环境变量 <code>MASTER_TOKEN</code> 覆盖）。
            员工请用你签发的令牌去 <a href="/admin/merchant">商家后台</a> 登录。
          </p>
        </form>
      </div>
    );
  }

  if (!data) return <Card><Empty>加载中…</Empty></Card>;
  const { staff, settings, auditLogs, health, stats } = data;
  const activeStaff = (staff || []).filter((s) => s.status === "active");

  return (
    <div>
      {/* ===== Tab 导航（iOS 分段控件质感）+ 锁定 ===== */}
      <div className="adm-row" style={{ margin: "2px 0 6px" }}>
        <Pills
          items={[
            ["overview", "总览"],
            ["staff", "员工令牌", (staff || []).length],
            ["settings", "站点设置"],
            ["audit", "审计日志", (auditLogs || []).length],
            ["health", "系统健康"],
          ]}
          value={tab}
          onChange={setTab}
        />
        <button
          className="adm-btn adm-btn-danger adm-btn-sm adm-spacer"
          onClick={() => { sessionStorage.removeItem(TOKEN_KEY); setToken(null); setData(null); setForm(null); }}
        >
          锁定
        </button>
      </div>
      {notice && <p style={{ color: "var(--adm-ok)", fontSize: 13, margin: "10px 0 2px", fontWeight: 600 }}>✓ {notice}</p>}
      {error && <p style={{ color: "var(--adm-err)", fontSize: 13, margin: "10px 0 2px" }}>{error}</p>}

      {/* ===== 总览 ===== */}
      {tab === "overview" && (
        <>
          <div className="adm-kpis">
            <Kpi num={`$${stats.gmvUsd.toLocaleString()}`} lbl="成交额 GMV (USD)" />
            <Kpi num={`$${(stats.marginUsd ?? 0).toLocaleString()}`} lbl="毛利" sub={`毛利率 ${stats.marginPct ?? 0}%`} />
            <Kpi num={stats.orders} lbl="订单数" sub={`待发货 ${stats.toShip}`} />
            <Kpi num={stats.afterSales} lbl="售后（换货/退货）" tone={stats.afterSales ? "err" : undefined} />
            <Kpi num={stats.registeredUsers} lbl="注册会员" />
            <Kpi num={stats.products ?? "—"} lbl="在售商品" sub={stats.unlisted ? `${stats.unlisted} 已下架` : undefined} />
            <Kpi num={activeStaff.length} lbl="在职员工" sub={`共 ${(staff || []).length} 个令牌`} />
            <Kpi
              num={health.status === "ok" ? "正常" : "降级"}
              lbl="系统状态"
              sub={`告警 ${health.alerts.count}`}
              tone={health.status === "ok" ? "ok" : "err"}
            />
          </div>
          <p className="adm-muted" style={{ fontSize: 13 }}>
            管分工：本台管"人"与"站"（员工令牌 / 站点设置 / 审计 / 健康）· 员工在
            <a href="/admin/merchant" target="_blank" style={{ margin: "0 4px" }}>商家后台</a>
            管货与单（订单/库存/商品/优惠码/内容/评价/会员）· 数据 {POLL_MS / 1000}s 自动刷新
          </p>
        </>
      )}

      {/* ===== 员工令牌 ===== */}
      {tab === "staff" && (
        <>
          <Card title="员工令牌" small="签发给员工，用于商家后台登录">
            {/* 新令牌一次性展示 */}
            {issued && (
              <div style={{ border: "1px solid rgba(52, 199, 89, 0.35)", background: "rgba(52, 199, 89, 0.1)", borderRadius: 14, padding: 16, margin: "0 0 18px" }}>
                <b>新令牌已签发 —— 仅此一次完整显示</b>
                <div className="adm-mono" style={{ margin: "10px 0", fontSize: 13, wordBreak: "break-all" }}>{issued.token}</div>
                <button className="adm-btn adm-btn-primary adm-btn-sm" onClick={() => copyIssued(issued.token)}>
                  {copied ? "已复制 ✓" : "复制令牌"}
                </button>
                <p className="adm-muted" style={{ marginTop: 10, marginBottom: 0, fontSize: 12 }}>
                  请立即发给「{issued.name}」—— 员工在
                  <a href="/admin/merchant" target="_blank" style={{ margin: "0 4px" }}>商家后台 /admin/merchant</a>
                  输入此令牌登录；本页刷新后不再完整显示。员工离职时在此吊销即可。
                </p>
              </div>
            )}

            {/* 签发表单 */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy("staff-create"); setNotice(null); setError(null);
                try {
                  const res = await fetch("/api/master/staff", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "x-master-token": token },
                    body: JSON.stringify({ action: "create", name: stName, role: stRole, note: stNote }),
                  });
                  const body = await res.json();
                  if (body.code !== 0) throw new Error(body.message);
                  setIssued({ name: body.data.staff.name, token: body.data.token });
                  setCopied(false);
                  setStName(""); setStNote(""); setStRole("staff");
                  await load(token);
                } catch (e2) {
                  setError(e2.message);
                } finally {
                  setBusy(null);
                }
              }}
            >
              <label htmlFor="st-name">签发新令牌</label>
              <div className="adm-row">
                <input
                  id="st-name"
                  style={{ flex: "2 1 180px" }}
                  placeholder="员工姓名（如：小王）"
                  value={stName}
                  onChange={(e) => setStName(e.target.value)}
                  maxLength={24}
                  required
                />
                <select
                  aria-label="角色"
                  style={{ flex: "1 1 130px" }}
                  value={stRole}
                  onChange={(e) => setStRole(e.target.value)}
                >
                  <option value="staff">员工（仅商家后台）</option>
                  <option value="owner">管理员（可进总后台）</option>
                </select>
                <input
                  aria-label="备注"
                  style={{ flex: "2 1 180px" }}
                  placeholder="备注（如：仓库组 · 离职需回收）"
                  value={stNote}
                  onChange={(e) => setStNote(e.target.value)}
                  maxLength={60}
                />
                <button className="adm-btn adm-btn-primary" type="submit" disabled={busy === "staff-create" || !stName.trim()}>
                  {busy === "staff-create" ? "签发中…" : "签发令牌"}
                </button>
              </div>
            </form>
          </Card>

          {/* 员工表 */}
          <Card title="员工列表" small={`${(staff || []).length} 个令牌 · 吊销即时生效`}>
            <table className="adm-table">
              <thead>
                <tr>
                  <th>姓名</th><th>角色</th><th>令牌</th><th>状态</th><th>最近使用</th><th>创建时间</th><th></th>
                </tr>
              </thead>
              <tbody>
                {(staff || []).map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 700 }}>
                      {s.name}
                      {s.note ? <div className="adm-muted" style={{ fontSize: 11, fontWeight: 400 }}>{s.note}</div> : null}
                    </td>
                    <td>{ROLE_ZH[s.role] || s.role}</td>
                    <td className="adm-mono adm-muted" style={{ fontSize: 11 }}>{s.tokenPreview}</td>
                    <td>
                      <Badge tone={s.status === "active" ? "ok" : "err"}>
                        {s.status === "active" ? "在职" : "已吊销"}
                      </Badge>
                    </td>
                    <td className="adm-muted" style={{ fontSize: 11 }}>
                      {s.lastUsedAt ? fmtTime(s.lastUsedAt) : "从未使用"}
                    </td>
                    <td className="adm-muted" style={{ fontSize: 11 }}>{fmtTime(s.createdAt)}</td>
                    <td style={{ textAlign: "right" }}>
                      {s.status === "active" && (
                        <button
                          className="adm-btn adm-btn-danger adm-btn-sm"
                          disabled={busy === `revoke-${s.id}`}
                          onClick={() =>
                            act("/api/master/staff", { action: "revoke", id: s.id }, `revoke-${s.id}`,
                              `「${s.name}」令牌已吊销，商家后台立即失效`)
                          }
                        >
                          {busy === `revoke-${s.id}` ? "…" : "吊销"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!(staff || []).length && (
                  <tr><td colSpan={7} className="adm-muted" style={{ padding: "16px 10px" }}>还没有员工令牌 —— 签发第一个给店里的同事吧。</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {/* ===== 站点设置 ===== */}
      {tab === "settings" && form && (
        <>
          <Card title="站点设置" small="保存后全站即时生效">
            <form
              style={{ maxWidth: 640 }}
              onSubmit={async (e) => {
                e.preventDefault();
                const body = await act("/api/master/settings", {
                  siteName: form.siteName,
                  announcement: form.announcement,
                  defaultCurrency: form.defaultCurrency,
                  defaultLang: form.defaultLang,
                  maintenance: form.maintenance,
                }, "settings-save", "站点设置已保存");
                if (body?.data?.changed?.length) setNotice(`站点设置已保存：${body.data.changed.join("、")}`);
              }}
            >
              <label htmlFor="set-name">店铺名称</label>
              <input id="set-name" value={form.siteName} maxLength={40}
                onChange={(e) => setForm({ ...form, siteName: e.target.value })} />

              <label htmlFor="set-announce" style={{ marginTop: 14 }}>公告栏文案（前台顶部横幅；留空 = 隐藏）</label>
              <input id="set-announce" value={form.announcement} maxLength={160}
                onChange={(e) => setForm({ ...form, announcement: e.target.value })} />

              <div className="adm-form-grid" style={{ marginTop: 14 }}>
                <div>
                  <label htmlFor="set-currency">默认货币（未设置偏好的访客）</label>
                  <select id="set-currency" value={form.defaultCurrency}
                    onChange={(e) => setForm({ ...form, defaultCurrency: e.target.value })}>
                    <option value="USD">USD $ 美元</option>
                    <option value="EUR">EUR € 欧元</option>
                    <option value="GBP">GBP £ 英镑</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="set-lang">默认语言</label>
                  <select id="set-lang" value={form.defaultLang}
                    onChange={(e) => setForm({ ...form, defaultLang: e.target.value })}>
                    <option value="en">English</option>
                    <option value="zh">中文</option>
                  </select>
                </div>
              </div>

              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 500, cursor: "pointer", marginTop: 16 }}>
                <input
                  type="checkbox"
                  checked={form.maintenance}
                  onChange={(e) => setForm({ ...form, maintenance: e.target.checked })}
                  style={{ width: 16, height: 16, padding: 0, accentColor: "var(--adm-accent)" }}
                />
                维护模式（前台显示维护横幅，结算下单被拦截）
              </label>

              <button className="adm-btn adm-btn-primary" style={{ marginTop: 18 }} type="submit" disabled={busy === "settings-save"}>
                {busy === "settings-save" ? "保存中…" : "保存设置"}
              </button>
            </form>
          </Card>
          <p className="adm-muted" style={{ fontSize: 13, maxWidth: 640 }}>
            生效位置：公告栏与维护横幅在前台每个页面顶部；默认货币/语言作用于未设置偏好的访客；
            维护模式开启后前台仅展示横幅、浏览不受影响，下单接口返回 503。
          </p>
        </>
      )}

      {/* ===== 审计日志 ===== */}
      {tab === "audit" && (
        <Card title="审计日志" small="总后台与商家后台的全部写操作（最近 120 条）">
          <table className="adm-table">
            <thead>
              <tr>
                <th>时间</th><th>操作者</th><th>动作</th><th>详情</th>
              </tr>
            </thead>
            <tbody>
              {(auditLogs || []).map((l, i) => (
                <tr key={i}>
                  <td className="adm-mono adm-muted" style={{ fontSize: 11, whiteSpace: "nowrap" }}>{fmtTime(l.at)}</td>
                  <td style={{ fontWeight: 600 }}>{l.actor}</td>
                  <td>{ACTION_ZH[l.action] || l.action}</td>
                  <td className="adm-muted">{l.detail}</td>
                </tr>
              ))}
              {!(auditLogs || []).length && (
                <tr><td colSpan={4} className="adm-muted" style={{ padding: "16px 10px" }}>暂无记录 —— 后台的每一次写操作（发货 / 补货 / 商品 / 优惠码 / 内容 / 评价 / 积分）都会记入这里。</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {/* ===== 系统健康 ===== */}
      {tab === "health" && (
        <>
          <div className="adm-kpis">
            <Kpi num={health.status === "ok" ? "正常" : "降级"} lbl="总体状态" tone={health.status === "ok" ? "ok" : "err"} />
            <Kpi num={fmtDur(health.uptimeSec)} lbl="运行时长" />
            <Kpi num={health.pipeline.emitted} lbl="埋点事件" sub={`丢弃 ${health.pipeline.discarded}`} />
            <Kpi num={health.eventsDepth} lbl="事件缓冲深度" />
            <Kpi num={health.products} lbl="商品目录" />
            <Kpi num={health.fitSamples} lbl="脚型训练样本" />
            <Kpi num={health.alerts.count} lbl="活跃告警" tone={health.alerts.count ? "warn" : "ok"} />
            <div className="adm-kpi">
              <div className="adm-kpi-num" style={{ fontSize: 16 }}>{health.node}</div>
              <div className="adm-kpi-lbl">运行时</div>
              <div className="adm-kpi-sub">{health.env}</div>
            </div>
          </div>

          <Card title="活跃告警">
            {health.alerts.count ? (
              health.alerts.active.map((a) => (
                <p key={a.rule} style={{ fontSize: 13, margin: "4px 0", fontWeight: 600, color: a.level === "critical" ? "var(--adm-err)" : "var(--adm-warn)" }}>
                  ● {a.label}（{a.level}，自 {fmtTime(a.since)}）
                </p>
              ))
            ) : (
              <Empty>无活跃告警 —— 退货率 / AI 覆盖率 / 管道丢弃 / 5xx 率四条规则均正常。</Empty>
            )}
          </Card>

          <Card title="管道检查" small="探针同源 /api/health · 告警同源监控看板">
            <p className="adm-muted" style={{ fontSize: 13, margin: 0 }}>
              {Object.entries(health.checks).map(([k, ok]) => `${k}:${ok ? "通过" : "异常"}`).join(" · ")}
              —— sinks {health.pipeline.sinks.join(" / ")} · Kafka {health.pipeline.kafka}
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
