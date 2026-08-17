import crypto from "crypto";
import {
  affectedRows,
  parseJson,
  query,
  queryOne,
  stringifyJson,
  withTransaction,
} from "../pool.js";

function mapJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    prompt: row.prompt,
    filmType: row.film_type,
    languageCode: row.language_code,
    aspectRatio: row.aspect_ratio,
    targetMinutes: Number(row.target_minutes),
    voice: row.voice,
    qualityTier: row.quality_tier,
    stylePreset: row.style_preset,
    mode: row.mode,
    subtitles: Boolean(row.subtitles),
    karaokeCaptions: Boolean(row.karaoke_captions),
    lipsync: Boolean(row.lipsync),
    brandKitId: row.brand_kit_id,
    status: row.status,
    stage: row.stage,
    progress: Number(row.progress),
    script: parseJson(row.script_json, null),
    resolvedVoice: row.resolved_voice,
    finalAssetId: row.final_asset_id,
    watermarkRequired: Boolean(row.watermark_required),
    estimatedCostUsd: Number(row.estimated_cost_usd || 0),
    actualCostUsd: Number(row.actual_cost_usd || 0),
    estimatedCredits: Number(row.estimated_credits || 0),
    reservedCredits: Number(row.reserved_credits || 0),
    chargedCredits: Number(row.charged_credits || 0),
    errorCode: row.error_code,
    errorMessage: row.error_message,
    retryCount: Number(row.retry_count || 0),
    priority: Number(row.priority || 0),
    queueAvailableAt: row.queue_available_at,
    leaseOwner: row.lease_owner,
    leaseExpiresAt: row.lease_expires_at,
    heartbeatAt: row.heartbeat_at,
    cancelRequestedAt: row.cancel_requested_at,
    approvedAt: row.approved_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    version: Number(row.version),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapScene(row) {
  return {
    id: row.id,
    jobId: row.job_id,
    index: Number(row.scene_index),
    revision: Number(row.revision),
    narration: row.narration,
    lines: parseJson(row.dialogue_json, null),
    imagePrompt: row.image_prompt,
    motionPrompt: row.motion_prompt,
    audioDurationMs:
      row.audio_duration_ms == null ? null : Number(row.audio_duration_ms),
    imageAssetId: row.image_asset_id,
    audioAssetId: row.audio_asset_id,
    clipAssetId: row.clip_asset_id,
    lipsyncAssetId: row.lipsync_asset_id,
    status: row.status,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createDraft(user, input) {
  const id = crypto.randomUUID();
  const watermarkRequired =
    user.role === "admin" ? false : user.plan.watermarkRequired;
  await query(
    `INSERT INTO jobs (
      id, user_id, prompt, film_type, language_code, aspect_ratio,
      target_minutes, voice, quality_tier, style_preset, mode, subtitles,
      karaoke_captions, lipsync, brand_kit_id, status, stage,
      watermark_required, estimated_cost_usd, estimated_credits, priority
    ) VALUES (
      :id, :userId, :prompt, :filmType, :languageCode, :aspectRatio,
      :targetMinutes, :voice, :qualityTier, :stylePreset, :mode, :subtitles,
      :karaokeCaptions, :lipsync, :brandKitId, 'draft', 'draft',
      :watermarkRequired, :estimatedCostUsd, :estimatedCredits, :priority
    )`,
    {
      id,
      userId: user.id,
      prompt: input.prompt,
      filmType: input.filmType,
      languageCode: input.languageCode,
      aspectRatio: input.aspectRatio,
      targetMinutes: input.targetMinutes,
      voice: input.voice,
      qualityTier: input.qualityTier,
      stylePreset: input.stylePreset,
      mode: input.mode,
      subtitles: input.subtitles,
      karaokeCaptions: input.karaokeCaptions,
      lipsync: input.lipsync,
      brandKitId: input.brandKitId || null,
      watermarkRequired,
      estimatedCostUsd: input.estimatedCostUsd || 0,
      estimatedCredits: input.estimatedCredits || 0,
      priority: user.role === "admin" ? 100 : input.priority || 0,
    },
  );
  return getJobById(user.id, id);
}

export async function listJobs(userId, { limit = 50, before = null } = {}) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 50));
  const rows = await query(
    `SELECT * FROM jobs
     WHERE user_id = :userId
       AND deleted_at IS NULL
       AND (:before IS NULL OR created_at < :before)
     ORDER BY created_at DESC
     LIMIT ${safeLimit}`,
    { userId, before },
  );
  return rows.map(mapJob);
}

