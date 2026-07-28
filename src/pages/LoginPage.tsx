import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Sparkles } from "lucide-react";

export default function LoginPage() {
  const { loginWithDemo } = useAuth();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Sparkles size={32} className="text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-text">Adaptime</h1>
          <p className="text-text-muted mt-2">
            Zamanını akıllıca yönet. ADHD dostu rutin asistanın.
          </p>
        </div>

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

          <p className="text-xs text-text-muted text-center">
            Google ile giriş yakında eklenecek. Şu an demo modu ile devam edin.
          </p>
        </form>
      </div>
    </div>
  );
}
