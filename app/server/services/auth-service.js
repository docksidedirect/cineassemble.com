import argon2 from "argon2";
import { config } from "../config.js";
import {
  consumeAuthToken,
  createAuthToken,
  createSession,
  createUser,
  enqueueEmail,
  findUserByEmail,
  findUserById,
  listSessions,
  normalizeEmail,
  revokeAllSessions,
  revokeSession,
  rotateSessionCsrf,
  updateLastLogin,
} from "../db/repositories/users.js";
import { writeAudit } from "../db/repositories/audit.js";
import {
  auditIpHash,
  clientIpPrefix,
  randomToken,
  sessionSecrets,
  tokenHash,
  userAgentHash,
} from "../security/tokens.js";

const ARGON_OPTIONS = Object.freeze({
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
});

let dummyHashPromise;
const commonPasswords = new Set([
  "password",
  "password123",
  "123456789",
  "qwerty123",
  "letmein123",
  "admin123",
  "cineassemble",
]);

function passwordError(password, email = "") {
  const value = String(password || "");
  if (value.length < 12 || value.length > 128) {
    return "Use a password between 12 and 128 characters.";
  }
  if (/\u0000/.test(value)) return "The password contains an unsupported character.";
  if (commonPasswords.has(value.toLowerCase())) return "Choose a less common password.";
  const localPart = normalizeEmail(email).split("@")[0];
  if (localPart.length >= 4 && value.toLowerCase().includes(localPart)) {
    return "The password must not contain your email name.";
  }
  return null;
}

function cleanDisplayName(value) {
  return String(value || "")
    .trim()
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, 120);
}

async function hashPassword(password) {
  return argon2.hash(String(password), ARGON_OPTIONS);
}

async function verifyPassword(hash, password) {
  try {
    return await argon2.verify(hash, String(password), ARGON_OPTIONS);
  } catch {
    return false;
  }
}

function addHours(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function addDays(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function authMetadata(context = {}) {
  return {
    requestId: context.requestId || null,
    ipHash: auditIpHash(context.ip),
    userAgentHash: userAgentHash(context.userAgent),
  };
}

async function queueVerification(userId, email) {
  const rawToken = randomToken(32);
  await createAuthToken({
    userId,
    purpose: "verify_email",
    tokenHash: tokenHash(rawToken),
    expiresAt: addHours(config.verifyEmailHours),
  });
  const verificationUrl = new URL("/verify-email", config.appUrl);
  verificationUrl.searchParams.set("token", rawToken);
  await enqueueEmail({
    userId,
    template: "verify_email",
    recipient: email,
    subject: "Verify your CineAssemble account",
    payload: {
      displayName: (await findUserById(userId))?.displayName || "there",
      verificationUrl: verificationUrl.toString(),
      expiresHours: config.verifyEmailHours,
    },
  });
}

export async function registerAccount({ email, password, displayName }, context = {}) {
  const normalizedEmail = normalizeEmail(email);
  const cleanName = cleanDisplayName(displayName);
  const invalidPassword = passwordError(password, normalizedEmail);
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail) || normalizedEmail.length > 320) {
    return { ok: false, error: { code: "INVALID_EMAIL", message: "Enter a valid email address." } };
  }
  if (cleanName.length < 2) {
    return { ok: false, error: { code: "INVALID_NAME", message: "Enter your name." } };
  }
  if (invalidPassword) {
    return { ok: false, error: { code: "WEAK_PASSWORD", message: invalidPassword } };
  }

  const existing = await findUserByEmail(normalizedEmail, { includePassword: true });
  if (existing) {
    await writeAudit({
      action: "auth.register.duplicate",
      targetUserId: existing.id,
      outcome: "denied",
      ...authMetadata(context),
    });
    return {
      ok: true,
      message: "If the address can be registered, verification instructions will arrive shortly.",
    };
  }

  const passwordHash = await hashPassword(password);
  let userId;
  try {
    userId = await createUser({
      email: normalizedEmail,
      passwordHash,
      displayName: cleanName,
      role: "user",
      status: "pending_verification",
      planCode: "trial",
    });
  } catch (error) {
    if (error?.code === "ER_DUP_ENTRY") {
      return {
        ok: true,
        message: "If the address can be registered, verification instructions will arrive shortly.",
      };
    }
    throw error;
  }
  await queueVerification(userId, normalizedEmail);
  await writeAudit({
    targetUserId: userId,
    action: "auth.register",
    resourceType: "user",
    resourceId: userId,
    outcome: "success",
    ...authMetadata(context),
  });
  return {
    ok: true,
    message: "Check your email to verify your account before signing in.",
  };
}

