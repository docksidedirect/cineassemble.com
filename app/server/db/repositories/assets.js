import crypto from "crypto";
import {
  affectedRows,
  parseJson,
  query,
  queryOne,
  stringifyJson,
  withTransaction,
} from "../pool.js";

function mapAsset(row, { includeStorageKey = false } = {}) {
  if (!row) return null;
  const asset = {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    storageProvider: row.storage_provider,
    originalName: row.original_name,
    mimeType: row.mime_type,
    byteSize: Number(row.byte_size),
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
    durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
    sha256: row.sha256,
    visibility: row.visibility,
    sourceAssetId: row.source_asset_id,
    metadata: parseJson(row.metadata, {}),
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
  if (includeStorageKey) asset.storageKey = row.storage_key;
  return asset;
}

function mapProduct(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    originalAssetId: row.original_asset_id,
    cutoutAssetId: row.cutout_asset_id,
    strictFidelity: Boolean(row.strict_fidelity),
    preservationNotes: row.preservation_notes,
    productProfile: parseJson(row.product_profile, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    originalAsset: row.asset_id
      ? {
          id: row.asset_id,
          mimeType: row.asset_mime_type,
          byteSize: Number(row.asset_byte_size),
          width: row.asset_width == null ? null : Number(row.asset_width),
          height: row.asset_height == null ? null : Number(row.asset_height),
          createdAt: row.asset_created_at,
        }
      : null,
  };
}

export async function createAsset({
  id = crypto.randomUUID(),
  userId,
  kind,
  storageProvider = "local",
  storageKey,
  originalName,
  mimeType,
  byteSize,
  width = null,
  height = null,
  durationMs = null,
  sha256,
  visibility = "private",
  sourceAssetId = null,
  metadata = null,
}) {
  await query(
    `INSERT INTO assets (
      id, user_id, kind, storage_provider, storage_key, original_name,
      mime_type, byte_size, width, height, duration_ms, sha256,
      visibility, source_asset_id, metadata
    ) VALUES (
      :id, :userId, :kind, :storageProvider, :storageKey, :originalName,
      :mimeType, :byteSize, :width, :height, :durationMs, :sha256,
      :visibility, :sourceAssetId, :metadata
    )`,
    {
      id,
      userId,
      kind,
      storageProvider,
      storageKey,
      originalName: originalName || null,
      mimeType,
      byteSize,
      width,
      height,
      durationMs,
      sha256,
      visibility,
      sourceAssetId,
      metadata: stringifyJson(metadata),
    },
  );
  return getAssetById(userId, id);
}

export async function getAssetById(userId, assetId, options = {}) {
  return mapAsset(
    await queryOne(
      `SELECT * FROM assets
       WHERE id = :assetId AND user_id = :userId AND deleted_at IS NULL
       LIMIT 1`,
      { assetId, userId },
    ),
    options,
  );
}

export async function getAssetForAdmin(assetId, options = {}) {
  return mapAsset(
    await queryOne(
      `SELECT * FROM assets WHERE id = :assetId AND deleted_at IS NULL LIMIT 1`,
      { assetId },
    ),
    options,
  );
}

export async function getFinalAssetForJob(userId, jobId, options = {}) {
  return mapAsset(
    await queryOne(
      `SELECT a.*
       FROM jobs j
       JOIN assets a ON a.id = j.final_asset_id AND a.user_id = j.user_id
       WHERE j.id = :jobId AND j.user_id = :userId
         AND j.deleted_at IS NULL AND a.deleted_at IS NULL
       LIMIT 1`,
      { jobId, userId },
    ),
    options,
  );
}

export async function listAssets(userId, { kind = null, limit = 100 } = {}) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 100));
  const rows = await query(
    `SELECT * FROM assets
     WHERE user_id = :userId AND deleted_at IS NULL
       AND (:kind IS NULL OR kind = :kind)
     ORDER BY created_at DESC
     LIMIT ${safeLimit}`,
    { userId, kind },
  );
  return rows.map((row) => mapAsset(row));
}

