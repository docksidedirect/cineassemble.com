import { config, estimateCredits, PRICES, TIERS } from "./config.js";
import { getVideoTypeStrategy } from "./video-types.js";

export function estimateSceneCount({ filmType, targetMinutes }) {
  const strategy = getVideoTypeStrategy(filmType);
  if (!strategy) throw new Error("Unknown video type.");
  const secondsPerScene = filmType === "social_ad" ? 6 : config.sceneSeconds;
  const raw = Math.round((targetMinutes * 60) / secondsPerScene);
  return Math.max(filmType === "social_ad" ? 6 : 8, Math.min(strategy.maxMinutes <= 2 ? 24 : 40, raw));
}

export function estimateJob(input) {
  const tier = TIERS[input.qualityTier] || TIERS.budget;
  const sceneCount = estimateSceneCount(input);
  const tts = sceneCount * PRICES.ttsPerScene;
  const images = sceneCount * (PRICES.image[tier.imageQuality] || PRICES.image.medium);
  const animation = sceneCount * tier.clipCost;
  const lipsync = input.lipsync
    ? input.targetMinutes * PRICES.lipsyncPerMin
    : 0;
  const script = PRICES.script;
  const estimatedCostUsd = Number(
    (script + tts + images + animation + lipsync).toFixed(4),
  );
  const credits = estimateCredits({
    targetMinutes: input.targetMinutes,
    qualityTier: input.qualityTier,
    lipsync: input.lipsync,
  });
  return {
    sceneCount,
    estimatedCostUsd,
    estimatedCredits: credits,
    breakdown: {
      script: Number(script.toFixed(4)),
      tts: Number(tts.toFixed(4)),
      images: Number(images.toFixed(4)),
      animation: Number(animation.toFixed(4)),
      lipsync: Number(lipsync.toFixed(4)),
    },
    qualityTier: tier.id,
    animationEngine: tier.engine,
  };
}

export function estimateSceneRegeneration(job, { regenerateAudio = false } = {}) {
  const tier = TIERS[job.qualityTier] || TIERS.budget;
  const image = PRICES.image[tier.imageQuality] || PRICES.image.medium;
  const animation = tier.clipCost;
  const tts = regenerateAudio ? PRICES.ttsPerScene : 0;
  const lipsync = job.lipsync
    ? (config.sceneSeconds / 60) * PRICES.lipsyncPerMin
    : 0;
  return {
    estimatedCostUsd: Number((image + animation + tts + lipsync).toFixed(4)),
    estimatedCredits: job.role === "admin" ? 0 : Math.max(1, tier.creditMultiplier),
    breakdown: { image, animation, tts, lipsync },
  };
}
