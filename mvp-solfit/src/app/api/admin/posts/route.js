import { NextResponse } from "next/server";
import { isAdmin } from "@/modules/merchant/service";
import { createPost, updatePost, setPublished } from "@/modules/content/service";
import { auditAdmin } from "@/modules/master/service";
import { observed } from "@/lib/observe";

/**
 * POST /api/admin/posts — 内容运营（商家后台 Content tab）
 *   {action:"create", title, body, excerpt?, tags?, cover?}
 *   {action:"update", slug, patch:{title?,excerpt?,body?,tags?,cover?}}
 *   {action:"publish"|"unpublish", slug}
 * 门禁：x-admin-token（merchant 域 isAdmin）。列表经 /api/admin/overview 一站式下发。
 */
export const dynamic = "force-dynamic";

export async function POST(request) {
  return observed("admin-posts", async () => {
    if (!isAdmin(request)) return NextResponse.json({ code: 401, message: "ADMIN_REQUIRED" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    try {
      if (body.action === "create") {
        const post = createPost(body);
        auditAdmin("post_created", `「${post.title}」`, request);
        return NextResponse.json({ code: 0, data: { post } });
      }
      if (body.action === "update") {
        const post = updatePost(body.slug, body.patch || {});
        auditAdmin("post_updated", `「${post.title}」`, request);
        return NextResponse.json({ code: 0, data: { post } });
      }
      if (body.action === "publish" || body.action === "unpublish") {
        const post = setPublished(body.slug, body.action === "publish");
        auditAdmin(body.action === "publish" ? "post_published" : "post_unpublished", `「${post.title}」`, request);
        return NextResponse.json({ code: 0, data: { post } });
      }
      return NextResponse.json({ code: 400, message: "Unknown action" }, { status: 400 });
    } catch (err) {
      const status = ["POST_NOT_FOUND"].includes(err.message) ? 404 : 400;
      return NextResponse.json({ code: status, message: err.message }, { status });
    }
  });
}
