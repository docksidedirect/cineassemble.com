import express from "express";
import { z } from "zod";
import {
  adjustUserCredits,
  changeUserRole,
  changeUserStatus,
  getAdminDashboard,
  listAdminJobs,
  listAdminUsers,
} from "../db/repositories/admin.js";
import { writeAudit } from "../db/repositories/audit.js";
import {
  requestContext,
  requireAdmin,
  requireCsrf,
} from "../middleware/auth.js";

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function createAdminRouter() {
  const router = express.Router();
  router.use(requireAdmin);

  router.get(
    "/dashboard",
    asyncRoute(async (_req, res) => {
      res.json(await getAdminDashboard());
    }),
  );

  router.get(
    "/users",
    asyncRoute(async (req, res) => {
      res.json({
        users: await listAdminUsers({
          search: req.query.search || "",
          limit: req.query.limit,
          offset: req.query.offset,
        }),
      });
    }),
  );

  router.get(
    "/jobs",
    asyncRoute(async (req, res) => {
      const status = z
        .enum(["draft", "queued", "running", "done", "error", "cancelled"])
        .nullable()
        .catch(null)
        .parse(req.query.status || null);
      res.json({
        jobs: await listAdminJobs({
          status,
          limit: req.query.limit,
          offset: req.query.offset,
        }),
      });
    }),
  );

  router.patch(
    "/users/:userId/status",
    requireCsrf,
    asyncRoute(async (req, res) => {
      const parsed = z
        .object({ status: z.enum(["active", "suspended"]) })
        .safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: "INVALID_STATUS", message: "Choose a valid account status." },
        });
        return;
      }
      const changed = await changeUserStatus({
        actorUserId: req.user.id,
        userId: req.params.userId,
        status: parsed.data.status,
      });
      if (!changed) {
        res.status(409).json({
          error: {
            code: "STATUS_CHANGE_REJECTED",
            message: "The account status could not be changed.",
          },
        });
        return;
      }
      await writeAudit({
        actorUserId: req.user.id,
        targetUserId: req.params.userId,
        action: "admin.user.status_changed",
        resourceType: "user",
        resourceId: req.params.userId,
        metadata: parsed.data,
        ...requestContext(req),
      });
      res.json({ ok: true });
    }),
  );

  router.patch(
    "/users/:userId/role",
    requireCsrf,
    asyncRoute(async (req, res) => {
      const parsed = z.object({ role: z.enum(["user", "admin"]) }).safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: "INVALID_ROLE", message: "Choose a valid account role." },
        });
        return;
      }
      const changed = await changeUserRole({
        actorUserId: req.user.id,
        userId: req.params.userId,
        role: parsed.data.role,
      });
      if (!changed) {
        res.status(409).json({
          error: {
            code: "ROLE_CHANGE_REJECTED",
            message: "The role change was rejected to protect administrator access.",
          },
        });
        return;
      }
      await writeAudit({
        actorUserId: req.user.id,
        targetUserId: req.params.userId,
        action: "admin.user.role_changed",
        resourceType: "user",
        resourceId: req.params.userId,
        metadata: parsed.data,
        ...requestContext(req),
      });
      res.json({ ok: true });
    }),
  );

  router.post(
    "/users/:userId/credits",
    requireCsrf,
    asyncRoute(async (req, res) => {
      const parsed = z
        .object({
          amount: z.number().int().min(-100000).max(100000).refine((value) => value !== 0),
          reason: z.string().trim().min(3).max(500),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: "INVALID_CREDIT_ADJUSTMENT",
            message: "Enter a non-zero credit amount and a clear reason.",
          },
        });
        return;
      }
      const changed = await adjustUserCredits({
        actorUserId: req.user.id,
        userId: req.params.userId,
        ...parsed.data,
      });
      if (!changed) {
        res.status(400).json({
          error: {
            code: "CREDIT_ADJUSTMENT_REJECTED",
            message: "The credit adjustment was rejected.",
          },
        });
        return;
      }
      await writeAudit({
        actorUserId: req.user.id,
        targetUserId: req.params.userId,
        action: "admin.user.credits_adjusted",
        resourceType: "user",
        resourceId: req.params.userId,
        metadata: parsed.data,
        ...requestContext(req),
      });
      res.json({ ok: true });
    }),
  );

  return router;
}
