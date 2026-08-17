import crypto from "node:crypto";
import path from "node:path";
import multer from "multer";
import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";
import { config } from "../config.js";
import { createAsset } from "../db/repositories/assets.js";
import {
  buildStorageKey,
  deleteObject,
  ensurePrivateStorage,
  putBuffer,
} from "./storage.js";

const ALLOWED_INPUTS = new Map([
  ["image/png", new Set(["png"])],
  ["image/jpeg", new Set(["jpg", "jpeg"])],
  ["image/webp", new Set(["webp"])],
]);

const KIND_CATEGORY = {
  product_original: "products",
  character_reference: "characters",
  human_reference: "people",
  style_reference: "styles",
  reference_image: "references",
  brand_logo: "brands",
};

function safeOriginalName(value) {
  const base = path.basename(String(value || "upload"));
  const cleaned = base
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^\p{L}\p{N}._ -]/gu, "_")
    .replace(/\.{2,}/g, ".")
    .trim();
  return (cleaned || "upload").slice(0, 180);
}

function quickFileFilter(_req, file, callback) {
  if (!ALLOWED_INPUTS.has(String(file.mimetype || "").toLowerCase())) {
    callback(new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname));
    return;
  }
  callback(null, true);
}

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.uploadMaxBytes,
    files: 1,
    fields: 12,
    fieldNameSize: 100,
    fieldSize: 32 * 1024,
    parts: 20,
  },
  fileFilter: quickFileFilter,
}).single("file");

async function validateAndNormalizeImage(file) {
  if (!file?.buffer?.length) throw new UploadValidationError("IMAGE_REQUIRED");
  if (file.buffer.length > config.uploadMaxBytes) {
    throw new UploadValidationError("IMAGE_TOO_LARGE");
  }

  const detected = await fileTypeFromBuffer(file.buffer);
  const claimedMime = String(file.mimetype || "").toLowerCase();
  const extension = path.extname(file.originalname || "").slice(1).toLowerCase();
  const allowedExtensions = detected && ALLOWED_INPUTS.get(detected.mime);

  if (
    !detected ||
    !allowedExtensions ||
    !allowedExtensions.has(detected.ext) ||
    !ALLOWED_INPUTS.has(claimedMime) ||
    (extension && !allowedExtensions.has(extension))
  ) {
    throw new UploadValidationError("UNSUPPORTED_IMAGE");
  }

  let metadata;
  try {
    metadata = await sharp(file.buffer, {
      failOn: "warning",
      limitInputPixels: config.uploadMaxPixels,
      sequentialRead: true,
    }).metadata();
  } catch {
    throw new UploadValidationError("INVALID_IMAGE");
  }

  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);
  if (
    width < 128 ||
    height < 128 ||
    width * height > config.uploadMaxPixels ||
    width > 12_000 ||
    height > 12_000
  ) {
    throw new UploadValidationError("INVALID_IMAGE_DIMENSIONS");
  }

  try {
    const normalized = await sharp(file.buffer, {
      failOn: "warning",
      limitInputPixels: config.uploadMaxPixels,
      sequentialRead: true,
    })
      .rotate()
      .png({ compressionLevel: 9, adaptiveFiltering: true, palette: false })
      .toBuffer({ resolveWithObject: true });

    return {
      buffer: normalized.data,
      mimeType: "image/png",
      extension: "png",
      width: Number(normalized.info.width),
      height: Number(normalized.info.height),
      originalMimeType: detected.mime,
    };
  } catch {
    throw new UploadValidationError("IMAGE_PROCESSING_FAILED");
  }
}

export class UploadValidationError extends Error {
  constructor(code) {
    const messages = {
      IMAGE_REQUIRED: "Choose an image to upload.",
      IMAGE_TOO_LARGE: "The image exceeds the configured upload limit.",
      UNSUPPORTED_IMAGE: "Only genuine PNG, JPEG, or WebP images are accepted.",
      INVALID_IMAGE: "The uploaded file is not a valid image.",
      INVALID_IMAGE_DIMENSIONS: "The image dimensions are outside the permitted range.",
      IMAGE_PROCESSING_FAILED: "The image could not be safely processed.",
      INVALID_ASSET_KIND: "This reference type is not supported.",
    };
    super(messages[code] || "The upload is invalid.");
    this.name = "UploadValidationError";
    this.code = code;
    this.status = 400;
  }
}

export async function ingestImageUpload({
  userId,
  file,
  kind,
  metadata = {},
}) {
  const category = KIND_CATEGORY[kind];
  if (!category) throw new UploadValidationError("INVALID_ASSET_KIND");

  await ensurePrivateStorage();
  const normalized = await validateAndNormalizeImage(file);
  const id = crypto.randomUUID();
  const storageKey = buildStorageKey({
    userId,
    category,
    assetId: id,
    extension: normalized.extension,
  });
  const sha256 = crypto
    .createHash("sha256")
    .update(normalized.buffer)
    .digest("hex");

  let stored = false;
  try {
    await putBuffer({
      key: storageKey,
      buffer: normalized.buffer,
      mimeType: normalized.mimeType,
      metadata: { userId, assetId: id, kind },
    });
    stored = true;

    return await createAsset({
      id,
      userId,
      kind,
      storageProvider: config.storageProvider,
      storageKey,
      originalName: safeOriginalName(file.originalname),
      mimeType: normalized.mimeType,
      byteSize: normalized.buffer.length,
      width: normalized.width,
      height: normalized.height,
      sha256,
      visibility: "private",
      metadata: {
        ...metadata,
        originalMimeType: normalized.originalMimeType,
        normalized: true,
        metadataStripped: true,
      },
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

export function uploadMiddlewareError(error, _req, res, next) {
  if (!(error instanceof multer.MulterError)) return next(error);
  const fileError = error.code === "LIMIT_FILE_SIZE";
  res.status(400).json({
    error: {
      code: fileError ? "IMAGE_TOO_LARGE" : "INVALID_UPLOAD",
      message: fileError
        ? "The image exceeds the configured upload limit."
        : "The upload did not match the expected image form.",
    },
  });
}
