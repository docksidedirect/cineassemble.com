import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createAsset } from "../db/repositories/assets.js";
import { config } from "../config.js";
import {
  buildStorageKey,
  deleteObject,
  openReadStream,
  putFile,
} from "./storage.js";

const TYPE_CONFIG = {
  scene_image: { category: "scene-images", extension: "png", mimeType: "image/png" },
  scene_audio: { category: "scene-audio", extension: "wav", mimeType: "audio/wav" },
  scene_clip: { category: "scene-clips", extension: "mp4", mimeType: "video/mp4" },
  scene_lipsync: { category: "scene-lipsync", extension: "mp4", mimeType: "video/mp4" },
  final_video: { category: "final-videos", extension: "mp4", mimeType: "video/mp4" },
  thumbnail: { category: "thumbnails", extension: "png", mimeType: "image/png" },
};

export async function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}

export async function storeGeneratedFile({
  userId,
  kind,
  filePath,
  width = null,
  height = null,
  durationMs = null,
  sourceAssetId = null,
  metadata = null,
}) {
  const type = TYPE_CONFIG[kind];
  if (!type) throw new Error(`Unsupported generated asset type: ${kind}`);
  const id = crypto.randomUUID();
  const storageKey = buildStorageKey({
    userId,
    category: type.category,
    assetId: id,
    extension: type.extension,
  });
  const [stats, sha256] = await Promise.all([
    fsp.stat(filePath),
    sha256File(filePath),
  ]);

  let stored = false;
  try {
    await putFile({
      key: storageKey,
      filePath,
      mimeType: type.mimeType,
      metadata: { userId, assetId: id, kind },
    });
    stored = true;
    return await createAsset({
      id,
      userId,
      kind,
      storageProvider: config.storageProvider,
      storageKey,
      originalName: null,
      mimeType: type.mimeType,
      byteSize: stats.size,
      width,
      height,
      durationMs,
      sha256,
      visibility: "private",
      sourceAssetId,
      metadata,
    });
  } catch (error) {
    if (stored) {
      await deleteObject({ provider: config.storageProvider, key: storageKey }).catch(
        () => {},
      );
    }
    throw error;
  }
}

export async function materializeAsset(asset, destination) {
  if (!asset?.storageProvider || !asset?.storageKey) {
    throw new Error("Asset does not contain a private storage locator.");
  }
  const target = path.resolve(destination);
  await fsp.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  try {
    const { stream } = await openReadStream({
      provider: asset.storageProvider,
      key: asset.storageKey,
    });
    await pipeline(stream, fs.createWriteStream(temporary, { mode: 0o600, flags: "wx" }));
    await fsp.rename(temporary, target);
    await fsp.chmod(target, 0o600);
    return target;
  } catch (error) {
    await fsp.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}
