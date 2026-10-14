/**
 * /privacy — GDPR 政策页（方案文档 §7.4：第一天做对）
 * 数据类别 / 用途 / 存储与权利操作（导出/删除）
 */

import PrivacyActions from "@/components/PrivacyActions";

export const metadata = { title: "Privacy & your data" };

export default function PrivacyPage() {
  return (
    <div className="container" style={{ padding: "48px 24px 96px", maxWidth: 760 }}>
      <div className="eyebrow">Compliance</div>
      <h1 style={{ fontSize: 36, marginBottom: 20 }}>Privacy &amp; your data</h1>

      <div className="fit-strip">
        <b>GDPR ready by design.</b> EU visitors&apos; personal data is routed to EU-region storage
        (<code>modules/customer</code> keeps a region field for partitioned storage).
      </div>

      <h3 style={{ margin: "28px 0 8px" }}>What we collect</h3>
      <table className="pv-table">
        <tbody>
          <tr><td>Session cookie</td><td>Cart &amp; checkout — essential, no consent needed</td></tr>
          <tr><td>Fit profile (answers, recommended size)</td><td>Personalized size pre-selection — erased with your session, upgradable to account-level with your consent</td></tr>
          <tr><td>Analytics events (page views, funnel)</td><td>Only after you click &quot;Accept all&quot;; used to improve fit recommendations</td></tr>
          <tr><td>Order records</td><td>Financial compliance requires retention; personal identifiers are removed on erase</td></tr>
        </tbody>
      </table>

      <h3 style={{ margin: "28px 0 8px" }}>Your rights</h3>
      <p className="lede" style={{ fontSize: 14, marginBottom: 8 }}>
        Data portability (export) and the right to erasure are available below — no support ticket required.
        Cookie preferences reset after erasure.
      </p>
      <PrivacyActions />

      <h3 style={{ margin: "28px 0 8px" }}>Contact</h3>
      <p className="muted">privacy@solfit.example (stub) · 14-day EU withdrawal right honored via the Fit Guarantee exchange flow.</p>
    </div>
  );
}
