import crypto from "node:crypto";
import net from "node:net";
import { config } from "../config.js";

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function tokenHash(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

export function keyedHash(value) {
  const key = config.appSecret || "cineassemble-development-metadata-key";
  return crypto.createHmac("sha256", key).update(String(value || "")).digest("hex");
}

export function safeEqualHash(expectedHex, rawToken) {
  if (!expectedHex || !rawToken) return false;
  const actual = Buffer.from(tokenHash(rawToken), "hex");
  const expected = Buffer.from(String(expectedHex), "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function sessionSecrets() {
  const token = randomToken(32);
  const csrf = randomToken(32);
  return {
    token,
    tokenHash: tokenHash(token),
    csrf,
    csrfHash: tokenHash(csrf),
  };
}

export function clientIpPrefix(ipValue) {
  let ip = String(ipValue || "").trim();
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  const family = net.isIP(ip);
  if (family === 4) {
    const parts = ip.split(".").map(Number);
    if (parts.some((part) => part < 0 || part > 255)) return null;
    return Buffer.from([parts[0], parts[1], parts[2], 0]);
  }
  if (family === 6) {
    // Store a privacy-preserving keyed prefix representation rather than a full IP.
    return Buffer.from(keyedHash(ip.split(":").slice(0, 4).join(":")), "hex").subarray(0, 16);
  }
  return null;
}

export function userAgentHash(value) {
  const text = String(value || "").slice(0, 1000);
  return text ? keyedHash(text) : null;
}

export function auditIpHash(value) {
  return value ? keyedHash(value) : null;
}
