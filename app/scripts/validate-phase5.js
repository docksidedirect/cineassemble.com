import assert from "node:assert/strict";
import crypto from "node:crypto";
import { closePool } from "../server/db/pool.js";
import { migrate } from "../server/db/migrate.js";
import * as users from "../server/db/repositories/users.js";
import * as jobs from "../server/db/repositories/jobs.js";
import * as assets from "../server/db/repositories/assets.js";
import * as credits from "../server/db/repositories/credits.js";

const suffix = crypto.randomBytes(5).toString("hex");
const passwordHash = "$argon2id$validation-placeholder";

async function createVerifiedUser(email, displayName, role = "user") {
  const id = await users.createUser({
    email,
    displayName,
    passwordHash,
    role,
    status: "active",
  });
  await users.markEmailVerified(id);
  return users.findUserById(id);
}

async function addApprovedScript(user, draft) {
  const script = {
    title: `${draft.filmType} validation`,
    suggested_voice: "nova",
    voice_direction: "Clear and confident.",
    characters: [],
    scenes: [
      {
        narration: "A concise validation scene.",
        image_prompt: "A clean cinematic validation frame.",
        motion_prompt: "A subtle camera push in.",
      },
    ],
  };
  assert.equal(await jobs.replaceDraftScenes(user.id, draft.id, script), draft.id);
}

async function main() {
  await migrate({ logger: { info() {} } });

  const owner = await createVerifiedUser(
    `owner-${suffix}@example.test`,
    "Owner User",
  );
  const stranger = await createVerifiedUser(
    `stranger-${suffix}@example.test`,
    "Stranger User",
  );
  const admin = await createVerifiedUser(
    `admin-${suffix}@example.test`,
    "Unlimited Admin",
    "admin",
  );

  assert.equal(await credits.getCreditBalance(owner.id), 2);
  assert.equal(await credits.getCreditBalance(stranger.id), 2);

  const ownerDraft = await jobs.createDraft(owner, {
    prompt: "Show the exact uploaded coffee bag in a premium commercial.",
    filmType: "product_promo",
    languageCode: "en",
    aspectRatio: "9:16",
    targetMinutes: 1,
    voice: "auto",
    qualityTier: "budget",
    stylePreset: "product_photography",
    mode: "narration",
    subtitles: true,
    karaokeCaptions: false,
    lipsync: false,
    estimatedCostUsd: 0.2,
    estimatedCredits: 1,
  });

  assert.equal((await jobs.getJobById(owner.id, ownerDraft.id)).id, ownerDraft.id);
  assert.equal(await jobs.getJobById(stranger.id, ownerDraft.id), null);

  const originalAsset = await assets.createAsset({
    userId: owner.id,
    kind: "product_original",
    storageKey: `tenants/${owner.id}/products/${crypto.randomUUID()}.png`,
    originalName: "coffee-bag.png",
    mimeType: "image/png",
    byteSize: 2048,
    width: 1024,
    height: 1024,
    sha256: crypto.createHash("sha256").update(`asset-${suffix}`).digest("hex"),
  });
  const productId = await assets.createProduct({
    userId: owner.id,
    name: "Exact Coffee Bag",
    originalAssetId: originalAsset.id,
    strictFidelity: true,
    preservationNotes: "Do not change the logo, colors, label, or proportions.",
  });
  assert.ok(productId);
  assert.equal((await assets.getProductById(owner.id, productId)).name, "Exact Coffee Bag");
  assert.equal(await assets.getProductById(stranger.id, productId), null);
  assert.equal(await jobs.attachProduct(owner.id, ownerDraft.id, productId), true);
  assert.equal(await jobs.attachProduct(stranger.id, ownerDraft.id, productId), false);

  await addApprovedScript(owner, ownerDraft);
  const ownerApproval = await credits.reserveCreditsAndQueue(owner, ownerDraft.id);
  assert.equal(ownerApproval.ok, true);
  assert.equal(ownerApproval.unlimited, false);
  assert.equal(await credits.getCreditBalance(owner.id), 1);

  const adminDraft = await jobs.createDraft(admin, {
    prompt: "Create an unrestricted administrator validation film.",
    filmType: "cinematic_story",
    languageCode: "en",
    aspectRatio: "16:9",
    targetMinutes: 5,
    voice: "auto",
    qualityTier: "premium",
    stylePreset: "cinematic_realism",
    mode: "dialogue",
    subtitles: false,
    karaokeCaptions: false,
    lipsync: true,
    estimatedCostUsd: 30,
    estimatedCredits: 999,
  });
  await addApprovedScript(admin, adminDraft);
  const adminApproval = await credits.reserveCreditsAndQueue(admin, adminDraft.id);
  assert.equal(adminApproval.ok, true);
  assert.equal(adminApproval.unlimited, true);
  assert.equal(adminApproval.reservedCredits, 0);

  const claimed = await jobs.claimNextJob("phase5-validation-worker", 120);
  assert.ok(claimed);
  assert.ok([ownerDraft.id, adminDraft.id].includes(claimed.id));
  assert.equal(
    await jobs.heartbeatJob(claimed.id, "phase5-validation-worker", 120),
    true,
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        tenantIsolation: true,
        productIsolation: true,
        creditReservation: true,
        adminUnlimited: true,
        durableQueueClaim: true,
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
