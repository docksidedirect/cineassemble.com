import { config, assertProductionConfig } from "./config.js";
import { closePool, query } from "./db/pool.js";
import { migrate } from "./db/migrate.js";
import {
  claimNextJob,
  heartbeatJob,
  releaseExpiredLeases,
} from "./db/repositories/jobs.js";
import {
  claimNextEmail,
  markEmailFailed,
  markEmailSent,
  releaseExpiredEmailLeases,
} from "./db/repositories/email.js";
import { settleCompletedJob } from "./db/repositories/credits.js";
import { findUserById } from "./db/repositories/users.js";
import { runPipeline } from "./pipeline.js";
import {
  emailDeliveryConfigured,
  sendOutboxEmail,
} from "./services/email-service.js";
import { ensurePrivateStorage } from "./media/storage.js";
import { logger } from "./logger.js";

let stopping = false;
const activeJobs = new Map();
let activeEmail = false;

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function startHeartbeat(jobId) {
  const timer = setInterval(async () => {
    try {
      const renewed = await heartbeatJob(
        jobId,
        config.workerId,
        config.workerLeaseSeconds,
      );
      if (!renewed) {
        logger.error({ jobId }, "Worker lease heartbeat was rejected.");
      }
    } catch (error) {
      logger.error({ err: error, jobId }, "Worker lease heartbeat failed.");
    }
  }, config.workerHeartbeatSeconds * 1000);
  timer.unref();
  return timer;
}

/* ── REFERENCE INJECTION: load attached refs and build prompt suffix ── */
async function getJobReferences(jobId, userId) {
  return query(
    `SELECT ja.asset_id, ja.asset_role, r.name, r.reference_type
     FROM job_assets ja
     LEFT JOIN reference_library r 
       ON r.asset_id = ja.asset_id 
       AND r.user_id = ja.user_id 
       AND r.deleted_at IS NULL
     WHERE ja.job_id = :jobId AND ja.user_id = :userId`,
    { jobId, userId },
  );
}

async function injectReferencePrompts(jobId, userId) {
  try {
    const refs = await getJobReferences(jobId, userId);
    if (!refs?.length) {
      logger.info({ jobId }, "No references attached to job.");
      return;
    }

    const characterRefs = refs.filter(
      (r) => r.asset_role === "character" || r.asset_role === "presenter",
    );
    const styleRefs = refs.filter((r) => r.asset_role === "style_reference");
    const generalRefs = refs.filter(
      (r) => r.asset_role === "reference" || r.asset_role === "background",
    );

    let instruction = "";
    if (characterRefs.length > 0) {
      const names = characterRefs.map((r) => r.name || r.asset_id).join(", ");
      instruction += ` CRITICAL: Character appearance must exactly match references: ${names}. Same colors, proportions, and design in every frame.`;
    }
    if (styleRefs.length > 0) {
      const names = styleRefs.map((r) => r.name || r.asset_id).join(", ");
      instruction += ` Visual style must match reference: ${names}.`;
    }
    if (generalRefs.length > 0) {
      const names = generalRefs.map((r) => r.name || r.asset_id).join(", ");
      instruction += ` Composition reference: ${names}.`;
    }

    if (!instruction) return;

    await query(
      `UPDATE scenes 
       SET image_prompt = CONCAT(COALESCE(image_prompt, ''), :instruction)
       WHERE job_id = :jobId 
         AND user_id = :userId
         AND image_prompt NOT LIKE '%exactly match references%'`,
      { jobId, userId, instruction },
    );

    logger.info(
      {
        jobId,
        characters: characterRefs.length,
        styles: styleRefs.length,
        general: generalRefs.length,
      },
      "Injected reference prompts into scene image prompts.",
    );
  } catch (err) {
    logger.warn(
      { err, jobId },
      "Failed to inject reference prompts, continuing render.",
    );
  }
}

