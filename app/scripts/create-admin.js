import argon2 from "argon2";
import crypto from "node:crypto";
import { config } from "../server/config.js";
import { closePool, withTransaction } from "../server/db/pool.js";
import { migrate } from "../server/db/migrate.js";
import { normalizeEmail } from "../server/db/repositories/users.js";

async function main() {
  const email = normalizeEmail(config.adminEmail);
  const password = process.env.ADMIN_PASSWORD || "";
  const displayName = String(process.env.ADMIN_DISPLAY_NAME || "CineAssemble Owner")
    .trim()
    .slice(0, 120);
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error("Set ADMIN_EMAIL to the owner’s valid email address.");
  }
  if (password.length < 16 || password.length > 128) {
    throw new Error("Set ADMIN_PASSWORD to a unique 16–128 character password.");
  }
  if (password.toLowerCase().includes(email.split("@")[0])) {
    throw new Error("ADMIN_PASSWORD must not contain the admin email name.");
  }

  await migrate();
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
    hashLength: 32,
  });

  const userId = await withTransaction(async (connection) => {
    const [[existing]] = await connection.execute(
      `SELECT id FROM users WHERE email_normalized = ? LIMIT 1 FOR UPDATE`,
      [email],
    );
    if (existing) {
      await connection.execute(
        `UPDATE users
         SET email = ?, password_hash = ?, display_name = ?, role = 'admin',
             status = 'active', email_verified_at = COALESCE(email_verified_at, UTC_TIMESTAMP(3)),
             password_changed_at = UTC_TIMESTAMP(3)
         WHERE id = ?`,
        [email, passwordHash, displayName, existing.id],
      );
      await connection.execute(
        `UPDATE sessions SET revoked_at = UTC_TIMESTAMP(3), revoke_reason = 'admin_bootstrap'
         WHERE user_id = ? AND revoked_at IS NULL`,
        [existing.id],
      );
      return existing.id;
    }

    const id = crypto.randomUUID();
    const [[trialPlan]] = await connection.execute(
      `SELECT id FROM plans WHERE code = 'trial' LIMIT 1`,
    );
    await connection.execute(
      `INSERT INTO users (
        id, email, email_normalized, password_hash, display_name, role,
        status, plan_id, email_verified_at
      ) VALUES (?, ?, ?, ?, ?, 'admin', 'active', ?, UTC_TIMESTAMP(3))`,
      [id, email, email, passwordHash, displayName, trialPlan.id],
    );
    return id;
  });

  console.log(`Unlimited administrator ready: ${email} (${userId})`);
}

main()
  .catch((error) => {
    console.error(`Admin bootstrap failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => closePool());
