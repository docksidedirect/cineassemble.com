import { ASPECT_RATIOS, FILM_TYPES } from "./config.js";

const ALL_ASPECTS = Object.keys(ASPECT_RATIOS);

export const VIDEO_TYPE_STRATEGIES = Object.freeze({
  cartoon_story: Object.freeze({
    ...FILM_TYPES.cartoon_story,
    icon: "sparkles",
    modes: ["narration", "dialogue"],
    aspectRatios: ALL_ASPECTS,
    minMinutes: 1,
    maxMinutes: 5,
    defaultAspectRatio: "16:9",
    requiredAssetRoles: [],
    defaultStyle: "cinematic_3d",
    imageStrategy: "generate_or_reference_edit",
    scriptStrategy: "character_story",
    promptDirective:
      "Build a complete character-led animated story with a clear beginning, escalation, climax, and satisfying ending. Keep recurring characters visually consistent across every scene.",
    visualDirective:
      "Use 3D Pixar-quality CGI animation style. Miniature character scale, warm cinematic lighting, shallow depth of field, subsurface scattering on fur and skin, highly detailed textures, polished animated-film composition. Preserve any attached character reference identities and signature features.",
    recommendedFor: ["children stories", "mascots", "series", "education"],
  }),
  product_promo: Object.freeze({
    ...FILM_TYPES.product_promo,
    icon: "package",
    modes: ["narration", "dialogue"],
    aspectRatios: ALL_ASPECTS,
    minMinutes: 1,
    maxMinutes: 5,
    defaultAspectRatio: "9:16",
    requiredAssetRoles: ["product"],
    defaultStyle: "product_photography",
    imageStrategy: "product_high_fidelity_edit",
    scriptStrategy: "commercial_product",
    promptDirective:
      "Write a benefit-led product commercial with a strong opening hook, product demonstration, credible value proposition, objections handled naturally, and a clear final call to action.",
    visualDirective:
      "The attached real product is the visual source of truth. Preserve its exact silhouette, proportions, materials, colors, logo, labels, packaging, typography, and legally sensitive marks. Never cartoonize, redesign, rename, or invent product details.",
    recommendedFor: ["e-commerce", "launches", "product ads", "marketplaces"],
  }),
  realistic_human: Object.freeze({
    ...FILM_TYPES.realistic_human,
    icon: "user-round",
    modes: ["narration", "dialogue"],
    aspectRatios: ALL_ASPECTS,
    minMinutes: 1,
    maxMinutes: 5,
    defaultAspectRatio: "16:9",
    requiredAssetRoles: [],
    defaultStyle: "cinematic_realism",
    imageStrategy: "photoreal_reference_edit",
    scriptStrategy: "human_narrative",
    promptDirective:
      "Write a natural human-led film with believable actions, emotionally credible dialogue, realistic environments, and production-ready shot progression.",
    visualDirective:
      "Use photographic realism, natural anatomy, coherent wardrobe, physically plausible lighting, and consistent human identity. Preserve attached presenter or human references without beautification drift.",
    recommendedFor: ["testimonials", "presenters", "training", "lifestyle"],
  }),
  social_ad: Object.freeze({
    ...FILM_TYPES.social_ad,
    icon: "smartphone",
    modes: ["narration", "dialogue"],
    aspectRatios: ["9:16", "1:1", "16:9"],
    minMinutes: 1,
    maxMinutes: 2,
    defaultAspectRatio: "9:16",
    requiredAssetRoles: [],
    defaultStyle: "high_energy_social",
    imageStrategy: "commercial_adaptive",
    scriptStrategy: "short_form_ad",
    promptDirective:
      "Open with an immediate pattern-breaking hook, communicate one central promise, use fast visual beats and concise spoken lines, include social-proof or demonstration where appropriate, and finish with a direct call to action.",
    visualDirective:
      "Prioritize mobile-safe framing, close focal subjects, rapid visual variety, readable caption-safe zones, and strong first-frame impact. Preserve all attached products and people according to their reference rules.",
    recommendedFor: ["TikTok", "Reels", "Shorts", "paid social"],
  }),
  explainer: Object.freeze({
    ...FILM_TYPES.explainer,
    icon: "presentation",
    modes: ["narration", "dialogue"],
    aspectRatios: ALL_ASPECTS,
    minMinutes: 1,
    maxMinutes: 5,
    defaultAspectRatio: "16:9",
    requiredAssetRoles: [],
    defaultStyle: "clean_editorial",
    imageStrategy: "editorial_explainer",
    scriptStrategy: "structured_explainer",
    promptDirective:
      "Explain the subject in a logically sequenced problem-context-solution-proof-summary structure. Define unfamiliar terms, use concrete examples, and keep every scene focused on one learning objective.",
    visualDirective:
      "Use clean editorial scenes, purposeful demonstrations, uncluttered compositions, and visual metaphors that clarify rather than decorate. Do not generate illegible diagrams or invented interface text.",
    recommendedFor: ["services", "software", "training", "education"],
  }),
  cinematic_story: Object.freeze({
    ...FILM_TYPES.cinematic_story,
    icon: "clapperboard",
    modes: ["narration", "dialogue"],
    aspectRatios: ALL_ASPECTS,
    minMinutes: 1,
    maxMinutes: 5,
    defaultAspectRatio: "16:9",
    requiredAssetRoles: [],
    defaultStyle: "cinematic_3d",
    imageStrategy: "cinematic_realism",
    scriptStrategy: "cinematic_screenplay",
    promptDirective:
      "Write a cinematic short with strong visual storytelling, motivated character actions, escalating dramatic stakes, controlled pacing, and a memorable final image.",
    visualDirective:
      "Plan coherent cinematic coverage with establishing shots, medium action, close emotional detail, motivated camera movement, realistic continuity, and intentional lighting.",
    recommendedFor: ["short films", "trailers", "brand stories", "drama"],
  }),
  reference_video: Object.freeze({
    ...FILM_TYPES.reference_video,
    icon: "images",
    modes: ["narration", "dialogue"],
    aspectRatios: ALL_ASPECTS,
    minMinutes: 1,
    maxMinutes: 5,
    defaultAspectRatio: "16:9",
    requiredAssetRoles: ["reference"],
    defaultStyle: "reference_faithful",
    imageStrategy: "reference_high_fidelity_edit",
    scriptStrategy: "reference_led",
    promptDirective:
      "Build the film around the supplied reference subject and the user's objective. Do not replace the reference with a generic substitute; make each scene a purposeful continuation of the same visual subject.",
    visualDirective:
      "Treat attached references as authoritative for identity, shape, palette, materials, and distinguishing details. Match only requested stylistic dimensions and avoid uncontrolled redesign.",
    recommendedFor: ["artwork", "characters", "people", "campaign continuity"],
  }),
});

