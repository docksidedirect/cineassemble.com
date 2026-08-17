import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { ASPECT_RATIOS, config, PRICES, ROOT, TIERS } from "./config.js";
import { logger } from "./logger.js";
import {
  appendJobEvent,
  completeJob,
  failJob,
  getJobForWorker,
  updateJobProgress,
  updateSceneRenderState,
} from "./db/repositories/jobs.js";
import { getAssetById } from "./db/repositories/assets.js";
import {
  animateImage,
  animateImageFal,
  lipsyncClip,
  synthesizeSpeech,
  editImageWithReferences,
  upscaleImage,
  validateBrightness,
} from "./providers.js";
import {
  loadGenerationContext,
  renderSceneImage,
  sceneGenerationPolicy,
} from "./generation/strategy.js";
import {
  materializeAsset,
  storeGeneratedFile,
} from "./media/generated-assets.js";

const DIALOGUE_VOICES = [
  "shimmer",
  "fable",
  "nova",
  "coral",
  "sage",
  "alloy",
  "ash",
  "echo",
  "onyx",
];

function mapLimit(items, limit, work) {
  let cursor = 0;
  const runners = Array.from(
    { length: Math.min(Math.max(1, limit), Math.max(1, items.length)) },
    async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        await work(items[index], index);
      }
    },
  );
  return Promise.all(runners);
}

function runProcess(command, args, { cwd = ROOT } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > 50_000) stdout = stdout.slice(-50_000);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.length > 50_000) stderr = stderr.slice(-50_000);
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else
        reject(
          new Error(
            `${path.basename(command)} exited ${code}: ${stderr.slice(-1400)}`,
          ),
        );
    });
  });
}

function ffmpeg(args) {
  return runProcess(config.ffmpegBin, args);
}

async function probeDuration(filePath) {
  try {
    const { stdout } = await runProcess(config.ffprobeBin, [
      "-v",
      "quiet",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      filePath,
    ]);
    return Math.max(0, Number.parseFloat(stdout) || 0);
  } catch {
    return config.sceneSeconds;
  }
}

function buildCharacterVoices(job) {
  const used = new Set();
  const voices = {};
  const declared = job.characters || job.script?.characters || [];
  for (const character of declared) {
    if (!character?.name) continue;
    let voice = String(character.voice || "").toLowerCase();
    if (!DIALOGUE_VOICES.includes(voice) || used.has(voice)) {
      voice =
        DIALOGUE_VOICES.find((c) => !used.has(c)) ||
        job.resolvedVoice ||
        "nova";
    }
    used.add(voice);
    voices[character.name.toLowerCase()] = {
      name: character.name,
      voice,
      child: Boolean(character.child),
      pitch: character.child ? config.childPitch : 1,
    };
  }
  return voices;
}

async function pitchShift(inputPath, outputPath, pitch) {
  await ffmpeg([
    "-y",
    "-i",
    inputPath,
    "-af",
    `aresample=48000,asetrate=48000*${pitch},aresample=48000,atempo=${(1 / pitch).toFixed(4)}`,
    "-c:a",
    "pcm_s16le",
    outputPath,
  ]);
}

async function concatDialogue(lineFiles, outputPath) {
  const sequence = [];
  for (const lineFile of lineFiles) {
    if (sequence.length) sequence.push(null);
    sequence.push(lineFile);
  }
  const args = ["-y"];
  for (const item of sequence) {
    if (item === null) {
      args.push("-f", "lavfi", "-t", "0.28", "-i", "anullsrc=r=48000:cl=mono");
    } else {
      args.push("-i", item);
    }
  }
  const normalize = sequence
    .map((_item, index) => `[${index}:a]aresample=48000[a${index}]`)
    .join(";");
  const chain = sequence.map((_item, index) => `[a${index}]`).join("");
  await ffmpeg([
    ...args,
    "-filter_complex",
    `${normalize};${chain}concat=n=${sequence.length}:v=0:a=1[out]`,
    "-map",
    "[out]",
    "-c:a",
    "pcm_s16le",
    outputPath,
  ]);
}

