import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";
import { ASPECT_RATIOS, ROOT } from "../server/config.js";
import { closePool, query } from "../server/db/pool.js";
import * as users from "../server/db/repositories/users.js";
import * as jobs from "../server/db/repositories/jobs.js";
import * as assets from "../server/db/repositories/assets.js";

const outputRoot = process.env.PHASE8_OUTPUT || "/tmp/cineassemble-phase8";

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} failed (${code}): ${stderr.slice(-1200)}`));
    });
  });
}

async function validateAssembly(aspectRatio, index) {
  const format = ASPECT_RATIOS[aspectRatio];
  const workDir = path.join(outputRoot, aspectRatio.replace(":", "x"));
  await fs.mkdir(workDir, { recursive: true, mode: 0o700 });
  const imagePath = path.join(workDir, "scene.png");
  const audioPath = path.join(workDir, "scene.wav");
  const clipPath = path.join(workDir, "scene.mp4");
  const manifestPath = path.join(workDir, "manifest.json");
  const finalPath = path.join(workDir, "final.mp4");

  await sharp({
    create: {
      width: format.width,
      height: format.height,
      channels: 4,
      background: { r: 11, g: 18, b: 32, alpha: 1 },
    },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="${format.width}" height="${format.height}"><rect x="${Math.round(format.width * 0.24)}" y="${Math.round(format.height * 0.22)}" width="${Math.round(format.width * 0.52)}" height="${Math.round(format.height * 0.56)}" rx="35" fill="#f59e0b"/><circle cx="${Math.round(format.width * 0.5)}" cy="${Math.round(format.height * 0.5)}" r="${Math.round(Math.min(format.width, format.height) * 0.09)}" fill="#fff"/></svg>`,
        ),
      },
    ])
    .png()
    .toFile(imagePath);

  await run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000:duration=1.4",
    "-c:a",
    "pcm_s16le",
    audioPath,
  ]);
  await run("python3", [
    path.join(ROOT, "pipeline_py", "kenburns.py"),
    imagePath,
    clipPath,
    String(index),
    "2",
    String(format.width),
    String(format.height),
    "product",
  ]);

  await fs.writeFile(
    manifestPath,
    JSON.stringify(
      {
        title: "",
        aspectRatio,
        subtitles: true,
        karaokeCaptions: aspectRatio === "9:16",
        watermarkRequired: true,
        watermarkText: "Made with CineAssemble",
        workDir,
        outputPath: finalPath,
        scenes: [
          {
            index: 0,
            narration: "Your product remains exact while the story moves around it.",
            imagePath,
            audioPath,
            clipPath,
          },
        ],
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );

  const result = await run("python3", [
    path.join(ROOT, "pipeline_py", "assemble.py"),
    manifestPath,
    finalPath,
  ]);
  const output = JSON.parse(result.stdout.trim().split("\n").at(-1));
  assert.equal(output.width, format.width);
  assert.equal(output.height, format.height);
  assert.equal(output.watermark, true);
  assert.equal(output.karaoke, aspectRatio === "9:16");

  const probe = await run("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "csv=p=0:s=x",
    finalPath,
  ]);
  assert.equal(probe.stdout.trim(), `${format.width}x${format.height}`);
  return finalPath;
}

async function createValidationUser(label) {
  const suffix = crypto.randomBytes(5).toString("hex");
  const id = await users.createUser({
    email: `${label}-${suffix}@example.test`,
    displayName: label,
    passwordHash: "$argon2id$validation-placeholder",
    status: "active",
  });
  await users.markEmailVerified(id);
  return users.findUserById(id);
}

async function dummyAsset(userId, kind, suffix) {
  const type = {
    scene_image: ["image/png", "png"],
    scene_audio: ["audio/wav", "wav"],
    scene_clip: ["video/mp4", "mp4"],
    final_video: ["video/mp4", "mp4"],
  }[kind];
  return assets.createAsset({
    userId,
    kind,
    storageKey: `tenants/${userId}/validation/${crypto.randomUUID()}.${type[1]}`,
    mimeType: type[0],
    byteSize: 100,
    sha256: crypto.createHash("sha256").update(`${kind}-${suffix}`).digest("hex"),
  });
}

