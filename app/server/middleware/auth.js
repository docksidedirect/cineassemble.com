import { config } from "../config.js";
import {
  findSessionByTokenHash,
  touchSession,
} from "../db/repositories/users.js";
import { safeEqualHash, tokenHash } from "../security/tokens.js";

function unauthorized(res, code = "AUTHENTICATION_REQUIRED", message = "Sign in to continue.") {
  return res.status(401).json({ error: { code, message } });
}

export function requestContext(req) {
  return {
    requestId: req.id || null,
    ip: req.ip || req.socket?.remoteAddress || "",
    userAgent: req.get?.("user-agent") || "",
  };
}

export async function authenticateSession(req, res, next) {
  try {
    const rawToken = req.cookies?.[config.cookieName];
    if (!rawToken) return next();
    const session = await findSessionByTokenHash(tokenHash(rawToken));
    if (!session) {
      res.clearCookie(config.cookieName, {
        httpOnly: true,
        secure: config.cookieSecure,
        sameSite: "lax",
        path: "/",
      });
      return next();
    }
    req.auth = session;
    req.user = session.user;
    const lastSeen = new Date(session.lastSeenAt).getTime();
    if (!Number.isFinite(lastSeen) || Date.now() - lastSeen > 5 * 60 * 1000) {
      const idleExpiresAt = new Date(
        Date.now() + config.sessionIdleHours * 60 * 60 * 1000,
      );
      touchSession(session.id, idleExpiresAt).catch(() => {});
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireAuth(req, res, next) {
  if (!req.auth || !req.user) return unauthorized(res);
  return next();
}

export function requireVerifiedUser(req, res, next) {
  if (!req.auth || !req.user) return unauthorized(res);
  if (!req.user.emailVerified || req.user.status !== "active") {
    return res.status(403).json({
      error: {
        code: "EMAIL_VERIFICATION_REQUIRED",
        message: "Verify your email before using the film studio.",
      },
    });
  }
  return next();
}

export function requireAdmin(req, res, next) {
  if (!req.auth || !req.user) return unauthorized(res);
  if (req.user.role !== "admin") {
    return res.status(403).json({
      error: { code: "ADMIN_REQUIRED", message: "Administrator access is required." },
    });
  }
  return next();
}

export function requireCsrf(req, res, next) {
  if (!req.auth) return unauthorized(res);
  const token = req.get("x-csrf-token");
  if (!safeEqualHash(req.auth.csrfHash, token)) {
    return res.status(403).json({
      error: {
        code: "CSRF_VALIDATION_FAILED",
        message: "Your security token expired. Refresh the page and try again.",
      },
    });
  }
  const origin = req.get("origin");
  if (origin && !config.allowedOrigins.includes(origin.replace(/\/$/, ""))) {
    return res.status(403).json({
      error: { code: "ORIGIN_NOT_ALLOWED", message: "This request origin is not allowed." },
    });
  }
  return next();
}