async function localMotion(
  imagePath,
  outputPath,
  sceneIndex,
  job,
  productSafe,
  duration,
) {
  const format = ASPECT_RATIOS[job.aspectRatio];
  await runProcess(config.pythonBin, [
    path.join(ROOT, "pipeline_py", "kenburns.py"),
    imagePath,
    outputPath,
    String(sceneIndex),
    String(duration || config.clipSeconds),
    String(format.width),
    String(format.height),
    productSafe ? "product" : "standard",
  ]);
}

async function resolvePrivateAsset(userId, assetId, destination) {
  const asset = await getAssetById(userId, assetId, {
    includeStorageKey: true,
  });
  if (!asset) throw new Error("A required private scene asset is unavailable.");
  await materializeAsset(asset, destination);
  return asset;
}

/* ── CANCELLATION CHECK ── */
async function isJobCancelled(jobId) {
  try {
    const { query } = await import("./db/pool.js");
    const [[row]] = await query(
      `SELECT status, cancel_requested_at FROM jobs WHERE id = ?`,
      [jobId],
    );
    return row?.status === "cancelled" || row?.cancel_requested_at != null;
  } catch {
    return false;
  }
}

/* ── Build enhanced image prompt with shot & lighting ── */
function buildEnhancedImagePrompt(scene, job) {
  let prompt = scene.image_prompt || scene.imagePrompt || job.prompt || "";

  const shotHints = {
    "close-up":
      "Extreme close-up on character's face, shallow depth of field, emotional expression in focus, background blurred.",
    medium:
      "Medium shot, waist-up framing, character centered, environment visible behind.",
    wide: "Wide establishing shot, full body characters, vast environment, cinematic scale.",
    establishing:
      "Establishing shot, wide angle, showing the full location and scale.",
    macro:
      "Macro photography, extreme detail on tiny objects, shallow depth of field.",
    overhead:
      "Overhead bird's eye view shot, looking straight down, geometric composition.",
    hero: "Hero shot, dramatic low angle, character centered and powerful, cinematic lighting.",
    demonstration:
      "Demonstration shot, clear product visibility, hands or characters interacting with the object.",
    insert:
      "Insert shot, close-up on a specific detail or object within the scene.",
  };
  if (scene.shot_type && shotHints[scene.shot_type]) {
    prompt += " " + shotHints[scene.shot_type];
  }
  if (scene.shotType && shotHints[scene.shotType]) {
    prompt += " " + shotHints[scene.shotType];
  }

  const lightHints = {
    bright_daylight:
      "Bright, vivid daylight, high key lighting, cheerful atmosphere, well-lit, no shadows.",
    warm_golden:
      "Warm golden hour lighting, orange and amber tones, soft glowing edges, sunset atmosphere.",
    soft_studio:
      "Soft diffused studio lighting, even illumination, professional portrait look, clean.",
    neon_cyber:
      "Neon cyberpunk lighting, magenta and cyan glows, reflective surfaces, futuristic.",
    candlelit:
      "Warm candlelit ambiance, flickering orange light, intimate shadows, cozy atmosphere.",
    moonlit:
      "Cool moonlit night, silver-blue tones, soft shadows, mysterious atmosphere.",
  };
  if (scene.lighting && lightHints[scene.lighting]) {
    prompt += " " + lightHints[scene.lighting];
  } else {
    prompt +=
      " Bright, vivid cinematic lighting, warm color temperature, high key lighting, well-lit subjects, no dark shadows.";
  }

  prompt +=
    " CRITICAL: Match uploaded reference character designs EXACTLY. Same colors, proportions, and style.";
  return prompt;
}

/* ── Emotion-aware TTS ── */
const EMOTION_INSTRUCTIONS = {
  neutral: "Natural, expressive voice performance.",
  happy: "Bright, cheerful, and energetic voice full of joy.",
  suspicious: "Skeptical, doubtful tone with careful pacing.",
  scared: "Nervous, shaky voice with hesitant delivery.",
  excited: "Highly energetic, fast-paced, enthusiastic delivery.",
  sad: "Melancholic, soft, and gentle voice with slower pacing.",
  angry: "Firm, intense voice with sharp emphasis.",
  whisper: "Soft conspiratorial whisper, intimate and secretive.",
};

