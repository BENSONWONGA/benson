import { redirect } from "next/navigation";
import { peekSessionId } from "@/lib/db";
import { currentUser, boundUserId } from "@/modules/auth/service";
import { ordersForUser } from "@/modules/order/service";
import { getFeedback } from "@/ai/recommender/feedback";
import { getProduct } from "@/modules/catalog/service";
import LogoutButton from "@/components/LogoutButton";

/**
 * /account — 我的账户（Phase 16）
 * 服务端渲染：画像 / 我的订单（账户归属 ∪ 本会话）/ 心愿单 / 退出。
 * 未登录 → 重定向 /login（robots noindex：个人页不参与搜索索引）
 */
export const metadata = { title: "My account", robots: { index: false, follow: false } };

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const sessionId = peekSessionId();
  const user = currentUser(sessionId);
  if (!user) redirect("/login");

  const orders = ordersForUser(sessionId, boundUserId(sessionId));
  const wishlist = await Promise.all(
    (getFeedback(sessionId).saved || []).map(async (p) => ({ ...p, ...(await getProduct(p.id)) }))
  );

  return (
    <div className="container section">
      <p className="eyebrow">My account</p>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 32, margin: 0 }}>Hi{user.name ? `, ${user.name}` : ""}</h1>
        <LogoutButton />
      </div>
      <p className="muted" style={{ marginTop: 8 }}>
        {user.email} · member since {user.createdAt.slice(0, 10)}
      </p>

      {/* ===== 我的订单 ===== */}
      <h2 style={{ fontSize: 20, margin: "40px 0 12px" }}>Orders</h2>
      {orders.length === 0 ? (
        <p className="muted">No orders yet — your guest checkout on this device will show up here after sign-in.</p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {orders.map((o) => (
            <a
              key={o.id}
              href={`/order/${o.id}`}
              className="product-card"
              style={{ padding: 16, textDecoration: "none", color: "inherit" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{o.id}</div>
                  <div className="muted">
                    {o.createdAt.slice(0, 16).replace("T", " ")} · {o.itemCount} item{o.itemCount > 1 ? "s" : ""} ·{" "}
                    {o.items.map((i) => `${i.name} (${i.size})`).join(", ")}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="price">
                    {o.currency} {Number(o.total).toFixed(2)}
                  </div>
                  <div className="muted">{o.status.replace(/_/g, " ")}</div>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}

      {/* ===== 心愿单 ===== */}
      <h2 style={{ fontSize: 20, margin: "40px 0 12px" }}>Wishlist</h2>
      {wishlist.length === 0 ? (
        <p className="muted">Nothing saved yet — tap the heart on any product you love.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
          {wishlist.map((p) => (
            <a key={p.id} href={`/product/${p.id}`} className="product-card" style={{ textDecoration: "none", color: "inherit" }}>
              <div className="thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.image} alt={p.name} loading="lazy" />
              </div>
              <div className="info">
                <div className="name">{p.name}</div>
                <div className="meta">
                  <span className="price">{"$" + Number(p.price).toFixed(0)}</span> · saved {String(p.savedAt || "").slice(0, 10)}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
