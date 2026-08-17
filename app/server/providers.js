import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import OpenAI, { toFile } from "openai";
import Replicate from "replicate";
import { z } from "zod";
import { ASPECT_RATIOS, config } from "./config.js";
import {
  buildGeneratedScenePrompt,
  buildProductEditPrompt,
  buildReferenceEditPrompt,
  buildScriptRequest,
} from "./generation/prompts.js";

let openaiClient = null;
let replicateClient = null;
let falClient = null;
let providerLogger = (message) => console.warn(message);

const openai = () =>
  (openaiClient ??= new OpenAI({
    apiKey: config.openaiApiKey,
    timeout: 180_000,
    maxRetries: 0,
  }));

const replicate = () =>
  (replicateClient ??= new Replicate({ auth: config.replicateToken }));

const fal = async () => {
  if (!falClient) {
    const { fal: client } = await import("@fal-ai/client");
    client.config({ credentials: config.falKey });
    falClient = client;
  }
  return falClient;
};

export function setProviderLogger(logger) {
  if (typeof logger === "function") providerLogger = logger;
}

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function withRetry(label, operation, { attempts = 8 } = {}) {
  let delay = 5_000;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const message = String(error?.message || error);
      const status = Number(error?.status || error?.statusCode || 0);
      const retriable =
        status === 408 ||
        status === 409 ||
        status === 429 ||
        status >= 500 ||
        /rate limit|temporarily|overloaded|try again|timed?\s?out|timeout|ETIMEDOUT|ECONNRESET|ECONNABORTED|fetch failed|socket hang up|connection error/i.test(
          message,
        );
      if (!retriable || attempt === attempts) throw error;
      const retryMatch = message.match(/try again in (\d+(?:\.\d+)?)\s*s/i);
      const wait = retryMatch
        ? Math.ceil(Number(retryMatch[1]) + 2) * 1_000
        : delay + Math.floor(Math.random() * 1_000);
      providerLogger(
        `${label}: provider temporarily unavailable; retrying in ${Math.round(wait / 1_000)} seconds (attempt ${attempt}/${attempts}).`,
      );
      await sleep(wait);
      delay = Math.min(delay * 2, 90_000);
    }
  }
  throw new Error(`${label} failed without a provider response.`);
}

const QUALITY_HINTS =
  ". Bright, vivid cinematic lighting, warm color temperature, high key lighting, " +
  "well-lit subjects, no dark shadows, cheerful atmosphere, " +
  "vibrant saturated colors, Pixar-style illumination, soft global illumination, " +
  "ambient occlusion, subsurface scattering, volumetric light rays. " +
  "CRITICAL: Frame must be bright and well-exposed. Avoid night, dusk, or dim interiors.";

export function enhancePrompt(basePrompt) {
  if (!basePrompt || typeof basePrompt !== "string") return basePrompt;
  if (basePrompt.includes("Bright, vivid cinematic lighting"))
    return basePrompt;
  return basePrompt.trim().replace(/\.$/, "") + QUALITY_HINTS;
}

export async function upscaleImage(inputPath, outputPath, { scale = 2 } = {}) {
  if (!fs.existsSync(inputPath))
    throw new Error(`upscaleImage: input not found: ${inputPath}`);
  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const { spawn } = await import("node:child_process");
  const args = [
    "-y",
    "-i",
    inputPath,
    "-vf",
    `scale=iw*${scale}:ih*${scale}:flags=lanczos,eq=brightness=0.05:contrast=1.1:saturation=1.15`,
    "-q:v",
    "2",
    outputPath,
  ];
  await new Promise((resolve, reject) => {
    const proc = spawn(config.ffmpegBin, args, { stdio: "ignore" });
    proc.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`ffmpeg upscale exited ${code}`)),
    );
    proc.on("error", reject);
  });
  if (!fs.existsSync(outputPath))
    throw new Error("upscaleImage: ffmpeg produced no output");
  return outputPath;
}

