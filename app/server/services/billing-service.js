import { config } from "../config.js";
import {
  createWebhookEvent,
  findPlanByPayPalId,
  findSubscriptionByProviderId,
  getActiveSubscription,
  grantSubscriptionCredits,
  updateSubscriptionStatus,
  updateWebhookEvent,
  upsertSubscription,
} from "../db/repositories/billing.js";
import { listEnabledPlans } from "../db/repositories/users.js";

let cachedAccessToken = null;
let accessTokenExpiresAt = 0;

function paypalBaseUrl() {
  return config.paypal.environment === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

function configuredPlanIds() {
  return {
    starter: config.paypal.planStarter,
    creator: config.paypal.planCreator,
    agency: config.paypal.planAgency,
  };
}

function requirePayPalConfiguration() {
  if (!config.paypal.clientId || !config.paypal.clientSecret) {
    const error = new Error("PayPal billing is not configured.");
    error.code = "PAYPAL_NOT_CONFIGURED";
    error.status = 503;
    throw error;
  }
}

async function accessToken() {
  requirePayPalConfiguration();
  if (cachedAccessToken && Date.now() < accessTokenExpiresAt - 60_000) {
    return cachedAccessToken;
  }
  const authorization = Buffer.from(
    `${config.paypal.clientId}:${config.paypal.clientSecret}`,
  ).toString("base64");
  const response = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${authorization}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`PayPal authentication failed (${response.status}).`);
  const payload = await response.json();
  cachedAccessToken = payload.access_token;
  accessTokenExpiresAt = Date.now() + Number(payload.expires_in || 300) * 1000;
  return cachedAccessToken;
}

async function paypalRequest(endpoint, { method = "GET", body = null } = {}) {
  const token = await accessToken();
  const response = await fetch(`${paypalBaseUrl()}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      Prefer: "return=representation",
    },
    body: body == null ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(
      payload?.message || payload?.details?.[0]?.description || `PayPal request failed (${response.status}).`,
    );
    error.status = response.status;
    error.code = "PAYPAL_REQUEST_FAILED";
    throw error;
  }
  return payload;
}

export async function getBillingOverview(user) {
  const plans = await listEnabledPlans();
  const providerIds = configuredPlanIds();
  return {
    plans: plans.map((plan) => ({
      ...plan,
      purchasable: plan.code !== "trial" && Boolean(providerIds[plan.code]),
    })),
    subscription: await getActiveSubscription(user.id),
    billingConfigured: Boolean(config.paypal.clientId && config.paypal.clientSecret),
  };
}

export async function createPayPalSubscription(user, planCode) {
  const providerPlanId = configuredPlanIds()[planCode];
  if (!providerPlanId || planCode === "trial") {
    return {
      ok: false,
      error: { code: "PLAN_NOT_AVAILABLE", message: "That subscription plan is unavailable." },
    };
  }
  const result = await paypalRequest("/v1/billing/subscriptions", {
    method: "POST",
    body: {
      plan_id: providerPlanId,
      custom_id: user.id,
      application_context: {
        brand_name: "CineAssemble",
        user_action: "SUBSCRIBE_NOW",
        return_url: `${config.appUrl}/billing/success`,
        cancel_url: `${config.appUrl}/billing/cancelled`,
        shipping_preference: "NO_SHIPPING",
      },
    },
  });
  const approvalUrl = result.links?.find((link) => link.rel === "approve")?.href;
  if (!approvalUrl) throw new Error("PayPal did not return a subscription approval URL.");
  return {
    ok: true,
    providerSubscriptionId: result.id,
    approvalUrl,
  };
}

async function verifyWebhook(headers, event) {
  if (!config.paypal.webhookId) throw new Error("PAYPAL_WEBHOOK_ID is not configured.");
  const payload = await paypalRequest("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    body: {
      auth_algo: headers["paypal-auth-algo"],
      cert_url: headers["paypal-cert-url"],
      transmission_id: headers["paypal-transmission-id"],
      transmission_sig: headers["paypal-transmission-sig"],
      transmission_time: headers["paypal-transmission-time"],
      webhook_id: config.paypal.webhookId,
      webhook_event: event,
    },
  });
  return payload.verification_status === "SUCCESS";
}

function providerStatus(value) {
  const status = String(value || "").toUpperCase();
  return {
    APPROVAL_PENDING: "pending",
    APPROVED: "pending",
    ACTIVE: "active",
    SUSPENDED: "paused",
    CANCELLED: "cancelled",
    EXPIRED: "expired",
  }[status] || "pending";
}

function validUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || ""),
  );
}

async function processSubscriptionEvent(event) {
  const resource = event.resource || {};
  const userId = resource.custom_id;
  if (!validUuid(userId)) return "ignored";
  const plan = await findPlanByPayPalId(resource.plan_id, configuredPlanIds());
  if (!plan) return "ignored";
  await upsertSubscription({
    userId,
    planId: plan.id,
    providerSubscriptionId: resource.id,
    providerPayerId: resource.subscriber?.payer_id || null,
    status: providerStatus(resource.status),
    currentPeriodStart: resource.billing_info?.last_payment?.time || null,
    currentPeriodEnd: resource.billing_info?.next_billing_time || null,
    metadata: {
      eventId: event.id,
      eventType: event.event_type,
    },
  });
  return "processed";
}

async function processPaymentEvent(event) {
  const resource = event.resource || {};
  const providerSubscriptionId =
    resource.billing_agreement_id || resource.supplementary_data?.related_ids?.subscription_id;
  if (!providerSubscriptionId) return "ignored";
  const subscription = await findSubscriptionByProviderId(providerSubscriptionId);
  if (!subscription) return "ignored";
  await grantSubscriptionCredits({
    subscription,
    providerEventId: event.id,
  });
  return "processed";
}

export async function processPayPalWebhook(headers, event) {
  const verified = await verifyWebhook(headers, event);
  if (!verified) {
    const error = new Error("PayPal webhook signature verification failed.");
    error.status = 400;
    error.code = "PAYPAL_SIGNATURE_INVALID";
    throw error;
  }
  const record = await createWebhookEvent({
    providerEventId: event.id,
    eventType: event.event_type,
    payload: event,
  });
  if (record.duplicate && ["processed", "ignored"].includes(record.status)) {
    return { ok: true, duplicate: true };
  }
  await updateWebhookEvent(record.id, "verified");

  try {
    let status = "ignored";
    if (String(event.event_type).startsWith("BILLING.SUBSCRIPTION.")) {
      if (["CANCELLED", "SUSPENDED", "EXPIRED"].some((value) => event.event_type.endsWith(value))) {
        const mapped = event.event_type.endsWith("SUSPENDED")
          ? "paused"
          : event.event_type.endsWith("CANCELLED")
            ? "cancelled"
            : "expired";
        await updateSubscriptionStatus(event.resource?.id, mapped, {
          eventId: event.id,
          eventType: event.event_type,
        });
        status = "processed";
      } else {
        status = await processSubscriptionEvent(event);
      }
    } else if (
      event.event_type === "PAYMENT.SALE.COMPLETED" ||
      event.event_type === "PAYMENT.CAPTURE.COMPLETED"
    ) {
      status = await processPaymentEvent(event);
    }
    await updateWebhookEvent(record.id, status);
    return { ok: true, duplicate: false, status };
  } catch (error) {
    await updateWebhookEvent(record.id, "failed", String(error.message).slice(0, 4000));
    throw error;
  }
}
