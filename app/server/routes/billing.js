import express from "express";
import { z } from "zod";
import {
  createPayPalSubscription,
  getBillingOverview,
  processPayPalWebhook,
} from "../services/billing-service.js";
import {
  requireAuth,
  requireCsrf,
  requireVerifiedUser,
} from "../middleware/auth.js";

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function createBillingRouter() {
  const router = express.Router();

  router.get(
    "/overview",
    requireAuth,
    asyncRoute(async (req, res) => {
      res.json(await getBillingOverview(req.user));
    }),
  );

  router.post(
    "/subscribe",
    requireVerifiedUser,
    requireCsrf,
    asyncRoute(async (req, res) => {
      const parsed = z
        .object({ planCode: z.enum(["starter", "creator", "agency"]) })
        .safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: "INVALID_PLAN", message: "Choose a valid subscription plan." },
        });
        return;
      }
      const result = await createPayPalSubscription(req.user, parsed.data.planCode);
      res.status(result.ok ? 201 : 400).json(result);
    }),
  );

  router.post(
    "/paypal/webhook",
    asyncRoute(async (req, res) => {
      if (!req.body?.id || !req.body?.event_type) {
        res.status(400).json({
          error: { code: "INVALID_WEBHOOK", message: "Invalid PayPal event." },
        });
        return;
      }
      await processPayPalWebhook(req.headers, req.body);
      res.status(200).json({ ok: true });
    }),
  );

  return router;
}