export async function validateBrightness(imagePath) {
  try {
    const { spawn } = await import("node:child_process");
    let out = Buffer.alloc(0);
    const proc = spawn(
      config.ffmpegBin,
      ["-i", imagePath, "-vf", "format=gray,scale=1:1", "-f", "rawvideo", "-"],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    proc.stdout.on("data", (c) => {
      out = Buffer.concat([out, c]);
    });
    await new Promise((resolve, reject) => {
      proc.on("close", (code) =>
        code === 0 && out.length ? resolve() : reject(),
      );
      proc.on("error", reject);
    });
    const avg = out.reduce((s, b) => s + b, 0) / out.length;
    return avg > (config.brightnessThreshold || 60);
  } catch {
    return true;
  }
}

const dialogueLineSchema = z.object({
  character: z.string().trim().min(1).max(120),
  text: z.string().trim().min(1).max(600),
  emotion: z.string().optional(),
  speed: z.number().optional(),
});

const generatedScriptSchema = z.object({
  title: z.string().trim().min(1).max(220),
  voice_direction: z.string().trim().min(1).max(600),
  suggested_voice: z
    .enum([
      "alloy",
      "ash",
      "coral",
      "echo",
      "fable",
      "nova",
      "onyx",
      "sage",
      "shimmer",
    ])
    .catch("nova"),
  characters: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        description: z.string().trim().min(1).max(1500),
        voice: z.string().trim().max(40).optional(),
        child: z.boolean().optional().default(false),
      }),
    )
    .max(10)
    .default([]),
  scenes: z
    .array(
      z.object({
        narration: z.string().trim().max(2500).optional(),
        lines: z.array(dialogueLineSchema).max(12).optional(),
        image_prompt: z.string().trim().min(5).max(6000),
        motion_prompt: z.string().trim().min(3).max(2500),
        reference_roles: z.array(z.string().trim().max(80)).max(20).default([]),
        shot_type: z
          .enum([
            "establishing",
            "wide",
            "medium",
            "close-up",
            "macro",
            "overhead",
            "insert",
            "hero",
            "demonstration",
          ])
          .catch("medium"),
        lighting: z
          .enum([
            "bright_daylight",
            "warm_golden",
            "soft_studio",
            "neon_cyber",
            "candlelit",
            "moonlit",
          ])
          .optional()
          .catch("bright_daylight"),
        duration: z.number().min(3).max(15).optional().catch(5),
        product_focus: z.boolean().catch(false),
      }),
    )
    .min(1)
    .max(40),
});

function normalizeGeneratedScript(script, job, expectedCount) {
  const parsed = generatedScriptSchema.parse(script);
  if (parsed.scenes.length !== expectedCount) {
    throw new Error(
      `Script schema mismatch: expected ${expectedCount} scenes, received ${parsed.scenes.length}.`,
    );
  }
  const characterNames = new Set(parsed.characters.map((c) => c.name));
  parsed.scenes = parsed.scenes.map((scene, idx) => {
    if (job.mode === "dialogue") {
      if (!scene.lines || scene.lines.length === 0) {
        const chars = Array.from(characterNames);
        scene.lines = [
          {
            character: chars[0] || "Character",
            text: "Let's see what we have here.",
            emotion: "neutral",
          },
          {
            character: chars[1] || "Friend",
            text: "I'm right behind you.",
            emotion: "neutral",
          },
        ];
        console.warn(
          `[normalizeGeneratedScript] Scene ${idx + 1} had no lines — auto-generated fallback dialogue.`,
        );
      }
      for (const line of scene.lines) {
        if (!characterNames.has(line.character)) {
          const chars = Array.from(characterNames);
          line.character = chars[0] || "Character";
        }
        if (!line.emotion) line.emotion = "neutral";
        // Strip accidental character name prefix from AI text
        if (line.text && line.text.startsWith(line.character + ":")) {
          line.text = line.text.substring(line.character.length + 1).trim();
        }
      }
      // Keep narration as visual description — do NOT overwrite with dialogue
      if (!scene.narration || scene.narration.trim().length < 5) {
        scene.narration = `Scene ${idx + 1}: Visual storytelling continues.`;
      }
    } else if (!scene.narration) {
      scene.narration = `Scene ${idx + 1}: Visual storytelling continues.`;
    }
    if (!scene.duration) scene.duration = 5;
    return scene;
  });
  return parsed;
}

