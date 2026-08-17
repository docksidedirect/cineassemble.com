import { config, SUPPORTED_LANGUAGES } from "../config.js";
import {
  buildVideoTypeDirectives,
  getVideoTypeStrategy,
} from "../video-types.js";

const VOICES = [
  "alloy",
  "ash",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
];

function languageLabel(code) {
  return (
    SUPPORTED_LANGUAGES.find((language) => language.code === code)?.label ||
    "English"
  );
}

function boundedSceneCount(job) {
  const strategy = getVideoTypeStrategy(job.filmType);
  const targetSeconds = job.filmType === "social_ad" ? 6 : config.sceneSeconds;
  const raw = Math.round((job.targetMinutes * 60) / targetSeconds);
  const minimum = job.filmType === "social_ad" ? 6 : 5;
  const maximum = strategy?.maxMinutes <= 2 ? 24 : 40;
  return Math.max(minimum, Math.min(maximum, raw));
}

function referenceSummary(context) {
  const products = (context.products || []).map((product, index) => ({
    role: `product:${index + 1}`,
    name: product.name,
    preservationNotes: product.preservationNotes || "",
    strictFidelity: Boolean(product.strictFidelity),
  }));
  const references = (context.references || []).map((reference, index) => ({
    role: `${reference.referenceType}:${index + 1}`,
    name: reference.name,
    description: reference.description || "",
    preservationNotes: reference.preservationNotes || "",
  }));
  return { products, references };
}

function modeRules(job) {
  if (job.mode === "dialogue") {
    return `
DIALOGUE MODE — STRICT REQUIREMENTS:
- This is a CHARACTER CONVERSATION film. Characters talk TO each other.
- EVERY scene MUST contain "lines": an array of 2–5 spoken dialogue lines.
- Each line: {"character": "ExactName", "text": "What they say aloud"}
- The "narration" field must be 1 SHORT sentence describing ONLY the visual action (camera, setting, movement).
- NEVER put the creative brief, plot summary, or scene description in "narration". Narration is VISUALS ONLY.
- Dialogue drives the story. The lines array is where the story happens.
- Example of a GOOD scene:
  {
    "narration": "Close-up on Benny's face in warm kitchen light.",
    "lines": [
      {"character": "Benny", "text": "I found something strange near the crumbs."},
      {"character": "Silvie", "text": "What is it? Show me!"}
    ],
    "image_prompt": "Close-up of Benny the blue pill-bug detective...",
    "motion_prompt": "Slow push-in on Benny's face..."
  }
- Example of a BAD scene (NEVER do this):
  {
    "narration": "A 3D Pixar-quality CGI animated short film. ABSOLUTELY NO HUMANS...",
    "lines": [],
    "image_prompt": "A 3D Pixar-quality CGI animated short film..."
  }
- Assign each recurring speaker one distinct voice from: ${VOICES.join(", ")}.
- Talking shots must keep the active speaker's face and mouth visible in medium or close framing.
- Avoid large camera moves while a character is speaking so lip-sync remains credible.
- NEVER include stage directions, meta-comments, or labels like "[narration starts]", "[narration ends]", "[scene opens]", or "[cut to]" in any field.
- The "text" field must contain ONLY the spoken words — no character name prefix, no quotation marks, no action descriptions.`;
  }
  return `
NARRATION MODE:
- Use one narrator or presenter voice throughout.
- Each scene must contain "narration": 1–3 concise sentences suitable for approximately ${Math.round(config.sceneSeconds * 2.3)} spoken words.
- The narration must advance the film; do not merely describe the image.
- "lines" array should be empty.
- NEVER include meta-comments like "[narration starts]", "[music fades]", or "[cut to]" in the narration.`;
}