export async function resendVerification(email, context = {}) {
  const user = await findUserByEmail(email, { includePassword: true });
  if (user && user.status === "pending_verification") {
    await queueVerification(user.id, user.email);
    await writeAudit({
      targetUserId: user.id,
      action: "auth.verification.resent",
      outcome: "success",
      ...authMetadata(context),
    });
  }
  return {
    ok: true,
    message: "If verification is available for that address, a new email will arrive shortly.",
  };
}

export async function verifyEmail(rawToken, context = {}) {
  const userId = await consumeAuthToken({
    tokenHash: tokenHash(rawToken),
    purpose: "verify_email",
    work: async (connection, token) => {
      const [result] = await connection.execute(
        `UPDATE users
         SET status = IF(status = 'pending_verification', 'active', status),
             email_verified_at = COALESCE(email_verified_at, UTC_TIMESTAMP(3))
         WHERE id = ? AND status NOT IN ('deleted', 'suspended')`,
        [token.user_id],
      );
      return result.affectedRows === 1 ? token.user_id : null;
    },
  });
  if (!userId) {
    return {
      ok: false,
      error: {
        code: "INVALID_OR_EXPIRED_TOKEN",
        message: "This verification link is invalid or has expired.",
      },
    };
  }
  await writeAudit({
    targetUserId: userId,
    action: "auth.email_verified",
    outcome: "success",
    ...authMetadata(context),
  });
  return { ok: true, message: "Your email is verified. You can now sign in." };
}

async function establishSession(user, context) {
  const secret = sessionSecrets();
  const idleExpiresAt = addHours(config.sessionIdleHours);
  const absoluteExpiresAt = addDays(config.sessionAbsoluteDays);
  const sessionId = await createSession({
    userId: user.id,
    tokenHash: secret.tokenHash,
    csrfHash: secret.csrfHash,
    userAgentHash: userAgentHash(context.userAgent),
    ipPrefix: clientIpPrefix(context.ip),
    idleExpiresAt,
    absoluteExpiresAt,
  });
  return {
    sessionId,
    sessionToken: secret.token,
    csrfToken: secret.csrf,
    idleExpiresAt,
    absoluteExpiresAt,
  };
}

export async function loginAccount({ email, password }, context = {}) {
  const user = await findUserByEmail(email, { includePassword: true });
  if (!dummyHashPromise) dummyHashPromise = hashPassword(randomToken(24));
  const hash = user?.password_hash || (await dummyHashPromise);
  const passwordValid = await verifyPassword(hash, password);
  if (!user || !passwordValid || !["pending_verification", "active"].includes(user.status)) {
    await writeAudit({
      targetUserId: user?.id || null,
      action: "auth.login",
      outcome: "denied",
      ...authMetadata(context),
    });
    return {
      ok: false,
      error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." },
    };
  }
  if (!user.email_verified_at || user.status === "pending_verification") {
    return {
      ok: false,
      error: {
        code: "EMAIL_NOT_VERIFIED",
        message: "Verify your email before signing in.",
      },
    };
  }

  const publicUser = await findUserById(user.id);
  const session = await establishSession(publicUser, context);
  await updateLastLogin(user.id);
  await writeAudit({
    actorUserId: user.id,
    targetUserId: user.id,
    action: "auth.login",
    resourceType: "session",
    resourceId: session.sessionId,
    outcome: "success",
    ...authMetadata(context),
  });
  return { ok: true, user: publicUser, session };
}