export async function generateScript(job, context = {}) {
  const request = buildScriptRequest(job, context);
  let lastError;

  const antiEchoSystem =
    (request.system || "") +
    `\n\nCRITICAL RULES:\n` +
    `1. NEVER copy the user's brief verbatim into scene narration or image prompts. Use it as inspiration only.\n` +
    `2. Narration must be ONE short sentence describing visuals only.\n` +
    `3. Image prompts MUST specify bright warm lighting, vivid colors, NO darkness, NO night scenes.\n` +
    `4. ${job.mode === "dialogue" ? "Every scene MUST have 2-4 lines of spoken dialogue with character names and emotion tags." : "Write smooth narration voiceover."}\n` +
    `5. ABSOLUTELY NO HUMANS, NO DOGS, NO MICE, NO MAMMALS unless explicitly requested.`;

  for (let schemaAttempt = 1; schemaAttempt <= 3; schemaAttempt += 1) {
    let corrective = "";
    if (schemaAttempt === 2) {
      corrective = `\n\nCRITICAL CORRECTION: The previous response was invalid: ${lastError?.message}.\nYou MUST return valid JSON. Each scene MUST have a "lines" array with spoken dialogue. Do NOT put the creative brief in narration.`;
    } else if (schemaAttempt === 3) {
      corrective = `\n\nFINAL ATTEMPT: You keep making the same error.\nREMINDER: This is DIALOGUE mode. Every scene needs characters TALKING to each other.\nFormat: lines: [{"character": "Name", "text": "What they say", "emotion": "happy"}]\nNarration should be 1 sentence describing visuals only.`;
    }

    const response = await withRetry("script", () =>
      openai().chat.completions.create({
        model: config.scriptModel,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: antiEchoSystem },
          { role: "user", content: request.user + corrective },
        ],
        user: job.userId || undefined,
      }),
    );

    try {
      const raw = response.choices?.[0]?.message?.content;
      if (!raw) throw new Error("Script provider returned an empty response.");
      const parsed = JSON.parse(raw);

      if (job.mode === "dialogue" && parsed.scenes) {
        const chars = parsed.characters?.map((c) => c.name) || [
          "Benny",
          "Silvie",
          "Luna",
        ];
        for (const scene of parsed.scenes) {
          if (!scene.lines || scene.lines.length === 0) {
            scene.lines = [
              {
                character: chars[0] || "Character",
                text:
                  extractSentence(scene.narration) ||
                  "Let's figure this out together.",
                emotion: "neutral",
              },
              {
                character: chars[1] || "Friend",
                text: "I'm right behind you.",
                emotion: "neutral",
              },
            ];
            scene.narration = (scene.narration || "").split(".")[0] + ".";
          }
          for (const line of scene.lines) {
            if (!line.emotion) line.emotion = "neutral";
          }
          scene.image_prompt = enhancePrompt(
            scene.image_prompt || scene.imagePrompt || "",
          );
          scene.imagePrompt = scene.image_prompt;
        }
      }

      return normalizeGeneratedScript(parsed, job, request.sceneCount);
    } catch (error) {
      lastError = error;
      console.warn(
        `[generateScript] attempt ${schemaAttempt} failed:`,
        error.message,
      );
    }
  }
  throw (
    lastError ||
    new Error("The generated script did not match the production schema.")
  );
}

function extractSentence(text) {
  if (!text) return "";
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);
  return sentences[0] ? sentences[0] + "." : "";
}

function assertAspectRatio(aspectRatio) {
  const selected = ASPECT_RATIOS[aspectRatio];
  if (!selected) throw new Error(`Unsupported aspect ratio: ${aspectRatio}`);
  return selected;
}

