import express from "express";
import fs from "node:fs/promises";
import { buildProductionConfig } from "../video-types.js";
import { refundFailedJob } from "../db/repositories/credits.js";
import {
  imageUpload,
  ingestImageUpload,
  uploadMiddlewareError,
} from "../media/uploads.js";
import {
  getJobWithScenes,
  listJobs,
  requestCancellation,
  retryJob,
} from "../db/repositories/jobs.js";
import {
  approveProjectDraft,
  createProjectDraft,
  generateScriptPreview,
  getSceneRegenerationEstimate,
  regenerateOneScene,
  updateProjectDraft,
  updateScenePreview,
} from "../services/job-service.js";
import { requireCsrf, requireVerifiedUser } from "../middleware/auth.js";

function asyncRoute(handler) {
  return (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);
}

function normalizeRows(result) {
  if (!result) return [];
  if (Array.isArray(result)) {
    if (result.length === 2 && Array.isArray(result[0])) return result[0];
    return result;
  }
  if (result.rows && Array.isArray(result.rows)) return result.rows;
  return [];
}

function sendResult(res, result, successStatus = 200) {
  if (result.ok) {
    res.status(successStatus).json(result);
    return;
  }
  const code = result.error?.code || "";
  const status =
    code === "INSUFFICIENT_CREDITS"
      ? 402
      : code === "NOT_FOUND" || code === "JOB_NOT_FOUND"
        ? 404
        : code === "VERSION_CONFLICT"
          ? 409
          : 400;
  res.status(status).json(result);
}

function normalizeId(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && typeof value.id === "string") {
    return value.id.trim();
  }
  return "";
}

function normalizeIdArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeId).filter(Boolean))];
}

function normalizeDraftInput(body) {
  const input = body && typeof body === "object" ? body : {};
  return {
    prompt: typeof input.prompt === "string" ? input.prompt.trim() : "",
    filmType: typeof input.filmType === "string" ? input.filmType.trim() : "",
    languageCode:
      typeof input.languageCode === "string" ? input.languageCode.trim() : "",
    aspectRatio:
      typeof input.aspectRatio === "string" ? input.aspectRatio.trim() : "",
    targetMinutes: Number(input.targetMinutes),
    voice: typeof input.voice === "string" ? input.voice.trim() : "",
    qualityTier:
      typeof input.qualityTier === "string" ? input.qualityTier.trim() : "",
    stylePreset:
      typeof input.stylePreset === "string" ? input.stylePreset.trim() : "",
    mode: typeof input.mode === "string" ? input.mode.trim() : "",
    subtitles: Boolean(input.subtitles),
    karaokeCaptions: Boolean(input.karaokeCaptions),
    lipsync: Boolean(input.lipsync),
    productIds: normalizeIdArray(input.productIds),
    referenceIds: normalizeIdArray(input.referenceIds),
  };
}

