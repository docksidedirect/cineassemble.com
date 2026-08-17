import crypto from "crypto";
import { query, queryOne, withTransaction } from "../pool.js";
import { queueApprovedJob } from "./jobs.js";

export async function getCreditBalance(userId) {
  const row = await queryOne(
    `SELECT COALESCE(SUM(amount), 0) AS balance
     FROM credit_ledger WHERE user_id = :userId`,
    { userId },
  );
  return Number(row?.balance || 0);
}

export async function getCreditSummary(user) {
  const row = await queryOne(
    `SELECT
       COALESCE(SUM(amount), 0) AS balance,
       COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS granted,
       ABS(COALESCE(SUM(CASE WHEN entry_type = 'charge' THEN amount ELSE 0 END), 0)) AS spent,
       ABS(COALESCE(SUM(CASE WHEN entry_type = 'reservation' THEN amount ELSE 0 END), 0)) AS reserved
     FROM credit_ledger WHERE user_id = :userId`,
    { userId: user.id },
  );
  return {
    unlimited: user.role === "admin",
    balance: user.role === "admin" ? null : Number(row?.balance || 0),
    granted: Number(row?.granted || 0),
    spent: Number(row?.spent || 0),
    reserved: Number(row?.reserved || 0),
  };
}

export async function listCreditEntries(userId, { limit = 100 } = {}) {
  const safeLimit = Math.max(1, Math.min(250, Number(limit) || 100));
  const rows = await query(
    `SELECT id, amount, entry_type, reference_type, reference_id,
            idempotency_key, description, metadata, created_at
     FROM credit_ledger
     WHERE user_id = :userId
     ORDER BY created_at DESC
     LIMIT ${safeLimit}`,
    { userId },
  );
  return rows.map((row) => ({
    id: row.id,
    amount: Number(row.amount),
    type: row.entry_type,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    idempotencyKey: row.idempotency_key,
    description: row.description,
    metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata,
    createdAt: row.created_at,
  }));
}

export async function reserveCreditsAndQueue(user, jobId) {
  return withTransaction(async (connection) => {
    const [[job]] = await connection.execute(
      `SELECT j.id, j.user_id, j.status, j.estimated_credits, j.script_json,
              j.quality_tier, u.role, u.trial_used_at, p.code AS plan_code
       FROM jobs j
       JOIN users u ON u.id = j.user_id
       JOIN plans p ON p.id = u.plan_id
       WHERE j.id = ? AND j.user_id = ? AND j.deleted_at IS NULL
       LIMIT 1 FOR UPDATE`,
      [jobId, user.id],
    );
    if (!job || job.status !== "draft" || !job.script_json) {
      return { ok: false, code: "JOB_NOT_READY" };
    }

    if (user.role === "admin") {
      const queued = await queueApprovedJob(connection, {
        userId: user.id,
        jobId,
        reservedCredits: 0,
      });
      if (!queued) return { ok: false, code: "JOB_NOT_READY" };
      await connection.execute(
        `INSERT INTO audit_logs (
          actor_user_id, target_user_id, action, resource_type, resource_id,
          outcome, metadata
        ) VALUES (?, ?, 'job.approved.admin_unlimited', 'job', ?, 'success', ?)`,
        [
          user.id,
          user.id,
          jobId,
          JSON.stringify({ estimatedCredits: Number(job.estimated_credits || 0) }),
        ],
      );
      return { ok: true, unlimited: true, reservedCredits: 0 };
    }

    if (job.plan_code === "trial") {
      if (job.trial_used_at) {
        return { ok: false, code: "TRIAL_ALREADY_USED" };
      }
      if (job.quality_tier !== "budget") {
        return { ok: false, code: "TRIAL_BUDGET_ONLY" };
      }
    }

    const [[balanceRow]] = await connection.execute(
      `SELECT COALESCE(SUM(amount), 0) AS balance
       FROM credit_ledger WHERE user_id = ? FOR UPDATE`,
      [user.id],
    );
    const required = Number(job.estimated_credits || 0);
    const balance = Number(balanceRow.balance || 0);
    if (required <= 0 || balance < required) {
      return {
        ok: false,
        code: "INSUFFICIENT_CREDITS",
        required,
        balance,
      };
    }

    await connection.execute(
      `INSERT INTO credit_ledger (
        id, user_id, amount, entry_type, reference_type, reference_id,
        idempotency_key, description
      ) VALUES (?, ?, ?, 'reservation', 'job', ?, ?, ?)`,
      [
        crypto.randomUUID(),
        user.id,
        -required,
        jobId,
        `job:${jobId}:reservation`,
        `Reserved for video generation`,
      ],
    );

    const queued = await queueApprovedJob(connection, {
      userId: user.id,
      jobId,
      reservedCredits: required,
    });
    if (!queued) throw new Error("The job changed while credits were reserved.");
    if (job.plan_code === "trial") {
      await connection.execute(
        `UPDATE users SET trial_used_at = UTC_TIMESTAMP(3)
         WHERE id = ? AND trial_used_at IS NULL`,
        [user.id],
      );
    }
    return {
      ok: true,
      unlimited: false,
      reservedCredits: required,
      balanceAfter: balance - required,
    };
  });
}

