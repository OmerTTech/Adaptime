import { Router } from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { generateToken, authMiddleware, type AuthRequest } from "../middleware/auth.js";

const router = Router();

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "";

/**
 * Firebase ID token'ı doğrula.
 * Firebase projesinin public certificate'leri Google'ın açık endpoint'inden
 * alınır; imza, süre, audience ve issuer kontrol edilir. Service account
 * (GCP credential) gerektirmez — tamamen ücretsiz ve her ortamda çalışır.
 */
async function verifyFirebaseIdToken(
  idToken: string,
): Promise<{ uid: string; email?: string; name?: string; picture?: string }> {
  if (!FIREBASE_PROJECT_ID) {
    throw new Error("FIREBASE_PROJECT_ID env değişkeni tanımlı değil");
  }

  let header: jwt.JwtHeader | undefined;
  try {
    header = jwt.decode(idToken, { complete: true, json: true })?.header;
  } catch {
    header = undefined;
  }
  if (!header || !header.kid) {
    throw new Error("Geçersiz Firebase token");
  }

  const certRes = await fetch(
    "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com",
    { headers: { "User-Agent": "adaptime" } },
  );
  if (!certRes.ok) {
    throw new Error("Google public key'leri alınamadı");
  }
  const certs = (await certRes.json()) as Record<string, string>;
  const publicKey = certs[header.kid];
  if (!publicKey) {
    throw new Error("Token için eşleşen public key bulunamadı");
  }

  const payload = jwt.verify(idToken, publicKey, {
    algorithms: ["RS256"],
  }) as jwt.JwtPayload;

  const expectedIssuer = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
  if (payload.iss !== expectedIssuer) {
    throw new Error("Geçersiz issuer");
  }
  if (payload.aud !== FIREBASE_PROJECT_ID) {
    throw new Error("Geçersiz audience");
  }
  if (!payload.sub) {
    throw new Error("Geçersiz token (uid yok)");
  }

  return {
    uid: payload.sub as string,
    email: typeof payload.email === "string" ? payload.email : undefined,
    name: typeof payload.name === "string" ? payload.name : undefined,
    picture: typeof payload.picture === "string" ? payload.picture : undefined,
  };
}

// Google Login (verifies the Firebase ID token issued by Firebase Auth)
router.post("/google", async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: "Firebase ID token eksik" });
    }

    let profile;
    try {
      profile = await verifyFirebaseIdToken(idToken);
    } catch (e) {
      console.error("Firebase token verification failed:", e);
      return res.status(401).json({
        error:
          e instanceof Error && e.message
            ? e.message
            : "Firebase token doğrulanamadı",
      });
    }

    const { uid, email, name, picture } = profile;
    let user = await User.findOne({ email: email || "" });
    if (!user) {
      user = await User.findOne({ googleId: uid });
    }
    if (!user) {
      user = await User.create({
        googleId: uid,
        email: email || `${uid}@firebase.local`,
        name: name || email?.split("@")[0] || "Kullanıcı",
        avatar: picture,
      });
    } else {
      user.googleId = uid;
      if (name) user.name = name;
      if (picture) user.avatar = picture;
      await user.save();
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
router.get("/me", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const user = await User.findById(req.userId).select("-__v");
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