async function createSceneAudio({
  job,
  scene,
  workDir,
  characterVoices,
  costs,
}) {
  const outputPath = path.join(workDir, `scene-${scene.index}-audio.wav`);
  if (scene.audioAssetId) {
    await resolvePrivateAsset(job.userId, scene.audioAssetId, outputPath);
    return {
      path: outputPath,
      assetId: scene.audioAssetId,
      duration: scene.audioDurationMs / 1000,
    };
  }

  if (scene.lines?.length) {
    const files = [];
    for (let index = 0; index < scene.lines.length; index += 1) {
      const line = scene.lines[index];
      const character =
        characterVoices[String(line.character || "").toLowerCase()];
      const rawPath = path.join(
        workDir,
        `scene-${scene.index}-line-${index}.wav`,
      );

      const emotion = line.emotion || "neutral";
      const baseInstructions =
        EMOTION_INSTRUCTIONS[emotion] || EMOTION_INSTRUCTIONS.neutral;
      const instructions = character?.child
        ? `Voice acting for a young character named ${character.name}: ${baseInstructions}`
        : baseInstructions;

      const speed =
        line.speed ||
        (emotion === "excited" ? 1.15 : emotion === "sad" ? 0.9 : 1.0);

      await synthesizeSpeech(
        line.text,
        character?.voice || job.resolvedVoice || "nova",
        instructions,
        rawPath,
        speed,
      );
      let selectedPath = rawPath;
      if (character?.pitch > 1.01) {
        selectedPath = path.join(
          workDir,
          `scene-${scene.index}-line-${index}-child.wav`,
        );
        await pitchShift(rawPath, selectedPath, character.pitch);
      }
      files.push(selectedPath);
      costs.tts += PRICES.ttsPerScene;
    }
    await concatDialogue(files, outputPath);
  } else {
    await synthesizeSpeech(
      scene.narration,
      job.resolvedVoice || job.voice || "nova",
      config.voiceInstructions || job.script?.voice_direction || "",
      outputPath,
      1.0,
    );
    costs.tts += PRICES.ttsPerScene;
  }

  const durationSeconds = await probeDuration(outputPath);
  const asset = await storeGeneratedFile({
    userId: job.userId,
    kind: "scene_audio",
    filePath: outputPath,
    durationMs: Math.round(durationSeconds * 1000),
    metadata: { jobId: job.id, sceneId: scene.id, revision: scene.revision },
  });
  await updateSceneRenderState({
    userId: job.userId,
    jobId: job.id,
    sceneId: scene.id,
    audioAssetId: asset.id,
    audioDurationMs: Math.round(durationSeconds * 1000),
    status: "rendering",
  });
  scene.audioAssetId = asset.id;
  scene.audioDurationMs = Math.round(durationSeconds * 1000);
  return { path: outputPath, assetId: asset.id, duration: durationSeconds };
}

