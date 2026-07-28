import { Router } from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { generateToken } from "../middleware/auth.js";

const router = Router();
const JWT_SECRET =
  process.env.JWT_SECRET || "adaptime-dev-secret-change-in-production";

// Google Login
router.post("/google", async (req, res) => {
  try {
    const { googleId, email, name, avatar } = req.body;
    if (!googleId || !email || !name) {
      return res.status(400).json({ error: "Eksik bilgi" });
    }

    let user = await User.findOne({ googleId });
    if (!user) {
      user = await User.create({ googleId, email, name, avatar });
    }

    const token = generateToken(user._id.toString());
    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    console.error("Google auth error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// Demo Login (no Google required)
router.post("/demo", async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email || !name) {
      return res.status(400).json({ error: "Eksik bilgi" });
    }

    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({ email, name, avatar: undefined });
    }

    const token = generateToken(user._id.toString());
    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    console.error("Demo auth error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// Get current user
router.get("/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Token bulunamadı" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const user = await User.findById(decoded.userId).select("-__v");
    if (!user) {
      return res.status(404).json({ error: "Kullanıcı bulunamadı" });
    }

    res.json({
      id: user._id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
    });
  } catch {
    return res.status(401).json({ error: "Geçersiz token" });
  }
});

export default router;
