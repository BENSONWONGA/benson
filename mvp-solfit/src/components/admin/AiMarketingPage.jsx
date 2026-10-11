/**
 * components/admin/AiMarketingPage — AI 营销（营销自动化五件套，运营只读 + 两个动作）
 *   弃购召回（Phase 6）→ 广告人群分层（Phase 8）→ 留存 RFM（Phase 7）
 *   → 推荐归因（Phase 11）→ A/B 实验治理（Phase 9）
 * 动作：触发一轮召回投递（POST /api/ai/abandoned-carts）、人群导出（POST /api/ai/audiences）。
 * 样式全部走 admin.css 的 .adm-* 命名空间，与 PromosPage/CustomersPage 同构。
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdmin, act, Card, Badge, Empty, Modal, Pills, fmtTime, usd } from "@/components/admin/ui";
import { PRODUCTS } from "@/data/products";

/* ===== 展示字典（服务端结构 → 运营可读文案） ===== */
const PRODUCT_BY_ID = new Map(PRODUCTS.map((p) => [p.id, p]));

const SEGMENT_ZH = {
  lookalike_seed: "相似扩展种子",
  retargeting_viewed: "浏览未购再营销",
  retargeting_cart: "弃购再营销",
  category_lovers: "类目偏好定投",
  suppression_buyers: "已购抑制名单",
};
const PLATFORMS = [["meta", "Meta"], ["google", "Google"], ["json", "JSON"]];
const PLATFORM_ZH = { meta: "Meta Custom Audience", google: "Google Customer Match", json: "JSON 全字段" };
const EXPORT_ERR_ZH = {
  SEGMENT_NOT_FOUND: "人群不存在",
  EMPTY_AUDIENCE: "该人群暂无可导出邮箱（导出资格：显式订阅 或 复购订单）",
};

const RFM_TIERS = [
  ["vip", "VIP · 复购且近 90 天活跃", "ok"],
  ["active", "活跃 · 90 天内有成交", "info"],
  ["at_risk", "挽回窗口 · 91–180 天", "warn"],
  ["lapsed", "深度流失 · 180 天以上", "muted"],
];
const RFM_SHORT = { vip: "VIP", active: "活跃", at_risk: "挽回窗口", lapsed: "深度流失" };

const SCENARIOS = [
  ["repurchase_due", "补货到期", "已购类目磨损周期到了 → 推同类目替代款（刚性需求，优先级最高）"],
  ["complete_the_look", "搭配互补", "衣橱轮换缺位 → 推互补类目（订单共现优先，领域知识兜底）"],
  ["win_back", "流失挽回", "挽回窗口 / 流失人群 → 新品 + 尺码档案还在的温度话术"],
];
const SCENARIO_ZH = { repurchase_due: "补货到期", complete_the_look: "搭配互补", win_back: "流失挽回" };

const VARIANT_LIST = [
  ["baseline", "基线 · 规则召回 + 人工排序（对照组）"],
  ["vector_lr", "向量召回 + 学习排序（实验组）"],
  ["control", "对照臂 · 无个性化（固定 5%，增量测量基线）"],
];
const VARIANT_ZH = Object.fromEntries(VARIANT_LIST);

const RESULT_META = {
  sent: { zh: "已发送", tone: "ok" },
  failed: { zh: "发送失败", tone: "err" },
  suppressed_no_address: { zh: "无可用邮箱", tone: "muted" },
  suppressed_cooldown: { zh: "频控 · 单客冷却中", tone: "warn" },
  suppressed_session_cap: { zh: "频控 · 单客终身上限", tone: "warn" },
  suppressed_daily_cap: { zh: "频控 · 全局日上限", tone: "warn" },
};
const SOURCE_ZH = { subscribed: "订阅邮箱", past_order: "复购订单" };

const MODE_META = { adaptive: { zh: "自动治理", tone: "info" }, manual: { zh: "人工锁定", tone: "warn" }, fixed: { zh: "灰度冻结", tone: "muted" } };
const VERDICT_META = {
  promote: { zh: "晋级", tone: "ok" },
  kill: { zh: "退役", tone: "err" },
  hold: { zh: "观察中", tone: "muted" },
  concluded: { zh: "终局", tone: "info" },
};

