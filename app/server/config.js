import dotenv from "dotenv";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(ROOT, ".env") });

function numberEnv(name, fallback, { min = -Infinity, max = Infinity } = {}) {
  const value =
    process.env[name] == null ? fallback : Number(process.env[name]);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be a number between ${min} and ${max}.`);
  }
  return value;
}

function booleanEnv(name, fallback = false) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const val = raw
    .toString()
    .trim()
    .toLowerCase()
    .replace(/^["']|["']$/g, "");
  if (val !== "true" && val !== "false") {
    throw new Error(`${name} must be true or false. Got: "${raw}"`);
  }
  return val === "true";
}

function listEnv(name, fallback = []) {
  const value = process.env[name];
  if (!value) return fallback;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function urlEnv(name, fallback = "") {
  const value = process.env[name] || fallback;
  if (!value) return "";
  try {
    return new URL(value).toString().replace(/\/$/, "");
  } catch {
    throw new Error(`${name} must be a valid absolute URL.`);
  }
}

const nodeEnv = process.env.NODE_ENV || "development";
const production = nodeEnv === "production";
const dataRoot = path.resolve(process.env.DATA_ROOT || path.join(ROOT, "data"));
const privateStorageRoot = path.resolve(
  process.env.PRIVATE_STORAGE_ROOT || path.join(dataRoot, "private"),
);

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English", direction: "ltr" },
  { code: "es", label: "Spanish", direction: "ltr" },
  { code: "fr", label: "French", direction: "ltr" },
  { code: "de", label: "German", direction: "ltr" },
  { code: "it", label: "Italian", direction: "ltr" },
  { code: "pt", label: "Portuguese", direction: "ltr" },
  { code: "nl", label: "Dutch", direction: "ltr" },
  { code: "pl", label: "Polish", direction: "ltr" },
  { code: "tr", label: "Turkish", direction: "ltr" },
  { code: "ru", label: "Russian", direction: "ltr" },
  { code: "ar", label: "Arabic", direction: "rtl" },
  { code: "hi", label: "Hindi", direction: "ltr" },
  { code: "ja", label: "Japanese", direction: "ltr" },
  { code: "ko", label: "Korean", direction: "ltr" },
  { code: "zh", label: "Chinese", direction: "ltr" },
];

/* ── ASPECT RATIOS with OpenAI-compatible image sizes ── */
export const ASPECT_RATIOS = {
  "16:9": {
    id: "16:9",
    label: "Landscape",
    imageSize: "1536x1024", // Changed from 1792x1024 to supported 3:2 landscape
    width: 1920,
    height: 1080,
  },
  "9:16": {
    id: "9:16",
    label: "Vertical",
    imageSize: "1024x1536", // Changed from 1024x1792 to supported 2:3 portrait
    width: 1080,
    height: 1920,
  },
  "1:1": {
    id: "1:1",
    label: "Square",
    imageSize: "1024x1024", // Changed from 1536x1536 to supported 1:1 square
    width: 1080,
    height: 1080,
  },
};

export const FILM_TYPES = {
  cartoon_story: {
    id: "cartoon_story",
    label: "Cartoon story",
    description:
      "Character-led animated stories with a consistent visual cast.",
    referenceMode: "optional",
    defaultStyle: "cinematic_3d",
  },
  product_promo: {
    id: "product_promo",
    label: "Real-product promo",
    description:
      "Commercial films that preserve an uploaded product and its branding.",
    referenceMode: "product_required",
    defaultStyle: "product_photography",
  },
  realistic_human: {
    id: "realistic_human",
    label: "Realistic human film",
    description:
      "Photoreal people, presenters, testimonials, and narrative scenes.",
    referenceMode: "optional",
    defaultStyle: "photoreal",
  },
  social_ad: {
    id: "social_ad",
    label: "Social media ad",
    description:
      "Fast-hook advertisements optimized for Reels, TikTok, and Shorts.",
    referenceMode: "optional",
    defaultStyle: "high_energy_commercial",
  },
  explainer: {
    id: "explainer",
    label: "Explainer video",
    description:
      "Clear educational, service, process, and software explanations.",
    referenceMode: "optional",
    defaultStyle: "clean_editorial",
  },
  cinematic_story: {
    id: "cinematic_story",
    label: "Cinematic story",
    description:
      "Dramatic live-action-style stories with cinematic shot planning.",
    referenceMode: "optional",
    defaultStyle: "cinematic_realism",
  },
  reference_video: {
    id: "reference_video",
    label: "Reference-led video",
    description:
      "A film built around uploaded characters, people, artwork, or product references.",
    referenceMode: "required",
    defaultStyle: "reference_matched",
  },
};

export const config = {
  nodeEnv,
  production,
  port: numberEnv("PORT", 3001, { min: 1, max: 65535 }),
  host: process.env.HOST || "0.0.0.0",
  appUrl: urlEnv("APP_URL", "http://localhost:3001"),
  trustProxy: numberEnv("TRUST_PROXY_HOPS", production ? 1 : 0, {
    min: 0,
    max: 10,
  }),
  allowedOrigins: listEnv("ALLOWED_ORIGINS", [
    urlEnv("APP_URL", "http://localhost:3001"),
    "http://localhost:5173",
  ]),
  appSecret: process.env.APP_SECRET || "",
  adminEmail: (process.env.ADMIN_EMAIL || "").trim().toLowerCase(),

  databaseUrl: process.env.DATABASE_URL || "",
  database: {
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: numberEnv("MYSQL_PORT", 3306, { min: 1, max: 65535 }),
    user: process.env.MYSQL_USER || "cineassemble",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "cineassemble",
    connectionLimit: numberEnv("MYSQL_CONNECTION_LIMIT", 10, {
      min: 1,
      max: 100,
    }),
    sslCa: process.env.MYSQL_SSL_CA || "",
  },

  cookieName: process.env.SESSION_COOKIE_NAME || "ca_session",
  cookieSecure: booleanEnv("SESSION_COOKIE_SECURE", production),
  sessionIdleHours: numberEnv("SESSION_IDLE_HOURS", 24, { min: 1, max: 720 }),
  sessionAbsoluteDays: numberEnv("SESSION_ABSOLUTE_DAYS", 30, {
    min: 1,
    max: 365,
  }),
  verifyEmailHours: numberEnv("VERIFY_EMAIL_HOURS", 24, { min: 1, max: 168 }),
  passwordResetMinutes: numberEnv("PASSWORD_RESET_MINUTES", 30, {
    min: 5,
    max: 120,
  }),

  smtp: {
    host: process.env.SMTP_HOST || "",
    port: numberEnv("SMTP_PORT", 587, { min: 1, max: 65535 }),
    secure: booleanEnv("SMTP_SECURE", false),
    user: process.env.SMTP_USER || "",
    password: process.env.SMTP_PASSWORD || "",
    from: process.env.EMAIL_FROM || "CineAssemble <no-reply@example.com>",
  },

  paypal: {
    environment: process.env.PAYPAL_ENVIRONMENT || "sandbox",
    clientId: process.env.PAYPAL_CLIENT_ID || "",
    clientSecret: process.env.PAYPAL_CLIENT_SECRET || "",
    webhookId: process.env.PAYPAL_WEBHOOK_ID || "",
    planStarter: process.env.PAYPAL_PLAN_STARTER || "",
    planCreator: process.env.PAYPAL_PLAN_CREATOR || "",
    planAgency: process.env.PAYPAL_PLAN_AGENCY || "",
  },

  openaiApiKey: process.env.OPENAI_API_KEY || "",
  replicateToken: process.env.REPLICATE_API_TOKEN || "",
  falKey: process.env.FAL_KEY || "",
  scriptModel: process.env.OPENAI_SCRIPT_MODEL || "gpt-4o",
  imageModel: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
  imageQuality: process.env.OPENAI_IMAGE_QUALITY || "high",
  ttsModel: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
  videoModel: process.env.REPLICATE_VIDEO_MODEL || "kwaivgi/kling-v2.1",
  falModel: process.env.FAL_VIDEO_MODEL || "fal-ai/kling-video/v1-6-standard",
  lipsyncModel: process.env.LIPSYNC_MODEL || "veed/lipsync",
  voiceInstructions: process.env.VOICE_INSTRUCTIONS || "",
  childPitch: numberEnv("CHILD_VOICE_PITCH", 1.15, { min: 1, max: 1.5 }),
  animationEngine: process.env.ANIMATION_ENGINE || "replicate",
  fallbackToLocal: booleanEnv("FALLBACK_TO_LOCAL", true),

  /* ── QUALITY / UPSCALE SETTINGS ── */
  upscaleEnabled: booleanEnv("UPSCALE_ENABLED", true),
  upscaleScale: numberEnv("UPSCALE_SCALE", 2, { min: 1, max: 4 }),
  brightnessThreshold: numberEnv("BRIGHTNESS_THRESHOLD", 60, {
    min: 0,
    max: 255,
  }),
  assemblyCrf: numberEnv("ASSEMBLY_CRF", 18, { min: 0, max: 51 }),
  assemblyPreset: process.env.ASSEMBLY_PRESET || "slow",
  assemblyAudioBitrate: process.env.ASSEMBLY_AUDIO_BITRATE || "256k",

  sceneSeconds: numberEnv("SCENE_SECONDS_TARGET", 9, { min: 4, max: 30 }),
  imageConcurrency: numberEnv("IMAGE_CONCURRENCY", 2, { min: 1, max: 10 }),
  videoConcurrency: numberEnv("VIDEO_CONCURRENCY", 2, { min: 1, max: 10 }),
  clipSeconds: numberEnv("CLIP_SECONDS", 5, { min: 2, max: 15 }),
  bgmPath: process.env.BGM_PATH || "",
  burnSubtitles: booleanEnv("BURN_SUBTITLES", true),
  creatorName: process.env.CREATOR_NAME || "",
  watermarkText: process.env.FREE_WATERMARK_TEXT || "Made with CineAssemble",

  dataRoot,
  privateStorageRoot,
  tempRoot: path.resolve(process.env.TEMP_ROOT || path.join(dataRoot, "tmp")),
  jobsDir: path.resolve(process.env.JOBS_DIR || path.join(dataRoot, "jobs")),
  storageProvider: process.env.STORAGE_PROVIDER || "local",
  s3: {
    endpoint: process.env.S3_ENDPOINT || "",
    region: process.env.S3_REGION || "us-east-1",
    bucket: process.env.S3_BUCKET || "",
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
    forcePathStyle: booleanEnv("S3_FORCE_PATH_STYLE", false),
  },

  uploadMaxBytes: numberEnv("UPLOAD_MAX_BYTES", 20 * 1024 * 1024, {
    min: 1024,
    max: 100 * 1024 * 1024,
  }),
  uploadMaxPixels: numberEnv("UPLOAD_MAX_PIXELS", 40_000_000, {
    min: 1_000_000,
    max: 100_000_000,
  }),
  providerDownloadMaxBytes: numberEnv(
    "PROVIDER_DOWNLOAD_MAX_BYTES",
    500 * 1024 * 1024,
    { min: 1024, max: 2 * 1024 * 1024 * 1024 },
  ),

  workerId:
    process.env.WORKER_ID ||
    `${process.env.HOSTNAME || "worker"}-${crypto.randomBytes(4).toString("hex")}`,
  workerPollMs: numberEnv("WORKER_POLL_MS", 2000, { min: 250, max: 60_000 }),
  workerLeaseSeconds: numberEnv("WORKER_LEASE_SECONDS", 300, {
    min: 30,
    max: 3600,
  }),
  workerHeartbeatSeconds: numberEnv("WORKER_HEARTBEAT_SECONDS", 30, {
    min: 5,
    max: 300,
  }),
  workerConcurrency: numberEnv("WORKER_CONCURRENCY", 1, { min: 1, max: 10 }),

  pythonBin: process.env.PYTHON_BIN || "python3",
  ffmpegBin: process.env.FFMPEG_BIN || "ffmpeg",
  ffprobeBin: process.env.FFPROBE_BIN || "ffprobe",
};

export const TIERS = {
  budget: {
    id: "budget",
    label: "Budget",
    engine: "local",
    imageQuality: "low",
    clipCost: 0,
    creditMultiplier: 1,
  },
  standard: {
    id: "standard",
    label: "Standard",
    engine: "replicate",
    falModel: config.falModel,
    replicateFallbackModel: "kwaivgi/kling-v1.6-standard",
    imageQuality: "medium",
    clipCost: 0.2,
    creditMultiplier: 2,
  },
  premium: {
    id: "premium",
    label: "Premium",
    engine: "replicate",
    replicateModel: config.videoModel,
    imageQuality: "high",
    clipCost: 0.25,
    creditMultiplier: 4,
  },
};

export const PRICES = {
  script: 0.01,
  ttsPerScene: 0.003,
  image: { low: 0.02, medium: 0.05, high: 0.19 },
  lipsyncPerMin: 0.4,
};

export function estimateCredits({
  targetMinutes,
  qualityTier,
  lipsync = false,
}) {
  const tier = TIERS[qualityTier] || TIERS.budget;
  const base = Math.max(1, Number(targetMinutes) || 1) * tier.creditMultiplier;
  return Math.ceil(base + (lipsync ? Math.max(1, targetMinutes) : 0));
}

export function assertEnv({ includeDatabase = false } = {}) {
  const missing = [];
  if (!config.openaiApiKey) missing.push("OPENAI_API_KEY");
  if (!config.replicateToken && config.animationEngine !== "local") {
    missing.push("REPLICATE_API_TOKEN");
  }
  if (includeDatabase && !config.databaseUrl && !config.database.password) {
    missing.push("DATABASE_URL or MYSQL_PASSWORD");
  }
  if (production && !config.appSecret) missing.push("APP_SECRET");
  return missing;
}

export function assertProductionConfig() {
  const errors = [];
  if (!production) return errors;
  if (!config.appSecret || config.appSecret.length < 32) {
    errors.push(
      "APP_SECRET must contain at least 32 characters in production.",
    );
  }
  if (!config.appUrl.startsWith("https://")) {
    errors.push("APP_URL must use HTTPS in production.");
  }
  if (!config.cookieSecure) {
    errors.push("SESSION_COOKIE_SECURE must be true in production.");
  }
  if (!config.databaseUrl && !config.database.password) {
    errors.push("A MySQL connection must be configured in production.");
  }
  return errors;
}
