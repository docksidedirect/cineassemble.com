import crypto from "node:crypto";
import { parseJson, query, queryOne, stringifyJson, withTransaction } from "../pool.js";

export async function getAdminDashboard() {
  const [users, jobs, financial, recentErrors] = await Promise.all([
    queryOne(
      `SELECT
         COUNT(*) AS total_users,
         SUM(status = 'active') AS active_users,
         SUM(role = 'admin') AS administrators,
         SUM(created_at >= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 30 DAY)) AS new_users_30d
       FROM users WHERE status != 'deleted'`,
    ),
    queryOne(
      `SELECT
         COUNT(*) AS total_jobs,
         SUM(status = 'done') AS completed_jobs,
         SUM(status = 'error') AS failed_jobs,
         SUM(status IN ('queued', 'running')) AS active_jobs,
         SUM(created_at >= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 30 DAY)) AS jobs_30d,
         COALESCE(AVG(CASE WHEN status = 'done' THEN TIMESTAMPDIFF(SECOND, started_at, completed_at) END), 0) AS avg_render_seconds
       FROM jobs WHERE deleted_at IS NULL`,
    ),
    queryOne(
      `SELECT
         COALESCE(SUM(CASE WHEN s.status = 'active' THEN p.price_monthly_cents ELSE 0 END), 0) AS mrr_cents,
         COUNT(CASE WHEN s.status = 'active' THEN 1 END) AS active_subscriptions,
         COALESCE((SELECT SUM(actual_cost_usd) FROM jobs WHERE status = 'done'), 0) AS provider_cost_usd,
         COALESCE((SELECT SUM(amount) FROM credit_ledger), 0) AS outstanding_credits
       FROM subscriptions s
       JOIN plans p ON p.id = s.plan_id`,
    ),
    query(
      `SELECT j.id, j.user_id, u.email, j.title, j.film_type,
              j.error_code, j.error_message, j.updated_at
       FROM jobs j
       JOIN users u ON u.id = j.user_id
       WHERE j.status = 'error' AND j.deleted_at IS NULL
       ORDER BY j.updated_at DESC LIMIT 8`,
    ),
  ]);
  return {
    users: {
      total: Number(users.total_users || 0),
      active: Number(users.active_users || 0),
      administrators: Number(users.administrators || 0),
      new30d: Number(users.new_users_30d || 0),
    },
    jobs: {
      total: Number(jobs.total_jobs || 0),
      completed: Number(jobs.completed_jobs || 0),
      failed: Number(jobs.failed_jobs || 0),
      active: Number(jobs.active_jobs || 0),
      jobs30d: Number(jobs.jobs_30d || 0),
      averageRenderSeconds: Number(jobs.avg_render_seconds || 0),
    },
    financial: {
      mrrCents: Number(financial.mrr_cents || 0),
      activeSubscriptions: Number(financial.active_subscriptions || 0),
      providerCostUsd: Number(financial.provider_cost_usd || 0),
      outstandingCredits: Number(financial.outstanding_credits || 0),
    },
    recentErrors: recentErrors.map((row) => ({
      id: row.id,
      userId: row.user_id,
      userEmail: row.email,
      title: row.title,
      filmType: row.film_type,
      errorCode: row.error_code,
      errorMessage: row.error_message,
      updatedAt: row.updated_at,
    })),
  };
}

export async function listAdminUsers({ search = "", limit = 50, offset = 0 } = {}) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 50));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const term = `%${String(search).trim().slice(0, 160)}%`;
  const rows = await query(
    `SELECT u.id, u.email, u.display_name, u.role, u.status,
            u.email_verified_at, u.last_login_at, u.created_at,
            p.code AS plan_code, p.name AS plan_name,
            COALESCE((SELECT SUM(cl.amount) FROM credit_ledger cl WHERE cl.user_id = u.id), 0) AS credit_balance,
            (SELECT COUNT(*) FROM jobs j WHERE j.user_id = u.id AND j.deleted_at IS NULL) AS job_count
     FROM users u
     JOIN plans p ON p.id = u.plan_id
     WHERE u.status != 'deleted'
       AND (:empty = 1 OR u.email LIKE :term OR u.display_name LIKE :term)
     ORDER BY u.created_at DESC
     LIMIT ${safeLimit} OFFSET ${safeOffset}`,
    { empty: String(search).trim() ? 0 : 1, term },
  );
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    emailVerifiedAt: row.email_verified_at,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    plan: { code: row.plan_code, name: row.plan_name },
    creditBalance: Number(row.credit_balance || 0),
    jobCount: Number(row.job_count || 0),
    unlimited: row.role === "admin",
  }));
}

