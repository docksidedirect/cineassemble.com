import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { getPool, closePool } from "./pool.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(currentDir, "migrations");
const lockName = "cineassemble_schema_migrations";

function checksum(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function splitStatements(sql) {
  return sql
    .replace(/^\uFEFF/, "")
    .split(/;\s*(?:\r?\n|$)/g)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function ensureMigrationTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      filename VARCHAR(255) NOT NULL,
      checksum CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      UNIQUE KEY uq_schema_migrations_filename (filename)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);
}

export async function migrate({ logger = console } = {}) {
  const connection = await getPool().getConnection();
  let hasLock = false;
  try {
    const [[lockRow]] = await connection.query(
      "SELECT GET_LOCK(?, 30) AS acquired",
      [lockName],
    );
    hasLock = Number(lockRow?.acquired) === 1;
    if (!hasLock) throw new Error("Could not acquire the database migration lock.");

    await ensureMigrationTable(connection);
    const files = (await fs.readdir(migrationsDir))
      .filter((name) => /^\d+_[a-z0-9_-]+\.sql$/i.test(name))
      .sort((a, b) => a.localeCompare(b));

    const [existingRows] = await connection.query(
      "SELECT filename, checksum FROM schema_migrations ORDER BY filename",
    );
    const existing = new Map(
      existingRows.map((row) => [row.filename, row.checksum]),
    );

    let applied = 0;
    for (const filename of files) {
      const fullPath = path.join(migrationsDir, filename);
      const sql = await fs.readFile(fullPath, "utf8");
      const digest = checksum(sql);
      const previous = existing.get(filename);

      if (previous) {
        if (previous !== digest) {
          throw new Error(
            `Migration ${filename} changed after it was applied. Create a new migration instead.`,
          );
        }
        continue;
      }

      logger.info?.(`[database] Applying ${filename}`);
      const statements = splitStatements(sql);
      for (const statement of statements) {
        await connection.query(statement);
      }
      await connection.execute(
        "INSERT INTO schema_migrations (filename, checksum) VALUES (?, ?)",
        [filename, digest],
      );
      applied += 1;
    }

    logger.info?.(
      `[database] Migration check complete (${applied} applied, ${files.length - applied} already current).`,
    );
    return { applied, total: files.length };
  } finally {
    if (hasLock) {
      try {
        await connection.query("SELECT RELEASE_LOCK(?)", [lockName]);
      } catch {
        // Connection close also releases the advisory lock.
      }
    }
    connection.release();
  }
}

const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  migrate()
    .catch((error) => {
      console.error(`[database] Migration failed: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(() => closePool());
}