async function createSceneImage({
  job,
  scene,
  workDir,
  context,
  tier,
  costs,
  loadedReferences,
  loadedProducts,
}) {
  const outputPath = path.join(workDir, `scene-${scene.index}-image.png`);
  const upscaledPath = path.join(workDir, `scene-${scene.index}-image-2x.png`);

  if (scene.imageAssetId) {
    await resolvePrivateAsset(job.userId, scene.imageAssetId, outputPath);
    if (config.upscaleEnabled && !fs.existsSync(upscaledPath)) {
      try {
        await upscaleImage(outputPath, upscaledPath, {
          scale: config.upscaleScale,
        });
      } catch {
        /* ignore */
      }
    }
    return {
      path:
        config.upscaleEnabled && fs.existsSync(upscaledPath)
          ? upscaledPath
          : outputPath,
      assetId: scene.imageAssetId,
      policy: sceneGenerationPolicy(job, scene, context),
    };
  }

  const enhancedPrompt = buildEnhancedImagePrompt(scene, job);

  if (loadedReferences?.length || loadedProducts?.length) {
    const allRefs = [...(loadedProducts || []), ...(loadedReferences || [])];
    await editImageWithReferences({
      prompt: enhancedPrompt,
      references: allRefs,
      outputPath,
      quality: tier.imageQuality,
      aspectRatio: job.aspectRatio,
      userId: job.userId,
    });

    const isBright = await validateBrightness(outputPath);
    if (!isBright) {
      logger.warn(
        { sceneId: scene.id },
        "Image too dark; regenerating with extreme daylight…",
      );
      await editImageWithReferences({
        prompt:
          enhancedPrompt +
          ". EXTREMELY BRIGHT, full daylight, studio lighting, overexposed background, vivid colors.",
        references: allRefs,
        outputPath,
        quality: tier.imageQuality,
        aspectRatio: job.aspectRatio,
        userId: job.userId,
      });
    }

    if (config.upscaleEnabled) {
      await upscaleImage(outputPath, upscaledPath, {
        scale: config.upscaleScale,
      });
    }

    const format = ASPECT_RATIOS[job.aspectRatio];
    const asset = await storeGeneratedFile({
      userId: job.userId,
      kind: "scene_image",
      filePath: outputPath,
      width: format.width,
      height: format.height,
      metadata: {
        jobId: job.id,
        sceneId: scene.id,
        revision: scene.revision,
        generationPolicy: "reference_faithful",
        shotType: scene.shotType || scene.shot_type,
        lighting: scene.lighting,
      },
    });
    costs.images += PRICES.image[tier.imageQuality] || PRICES.image.medium;
    await updateSceneRenderState({
      userId: job.userId,
      jobId: job.id,
      sceneId: scene.id,
      imageAssetId: asset.id,
      status: "rendering",
    });
    scene.imageAssetId = asset.id;
    return {
      path: config.upscaleEnabled ? upscaledPath : outputPath,
      assetId: asset.id,
      policy: {
        kind: "reference_faithful",
        preserveProduct: loadedProducts.length > 0,
        animationEngine: tier.engine === "local" ? "local" : tier.engine,
      },
    };
  }

  const result = await renderSceneImage({
    job,
    scene: { ...scene, image_prompt: enhancedPrompt },
    context,
    outputPath,
    quality: tier.imageQuality,
    referenceAssetIds: [],
    productAssetIds: [],
  });

  const isBright = await validateBrightness(outputPath);
  if (!isBright) {
    await renderSceneImage({
      job,
      scene: {
        ...scene,
        image_prompt: enhancedPrompt + ". EXTREMELY BRIGHT daylight.",
      },
      context,
      outputPath,
      quality: tier.imageQuality,
      referenceAssetIds: [],
      productAssetIds: [],
    });
  }

  if (config.upscaleEnabled) {
    await upscaleImage(outputPath, upscaledPath, {
      scale: config.upscaleScale,
    });
  }

  const format = ASPECT_RATIOS[job.aspectRatio];
  const asset = await storeGeneratedFile({
    userId: job.userId,
    kind: "scene_image",
    filePath: outputPath,
    width: result.width || format.width,
    height: result.height || format.height,
    metadata: {
      jobId: job.id,
      sceneId: scene.id,
      revision: scene.revision,
      preservationMode: result.preservationMode,
      generationPolicy: result.policy.kind,
      shotType: scene.shotType || scene.shot_type,
      lighting: scene.lighting,
    },
  });
  costs.images += PRICES.image[tier.imageQuality] || PRICES.image.medium;
  await updateSceneRenderState({
    userId: job.userId,
    jobId: job.id,
    sceneId: scene.id,
    imageAssetId: asset.id,
    status: "rendering",
  });
  scene.imageAssetId = asset.id;
  return {
    path: config.upscaleEnabled ? upscaledPath : outputPath,
    assetId: asset.id,
    policy: result.policy,
  };
}