async function validateSceneRegeneration() {
  const owner = await createValidationUser("scene-owner");
  const stranger = await createValidationUser("scene-stranger");
  const draft = await jobs.createDraft(owner, {
    prompt: "Validate one-scene regeneration.",
    filmType: "explainer",
    languageCode: "en",
    aspectRatio: "9:16",
    targetMinutes: 1,
    voice: "nova",
    qualityTier: "budget",
    stylePreset: "clean_editorial",
    mode: "narration",
    subtitles: true,
    karaokeCaptions: true,
    lipsync: false,
    estimatedCostUsd: 0.2,
    estimatedCredits: 1,
  });
  await jobs.replaceDraftScenes(owner.id, draft.id, {
    title: "Regeneration validation",
    suggested_voice: "nova",
    voice_direction: "Clear.",
    characters: [],
    scenes: [
      {
        narration: "First scene.",
        image_prompt: "First image.",
        motion_prompt: "First motion.",
      },
      {
        narration: "Second scene.",
        image_prompt: "Second image.",
        motion_prompt: "Second motion.",
      },
    ],
  });
  const detail = await jobs.getJobWithScenes(owner.id, draft.id);
  for (const scene of detail.scenes) {
    const image = await dummyAsset(owner.id, "scene_image", `${scene.id}-image`);
    const audio = await dummyAsset(owner.id, "scene_audio", `${scene.id}-audio`);
    const clip = await dummyAsset(owner.id, "scene_clip", `${scene.id}-clip`);
    await jobs.updateSceneRenderState({
      userId: owner.id,
      jobId: draft.id,
      sceneId: scene.id,
      status: "ready",
      imageAssetId: image.id,
      audioAssetId: audio.id,
      clipAssetId: clip.id,
      audioDurationMs: 1400,
    });
  }
  const finalAsset = await dummyAsset(owner.id, "final_video", `${draft.id}-final`);
  await query(
    `UPDATE jobs SET status = 'done', stage = 'done', progress = 100,
       final_asset_id = :finalAssetId WHERE id = :jobId AND user_id = :userId`,
    { finalAssetId: finalAsset.id, jobId: draft.id, userId: owner.id },
  );

  const before = await jobs.getJobWithScenes(owner.id, draft.id);
  const target = before.scenes[0];
  const unaffected = before.scenes[1];
  assert.equal(
    await jobs.queueSceneRegeneration(stranger.id, draft.id, target.id),
    false,
  );
  assert.equal(await jobs.queueSceneRegeneration(owner.id, draft.id, target.id), true);
  const after = await jobs.getJobWithScenes(owner.id, draft.id);
  const changed = after.scenes.find((scene) => scene.id === target.id);
  const preserved = after.scenes.find((scene) => scene.id === unaffected.id);

  assert.equal(changed.revision, target.revision + 1);
  assert.equal(changed.imageAssetId, null);
  assert.equal(changed.clipAssetId, null);
  assert.equal(changed.audioAssetId, target.audioAssetId);
  assert.equal(preserved.imageAssetId, unaffected.imageAssetId);
  assert.equal(preserved.audioAssetId, unaffected.audioAssetId);
  assert.equal(preserved.clipAssetId, unaffected.clipAssetId);
  assert.equal(after.status, "queued");
  assert.equal(after.finalAssetId, null);
  return true;
}

async function main() {
  await fs.rm(outputRoot, { recursive: true, force: true });
  await fs.mkdir(outputRoot, { recursive: true, mode: 0o700 });
  const outputs = [];
  let index = 0;
  for (const aspectRatio of Object.keys(ASPECT_RATIOS)) {
    outputs.push(await validateAssembly(aspectRatio, index));
    index += 1;
  }
  await validateSceneRegeneration();
  console.log(
    JSON.stringify(
      {
        ok: true,
        aspectRatios: Object.keys(ASPECT_RATIOS),
        karaokeVertical: true,
        watermark: true,
        tenantSafeSingleSceneRegeneration: true,
        outputs,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closePool());