export async function settleCompletedJob({
  userId,
  jobId,
  actualCredits,
  actorRole = "user",
}) {
  return withTransaction(async (connection) => {
    const [[job]] = await connection.execute(
      `SELECT reserved_credits, charged_credits
       FROM jobs WHERE id = ? AND user_id = ? LIMIT 1 FOR UPDATE`,
      [jobId, userId],
    );
    if (!job) return false;
    if (actorRole === "admin") return true;

    const reserved = Number(job.reserved_credits || 0);
    const charge = Math.max(0, Math.min(reserved, Math.ceil(actualCredits)));

    if (reserved > 0) {
      await connection.execute(
        `INSERT IGNORE INTO credit_ledger (
          id, user_id, amount, entry_type, reference_type, reference_id,
          idempotency_key, description
        ) VALUES (?, ?, ?, 'refund', 'job', ?, ?, ?)`,
        [
          crypto.randomUUID(),
          userId,
          reserved,
          jobId,
          `job:${jobId}:reservation-release`,
          "Released generation reservation",
        ],
      );
    }
    if (charge > 0) {
      await connection.execute(
        `INSERT IGNORE INTO credit_ledger (
          id, user_id, amount, entry_type, reference_type, reference_id,
          idempotency_key, description
        ) VALUES (?, ?, ?, 'charge', 'job', ?, ?, ?)`,
        [
          crypto.randomUUID(),
          userId,
          -charge,
          jobId,
          `job:${jobId}:charge`,
          "Completed video generation",
        ],
      );
    }
    await connection.execute(
      `UPDATE jobs SET charged_credits = ? WHERE id = ? AND user_id = ?`,
      [charge, jobId, userId],
    );
    return true;
  });
}

export async function refundFailedJob(userId, jobId, reason = "Generation failed") {
  return withTransaction(async (connection) => {
    const [[job]] = await connection.execute(
      `SELECT reserved_credits, charged_credits
       FROM jobs WHERE id = ? AND user_id = ? LIMIT 1 FOR UPDATE`,
      [jobId, userId],
    );
    if (!job || Number(job.charged_credits || 0) > 0) return false;
    const reserved = Number(job.reserved_credits || 0);
    if (reserved <= 0) return true;

    await connection.execute(
      `INSERT IGNORE INTO credit_ledger (
        id, user_id, amount, entry_type, reference_type, reference_id,
        idempotency_key, description
      ) VALUES (?, ?, ?, 'refund', 'job', ?, ?, ?)`,
      [
        crypto.randomUUID(),
        userId,
        reserved,
        jobId,
        `job:${jobId}:failure-refund`,
        reason.slice(0, 255),
      ],
    );
    await connection.execute(
      `UPDATE jobs SET reserved_credits = 0 WHERE id = ? AND user_id = ?`,
      [jobId, userId],
    );
    return true;
  });
}

