import express from "express";
import {
  createProductFromUpload,
  createReferenceFromUpload,
  deleteProduct,
  deleteReference,
  getProduct,
  getReference,
} from "../services/library-service.js";
import { imageUpload, ingestImageUpload } from "../media/uploads.js";
import { requireCsrf, requireVerifiedUser } from "../middleware/auth.js";

function asyncRoute(handler) {
  return (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);
}

function uploadImage(req, res, next) {
  imageUpload(req, res, (error) => {
    if (error) return next(error);
    return next();
  });
}

async function ensureReferenceAssetsTable(db) {
  try {
    await db.query(`SELECT 1 FROM reference_assets LIMIT 1`);
  } catch (err) {
    if (
      err.code === "ER_NO_SUCH_TABLE" ||
      err.message?.includes("doesn't exist")
    ) {
      await db.query(`
        CREATE TABLE reference_assets (
          id VARCHAR(36) PRIMARY KEY,
          userId VARCHAR(36) NOT NULL,
          kind VARCHAR(20) NOT NULL DEFAULT 'character',
          name VARCHAR(255) NOT NULL,
          description TEXT,
          assetId VARCHAR(36),
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_userId (userId),
          INDEX idx_assetId (assetId)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      console.log("[db] Created reference_assets table");
    } else {
      throw err;
    }
  }
}

// Helper to normalize db.query results (handles both [rows, fields] and raw rows)
function getRows(result) {
  if (
    Array.isArray(result) &&
    result.length === 2 &&
    Array.isArray(result[0])
  ) {
    return result[0];
  }
  return Array.isArray(result) ? result : [];
}

export function createLibraryRouter() {
  const router = express.Router();
  router.use(requireVerifiedUser);

  // GET /api/library — merge service results with our DB table
  router.get(
    "/",
    asyncRoute(async (req, res) => {
// Fetch products and references directly from DB
      const dbModule = await import("../db/pool.js");
      const db = dbModule.default || dbModule.pool || dbModule;
      await ensureReferenceAssetsTable(db);

      const [productRows, refRows] = await Promise.all([
        db.query(
          `SELECT id, name, description, original_asset_id AS originalAssetId,
                  strict_fidelity AS strictFidelity, preservation_notes AS preservationNotes,
                  created_at AS createdAt, updated_at AS updatedAt
           FROM products WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`,
          [req.user.id],
        ),
        db.query(
          `SELECT id, kind, name, description, assetId, createdAt, updatedAt FROM reference_assets WHERE userId = ? ORDER BY createdAt DESC`,
          [req.user.id],
        ),
      ]);

      const products = getRows(productRows).map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        originalAssetId: r.originalAssetId,
        strictFidelity: Boolean(r.strictFidelity),
        preservationNotes: r.preservationNotes,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        originalAsset: null,
      }));

      const references = getRows(refRows).map((r) => ({
        id: r.id,
        kind: r.kind,
        name: r.name,
        description: r.description,
        assetId: r.assetId,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        asset: null,
      }));

      res.json({ products, references });
    }),
  );

  router.post(
    "/products",
    requireCsrf,
    uploadImage,
    asyncRoute(async (req, res) => {
      const result = await createProductFromUpload({
        user: req.user,
        file: req.file,
        fields: req.body,
      });
      res.status(result.ok ? 201 : 400).json(result);
    }),
  );

  router.get(
    "/products/:productId",
    asyncRoute(async (req, res) => {
      const product = await getProduct(req.user, req.params.productId);
      if (!product) {
        res.status(404).json({
          error: { code: "PRODUCT_NOT_FOUND", message: "Product not found." },
        });
        return;
      }
      res.json({ product });
    }),
  );

  router.delete(
    "/products/:productId",
    requireCsrf,
    asyncRoute(async (req, res) => {
      const deleted = await deleteProduct(req.user, req.params.productId);
      if (!deleted) {
        res.status(404).json({
          error: { code: "PRODUCT_NOT_FOUND", message: "Product not found." },
        });
        return;
      }
      res.status(204).end();
    }),
  );

  // ── REFERENCES ──
  router.post(
    "/references",
    requireCsrf,
    uploadImage,
    asyncRoute(async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({
            error: {
              code: "FILE_REQUIRED",
              message: "No image file received.",
            },
          });
        }

        // STEP 1: Try to save to the service FIRST (so AI generation can use it)
        let serviceRef = null;
        try {
          const serviceResult = await createReferenceFromUpload({
            user: req.user,
            file: req.file,
            fields: req.body,
          });
          if (serviceResult?.ok && serviceResult?.reference) {
            serviceRef = serviceResult.reference;
            console.log("[POST /references] service saved:", serviceRef.id);
          }
        } catch (svcErr) {
          console.log(
            "[POST /references] service save failed (will use DB only):",
            svcErr.message,
          );
        }

        // STEP 2: Always also save to our DB table (for library display + backup)
        const dbModule = await import("../db/pool.js");
        const db = dbModule.default || dbModule.pool || dbModule;
        await ensureReferenceAssetsTable(db);

        // If service succeeded, we already have an asset. If not, create one.
        let asset = serviceRef?.asset;
        if (!asset) {
          asset = await ingestImageUpload({
            userId: req.user.id,
            file: req.file,
            kind: "reference_image",
            metadata: { source: "library_reference" },
          });
        }

        console.log("[POST /references] asset.id:", asset?.id);

        const id = serviceRef?.id || crypto.randomUUID();
        const kind = req.body.referenceType || req.body.kind || "character";
        const name = req.body.name || req.file.originalname;

        await db.query(
          `INSERT INTO reference_assets 
           (id, userId, kind, name, description, assetId, createdAt, updatedAt) 
           VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
           ON DUPLICATE KEY UPDATE
           kind = VALUES(kind), name = VALUES(name), description = VALUES(description),
           assetId = VALUES(assetId), updatedAt = NOW()`,
          [id, req.user.id, kind, name, req.body.description || null, asset.id],
        );

        res.status(201).json({
          ok: true,
          reference: {
            id,
            kind,
            name,
            description: req.body.description || null,
            assetId: asset.id,
            createdAt: serviceRef?.createdAt || new Date().toISOString(),
            updatedAt: serviceRef?.updatedAt || new Date().toISOString(),
            asset: {
              id: asset.id,
              mimeType: asset.mimeType || "image/png",
              byteSize: asset.byteSize || 0,
              width: asset.width || null,
              height: asset.height || null,
              createdAt: new Date().toISOString(),
            },
          },
        });
      } catch (err) {
        console.error("[POST /references] error:", err);
        res.status(500).json({
          error: {
            code: "SERVER_ERROR",
            message: err.message || "Upload failed.",
          },
        });
      }
    }),
  );

  router.get(
    "/references/:referenceId",
    asyncRoute(async (req, res) => {
      const reference = await getReference(req.user, req.params.referenceId);
      if (!reference) {
        res.status(404).json({
          error: {
            code: "REFERENCE_NOT_FOUND",
            message: "Reference not found.",
          },
        });
        return;
      }
      res.json({ reference });
    }),
  );

  router.delete(
    "/references/:referenceId",
    requireCsrf,
    asyncRoute(async (req, res) => {
      // Try service delete first
      const deleted = await deleteReference(req.user, req.params.referenceId);

      // Also delete from our table
      const dbModule = await import("../db/pool.js");
      const db = dbModule.default || dbModule.pool || dbModule;
      await ensureReferenceAssetsTable(db);
      await db.query(
        `DELETE FROM reference_assets WHERE id = ? AND userId = ?`,
        [req.params.referenceId, req.user.id],
      );

      if (!deleted) {
        res.status(404).json({
          error: {
            code: "REFERENCE_NOT_FOUND",
            message: "Reference not found.",
          },
        });
        return;
      }
      res.status(204).end();
    }),
  );

  return router;
}
