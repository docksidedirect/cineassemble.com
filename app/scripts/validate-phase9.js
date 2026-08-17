import assert from "node:assert/strict";
import crypto from "node:crypto";
import argon2 from "argon2";
import { closePool, parseJson, query, queryOne } from "../server/db/pool.js";
import {
  loginAccount,
  registerAccount,
  requestPasswordReset,
  resetPassword,
  rotateCsrf,
  verifyEmail,
} from "../server/services/auth-service.js";
import {
  createUser,
  findSessionByTokenHash,
  findUserById,
  markEmailVerified,
} from "../server/db/repositories/users.js";
import * as jobs from "../server/db/repositories/jobs.js";
import {
  getCreditBalance,
  reserveCreditsAndQueue,
} from "../server/db/repositories/credits.js";
import {
  findSubscriptionByProviderId,
  grantSubscriptionCredits,
  upsertSubscription,
} from "../server/db/repositories/billing.js";
import { tokenHash } from "../server/security/tokens.js";

const suffix = crypto.randomBytes(5).toString("hex");
const context = {
  requestId: crypto.randomUUID(),
  ip: "203.0.113.42",
  userAgent: "CineAssemble phase-nine validation",
};

async function tokenFromOutbox(recipient, template) {
  const row = await queryOne(
    `SELECT payload FROM email_outbox
     WHERE recipient = :recipient AND template = :template
     ORDER BY created_at DESC LIMIT 1`,
    { recipient, template },
  );
  const payload = parseJson(row.payload, {});
  const url = new URL(payload.verificationUrl || payload.resetUrl);
  return url.searchParams.get("token");
}

async function readyDraft(user, label, estimatedCredits = 1) {
  const draft = await jobs.createDraft(user, {
    prompt: `${label} validation film`,
    filmType: "cartoon_story",
    languageCode: "en",
    aspectRatio: "16:9",
    targetMinutes: 1,
    voice: "nova",
    qualityTier: "budget",
    stylePreset: "cinematic_3d",
    mode: "narration",
    subtitles: true,
    karaokeCaptions: false,
    lipsync: false,
    estimatedCostUsd: 0.1,
    estimatedCredits,
  });
  await jobs.replaceDraftScenes(user.id, draft.id, {
    title: label,
    voice_direction: "Natural.",
    suggested_voice: "nova",
    characters: [],
    scenes: [
      {
        narration: "A secure validation scene.",
        image_prompt: "A secure cinematic validation frame.",
        motion_prompt: "A restrained camera move.",
      },
    ],
  });
  return draft;
}