async function createSceneClip({ job, scene, image, workDir, tier, costs }) {
  const outputPath = path.join(workDir, `scene-${scene.index}-clip.mp4`);
  if (scene.clipAssetId) {
    await resolvePrivateAsset(job.userId, scene.clipAssetId, outputPath);
    return { path: outputPath, assetId: scene.clipAssetId };
  }

  const sceneDuration = Math.round(
    scene.duration || scene.audioDurationMs / 1000 || config.clipSeconds,
  );

  const forceLocal =
    image.policy.animationEngine === "local" ||
    config.animationEngine === "local" ||
    tier.engine === "local";
  let local = forceLocal;
  if (!local) {
    try {
      if (tier.engine === "fal" && config.falKey) {
        await animateImageFal(
          image.path,
          scene.motionPrompt,
          outputPath,
          tier.falModel,
          {
            aspectRatio: job.aspectRatio,
            preserveProduct: image.policy.preserveProduct,
            duration: sceneDuration,
          },
        );
      } else {
        await animateImage(
          image.path,
          scene.motionPrompt,
          outputPath,
          tier.replicateModel || tier.replicateFallbackModel,
          {
            aspectRatio: job.aspectRatio,
            preserveProduct: image.policy.preserveProduct,
            duration: sceneDuration,
          },
        );
      }
      costs.animation += tier.clipCost;
    } catch (error) {
      if (
        config.fallbackToLocal &&
        /401|402|403|429|payment|credit|rate limit|temporarily|sensitive|flagged|moderation/i.test(
          String(error.message),
        )
      ) {
        local = true;
      } else {
        throw error;
      }
    }
  }
  if (local) {
    await localMotion(
      image.path,
      outputPath,
      scene.index,
      job,
      image.policy.preserveProduct,
      sceneDuration,
    );
  }

  // ── LOOP SHORT CLIPS TO MATCH AUDIO DURATION ──
  // AI video models (Kling, etc.) max out at 5–10s, but audio may be 15–20s.
  // Loop the clip so the final film matches the voiceover length.
  const actualDuration = await probeDuration(outputPath);
  if (actualDuration < sceneDuration - 1) {
    const loopedPath = path.join(
      workDir,
      `scene-${scene.index}-clip-looped.mp4`,
    );
    await ffmpeg([
      "-y",
      "-stream_loop",
      "-1",
      "-i",
      outputPath,
      "-t",
      String(sceneDuration),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-an",
      loopedPath,
    ]);
    await fsp.rename(loopedPath, outputPath);
  }

  const durationSeconds = await probeDuration(outputPath);
  const format = ASPECT_RATIOS[job.aspectRatio];
  const asset = await storeGeneratedFile({
    userId: job.userId,
    kind: "scene_clip",
    filePath: outputPath,
    width: format.width,
    height: format.height,
    durationMs: Math.round(durationSeconds * 1000),
    sourceAssetId: image.assetId,
    metadata: {
      jobId: job.id,
      sceneId: scene.id,
      revision: scene.revision,
      animationEngine: local ? "local" : tier.engine,
      productSafe: image.policy.preserveProduct,
    },
  });
  await updateSceneRenderState({
    userId: job.userId,
    jobId: job.id,
    sceneId: scene.id,
    clipAssetId: asset.id,
    status: "rendering",
  });
  scene.clipAssetId = asset.id;
  return { path: outputPath, assetId: asset.id };
}

