import crypto from "crypto";
import {
  affectedRows,
  parseJson,
  query,
  queryOne,
  stringifyJson,
  withTransaction,
} from "../pool.js";

export function normalizeEmail(value) {
  return String(value || "").trim().normalize("NFKC").toLowerCase();
}

function mapPlan(row) {
  if (!row?.plan_id) return null;
  return {
    id: row.plan_id,
    code: row.plan_code,
    name: row.plan_name,
    priceMonthlyCents: Number(row.plan_price_monthly_cents || 0),
    monthlyCredits: Number(row.plan_monthly_credits || 0),
    maxVideoMinutes: Number(row.plan_max_video_minutes || 0),
    maxConcurrentJobs: Number(row.plan_max_concurrent_jobs || 0),
    watermarkRequired: Boolean(row.plan_watermark_required),
    entitlements: parseJson(row.plan_entitlements, {}),
  };
}

export function toPublicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    emailVerified: Boolean(row.email_verified_at),
    emailVerifiedAt: row.email_verified_at,
    trialStartedAt: row.trial_started_at,
    trialUsedAt: row.trial_used_at,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    plan: mapPlan(row),
    unlimited: row.role === "admin",
  };
}

const USER_WITH_PLAN_SQL = `
  SELECT
    u.*,
    p.id AS plan_id,
    p.code AS plan_code,
    p.name AS plan_name,
    p.price_monthly_cents AS plan_price_monthly_cents,
    p.monthly_credits AS plan_monthly_credits,
    p.max_video_minutes AS plan_max_video_minutes,
    p.max_concurrent_jobs AS plan_max_concurrent_jobs,
    p.watermark_required AS plan_watermark_required,
    p.entitlements AS plan_entitlements
  FROM users u
  JOIN plans p ON p.id = u.plan_id
`;

export async function findUserById(userId, { includePassword = false } = {}) {
  const row = await queryOne(`${USER_WITH_PLAN_SQL} WHERE u.id = :userId LIMIT 1`, {
    userId,
  });
  if (!row) return null;
  return includePassword ? row : toPublicUser(row);
}

export async function findUserByEmail(email, { includePassword = false } = {}) {
  const emailNormalized = normalizeEmail(email);
  const row = await queryOne(
    `${USER_WITH_PLAN_SQL} WHERE u.email_normalized = :emailNormalized LIMIT 1`,
    { emailNormalized },
  );
  if (!row) return null;
  return includePassword ? row : toPublicUser(row);
}

export async function findPlanByCode(code) {
  const row = await queryOne(
    `SELECT * FROM plans WHERE code = :code AND enabled = TRUE LIMIT 1`,
    { code },
  );
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    priceMonthlyCents: Number(row.price_monthly_cents),
    monthlyCredits: Number(row.monthly_credits),
    maxVideoMinutes: Number(row.max_video_minutes),
    maxConcurrentJobs: Number(row.max_concurrent_jobs),
    watermarkRequired: Boolean(row.watermark_required),
    entitlements: parseJson(row.entitlements, {}),
  };
}

export async function listEnabledPlans() {
  const rows = await query(
    `SELECT * FROM plans WHERE enabled = TRUE ORDER BY price_monthly_cents ASC`,
  );
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    priceMonthlyCents: Number(row.price_monthly_cents),
    monthlyCredits: Number(row.monthly_credits),
    maxVideoMinutes: Number(row.max_video_minutes),
    maxConcurrentJobs: Number(row.max_concurrent_jobs),
    watermarkRequired: Boolean(row.watermark_required),
    entitlements: parseJson(row.entitlements, {}),
  }));
}

