import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import { isAdmin } from "@/modules/merchant/service";
import { auditAdmin } from "@/modules/master/service";
import { observed } from "@/lib/observe";

/**
 * POST /api/admin/upload — 商品图/详图/装修图本地上传（商家后台）
 * multipart/form-data {file}；校验类型（png/jpg/webp/gif）与大小（≤5MB）；
 * 落盘 <项目根>/uploads/，返回站内 URL（/api/uploads/<name> 供前台直出）。
 * 文件名随机不可猜 —— 缓存可 immutable；上传行为进审计日志。
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(request) {
  return observed("admin-upload", async () => {
    if (!isAdmin(request)) return NextResponse.json({ code: 401, message: "ADMIN_REQUIRED" }, { status: 401 });

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ code: 400, message: "FILE_REQUIRED" }, { status: 400 });
    }
    const ext = ALLOWED[file.type];
    if (!ext) return NextResponse.json({ code: 415, message: "UNSUPPORTED_IMAGE" }, { status: 415 });
    if (file.size > MAX_BYTES) return NextResponse.json({ code: 413, message: "FILE_TOO_LARGE" }, { status: 413 });

    const name = `img_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}.${ext}`;
    const dir = path.join(process.cwd(), "uploads");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));

    auditAdmin("image_uploaded", `${name}（${Math.round(file.size / 1024)} KB）`, request);
    return NextResponse.json({
      code: 0,
      data: { url: `/api/uploads/${name}`, size: file.size, type: file.type },
    });
  });
}
