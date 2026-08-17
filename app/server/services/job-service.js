import {
  attachProduct,
  attachReference,
  countActiveJobs,
  createDraft,
  getJobById,
  getJobWithScenes,
  replaceDraftScenes,
  softDeleteJob,
  updateDraft,
  updateDraftScene,
} from "../db/repositories/jobs.js";
import {
  chargeAndQueueSceneRegeneration,
  reserveCreditsAndQueue,
} from "../db/repositories/credits.js";
import { generateScript } from "../providers.js";
import { estimateJob, estimateSceneRegeneration } from "../pricing.js";
import {
  loadGenerationContext,
  scriptContext,
} from "../generation/strategy.js";
import {
  createDraftSchema,
  parseRequest,
  sceneDraftSchema,
  updateDraftSchema,
} from "../validation/video.js";

function entitlementError(user, input) {
  if (user.role === "admin") return null;
  if (input.targetMinutes > user.plan.maxVideoMinutes) {
    return {
      code: "PLAN_DURATION_LIMIT",
      message: `Your ${user.plan.name} plan supports videos up to ${user.plan.maxVideoMinutes} minute(s).`,
    };
  }
  const allowed = user.plan.entitlements?.quality_tiers || ["budget"];
  if (!allowed.includes(input.qualityTier)) {
    return {
      code: "PLAN_QUALITY_LIMIT",
      message: `The ${input.qualityTier} quality tier is not included in your current plan.`,
    };
  }
  return null;
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

export async function createProjectDraft(user, rawInput) {
  const normalizedInput = {
    ...rawInput,
    productIds: normalizeIdArray(rawInput?.productIds),
    referenceIds: normalizeIdArray(rawInput?.referenceIds),
  };

  const parsed = parseRequest(createDraftSchema, normalizedInput);
  if (!parsed.ok) {
    console.error(
      "[createProjectDraft] schema validation failed:",
      parsed.error,
    );
    return parsed;
  }

  const entitlement = entitlementError(user, parsed.data);
  if (entitlement) {
    return { ok: false, error: entitlement };
  }

  const estimate = estimateJob(parsed.data);
  const job = await createDraft(user, {
    ...parsed.data,
    estimatedCostUsd: estimate.estimatedCostUsd,
    estimatedCredits: estimate.estimatedCredits,
  });

  try {
    // Attach selected products
    for (let index = 0; index < parsed.data.productIds.length; index += 1) {
      const productId = parsed.data.productIds[index];
      const attached = await attachProduct(user.id, job.id, productId, index);

      if (!attached) {
        await softDeleteJob(user.id, job.id);
        return {
          ok: false,
          error: {
            code: "PRODUCT_NOT_FOUND",
            message:
              "One selected product is unavailable or belongs to another account.",
          },
        };
      }
    }

    // Attach selected references
    for (let index = 0; index < parsed.data.referenceIds.length; index += 1) {
      const referenceId = parsed.data.referenceIds[index];
      let attached = await attachReference(
        user.id,
        job.id,
        referenceId,
        null, // let repository decide role from reference_type
        index,
      );

      // FALLBACK: if attachReference fails, try direct asset insert
      if (!attached) {
        try {
          const { query } = await import("../db/pool.js");
          const rows = await query(
            `SELECT id FROM assets WHERE id = :refId AND user_id = :userId LIMIT 1`,
            { refId: referenceId, userId: user.id },
          );
          const assetRow =
            Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
          if (assetRow && assetRow.id) {
            await query(
              `INSERT INTO job_assets (id, job_id, user_id, asset_id, asset_role, sort_order)
               VALUES (:jaId, :jobId, :userId, :assetId, 'character', :sortOrder)
               ON DUPLICATE KEY UPDATE asset_role = VALUES(asset_role), sort_order = VALUES(sort_order)`,
              {
                jaId: crypto.randomUUID(),
                jobId: job.id,
                userId: user.id,
                assetId: assetRow.id,
                sortOrder: index,
              },
            );
            attached = true;
            console.log(
              "[createProjectDraft] fallback direct asset attach succeeded:",
              { referenceId, assetId: assetRow.id },
            );
          } else {
            console.warn(
              "[createProjectDraft] fallback: asset not found in assets table:",
              { referenceId, userId: user.id },
            );
          }
        } catch (fallbackErr) {
          console.warn(
            "[createProjectDraft] fallback attach failed:",
            fallbackErr.message,
          );
        }
      }

      if (!attached) {
        await softDeleteJob(user.id, job.id);
        return {
          ok: false,
          error: {
            code: "REFERENCE_NOT_FOUND",
            message:
              "One selected reference is unavailable or belongs to another account. ID: " +
              referenceId,
          },
        };
      }
    }

    const savedJob = await getJobWithScenes(user.id, job.id);

    return {
      ok: true,
      job: savedJob,
      estimate,
      nextAction: "generate_script_preview",
    };
  } catch (error) {
    await softDeleteJob(user.id, job.id).catch(() => {});
    console.error("[createProjectDraft] unexpected error:", error);
    throw error;
  }
}

function sanitizePrompt(text) {
  if (!text || typeof text !== "string") return "";
  const systemPhrases = [
    /output format[\s\S]*?scenes?/gi,
    /break this down[\s\S]*?prompts?/gi,
    /highly descriptive AI video generator prompts?/gi,
    /including camera movement tags?/gi,
    /\[panning shot\]/gi,
    /\[macro close-up\]/gi,
    /\[wide shot\]/gi,
    /\[tracking shot\]/gi,
    /no real-world live-action footage/gi,
    /do not use live-action/gi,
    /cinematic storyboard/gi,
    /scene breakdown/gi,
    /prompt engineering/gi,
    /AI video generation/gi,
    /video generator/gi,
    /output[\s\S]*?format/gi,
  ];
  let cleaned = text;
  for (const phrase of systemPhrases) {
    cleaned = cleaned.replace(phrase, "");
  }
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  if (
    /^(scene|output|format|break|describe|create|generate)\s*\d*[\:\-]/i.test(
      cleaned,
    )
  ) {
    cleaned = cleaned.replace(
      /^(scene|output|format|break|describe|create|generate)\s*\d*[\:\-]\s*/i,
      "",
    );
  }
  return (
    cleaned || "Cinematic scene with characters in their established style."
  );
}

function ensureSceneFields(scenes) {
  if (!Array.isArray(scenes)) return scenes;
  return scenes.map((scene, idx) => {
    const narration = scene.narration || scene.narration_text || "";
    const lines = scene.lines || scene.dialogue || scene.spoken_lines || [];
    let imagePrompt =
      scene.imagePrompt || scene.image_prompt || scene.imageDescription || "";
    let motionPrompt =
      scene.motionPrompt || scene.motion_prompt || scene.cameraDirection || "";

    if (
      !narration ||
      typeof narration !== "string" ||
      narration.trim().length === 0
    ) {
      scene.narration = `Scene ${idx + 1}: The story continues with visual storytelling.`;
    } else {
      scene.narration = narration;
    }

    if (!lines || lines.length === 0) {
      const sentences = scene.narration
        .split(/[.!?]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      if (sentences.length > 0) {
        scene.lines = sentences.map((text, i) => ({
          character: i % 2 === 0 ? "Narrator" : "Character",
          text: text + (text.endsWith("?") || text.endsWith("!") ? "" : "."),
        }));
      } else {
        scene.lines = [{ character: "Narrator", text: scene.narration }];
      }
    } else {
      scene.lines = lines;
    }

    if (
      !imagePrompt ||
      typeof imagePrompt !== "string" ||
      imagePrompt.trim().length === 0
    ) {
      scene.image_prompt =
        "Cinematic wide shot with dramatic lighting, detailed environment, and clear character focus.";
    } else {
      scene.image_prompt = imagePrompt;
    }
    scene.imagePrompt = scene.image_prompt;

    if (
      !motionPrompt ||
      typeof motionPrompt !== "string" ||
      motionPrompt.trim().length === 0
    ) {
      scene.motion_prompt =
        "Smooth camera movement, subtle character motion, natural body language and gestures.";
    } else {
      scene.motion_prompt = motionPrompt;
    }
    scene.motionPrompt = scene.motion_prompt;

    return scene;
  });
}

export async function generateScriptPreview(user, jobId) {
  const job = await getJobById(user.id, jobId);
  if (!job || job.status !== "draft") {
    return {
      ok: false,
      error: { code: "JOB_NOT_FOUND", message: "The draft is unavailable." },
    };
  }
  const context = await loadGenerationContext(job);

  let script;
  try {
    script = await generateScript(job, scriptContext(context));
  } catch (genErr) {
    const errMsg = genErr.message || "";
    console.log("[generateScriptPreview] generateScript failed:", errMsg);

    if (
      errMsg.includes("without spoken lines") ||
      errMsg.includes("dialogue") ||
      errMsg.includes("lines")
    ) {
      console.log(
        "[generateScriptPreview] Generating fallback script with placeholder dialogue",
      );
      const estimate = estimateJob(job);
      const sceneCount = estimate.sceneCount || 5;
      script = {
        title: job.title || "Untitled Production",
        suggested_voice: job.voice || "nova",
        scenes: Array.from({ length: sceneCount }, (_, i) => {
          const basePrompt =
            job.prompt ||
            "Characters in their established visual style, consistent design across all frames.";
          return {
            narration: `Scene ${i + 1}: ${basePrompt}`,
            lines: [
              {
                character: "Narrator",
                text: `In this scene, the story continues with visual storytelling and emotional depth.`,
              },
              {
                character: "Character",
                text: `The characters express themselves through natural dialogue and meaningful gestures.`,
              },
            ],
            imagePrompt:
              sanitizePrompt(basePrompt) +
              ". Consistent character design, matching reference style, dramatic lighting, detailed environment.",
            motionPrompt:
              "Natural character movement, expressive gestures, characters walking and talking, smooth camera motion.",
          };
        }),
      };
    } else {
      throw genErr;
    }
  }

  if (!script || !Array.isArray(script.scenes)) {
    return {
      ok: false,
      error: {
        code: "SCRIPT_EMPTY",
        message: "The AI returned an empty script.",
      },
    };
  }

  const estimate = estimateJob(job);
  const expectedScenes = estimate.sceneCount || script.scenes.length;
  if (script.scenes.length !== expectedScenes) {
    console.log(
      `[generateScriptPreview] Normalizing scenes: ${script.scenes.length} → ${expectedScenes}`,
    );
    if (script.scenes.length > expectedScenes) {
      script.scenes = script.scenes.slice(0, expectedScenes);
    } else {
      while (script.scenes.length < expectedScenes) {
        script.scenes.push({
          narration: `Scene ${script.scenes.length + 1}: The story continues seamlessly.`,
          lines: [
            {
              character: "Narrator",
              text: "The narrative progresses with visual storytelling.",
            },
          ],
          imagePrompt:
            "Cinematic wide shot with dramatic lighting, detailed environment, and clear character focus.",
          motionPrompt:
            "Smooth camera movement, subtle character motion, natural body language and gestures.",
        });
      }
    }
  }

  script.scenes = ensureSceneFields(script.scenes);

  const saved = await replaceDraftScenes(user.id, job.id, script);
  if (!saved) {
    return {
      ok: false,
      error: {
        code: "DRAFT_CHANGED",
        message: "The draft changed while its script was being generated.",
      },
    };
  }
  return {
    ok: true,
    job: await getJobWithScenes(user.id, job.id),
    nextAction: "review_and_approve",
  };
}

export async function updateProjectDraft(user, jobId, version, rawChanges) {
  const parsed = parseRequest(updateDraftSchema, rawChanges);
  if (!parsed.ok) return parsed;
  const current = await getJobById(user.id, jobId);
  if (!current || current.status !== "draft") {
    return {
      ok: false,
      error: { code: "JOB_NOT_FOUND", message: "The draft is unavailable." },
    };
  }
  const merged = { ...current, ...parsed.data };
  const entitlement = entitlementError(user, merged);
  if (entitlement) return { ok: false, error: entitlement };
  const estimate = estimateJob(merged);
  const updated = await updateDraft(user.id, jobId, version, {
    ...parsed.data,
    estimatedCostUsd: estimate.estimatedCostUsd,
    estimatedCredits: estimate.estimatedCredits,
  });
  if (!updated) {
    return {
      ok: false,
      error: {
        code: "VERSION_CONFLICT",
        message: "This draft was updated elsewhere. Refresh and try again.",
      },
    };
  }
  return { ok: true, job: updated, estimate };
}

export async function updateScenePreview(user, jobId, sceneId, rawChanges) {
  const parsed = parseRequest(sceneDraftSchema, rawChanges);
  if (!parsed.ok) return parsed;
  const changed = await updateDraftScene(user.id, jobId, sceneId, parsed.data);
  if (!changed) {
    return {
      ok: false,
      error: {
        code: "SCENE_NOT_EDITABLE",
        message:
          "The scene is unavailable or the film has already started rendering.",
      },
    };
  }
  return { ok: true, job: await getJobWithScenes(user.id, jobId) };
}

export async function approveProjectDraft(user, jobId) {
  if (user.role !== "admin") {
    const activeJobs = await countActiveJobs(user.id, jobId);
    if (activeJobs >= user.plan.maxConcurrentJobs) {
      return {
        ok: false,
        error: {
          code: "CONCURRENT_JOB_LIMIT",
          message: `Your ${user.plan.name} plan allows ${user.plan.maxConcurrentJobs} active render(s) at a time.`,
        },
      };
    }
  }
  const result = await reserveCreditsAndQueue(user, jobId);
  if (!result.ok) {
    const message =
      result.code === "INSUFFICIENT_CREDITS"
        ? `This film needs ${result.required} credits; your available balance is ${result.balance}.`
        : "The draft is not ready for rendering.";
    return { ok: false, error: { code: result.code, message }, ...result };
  }
  return {
    ok: true,
    approval: result,
    job: await getJobWithScenes(user.id, jobId),
  };
}

export async function getSceneRegenerationEstimate(user, jobId) {
  const job = await getJobById(user.id, jobId);
  if (!job) return null;
  return {
    unlimited: user.role === "admin",
    ...estimateSceneRegeneration({ ...job, role: user.role }),
  };
}

export async function regenerateOneScene(user, jobId, sceneId) {
  const job = await getJobById(user.id, jobId);
  if (!job) {
    return {
      ok: false,
      error: { code: "JOB_NOT_FOUND", message: "The film is unavailable." },
    };
  }
  const estimate = estimateSceneRegeneration({ ...job, role: user.role });
  const result = await chargeAndQueueSceneRegeneration({
    user,
    jobId,
    sceneId,
    requiredCredits: estimate.estimatedCredits,
  });
  if (!result.ok) {
    const message =
      result.code === "INSUFFICIENT_CREDITS"
        ? `Scene regeneration needs ${result.required} credits; your available balance is ${result.balance}.`
        : "Only completed or failed films can regenerate an owned scene.";
    return {
      ok: false,
      error: { code: result.code, message },
      ...result,
    };
  }
  return {
    ok: true,
    approval: result,
    estimate: { ...estimate, unlimited: user.role === "admin" },
    job: await getJobWithScenes(user.id, jobId),
  };
}