function isPrivateIp(hostname) {
  const family = net.isIP(hostname);
  if (!family) return false;
  if (family === 4) {
    const [a, b] = hostname.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  const lower = hostname.toLowerCase();
  return (
    lower === "::1" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("fe80:")
  );
}

function assertSafeProviderUrl(value) {
  const url = new URL(String(value));
  if (url.protocol !== "https:")
    throw new Error("Provider output URL must use HTTPS.");
  if (url.hostname === "localhost" || isPrivateIp(url.hostname))
    throw new Error("Provider output URL resolved to a private destination.");
  return url;
}

async function downloadProviderBuffer(
  urlValue,
  { maxBytes = config.providerDownloadMaxBytes, expected = [] } = {},
) {
  const url = assertSafeProviderUrl(urlValue);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(180_000),
    redirect: "follow",
  });
  if (!response.ok)
    throw new Error(`Provider download failed with HTTP ${response.status}.`);
  const contentType = String(
    response.headers.get("content-type") || "",
  ).toLowerCase();
  if (
    expected.length &&
    !expected.some((prefix) => contentType.startsWith(prefix))
  ) {
    throw new Error(
      `Provider returned unexpected content type ${contentType || "unknown"}.`,
    );
  }
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maxBytes)
    throw new Error("Provider output exceeds the size limit.");
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > maxBytes)
      throw new Error("Provider output exceeds the size limit.");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function writeImageResponse(response, outputPath) {
  const data = response.data?.[0];
  if (!data) throw new Error("Image provider returned no image.");
  const buffer = data.b64_json
    ? Buffer.from(data.b64_json, "base64")
    : await downloadProviderBuffer(data.url, {
        maxBytes: config.uploadMaxBytes * 3,
        expected: ["image/"],
      });
  if (!buffer.length)
    throw new Error("Image provider returned an empty image.");
  await fsp.mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  await fsp.writeFile(outputPath, buffer, { mode: 0o600 });
  return outputPath;
}

export async function generateImage(
  imagePrompt,
  outputPath,
  quality,
  { aspectRatio = "16:9", userId = undefined } = {},
) {
  const format = assertAspectRatio(aspectRatio);
  const enhanced = enhancePrompt(imagePrompt);
  const response = await withRetry("image", () =>
    openai().images.generate({
      model: config.imageModel,
      prompt: enhanced,
      size: format.imageSize,
      quality: quality || config.imageQuality,
      output_format: "png",
      moderation: "auto",
      user: userId,
    }),
  );
  return writeImageResponse(response, outputPath);
}

async function referenceFiles(references) {
  return Promise.all(
    references.map((reference, index) =>
      toFile(reference.buffer, `reference-${index + 1}.png`, {
        type: reference.mimeType || "image/png",
      }),
    ),
  );
}

export async function editImageWithReferences({
  prompt,
  references,
  outputPath,
  quality,
  aspectRatio,
  userId,
}) {
  if (!references?.length)
    throw new Error("Reference editing requires at least one image.");
  const format = assertAspectRatio(aspectRatio);
  const image = await referenceFiles(references.slice(0, 16));
  const enhanced = enhancePrompt(prompt);

  try {
    const response = await withRetry("reference image", () =>
      openai().images.edit({
        model: config.imageModel,
        image,
        prompt: enhanced,
        input_fidelity: "high",
        size: format.imageSize,
        quality: quality || config.imageQuality,
        output_format: "png",
        moderation: "auto",
        user: userId,
      }),
    );
    return writeImageResponse(response, outputPath);
  } catch (err) {
    providerLogger(
      `editImageWithReferences failed: ${err.message}; falling back to text-only generation`,
    );
    return generateImage(
      enhanced + " CRITICAL: Match reference character designs exactly.",
      outputPath,
      quality,
      { aspectRatio, userId },
    );
  }
}

export async function generateSceneImage({
  job,
  scene,
  products = [],
  references = [],
  outputPath,
  quality,
}) {
  if (job.filmType === "product_promo") {
    if (!products.length)
      throw new Error("Product promo scene has no product reference.");
    return editImageWithReferences({
      prompt: buildProductEditPrompt(job, scene, products),
      references: products,
      outputPath,
      quality,
      aspectRatio: job.aspectRatio,
      userId: job.userId,
    });
  }
  if (references.length) {
    return editImageWithReferences({
      prompt: buildReferenceEditPrompt(job, scene, references),
      references,
      outputPath,
      quality,
      aspectRatio: job.aspectRatio,
      userId: job.userId,
    });
  }
  return generateImage(
    buildGeneratedScenePrompt(job, scene),
    outputPath,
    quality,
    { aspectRatio: job.aspectRatio, userId: job.userId },
  );
}