async function executeJob(job) {
  // ── PAUSE CHECK: stop before rendering if user paused ──
  try {
    const dbModule = await import("./db/pool.js");
    const pool = dbModule.default || dbModule.pool || dbModule;
    const [check] = await pool.query(
      "SELECT cancel_requested_at, status FROM jobs WHERE id = ?",
      [job.id],
    );
    if (check?.[0]?.cancel_requested_at || check?.[0]?.status === "cancelled") {
      logger.info(
        { jobId: job.id },
        "Job was paused by user before rendering started.",
      );
      await pool.query(
        `UPDATE jobs SET status = 'cancelled', stage = 'paused', updated_at = NOW() WHERE id = ?`,
        [job.id],
      );
      return;
    }
  } catch (e) {
    logger.warn({ jobId: job.id, err: e }, "Pause check failed, continuing.");
  }

  const heartbeat = startHeartbeat(job.id);
  try {
    logger.info(
      { jobId: job.id, userId: job.userId, filmType: job.filmType },
      "Render job claimed.",
    );

    // ── INJECT REFERENCES BEFORE RENDERING ──
    await injectReferencePrompts(job.id, job.userId);

    await runPipeline(job.id, config.workerId);
    const user = await findUserById(job.userId);
    await settleCompletedJob({
      userId: job.userId,
      jobId: job.id,
      actualCredits: job.estimatedCredits,
      actorRole: user?.role || "user",
    });
    logger.info({ jobId: job.id, userId: job.userId }, "Render job completed.");
  } catch (error) {
    logger.error(
      { err: error, jobId: job.id, userId: job.userId },
      "Render job failed.",
    );
  } finally {
    clearInterval(heartbeat);
    activeJobs.delete(job.id);
  }
}

async function fillJobSlots() {
  while (!stopping && activeJobs.size < config.workerConcurrency) {
    const job = await claimNextJob(config.workerId, config.workerLeaseSeconds);
    if (!job) return;
    const task = executeJob(job);
    activeJobs.set(job.id, task);
  }
}

async function processOneEmail() {
  if (activeEmail || !emailDeliveryConfigured()) return;
  const email = await claimNextEmail(config.workerId, 120);
  if (!email) return;
  activeEmail = true;
  try {
    await sendOutboxEmail(email);
    await markEmailSent(email.id, config.workerId);
    logger.info(
      { emailId: email.id, template: email.template },
      "Outbox email delivered.",
    );
  } catch (error) {
    await markEmailFailed(email, config.workerId, error.message).catch(
      () => {},
    );
    logger.error(
      { err: error, emailId: email.id, template: email.template },
      "Outbox email delivery failed.",
    );
  } finally {
    activeEmail = false;
  }
}

async function recoverLeases() {
  const [jobs, emails] = await Promise.all([
    releaseExpiredLeases(),
    releaseExpiredEmailLeases(),
  ]);
  if (jobs || emails) {
    logger.warn({ jobs, emails }, "Expired worker leases were recovered.");
  }
}

async function runLoop() {
  const configurationErrors = assertProductionConfig();
  if (configurationErrors.length) {
    throw new Error(configurationErrors.join(" "));
  }
  await migrate({ logger });
  await ensurePrivateStorage();
  await recoverLeases();
  logger.info(
    {
      workerId: config.workerId,
      concurrency: config.workerConcurrency,
      emailDelivery: emailDeliveryConfigured(),
    },
    "CineAssemble worker started.",
  );

  let lastRecovery = Date.now();
  while (!stopping) {
    await fillJobSlots();
    await processOneEmail();
    if (Date.now() - lastRecovery > 60_000) {
      await recoverLeases();
      lastRecovery = Date.now();
    }
    await sleep(config.workerPollMs);
  }
}

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  logger.info(
    { signal, activeJobs: activeJobs.size },
    "Worker shutdown requested.",
  );
  const timeout = sleep(30_000);
  await Promise.race([Promise.allSettled(activeJobs.values()), timeout]);
  await closePool();
  logger.info("Worker stopped.");
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));

runLoop()
  .catch((error) => {
    logger.fatal({ err: error }, "Worker failed to start.");
    process.exitCode = 1;
    stopping = true;
  })
  .finally(async () => {
    if (!activeJobs.size) await closePool();
  });
