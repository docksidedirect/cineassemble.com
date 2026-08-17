import { getProvider } from "../providers.js";

/**
 * Generate an image for a scene.
 * Passes referenceAssetIds and productAssetIds to the provider
 * so uploaded user images are actually used in generation.
 */
export async function generateImage(prompt, options = {}) {
  const {
    aspectRatio,
    stylePreset,
    qualityTier,
    filmType,
    referenceAssetIds = [],
    productAssetIds = [],
  } = options;

  const provider = getProvider(filmType, qualityTier);

  // Pass reference images through to the provider.
  // If your provider supports IP-Adapter, ControlNet, or img2img,
  // it should use these IDs to condition generation on the uploaded references.
  const enhancedOptions = {
    aspectRatio,
    stylePreset,
    qualityTier,
    filmType,
    referenceImages: referenceAssetIds,
    productImages: productAssetIds,
  };

  const assetId = await provider.generateImage(prompt, enhancedOptions);

  // Warn if references were provided but provider may have ignored them
  if (referenceAssetIds.length > 0 && !assetId) {
    console.warn(
      `[image-service] Provider returned no assetId for job with ${referenceAssetIds.length} references. ` +
        `References may have been ignored.`,
    );
  }

  return assetId;
}