const URLS = {
  carts: "/api/ai/abandoned-carts?windowMin=0&max=20",
  audiences: "/api/ai/audiences?maxEntries=8",
  retention: "/api/ai/retention",
  attribution: "/api/ai/attribution",
  experiments: "/api/ai/experiments",
};

/** AI 运营 API GET（统一带 token 头 + code!==0 抛错，与 useOverview 同口径） */
async function fetchAI(token, url) {
  const res = await fetch(url, { headers: { "x-admin-token": token || "" }, cache: "no-store" });
  const body = await res.json().catch(() => null);
  if (!body || body.code !== 0) throw new Error((body && body.message) || `HTTP ${res.status}`);
  return body.data;
}

/** 区块状态壳：错误（可重试）→ 加载中 → 空态 → 正常渲染（render 仅在 data 就绪时调用） */
function SectionState({ s, onRetry, empty, render }) {
  if (s.err) {
    return (
      <div className="adm-empty">
        <div className="adm-row" style={{ justifyContent: "center" }}>
          <Badge tone="err">接口加载失败：{s.err}</Badge>
          <button className="adm-btn adm-btn-outline adm-btn-sm" onClick={onRetry}>重试</button>
        </div>
      </div>
    );
  }
  if (!s.data) return <Empty>加载中…</Empty>;
  if (empty) return <Empty>{empty}</Empty>;
  return render(s.data);
}