async function outputToVideoBuffer(output) {
  if (typeof output === "string") {
    return downloadProviderBuffer(output, {
      expected: ["video/", "application/octet-stream"],
    });
  }
  if (Array.isArray(output)) {
    if (!output[0]) throw new Error("Video provider returned an empty array.");
    return downloadProviderBuffer(output[0], {
      expected: ["video/", "application/octet-stream"],
    });
  }
  if (output?.readable) {
    const chunks = [];
    let total = 0;
    for await (const chunk of output.readable) {
      total += chunk.length;
      if (total > config.providerDownloadMaxBytes)
        throw new Error("Video provider stream exceeds the size limit.");
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  return downloadProviderBuffer(String(output), {
    expected: ["video/", "application/octet-stream"],
  });
}

export async function animateImage(
  imagePath,
  motionPrompt,
  outputPath,
  model,
  { aspectRatio = "16:9", preserveProduct = false, duration = 5 } = {},
) {
  assertAspectRatio(aspectRatio);
  const imageData = (await fsp.readFile(imagePath)).toString("base64");
  const prompt = preserveProduct
    ? `${motionPrompt}. Keep the featured product completely unchanged: no morphing, relabeling, recoloring, deformation, or texture drift. Use camera and environmental motion only.`
    : motionPrompt;
  const output = await withRetry("animation", () =>
    replicate().run(model || config.videoModel, {
      input: {
        prompt,
        start_image: `data:image/png;base64,${imageData}`,
        duration: duration <= 7 ? 5 : 10,
        aspect_ratio: aspectRatio,
      },
    }),
  );
  const buffer = await outputToVideoBuffer(output);
  await fsp.writeFile(outputPath, buffer, { mode: 0o600 });
  return outputPath;
}

export async function animateImageFal(
  imagePath,
  motionPrompt,
  outputPath,
  model,
  { aspectRatio = "16:9", preserveProduct = false, duration = 6 } = {},
) {
  assertAspectRatio(aspectRatio);
  const client = await fal();
  const imageData = await fsp.readFile(imagePath);
  const imageUrl = await client.storage.upload(
    new Blob([imageData], { type: "image/png" }),
  );
  const prompt = preserveProduct
    ? `${motionPrompt}. Keep the featured product completely unchanged; camera and environmental motion only.`
    : motionPrompt;
  const result = await withRetry("animation", () =>
    client.subscribe(model || config.falModel, {
      input: {
        prompt,
        image_url: imageUrl,
        duration: duration <= 7 ? 5 : 10,
        aspect_ratio: aspectRatio,
      },
      logs: false,
    }),
  );
  const data = result?.data || {};
  const videoUrl = data.video?.url || data.video_url || data.url;
  if (!videoUrl) throw new Error("fal.ai returned no video output.");
  const buffer = await downloadProviderBuffer(videoUrl, {
    expected: ["video/", "application/octet-stream"],
  });
  await fsp.writeFile(outputPath, buffer, { mode: 0o600 });
  return outputPath;
}

export async function lipsyncClip(videoPath, audioPath, outputPath, model) {
  const client = await fal();
  const [videoData, audioData] = await Promise.all([
    fsp.readFile(videoPath),
    fsp.readFile(audioPath),
  ]);
  const [videoUrl, audioUrl] = await Promise.all([
    client.storage.upload(new Blob([videoData], { type: "video/mp4" })),
    client.storage.upload(new Blob([audioData], { type: "audio/wav" })),
  ]);
  const result = await withRetry("lip-sync", () =>
    client.subscribe(model || config.lipsyncModel, {
      input: { video_url: videoUrl, audio_url: audioUrl },
      logs: false,
    }),
  );
  const data = result?.data || {};
  const url = data.video?.url || data.video_url || data.url;
  if (!url) throw new Error("Lip-sync provider returned no video output.");
  const buffer = await downloadProviderBuffer(url, {
    expected: ["video/", "application/octet-stream"],
  });
  await fsp.writeFile(outputPath, buffer, { mode: 0o600 });
  return outputPath;
}

export async function synthesizeSpeech(
  text,
  voice,
  instructions,
  outputPath,
  speed = 1.0,
) {
  const response = await withRetry("voice", () =>
    openai().audio.speech.create({
      model: config.ttsModel,
      voice,
      input: text,
      instructions:
        instructions ||
        "Natural, expressive voice performance for a professional film.",
      response_format: "wav",
      speed: Math.max(0.5, Math.min(2.0, speed)),
    }),
  );
  await fsp.writeFile(outputPath, Buffer.from(await response.arrayBuffer()), {
    mode: 0o600,
  });
  return outputPath;
}

export function createLocalReadStream(filePath) {
  return fs.createReadStream(filePath);
}
