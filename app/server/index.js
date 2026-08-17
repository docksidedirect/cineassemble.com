console.log(
  "ENV KEY ENDS WITH:",
  process.env.OPENAI_API_KEY?.slice(-4) || "NOT SET",
);
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import multer from "multer";
import {
  ASPECT_RATIOS,
  SUPPORTED_LANGUAGES,
  assertProductionConfig,
  config,
} from "./config.js";
import { closePool, databaseHealth } from "./db/pool.js";
import { migrate } from "./db/migrate.js";
import { authenticateSession } from "./middleware/auth.js";
import { ensurePrivateStorage } from "./media/storage.js";
import { UploadValidationError } from "./media/uploads.js";
import { createAdminRouter } from "./routes/admin.js";
import { createAuthRouter } from "./routes/auth.js";
import { createBillingRouter } from "./routes/billing.js";
import { createJobsRouter } from "./routes/jobs.js";
import { createLibraryRouter } from "./routes/library.js";
import { createMediaRouter } from "./routes/media.js";
import { logger, requestLogger } from "./logger.js";
import { listVideoTypes } from "./video-types.js";
import { validateSetup } from "./setup-gate.js";

validateSetup();

const currentFile = fileURLToPath(import.meta.url);
const distDir = path.join(path.dirname(currentFile), "..", "dist");
const allowedOrigins = new Set(
  config.allowedOrigins.map((origin) => origin.replace(/\/$/, "")),
);

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip(req) {
    return req.path === "/health/live";
  },
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many requests. Wait briefly and try again.",
    },
  },
});

const generationLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip(req) {
    return ["GET", "HEAD", "OPTIONS"].includes(req.method);
  },
  message: {
    error: {
      code: "GENERATION_RATE_LIMITED",
      message: "Too many creation requests. Wait before trying again.",
    },
  },
});

