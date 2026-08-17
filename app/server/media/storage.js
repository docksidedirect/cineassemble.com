import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config.js";

const SAFE_KEY = /^[a-zA-Z0-9/_\-.]+$/;
let s3Client;

function validateStorageKey(key) {
  if (
    typeof key !== "string" ||
    !key ||
    key.startsWith("/") ||
    key.includes("..") ||
    key.includes("\\") ||
    !SAFE_KEY.test(key)
  ) {
    throw new Error("Invalid private storage key.");
  }
  return key;
}

function localPathForKey(key) {
  const safeKey = validateStorageKey(key);
  const root = path.resolve(config.privateStorageRoot);
  const resolved = path.resolve(root, safeKey);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Storage path escaped the private root.");
  }
  return resolved;
}

function getS3() {
  if (s3Client) return s3Client;
  if (!config.s3.bucket) throw new Error("S3_BUCKET is required for S3 storage.");
  s3Client = new S3Client({
    endpoint: config.s3.endpoint || undefined,
    region: config.s3.region,
    forcePathStyle: config.s3.forcePathStyle,
    credentials:
      config.s3.accessKeyId && config.s3.secretAccessKey
        ? {
            accessKeyId: config.s3.accessKeyId,
            secretAccessKey: config.s3.secretAccessKey,
          }
        : undefined,
  });
  return s3Client;
}

export function buildStorageKey({ userId, category, assetId, extension }) {
  const safeUser = String(userId).toLowerCase();
  const safeAsset = String(assetId).toLowerCase();
  const safeCategory = String(category).toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  const safeExtension = String(extension).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!/^[0-9a-f-]{36}$/.test(safeUser) || !/^[0-9a-f-]{36}$/.test(safeAsset)) {
    throw new Error("Storage keys require UUID user and asset identifiers.");
  }
  if (!safeCategory || !safeExtension) throw new Error("Invalid asset category or extension.");
  return validateStorageKey(
    `tenants/${safeUser}/${safeCategory}/${safeAsset}.${safeExtension}`,
  );
}

export async function ensurePrivateStorage() {
  if (config.storageProvider !== "local") return;
  await fsp.mkdir(config.privateStorageRoot, { recursive: true, mode: 0o700 });
  await fsp.mkdir(config.tempRoot, { recursive: true, mode: 0o700 });
}

