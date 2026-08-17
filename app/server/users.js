/* User accounts — JSON store (zero native deps, same pattern as the jobs store).
   Passwords: Node's built-in scrypt with a random salt. Sessions: signed cookie. */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { config } from "./config.js";

const FILE = path.join(config.dataDir, "users.json");

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return [];
  }
}

function save(users) {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(users, null, 2));
}

export function findUserByEmail(email) {
  const e = String(email || "")
    .toLowerCase()
    .trim();
  return load().find((u) => u.email === e) || null;
}

export function findUserById(id) {
  return load().find((u) => u.id === id) || null;
}

export function findUserBySubscription(subId) {
  return load().find((u) => u.paypalSubscriptionId === subId) || null;
}

export function createUser(email, password) {
  const e = String(email || "")
    .toLowerCase()
    .trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))
    throw new Error("Please enter a valid email address.");
  if (String(password).length < 6)
    throw new Error("Password must be at least 6 characters.");
  const users = load();
  if (users.some((u) => u.email === e))
    throw new Error("This email is already registered — log in instead.");
  const salt = crypto.randomBytes(16).toString("hex");
  const passHash = crypto
    .scryptSync(String(password), salt, 64)
    .toString("hex");
  const user = {
    id: crypto.randomBytes(8).toString("hex"),
    email: e,
    salt,
    passHash,
    credits: 2, // welcome credits — enough for one free budget film
    planId: null,
    paypalSubscriptionId: null,
    lastGrantMonth: null, // "2026-08" — idempotent monthly grants
    createdAt: Date.now(),
  };
  users.push(user);
  save(users);
  return user;
}

export function verifyPassword(user, password) {
  const hash = crypto.scryptSync(String(password), user.salt, 64);
  const expected = Buffer.from(user.passHash, "hex");
  return (
    hash.length === expected.length && crypto.timingSafeEqual(hash, expected)
  );
}

export function updateUser(id, patch) {
  const users = load();
  const i = users.findIndex((u) => u.id === id);
  if (i === -1) return null;
  users[i] = { ...users[i], ...patch };
  save(users);
  return users[i];
}

export function addCredits(id, amount) {
  const u = findUserById(id);
  if (!u) return null;
  return updateUser(id, { credits: (u.credits || 0) + amount });
}

/* ---- signed session cookies (HMAC, no deps) ---- */

export function signSession(userId) {
  const exp = Date.now() + 30 * 24 * 3600 * 1000; // 30 days
  const body = `${userId}.${exp}`;
  const sig = crypto
    .createHmac("sha256", config.sessionSecret)
    .update(body)
    .digest("hex");
  return Buffer.from(`${body}.${sig}`).toString("base64url");
}

export function readSession(token) {
  try {
    const raw = Buffer.from(String(token || ""), "base64url").toString("utf8");
    const [userId, exp, sig] = raw.split(".");
    const expect = crypto
      .createHmac("sha256", config.sessionSecret)
      .update(`${userId}.${exp}`)
      .digest("hex");
    if (sig !== expect || Number(exp) < Date.now()) return null;
    return findUserById(userId);
  } catch {
    return null;
  }
}

export function isAdmin(u) {
  return (
    Boolean(u?.email) &&
    config.adminEmails.includes(String(u.email).toLowerCase())
  );
}

export function publicUser(u) {
  if (!u) return null;
  const admin = isAdmin(u);
  return {
    id: u.id,
    email: u.email,
    // admins see a big number in the UI — the real limit is simply skipped server-side
    credits: admin ? 999999 : u.credits || 0,
    planId: u.planId || null,
    isAdmin: admin,
  };
}