function securityDirectives() {
  const directives = {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    objectSrc: ["'none'"],
    frameAncestors: ["'none'"],
    formAction: [
      "'self'",
      "https://www.paypal.com",
      "https://www.sandbox.paypal.com",
    ],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "blob:"],
    mediaSrc: ["'self'", "blob:"],
    fontSrc: ["'self'", "data:"],
    connectSrc: ["'self'", ...allowedOrigins],
  };
  if (config.production) directives.upgradeInsecureRequests = [];
  return directives;
}

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  if (config.trustProxy > 0) app.set("trust proxy", config.trustProxy);

  app.use(requestLogger);
  app.use(
    helmet({
      contentSecurityPolicy: { directives: securityDirectives() },
      crossOriginResourcePolicy: { policy: "same-site" },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    }),
  );
  app.use(
    cors({
      credentials: true,
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "X-CSRF-Token", "X-Request-Id", "Range"],
      exposedHeaders: ["Content-Range", "Accept-Ranges", "X-Request-Id"],
      origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin.replace(/\/$/, ""))) {
          callback(null, true);
          return;
        }
        callback(new Error("CORS_ORIGIN_DENIED"));
      },
    }),
  );
  app.use(
    express.json({
      limit: "2mb",
      type: ["application/json", "application/*+json"],
    }),
  );
  app.use(
    express.urlencoded({ extended: false, limit: "64kb", parameterLimit: 30 }),
  );
  app.use(cookieParser());

  app.get("/health/live", (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/health/ready", async (req, res) => {
    try {
      const database = await databaseHealth();
      if (config.storageProvider === "local") {
        await fsp.access(
          config.privateStorageRoot,
          fs.constants.R_OK | fs.constants.W_OK,
        );
      }
      if (!database.ok) {
        res
          .status(503)
          .json({ ok: false, database: { latencyMs: database.latencyMs } });
        return;
      }
      res.json({ ok: true, database: { latencyMs: database.latencyMs } });
    } catch (error) {
      req.log?.error({ err: error }, "Readiness check failed.");
      res.status(503).json({ ok: false });
    }
  });

  app.use(globalLimiter);
  app.use(authenticateSession);

  app.get("/api/meta", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({
      productName: "CineAssemble",
      videoTypes: listVideoTypes(),
      aspectRatios: Object.values(ASPECT_RATIOS).map(
        ({ id, label, width, height }) => ({
          id,
          label,
          width,
          height,
        }),
      ),
      languages: Object.fromEntries(
        SUPPORTED_LANGUAGES.map(({ code, label }) => [code, label]),
      ),
      voiceModes: [
        { id: "narration", label: "Narrator or presenter" },
        { id: "dialogue", label: "Characters speak with individual voices" },
      ],
      qualityTiers: [
        { id: "budget", label: "Budget" },
        { id: "standard", label: "Standard" },
        { id: "premium", label: "Premium" },
      ],
    });
  });

  app.use("/api/auth", createAuthRouter());
  app.use("/api/admin", createAdminRouter());
  app.use("/api/billing", createBillingRouter());
  app.use("/api/library", createLibraryRouter());
  app.use("/api/media", createMediaRouter());
  app.use("/api/jobs", generationLimiter, createJobsRouter());

  if (fs.existsSync(distDir)) {
    app.use(
      express.static(distDir, {
        index: false,
        maxAge: config.production ? "1h" : 0,
        etag: true,
        fallthrough: true,
      }),
    );
    app.use((req, res, next) => {
      if (
        req.method === "GET" &&
        !req.path.startsWith("/api/") &&
        !req.path.startsWith("/health/") &&
        !req.path.startsWith("/media/") &&
        !path.extname(req.path) &&
        req.accepts("html")
      ) {
        res.setHeader("Cache-Control", "no-cache");
        res.sendFile(path.join(distDir, "index.html"));
        return;
      }
      next();
    });
  }

  app.use((_req, res) => {
    res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "The requested resource was not found.",
      },
    });
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    let status = Number(error?.status || error?.statusCode || 500);
    let code = error?.code || "INTERNAL_ERROR";
    let message = error?.message || "The request could not be completed.";

    if (error instanceof UploadValidationError) {
      status = error.status;
      code = error.code;
    } else if (error instanceof multer.MulterError) {
      status = 400;
      code =
        error.code === "LIMIT_FILE_SIZE" ? "IMAGE_TOO_LARGE" : "INVALID_UPLOAD";
      message =
        code === "IMAGE_TOO_LARGE"
          ? "The image exceeds the configured upload limit."
          : "The upload did not match the expected image form.";
    } else if (error?.type === "entity.too.large") {
      status = 413;
      code = "REQUEST_TOO_LARGE";
      message = "The request body is too large.";
    } else if (message === "CORS_ORIGIN_DENIED") {
      status = 403;
      code = "ORIGIN_NOT_ALLOWED";
      message = "This request origin is not allowed.";
    }

    if (status < 400 || status > 599) status = 500;
    req.log?.error({ err: error, code, status }, "Request failed.");
    if (status >= 500 && config.production) {
      code = "INTERNAL_ERROR";
      message = "The request could not be completed.";
    }
    res.status(status).json({
      error: { code, message, requestId: req.id || null },
    });
  });

  return app;
}

export async function startServer() {
  const configurationErrors = assertProductionConfig();
  if (configurationErrors.length) {
    throw new Error(configurationErrors.join(" "));
  }
  await migrate({ logger });
  await ensurePrivateStorage();
  const app = createApp();
  const server = app.listen(config.port, config.host, () => {
    logger.info(
      { host: config.host, port: config.port, storage: config.storageProvider },
      "CineAssemble API started.",
    );
  });

  const shutdown = async (signal) => {
    logger.info({ signal }, "API shutdown requested.");
    server.close(async () => {
      await closePool();
      logger.info("API stopped.");
    });
    setTimeout(() => process.exit(1), 30_000).unref();
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
  return server;
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === currentFile;
if (invokedDirectly) {
  startServer().catch((error) => {
    logger.fatal({ err: error }, "API failed to start.");
    process.exitCode = 1;
  });
}
