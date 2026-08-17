import {
  createProduct,
  createReference,
  getAssetById,
  getProductById,
  getReferenceById,
  listProducts,
  listReferences,
  softDeleteAsset,
  softDeleteProduct,
  softDeleteReference,
} from "../db/repositories/assets.js";
import { ingestImageUpload } from "../media/uploads.js";
import {
  parseRequest,
  productMetadataSchema,
  referenceMetadataSchema,
} from "../validation/video.js";

const referenceKindByType = {
  character: "character_reference",
  human: "human_reference",
  style: "style_reference",
  general: "reference_image",
};

export async function createProductFromUpload({ user, file, fields }) {
  const parsed = parseRequest(productMetadataSchema, fields);
  if (!parsed.ok) return parsed;

  let asset;
  try {
    asset = await ingestImageUpload({
      userId: user.id,
      file,
      kind: "product_original",
      metadata: {
        purpose: "real_product_source",
        immutableOriginal: true,
      },
    });
    const productId = await createProduct({
      userId: user.id,
      name: parsed.data.name,
      description: parsed.data.description || null,
      originalAssetId: asset.id,
      strictFidelity: parsed.data.strictFidelity,
      preservationNotes: parsed.data.preservationNotes || null,
      productProfile: {
        fidelityContract: {
          preserveShape: true,
          preserveProportions: true,
          preserveMaterials: true,
          preserveColors: true,
          preserveLabels: true,
          preserveLogos: true,
          preventCartoonization: true,
        },
      },
    });
    if (!productId) throw new Error("Product ownership validation failed.");
    return {
      ok: true,
      product: await getProductById(user.id, productId),
    };
  } catch (error) {
    if (asset) await softDeleteAsset(user.id, asset.id).catch(() => {});
    throw error;
  }
}

export async function createReferenceFromUpload({ user, file, fields }) {
  const parsed = parseRequest(referenceMetadataSchema, fields);
  if (!parsed.ok) return parsed;
  const kind = referenceKindByType[parsed.data.referenceType];

  let asset;
  try {
    asset = await ingestImageUpload({
      userId: user.id,
      file,
      kind,
      metadata: {
        purpose: `${parsed.data.referenceType}_reference`,
        immutableOriginal: true,
      },
    });
    const referenceId = await createReference({
      userId: user.id,
      name: parsed.data.name,
      referenceType: parsed.data.referenceType,
      assetId: asset.id,
      description: parsed.data.description || null,
      preservationNotes: parsed.data.preservationNotes || null,
      profile: {
        immutableOriginal: true,
        fidelity: "high",
      },
    });
    if (!referenceId) throw new Error("Reference ownership validation failed.");
    return {
      ok: true,
      reference: await getReferenceById(user.id, referenceId),
    };
  } catch (error) {
    if (asset) await softDeleteAsset(user.id, asset.id).catch(() => {});
    throw error;
  }
}

export async function getProduct(user, productId) {
  return getProductById(user.id, productId);
}

export async function getReference(user, referenceId) {
  return getReferenceById(user.id, referenceId);
}

export async function deleteProduct(user, productId) {
  const product = await getProductById(user.id, productId);
  if (!product) return false;
  return softDeleteProduct(user.id, productId);
}

export async function deleteReference(user, referenceId) {
  const reference = await getReferenceById(user.id, referenceId);
  if (!reference) return false;
  return softDeleteReference(user.id, referenceId);
}

export async function getPrivateAsset(user, assetId) {
  return getAssetById(user.id, assetId, { includeStorageKey: true });
}