async function createLipSync({ job, scene, audio, clip, workDir, costs }) {
  if (!job.lipsync || !scene.lines?.length || !config.falKey) return null;
  const outputPath = path.join(workDir, `scene-${scene.index}-lipsync.mp4`);
  if (scene.lipsyncAssetId) {
    await resolvePrivateAsset(job.userId, scene.lipsyncAssetId, outputPath);
    return { path: outputPath, assetId: scene.lipsyncAssetId };
  }

  const paddedPath = path.join(workDir, `scene-${scene.index}-lip-source.mp4`);
  const target = audio.duration + 0.3;
  await ffmpeg([
    "-y",
    "-stream_loop",
    "-1",
    "-i",
    clip.path,
    "-t",
    target.toFixed(3),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-an",
    paddedPath,
  ]);

  try {
    await lipsyncClip(paddedPath, audio.path, outputPath);
    costs.lipsync += (target * PRICES.lipsyncPerMin) / 60;
  } catch (lipErr) {
    logger.warn(
      { err: lipErr.message, sceneId: scene.id },
      "Lip-sync failed; falling back to audio mux",
    );
    await ffmpeg([
      "-y",
      "-i",
      paddedPath,
      "-i",
      audio.path,
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-shortest",
      outputPath,
    ]);
  }

  const format = ASPECT_RATIOS[job.aspectRatio];
  const asset = await storeGeneratedFile({
    userId: job.userId,
    kind: "scene_lipsync",
    filePath: outputPath,
    width: format.width,
    height: format.height,
    durationMs: Math.round((await probeDuration(outputPath)) * 1000),
    sourceAssetId: clip.assetId,
    metadata: { jobId: job.id, sceneId: scene.id, revision: scene.revision },
  });
  await updateSceneRenderState({
    userId: job.userId,
    jobId: job.id,
    sceneId: scene.id,
    lipsyncAssetId: asset.id,
    status: "rendering",
  });
  scene.lipsyncAssetId = asset.id;
  return { path: outputPath, assetId: asset.id };
}

/* ── Assembly with color grade ── */
async function assembleFilm(job, workerId, workDir) {
  const refreshed = await getJobForWorker(job.id, workerId);
  if (!refreshed)
    throw new Error("Worker lease was lost before final assembly.");
  const scenes = [];
  for (const scene of refreshed.scenes) {
    if (!scene.audioAssetId || !scene.clipAssetId) {
      throw new Error(
        `Scene ${scene.index + 1} is incomplete and cannot be assembled.`,
      );
    }
    const imagePath = path.join(workDir, `assembly-${scene.index}-image.png`);
    const audioPath = path.join(workDir, `assembly-${scene.index}-audio.wav`);
    const clipPath = path.join(workDir, `assembly-${scene.index}-clip.mp4`);
    await Promise.all([
      resolvePrivateAsset(job.userId, scene.imageAssetId, imagePath),
      resolvePrivateAsset(job.userId, scene.audioAssetId, audioPath),
      resolvePrivateAsset(job.userId, scene.clipAssetId, clipPath),
    ]);
    let lipClipPath = null;
    if (scene.lipsyncAssetId) {
      lipClipPath = path.join(workDir, `assembly-${scene.index}-lipsync.mp4`);
      await resolvePrivateAsset(job.userId, scene.lipsyncAssetId, lipClipPath);
    }
    scenes.push({
      id: scene.id,
      index: scene.index,
      narration: scene.narration,
      imagePath,
      audioPath,
      clipPath: lipClipPath || clipPath,
    });
  }

  const outputPath = path.join(workDir, "final.mp4");
  const format = ASPECT_RATIOS[job.aspectRatio];
  const colorFilter = buildColorGradeFilter(job.colorGrade || "none");

  const concatList = path.join(workDir, "concat-list.txt");
  const lines =
    scenes
      .filter((s) => fs.existsSync(s.clipPath))
      .map(
        (s) =>
          `file '${s.clipPath.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`,
      )
      .join("\n") + "\n";
  fs.writeFileSync(concatList, lines);

  const baseArgs = [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatList,
    "-vf",
    `scale=${format.width}:${format.height}:flags=lanczos,format=yuv420p${colorFilter ? "," + colorFilter : ""}`,
    "-c:v",
    "libx264",
    "-preset",
    config.assemblyPreset || "slow",
    "-crf",
    String(config.assemblyCrf || 18),
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-c:a",
    "aac",
    "-b:a",
    config.assemblyAudioBitrate || "256k",
    "-ar",
    "48000",
  ];

  baseArgs.push(outputPath);
  await ffmpeg(baseArgs);

  if (!fs.existsSync(outputPath)) {
    throw new Error("ffmpeg assembly produced no output file");
  }

  try {
    fs.unlinkSync(concatList);
  } catch {}

  const finalAsset = await storeGeneratedFile({
    userId: job.userId,
    kind: "final_video",
    filePath: outputPath,
    width: format.width,
    height: format.height,
    durationMs: Math.round((await probeDuration(outputPath)) * 1000),
    metadata: {
      jobId: job.id,
      aspectRatio: job.aspectRatio,
      watermark: job.watermarkRequired,
      karaokeCaptions: false,
      colorGrade: job.colorGrade,
    },
  });
  return finalAsset;
}

