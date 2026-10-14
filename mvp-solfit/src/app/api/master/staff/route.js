import { NextResponse } from "next/server";
import { isMaster, createStaffToken, revokeStaffToken, listStaff, auditAdmin } from "@/modules/master/service";
import { observed } from "@/lib/observe";

/**
 * POST /api/master/staff — 员工令牌管理（总后台）
 *   {action:"create", name, role:"staff"|"owner", note?} → {staff, token}
 *     完整令牌仅在创建响应出现一次（列表只出预览）
 *   {action:"revoke", id} → {staff}（吊销后商家后台立即失效）
 * 门禁：x-master-token（master 域 isMaster）。
 */
export const dynamic = "force-dynamic";

export async function POST(request) {
  return observed("master-staff", async () => {
    if (!isMaster(request).ok) return NextResponse.json({ code: 401, message: "MASTER_REQUIRED" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    try {
      if (body.action === "create") {
        const rec = createStaffToken({ name: body.name, role: body.role, note: body.note });
        auditAdmin("staff_token_created", `「${rec.name}」（${rec.role === "owner" ? "管理员" : "员工"}）`, request);
        const staff = listStaff().find((s) => s.id === rec.id);
        return NextResponse.json({ code: 0, data: { staff, token: rec.token } });
      }
      if (body.action === "revoke") {
        const rec = revokeStaffToken(body.id);
        auditAdmin("staff_token_revoked", `「${rec.name}」令牌已吊销，商家后台立即失效`, request);
        const staff = listStaff().find((s) => s.id === rec.id);
        return NextResponse.json({ code: 0, data: { staff } });
      }
      return NextResponse.json({ code: 400, message: "Unknown action" }, { status: 400 });
    } catch (err) {
      const status = ["NAME_REQUIRED", "INVALID_ROLE"].includes(err.message)
        ? 422
        : err.message === "TOKEN_NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ code: status, message: err.message }, { status });
    }
  });
}