export function listVideoTypes() {
  return Object.values(VIDEO_TYPE_STRATEGIES).map((strategy) => ({
    id: strategy.id,
    label: strategy.label,
    description: strategy.description,
    icon: strategy.icon,
    modes: [...strategy.modes],
    aspectRatios: [...strategy.aspectRatios],
    defaultAspectRatio: strategy.defaultAspectRatio,
    minMinutes: strategy.minMinutes,
    maxMinutes: strategy.maxMinutes,
    requiredAssetRoles: [...strategy.requiredAssetRoles],
    requiredReferences: Object.fromEntries(
      strategy.requiredAssetRoles.map((role) => [role, 1]),
    ),
    optionalReferences: ["character", "human", "style", "general"].filter(
      (role) => !strategy.requiredAssetRoles.includes(role),
    ),
    referenceMode: strategy.referenceMode,
    supportedFormats: [...strategy.aspectRatios],
    defaultStyle: strategy.defaultStyle,
    preservationMode: strategy.imageStrategy,
    scriptFramework: strategy.scriptStrategy,
    visualPolicy: strategy.visualDirective,
    recommendedFor: [...strategy.recommendedFor],
  }));
}

export function getVideoTypeStrategy(id) {
  return VIDEO_TYPE_STRATEGIES[id] || null;
}