export async function listAdminJobs({ status = null, limit = 50, offset = 0 } = {}) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 50));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const rows = await query(
    `SELECT j.id, j.user_id, u.email, j.title, j.film_type,
            j.aspect_ratio, j.quality_tier, j.status, j.stage, j.progress,
            j.estimated_cost_usd, j.actual_cost_usd, j.estimated_credits,
            j.charged_credits, j.error_code, j.created_at, j.updated_at
     FROM jobs j
     JOIN users u ON u.id = j.user_id
     WHERE j.deleted_at IS NULL
       AND (:status IS NULL OR j.status = :status)
     ORDER BY j.created_at DESC
     LIMIT ${safeLimit} OFFSET ${safeOffset}`,
    { status },
  );
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    userEmail: row.email,
    title: row.title,
    filmType: row.film_type,
    aspectRatio: row.aspect_ratio,
    qualityTier: row.quality_tier,
    status: row.status,
    stage: row.stage,
    progress: Number(row.progress),
    estimatedCostUsd: Number(row.estimated_cost_usd || 0),
    actualCostUsd: Number(row.actual_cost_usd || 0),
    estimatedCredits: Number(row.estimated_credits || 0),
    chargedCredits: Number(row.charged_credits || 0),
    errorCode: row.error_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function changeUserStatus({ actorUserId, userId, status }) {
  if (actorUserId === userId && status !== "active") return false;
  const result = await query(
    `UPDATE users
     SET status = :status
     WHERE id = :userId AND status != 'deleted'`,
    { userId, status },
  );
  if (result.affectedRows === 1 && status !== "active") {
    await query(
      `UPDATE sessions SET revoked_at = UTC_TIMESTAMP(3), revoke_reason = 'account_status_changed'
       WHERE user_id = :userId AND revoked_at IS NULL`,
      { userId },
    );
  }
  return result.affectedRows === 1;
}

export async function changeUserRole({ actorUserId, userId, role }) {
  if (actorUserId === userId && role !== "admin") return false;
  return withTransaction(async (connection) => {
    if (role !== "admin") {
      const [[admins]] = await connection.execute(
        `SELECT COUNT(*) AS count FROM users
         WHERE role = 'admin' AND status = 'active' FOR UPDATE`,
      );
      const [[target]] = await connection.execute(
        `SELECT role FROM users WHERE id = ? LIMIT 1 FOR UPDATE`,
        [userId],
      );
      if (target?.role === "admin" && Number(admins.count) <= 1) return false;
    }
    const [result] = await connection.execute(
      `UPDATE users SET role = ? WHERE id = ? AND status != 'deleted'`,
      [role, userId],
    );
    return result.affectedRows === 1;
  });
}

export async function adjustUserCredits({ actorUserId, userId, amount, reason }) {
  const value = Number(amount);
  if (!Number.isInteger(value) || value === 0 || Math.abs(value) > 100000) {
    return false;
  }
  await query(
    `INSERT INTO credit_ledger (
      id, user_id, amount, entry_type, reference_type, reference_id,
      idempotency_key, description, metadata, created_by_user_id
    ) VALUES (
      :id, :userId, :amount, 'adjustment', 'admin', :actorUserId,
      :idempotencyKey, :reason, :metadata, :actorUserId
    )`,
    {
      id: crypto.randomUUID(),
      userId,
      amount: value,
      actorUserId,
      idempotencyKey: `admin:${actorUserId}:${crypto.randomUUID()}`,
      reason: String(reason).trim().slice(0, 500),
      metadata: stringifyJson({ actorUserId }),
    },
  );
  return true;
}