export function createJobsRouter() {
  const router = express.Router();
  router.use(requireVerifiedUser);

  router.get(
    "/",
    asyncRoute(async (req, res) => {
      res.json({
        jobs: await listJobs(req.user.id, {
          limit: req.query.limit,
          before: req.query.before || null,
        }),
      });
    }),
  );

  router.post(
    "/draft",
    requireCsrf,
    asyncRoute(async (req, res) => {
      const input = normalizeDraftInput(req.body);
      console.log("[POST /draft] normalized body:", {
        filmType: input.filmType,
        productIds: input.productIds,
        referenceIds: input.referenceIds,
        productCount: input.productIds.length,
        referenceCount: input.referenceIds.length,
      });
      const result = await createProjectDraft(req.user, input);
      if (!result.ok) console.error("[POST /draft] rejected:", result.error);
      sendResult(res, result, 201);
    }),
  );

  router.get(
    "/:jobId",
    asyncRoute(async (req, res) => {
      const job = await getJobWithScenes(req.user.id, req.params.jobId);
      if (!job) {
        res.status(404).json({
          error: { code: "JOB_NOT_FOUND", message: "Film project not found." },
        });
        return;
      }
      res.json({ job });
    }),
  );

  router.patch(
    "/:jobId/draft",
    requireCsrf,
    asyncRoute(async (req, res) => {
      const version = Number(req.body?.version);
      const changes = { ...(req.body || {}) };
      delete changes.version;
      sendResult(
        res,
        await updateProjectDraft(req.user, req.params.jobId, version, changes),
      );
    }),
  );

  router.post(
    "/:jobId/script-preview",
    requireCsrf,
    asyncRoute(async (req, res) => {
      sendResult(res, await generateScriptPreview(req.user, req.params.jobId));
    }),
  );

  router.patch(
    "/:jobId/scenes/:sceneId",
    requireCsrf,
    asyncRoute(async (req, res) => {
      sendResult(
        res,
        await updateScenePreview(
          req.user,
          req.params.jobId,
          req.params.sceneId,
          req.body,
        ),
      );
    }),
  );

  router.post(
    "/:jobId/approve",
    requireCsrf,
    asyncRoute(async (req, res) => {
      sendResult(
        res,
        await approveProjectDraft(req.user, req.params.jobId),
        202,
      );
    }),
  );

  router.get(
    "/:jobId/scenes/regeneration-estimate",
    asyncRoute(async (req, res) => {
      const estimate = await getSceneRegenerationEstimate(
        req.user,
        req.params.jobId,
      );
      if (!estimate) {
        res.status(404).json({
          error: { code: "JOB_NOT_FOUND", message: "Film project not found." },
        });
        return;
      }
      res.json({ estimate });
    }),
  );

  router.post(
    "/:jobId/scenes/:sceneId/regenerate",
    requireCsrf,
    asyncRoute(async (req, res) => {
      sendResult(
        res,
        await regenerateOneScene(
          req.user,
          req.params.jobId,
          req.params.sceneId,
        ),
        202,
      );
    }),
  );

  router.post(
    "/:jobId/cancel",
    requireCsrf,
    asyncRoute(async (req, res) => {
      const changed = await requestCancellation(req.user.id, req.params.jobId);
      if (!changed) {
        res.status(404).json({
          error: {
            code: "JOB_NOT_CANCELLABLE",
            message: "Film cannot be cancelled.",
          },
        });
        return;
      }
      await refundFailedJob(
        req.user.id,
        req.params.jobId,
        "Cancelled video generation",
      );
      res.status(202).json({ ok: true });
    }),
  );

  router.post(
    "/:jobId/retry",
    requireCsrf,
    asyncRoute(async (req, res) => {
      const changed = await retryJob(req.user.id, req.params.jobId);
      if (!changed) {
        res.status(404).json({
          error: {
            code: "JOB_NOT_RETRYABLE",
            message: "Film cannot be retried.",
          },
        });
        return;
      }
      res.status(202).json({ ok: true });
    }),
  );

  router.delete(
    "/:jobId",
    requireCsrf,
    asyncRoute(async (req, res) => {
      const { jobId } = req.params;
      const userId = req.user.id;

      const dbModule = await import("../db/pool.js");
      const pool = dbModule.default || dbModule.pool || dbModule;

      const jobCheckResult = await pool.query(
        `SELECT id FROM jobs WHERE id = ? AND user_id = ?`,
        [jobId, userId],
      );
      const jobCheck = Array.isArray(jobCheckResult)
        ? jobCheckResult
        : Array.isArray(jobCheckResult?.rows)
          ? jobCheckResult.rows
          : [];
      if (!jobCheck || jobCheck.length === 0) {
        res.status(404).json({
          error: { code: "JOB_NOT_FOUND", message: "Film project not found." },
        });
        return;
      }

      const assetsResult = await pool.query(
        `SELECT storage_key FROM assets WHERE user_id = ? AND JSON_EXTRACT(metadata, '$.jobId') = ?`,
        [userId, jobId],
      );
      const assets = Array.isArray(assetsResult)
        ? assetsResult
        : Array.isArray(assetsResult?.rows)
          ? assetsResult.rows
          : [];

      for (const asset of assets) {
        if (asset.storage_key) {
          try {
            const { getAssetPath } = await import("../media/storage.js");
            const filePath = getAssetPath(asset.storage_key);
            await fs.unlink(filePath);
          } catch (e) {
            /* ignore missing files */
          }
        }
      }

      await pool.query(`DELETE FROM scenes WHERE job_id = ?`, [jobId]);
      await pool.query(`DELETE FROM job_events WHERE job_id = ?`, [jobId]);
      await pool.query(
        `DELETE FROM assets WHERE user_id = ? AND JSON_EXTRACT(metadata, '$.jobId') = ?`,
        [userId, jobId],
      );
      await pool.query(`DELETE FROM jobs WHERE id = ? AND user_id = ?`, [
        jobId,
        userId,
      ]);

      res.status(204).end();
    }),
  );

  return router;
}