export default function AiMarketingPage() {
  const { token } = useAdmin();
  const [sec, setSec] = useState({
    carts: { data: null, err: null },
    audiences: { data: null, err: null },
    retention: { data: null, err: null },
    attribution: { data: null, err: null },
    experiments: { data: null, err: null },
  });
  const [busy, setBusy] = useState(null); // "dispatch" | `export-${segmentId}`
  const [msg, setMsg] = useState(null); // { text, tone }
  const [platform, setPlatform] = useState("meta");
  const [dispatchRes, setDispatchRes] = useState(null); // POST /api/ai/abandoned-carts 响应
  const [exportView, setExportView] = useState(null); // { id, csv?, payload?, meta }

  const load = useCallback(
    async (key, url) => {
      setSec((s) => ({ ...s, [key]: { data: s[key] && s[key].data, err: null } }));
      try {
        const data = await fetchAI(token, url);
        setSec((s) => ({ ...s, [key]: { data, err: null } }));
      } catch (e) {
        setSec((s) => ({ ...s, [key]: { data: null, err: e.message } }));
      }
    },
    [token]
  );

  useEffect(() => {
    for (const [key, url] of Object.entries(URLS)) load(key, url);
  }, [load]);

  /* ===== 动作一：触发一轮召回投递 ===== */
  async function dispatchCarts() {
    setBusy("dispatch");
    setMsg(null);
    try {
      const data = await act(token, "/api/ai/abandoned-carts", { windowMin: 0 });
      setDispatchRes(data);
      const c = data.counts;
      const suppressed = c.audience - c.sent - c.failed;
      setMsg({ text: `本轮投递完成：发送 ${c.sent} · 失败 ${c.failed} · 频控/无地址抑制 ${suppressed}（人群 ${c.audience}）`, tone: "ok" });
    } catch (e) {
      setMsg({ text: `召回投递失败：${e.message}`, tone: "err" });
    } finally {
      setBusy(null);
    }
  }

  /* ===== 动作二：人群导出（platform 由 Pills 全局切换） ===== */
  async function exportSegment(seg) {
    setBusy(`export-${seg.id}`);
    setMsg(null);
    try {
      const data = await act(token, "/api/ai/audiences", { segmentId: seg.id, platform });
      setExportView({ id: seg.id, ...data });
    } catch (e) {
      setMsg({ text: `导出失败：${EXPORT_ERR_ZH[e.message] || e.message}`, tone: "err" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {msg && (
        <p className="adm-notice">
          <Badge tone={msg.tone}>{msg.text}</Badge>
        </p>
      )}

      {/* ===== 1) 弃购召回 ===== */}
      <Card
        title="弃购召回"
        small="加购超窗未结 + 购物车仍非空 → LLM 召回文案 → 频控三闸投递（windowMin=0 立即判定）"
        extra={
          <button className="adm-btn adm-btn-primary adm-btn-sm" disabled={busy === "dispatch"} onClick={dispatchCarts}>
            {busy === "dispatch" ? "投递中…" : "触发一轮召回投递"}
          </button>
        }
      >
        <SectionState
          s={sec.carts}
          onRetry={() => load("carts", URLS.carts)}
          empty={!sec.carts.data || !sec.carts.data.sessions.length ? "暂无弃购会话 —— 加购超窗未结算且购物车仍非空的会话才进入召回名单" : null}
          render={(d) => (
            <>
              <table className="adm-table">
                <thead>
                  <tr><th>会话</th><th>购物车商品</th><th>最后活跃</th><th>召回文案（AI）</th></tr>
                </thead>
                <tbody>
                  {d.sessions.map((s) => (
                    <tr key={s.sessionId}>
                      <td className="adm-mono">{s.sessionId.slice(0, 10)}</td>
                      <td>
                        {s.items.map((it, i) => (
                          <span className="adm-tag" key={i}>
                            {(PRODUCT_BY_ID.get(it.productId) || {}).name || `#${it.productId}`}
                            {it.size ? ` · ${it.size}` : ""}
                            {it.width && it.width !== "Standard" ? ` · ${it.width}` : ""} ×{it.qty || 1}
                          </span>
                        ))}
                      </td>
                      <td className="adm-muted" style={{ fontSize: 12 }}>{fmtTime(s.lastAt)}</td>
                      <td className="adm-muted" style={{ fontSize: 12, maxWidth: 380 }}>{s.message || "（无匹配商品，文案未生成）"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {d.count > d.sessions.length && (
                <p className="adm-muted" style={{ fontSize: 11, marginTop: 8 }}>
                  命中 {d.count} 个弃购会话，本轮预览前 {d.sessions.length} 个（max=20）
                </p>
              )}
            </>
          )}
        />

        {dispatchRes && (
          <div style={{ marginTop: 18 }}>
            <b style={{ fontSize: 12 }}>本轮投递结果（windowMin={dispatchRes.windowMin}）</b>
            <div className="adm-row" style={{ margin: "8px 0 12px" }}>
              <span className="adm-tag">人群 {dispatchRes.counts.audience}</span>
              <span className="adm-tag">发送 {dispatchRes.counts.sent}</span>
              <span className="adm-tag">失败 {dispatchRes.counts.failed}</span>
              <span className="adm-tag">无邮箱 {dispatchRes.counts.suppressed_no_address}</span>
              <span className="adm-tag">冷却 {dispatchRes.counts.suppressed_cooldown}</span>
              <span className="adm-tag">终身上限 {dispatchRes.counts.suppressed_session_cap}</span>
              <span className="adm-tag">日上限 {dispatchRes.counts.suppressed_daily_cap}</span>
            </div>
            {dispatchRes.results.length ? (
              <table className="adm-table">
                <thead>
                  <tr><th>会话</th><th>结果</th><th>邮箱来源</th><th>Provider</th></tr>
                </thead>
                <tbody>
                  {dispatchRes.results.map((r, i) => (
                    <tr key={r.sessionId + i}>
                      <td className="adm-mono">{r.sessionId.slice(0, 10)}</td>
                      <td><Badge tone={(RESULT_META[r.result] || {}).tone || "muted"}>{(RESULT_META[r.result] || {}).zh || r.result}</Badge></td>
                      <td className="adm-muted">{r.source ? SOURCE_ZH[r.source] || r.source : "—"}</td>
                      <td className="adm-mono" style={{ fontSize: 11 }}>{r.provider || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty>本轮人群为空，无需投递</Empty>
            )}
            <p className="adm-muted" style={{ fontSize: 11, marginTop: 10 }}>
              频控账本：Provider {dispatchRes.stats.provider} · 今日已发 {dispatchRes.stats.sendsToday} 封（全局日上限 {dispatchRes.stats.limits.dailyCap}）
              · 单客冷却 {Math.round(dispatchRes.stats.limits.cooldownMs / 3600000)} 小时 · 单客终身上限 {dispatchRes.stats.limits.maxPerSession} 封
            </p>
          </div>
        )}
      </Card>

      {/* ===== 2) 人群分层 ===== */}
      <Card
        title="广告人群分层"
        small="一方数据 → 平台受众资产；导出与邮件营销同资格口径，CSV 仅含 SHA-256 哈希邮箱"
        extra={<Pills items={PLATFORMS} value={platform} onChange={setPlatform} />}
      >
        <SectionState
          s={sec.audiences}
          onRetry={() => load("audiences", URLS.audiences)}
          empty={!sec.audiences.data || !sec.audiences.data.segments.length ? "暂无人群数据 —— 会话产生浏览 / 加购 / 成交行为后自动分层" : null}
          render={(d) => {
            const maxSize = Math.max(1, ...d.segments.map((a) => a.size));
            return (
              <table className="adm-table">
                <thead>
                  <tr><th>人群</th><th>投放用途</th><th>会话规模</th><th>可导出邮箱</th><th>样例（脱敏）</th><th></th></tr>
                </thead>
                <tbody>
                  {d.segments.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <b>{SEGMENT_ZH[a.id] || a.id}</b>
                        <div className="adm-mono adm-muted" style={{ fontSize: 11 }}>{a.id}</div>
                      </td>
                      <td className="adm-muted" style={{ fontSize: 12, maxWidth: 240 }}>{a.purpose}</td>
                      <td>
                        {a.size}
                        <div className="adm-hbar" style={{ width: 90, marginTop: 6 }}>
                          <div style={{ width: `${Math.round((a.size / maxSize) * 100)}%` }} />
                        </div>
                      </td>
                      <td>{a.withEmail}</td>
                      <td>
                        {a.sample.length ? (
                          a.sample.slice(0, 2).map((e) => (
                            <div key={e.sessionId} className="adm-mono" style={{ fontSize: 11 }}>
                              {e.email || "（无邮箱）"}
                              {e.tier ? <span className="adm-tag">{RFM_SHORT[e.tier] || e.tier}</span> : null}
                              {e.topCategory ? <span className="adm-tag">{e.topCategory}</span> : null}
                              {e.value ? <span className="adm-tag">价值分 {e.value}</span> : null}
                              {e.viewedProductIds ? <span className="adm-tag">浏览 {e.viewedProductIds.length} 款</span> : null}
                              {e.cartProductIds ? <span className="adm-tag">加购 {e.cartProductIds.length} 款</span> : null}
                            </div>
                          ))
                        ) : (
                          <span className="adm-muted">—</span>
                        )}
                      </td>
                      <td>
                        <button
                          className="adm-btn adm-btn-outline adm-btn-sm"
                          disabled={busy === `export-${a.id}`}
                          onClick={() => exportSegment(a)}
                        >
                          {busy === `export-${a.id}` ? "导出中…" : "导出"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          }}
        />
      </Card>

      {/* ===== 3) 留存与 RFM ===== */}
      <Card title="留存与 RFM 分层" small="RFM 从已支付订单派生（R 距上次成交 / F 订单数 / M 累计消费）→ 分层驱动生命周期营销场景">
        <SectionState
          s={sec.retention}
          onRetry={() => load("retention", URLS.retention)}
          empty={!sec.retention.data || !sec.retention.data.totalCustomers ? "暂无成交客户 —— RFM 分层与留存场景从已支付订单派生，有复购数据后自动成型" : null}
          render={(d) => {
            const total = d.totalCustomers || 0;
            return (
              <>
                <div className="adm-row" style={{ marginBottom: 16 }}>
                  <span className="adm-tag">成交客户 {total}</span>
                  <span className="adm-tag">本轮摘要 {d.count} 条</span>
                  <span className="adm-tag">campaign {d.campaign}</span>
                </div>

                <b style={{ fontSize: 12 }}>RFM 分层分布</b>
                <div style={{ marginTop: 10, marginBottom: 20 }}>
                  {RFM_TIERS.map(([id, label, tone]) => {
                    const n = d.tiers[id] || 0;
                    const pct = total ? Math.round((n / total) * 1000) / 10 : 0;
                    return (
                      <div key={id} style={{ marginBottom: 10 }}>
                        <div className="adm-row" style={{ justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                          <span><Badge tone={tone}>{label}</Badge></span>
                          <span className="adm-muted">{n} 人 · {pct}%</span>
                        </div>
                        <div className="adm-hbar"><div style={{ width: `${pct}%` }} /></div>
                      </div>
                    );
                  })}
                </div>

                <b style={{ fontSize: 12 }}>生命周期运营场景（本轮摘要命中）</b>
                <table className="adm-table" style={{ marginTop: 10, marginBottom: 20 }}>
                  <thead>
                    <tr><th>场景</th><th>策略</th><th>命中</th></tr>
                  </thead>
                  <tbody>
                    {SCENARIOS.map(([id, zh, desc]) => (
                      <tr key={id}>
                        <td>
                          <b>{zh}</b>
                          <div className="adm-mono adm-muted" style={{ fontSize: 11 }}>{id}</div>
                        </td>
                        <td className="adm-muted" style={{ fontSize: 12 }}>{desc}</td>
                        <td style={{ fontWeight: 800 }}>{d.scenarioHits[id] || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <b style={{ fontSize: 12 }}>摘要名单（每客 3 个候选 + AI 文案，此处仅预览不发邮件）</b>
                {d.digests.length ? (
                  <table className="adm-table" style={{ marginTop: 10 }}>
                    <thead>
                      <tr><th>会话</th><th>分层</th><th>场景</th><th>R · F · M</th><th>文案（AI）</th></tr>
                    </thead>
                    <tbody>
                      {d.digests.map((g) => (
                        <tr key={g.sessionId}>
                          <td className="adm-mono">{g.sessionId.slice(0, 10)}</td>
                          <td><Badge tone={(RFM_TIERS.find(([id]) => id === g.tier) || [null, null, "muted"])[2]}>{RFM_SHORT[g.tier] || g.tier}{g.isNew ? " · 新客" : ""}</Badge></td>
                          <td>
                            {SCENARIO_ZH[g.scenario] || g.scenario}
                            {g.dueCategory ? (
                              <div className="adm-muted" style={{ fontSize: 11 }}>到期类目 {g.dueCategory}{g.monthsSince ? ` · 已 ${g.monthsSince} 个月` : ""}</div>
                            ) : null}
                          </td>
                          <td className="adm-muted" style={{ fontSize: 12 }}>{g.rfm.recencyDays} 天 · {g.rfm.frequency} 单 · {usd(g.rfm.monetary)}</td>
                          <td className="adm-muted" style={{ fontSize: 12, maxWidth: 340 }}>{g.message || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <Empty>暂无可构建的留存摘要 —— 客户已购遍全目录（骨架期的极端情况），没有诚实的推荐就不发</Empty>
                )}
              </>
            );
          }}
        />
      </Card>

      {/* ===== 4) 归因分析 ===== */}
      <Card title="推荐归因分析" small="印象 → 成交的 last-touch join：归因 = 在场渗透率（会高估增量）；真实增量看个性化臂 vs 对照臂的转化率差">
        <SectionState
          s={sec.attribution}
          onRetry={() => load("attribution", URLS.attribution)}
          empty={!sec.attribution.data || !sec.attribution.data.total.orders ? "暂无已支付订单 —— 归因需要成交数据（印象 → 订单 last-touch join）" : null}
          render={(d) => {
            const byId = Object.fromEntries((d.lift || []).map((l) => [l.variant, l]));
            const pers = byId["vector_lr"];
            const ctrl = byId["control"];
            const inc = pers && ctrl && pers.ctr != null && ctrl.ctr != null ? Math.round((pers.ctr - ctrl.ctr) * 1000) / 10 : null;
            return (
              <>
                <div className="adm-kpis">
                  <div className="adm-kpi">
                    <div className="adm-kpi-num">{usd(d.attributed.revenue)}</div>
                    <div className="adm-kpi-lbl">归因收入（推荐在场 · {d.attributed.orders} 单 / {d.attributed.items} 件）</div>
                  </div>
                  <div className="adm-kpi">
                    <div className="adm-kpi-num">{usd(d.total.revenue)}</div>
                    <div className="adm-kpi-lbl">总收入（paid 口径 · {d.total.orders} 单）</div>
                  </div>
                  <div className="adm-kpi">
                    <div className="adm-kpi-num">{d.attributedRevenuePct == null ? "—" : `${d.attributedRevenuePct}%`}</div>
                    <div className="adm-kpi-lbl">推荐渗透率（在场率口径）</div>
                  </div>
                  <div className="adm-kpi">
                    <div className="adm-kpi-num">{inc == null ? "—" : `${inc >= 0 ? "+" : ""}${inc}pp`}</div>
                    <div className="adm-kpi-lbl">真实增量近似（个性化臂 − 对照臂 CTR 差）</div>
                  </div>
                </div>

                <b style={{ fontSize: 12 }}>分变体归因（哪个变体的印象最终变成了钱）</b>
                {d.revenueByVariant.length ? (
                  <table className="adm-table" style={{ marginTop: 10, marginBottom: 12 }}>
                    <thead>
                      <tr><th>变体</th><th>归因订单</th><th>归因件数</th><th>归因收入</th></tr>
                    </thead>
                    <tbody>
                      {d.revenueByVariant.map((v) => (
                        <tr key={v.variant}>
                          <td>
                            <b>{VARIANT_ZH[v.variant] || v.variant}</b>
                            <div className="adm-mono adm-muted" style={{ fontSize: 11 }}>{v.variant}</div>
                          </td>
                          <td>{v.orders}</td>
                          <td>{v.items}</td>
                          <td style={{ fontWeight: 800 }}>{usd(v.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <Empty>暂无归因命中 —— 成交商品在成交前没有推荐印象（前台多逛多买后回流）</Empty>
                )}
                <p className="adm-muted" style={{ fontSize: 11, marginTop: 10 }}>{d.note}</p>
              </>
            );
          }}
        />
      </Card>

      {/* ===== 5) A/B 实验 ===== */}
      <Card title="A/B 实验治理" small="ε-greedy 自适应分流 + Champion/Challenger 裁决；对照臂（control）固定 5% 永不下线，用于真实增量测量">
        <SectionState
          s={sec.experiments}
          onRetry={() => load("experiments", URLS.experiments)}
          empty={!sec.experiments.data || !sec.experiments.data.lift.length ? "暂无实验数据 —— 前台产生推荐印象并回流后，这里会出现变体效果与治理决策" : null}
          render={(d) => {
            const st = d.state || {};
            const modeMeta = MODE_META[st.mode] || { zh: st.mode, tone: "muted" };
            return (
              <>
                <div className="adm-row" style={{ marginBottom: 14 }}>
                  <Badge tone={modeMeta.tone}>模式 · {modeMeta.zh}</Badge>
                  {st.champion ? <Badge tone="ok">Champion · {st.champion}</Badge> : <Badge tone="muted">Champion 未定（证据不足）</Badge>}
                  <span className="adm-muted" style={{ fontSize: 12 }}>已评估 {st.evaluations ?? 0} 轮{st.lastEvalAt ? ` · 最近 ${fmtTime(st.lastEvalAt)}` : ""}</span>
                  {st.retired && st.retired.length ? <span className="adm-tag">已退役 {st.retired.join(" / ")}</span> : null}
                </div>

                {st.verdict && (
                  <div className="adm-row" style={{ marginBottom: 16 }}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>最近裁决：</span>
                    <Badge tone={(VERDICT_META[st.verdict.action] || {}).tone || "muted"}>{(VERDICT_META[st.verdict.action] || {}).zh || st.verdict.action}</Badge>
                    {st.verdict.variant ? <span className="adm-mono" style={{ fontSize: 12 }}>{st.verdict.variant}</span> : null}
                    {st.verdict.liftPct != null ? <span className="adm-tag">lift {st.verdict.liftPct}%</span> : null}
                    {st.verdict.decided != null ? <span className="adm-tag">样本 {st.verdict.decided}</span> : null}
                    <span className="adm-muted" style={{ fontSize: 12 }}>{fmtTime(st.verdict.at)}</span>
                  </div>
                )}

                <b style={{ fontSize: 12 }}>当前流量分配</b>
                {st.allocation ? (
                  <div style={{ marginTop: 10, marginBottom: 20 }}>
                    {VARIANT_LIST.map(([id]) => (
                      <div key={id} style={{ marginBottom: 10 }}>
                        <div className="adm-row" style={{ justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                          <span>{VARIANT_ZH[id]}</span>
                          <span className="adm-muted">{st.allocation[id] ?? 0}%</span>
                        </div>
                        <div className="adm-hbar"><div style={{ width: `${st.allocation[id] ?? 0}%` }} /></div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="adm-muted" style={{ fontSize: 12, marginTop: 6, marginBottom: 18 }}>
                    治理分配未生成 —— 会话按静态权重灰度（baseline / vector_lr 各 50，control 5）
                  </p>
                )}

                <b style={{ fontSize: 12 }}>变体效果回流（lift）</b>
                <table className="adm-table" style={{ marginTop: 10, marginBottom: 20 }}>
                  <thead>
                    <tr><th>变体</th><th>印象</th><th>已判定</th><th>转化</th><th>CTR</th><th>相对基线</th></tr>
                  </thead>
                  <tbody>
                    {d.lift.map((l) => (
                      <tr key={l.variant}>
                        <td>
                          <b>{VARIANT_ZH[l.variant] || l.variant}</b>
                          <div className="adm-mono adm-muted" style={{ fontSize: 11 }}>{l.variant}</div>
                        </td>
                        <td>{l.impressions}</td>
                        <td>{l.decided}</td>
                        <td>{l.positives}</td>
                        <td>{l.ctr == null ? "—" : `${(l.ctr * 100).toFixed(1)}%`}</td>
                        <td>
                          {l.liftVsBaselinePct == null ? (
                            <span className="adm-muted">基线</span>
                          ) : (
                            <Badge tone={l.liftVsBaselinePct >= 0 ? "ok" : "err"}>{l.liftVsBaselinePct >= 0 ? "+" : ""}{l.liftVsBaselinePct}%</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <b style={{ fontSize: 12 }}>治理决策日志（最近 {d.decisions.length} 条）</b>
                {d.decisions.length ? (
                  <table className="adm-table" style={{ marginTop: 10 }}>
                    <thead>
                      <tr><th>决策</th><th>变体</th><th>lift</th><th>样本</th><th>时间</th></tr>
                    </thead>
                    <tbody>
                      {d.decisions.map((x, i) => (
                        <tr key={i}>
                          <td><Badge tone={(VERDICT_META[x.action] || {}).tone || "muted"}>{(VERDICT_META[x.action] || {}).zh || x.action}</Badge></td>
                          <td className="adm-mono" style={{ fontSize: 12 }}>{x.variant || "—"}</td>
                          <td>{x.liftPct != null ? `${x.liftPct}%` : "—"}</td>
                          <td className="adm-muted">{x.decided != null ? x.decided : "—"}</td>
                          <td className="adm-muted" style={{ fontSize: 12 }}>{fmtTime(x.at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="adm-muted" style={{ fontSize: 12, marginTop: 8 }}>暂无治理决策记录 —— 治理器每 10 分钟评估一轮，证据未成形时保持 hold</p>
                )}
              </>
            );
          }}
        />
      </Card>

      {/* ===== 人群导出结果弹窗 ===== */}
      <Modal
        open={!!exportView}
        onClose={() => setExportView(null)}
        title={exportView ? `导出 · ${SEGMENT_ZH[exportView.id] || exportView.id}（${PLATFORM_ZH[exportView.meta.platform] || exportView.meta.platform}）` : ""}
        width={720}
      >
        {exportView &&
          (() => {
            const lines = exportView.csv ? exportView.csv.split("\n") : [];
            const entries = (exportView.payload && exportView.payload.entries) || [];
            return (
              <>
                <p className="adm-notice">
                  共 {exportView.meta.requested} 条可导出记录 · 导出于 {fmtTime(exportView.meta.exportedAt)} ——
                  平台摄入只认 SHA-256 哈希邮箱（Custom Audience 规范 + GDPR 最小化），审计已记录计数级条目
                </p>
                {exportView.csv ? (
                  <>
                    <b style={{ fontSize: 12 }}>CSV 预览：前 {Math.min(8, lines.length)} 行 / 共 {lines.length} 行（含表头）</b>
                    <pre className="adm-mono" style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize: 11, marginTop: 8 }}>
                      {lines.slice(0, 8).join("\n")}
                      {lines.length > 8 ? "\n…" : ""}
                    </pre>
                  </>
                ) : (
                  <>
                    <b style={{ fontSize: 12 }}>JSON payload 预览：前 {Math.min(2, entries.length)} 条 / 共 {entries.length} 条（含 DPA 商品清单与价值分）</b>
                    <pre className="adm-mono" style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize: 11, marginTop: 8 }}>
                      {JSON.stringify(entries.slice(0, 2), null, 2)}
                      {entries.length > 2 ? "\n…" : ""}
                    </pre>
                  </>
                )}
              </>
            );
          })()}
      </Modal>
    </>
  );
}
