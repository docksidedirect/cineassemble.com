import path from "node:path";
import {
  getJobProductReferences,
  getJobReferenceAssets,
} from "../db/repositories/assets.js";
import { readBuffer } from "../media/storage.js";
import {
  generateImage,
  generateSceneImage,
} from "../providers.js";
import { buildProductBackgroundPrompt } from "./prompts.js";
import { compositeExactProducts } from "./product-compositor.js";

function selectedRoleIndexes(scene, prefix) {
  const indexes = new Set();
  for (const role of scene.referenceRoles || scene.reference_roles || []) {
    const match = String(role).match(new RegExp(`^${prefix}:(\\d+)$`));
    if (match) indexes.add(Number(match[1]) - 1);
  }
  return indexes;
}

function filterSceneAssets(scene, items, prefix) {
  const indexes = selectedRoleIndexes(scene, prefix);
  if (!indexes.size) return items;
  return items.filter((_item, index) => indexes.has(index));
}

async function materialize(items, maxBytes) {
  return Promise.all(
    items.map(async (item) => ({
      ...item,
      buffer: await readBuffer({
        provider: item.asset.storageProvider,
        key: item.asset.storageKey,
        maxBytes,
      }),
      mimeType: item.asset.mimeType,
    })),
  );
}

export async function loadGenerationContext(job) {
  const [products, references] = await Promise.all([
    getJobProductReferences(job.userId, job.id),
    getJobReferenceAssets(job.userId, job.id),
  ]);
  return { products, references };
}

export function scriptContext(context) {
  return {
    products: context.products.map((product) => ({
      name: product.name,
      strictFidelity: product.strictFidelity,
      preservationNotes: product.preservationNotes,
      productProfile: product.productProfile,
    })),
    references: context.references.map((reference) => ({
      name: reference.name,
      referenceType: reference.referenceType,
      description: reference.description,
      preservationNotes: reference.preservationNotes,
      profile: reference.profile,
    })),
  };
}

export function sceneGenerationPolicy(job, scene, context) {
  if (job.filmType === "product_promo") {
    const products = filterSceneAssets(scene, context.products, "product");
    const strict = products.some((product) => product.strictFidelity);
    return {
      kind: strict ? "exact_product_composite" : "high_fidelity_product_edit",
      preserveProduct: true,
      products,
      references: [],
      animationEngine: strict ? "local" : null,
      reason: strict
        ? "The original product pixels must remain unchanged."
        : "High-fidelity reference editing is permitted by the product profile.",
    };
  }

  const references = filterSceneAssets(scene, context.references, "reference");
  return {
    kind: references.length ? "high_fidelity_reference_edit" : "generated",
    preserveProduct: false,
    products: [],
    references,
    animationEngine: null,
    reason: references.length
      ? "The scene uses saved visual references."
      : "The selected mode does not require an uploaded visual source.",
  };
}

export async function renderSceneImage({
  job,
  scene,
  context,
  outputPath,
  quality,
}) {
  const policy = sceneGenerationPolicy(job, scene, context);

  if (policy.kind === "exact_product_composite") {
    if (!policy.products.length) {
      throw new Error("Strict product scene has no attached product source.");
    }
    const backgroundPath = path.join(
      path.dirname(outputPath),
      `${path.basename(outputPath, path.extname(outputPath))}.background.png`,
    );
    await generateImage(
      buildProductBackgroundPrompt(job, scene),
      backgroundPath,
      quality,
      { aspectRatio: job.aspectRatio, userId: job.userId },
    );
    const products = await materialize(policy.products.slice(0, 4), 50 * 1024 * 1024);
    const result = await compositeExactProducts({
      backgroundPath,
      productBuffers: products.map((product) => product.buffer),
      outputPath,
      aspectRatio: job.aspectRatio,
      shotType: scene.shotType || scene.shot_type || "hero",
    });
    return { ...result, policy };
  }

  const [products, references] = await Promise.all([
    materialize(policy.products, 50 * 1024 * 1024),
    materialize(policy.references, 50 * 1024 * 1024),
  ]);
  await generateSceneImage({
    job,
    scene,
    products,
    references,
    outputPath,
    quality,
  });
  return {
    outputPath,
    preservationMode:
      policy.kind === "generated" ? "generated" : "high_fidelity_reference",
    policy,
  };
}