export async function getJobById(userId, jobId) {
  return mapJob(
    await queryOne(
      `SELECT * FROM jobs
       WHERE id = :jobId AND user_id = :userId AND deleted_at IS NULL
       LIMIT 1`,
      { jobId, userId },
    ),
  );
}

export async function getJobForAdmin(jobId) {
  return mapJob(
    await queryOne(
      `SELECT * FROM jobs WHERE id = :jobId AND deleted_at IS NULL LIMIT 1`,
      { jobId },
    ),
  );
}

export async function getJobWithScenes(userId, jobId) {
  const job = await getJobById(userId, jobId);
  if (!job) return null;
  const [sceneRows, eventRows, assetRows] = await Promise.all([
    query(
      `SELECT * FROM scenes
       WHERE job_id = :jobId AND user_id = :userId
       ORDER BY scene_index ASC`,
      { jobId, userId },
    ),
    query(
      `SELECT id, scene_id, level, event_type, message, progress, metadata, created_at
       FROM job_events
       WHERE job_id = :jobId AND user_id = :userId
       ORDER BY id DESC LIMIT 300`,
      { jobId, userId },
    ),
    query(
      `SELECT ja.asset_role, ja.product_id, ja.sort_order,
              a.id AS asset_id, a.kind, a.mime_type, a.byte_size,
              a.width, a.height, a.duration_ms, a.created_at,
              p.name AS product_name, p.strict_fidelity, p.preservation_notes
       FROM job_assets ja
       JOIN assets a ON a.id = ja.asset_id AND a.user_id = ja.user_id
       LEFT JOIN products p ON p.id = ja.product_id AND p.user_id = ja.user_id
       WHERE ja.job_id = :jobId AND ja.user_id = :userId
       ORDER BY ja.sort_order ASC`,
      { jobId, userId },
    ),
  ]);
  return {
    ...job,
    scenes: sceneRows.map(mapScene),
    events: eventRows.reverse().map((row) => ({
      id: String(row.id),
      sceneId: row.scene_id,
      level: row.level,
      type: row.event_type,
      message: row.message,
      progress: row.progress == null ? null : Number(row.progress),
      metadata: parseJson(row.metadata, null),
      createdAt: row.created_at,
    })),
    attachedAssets: assetRows.map((row) => ({
      role: row.asset_role,
      productId: row.product_id,
      productName: row.product_name,
      strictFidelity: Boolean(row.strict_fidelity),
      preservationNotes: row.preservation_notes,
      sortOrder: Number(row.sort_order),
      asset: {
        id: row.asset_id,
        kind: row.kind,
        mimeType: row.mime_type,
        byteSize: Number(row.byte_size),
        width: row.width == null ? null : Number(row.width),
        height: row.height == null ? null : Number(row.height),
        durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
        createdAt: row.created_at,
      },
    })),
  };
}

export async function updateDraft(userId, jobId, version, changes) {
  const allowed = {
    title: "title",
    prompt: "prompt",
    filmType: "film_type",
    languageCode: "language_code",
    aspectRatio: "aspect_ratio",
    targetMinutes: "target_minutes",
    voice: "voice",
    qualityTier: "quality_tier",
    stylePreset: "style_preset",
    mode: "mode",
    subtitles: "subtitles",
    karaokeCaptions: "karaoke_captions",
    lipsync: "lipsync",
    brandKitId: "brand_kit_id",
    estimatedCostUsd: "estimated_cost_usd",
    estimatedCredits: "estimated_credits",
  };
  const entries = Object.entries(changes).filter(
    ([key, value]) => key in allowed && value !== undefined,
  );
  if (!entries.length) return getJobById(userId, jobId);

  const assignments = entries.map(([key]) => `${allowed[key]} = ?`).join(", ");
  const values = entries.map(([, value]) => value);
  const result = await query(
    `UPDATE jobs
     SET ${assignments}, version = version + 1
     WHERE id = ? AND user_id = ? AND status = 'draft'
       AND version = ? AND deleted_at IS NULL`,
    [...values, jobId, userId, version],
  );
  if (affectedRows(result) !== 1) return null;
  return getJobById(userId, jobId);
}