export async function logoutSession(sessionId, userId, context = {}) {
  await revokeSession(sessionId, "logout");
  await writeAudit({
    actorUserId: userId,
    targetUserId: userId,
    action: "auth.logout",
    resourceType: "session",
    resourceId: sessionId,
    outcome: "success",
    ...authMetadata(context),
  });
  return { ok: true };
}

export async function logoutOtherSessions(sessionId, userId, context = {}) {
  const revoked = await revokeAllSessions(userId, "logout_other_sessions", sessionId);
  await writeAudit({
    actorUserId: userId,
    targetUserId: userId,
    action: "auth.sessions.revoked",
    outcome: "success",
    metadata: { revoked },
    ...authMetadata(context),
  });
  return { ok: true, revoked };
}

export async function getAccountSessions(userId, currentSessionId) {
  const sessions = await listSessions(userId);
  return sessions.map((session) => ({
    id: session.id,
    current: session.id === currentSessionId,
    lastSeenAt: session.last_seen_at,
    idleExpiresAt: session.idle_expires_at,
    absoluteExpiresAt: session.absolute_expires_at,
    createdAt: session.created_at,
  }));
}

export async function rotateCsrf(sessionId) {
  const csrfToken = randomToken(32);
  const changed = await rotateSessionCsrf(sessionId, tokenHash(csrfToken));
  return changed ? csrfToken : null;
}

export async function requestPasswordReset(email, context = {}) {
  const user = await findUserByEmail(email, { includePassword: true });
  if (user && user.status === "active" && user.email_verified_at) {
    const rawToken = randomToken(32);
    await createAuthToken({
      userId: user.id,
      purpose: "reset_password",
      tokenHash: tokenHash(rawToken),
      expiresAt: new Date(Date.now() + config.passwordResetMinutes * 60 * 1000),
    });
    const resetUrl = new URL("/reset-password", config.appUrl);
    resetUrl.searchParams.set("token", rawToken);
    await enqueueEmail({
      userId: user.id,
      template: "reset_password",
      recipient: user.email,
      subject: "Reset your CineAssemble password",
      payload: {
        displayName: user.display_name,
        resetUrl: resetUrl.toString(),
        expiresMinutes: config.passwordResetMinutes,
      },
    });
    await writeAudit({
      targetUserId: user.id,
      action: "auth.password_reset.requested",
      outcome: "success",
      ...authMetadata(context),
    });
  }
  return {
    ok: true,
    message: "If the account exists, password-reset instructions will arrive shortly.",
  };
}

export async function resetPassword({ token, password }, context = {}) {
  const invalidPassword = passwordError(password);
  if (invalidPassword) {
    return { ok: false, error: { code: "WEAK_PASSWORD", message: invalidPassword } };
  }
  const passwordHash = await hashPassword(password);
  const userId = await consumeAuthToken({
    tokenHash: tokenHash(token),
    purpose: "reset_password",
    work: async (connection, authToken) => {
      const [result] = await connection.execute(
        `UPDATE users
         SET password_hash = ?, password_changed_at = UTC_TIMESTAMP(3)
         WHERE id = ? AND status = 'active'`,
        [passwordHash, authToken.user_id],
      );
      if (result.affectedRows !== 1) return null;
      await connection.execute(
        `UPDATE sessions
         SET revoked_at = UTC_TIMESTAMP(3), revoke_reason = 'password_reset'
         WHERE user_id = ? AND revoked_at IS NULL`,
        [authToken.user_id],
      );
      return authToken.user_id;
    },
  });
  if (!userId) {
    return {
      ok: false,
      error: {
        code: "INVALID_OR_EXPIRED_TOKEN",
        message: "This password-reset link is invalid or has expired.",
      },
    };
  }
  await writeAudit({
    targetUserId: userId,
    action: "auth.password_reset.completed",
    outcome: "success",
    ...authMetadata(context),
  });
  return { ok: true, message: "Your password has been reset. Sign in again." };
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "lax",
    path: "/",
    maxAge: config.sessionAbsoluteDays * 24 * 60 * 60 * 1000,
  };
}
