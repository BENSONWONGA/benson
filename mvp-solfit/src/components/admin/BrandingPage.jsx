/**
 * components/admin/BrandingPage — 品牌装修（主题 / 首页 / SEO 三合一）
 * 站点主题（10 套 UI 模板 + 全站锁定）· 首页装修（主图 + 中英文案）· 首页 SEO meta。
 * 保存即前台生效（首页 SSR 每请求读设置）；全部操作进审计日志。
 */
"use client";

import { useEffect, useState } from "react";
import { THEMES } from "@/lib/themes";
import { HOME_TEXT } from "@/lib/i18n";
import { useAdmin, act, Card, Badge, Empty } from "@/components/admin/ui";
import ImageUpload from "@/components/admin/ImageUpload";

export default function BrandingPage() {
  const { token } = useAdmin();
  const [settings, setSettings] = useState(null);
  const [themeSel, setThemeSel] = useState(null);
  const [hp, setHp] = useState(null);
  const [seo, setSeo] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/overview", { headers: { "x-admin-token": token }, cache: "no-store" });
      const body = await res.json();
      if (body.code !== 0) return;
      const s = body.data.settings;
      setSettings(s);
      setThemeSel({ theme: s.theme, themeLocked: s.themeLocked });
      const pick = (lang) => ({
        heroEyebrow: s.homeContent?.[lang]?.heroEyebrow || "",
        heroH1: s.homeContent?.[lang]?.heroH1 || "",
        heroLede: s.homeContent?.[lang]?.heroLede || "",
        ctaFind: s.homeContent?.[lang]?.ctaFind || "",
        ctaShop: s.homeContent?.[lang]?.ctaShop || "",
        recH2: s.homeContent?.[lang]?.recH2 || "",
        topH2: s.homeContent?.[lang]?.topH2 || "",
      });
      setHp({ zh: pick("zh"), en: pick("en"), heroImage: s.homeHeroImage || "" });
      setSeo({ title: s.seo?.title || "", description: s.seo?.description || "", keywords: s.seo?.keywords || "" });
    })();
  }, [token]);

  async function save(kind, payload, note) {
    setBusy(kind);
    setMsg(null);
    try {
      const data = await act(token, "/api/admin/settings", payload);
      setSettings(data.settings);
      setMsg(note + (data.changed.length ? `（变更：${data.changed.join("、")}）` : "（无变化）"));
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (!settings || !themeSel || !hp || !seo) return <Card title="品牌装修"><Empty>加载中…</Empty></Card>;

  return (
    <>
      {msg && <p style={{ color: "#1e7a41", fontSize: 12, margin: "0 0 12px" }}>✓ {msg}</p>}

      {/* ===== 主题模板 ===== */}
      <Card title="站点主题" small="访客未自选时的全站门面；锁定后访客自选失效、前台选择器隐藏"
        extra={<Badge tone={themeSel.themeLocked ? "info" : "muted"}>{themeSel.themeLocked ? "已锁定全站" : "访客可自选"}</Badge>}>
        <div className="adm-row" style={{ marginBottom: 14 }}>
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={`adm-chip ${themeSel.theme === t.id ? "active" : ""}`}
              onClick={() => setThemeSel({ ...themeSel, theme: t.id })}
            >
              <span style={{
                width: 15, height: 15, borderRadius: 99, display: "inline-block", background: t.swatch,
                boxShadow: t.dark ? "inset 0 0 0 2px rgba(255,255,255,0.35)" : "inset 0 0 0 1px rgba(0,0,0,0.15)",
              }} />
              {t.label}
            </button>
          ))}
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer", marginBottom: 14, fontWeight: 400 }}>
          <input
            type="checkbox"
            checked={themeSel.themeLocked}
            onChange={(e) => setThemeSel({ ...themeSel, themeLocked: e.target.checked })}
            style={{ width: 16, height: 16 }}
          />
          锁定全站主题（品牌统一门面）
        </label>
        <div className="adm-row">
          <button
            className="adm-btn adm-btn-primary"
            disabled={busy === "theme"}
            onClick={() => save("theme", { action: "theme", theme: themeSel.theme, themeLocked: themeSel.themeLocked },
              `站点主题已设为「${THEMES.find((x) => x.id === themeSel.theme)?.label}」`)}
          >
            {busy === "theme" ? "保存中…" : "保存主题"}
          </button>
          <a className="adm-btn adm-btn-outline" href="/" target="_blank">查看首页效果</a>
        </div>
      </Card>

      {/* ===== 首页装修 ===== */}
      <Card title="首页装修" small="主图与 Hero 区文案（中/英双语，留空 = 用默认，清空即回落）">
        <div style={{ marginBottom: 14 }}>
          <ImageUpload
            label="首页主图"
            value={hp.heroImage}
            onChange={(url) => setHp({ ...hp, heroImage: url })}
            hint="3:4 竖图为佳；可本地上传或粘贴外链，留空 = 内置默认图"
          />
        </div>
        {[["zh", "中文文案"], ["en", "English 文案"]].map(([lang, label]) => (
          <div key={lang} style={{ border: "1px solid #e5e8f0", borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <b style={{ display: "block", marginBottom: 10 }}>{label}</b>
            <div className="adm-form-grid">
              {[
                ["heroEyebrow", "眉头小标签"],
                ["heroH1", "主标题"],
                ["heroLede", "副标题文案"],
                ["ctaFind", "主按钮文字"],
                ["ctaShop", "次按钮文字"],
                ["recH2", "AI 推荐区块标题"],
                ["topH2", "高分好评区块标题"],
              ].map(([field, zhLabel]) => (
                <div key={field}>
                  <label>{zhLabel}</label>
                  {field === "heroLede" ? (
                    <textarea
                      rows={2}
                      value={hp[lang][field]}
                      placeholder={HOME_TEXT[lang][field]}
                      onChange={(e) => setHp({ ...hp, [lang]: { ...hp[lang], [field]: e.target.value } })}
                    />
                  ) : (
                    <input
                      value={hp[lang][field]}
                      placeholder={HOME_TEXT[lang][field]}
                      onChange={(e) => setHp({ ...hp, [lang]: { ...hp[lang], [field]: e.target.value } })}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="adm-row">
          <button
            className="adm-btn adm-btn-primary"
            disabled={busy === "hp"}
            onClick={() => save("hp", { action: "homepage", homeContent: { zh: hp.zh, en: hp.en }, homeHeroImage: hp.heroImage }, "首页装修已保存")}
          >
            {busy === "hp" ? "保存中…" : "保存首页装修"}
          </button>
          <a className="adm-btn adm-btn-outline" href="/" target="_blank">查看首页</a>
        </div>
      </Card>

      {/* ===== SEO ===== */}
      <Card title="首页 SEO" small="搜索结果门面：标题 ≤60 字 / 描述 ≤160 字最佳">
        <div className="adm-form-grid">
          <div><label>SEO 标题</label><input value={seo.title} placeholder="SOLFIT — AI 量脚选鞋，保证合脚" onChange={(e) => setSeo({ ...seo, title: e.target.value })} /></div>
          <div><label>关键词（逗号分隔）</label><input value={seo.keywords} placeholder="AI 量脚, 合脚运动鞋, 宽脚鞋" onChange={(e) => setSeo({ ...seo, keywords: e.target.value })} /></div>
        </div>
        <div style={{ marginTop: 12 }}>
          <label>SEO 描述</label>
          <textarea rows={3} value={seo.description} placeholder="60 秒 AI 量脚，精准匹配专属楦型 —— 每一双都附免费换码保证。" onChange={(e) => setSeo({ ...seo, description: e.target.value })} />
        </div>
        <div className="adm-row" style={{ marginTop: 14 }}>
          <button
            className="adm-btn adm-btn-primary"
            disabled={busy === "seo"}
            onClick={() => save("seo", { action: "seo", title: seo.title, description: seo.description, keywords: seo.keywords }, "SEO 设置已保存")}
          >
            {busy === "seo" ? "保存中…" : "保存 SEO 设置"}
          </button>
          <a className="adm-btn adm-btn-outline" href="/sitemap.xml" target="_blank">查看 sitemap</a>
          <a className="adm-btn adm-btn-outline" href="/robots.txt" target="_blank">robots.txt</a>
        </div>
        <p className="adm-muted" style={{ fontSize: 11, marginTop: 12 }}>
          自动接管：sitemap 收录商品+文章（下线即退出）· /admin 全系 noindex · 文章 Article JSON-LD（内容营销页）· 商品 Product JSON-LD（含价格与库存态）
        </p>
      </Card>
    </>
  );
}