function buildColorGradeFilter(grade) {
  const filters = {
    warm: "eq=brightness=0.02:saturation=1.2:contrast=1.05,colorbalance=rs=0.1:gs=0.05",
    cool: "eq=brightness=0.01:saturation=1.1,colorbalance=bs=0.08:gs=0.02",
    vintage:
      "curves=r='0/0 0.5/0.4 1/0.9':g='0/0 0.5/0.45 1/0.85':b='0/0 0.5/0.5 1/0.8',eq=contrast=0.9:saturation=0.8",
    high_contrast: "eq=contrast=1.3:brightness=0.02,saturation=1.15",
  };
  return filters[grade] || "";
}

export async function runPipeline(jobId, workerId) {
  const job = await getJobForWorker(jobId, workerId);
  if (job.mode === "dialogue" && !job.lipsync) job.lipsync = true;
  if (!job)
    throw new Error("The job is unavailable or the worker lease is invalid.");

  const tier = TIERS[job.qualityTier] || TIERS.budget;
  const workDir = path.join(
    config.tempRoot,
    job.userId,
    `${job.id}-${crypto.randomBytes(5).toString("hex")}`,
  );
  await fsp.mkdir(workDir, { recursive: true, mode: 0o700 });
  const costs = { tts: 0, images: 0, animation: 0, lipsync: 0 };
  const totalCost = () =>
    Number(
      Object.values(costs)
        .reduce((sum, v) => sum + v, 0)
        .toFixed(4),
    );

  try {
    const context = await loadGenerationContext(job);

    // CHECK CANCELLATION BEFORE STARTING
    if (await isJobCancelled(job.id)) {
      logger.info(
        { jobId: job.id },
        "Job was cancelled before rendering started.",
      );
      await failJob({
        jobId: job.id,
        workerId,
        errorCode: "CANCELLED",
        errorMessage: "Render cancelled by user.",
      });
      return;
    }

    let loadedReferences = [];
    let loadedProducts = [];
    try {
      const { query } = await import("./db/pool.js");
      const assets = await query(
        `SELECT ja.asset_id, ja.asset_role, ja.product_id, a.mime_type FROM job_assets ja JOIN assets a ON a.id = ja.asset_id WHERE ja.job_id = :jobId AND ja.user_id = :userId`,
        { jobId: job.id, userId: job.userId },
      );
      for (const asset of assets || []) {
        const tempPath = path.join(workDir, `ref-${asset.asset_id}.tmp`);
        await resolvePrivateAsset(job.userId, asset.asset_id, tempPath);
        const buffer = await fsp.readFile(tempPath);
        const refObj = { buffer, mimeType: asset.mime_type || "image/png" };
        if (asset.asset_role === "product" || asset.product_id)
          loadedProducts.push(refObj);
        else loadedReferences.push(refObj);
      }
      if (loadedReferences.length || loadedProducts.length) {
        logger.info(
          {
            jobId: job.id,
            refCount: loadedReferences.length,
            prodCount: loadedProducts.length,
          },
          "Loaded attached references.",
        );
      }
    } catch (e) {
      logger.warn(
        { err: e, jobId: job.id },
        "Failed to load references, continuing without them.",
      );
    }

    const characterVoices = buildCharacterVoices(job);
    const pending = job.scenes.filter(
      (s) =>
        s.status !== "ready" ||
        !s.audioAssetId ||
        !s.imageAssetId ||
        !s.clipAssetId,
    );
    await appendJobEvent({
      jobId: job.id,
      userId: job.userId,
      type: "pipeline.started",
      message: `Rendering ${pending.length} pending scene(s); ${job.scenes.length - pending.length} completed scene(s) will be reused.`,
      progress: 12,
      metadata: { filmType: job.filmType, aspectRatio: job.aspectRatio },
    });

    let completed = job.scenes.length - pending.length;
    await mapLimit(
      pending,
      Math.min(config.workerConcurrency, config.imageConcurrency),
      async (scene) => {
        await updateSceneRenderState({
          userId: job.userId,
          jobId: job.id,
          sceneId: scene.id,
          status: "rendering",
          errorCode: null,
          errorMessage: null,
        });
        const sceneDir = path.join(
          workDir,
          `scene-${scene.index}-r${scene.revision}`,
        );
        await fsp.mkdir(sceneDir, { recursive: true, mode: 0o700 });

        // CHECK CANCELLATION BEFORE EACH SCENE
        if (await isJobCancelled(job.id)) {
          logger.info(
            { jobId: job.id, sceneId: scene.id },
            "Job cancelled during scene render.",
          );
          throw new Error("Render cancelled by user.");
        }

        try {
          const audio = await createSceneAudio({
            job,
            scene,
            workDir: sceneDir,
            characterVoices,
            costs,
          });
          const image = await createSceneImage({
            job,
            scene,
            workDir: sceneDir,
            context,
            tier,
            costs,
            loadedReferences,
            loadedProducts,
          });
          const clip = await createSceneClip({
            job,
            scene,
            image,
            workDir: sceneDir,
            tier,
            costs,
          });
          await createLipSync({
            job,
            scene,
            audio,
            clip,
            workDir: sceneDir,
            costs,
          });
          await updateSceneRenderState({
            userId: job.userId,
            jobId: job.id,
            sceneId: scene.id,
            status: "ready",
            errorCode: null,
            errorMessage: null,
          });
          completed += 1;
          const progress =
            12 + Math.round((completed / job.scenes.length) * 76);
          await updateJobProgress({
            jobId: job.id,
            workerId,
            stage: "scenes",
            progress,
            actualCostUsd: totalCost(),
          });
          await appendJobEvent({
            jobId: job.id,
            userId: job.userId,
            sceneId: scene.id,
            type: "scene.ready",
            message: `Scene ${scene.index + 1} is ready.`,
            progress,
          });
        } catch (error) {
          await updateSceneRenderState({
            userId: job.userId,
            jobId: job.id,
            sceneId: scene.id,
            status: "error",
            errorCode: "SCENE_RENDER_FAILED",
            errorMessage: String(error.message).slice(0, 2000),
          });
          throw error;
        }
      },
    );

    await updateJobProgress({
      jobId: job.id,
      workerId,
      stage: "assembly",
      progress: 92,
      actualCostUsd: totalCost(),
    });

    // CHECK CANCELLATION BEFORE ASSEMBLY
    if (await isJobCancelled(job.id)) {
      logger.info({ jobId: job.id }, "Job cancelled before assembly.");
      throw new Error("Render cancelled by user.");
    }

    const finalAsset = await assembleFilm(job, workerId, workDir);
    const completedJob = await completeJob({
      jobId: job.id,
      workerId,
      finalAssetId: finalAsset.id,
      actualCostUsd: totalCost(),
      chargedCredits: job.estimatedCredits,
    });
    if (!completedJob)
      throw new Error(
        "The job could not be finalized because its lease changed.",
      );
    await appendJobEvent({
      jobId: job.id,
      userId: job.userId,
      type: "pipeline.completed",
      message: "The final film is ready.",
      progress: 100,
      metadata: { finalAssetId: finalAsset.id, actualCostUsd: totalCost() },
    });
    return finalAsset;
  } catch (error) {
    await failJob({
      jobId: job.id,
      workerId,
      errorCode: "PIPELINE_FAILED",
      errorMessage: String(error.message).slice(0, 4000),
    }).catch(() => {});
    await appendJobEvent({
      jobId: job.id,
      userId: job.userId,
      level: "error",
      type: "pipeline.failed",
      message: String(error.message).slice(0, 1000),
    }).catch(() => {});
    throw error;
  } finally {
    await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

export function startPipeline() {
  throw new Error(
    "Direct in-process rendering is disabled; use the durable worker.",
  );
}
