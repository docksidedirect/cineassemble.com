import express from "express";
import { createReadStream, statSync, existsSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { requireVerifiedUser } from "../middleware/auth.js";

function asyncRoute(handler) {
  return (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);
}

// Recursively find a file by asset ID in a directory and all subdirectories
function findFileRecursively(dir, assetId) {
  if (!existsSync(dir)) return null;

  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        const found = findFileRecursively(fullPath, assetId);
        if (found) return found;
      } else if (entry.isFile() && entry.name.includes(assetId)) {
        return fullPath;
      }
    }
  } catch {
    // ignore permission errors etc
  }
  return null;
}

export function createMediaRouter() {
  const router = express.Router();
  router.use(requireVerifiedUser);

  router.get(
    "/assets/:assetId",
    asyncRoute(async (req, res) => {
      const assetId = req.params.assetId;

      if (!assetId || assetId === "undefined") {
        return res.status(400).json({
          error: { code: "INVALID_ASSET_ID", message: "Asset ID is missing." },
        });
      }

      const __dirname = dirname(fileURLToPath(import.meta.url));
      const projectRoot = resolve(__dirname, "..", "..");
      const userId = req.user.id;

      // Search the tenant folder recursively
      const tenantDir = resolve(
        projectRoot,
        "data",
        "private",
        "tenants",
        userId,
      );

      console.log("[media] searching tenant dir:", tenantDir);
      console.log("[media] for assetId:", assetId);

      const filePath = findFileRecursively(tenantDir, assetId);

      if (!filePath) {
        console.error("[media] File NOT found for asset:", assetId);
        return res.status(404).json({
          error: {
            code: "FILE_NOT_FOUND",
            message: "Image file missing on disk.",
          },
        });
      }

      console.log("[media] FOUND file:", filePath);

      // Guess mime type from extension
      let mimeType = "image/png";
      if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) {
        mimeType = "image/jpeg";
      } else if (filePath.endsWith(".webp")) {
        mimeType = "image/webp";
      } else if (filePath.endsWith(".gif")) {
        mimeType = "image/gif";
      } else if (filePath.endsWith(".mp4")) {
        mimeType = "video/mp4";
      }

      res.set("Content-Type", mimeType);
      res.set("Cache-Control", "public, max-age=31536000");
      createReadStream(filePath).pipe(res);
    }),
  );

  return router;
}