export async function grantCredits({
  actorUserId,
  targetUserId,
  amount,
  description,
  idempotencyKey,
  type = "adjustment",
  metadata = null,
}) {
  if (!Number.isInteger(amount) || amount === 0) {
    throw new TypeError("Credit adjustment must be a non-zero integer.");
  }
  const result = await query(
    `INSERT INTO credit_ledger (
      id, user_id, amount, entry_type, reference_type, reference_id,
      idempotency_key, description, metadata, created_by_user_id
    ) VALUES (
      :id, :targetUserId, :amount, :type, 'admin', :actorUserId,
      :idempotencyKey, :description, :metadata, :actorUserId
    )`,
    {
      id: crypto.randomUUID(),
      targetUserId,
      amount,
      type,
      actorUserId,
      idempotencyKey,
      description,
      metadata: metadata == null ? null : JSON.stringify(metadata),
    },
  );
  return Number(result.affectedRows || 0) === 1;
}

export async function chargeAndQueueSceneRegeneration({
  user,
  jobId,
  sceneId,
  requiredCredits,
}) {
  return withTransaction(async (connection) => {
    const [[scene]] = await connection.execute(
      `SELECT s.id, s.revision, j.status, j.user_id
       FROM scenes s
       JOIN jobs j ON j.id = s.job_id AND j.user_id = s.user_id
       WHERE s.id = ? AND s.job_id = ? AND s.user_id = ?
         AND j.deleted_at IS NULL
       LIMIT 1 FOR UPDATE`,
      [sceneId, jobId, user.id],
    );
    if (!scene || !["done", "error"].includes(scene.status)) {
      return { ok: false, code: "SCENE_NOT_REGENERATABLE" };
    }

    const nextRevision = Number(scene.revision) + 1;
    if (user.role !== "admin") {
      const [[balanceRow]] = await connection.execute(
        `SELECT COALESCE(SUM(amount), 0) AS balance
         FROM credit_ledger WHERE user_id = ? FOR UPDATE`,
        [user.id],
      );
      const balance = Number(balanceRow.balance || 0);
      if (balance < requiredCredits) {
        return {
          ok: false,
          code: "INSUFFICIENT_CREDITS",
          balance,
          required: requiredCredits,
        };
      }
      await connection.execute(
        `INSERT INTO credit_ledger (
          id, user_id, amount, entry_type, reference_type, reference_id,
          idempotency_key, description, metadata
        ) VALUES (?, ?, ?, 'charge', 'scene', ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          user.id,
          -requiredCredits,
          sceneId,
          `job:${jobId}:scene:${sceneId}:revision:${nextRevision}:charge`,
          `Regenerate scene ${sceneId}`,
          JSON.stringify({ jobId, sceneId, revision: nextRevision }),
        ],
      );
    }

    await connection.execute(
      `UPDATE scenes
       SET revision = ?, status = 'pending',
           image_asset_id = NULL, clip_asset_id = NULL, lipsync_asset_id = NULL,
           error_code = NULL, error_message = NULL
       WHERE id = ? AND job_id = ? AND user_id = ?`,
      [nextRevision, sceneId, jobId, user.id],
    );
    await connection.execute(
      `UPDATE jobs
       SET status = 'queued', stage = 'scene_regeneration', progress = 10,
           final_asset_id = NULL, queue_available_at = UTC_TIMESTAMP(3),
           lease_owner = NULL, lease_expires_at = NULL,
           error_code = NULL, error_message = NULL,
           version = version + 1
       WHERE id = ? AND user_id = ?`,
      [jobId, user.id],
    );
    return {
      ok: true,
      unlimited: user.role === "admin",
      chargedCredits: user.role === "admin" ? 0 : requiredCredits,
      revision: nextRevision,
    };
  });
}