export async function replaceDraftScenes(userId, jobId, script) {
  return withTransaction(async (connection) => {
    const [[job]] = await connection.execute(
      `SELECT id, status, mode FROM jobs
       WHERE id = ? AND user_id = ? AND deleted_at IS NULL
       LIMIT 1 FOR UPDATE`,
      [jobId, userId],
    );
    if (!job || job.status !== "draft") return null;

    const [[assetCount]] = await connection.execute(
      `SELECT COUNT(*) AS count FROM scenes
       WHERE job_id = ? AND user_id = ?
         AND (image_asset_id IS NOT NULL OR audio_asset_id IS NOT NULL
              OR clip_asset_id IS NOT NULL OR lipsync_asset_id IS NOT NULL)`,
      [jobId, userId],
    );
    if (Number(assetCount.count) > 0) {
      throw new Error("Rendered scenes cannot be replaced as a new draft.");
    }

    await connection.execute(
      `DELETE FROM scenes WHERE job_id = ? AND user_id = ?`,
      [jobId, userId],
    );

    for (let index = 0; index < script.scenes.length; index += 1) {
      const scene = script.scenes[index];

      // Normalize field names (handle both camelCase and snake_case)
      const narration = scene.narration || scene.narration_text || "";
      const lines = scene.lines || scene.dialogue || scene.spoken_lines || [];
      const imagePrompt =
        scene.image_prompt || scene.imagePrompt || scene.imageDescription || "";
      const motionPrompt =
        scene.motion_prompt ||
        scene.motionPrompt ||
        scene.cameraDirection ||
        "";

      // Ensure narration is never null/empty
      const safeNarration =
        typeof narration === "string" && narration.trim().length > 0
          ? narration.trim()
          : `Scene ${index + 1}: The story continues.`;

      // For dialogue mode, ensure lines is always a non-empty array
      const isDialogue = job.mode === "dialogue";
      let safeLines = Array.isArray(lines) && lines.length > 0 ? lines : [];
      if (isDialogue && safeLines.length === 0) {
        safeLines = [{ character: "Narrator", text: safeNarration }];
      }

      // Ensure image_prompt is never null
      const safeImagePrompt =
        typeof imagePrompt === "string" && imagePrompt.trim().length > 0
          ? imagePrompt.trim()
          : "Cinematic wide shot with dramatic lighting and detailed environment.";

      // Ensure motion_prompt is never null
      const safeMotionPrompt =
        typeof motionPrompt === "string" && motionPrompt.trim().length > 0
          ? motionPrompt.trim()
          : "Smooth camera movement with natural character motion and gestures.";

      await connection.execute(
        `INSERT INTO scenes (
          id, job_id, user_id, scene_index, narration, dialogue_json,
          image_prompt, motion_prompt, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft')`,
        [
          crypto.randomUUID(),
          jobId,
          userId,
          index,
          safeNarration,
          stringifyJson(safeLines.length > 0 ? safeLines : null),
          safeImagePrompt,
          safeMotionPrompt,
        ],
      );
    }

    await connection.execute(
      `UPDATE jobs
       SET title = ?, script_json = ?, resolved_voice = ?,
           stage = 'script_review', progress = 8, version = version + 1,
           error_code = NULL, error_message = NULL
       WHERE id = ? AND user_id = ?`,
      [
        script.title || "Untitled",
        stringifyJson(script),
        script.suggested_voice || script.voice || null,
        jobId,
        userId,
      ],
    );

    return jobId;
  });
}

export async function updateDraftScene(userId, jobId, sceneId, changes) {
  const allowed = {
    narration: "narration",
    lines: "dialogue_json",
    imagePrompt: "image_prompt",
    motionPrompt: "motion_prompt",
  };
  const entries = Object.entries(changes).filter(
    ([key, value]) => key in allowed && value !== undefined,
  );
  if (!entries.length) return null;
  const assignments = entries.map(([key]) => `${allowed[key]} = ?`).join(", ");
  const values = entries.map(([key, value]) =>
    key === "lines" ? stringifyJson(value) : value,
  );
  const result = await query(
    `UPDATE scenes s
     JOIN jobs j ON j.id = s.job_id AND j.user_id = s.user_id
     SET ${assignments}, s.revision = s.revision + 1
     WHERE s.id = ? AND s.job_id = ? AND s.user_id = ?
       AND j.status = 'draft' AND j.deleted_at IS NULL`,
    [...values, sceneId, jobId, userId],
  );
  return affectedRows(result) === 1;
}

