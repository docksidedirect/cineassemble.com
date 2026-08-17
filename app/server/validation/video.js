import { z } from "zod";
import { ASPECT_RATIOS, SUPPORTED_LANGUAGES, TIERS } from "../config.js";
import VIDEO_TYPE_STRATEGIES from "../video-types.js";
const filmTypeIds = Object.keys(VIDEO_TYPE_STRATEGIES);
const aspectRatioIds = Object.keys(ASPECT_RATIOS);
const languageCodes = SUPPORTED_LANGUAGES.map((language) => language.code);
const tierIds = Object.keys(TIERS);

export const uuidSchema = z.string().uuid();

const draftFieldsSchema = z.object({
  prompt: z.string().trim().min(5).max(4000),
  filmType: z.enum(filmTypeIds),
  languageCode: z.enum(languageCodes).default("en"),
  aspectRatio: z.enum(aspectRatioIds),
  targetMinutes: z.number().int().min(1).max(5),
  voice: z.string().trim().min(1).max(40).default("auto"),
  qualityTier: z.enum(tierIds).default("budget"),
  stylePreset: z.preprocess(
    (val) =>
      val === "" || val === undefined || val === null ? "cinematic_3d" : val,
    z.string().trim().max(180),
  ),
  mode: z.enum(["narration", "dialogue"]).default("narration"),
  subtitles: z.boolean().default(true),
  karaokeCaptions: z.boolean().default(false),
  lipsync: z.boolean().default(false),
  colorGrade: z
    .enum(["bright_clean", "none", "warm", "cool", "high_contrast", "vintage"])
    .default("bright_clean"),
  transition: z.enum(["none", "fade", "crossfade"]).default("fade"),
  brandKitId: uuidSchema.nullable().optional(),
  productIds: z.array(uuidSchema).max(8).default([]),
  referenceIds: z.array(uuidSchema).max(12).default([]),
});

export const createDraftSchema = draftFieldsSchema.superRefine(
  (value, context) => {
    const strategy = VIDEO_TYPE_STRATEGIES[value.filmType];
    if (!strategy.aspectRatios.includes(value.aspectRatio)) {
      context.addIssue({
        code: "custom",
        path: ["aspectRatio"],
        message: `${strategy.label} does not support this aspect ratio.`,
      });
    }
    if (
      value.targetMinutes < strategy.minMinutes ||
      value.targetMinutes > strategy.maxMinutes
    ) {
      context.addIssue({
        code: "custom",
        path: ["targetMinutes"],
        message: `${strategy.label} supports ${strategy.minMinutes}–${strategy.maxMinutes} minute videos.`,
      });
    }
    if (value.filmType === "product_promo" && value.productIds.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["productIds"],
        message: "Attach at least one saved real product for a product promo.",
      });
    }
    if (
      value.filmType === "reference_video" &&
      value.referenceIds.length === 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["referenceIds"],
        message:
          "Attach at least one saved reference for a reference-led video.",
      });
    }
    if (value.lipsync && value.mode !== "dialogue") {
      context.addIssue({
        code: "custom",
        path: ["lipsync"],
        message: "Lip-sync is available for character dialogue mode.",
      });
    }
  },
);

export const updateDraftSchema = draftFieldsSchema
  .omit({ productIds: true, referenceIds: true })
  .partial();

export const sceneDraftSchema = z
  .object({
    narration: z.string().trim().max(2000).optional(),
    lines: z
      .array(
        z.object({
          character: z.string().trim().min(1).max(120),
          text: z.string().trim().min(1).max(500),
        }),
      )
      .max(12)
      .optional(),
    imagePrompt: z.string().trim().min(5).max(5000).optional(),
    motionPrompt: z.string().trim().min(3).max(2000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one scene change.",
  });

export const productMetadataSchema = z.object({
  name: z.string().trim().min(1).max(140),
  description: z.string().trim().max(3000).optional().default(""),
  strictFidelity: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((value) => value === true || value === "true")
    .default(true),
  preservationNotes: z.string().trim().max(3000).optional().default(""),
});

export const referenceMetadataSchema = z.object({
  name: z.string().trim().min(1).max(140),
  referenceType: z.enum(["character", "human", "style", "general"]),
  description: z.string().trim().max(3000).optional().default(""),
  preservationNotes: z.string().trim().max(3000).optional().default(""),
});

export function parseRequest(schema, value) {
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };
  console.error(
    "VALIDATION FAILED:",
    JSON.stringify(result.error.issues, null, 2),
  );
  return {
    ok: false,
    error: {
      code: "VALIDATION_FAILED",
      message: "Review the highlighted fields and try again.",
      fields: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    },
  };
}
