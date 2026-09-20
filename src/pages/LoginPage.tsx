import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { signInWithRedirect, getRedirectResult } from "firebase/auth";
import { auth, googleProvider, FIREBASE_CONFIGURED } from "@/services/firebase";
import { Sparkles } from "lucide-react";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const { loginWithDemo, loginWithGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRedirectResult = async () => {
    if (!auth) return;
    try {
      const result = await getRedirectResult(auth);
      if (result?.user) {
        const idToken = await result.user.getIdToken();
        await loginWithGoogle(idToken);
      }
    } catch (err) {
      console.error("[Google] redirect sonuc hatasi:", err);
      const code = (err as { code?: string })?.code;
      if (code === "auth/unauthorized-domain") {
        setError(
          "adaptime.netlify.app, Firebase'de yetkili degil. Firebase Console → Authentication → Settings → Authorized domains'e ekleyin."
        );
      } else if (code) {
        setError(`Google ile giriş tamamlanamadı (${code}). Lütfen tekrar deneyin.`);
      }
    }
  };

  useEffect(() => {
    handleRedirectResult();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !name) return;
    setIsLoading(true);
    setError(null);

    try {
      await loginWithDemo(email, name);
    } catch {
      setError("Giriş başarısız. Lütfen tekrar deneyin.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!auth) return;
    setError(null);
    setIsGoogleLoading(true);
    try {
      await signInWithRedirect(auth, googleProvider);
    } catch (err) {
      console.error("[Google] redirect baslatma hatasi:", err);
      const code = (err as { code?: string })?.code;
      if (code === "auth/unauthorized-domain") {
        setError(
          "Netlify domain'i Firebase'de yetkili degil. Firebase Console → Authentication → Settings → Authorized domains'e adaptime.netlify.app ekleyin."
        );
      } else {
        setError(
          code
            ? `Google ile giriş başlatılamadı (${code}). Lütfen tekrar deneyin.`
            : "Google ile giriş başlatılamadı. Lütfen tekrar deneyin."
        );
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background px-4 flex flex-col overflow-y-auto">
      <div className="w-full max-w-md m-auto py-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Sparkles size={32} className="text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-text">Adaptime</h1>
          <p className="text-text-muted mt-2">
            Zamanını akıllıca yönet. ADHD dostu rutin asistanın.
          </p>
        </div>

        {FIREBASE_CONFIGURED && (
          <div className="mb-4">
            <div className="flex justify-center">
              {isGoogleLoading ? (
                <div className="text-sm text-text-muted py-3">
                  Google ile bağlanılıyor...
                </div>
              ) : (
                <button
                  onClick={handleGoogleLogin}
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-surface border border-border text-text font-medium transition-all hover:border-primary/40 hover:bg-surface-hover"
                >
                  <GoogleIcon />
                  Google ile Giriş Yap
                </button>
              )}
            </div>
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-text-muted">veya</span>
              <div className="flex-1 h-px bg-border" />
            </div>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="bg-surface border border-border rounded-2xl p-6 space-y-4"
        >
          <div>
            <label className="text-xs text-text-muted mb-1 block">Adınız</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ömer"
              className="w-full px-4 py-3 rounded-xl bg-background border border-border text-text focus:outline-none focus:ring-2 focus:ring-primary/50"
              required
            />
          </div>

          <div>
            <label className="text-xs text-text-muted mb-1 block">
              E-posta
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="omer@example.com"
              className="w-full px-4 py-3 rounded-xl bg-background border border-border text-text focus:outline-none focus:ring-2 focus:ring-primary/50"
              required
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 rounded-xl bg-primary hover:bg-primary-hover text-white font-medium transition-all disabled:opacity-50"
          >
            {isLoading ? "Giriş yapılıyor..." : "Giriş Yap"}
          </button>

          {!FIREBASE_CONFIGURED && (
            <p className="text-xs text-text-muted text-center">
              Firebase yapılandırması eksik olduğu için Google girişi kapalı.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
