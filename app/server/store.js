import fs from "fs";
import path from "path";
import crypto from "crypto";
import { config } from "./config.js";

fs.mkdirSync(config.jobsDir, { recursive: true });

function metaPath(id) {
  return path.join(config.jobsDir, id, "job.json");
}

export function createJob(input) {
  const id = crypto.randomBytes(6).toString("hex");
  const dir = path.join(config.jobsDir, id);
  fs.mkdirSync(dir, { recursive: true });
  const job = {
    id,
    title: null,
    prompt: input.prompt,
    targetMinutes: input.targetMinutes,
    voice: input.voice,
    qualityTier: input.qualityTier || "premium",
    stylePreset: input.stylePreset,
    status: "queued", // queued | running | done | error
    stage: "queued", // script | voiceover | images | animation | assembly
    progress: 0,
    error: null,
    script: null,
    scenes: [],
    finalVideo: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    logs: [],
  };
  saveJob(job);
  return job;
}

export function saveJob(job) {
  job.updatedAt = Date.now();
  fs.writeFileSync(metaPath(job.id), JSON.stringify(job, null, 2));
}

export function getJob(id) {
  try {
    return JSON.parse(fs.readFileSync(metaPath(id), "utf8"));
  } catch {
    return null;
  }
}

export function listJobs() {
  const ids = fs.readdirSync(config.jobsDir).filter((d) => {
    try {
      fs.accessSync(metaPath(d));
      return true;
    } catch {
      return false;
    }
  });
  return ids
    .map(getJob)
    .filter(Boolean)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function log(job, msg) {
  job.logs.push(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
  if (job.logs.length > 300) job.logs = job.logs.slice(-300);
  saveJob(job);
}

export function deleteJob(id) {
  const dir = path.join(config.jobsDir, id);
  fs.rmSync(dir, { recursive: true, force: true });
}
