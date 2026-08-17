import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ASPECT_RATIOS } from "../server/config.js";
import { buildScriptRequest, buildProductEditPrompt } from "../server/generation/prompts.js";
import { compositeExactProduct } from "../server/generation/product-compositor.js";
import { listVideoTypes } from "../server/video-types.js";

const outputDir = process.env.PHASE7_OUTPUT || "/tmp/cineassemble-phase7";

async function makeProduct() {
  return sharp({
    create: {
      width: 160,
      height: 240,
      channels: 4,
      background: { r: 230, g: 42, b: 68, alpha: 1 },
    },
  })
    .composite([
      {
        input: Buffer.from(
          '<svg width="160" height="240"><rect x="0" y="90" width="160" height="26" fill="#20d19b"/><circle cx="80" cy="55" r="27" fill="#f8fafc"/></svg>',
        ),
      },
    ])
    .png()
    .toBuffer();
}

async function verifyExactOpaqueRegion({ outputPath, productBuffer, width, height }) {
  const original = await sharp(productBuffer).ensureAlpha().raw().toBuffer();
  const left = Math.round((width - 160) / 2);
  const top = Math.round((height - 240) / 2);
  const extracted = await sharp(outputPath)
    .extract({ left, top, width: 160, height: 240 })
    .ensureAlpha()
    .raw()
    .toBuffer();
  assert.deepEqual(extracted, original, "Opaque product pixels must remain byte-identical");
}

async function main() {
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });

  const types = listVideoTypes();
  const systems = new Map();
  for (const type of types) {
    const job = {
      id: "00000000-0000-4000-8000-000000000001",
      userId: "00000000-0000-4000-8000-000000000002",
      filmType: type.id,
      targetMinutes: type.minMinutes,
      languageCode: "en",
      aspectRatio: type.defaultAspectRatio,
      stylePreset: "professional validation",
      mode: "narration",
      qualityTier: "budget",
      subtitles: true,
      prompt: `Create a ${type.label} about a trustworthy service.`,
    };
    const request = buildScriptRequest(job, {
      products:
        type.id === "product_promo"
          ? [
              {
                name: "Exact Bottle",
                strictFidelity: true,
                preservationNotes: "Keep the label unchanged.",
              },
            ]
          : [],
      references: [],
    });
    assert.match(request.system, new RegExp(`SELECTED VIDEO TYPE: ${type.label}`));
    assert.ok(request.sceneCount >= 6 && request.sceneCount <= 40);
    systems.set(type.id, request.system);
  }
  assert.notEqual(systems.get("cartoon_story"), systems.get("product_promo"));
  assert.notEqual(systems.get("social_ad"), systems.get("explainer"));
  assert.match(systems.get("social_ad"), /opening hook|pattern-breaking hook/i);
  assert.match(systems.get("explainer"), /problem-context-solution/i);
  assert.match(systems.get("cinematic_story"), /dramatic stakes/i);
  assert.doesNotMatch(
    systems.get("product_promo"),
    /all scenes must be.*cartoon/i,
  );

  const productPrompt = buildProductEditPrompt(
    {
      aspectRatio: "9:16",
      subtitles: true,
    },
    {
      imagePrompt: "A confident hero display in a modern studio.",
      shotType: "hero",
    },
    [
      {
        name: "Exact Bottle",
        preservationNotes: "Keep the label unchanged.",
      },
    ],
  );
  assert.match(productPrompt, /NON-NEGOTIABLE PRODUCT FIDELITY/);
  assert.match(productPrompt, /Do not cartoonize/);
  assert.match(productPrompt, /exact silhouette/);

  const productBuffer = await makeProduct();
  const artifacts = [];
  for (const [aspectRatio, format] of Object.entries(ASPECT_RATIOS)) {
    const backgroundPath = path.join(outputDir, `background-${aspectRatio.replace(":", "x")}.png`);
    const outputPath = path.join(outputDir, `exact-product-${aspectRatio.replace(":", "x")}.png`);
    await sharp({
      create: {
        width: format.width,
        height: format.height,
        channels: 4,
        background: { r: 16, g: 24, b: 40, alpha: 1 },
      },
    })
      .png()
      .toFile(backgroundPath);
    const result = await compositeExactProduct({
      backgroundPath,
      productBuffer,
      outputPath,
      aspectRatio,
      shotType: "hero",
    });
    assert.equal(result.width, format.width);
    assert.equal(result.height, format.height);
    assert.equal(result.preservationMode, "exact_composite");
    await verifyExactOpaqueRegion({
      outputPath,
      productBuffer,
      width: format.width,
      height: format.height,
    });
    artifacts.push(outputPath);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        distinctVideoStrategies: types.length,
        productPromptProtection: true,
        exactProductPixels: true,
        aspectRatios: Object.keys(ASPECT_RATIOS),
        artifacts,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