export async function softDeleteAsset(userId, assetId) {
  const result = await query(
    `UPDATE assets
     SET deleted_at = UTC_TIMESTAMP(3)
     WHERE id = :assetId AND user_id = :userId AND deleted_at IS NULL
       AND kind NOT IN ('scene_image', 'scene_audio', 'scene_clip', 'scene_lipsync', 'final_video')`,
    { assetId, userId },
  );
  return affectedRows(result) === 1;
}

export async function createProduct({
  userId,
  name,
  description = null,
  originalAssetId,
  cutoutAssetId = null,
  strictFidelity = true,
  preservationNotes = null,
  productProfile = null,
}) {
  const id = crypto.randomUUID();
  return withTransaction(async (connection) => {
    const [assets] = await connection.execute(
      `SELECT id, kind FROM assets
       WHERE user_id = ? AND deleted_at IS NULL
         AND id IN (?, ?)` ,
      [userId, originalAssetId, cutoutAssetId || originalAssetId],
    );
    const original = assets.find((asset) => asset.id === originalAssetId);
    if (!original || original.kind !== "product_original") {
      return null;
    }
    if (cutoutAssetId && !assets.some((asset) => asset.id === cutoutAssetId)) {
      return null;
    }

    await connection.execute(
      `INSERT INTO products (
        id, user_id, name, description, original_asset_id, cutout_asset_id,
        strict_fidelity, preservation_notes, product_profile
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        userId,
        name,
        description,
        originalAssetId,
        cutoutAssetId,
        strictFidelity,
        preservationNotes,
        stringifyJson(productProfile),
      ],
    );
    return id;
  });
}

export async function getProductById(userId, productId, { includeStorageKey = false } = {}) {
  const row = await queryOne(
    `SELECT
       p.*,
       a.id AS asset_id,
       a.mime_type AS asset_mime_type,
       a.byte_size AS asset_byte_size,
       a.width AS asset_width,
       a.height AS asset_height,
       a.created_at AS asset_created_at,
       a.storage_key AS asset_storage_key,
       a.storage_provider AS asset_storage_provider
     FROM products p
     JOIN assets a ON a.id = p.original_asset_id AND a.user_id = p.user_id
     WHERE p.id = :productId AND p.user_id = :userId
       AND p.deleted_at IS NULL AND a.deleted_at IS NULL
     LIMIT 1`,
    { productId, userId },
  );
  const product = mapProduct(row);
  if (product && includeStorageKey) {
    product.originalAsset.storageKey = row.asset_storage_key;
    product.originalAsset.storageProvider = row.asset_storage_provider;
  }
  return product;
}

export async function listProducts(userId, { limit = 100 } = {}) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 100));
  const rows = await query(
    `SELECT
       p.*,
       a.id AS asset_id,
       a.mime_type AS asset_mime_type,
       a.byte_size AS asset_byte_size,
       a.width AS asset_width,
       a.height AS asset_height,
       a.created_at AS asset_created_at
     FROM products p
     JOIN assets a ON a.id = p.original_asset_id AND a.user_id = p.user_id
     WHERE p.user_id = :userId AND p.deleted_at IS NULL AND a.deleted_at IS NULL
     ORDER BY p.created_at DESC
     LIMIT ${safeLimit}`,
    { userId },
  );
  return rows.map(mapProduct);
}

export async function updateProduct(userId, productId, changes) {
  const allowed = {
    name: "name",
    description: "description",
    cutoutAssetId: "cutout_asset_id",
    strictFidelity: "strict_fidelity",
    preservationNotes: "preservation_notes",
    productProfile: "product_profile",
  };
  const entries = Object.entries(changes).filter(
    ([key, value]) => key in allowed && value !== undefined,
  );
  if (!entries.length) return getProductById(userId, productId);
  const assignments = entries.map(([key]) => `${allowed[key]} = ?`).join(", ");
  const values = entries.map(([key, value]) =>
    key === "productProfile" ? stringifyJson(value) : value,
  );
  const result = await query(
    `UPDATE products SET ${assignments}
     WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    [...values, productId, userId],
  );
  if (affectedRows(result) !== 1) return null;
  return getProductById(userId, productId);
}

export async function softDeleteProduct(userId, productId) {
  const result = await query(
    `UPDATE products SET deleted_at = UTC_TIMESTAMP(3)
     WHERE id = :productId AND user_id = :userId AND deleted_at IS NULL`,
    { productId, userId },
  );
  return affectedRows(result) === 1;
}

export async function getJobProductReferences(userId, jobId) {
  const rows = await query(
    `SELECT
       p.id, p.name, p.strict_fidelity, p.preservation_notes, p.product_profile,
       a.id AS asset_id, a.storage_provider, a.storage_key, a.mime_type,
       a.byte_size, a.width, a.height, a.sha256
     FROM job_assets ja
     JOIN products p ON p.id = ja.product_id AND p.user_id = ja.user_id
     JOIN assets a ON a.id = p.original_asset_id AND a.user_id = p.user_id
     JOIN jobs j ON j.id = ja.job_id AND j.user_id = ja.user_id
     WHERE ja.job_id = :jobId AND ja.user_id = :userId
       AND ja.asset_role = 'product'
       AND p.deleted_at IS NULL AND a.deleted_at IS NULL AND j.deleted_at IS NULL
     ORDER BY ja.sort_order ASC`,
    { jobId, userId },
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    strictFidelity: Boolean(row.strict_fidelity),
    preservationNotes: row.preservation_notes,
    productProfile: parseJson(row.product_profile, {}),
    asset: {
      id: row.asset_id,
      storageProvider: row.storage_provider,
      storageKey: row.storage_key,
      mimeType: row.mime_type,
      byteSize: Number(row.byte_size),
      width: row.width == null ? null : Number(row.width),
      height: row.height == null ? null : Number(row.height),
      sha256: row.sha256,
    },
  }));
}