export function assertVideoTypeSelection({
  filmType,
  mode,
  aspectRatio,
  targetMinutes,
  attachedRoles = [],
}) {
  const strategy = getVideoTypeStrategy(filmType);
  if (!strategy) {
    return {
      ok: false,
      code: "INVALID_FILM_TYPE",
      message: "Choose a valid video type.",
    };
  }
  if (!strategy.modes.includes(mode)) {
    return {
      ok: false,
      code: "INVALID_VOICE_MODE",
      message: `${strategy.label} does not support the selected voice mode.`,
    };
  }
  if (!strategy.aspectRatios.includes(aspectRatio)) {
    return {
      ok: false,
      code: "INVALID_ASPECT_RATIO",
      message: `${strategy.label} does not support the selected aspect ratio.`,
    };
  }
  if (
    !Number.isFinite(targetMinutes) ||
    targetMinutes < strategy.minMinutes ||
    targetMinutes > strategy.maxMinutes
  ) {
    return {
      ok: false,
      code: "INVALID_DURATION",
      message: `${strategy.label} supports ${strategy.minMinutes}-${strategy.maxMinutes} minute videos.`,
    };
  }
  const roles = new Set(attachedRoles);
  const missingRoles = strategy.requiredAssetRoles.filter(
    (role) => !roles.has(role),
  );
  if (missingRoles.length) {
    return {
      ok: false,
      code: "MISSING_REFERENCE_ASSET",
      message: `Attach the required ${missingRoles.join(" and ")} reference before continuing.`,
      missingRoles,
    };
  }
  return { ok: true, strategy };
}

export function buildVideoTypeDirectives(filmType) {
  const strategy = getVideoTypeStrategy(filmType);
  if (!strategy) throw new Error(`Unknown video type: ${filmType}`);
  return {
    scriptStrategy: strategy.scriptStrategy,
    imageStrategy: strategy.imageStrategy,
    promptDirective: strategy.promptDirective,
    visualDirective: strategy.visualDirective,
  };
}

export const STYLE_PRESETS = Object.freeze({
  cinematic_3d: {
    label: "Cinematic 3D",
    engine: "3d_cinematic",
    supportsLipsync: true,
    supportsTalking: true,
  },
  product_photography: {
    label: "Premium product photography",
    engine: "product_static",
    supportsLipsync: false,
    supportsTalking: false,
  },
  documentary_realism: {
    label: "Documentary realism",
    engine: "realistic_video",
    supportsLipsync: true,
    supportsTalking: true,
  },
  clean_editorial: {
    label: "Clean editorial",
    engine: "2d_motion",
    supportsLipsync: true,
    supportsTalking: true,
  },
  high_energy_social: {
    label: "High-energy social",
    engine: "social_video",
    supportsLipsync: true,
    supportsTalking: true,
  },
  cinematic_realism: {
    label: "Cinematic realism",
    engine: "realistic_cinematic",
    supportsLipsync: true,
    supportsTalking: true,
  },
  reference_faithful: {
    label: "Reference-faithful",
    engine: "reference_match",
    supportsLipsync: true,
    supportsTalking: true,
  },
});

export const QUALITY_TIERS = Object.freeze({
  budget: {
    label: "Budget",
    maxResolution: "720p",
    motionQuality: "low",
    characterDetail: "low",
  },
  standard: {
    label: "Standard",
    maxResolution: "1080p",
    motionQuality: "medium",
    characterDetail: "medium",
  },
  premium: {
    label: "Premium",
    maxResolution: "4k",
    motionQuality: "high",
    characterDetail: "high",
  },
});

export function getStylePreset(id) {
  return STYLE_PRESETS[id] || STYLE_PRESETS.cinematic_3d;
}

export function buildProductionConfig(userChoices) {
  const strategy = getVideoTypeStrategy(userChoices.filmType);
  const style = getStylePreset(
    userChoices.stylePreset || strategy?.defaultStyle || "cinematic_3d",
  );

  const mode = userChoices.mode || strategy?.defaultMode || "narration";
  const lipsync = mode === "dialogue" ? true : userChoices.lipsync !== false;
  const qualityTier = QUALITY_TIERS[userChoices.qualityTier]
    ? userChoices.qualityTier
    : "standard";

  return {
    ...userChoices,
    filmType: strategy?.id || userChoices.filmType,
    stylePreset:
      userChoices.stylePreset || strategy?.defaultStyle || "cinematic_3d",
    mode,
    lipsync,
    qualityTier,
    _engine: style.engine,
    _supportsTalking: style.supportsTalking,
    _supportsLipsync: style.supportsLipsync,
  };
}

export default VIDEO_TYPE_STRATEGIES;