export async function attachProduct(userId, jobId, productId, sortOrder = 0) {
  return withTransaction(async (connection) => {
    const [[row]] = await connection.execute(
      `SELECT p.id, p.original_asset_id
       FROM products p
       JOIN jobs j ON j.id = ? AND j.user_id = p.user_id AND j.status = 'draft'
       WHERE p.id = ? AND p.user_id = ? AND p.deleted_at IS NULL
       LIMIT 1`,
      [jobId, productId, userId],
    );
    if (!row) return false;
    await connection.execute(
      `INSERT INTO job_assets (
        id, job_id, user_id, asset_id, product_id, asset_role, sort_order
      ) VALUES (?, ?, ?, ?, ?, 'product', ?)
      ON DUPLICATE KEY UPDATE product_id = VALUES(product_id), sort_order = VALUES(sort_order)`,
      [
        crypto.randomUUID(),
        jobId,
        userId,
        row.original_asset_id,
        productId,
        sortOrder,
      ],
    );
    return true;
  });
}

export async function detachProduct(userId, jobId, productId) {
  const result = await query(
    `DELETE ja FROM job_assets ja
     JOIN jobs j ON j.id = ja.job_id AND j.user_id = ja.user_id
     WHERE ja.job_id = :jobId AND ja.user_id = :userId
       AND ja.product_id = :productId AND j.status = 'draft'`,
    { jobId, userId, productId },
  );
  return affectedRows(result) > 0;
}

export async function queueApprovedJob(
  connection,
  { userId, jobId, reservedCredits },
) {
  const [result] = await connection.execute(
    `UPDATE jobs
     SET status = 'queued', stage = 'queued', progress = 10,
         approved_at = UTC_TIMESTAMP(3), queue_available_at = UTC_TIMESTAMP(3),
         reserved_credits = ?, error_code = NULL, error_message = NULL,
         lease_owner = NULL, lease_expires_at = NULL,
         version = version + 1
     WHERE id = ? AND user_id = ? AND status = 'draft'
       AND script_json IS NOT NULL AND deleted_at IS NULL`,
    [reservedCredits, jobId, userId],
  );
  return result.affectedRows === 1;
}

export async function requestCancellation(userId, jobId) {
  const result = await query(
    `UPDATE jobs
     SET cancel_requested_at = UTC_TIMESTAMP(3),
         status = IF(status = 'queued', 'cancelled', status),
         stage = IF(status = 'queued', 'cancelled', stage),
         version = version + 1
     WHERE id = :jobId AND user_id = :userId
       AND status IN ('queued', 'running') AND deleted_at IS NULL`,
    { jobId, userId },
  );
  return affectedRows(result) === 1;
}

export async function softDeleteJob(userId, jobId) {
  const result = await query(
    `UPDATE jobs
     SET deleted_at = UTC_TIMESTAMP(3), version = version + 1
     WHERE id = :jobId AND user_id = :userId
       AND status NOT IN ('queued', 'running') AND deleted_at IS NULL`,
    { jobId, userId },
  );
  return affectedRows(result) === 1;
}

export async function retryJob(userId, jobId) {
  const result = await query(
    `UPDATE jobs
     SET status = 'queued', stage = 'queued',
         queue_available_at = UTC_TIMESTAMP(3),
         lease_owner = NULL, lease_expires_at = NULL,
         error_code = NULL, error_message = NULL,
         retry_count = retry_count + 1,
         cancel_requested_at = NULL,
         version = version + 1
     WHERE id = :jobId AND user_id = :userId
       AND status = 'error' AND deleted_at IS NULL`,
    { jobId, userId },
  );
  return affectedRows(result) === 1;
}

export async function queueSceneRegeneration(userId, jobId, sceneId) {
  return withTransaction(async (connection) => {
    const [[scene]] = await connection.execute(
      `SELECT s.id, s.revision, j.status
       FROM scenes s
       JOIN jobs j ON j.id = s.job_id AND j.user_id = s.user_id
       WHERE s.id = ? AND s.job_id = ? AND s.user_id = ?
         AND j.deleted_at IS NULL
       LIMIT 1 FOR UPDATE`,
      [sceneId, jobId, userId],
    );
    if (!scene || !["done", "error"].includes(scene.status)) return false;

    await connection.execute(
      `UPDATE scenes
       SET revision = revision + 1, status = 'pending',
           image_asset_id = NULL, clip_asset_id = NULL, lipsync_asset_id = NULL,
           error_code = NULL, error_message = NULL
       WHERE id = ? AND job_id = ? AND user_id = ?`,
      [sceneId, jobId, userId],
    );
    await connection.execute(
      `UPDATE jobs
       SET status = 'queued', stage = 'scene_regeneration', progress = 10,
           final_asset_id = NULL, queue_available_at = UTC_TIMESTAMP(3),
           lease_owner = NULL, lease_expires_at = NULL,
           error_code = NULL, error_message = NULL,
           version = version + 1
       WHERE id = ? AND user_id = ?`,
      [jobId, userId],
    );
    return true;
  });
}

