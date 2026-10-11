/**
 * /admin/master — 总后台（Phase 22 · 老板/超管级）
 * 与商家后台（/admin/merchant，员工日常操作）分层：本页管"人"与"站" ——
 * 员工令牌签发/吊销、站点级设置、审计日志、系统健康。
 * 门禁：x-master-token（MASTER_TOKEN，骨架期默认 dev-master-token —— 仅老板持有）。
 * 视觉：AdminFrame 液态玻璃框架（不并入商家后台壳，master 令牌鉴权保持独立）。
 */

import "../admin.css";
import AdminFrame from "@/components/admin/AdminFrame";
import MasterConsole from "@/components/MasterConsole";

export const metadata = { title: "总后台", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function MasterPage() {
  return (
    <AdminFrame
      eyebrow="老板 / 超管"
      title="总后台"
      subtitle="员工令牌签发与吊销 · 站点级设置 · 审计日志 · 系统健康 —— 商家后台员工的一切操作在此可管可查"
    >
      <MasterConsole />
    </AdminFrame>
  );
}
