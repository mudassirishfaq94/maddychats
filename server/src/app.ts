import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import authRoutes from "./routes/auth.js";
import healthRoutes from "./routes/health.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";

export function createApp() {
  const app = express();

  // Behind the preview proxy, trust the first proxy for secure cookies / IPs.
  app.set("trust proxy", 1);

  // Security headers.
  app.use(
    helmet({
      // API only; no cross-origin resource embedding concerns here.
      crossOriginResourcePolicy: { policy: "same-site" },
    })
  );

  // CORS — allow the configured client origin and send credentials (cookies).
  app.use(
    cors({
      origin: env.CLIENT_URL,
      credentials: true,
    })
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.use("/api/health", healthRoutes);
  app.use("/api/auth", authRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
