/* PayPal billing — subscriptions (monthly credits) + one-time credit packs.
   Pure REST via fetch, no SDK. Setup steps in docs/SAAS.md. */
import { config } from "./config.js";
import { PLANS, PACKS } from "./plans.js";
import {
  addCredits,
  updateUser,
  findUserById,
  findUserBySubscription,
  publicUser,
} from "./users.js";

const API = () =>
  config.paypalEnv === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

export function paypalConfigured() {
  return Boolean(config.paypalClientId && config.paypalSecret);
}

async function paypalToken() {
  const r = await fetch(`${API()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(`${config.paypalClientId}:${config.paypalSecret}`).toString(
          "base64",
        ),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const d = await r.json();
  if (!r.ok)
    throw new Error(
      `PayPal auth failed: ${d.error_description || d.error || r.status}`,
    );
  return d.access_token;
}

async function paypal(path, method = "GET", body) {
  const token = await paypalToken();
  const r = await fetch(`${API()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  const d = text ? JSON.parse(text) : {};
  if (!r.ok)
    throw new Error(
      `PayPal ${method} ${path} failed: ${d.message || r.status}`,
    );
  return d;
}

/* ---- subscriptions: create approval link ---- */
export async function createSubscription(user, planId) {
  const plan = PLANS.find((p) => p.id === planId);
  if (!plan) throw new Error("Unknown plan.");
  if (!plan.paypalPlanId)
    throw new Error(
      `Plan "${plan.name}" is not linked to PayPal yet (set PAYPAL_PLAN_${plan.id.toUpperCase()} in .env — see docs/SAAS.md).`,
    );
  const sub = await paypal("/v1/billing/subscriptions", "POST", {
    plan_id: plan.paypalPlanId,
    custom_id: user.id,
    application_context: {
      brand_name: "CineAssemble",
      return_url: `${config.publicUrl}/api/billing/subscription/return`,
      cancel_url: `${config.publicUrl}/pricing`,
    },
  });
  const approve = (sub.links || []).find((l) => l.rel === "approve")?.href;
  if (!approve) throw new Error("PayPal returned no approval link.");
  return { approvalUrl: approve, subscriptionId: sub.id };
}

/* ---- after PayPal redirects back: activate + grant first month ---- */
export async function activateSubscription(subscriptionId) {
  const sub = await paypal(`/v1/billing/subscriptions/${subscriptionId}`);
  if (!["ACTIVE", "APPROVED"].includes(sub.status))
    throw new Error(`Subscription is ${sub.status}, not active.`);
  const user = findUserById(sub.custom_id);
  if (!user) throw new Error("Subscription owner not found.");
  const plan = PLANS.find((p) => p.paypalPlanId === sub.plan_id);
  const month = new Date().toISOString().slice(0, 7);
  const patch = {
    planId: plan?.id || null,
    paypalSubscriptionId: subscriptionId,
  };
  if (user.lastGrantMonth !== month && plan) {
    patch.credits = (user.credits || 0) + plan.credits;
    patch.lastGrantMonth = month;
  }
  return publicUser(updateUser(user.id, patch));
}

/* ---- webhook: monthly renewals grant credits (idempotent per month) ---- */
export async function handleWebhook(headers, rawBody) {
  if (config.paypalWebhookId) {
    const evt = JSON.parse(rawBody);
    const v = await paypal(
      "/v1/notifications/verify-webhook-signature",
      "POST",
      {
        transmission_id: headers["paypal-transmission-id"],
        transmission_time: headers["paypal-transmission-time"],
        cert_url: headers["paypal-cert-url"],
        auth_algo: headers["paypal-auth-algo"],
        transmission_sig: headers["paypal-transmission-sig"],
        webhook_id: config.paypalWebhookId,
        webhook_event: evt,
      },
    );
    if (v.verification_status !== "SUCCESS")
      throw new Error("Webhook signature verification failed.");
    return processEvent(evt);
  }
  return processEvent(JSON.parse(rawBody)); // no webhook id set (dev) — accept as-is
}

function processEvent(evt) {
  const type = evt.event_type || "";
  if (
    ![
      "PAYMENT.SALE.COMPLETED",
      "BILLING.SUBSCRIPTION.ACTIVATED",
      "BILLING.SUBSCRIPTION.RENEWED",
    ].includes(type)
  ) {
    return { ignored: type };
  }
  return grantRenewal(
    evt.resource?.billing_agreement_id || evt.resource?.id,
    evt.resource?.custom_id,
    evt.resource?.plan_id,
  );
}

function grantRenewal(subscriptionId, customUserId, planIdFromEvent) {
  // locate the user: custom_id first, otherwise scan by stored subscription id
  const user =
    (customUserId ? findUserById(customUserId) : null) ||
    findUserBySubscription(subscriptionId);
  if (!user) return { ignored: "owner not found" };
  const plan =
    PLANS.find((p) => p.paypalPlanId === planIdFromEvent) ||
    PLANS.find((p) => p.id === user.planId);
  if (!plan) return { ignored: "plan not found" };
  const month = new Date().toISOString().slice(0, 7);
  if (user.lastGrantMonth === month)
    return { ignored: "already granted this month" };
  updateUser(user.id, {
    credits: (user.credits || 0) + plan.credits,
    lastGrantMonth: month,
    planId: plan.id,
    paypalSubscriptionId: subscriptionId || user.paypalSubscriptionId,
  });
  return { granted: plan.credits, user: user.email };
}

/* ---- one-time credit packs (PayPal Orders) ---- */
export async function createPackOrder(user, packId) {
  const pack = PACKS.find((p) => p.id === packId);
  if (!pack) throw new Error("Unknown credit pack.");
  const order = await paypal("/v2/checkout/orders", "POST", {
    intent: "CAPTURE",
    purchase_units: [
      {
        custom_id: `${user.id}:${pack.id}`,
        description: `CineAssemble — ${pack.credits} credits`,
        amount: { currency_code: "USD", value: pack.price.toFixed(2) },
      },
    ],
    application_context: {
      brand_name: "CineAssemble",
      return_url: `${config.publicUrl}/api/billing/packs/return`,
      cancel_url: `${config.publicUrl}/pricing`,
    },
  });
  const approve = (order.links || []).find((l) => l.rel === "approve")?.href;
  if (!approve) throw new Error("PayPal returned no approval link.");
  return { approvalUrl: approve, orderId: order.id };
}

export async function capturePackOrder(orderId) {
  const order = await paypal(
    `/v2/checkout/orders/${orderId}/capture`,
    "POST",
    {},
  );
  if (order.status !== "COMPLETED")
    throw new Error(`Order is ${order.status}, not completed.`);
  const [userId, packId] = String(
    order.purchase_units?.[0]?.custom_id || "",
  ).split(":");
  const pack = PACKS.find((p) => p.id === packId);
  if (!userId || !pack) throw new Error("Order owner not found.");
  const u = addCredits(userId, pack.credits);
  return publicUser(u);
}
