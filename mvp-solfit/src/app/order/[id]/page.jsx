/**
 * /order/[id] — 订单确认页（Phase 1 闭环终点 + Fit Guarantee 换货入口）
 * 金额按下单时快照 {currency, fxRate} 展示 —— 汇率漂移不影响历史订单
 */

import { notFound } from "next/navigation";
import { getOrder } from "@/modules/order/service";
import { formatMoneyFromRate } from "@/lib/currency";
import OrderExchange from "@/components/OrderExchange";

export const metadata = { title: "Order confirmation" };
export const dynamic = "force-dynamic"; // 订单为运行时数据

export default function OrderPage({ params }) {
  const order = getOrder(params.id);
  if (!order) notFound();

  const fmt = (usd) => formatMoneyFromRate(usd, order.currency, order.fxRate);
  const statusLabel = { paid: "Paid", exchanged: "Exchange in progress", returned: "Return processing" }[order.status] || order.status;

  return (
    <div className="container" style={{ padding: "40px 24px 80px", maxWidth: 900 }}>
      <div className="eyebrow">Step 3 of 3</div>
      <h1 style={{ fontSize: 36 }}>Thank you — your pair is on the way.</h1>
      <p className="muted" style={{ marginTop: 8 }}>
        Order <b className="mono">{order.id}</b> · {statusLabel} · Tracking <b className="mono">{order.tracking}</b> (stub)
      </p>

      <div className="order-grid" style={{ marginTop: 24 }}>
        <div>
          {order.items.map((i, idx) => (
            <div className="cart-row" key={idx}>
              <div className="cart-row-info">
                <b>{i.name}</b>
                <p className="muted">EU {i.size} · {i.width} width · Qty {i.qty}</p>
              </div>
              <div style={{ textAlign: "right" }}>{fmt(i.lineTotal)}</div>
            </div>
          ))}
          <div className="sum-row"><span>Subtotal</span><b>{fmt(order.totals.subtotal)}</b></div>
          <div className="sum-row"><span>Shipping ({order.shippingMethod.name})</span><b>{order.totals.shipping === 0 ? "Free" : fmt(order.totals.shipping)}</b></div>
          <div className="sum-row"><span>{order.taxRule.label}</span><b>{fmt(order.totals.tax)}</b></div>
          <div className="sum-row total"><span>Total ({order.currency})</span><b>{fmt(order.totals.total)}</b></div>
        </div>

        <aside className="cart-summary">
          <h3>Deliver to</h3>
          <p>{order.address.name}<br />{order.address.street}<br />{order.address.city}, {order.address.zip}<br />{order.address.country}</p>
          <p className="muted" style={{ marginTop: 10 }}>Region zone: {order.region} · Payment: {order.payment.provider} (demo)</p>
        </aside>
      </div>

      <OrderExchange order={order} />

      <p style={{ marginTop: 28 }}>
        <a className="btn btn-outline" href="/shop">Continue shopping</a>
      </p>
    </div>
  );
}
