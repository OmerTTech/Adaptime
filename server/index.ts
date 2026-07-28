import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import authRoutes from "./routes/auth.js";
import routineRoutes from "./routes/routine.js";
import aiRoutes from "./routes/ai.js";

const app = express();
app.use(cors());
app.use(express.json());

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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Adaptime API running on port ${PORT}`);
});