export async function claimNextJob(workerId, leaseSeconds) {
  return withTransaction(async (connection) => {
    const [[row]] = await connection.query(
      `SELECT * FROM jobs
       WHERE status = 'queued'
         AND deleted_at IS NULL
         AND queue_available_at <= UTC_TIMESTAMP(3)
         AND (lease_expires_at IS NULL OR lease_expires_at < UTC_TIMESTAMP(3))
       ORDER BY priority DESC, queue_available_at ASC, created_at ASC
       LIMIT 1 FOR UPDATE SKIP LOCKED`,
    );
    if (!row) return null;

    await connection.execute(
      `UPDATE jobs
       SET status = 'running',
           lease_owner = ?,
           lease_expires_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? SECOND),
           heartbeat_at = UTC_TIMESTAMP(3),
           started_at = COALESCE(started_at, UTC_TIMESTAMP(3)),
           version = version + 1
       WHERE id = ?`,
      [workerId, leaseSeconds, row.id],
    );
    row.status = "running";
    row.lease_owner = workerId;
    return mapJob(row);
  });
}

export async function heartbeatJob(jobId, workerId, leaseSeconds) {
  const result = await query(
    `UPDATE jobs
     SET heartbeat_at = UTC_TIMESTAMP(3),
         lease_expires_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL :leaseSeconds SECOND)
     WHERE id = :jobId AND lease_owner = :workerId AND status = 'running'`,
    { jobId, workerId, leaseSeconds },
  );
  return affectedRows(result) === 1;
}

export async function getJobForWorker(jobId, workerId) {
  const job = mapJob(
    await queryOne(
      `SELECT * FROM jobs
       WHERE id = :jobId AND lease_owner = :workerId
         AND status = 'running' AND deleted_at IS NULL
       LIMIT 1`,
      { jobId, workerId },
    ),
  );
  if (!job) return null;
  const scenes = await query(
    `SELECT * FROM scenes WHERE job_id = :jobId ORDER BY scene_index ASC`,
    { jobId },
  );
  return { ...job, scenes: scenes.map(mapScene) };
}

export async function updateJobProgress({
  jobId,
  workerId,
  stage,
  progress,
  actualCostUsd,
}) {
  const result = await query(
    `UPDATE jobs
     SET stage = :stage,
         progress = :progress,
         actual_cost_usd = COALESCE(:actualCostUsd, actual_cost_usd),
         version = version + 1
     WHERE id = :jobId AND lease_owner = :workerId AND status = 'running'`,
    { jobId, workerId, stage, progress, actualCostUsd },
  );
  return affectedRows(result) === 1;
}

export async function updateSceneRenderState({
  userId,
  jobId,
  sceneId,
  status,
  imageAssetId,
  audioAssetId,
  clipAssetId,
  lipsyncAssetId,
  audioDurationMs,
  errorCode,
  errorMessage,
}) {
  const changes = {
    status,
    image_asset_id: imageAssetId,
    audio_asset_id: audioAssetId,
    clip_asset_id: clipAssetId,
    lipsync_asset_id: lipsyncAssetId,
    audio_duration_ms: audioDurationMs,
    error_code: errorCode,
    error_message: errorMessage,
  };
  const entries = Object.entries(changes).filter(
    ([, value]) => value !== undefined,
  );
  if (!entries.length) return false;
  const assignments = entries.map(([column]) => `${column} = ?`).join(", ");
  const values = entries.map(([, value]) => value);
  const result = await query(
    `UPDATE scenes SET ${assignments}
     WHERE id = ? AND job_id = ? AND user_id = ?`,
    [...values, sceneId, jobId, userId],
  );
  return affectedRows(result) === 1;
}

export async function completeJob({
  jobId,
  workerId,
  finalAssetId,
  actualCostUsd,
  chargedCredits,
}) {
  const result = await query(
    `UPDATE jobs
     SET status = 'done', stage = 'done', progress = 100,
         final_asset_id = :finalAssetId,
         actual_cost_usd = :actualCostUsd,
         charged_credits = :chargedCredits,
         completed_at = UTC_TIMESTAMP(3),
         lease_owner = NULL, lease_expires_at = NULL, heartbeat_at = NULL,
         error_code = NULL, error_message = NULL,
         version = version + 1
     WHERE id = :jobId AND lease_owner = :workerId AND status = 'running'`,
    { jobId, workerId, finalAssetId, actualCostUsd, chargedCredits },
  );
  return affectedRows(result) === 1;
}