export function buildScriptRequest(job, context = {}) {
  const strategy = getVideoTypeStrategy(job.filmType);
  if (!strategy) throw new Error(`Unknown film type: ${job.filmType}`);
  const directives = buildVideoTypeDirectives(job.filmType);
  const sceneCount = boundedSceneCount(job);
  const language = languageLabel(job.languageCode);
  const references = referenceSummary(context);

  const system = `You are a senior film director and screenplay writer.
Create a production-ready scene plan. Follow these rules EXACTLY.

SELECTED VIDEO TYPE: ${strategy.label} (${strategy.id})
SCRIPT STRATEGY: ${directives.scriptStrategy}
PRIMARY OBJECTIVE:
${directives.promptDirective}

VISUAL PRODUCTION CONTRACT:
${directives.visualDirective}

ABSOLUTE RULES — VIOLATING ANY OF THESE IS A FAILURE:
1. Write exactly ${sceneCount} scenes for an approximately ${job.targetMinutes}-minute film.
2. Write all title, narration, and dialogue in ${language}. Keep JSON property names in English.
3. Aspect ratio is ${job.aspectRatio}; compose every shot for that frame.
4. Art direction: ${job.stylePreset}.
5. Maintain character continuity — same names, same visual descriptions across all scenes.
6. NEVER put the user's creative brief into any scene field. The brief is your INSPIRATION, not copy-paste material.
7. NEVER put generated captions, logos, labels, watermarks, UI copy, or random letters into an image prompt.
8. "image_prompt" describes ONE production frame: subject, action, setting, lighting, framing.
9. "motion_prompt" describes movement for that frame without changing identities.
10. "reference_roles" lists only reference roles actually needed in that scene.
11. "shot_type" is one of: establishing, wide, medium, close-up, macro, overhead, insert, hero, demonstration.
12. Do not claim certifications, prices, guarantees, statistics, or features not in the brief.
${modeRules(job)}

REFERENCE CATALOG (use these exact names and designs):
${JSON.stringify(references, null, 2)}

Return ONLY valid JSON with this exact shape:
{
  "title": "short production title",
  "voice_direction": "one concise performance direction",
  "suggested_voice": "one of ${VOICES.join(", ")}",
  "characters": [
    {
      "name": "stable exact name",
      "description": "stable visual identity description",
      "voice": "one voice name",
      "child": false
    }
  ],
  "scenes": [
    {
      "narration": "1 short sentence of visual description ONLY",
      "lines": [{ "character": "exact name", "text": "spoken line" }],
      "image_prompt": "single-frame production description",
      "motion_prompt": "controlled movement description",
      "reference_roles": ["character:1"],
      "shot_type": "medium",
      "product_focus": false
    }
  ]
}`;

  const user = `USER PRODUCTION BRIEF (read this for inspiration, then write ORIGINAL content):
---
${job.prompt}
---

INSTRUCTIONS:
- Write a ${job.targetMinutes}-minute ${strategy.label} with ${sceneCount} scenes.
- The brief above describes the world and characters. DO NOT copy it into scene fields.
- Write ORIGINAL dialogue and action that moves a story forward.
- Each scene must be unique and advance the plot.
- Quality tier: ${job.qualityTier}. Focus on strong storytelling and continuity.`;

  return { system, user, sceneCount, references };
}

export function buildGeneratedScenePrompt(job, scene) {
  const strategy = getVideoTypeStrategy(job.filmType);
  return `${strategy.visualDirective}

Scene frame: ${scene.imagePrompt}
Shot type: ${scene.shotType || "medium"}.
Compose for ${job.aspectRatio}. ${job.subtitles ? "Keep the lower subtitle-safe region uncluttered." : "Use the full frame naturally."}
No text, captions, watermarks, signatures, UI, or invented branding.`;
}

export function buildReferenceEditPrompt(job, scene, references = []) {
  const strategy = getVideoTypeStrategy(job.filmType);
  const referenceRules = references
    .map(
      (reference, index) =>
        `Input ${index + 1} (${reference.name || reference.referenceType || "reference"}): ${reference.preservationNotes || "preserve identity, shape, palette, and distinguishing details"}.`,
    )
    .join("\n");
  return `Create the requested production frame by editing and placing the supplied reference image(s).

${strategy.visualDirective}
${referenceRules}

Scene: ${scene.imagePrompt}
Shot type: ${scene.shotType || "medium"}.
Composition: ${job.aspectRatio}; ${job.subtitles ? "keep the lower subtitle-safe region uncluttered" : "use the full frame naturally"}.

Change only the environment, composition, lighting, pose, or supporting elements required by the scene. Preserve reference identities and protected details. Do not replace a supplied subject with a generic substitute. Do not add captions, watermarks, signatures, random text, new logos, or invented product details.`;
}

export function buildProductEditPrompt(job, scene, products) {
  const productRules = products
    .map(
      (product, index) =>
        `Product input ${index + 1}, "${product.name}": preserve the exact silhouette, proportions, materials, colors, logo, label layout, packaging typography, and distinguishing marks. ${product.preservationNotes || ""}`,
    )
    .join("\n");
  return `Create a premium commercial scene using the supplied real product image(s) as authoritative source material.

NON-NEGOTIABLE PRODUCT FIDELITY:
${productRules}
Do not cartoonize, redraw, rename, relabel, reshape, recolor, simplify, or invent any part of a product. Never merge two products. The real product must remain recognizable and commercially accurate.

Scene: ${scene.imagePrompt}
Shot type: ${scene.shotType || "hero"}.
Frame: ${job.aspectRatio}. ${job.subtitles ? "Keep the lower subtitle-safe region uncluttered." : "Use the full frame naturally."}

You may create a realistic setting, lighting, props, atmosphere, and people around the product, but the supplied product remains the visual source of truth. Do not add captions, watermarks, signatures, prices, new logos, or unsupported claims.`;
}

export function buildProductBackgroundPrompt(job, scene) {
  return `Create a premium product-advertising background plate with an intentionally empty hero placement zone for a real product that will be composited afterward.
Scene concept: ${scene.imagePrompt}
Shot type: ${scene.shotType || "hero"}.
Frame: ${job.aspectRatio}. Leave the central 45% visually clear and physically plausible for product placement. Use realistic commercial lighting, depth, and supporting props around—but never inside—the empty placement zone. Do not generate any product, package, logo, text, price, watermark, or label.`;
}
