import mysql from "mysql2/promise";
import fs from "fs";
import { config } from "../config.js";

let pool;

function poolOptions() {
  const common = {
    waitForConnections: true,
    connectionLimit: config.database.connectionLimit,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    timezone: "Z",
    charset: "utf8mb4",
    decimalNumbers: true,
    namedPlaceholders: true,
    dateStrings: false,
    supportBigNumbers: true,
    bigNumberStrings: true,
  };

  if (config.database.sslCa) {
    common.ssl = {
      ca: fs.readFileSync(config.database.sslCa, "utf8"),
      rejectUnauthorized: true,
    };
  }

  if (config.databaseUrl) {
    const url = new URL(config.databaseUrl);
    if (!["mysql:", "mysql2:"].includes(url.protocol)) {
      throw new Error("DATABASE_URL must use the mysql:// scheme.");
    }
    return {
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.replace(/^\//, "")),
      ...common,
    };
  }

  return {
    host: config.database.host,
    port: config.database.port,
    user: config.database.user,
    password: config.database.password,
    database: config.database.database,
    ...common,
  };
}

export function getPool() {
  if (pool) return pool;
  pool = mysql.createPool(poolOptions());
  return pool;
}

export async function closePool() {
  if (!pool) return;
  const current = pool;
  pool = undefined;
  await current.end();
}

export async function query(sql, params = {}) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

export async function queryOne(sql, params = {}) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

export async function withTransaction(work, options = {}) {
  const connection = await getPool().getConnection();
  const isolation = options.isolation || "READ COMMITTED";
  try {
    await connection.query(`SET TRANSACTION ISOLATION LEVEL ${isolation}`);
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // Preserve the original database or business error.
    }
    throw error;
  } finally {
    connection.release();
  }
}

export async function databaseHealth() {
  const startedAt = performance.now();
  const row = await queryOne("SELECT 1 AS ok, UTC_TIMESTAMP(3) AS server_time");
  return {
    ok: Number(row?.ok) === 1,
    latencyMs: Math.round(performance.now() - startedAt),
    serverTime: row?.server_time || null,
  };
}

export function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === "object" && !Buffer.isBuffer(value)) return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

export function stringifyJson(value) {
  return value == null ? null : JSON.stringify(value);
}

export function toSqlDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError("Invalid date value.");
  return date;
}

export function affectedRows(result) {
  return Number(result?.affectedRows || 0);
}
