import crypto from "node:crypto";
import pino from "pino";
import pinoHttp from "pino-http";
import { config } from "./config.js";

export const logger = pino({
  level: process.env.LOG_LEVEL || (config.production ? "info" : "debug"),
  base: {
    service: "cineassemble",
    environment: config.nodeEnv,
  },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['x-csrf-token']",
      "res.headers['set-cookie']",
      "password",
      "token",
      "sessionToken",
      "csrfToken",
      "clientSecret",
      "*.password",
      "*.token",
      "*.sessionToken",
      "*.csrfToken",
    ],
    censor: "[REDACTED]",
  },
  serializers: {
    err: pino.stdSerializers.err,
  },
});

export const requestLogger = pinoHttp({
  logger,
  genReqId(req, res) {
    const incoming = req.headers["x-request-id"];
    const id =
      typeof incoming === "string" && /^[a-zA-Z0-9._-]{8,80}$/.test(incoming)
        ? incoming
        : crypto.randomUUID();
    res.setHeader("X-Request-Id", id);
    return id;
  },
  customProps(req) {
    return {
      userId: req.user?.id || null,
      sessionId: req.auth?.id || null,
    };
  },
  customLogLevel(_req, res, error) {
    if (error || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  autoLogging: {
    ignore(req) {
      return req.url === "/health/live";
    },
  },
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "req.headers.x-csrf-token",
    "res.headers.set-cookie",
  ],
});
