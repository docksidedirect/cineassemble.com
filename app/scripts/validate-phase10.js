import assert from "node:assert/strict";
import crypto from "node:crypto";
import sharp from "sharp";
import request from "supertest";
import { createApp } from "../server/index.js";
import { closePool, parseJson, queryOne } from "../server/db/pool.js";
import { ensurePrivateStorage } from "../server/media/storage.js";

const suffix = crypto.randomBytes(5).toString("hex");

async function latestToken(email, template) {
  const row = await queryOne(
    `SELECT payload FROM email_outbox
     WHERE recipient = :email AND template = :template
     ORDER BY created_at DESC LIMIT 1`,
    { email, template },
  );
  const payload = parseJson(row.payload, {});
  return new URL(payload.verificationUrl || payload.resetUrl).searchParams.get("token");
}

async function authenticatedAgent(app, label) {
  const agent = request.agent(app);
  const emailLabel = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const email = `${emailLabel}-${suffix}@example.test`;
  const password = `HTTP Boundary Password ${label} ${suffix}!`;
  const registration = await agent.post("/api/auth/register").send({
    email,
    password,
    displayName: label,
  });
  assert.equal(registration.status, 202);
  const token = await latestToken(email, "verify_email");
  const verification = await agent.post("/api/auth/verify-email").send({ token });
  assert.equal(verification.status, 200);
  const login = await agent.post("/api/auth/login").send({ email, password });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.email, email);
  const csrf = await agent.get("/api/auth/csrf");
  assert.equal(csrf.status, 200);
  return { agent, user: login.body.user, csrfToken: csrf.body.csrfToken };
}

async function main() {
  await ensurePrivateStorage();
  const app = createApp();

  const live = await request(app).get("/health/live");
  assert.equal(live.status, 200);
  assert.equal(live.body.ok, true);
  assert.equal(live.headers["x-powered-by"], undefined);
  assert.ok(live.headers["content-security-policy"]);

  const meta = await request(app).get("/api/meta");
  assert.equal(meta.status, 200);
  assert.equal(meta.body.videoTypes.length, 7);

  const unauthenticated = await request(app).get("/api/jobs");
  assert.equal(unauthenticated.status, 401);
  const publicMedia = await request(app).get("/media/anything/final.mp4");
  assert.equal(publicMedia.status, 404);

  const owner = await authenticatedAgent(app, "HTTP Owner");
  const stranger = await authenticatedAgent(app, "HTTP Stranger");

  const noCsrf = await owner.agent.post("/api/jobs/draft").send({});
  assert.equal(noCsrf.status, 403);
  assert.equal(noCsrf.body.error.code, "CSRF_VALIDATION_FAILED");

  const productImage = await sharp({
    create: {
      width: 300,
      height: 420,
      channels: 4,
      background: { r: 232, g: 65, b: 88, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  const upload = await owner.agent
    .post("/api/library/products")
    .set("X-CSRF-Token", owner.csrfToken)
    .field("name", "Exact HTTP Product")
    .field("strictFidelity", "true")
    .field("preservationNotes", "Keep the exact packaging.")
    .attach("file", productImage, {
      filename: "exact-product.png",
      contentType: "image/png",
    });
  assert.equal(upload.status, 201);
  const product = upload.body.product;
  assert.equal(product.strictFidelity, true);

  const strangerProduct = await stranger.agent.get(
    `/api/library/products/${product.id}`,
  );
  assert.equal(strangerProduct.status, 404);
  const strangerAsset = await stranger.agent.get(
    `/api/media/assets/${product.originalAsset.id}`,
  );
  assert.equal(strangerAsset.status, 404);

  const range = await owner.agent
    .get(`/api/media/assets/${product.originalAsset.id}`)
    .set("Range", "bytes=0-9");
  assert.equal(range.status, 206);
  assert.equal(Number(range.headers["content-length"]), 10);
  assert.match(range.headers["content-range"], /^bytes 0-9\//);

  const draftResponse = await owner.agent
    .post("/api/jobs/draft")
    .set("X-CSRF-Token", owner.csrfToken)
    .send({
      prompt: "Create a professional vertical promotion using my exact uploaded product.",
      filmType: "product_promo",
      languageCode: "en",
      aspectRatio: "9:16",
      targetMinutes: 1,
      voice: "auto",
      qualityTier: "budget",
      stylePreset: "product_photography",
      mode: "narration",
      subtitles: true,
      karaokeCaptions: true,
      lipsync: false,
      productIds: [product.id],
      referenceIds: [],
    });
  assert.equal(draftResponse.status, 201);
  assert.equal(draftResponse.body.job.filmType, "product_promo");
  assert.equal(draftResponse.body.job.aspectRatio, "9:16");
  assert.equal(draftResponse.body.job.attachedAssets[0].productId, product.id);
  const jobId = draftResponse.body.job.id;

  const crossTenantRead = await stranger.agent.get(`/api/jobs/${jobId}`);
  assert.equal(crossTenantRead.status, 404);
  const crossTenantDelete = await stranger.agent
    .delete(`/api/jobs/${jobId}`)
    .set("X-CSRF-Token", stranger.csrfToken);
  assert.equal(crossTenantDelete.status, 404);
  const ownerStillHasJob = await owner.agent.get(`/api/jobs/${jobId}`);
  assert.equal(ownerStillHasJob.status, 200);

  const deniedOrigin = await request(app)
    .get("/api/meta")
    .set("Origin", "https://attacker.example");
  assert.equal(deniedOrigin.status, 403);
  assert.equal(deniedOrigin.body.error.code, "ORIGIN_NOT_ALLOWED");

  console.log(
    JSON.stringify(
      {
        ok: true,
        hardenedHeaders: true,
        nativeSessionAuth: true,
        csrfEnforced: true,
        corsAllowlist: true,
        tenantJobIsolation: true,
        tenantAssetIsolation: true,
        privateRangeStreaming: true,
        publicMediaRemoved: true,
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
