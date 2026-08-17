import crypto from "node:crypto";
import { parseJson, query, queryOne, stringifyJson, withTransaction } from "../pool.js";

export async function createWebhookEvent({ providerEventId, eventType, payload }) {
  const id = crypto.randomUUID();
  try {
    await query(
      `INSERT INTO webhook_events (
        id, provider, provider_event_id, event_type, payload
      ) VALUES (:id, 'paypal', :providerEventId, :eventType, :payload)`,
      {
        id,
        providerEventId,
        eventType,
        payload: stringifyJson(payload),
      },
    );
    return { id, duplicate: false };
  } catch (error) {
    if (error?.code !== "ER_DUP_ENTRY") throw error;
    const existing = await queryOne(
      `SELECT id, status FROM webhook_events
       WHERE provider = 'paypal' AND provider_event_id = :providerEventId
       LIMIT 1`,
      { providerEventId },
    );
    return { id: existing.id, duplicate: true, status: existing.status };
  }
}

export async function updateWebhookEvent(id, status, errorMessage = null) {
  await query(
    `UPDATE webhook_events
     SET status = :status,
         error_message = :errorMessage,
         processed_at = IF(:status IN ('processed', 'ignored', 'failed'), UTC_TIMESTAMP(3), processed_at)
     WHERE id = :id`,
    { id, status, errorMessage },
  );
}

export async function findPlanByPayPalId(providerPlanId, configuredPlans) {
  const code = Object.entries(configuredPlans).find(([, id]) => id === providerPlanId)?.[0];
  if (!code) return null;
  const row = await queryOne(`SELECT * FROM plans WHERE code = :code AND enabled = TRUE LIMIT 1`, {
    code,
  });
  return row
    ? {
        id: row.id,
        code: row.code,
        name: row.name,
        monthlyCredits: Number(row.monthly_credits),
      }
    : null;
}

export async function upsertSubscription({
  userId,
  planId,
  providerSubscriptionId,
  providerPayerId = null,
  status,
  currentPeriodStart = null,
  currentPeriodEnd = null,
  metadata = null,
}) {
  const id = crypto.randomUUID();
  await withTransaction(async (connection) => {
    await connection.execute(
      `INSERT INTO subscriptions (
        id, user_id, plan_id, provider, provider_subscription_id,
        provider_payer_id, status, current_period_start, current_period_end,
        metadata
      ) VALUES (?, ?, ?, 'paypal', ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        plan_id = VALUES(plan_id),
        provider_payer_id = COALESCE(VALUES(provider_payer_id), provider_payer_id),
        status = VALUES(status),
        current_period_start = COALESCE(VALUES(current_period_start), current_period_start),
        current_period_end = COALESCE(VALUES(current_period_end), current_period_end),
        metadata = VALUES(metadata)`,
      [
        id,
        userId,
        planId,
        providerSubscriptionId,
        providerPayerId,
        status,
        currentPeriodStart,
        currentPeriodEnd,
        stringifyJson(metadata),
      ],
    );
    if (status === "active") {
      await connection.execute(`UPDATE users SET plan_id = ? WHERE id = ? AND status = 'active'`, [
        planId,
        userId,
      ]);
    }
  });
}

export async function updateSubscriptionStatus(providerSubscriptionId, status, metadata = null) {
  await query(
    `UPDATE subscriptions
     SET status = :status,
         cancelled_at = IF(:status IN ('cancelled', 'expired'), UTC_TIMESTAMP(3), cancelled_at),
         metadata = COALESCE(:metadata, metadata)
     WHERE provider = 'paypal' AND provider_subscription_id = :providerSubscriptionId`,
    {
      providerSubscriptionId,
      status,
      metadata: stringifyJson(metadata),
    },
  );
}

export async function findSubscriptionByProviderId(providerSubscriptionId) {
  const row = await queryOne(
    `SELECT s.*, p.code AS plan_code, p.monthly_credits, p.name AS plan_name
     FROM subscriptions s
     JOIN plans p ON p.id = s.plan_id
     WHERE s.provider = 'paypal' AND s.provider_subscription_id = :providerSubscriptionId
     LIMIT 1`,
    { providerSubscriptionId },
  );
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    planId: row.plan_id,
    planCode: row.plan_code,
    planName: row.plan_name,
    monthlyCredits: Number(row.monthly_credits),
    providerSubscriptionId: row.provider_subscription_id,
    status: row.status,
    metadata: parseJson(row.metadata, {}),
  };
}

export async function grantSubscriptionCredits({ subscription, providerEventId }) {
  if (!subscription || subscription.monthlyCredits <= 0) return false;
  await query(
    `INSERT IGNORE INTO credit_ledger (
      id, user_id, amount, entry_type, reference_type, reference_id,
      idempotency_key, description, metadata
    ) VALUES (
      :id, :userId, :amount, 'subscription_grant', 'subscription', :referenceId,
      :idempotencyKey, :description, :metadata
    )`,
    {
      id: crypto.randomUUID(),
      userId: subscription.userId,
      amount: subscription.monthlyCredits,
      referenceId: subscription.id,
      idempotencyKey: `paypal:${providerEventId}:subscription-credits`,
      description: `${subscription.planName} monthly credits`,
      metadata: stringifyJson({ providerEventId }),
    },
  );
  return true;
}

export async function getActiveSubscription(userId) {
  const row = await queryOne(
    `SELECT s.id, s.provider_subscription_id, s.status,
            s.current_period_start, s.current_period_end,
            p.code AS plan_code, p.name AS plan_name, p.price_monthly_cents
     FROM subscriptions s
     JOIN plans p ON p.id = s.plan_id
     WHERE s.user_id = :userId AND s.status IN ('active', 'past_due', 'paused')
     ORDER BY s.updated_at DESC LIMIT 1`,
    { userId },
  );
  return row
    ? {
        id: row.id,
        providerSubscriptionId: row.provider_subscription_id,
        status: row.status,
        currentPeriodStart: row.current_period_start,
        currentPeriodEnd: row.current_period_end,
        planCode: row.plan_code,
        planName: row.plan_name,
        priceMonthlyCents: Number(row.price_monthly_cents),
      }
    : null;
}