export async function createUser({
  email,
  passwordHash,
  displayName,
  role = "user",
  status = "pending_verification",
  planCode = "trial",
}) {
  const userId = crypto.randomUUID();
  const emailNormalized = normalizeEmail(email);

  return withTransaction(async (connection) => {
    const [[plan]] = await connection.execute(
      `SELECT id, monthly_credits FROM plans WHERE code = ? AND enabled = TRUE LIMIT 1 FOR UPDATE`,
      [planCode],
    );
    if (!plan) throw new Error(`Plan ${planCode} is not available.`);

    await connection.execute(
      `INSERT INTO users (
        id, email, email_normalized, password_hash, display_name, role, status, plan_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        emailNormalized,
        emailNormalized,
        passwordHash,
        displayName,
        role,
        status,
        plan.id,
      ],
    );

    if (Number(plan.monthly_credits) > 0) {
      await connection.execute(
        `INSERT INTO credit_ledger (
          id, user_id, amount, entry_type, reference_type, reference_id,
          idempotency_key, description
        ) VALUES (?, ?, ?, 'trial_grant', 'user', ?, ?, ?)`,
        [
          crypto.randomUUID(),
          userId,
          Number(plan.monthly_credits),
          userId,
          `trial-grant:${userId}`,
          "Initial trial credits",
        ],
      );
    }

    return userId;
  });
}

export async function markEmailVerified(userId) {
  const result = await query(
    `UPDATE users
     SET status = IF(status = 'pending_verification', 'active', status),
         email_verified_at = COALESCE(email_verified_at, UTC_TIMESTAMP(3))
     WHERE id = :userId AND status NOT IN ('deleted', 'suspended')`,
    { userId },
  );
  return affectedRows(result) === 1;
}

export async function updateLastLogin(userId) {
  await query(
    `UPDATE users SET last_login_at = UTC_TIMESTAMP(3) WHERE id = :userId`,
    { userId },
  );
}

export async function updatePassword(userId, passwordHash) {
  return withTransaction(async (connection) => {
    const [result] = await connection.execute(
      `UPDATE users
       SET password_hash = ?, password_changed_at = UTC_TIMESTAMP(3)
       WHERE id = ? AND status NOT IN ('deleted', 'suspended')`,
      [passwordHash, userId],
    );
    if (result.affectedRows !== 1) return false;
    await connection.execute(
      `UPDATE sessions
       SET revoked_at = UTC_TIMESTAMP(3), revoke_reason = 'password_changed'
       WHERE user_id = ? AND revoked_at IS NULL`,
      [userId],
    );
    return true;
  });
}

export async function setUserRole(actorUserId, targetUserId, role) {
  return withTransaction(async (connection) => {
    const [result] = await connection.execute(
      `UPDATE users SET role = ? WHERE id = ? AND status != 'deleted'`,
      [role, targetUserId],
    );
    if (result.affectedRows !== 1) return false;
    await connection.execute(
      `UPDATE sessions
       SET revoked_at = UTC_TIMESTAMP(3), revoke_reason = 'role_changed'
       WHERE user_id = ? AND revoked_at IS NULL`,
      [targetUserId],
    );
    await connection.execute(
      `INSERT INTO audit_logs (
        actor_user_id, target_user_id, action, resource_type, resource_id, outcome
      ) VALUES (?, ?, 'admin.user.role_changed', 'user', ?, 'success')`,
      [actorUserId, targetUserId, targetUserId],
    );
    return true;
  });
}

export async function createSession({
  userId,
  tokenHash,
  csrfHash,
  userAgentHash = null,
  ipPrefix = null,
  idleExpiresAt,
  absoluteExpiresAt,
}) {
  const id = crypto.randomUUID();
  await query(
    `INSERT INTO sessions (
      id, user_id, token_hash, csrf_hash, user_agent_hash, ip_prefix,
      idle_expires_at, absolute_expires_at
    ) VALUES (
      :id, :userId, :tokenHash, :csrfHash, :userAgentHash, :ipPrefix,
      :idleExpiresAt, :absoluteExpiresAt
    )`,
    {
      id,
      userId,
      tokenHash,
      csrfHash,
      userAgentHash,
      ipPrefix,
      idleExpiresAt,
      absoluteExpiresAt,
    },
  );
  return id;
}

export async function findSessionByTokenHash(tokenHash) {
  const row = await queryOne(
    `SELECT
       s.id AS session_id,
       s.user_id AS session_user_id,
       s.csrf_hash,
       s.last_seen_at,
       s.idle_expires_at,
       s.absolute_expires_at,
       s.user_agent_hash,
       s.ip_prefix,
       u.*,
       p.id AS plan_id,
       p.code AS plan_code,
       p.name AS plan_name,
       p.price_monthly_cents AS plan_price_monthly_cents,
       p.monthly_credits AS plan_monthly_credits,
       p.max_video_minutes AS plan_max_video_minutes,
       p.max_concurrent_jobs AS plan_max_concurrent_jobs,
       p.watermark_required AS plan_watermark_required,
       p.entitlements AS plan_entitlements
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     JOIN plans p ON p.id = u.plan_id
     WHERE s.token_hash = :tokenHash
       AND s.revoked_at IS NULL
       AND s.idle_expires_at > UTC_TIMESTAMP(3)
       AND s.absolute_expires_at > UTC_TIMESTAMP(3)
       AND u.status IN ('pending_verification', 'active')
     LIMIT 1`,
    { tokenHash },
  );
  if (!row) return null;
  return {
    id: row.session_id,
    csrfHash: row.csrf_hash,
    lastSeenAt: row.last_seen_at,
    idleExpiresAt: row.idle_expires_at,
    absoluteExpiresAt: row.absolute_expires_at,
    userAgentHash: row.user_agent_hash,
    ipPrefix: row.ip_prefix,
    user: toPublicUser(row),
  };
}

export async function touchSession(sessionId, idleExpiresAt) {
  await query(
    `UPDATE sessions
     SET last_seen_at = UTC_TIMESTAMP(3),
         idle_expires_at = LEAST(:idleExpiresAt, absolute_expires_at)
     WHERE id = :sessionId AND revoked_at IS NULL`,
    { sessionId, idleExpiresAt },
  );
}

export async function revokeSession(sessionId, reason = "logout") {
  const result = await query(
    `UPDATE sessions
     SET revoked_at = UTC_TIMESTAMP(3), revoke_reason = :reason
     WHERE id = :sessionId AND revoked_at IS NULL`,
    { sessionId, reason },
  );
  return affectedRows(result) === 1;
}

export async function revokeAllSessions(userId, reason = "logout_all", exceptId = null) {
  const result = await query(
    `UPDATE sessions
     SET revoked_at = UTC_TIMESTAMP(3), revoke_reason = :reason
     WHERE user_id = :userId
       AND revoked_at IS NULL
       AND (:exceptId IS NULL OR id != :exceptId)`,
    { userId, reason, exceptId },
  );
  return affectedRows(result);
}

export async function listSessions(userId) {
  return query(
    `SELECT id, last_seen_at, idle_expires_at, absolute_expires_at, created_at,
            user_agent_hash, ip_prefix
     FROM sessions
     WHERE user_id = :userId
       AND revoked_at IS NULL
       AND absolute_expires_at > UTC_TIMESTAMP(3)
     ORDER BY last_seen_at DESC`,
    { userId },
  );
}

export async function createAuthToken({
  userId,
  purpose,
  tokenHash,
  expiresAt,
  pendingValue = null,
}) {
  const id = crypto.randomUUID();
  await withTransaction(async (connection) => {
    await connection.execute(
      `UPDATE auth_tokens
       SET consumed_at = UTC_TIMESTAMP(3)
       WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL`,
      [userId, purpose],
    );
    await connection.execute(
      `INSERT INTO auth_tokens (
        id, user_id, purpose, token_hash, pending_value, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, userId, purpose, tokenHash, pendingValue, expiresAt],
    );
  });
  return id;
}

