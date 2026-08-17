import { describe, expect, it } from "vitest";
import {
  assertVideoTypeSelection,
  listVideoTypes,
} from "../server/video-types.js";
import {
  estimateJob,
  estimateSceneCount,
  estimateSceneRegeneration,
} from "../server/pricing.js";
import {
  clientIpPrefix,
  randomToken,
  safeEqualHash,
  sessionSecrets,
  tokenHash,
  userAgentHash,
} from "../server/security/tokens.js";

const baseSelection = {
  mode: "narration",
  aspectRatio: "16:9",
  targetMinutes: 1,
  attachedRoles: [],
};

describe("video type registry", () => {
  it("publishes seven unique production strategies through one stable UI contract", () => {
    const types = listVideoTypes();
    expect(types).toHaveLength(7);
    expect(new Set(types.map((type) => type.id)).size).toBe(types.length);
    for (const type of types) {
      expect(type.label.length).toBeGreaterThan(3);
      expect(type.description.length).toBeGreaterThan(20);
      expect(type.supportedFormats).toEqual(type.aspectRatios);
      expect(type.defaultStyle).toBeTruthy();
      expect(type.preservationMode).toBeTruthy();
      expect(type.scriptFramework).toBeTruthy();
      expect(type.visualPolicy.length).toBeGreaterThan(30);
      expect(type.requiredReferences).toBeTypeOf("object");
    }
  });

  it("requires an owned product for real-product promotions", () => {
    const rejected = assertVideoTypeSelection({
      ...baseSelection,
      filmType: "product_promo",
    });
    expect(rejected.ok).toBe(false);
    expect(rejected.code).toBe("MISSING_REFERENCE_ASSET");
    expect(rejected.missingRoles).toContain("product");

    const accepted = assertVideoTypeSelection({
      ...baseSelection,
      filmType: "product_promo",
      attachedRoles: ["product"],
    });
    expect(accepted.ok).toBe(true);
  });

  it("enforces mode, format, and duration constraints per production type", () => {
    expect(
      assertVideoTypeSelection({
        ...baseSelection,
        filmType: "social_ad",
        aspectRatio: "9:16",
        targetMinutes: 2,
      }).ok,
    ).toBe(true);
    expect(
      assertVideoTypeSelection({
        ...baseSelection,
        filmType: "social_ad",
        targetMinutes: 3,
      }).code,
    ).toBe("INVALID_DURATION");
    expect(
      assertVideoTypeSelection({
        ...baseSelection,
        filmType: "unknown_type",
      }).code,
    ).toBe("INVALID_FILM_TYPE");
  });
});

describe("server-side generation estimates", () => {
  it("prices premium and lip-synced jobs above equivalent budget jobs", () => {
    const budget = estimateJob({
      filmType: "cartoon_story",
      targetMinutes: 1,
      qualityTier: "budget",
      lipsync: false,
    });
    const premium = estimateJob({
      filmType: "cartoon_story",
      targetMinutes: 1,
      qualityTier: "premium",
      lipsync: true,
    });
    expect(premium.estimatedCostUsd).toBeGreaterThan(budget.estimatedCostUsd);
    expect(premium.estimatedCredits).toBeGreaterThan(budget.estimatedCredits);
    expect(premium.breakdown.lipsync).toBeGreaterThan(0);
  });

  it("uses faster scene pacing for social advertisements", () => {
    const social = estimateSceneCount({ filmType: "social_ad", targetMinutes: 1 });
    const cinematic = estimateSceneCount({ filmType: "cinematic_story", targetMinutes: 1 });
    expect(social).toBeGreaterThanOrEqual(cinematic);
    expect(social).toBeGreaterThanOrEqual(6);
  });

  it("keeps administrator scene regeneration unlimited on the server", () => {
    const userEstimate = estimateSceneRegeneration({
      qualityTier: "premium",
      lipsync: true,
      role: "user",
    });
    const adminEstimate = estimateSceneRegeneration({
      qualityTier: "premium",
      lipsync: true,
      role: "admin",
    });
    expect(userEstimate.estimatedCredits).toBeGreaterThanOrEqual(1);
    expect(adminEstimate.estimatedCredits).toBe(0);
    expect(adminEstimate.estimatedCostUsd).toBe(userEstimate.estimatedCostUsd);
  });
});

describe("native authentication token primitives", () => {
  it("generates independent high-entropy session and CSRF secrets", () => {
    const first = sessionSecrets();
    const second = sessionSecrets();
    expect(first.token).not.toBe(first.csrf);
    expect(first.token).not.toBe(second.token);
    expect(first.tokenHash).toBe(tokenHash(first.token));
    expect(first.csrfHash).toBe(tokenHash(first.csrf));
    expect(safeEqualHash(first.tokenHash, first.token)).toBe(true);
    expect(safeEqualHash(first.tokenHash, second.token)).toBe(false);
  });

  it("creates URL-safe random tokens and deterministic privacy hashes", () => {
    const token = randomToken(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(userAgentHash("Browser A")).toBe(userAgentHash("Browser A"));
    expect(userAgentHash("Browser A")).not.toBe(userAgentHash("Browser B"));
  });

  it("stores only a privacy-preserving IPv4 /24 prefix", () => {
    expect(clientIpPrefix("192.0.2.15")).toEqual(clientIpPrefix("192.0.2.220"));
    expect(clientIpPrefix("192.0.2.15")).not.toEqual(clientIpPrefix("192.0.3.15"));
    expect(clientIpPrefix("not-an-ip")).toBeNull();
  });
});
