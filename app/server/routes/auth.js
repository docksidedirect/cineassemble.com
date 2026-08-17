import express from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { config } from "../config.js";
import {
  getAccountSessions,
  loginAccount,
  logoutOtherSessions,
  logoutSession,
  registerAccount,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  rotateCsrf,
  sessionCookieOptions,
  verifyEmail,
} from "../services/auth-service.js";
import {
  requestContext,
  requireAuth,
  requireCsrf,
} from "../middleware/auth.js";
import { getCreditSummary } from "../db/repositories/credits.js";

const credentialsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    error: {
      code: "AUTH_RATE_LIMITED",
      message: "Too many attempts. Wait before trying again.",
    },
  },
});

const recoveryLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  limit: 6,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: {
      code: "RECOVERY_RATE_LIMITED",
      message: "Too many recovery requests. Wait before trying again.",
    },
  },
});

const registerSchema = z.object({
  email: z.string().trim().max(320),
  password: z.string().min(1).max(128),
  displayName: z.string().trim().min(1).max(120),
});
const loginSchema = z.object({
  email: z.string().trim().max(320),
  password: z.string().min(1).max(128),
});
const emailSchema = z.object({ email: z.string().trim().max(320) });
const tokenSchema = z.object({ token: z.string().min(32).max(300) });
const resetSchema = z.object({
  token: z.string().min(32).max(300),
  password: z.string().min(1).max(128),
});

function parseBody(schema, req, res) {
  const parsed = schema.safeParse(req.body);
  if (parsed.success) return parsed.data;
  res.status(400).json({
    error: {
      code: "VALIDATION_FAILED",
      message: "Review the submitted fields and try again.",
      fields: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    },
  });
  return null;
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function createAuthRouter() {
  const router = express.Router();
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  router.post(
    "/register",
    credentialsLimiter,
    asyncRoute(async (req, res) => {
      const body = parseBody(registerSchema, req, res);
      if (!body) return;
      const result = await registerAccount(body, requestContext(req));
      res.status(result.ok ? 202 : 400).json(result);
    }),
  );

  router.post(
    "/login",
    credentialsLimiter,
    asyncRoute(async (req, res) => {
      const body = parseBody(loginSchema, req, res);
      if (!body) return;
      const result = await loginAccount(body, requestContext(req));
      if (!result.ok) {
        res.status(result.error.code === "EMAIL_NOT_VERIFIED" ? 403 : 401).json(result);
        return;
      }
      res.cookie(
        config.cookieName,
        result.session.sessionToken,
        sessionCookieOptions(),
      );
      res.json({
        ok: true,
        user: result.user,
        csrfToken: result.session.csrfToken,
        sessionExpiresAt: result.session.absoluteExpiresAt,
      });
    }),
  );

  router.post(
    "/verify-email",
    recoveryLimiter,
    asyncRoute(async (req, res) => {
      const body = parseBody(tokenSchema, req, res);
      if (!body) return;
      const result = await verifyEmail(body.token, requestContext(req));
      res.status(result.ok ? 200 : 400).json(result);
    }),
  );

  router.post(
    "/resend-verification",
    recoveryLimiter,
    asyncRoute(async (req, res) => {
      const body = parseBody(emailSchema, req, res);
      if (!body) return;
      res.status(202).json(await resendVerification(body.email, requestContext(req)));
    }),
  );

  router.post(
    "/forgot-password",
    recoveryLimiter,
    asyncRoute(async (req, res) => {
      const body = parseBody(emailSchema, req, res);
      if (!body) return;
      res.status(202).json(await requestPasswordReset(body.email, requestContext(req)));
    }),
  );

  router.post(
    "/reset-password",
    recoveryLimiter,
    asyncRoute(async (req, res) => {
      const body = parseBody(resetSchema, req, res);
      if (!body) return;
      const result = await resetPassword(body, requestContext(req));
      res.status(result.ok ? 200 : 400).json(result);
    }),
  );

  router.get(
    "/me",
    requireAuth,
    asyncRoute(async (req, res) => {
      const credits = await getCreditSummary(req.user);
      res.json({ user: req.user, credits });
    }),
  );

  router.get(
    "/csrf",
    requireAuth,
    asyncRoute(async (req, res) => {
      const csrfToken = await rotateCsrf(req.auth.id);
      if (!csrfToken) {
        res.status(401).json({
          error: { code: "SESSION_EXPIRED", message: "Sign in again." },
        });
        return;
      }
      req.auth.csrfHash = null;
      res.json({ csrfToken });
    }),
  );

  router.get(
    "/sessions",
    requireAuth,
    asyncRoute(async (req, res) => {
      res.json({
        sessions: await getAccountSessions(req.user.id, req.auth.id),
      });
    }),
  );

  router.post(
    "/logout",
    requireAuth,
    requireCsrf,
    asyncRoute(async (req, res) => {
      await logoutSession(req.auth.id, req.user.id, requestContext(req));
      res.clearCookie(config.cookieName, sessionCookieOptions());
      res.json({ ok: true });
    }),
  );

  router.post(
    "/logout-others",
    requireAuth,
    requireCsrf,
    asyncRoute(async (req, res) => {
      res.json(
        await logoutOtherSessions(req.auth.id, req.user.id, requestContext(req)),
      );
    }),
  );

  return router;
}
