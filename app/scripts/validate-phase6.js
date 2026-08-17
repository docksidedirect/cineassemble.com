import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import sharp from "sharp";
import { closePool } from "../server/db/pool.js";
import * as users from "../server/db/repositories/users.js";
import * as jobs from "../server/db/repositories/jobs.js";
import * as assets from "../server/db/repositories/assets.js";
import {
  createProductFromUpload,
  createReferenceFromUpload,
} from "../server/services/library-service.js";
import { resolvePrivateLocalPath } from "../server/media/storage.js";
import { UploadValidationError } from "../server/media/uploads.js";
import { listVideoTypes } from "../server/video-types.js";
import { createDraftSchema } from "../server/validation/video.js";

const suffix = crypto.randomBytes(5).toString("hex");

async function createUser(name) {
  const id = await users.createUser({
    email: `${name}-${suffix}@example.test`,
    displayName: name,
    passwordHash: "$argon2id$validation-placeholder",
    status: "active",
  });
  await users.markEmailVerified(id);
  return users.findUserById(id);
}

async function sampleImage() {
  return sharp({
    create: {
      width: 320,
      height: 320,
      channels: 4,
      background: { r: 20, g: 120, b: 200, alpha: 1 },
    },
  })
    .composite([
      {
        input: Buffer.from(
          '<svg width="320" height="320"><rect x="70" y="50" width="180" height="220" rx="24" fill="#f59e0b"/></svg>',
        ),
      },
    ])
    .png()
    .toBuffer();
}

async function main() {
  const owner = await createUser("video-owner");
  const stranger = await createUser("video-stranger");
  const png = await sampleImage();

  const productResult = await createProductFromUpload({
    user: owner,
    file: {
      buffer: png,
      mimetype: "image/png",
      originalname: "../Exact Product.png",
    },
    fields: {
      name: "Exact Product",
      strictFidelity: "true",
      preservationNotes: "Preserve every label and proportion.",
    },
  });
  assert.equal(productResult.ok, true);
  assert.equal(productResult.product.strictFidelity, true);

  const storedAsset = await assets.getAssetById(
    owner.id,
    productResult.product.originalAssetId,
    { includeStorageKey: true },
  );
  assert.ok(storedAsset.storageKey.startsWith(`tenants/${owner.id}/products/`));
  assert.equal(storedAsset.mimeType, "image/png");
  assert.equal(storedAsset.width, 320);
  assert.equal(storedAsset.height, 320);
  const privatePath = resolvePrivateLocalPath(storedAsset.storageKey);
  assert.ok((await fs.stat(privatePath)).isFile());
  assert.equal(privatePath.includes("/dist/"), false);
  assert.equal(privatePath.includes("/public/"), false);
  assert.equal(await assets.getAssetById(stranger.id, storedAsset.id), null);

  const referenceResult = await createReferenceFromUpload({
    user: owner,
    file: {
      buffer: png,
      mimetype: "image/png",
      originalname: "Presenter Reference.png",
    },
    fields: {
      name: "Presenter",
      referenceType: "human",
      preservationNotes: "Preserve identity and natural features.",
    },
  });
  assert.equal(referenceResult.ok, true);
  assert.equal(referenceResult.reference.referenceType, "human");
  assert.equal(
    await assets.getReferenceById(stranger.id, referenceResult.reference.id),
    null,
  );

  const types = listVideoTypes();
  assert.deepEqual(
    new Set(types.map((type) => type.id)),
    new Set([
      "cartoon_story",
      "product_promo",
      "realistic_human",
      "social_ad",
      "explainer",
      "cinematic_story",
      "reference_video",
    ]),
  );

  for (const type of types) {
    const needsProduct = type.id === "product_promo";
    const needsReference = type.id === "reference_video";
    const parsed = createDraftSchema.safeParse({
      prompt: `Validation brief for ${type.label}`,
      filmType: type.id,
      languageCode: "en",
      aspectRatio: type.defaultAspectRatio,
      targetMinutes: type.minMinutes,
      voice: "auto",
      qualityTier: "budget",
      stylePreset: "validation",
      mode: "narration",
      subtitles: true,
      karaokeCaptions: false,
      lipsync: false,
      productIds: needsProduct ? [productResult.product.id] : [],
      referenceIds: needsReference ? [referenceResult.reference.id] : [],
    });
    assert.equal(parsed.success, true, `${type.id} should validate`);
  }

  const draft = await jobs.createDraft(owner, {
    prompt: "Create a reference-led presenter video.",
    filmType: "reference_video",
    languageCode: "en",
    aspectRatio: "16:9",
    targetMinutes: 1,
    voice: "auto",
    qualityTier: "budget",
    stylePreset: "reference_matched",
    mode: "narration",
    subtitles: true,
    karaokeCaptions: false,
    lipsync: false,
    estimatedCostUsd: 0.1,
    estimatedCredits: 1,
  });
  assert.equal(
    await jobs.attachReference(
      owner.id,
      draft.id,
      referenceResult.reference.id,
    ),
    true,
  );
  assert.equal(
    await jobs.attachReference(
      stranger.id,
      draft.id,
      referenceResult.reference.id,
    ),
    false,
  );

  let spoofRejected = false;
  try {
    await createReferenceFromUpload({
      user: owner,
      file: {
        buffer: Buffer.from("<script>alert(1)</script>"),
        mimetype: "image/png",
        originalname: "malicious.png",
      },
      fields: { name: "Bad", referenceType: "general" },
    });
  } catch (error) {
    spoofRejected = error instanceof UploadValidationError;
  }
  assert.equal(spoofRejected, true);

  console.log(
    JSON.stringify(
      {
        ok: true,
        selectableVideoTypes: types.length,
        privateUploadNormalization: true,
        spoofedUploadRejected: true,
        referenceIsolation: true,
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
