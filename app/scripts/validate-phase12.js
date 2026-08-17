import assert from "node:assert/strict";
import crypto from "node:crypto";
import request from "supertest";
import { createApp } from "../server/index.js";
import { closePool, parseJson, query, queryOne } from "../server/db/pool.js";
import { ensurePrivateStorage } from "../server/media/storage.js";

const suffix = crypto.randomBytes(5).toString("hex");

async function latestVerificationToken(email) {
  const row = await queryOne(
    `SELECT payload FROM email_outbox
     WHERE recipient = :email AND template = 'verify_email'
     ORDER BY created_at DESC LIMIT 1`,
    { email },
  );
  const payload = parseJson(row.payload, {});
  return new URL(payload.verificationUrl).searchParams.get("token");
}

async function createAccount(app, label, role = "user") {
  const agent = request.agent(app);
  const email = `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${suffix}@example.test`;
  const password = `Final HTTP Password ${label} ${suffix}!`;
  const registration = await agent.post("/api/auth/register").send({
    email,
    password,
    displayName: label,
  });
  assert.equal(registration.status, 202);
  const token = await latestVerificationToken(email);
  const verified = await agent.post("/api/auth/verify-email").send({ token });
  assert.equal(verified.status, 200);
  if (role === "admin") {
    await query(
      `UPDATE users SET role = 'admin', status = 'active', email_verified_at = UTC_TIMESTAMP(3)
       WHERE email = :email`,
      { email },
    );
  }
  const login = await agent.post("/api/auth/login").send({ email, password });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.role, role);
  const csrf = await agent.get("/api/auth/csrf");
  assert.equal(csrf.status, 200);
  return {
    agent,
    user: login.body.user,
    csrfToken: csrf.body.csrfToken,
  };
}

async function main() {
  await ensurePrivateStorage();
  const app = createApp();

  const meta = await request(app).get("/api/meta?contract=2");
  assert.equal(meta.status, 200);
  assert.match(meta.headers["cache-control"], /no-store/);
  assert.equal(meta.body.videoTypes.length, 7);
  assert.equal(Array.isArray(meta.body.languages), false);
  assert.equal(meta.body.languages.en, "English");
  for (const type of meta.body.videoTypes) {
    assert.ok(type.requiredReferences);
    assert.ok(type.defaultStyle);
    assert.ok(type.preservationMode);
    assert.ok(type.scriptFramework);
    assert.deepEqual(type.supportedFormats, type.aspectRatios);
  }
  const productType = meta.body.videoTypes.find((type) => type.id === "product_promo");
  assert.equal(productType.requiredReferences.product, 1);

  const staticShell = await request(app).get("/");
  assert.equal(staticShell.status, 200);
  assert.match(staticShell.text, /CineAssemble — AI Film Studio/);

  const member = await createAccount(app, "Final Member");
  const administrator = await createAccount(app, "Final Administrator", "admin");

  const deniedDashboard = await member.agent.get("/api/admin/dashboard");
  assert.equal(deniedDashboard.status, 403);
  assert.equal(deniedDashboard.body.error.code, "ADMIN_REQUIRED");

  const allowedDashboard = await administrator.agent.get("/api/admin/dashboard");
  assert.equal(allowedDashboard.status, 200);
  assert.ok(allowedDashboard.body.users.total >= 2);

  const deniedAdjustment = await member.agent
    .post(`/api/admin/users/${member.user.id}/credits`)
    .set("X-CSRF-Token", member.csrfToken)
    .send({ amount: 7, reason: "Unauthorized attempt" });
  assert.equal(deniedAdjustment.status, 403);

  const allowedAdjustment = await administrator.agent
    .post(`/api/admin/users/${member.user.id}/credits`)
    .set("X-CSRF-Token", administrator.csrfToken)
    .send({ amount: 7, reason: "Final validation credit grant" });
  assert.equal(allowedAdjustment.status, 200);
  const granted = await queryOne(
    `SELECT COALESCE(SUM(amount), 0) AS balance
     FROM credit_ledger WHERE user_id = :userId`,
    { userId: member.user.id },
  );
  assert.ok(Number(granted.balance) >= 7);

  const selfDemotion = await administrator.agent
    .patch(`/api/admin/users/${administrator.user.id}/role`)
    .set("X-CSRF-Token", administrator.csrfToken)
    .send({ role: "user" });
  assert.equal(selfDemotion.status, 409);
  const adminStillAdmin = await queryOne(
    `SELECT role FROM users WHERE id = :userId`,
    { userId: administrator.user.id },
  );
  assert.equal(adminStillAdmin.role, "admin");

  console.log(
    JSON.stringify(
      {
        ok: true,
        metadataContract: true,
        noStaleMetadataCaching: true,
        productionBranding: true,
        nonAdminDenied: true,
        adminDashboardProtected: true,
        adminCreditAdjustmentAudited: true,
        adminSelfDemotionBlocked: true,
        adminUnlimitedServerRole: true,
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