export async function consumeAuthToken({ tokenHash, purpose, work }) {
  return withTransaction(async (connection) => {
    const [[token]] = await connection.execute(
      `SELECT * FROM auth_tokens
       WHERE token_hash = ? AND purpose = ? AND consumed_at IS NULL
         AND expires_at > UTC_TIMESTAMP(3)
       LIMIT 1 FOR UPDATE`,
      [tokenHash, purpose],
    );
    if (!token) return null;

    const value = await work(connection, token);
    await connection.execute(
      `UPDATE auth_tokens SET consumed_at = UTC_TIMESTAMP(3) WHERE id = ?`,
      [token.id],
    );
    return value;
  });
}

export async function enqueueEmail({
  userId = null,
  template,
  recipient,
  subject,
  payload,
}) {
  const id = crypto.randomUUID();
  await query(
    `INSERT INTO email_outbox (
      id, user_id, template, recipient, subject, payload
    ) VALUES (:id, :userId, :template, :recipient, :subject, :payload)`,
    {
      id,
      userId,
      template,
      recipient,
      subject,
      payload: stringifyJson(payload),
    },
  );
  return id;
}

export async function rotateSessionCsrf(sessionId, csrfHash) {
  const result = await query(
    `UPDATE sessions
     SET csrf_hash = :csrfHash, last_seen_at = UTC_TIMESTAMP(3)
     WHERE id = :sessionId AND revoked_at IS NULL
       AND idle_expires_at > UTC_TIMESTAMP(3)
       AND absolute_expires_at > UTC_TIMESTAMP(3)`,
    { sessionId, csrfHash },
  );
  return affectedRows(result) === 1;
}