export async function putBuffer({ key, buffer, mimeType, metadata = {} }) {
  validateStorageKey(key);
  if (!Buffer.isBuffer(buffer)) throw new TypeError("Storage input must be a Buffer.");

  if (config.storageProvider === "s3") {
    await getS3().send(
      new PutObjectCommand({
        Bucket: config.s3.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        CacheControl: "private, no-store",
        Metadata: Object.fromEntries(
          Object.entries(metadata).map(([name, value]) => [
            name.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
            String(value).slice(0, 500),
          ]),
        ),
      }),
    );
    return { provider: "s3", key };
  }

  const destination = localPathForKey(key);
  const directory = path.dirname(destination);
  await fsp.mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = `${destination}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  try {
    await fsp.writeFile(temporary, buffer, { mode: 0o600, flag: "wx" });
    await fsp.rename(temporary, destination);
    await fsp.chmod(destination, 0o600);
  } catch (error) {
    await fsp.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
  return { provider: "local", key };
}

export async function openReadStream({ provider, key, start = null, end = null }) {
  validateStorageKey(key);
  const hasRange = Number.isInteger(start) && Number.isInteger(end);
  if (provider === "s3") {
    const response = await getS3().send(
      new GetObjectCommand({
        Bucket: config.s3.bucket,
        Key: key,
        Range: hasRange ? `bytes=${start}-${end}` : undefined,
      }),
    );
    return {
      stream:
        response.Body instanceof Readable
          ? response.Body
          : Readable.fromWeb(response.Body.transformToWebStream()),
      byteSize: Number(response.ContentLength || 0),
      mimeType: response.ContentType || "application/octet-stream",
      etag: response.ETag || null,
      contentRange: response.ContentRange || null,
    };
  }

  const filePath = localPathForKey(key);
  const stats = await fsp.stat(filePath);
  if (!stats.isFile()) throw new Error("Asset is not a regular file.");
  return {
    stream: fs.createReadStream(
      filePath,
      hasRange ? { start, end } : undefined,
    ),
    byteSize: hasRange ? end - start + 1 : stats.size,
    mimeType: null,
    etag: null,
    contentRange: hasRange ? `bytes ${start}-${end}/${stats.size}` : null,
  };
}

export async function readBuffer({ provider, key, maxBytes = config.uploadMaxBytes }) {
  validateStorageKey(key);
  if (provider === "local") {
    const filePath = localPathForKey(key);
    const stats = await fsp.stat(filePath);
    if (!stats.isFile() || stats.size > maxBytes) {
      throw new Error("Private asset exceeds the permitted read size.");
    }
    return fsp.readFile(filePath);
  }

  const { stream, byteSize } = await openReadStream({ provider, key });
  if (byteSize && byteSize > maxBytes) throw new Error("Private asset is too large.");
  const chunks = [];
  let total = 0;
  for await (const chunk of stream) {
    total += chunk.length;
    if (total > maxBytes) throw new Error("Private asset is too large.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function statObject({ provider, key }) {
  validateStorageKey(key);
  if (provider === "s3") {
    const response = await getS3().send(
      new HeadObjectCommand({ Bucket: config.s3.bucket, Key: key }),
    );
    return {
      byteSize: Number(response.ContentLength || 0),
      mimeType: response.ContentType || "application/octet-stream",
    };
  }
  const stats = await fsp.stat(localPathForKey(key));
  return { byteSize: stats.size, mimeType: null };
}

export async function deleteObject({ provider, key }) {
  validateStorageKey(key);
  if (provider === "s3") {
    await getS3().send(
      new DeleteObjectCommand({ Bucket: config.s3.bucket, Key: key }),
    );
    return;
  }
  await fsp.rm(localPathForKey(key), { force: true });
}

export async function createTemporaryDownloadUrl({ provider, key, expiresIn = 300 }) {
  validateStorageKey(key);
  if (provider !== "s3") return null;
  return getSignedUrl(
    getS3(),
    new GetObjectCommand({ Bucket: config.s3.bucket, Key: key }),
    { expiresIn: Math.max(30, Math.min(3600, expiresIn)) },
  );
}

export function resolvePrivateLocalPath(key) {
  if (config.storageProvider !== "local") {
    throw new Error("A local path is unavailable for the configured storage provider.");
  }
  return localPathForKey(key);
}

export async function putFile({ key, filePath, mimeType, metadata = {} }) {
  validateStorageKey(key);
  const source = path.resolve(filePath);
  const stats = await fsp.stat(source);
  if (!stats.isFile()) throw new Error("Storage source must be a regular file.");

  if (config.storageProvider === "s3") {
    await getS3().send(
      new PutObjectCommand({
        Bucket: config.s3.bucket,
        Key: key,
        Body: fs.createReadStream(source),
        ContentLength: stats.size,
        ContentType: mimeType,
        CacheControl: "private, no-store",
        Metadata: Object.fromEntries(
          Object.entries(metadata).map(([name, value]) => [
            name.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
            String(value).slice(0, 500),
          ]),
        ),
      }),
    );
    return { provider: "s3", key, byteSize: stats.size };
  }

  const destination = localPathForKey(key);
  await fsp.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  const temporary = `${destination}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  try {
    await fsp.copyFile(source, temporary, fs.constants.COPYFILE_EXCL);
    await fsp.chmod(temporary, 0o600);
    await fsp.rename(temporary, destination);
  } catch (error) {
    await fsp.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
  return { provider: "local", key, byteSize: stats.size };
}