export async function failJob({ jobId, workerId, errorCode, errorMessage }) {
  const result = await query(
    `UPDATE jobs
     SET status = 'error', stage = IF(stage = 'done', 'error', stage),
         error_code = :errorCode, error_message = :errorMessage,
         lease_owner = NULL, lease_expires_at = NULL, heartbeat_at = NULL,
         version = version + 1
     WHERE id = :jobId AND lease_owner = :workerId AND status = 'running'`,
    { jobId, workerId, errorCode, errorMessage },
  );
  return affectedRows(result) === 1;
}

export async function releaseExpiredLeases() {
  const result = await query(
    `UPDATE jobs
     SET status = 'queued',
         queue_available_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 10 SECOND),
         lease_owner = NULL, lease_expires_at = NULL, heartbeat_at = NULL,
         retry_count = retry_count + 1,
         error_code = 'WORKER_LEASE_EXPIRED',
         error_message = 'The render worker stopped responding; the job was safely requeued.',
         version = version + 1
     WHERE status = 'running'
       AND lease_expires_at IS NOT NULL
       AND lease_expires_at < UTC_TIMESTAMP(3)`,
  );
  return affectedRows(result);
}

export async function appendJobEvent({
  jobId,
  userId,
  sceneId = null,
  level = "info",
  type,
  message,
  progress = null,
  metadata = null,
}) {
  const result = await query(
    `INSERT INTO job_events (
      job_id, user_id, scene_id, level, event_type, message, progress, metadata
    ) SELECT
      j.id, j.user_id, :sceneId, :level, :type, :message, :progress, :metadata
    FROM jobs j
    WHERE j.id = :jobId AND j.user_id = :userId AND j.deleted_at IS NULL`,
    {
      jobId,
      userId,
      sceneId,
      level,
      type,
      message: String(message).slice(0, 1000),
      progress,
      metadata: stringifyJson(metadata),
    },
  );
  return affectedRows(result) === 1;
}

export async function attachReference(
  userId,
  jobId,
  referenceId,
  requestedRole = null,
  sortOrder = 0,
) {
  const roleByType = {
    character: "character",
    human: "presenter",
    style: "style_reference",
    general: "reference",
  };
  return withTransaction(async (connection) => {
    const [[reference]] = await connection.execute(
      `SELECT r.id, r.reference_type, r.asset_id
       FROM reference_library r
       JOIN jobs j ON j.id = ? AND j.user_id = r.user_id AND j.status = 'draft'
       WHERE r.id = ? AND r.user_id = ? AND r.deleted_at IS NULL
       LIMIT 1`,
      [jobId, referenceId, userId],
    );
    if (!reference) return false;
    const role = requestedRole || roleByType[reference.reference_type];
    const validRoles = new Set([
      "character",
      "presenter",
      "style_reference",
      "reference",
      "background",
    ]);
    if (!validRoles.has(role)) return false;

    await connection.execute(
      `INSERT INTO job_assets (
        id, job_id, user_id, asset_id, asset_role, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE asset_role = VALUES(asset_role), sort_order = VALUES(sort_order)`,
      [crypto.randomUUID(), jobId, userId, reference.asset_id, role, sortOrder],
    );
    return true;
  });
}

export async function detachAsset(userId, jobId, assetId) {
  const result = await query(
    `DELETE ja FROM job_assets ja
     JOIN jobs j ON j.id = ja.job_id AND j.user_id = ja.user_id
     WHERE ja.job_id = :jobId AND ja.user_id = :userId
       AND ja.asset_id = :assetId AND j.status = 'draft'`,
    { jobId, userId, assetId },
  );
  return affectedRows(result) > 0;
}

export async function countActiveJobs(userId, excludeJobId = null) {
  const row = await queryOne(
    `SELECT COUNT(*) AS count
     FROM jobs
     WHERE user_id = :userId AND deleted_at IS NULL
       AND status IN ('queued', 'running')
       AND (:excludeJobId IS NULL OR id != :excludeJobId)`,
    { userId, excludeJobId },
  );
  return Number(row?.count || 0);
}