export async function createReference({
  userId,
  name,
  referenceType,
  assetId,
  description = null,
  preservationNotes = null,
  profile = null,
}) {
  const id = crypto.randomUUID();
  const kindByType = {
    character: "character_reference",
    human: "human_reference",
    style: "style_reference",
    general: "reference_image",
  };
  const expectedKind = kindByType[referenceType];
  if (!expectedKind) return null;

  return withTransaction(async (connection) => {
    const [[asset]] = await connection.execute(
      `SELECT id FROM assets
       WHERE id = ? AND user_id = ? AND kind = ? AND deleted_at IS NULL
       LIMIT 1`,
      [assetId, userId, expectedKind],
    );
    if (!asset) return null;
    await connection.execute(
      `INSERT INTO reference_library (
        id, user_id, name, reference_type, asset_id, description,
        preservation_notes, profile
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        userId,
        name,
        referenceType,
        assetId,
        description,
        preservationNotes,
        stringifyJson(profile),
      ],
    );
    return id;
  });
}

export async function getReferenceById(
  userId,
  referenceId,
  { includeStorageKey = false } = {},
) {
  const row = await queryOne(
    `SELECT r.*, a.kind AS asset_kind, a.mime_type, a.byte_size,
            a.width, a.height, a.created_at AS asset_created_at,
            a.storage_provider, a.storage_key
     FROM reference_library r
     JOIN assets a ON a.id = r.asset_id AND a.user_id = r.user_id
     WHERE r.id = :referenceId AND r.user_id = :userId
       AND r.deleted_at IS NULL AND a.deleted_at IS NULL
     LIMIT 1`,
    { referenceId, userId },
  );
  if (!row) return null;
  const reference = {
    id: row.id,
    name: row.name,
    referenceType: row.reference_type,
    description: row.description,
    preservationNotes: row.preservation_notes,
    profile: parseJson(row.profile, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    asset: {
      id: row.asset_id,
      kind: row.asset_kind,
      mimeType: row.mime_type,
      byteSize: Number(row.byte_size),
      width: row.width == null ? null : Number(row.width),
      height: row.height == null ? null : Number(row.height),
      createdAt: row.asset_created_at,
    },
  };
  if (includeStorageKey) {
    reference.asset.storageProvider = row.storage_provider;
    reference.asset.storageKey = row.storage_key;
  }
  return reference;
}

export async function listReferences(userId, { referenceType = null, limit = 100 } = {}) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 100));
  const rows = await query(
    `SELECT r.*, a.kind AS asset_kind, a.mime_type, a.byte_size,
            a.width, a.height, a.created_at AS asset_created_at
     FROM reference_library r
     JOIN assets a ON a.id = r.asset_id AND a.user_id = r.user_id
     WHERE r.user_id = :userId
       AND r.deleted_at IS NULL AND a.deleted_at IS NULL
       AND (:referenceType IS NULL OR r.reference_type = :referenceType)
     ORDER BY r.created_at DESC
     LIMIT ${safeLimit}`,
    { userId, referenceType },
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    referenceType: row.reference_type,
    description: row.description,
    preservationNotes: row.preservation_notes,
    profile: parseJson(row.profile, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    asset: {
      id: row.asset_id,
      kind: row.asset_kind,
      mimeType: row.mime_type,
      byteSize: Number(row.byte_size),
      width: row.width == null ? null : Number(row.width),
      height: row.height == null ? null : Number(row.height),
      createdAt: row.asset_created_at,
    },
  }));
}

export async function softDeleteReference(userId, referenceId) {
  const result = await query(
    `UPDATE reference_library SET deleted_at = UTC_TIMESTAMP(3)
     WHERE id = :referenceId AND user_id = :userId AND deleted_at IS NULL`,
    { referenceId, userId },
  );
  return affectedRows(result) === 1;
}

export async function getJobReferenceAssets(userId, jobId) {
  const rows = await query(
    `SELECT
       ja.asset_role, ja.sort_order,
       r.id AS reference_id, r.name, r.reference_type, r.description,
       r.preservation_notes, r.profile,
       a.id AS asset_id, a.storage_provider, a.storage_key, a.mime_type,
       a.byte_size, a.width, a.height, a.sha256
     FROM job_assets ja
     JOIN assets a ON a.id = ja.asset_id AND a.user_id = ja.user_id
     LEFT JOIN reference_library r
       ON r.asset_id = a.id AND r.user_id = ja.user_id AND r.deleted_at IS NULL
     JOIN jobs j ON j.id = ja.job_id AND j.user_id = ja.user_id
     WHERE ja.job_id = :jobId AND ja.user_id = :userId
       AND ja.asset_role IN ('character', 'presenter', 'style_reference', 'reference')
       AND a.deleted_at IS NULL AND j.deleted_at IS NULL
     ORDER BY ja.sort_order ASC, ja.created_at ASC`,
    { jobId, userId },
  );
  return rows.map((row) => ({
    id: row.reference_id || row.asset_id,
    name: row.name || `${row.asset_role} reference`,
    referenceType: row.reference_type || row.asset_role,
    role: row.asset_role,
    description: row.description || "",
    preservationNotes: row.preservation_notes || "",
    profile: parseJson(row.profile, {}),
    asset: {
      id: row.asset_id,
      storageProvider: row.storage_provider,
      storageKey: row.storage_key,
      mimeType: row.mime_type,
      byteSize: Number(row.byte_size),
      width: row.width == null ? null : Number(row.width),
      height: row.height == null ? null : Number(row.height),
      sha256: row.sha256,
    },
  }));
}
