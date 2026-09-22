import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import authRoutes from "./routes/auth.js";
import routineRoutes from "./routes/routine.js";
import aiRoutes from "./routes/ai.js";

const app = express();
app.use(helmet());
app.use(express.json({ limit: "1mb" }));

// CORS: whitelist from env, fallback to dev origins + default Netlify domain
const allowedOrigins = (() => {
  const raw = process.env.CORS_ORIGINS;
  if (!raw) {
    return [
      "http://localhost:5173",
      "http://localhost:4173",
      "https://adaptime.netlify.app",
    ];
  }
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
})();

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error(`CORS: origin not allowed (${origin})`));
    },
    credentials: false,
  }),
);

// Helpful log when a request is rejected because its origin is unknown
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.includes(origin)) {
    console.warn(
      `[CORS] Rejected request from '${origin}'. Allowed origins: ${allowedOrigins.join(", ")}. ` +
        `Set CORS_ORIGINS env on the server to customize.`,
    );
  }
  next();
});

// General API rate limit
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Çok fazla istek atıldı, lütfen biraz bekleyin." },
});
app.use("/api", apiLimiter);

// Stricter limit for auth & AI (brute force / key burning protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Çok fazla giriş denemesi. Lütfen sonra tekrar deneyin." },
});
app.use("/api/auth", authLimiter);

const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "AI kota limitine ulaşıldı. Lütfen sonra tekrar deneyin." },
});
app.use("/api/generate-routine", aiLimiter);

// MongoDB connection
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/adaptime";

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    console.log("Running in offline mode (localStorage only)");
  });

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/routines", routineRoutes);
app.use("/api/generate-routine", aiRoutes);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    mongo: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "Endpoint bulunamadı" });
});

// Global error handler
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("Unhandled error:", err);
    const message =
      err instanceof Error ? err.message : "Beklenmeyen bir hata oluştu";
    if (message.startsWith("CORS")) {
      return res.status(403).json({ error: message });
    }
    res.status(500).json({ error: "Sunucu hatası" });
  },
);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Adaptime API running on port ${PORT}`);
  console.log(`Allowed CORS origins: ${allowedOrigins.join(", ")}`);
});