async function main() {
  const email = `native-auth-${suffix}@example.test`;
  const password = `Correct Horse Battery ${suffix}!`;
  const replacement = `Replacement Secure Password ${suffix}!`;

  const registration = await registerAccount(
    { email, password, displayName: "Native Auth User" },
    context,
  );
  assert.equal(registration.ok, true);

  const verificationToken = await tokenFromOutbox(email, "verify_email");
  assert.ok(verificationToken);
  const tokenRow = await queryOne(
    `SELECT token_hash FROM auth_tokens WHERE purpose = 'verify_email'
     ORDER BY created_at DESC LIMIT 1`,
  );
  assert.notEqual(tokenRow.token_hash, verificationToken);
  assert.equal(tokenRow.token_hash, tokenHash(verificationToken));
  assert.equal((await verifyEmail(verificationToken, context)).ok, true);
  assert.equal((await verifyEmail(verificationToken, context)).ok, false);

  const badLogin = await loginAccount({ email, password: "definitely-wrong" }, context);
  assert.equal(badLogin.ok, false);
  assert.equal(badLogin.error.code, "INVALID_CREDENTIALS");

  const login = await loginAccount({ email, password }, context);
  assert.equal(login.ok, true);
  assert.equal(login.user.role, "user");
  assert.equal(login.user.unlimited, false);
  const storedSession = await findSessionByTokenHash(tokenHash(login.session.sessionToken));
  assert.equal(storedSession.user.id, login.user.id);
  const rawTokenLeak = await queryOne(
    `SELECT id FROM sessions WHERE token_hash = :raw LIMIT 1`,
    { raw: login.session.sessionToken },
  );
  assert.equal(rawTokenLeak, null);
  assert.ok(await rotateCsrf(login.session.sessionId));

  await requestPasswordReset(email, context);
  const resetToken = await tokenFromOutbox(email, "reset_password");
  assert.ok(resetToken);
  assert.equal((await resetPassword({ token: resetToken, password: replacement }, context)).ok, true);
  assert.equal(await findSessionByTokenHash(tokenHash(login.session.sessionToken)), null);
  assert.equal((await loginAccount({ email, password }, context)).ok, false);
  const replacementLogin = await loginAccount({ email, password: replacement }, context);
  assert.equal(replacementLogin.ok, true);

  const firstTrial = await readyDraft(replacementLogin.user, "First trial");
  const firstApproval = await reserveCreditsAndQueue(replacementLogin.user, firstTrial.id);
  assert.equal(firstApproval.ok, true);
  const secondTrial = await readyDraft(replacementLogin.user, "Second trial");
  const secondApproval = await reserveCreditsAndQueue(replacementLogin.user, secondTrial.id);
  assert.equal(secondApproval.ok, false);
  assert.equal(secondApproval.code, "TRIAL_ALREADY_USED");

  const adminEmail = `unlimited-admin-${suffix}@example.test`;
  const adminPassword = `Admin High Entropy Password ${suffix}!`;
  const adminHash = await argon2.hash(adminPassword, { type: argon2.argon2id });
  const adminId = await createUser({
    email: adminEmail,
    displayName: "Unlimited Admin",
    passwordHash: adminHash,
    role: "admin",
    status: "active",
  });
  await markEmailVerified(adminId);
  const adminLogin = await loginAccount(
    { email: adminEmail, password: adminPassword },
    context,
  );
  assert.equal(adminLogin.ok, true);
  assert.equal(adminLogin.user.unlimited, true);
  const expensiveAdminDraft = await readyDraft(adminLogin.user, "Unlimited admin", 1000000);
  const adminApproval = await reserveCreditsAndQueue(
    adminLogin.user,
    expensiveAdminDraft.id,
  );
  assert.equal(adminApproval.ok, true);
  assert.equal(adminApproval.unlimited, true);
  assert.equal(adminApproval.reservedCredits, 0);

  const paidEmail = `billing-${suffix}@example.test`;
  const paidId = await createUser({
    email: paidEmail,
    displayName: "Billing User",
    passwordHash: adminHash,
    status: "active",
  });
  await markEmailVerified(paidId);
  const creatorPlan = await queryOne(`SELECT id FROM plans WHERE code = 'creator' LIMIT 1`);
  const providerSubscriptionId = `I-VALIDATION-${suffix}`;
  await upsertSubscription({
    userId: paidId,
    planId: creatorPlan.id,
    providerSubscriptionId,
    status: "active",
  });
  const subscription = await findSubscriptionByProviderId(providerSubscriptionId);
  const balanceBefore = await getCreditBalance(paidId);
  await grantSubscriptionCredits({ subscription, providerEventId: `EV-${suffix}` });
  await grantSubscriptionCredits({ subscription, providerEventId: `EV-${suffix}` });
  const balanceAfter = await getCreditBalance(paidId);
  assert.equal(balanceAfter - balanceBefore, subscription.monthlyCredits);

  const passwordRow = await queryOne(
    `SELECT password_hash FROM users WHERE id = :userId`,
    { userId: replacementLogin.user.id },
  );
  assert.match(passwordRow.password_hash, /^\$argon2id\$/);

  console.log(
    JSON.stringify(
      {
        ok: true,
        nativeEmailPasswordAuth: true,
        emailVerificationSingleUse: true,
        argon2idPasswords: true,
        opaqueHashedSessions: true,
        csrfRotation: true,
        passwordResetRevokesSessions: true,
        oneBudgetTrialFilm: true,
        unlimitedAdmin: true,
        idempotentBillingCredits: true,
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
