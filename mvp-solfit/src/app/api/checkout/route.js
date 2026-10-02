import { NextResponse } from "next/server";
import { getSessionId } from "@/lib/db";
import { getCart } from "@/modules/cart/service";
import { getProduct } from "@/modules/catalog/service";
import { methodsFor, getMethod } from "@/modules/shipping/service";
import { quoteTax } from "@/modules/tax/service";
import { createOrder } from "@/modules/order/service";
import { validatePromo } from "@/modules/loyalty/service";
import { FX_RATES } from "@/lib/currency";
import { observed } from "@/lib/observe";

/**
 * POST /api/checkout — 结算报价与下单（金额全部服务端计算，前端只展示）
 * action=quote: {address:{country}} → { methods[], tax, totals }   —— 选国即报价
 * action=place: {email, address, methodId, paymentMethod}        → Order
 */

async function cartSubtotal(sessionId) {
  const items = getCart(sessionId).items;
  let sum = 0;
  for (const i of items) {
    const p = await getProduct(i.productId);
    sum += (p?.price || 0) * i.qty;
  }
  return sum;
}

async function quoteFor(sessionId, country, promoCode) {
  const subtotal = await cartSubtotal(sessionId);
  const methods = methodsFor(country, subtotal);
  const defaultMethod = methods.find((m) => m.id.endsWith("express")) || methods[0];
  const tax = quoteTax(country, subtotal, defaultMethod.finalPrice);
  // 优惠码预览（Phase 19）：quote 是预览 —— 无效码软报错不阻断结算流程
  let promo = null;
  let promoDiscount = 0;
  if (promoCode) {
    try {
      const v = validatePromo(promoCode, subtotal);
      promo = { code: v.code, label: v.label, discount: v.discount };
      promoDiscount = v.discount;
    } catch (err) {
      promo = { error: err.message };
    }
  }
  return {
    methods, method: defaultMethod, tax, promo,
    totals: { subtotal, promoDiscount, shipping: defaultMethod.finalPrice, tax: tax.amount },
  };
}

export async function POST(request) {
  return observed("checkout", async () => {
    const sessionId = getSessionId();
    const body = await request.json().catch(() => ({}));

    const cart = getCart(sessionId);
    if (!cart.items.length) {
      return NextResponse.json({ code: 400, message: "Cart is empty" }, { status: 400 });
    }

    try {
    if (body.action === "quote") {
      const q = await quoteFor(sessionId, body.address?.country, body.promoCode);
      return NextResponse.json({ code: 0, data: q });
    }

    if (body.action === "place") {
      const country = body.address?.country;
      // 以 place 时的方法与税重算（防前端篡改金额）
      const q = await quoteFor(sessionId, country);
      const method = body.methodId ? getMethod(body.methodId) : null;
      const finalMethod = method && method.zone === q.method.zone
        ? { ...method, finalPrice: method.price } // 选择的方法保留原价，但免邮规则重算
        : q.method;
      // 免邮规则重算（express + 小计门槛）
      const subtotal = await cartSubtotal(sessionId);
      if (finalMethod.id.endsWith("express") && subtotal >= 120) finalMethod.finalPrice = 0;
      else finalMethod.finalPrice = finalMethod.price;

      const tax = quoteTax(country, subtotal, finalMethod.finalPrice);
      const currency = FX_RATES[request.cookies.get("solfit_currency")?.value] ? request.cookies.get("solfit_currency").value : "USD";

      const order = await createOrder(sessionId, {
        email: body.email,
        address: body.address,
        shippingMethod: finalMethod,
        taxQuote: tax,
        currency,
        fxRate: FX_RATES[currency] ?? 1,
        paymentMethod: body.paymentMethod || "demo_card",
        promoCode: body.promoCode || null,       // Phase 19 优惠码（服务端验签计价）
        pointsToRedeem: body.pointsToRedeem || 0, // Phase 19 积分抵扣（100 分 = $1）
      });
      return NextResponse.json({ code: 0, data: order });
    }

    return NextResponse.json({ code: 400, message: "Unknown action" }, { status: 400 });
    } catch (err) {
      // 折扣类错误（无效码/门槛/积分不足）→ 422：可修正的结算输入错误
      const LOYALTY_ERRORS = ["INVALID_PROMO", "PROMO_EXPIRED", "PROMO_EXHAUSTED", "PROMO_MIN_SPEND",
        "PROMO_EXISTS", "INSUFFICIENT_POINTS", "LOGIN_REQUIRED_FOR_POINTS", "POINTS_CAP_REACHED"];
      const status = err.message === "OUT_OF_STOCK" ? 409 : LOYALTY_ERRORS.includes(err.message) ? 422 : 400;
      return NextResponse.json({ code: status, message: err.message, details: err.details }, { status });
    }
  });
}
