import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAppDispatch } from "@/store/hooks";
import { resetRoutine } from "@/store/slices/routineSlice";
import { useTheme } from "@/contexts/ThemeContext";
import { routineApi } from "@/services/api";
import { Settings, User, Palette, Trash2, LogOut, Database } from "lucide-react";

export default function SettingsPage() {
  const { user, token, logout } = useAuth();
  const dispatch = useAppDispatch();
  const { theme, toggle } = useTheme();
  const [confirmReset, setConfirmReset] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleLogout = () => {
    dispatch(resetRoutine());
    logout();
  };

  const handleWipe = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      setMessage(null);
      return;
    }
    setClearing(true);
    setMessage(null);
    try {
      if (token) {
        await routineApi.deleteAll(token);
      }
      dispatch(resetRoutine());
      setMessage("Tüm veriler silindi.");
    } catch {
      setMessage("Silme sırasında hata oluştu. Tekrar dene.");
    } finally {
      setClearing(false);
      setConfirmReset(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h2 className="text-lg font-bold text-text flex items-center gap-2">
          <Settings size={18} className="text-primary" />
          Ayarlar
        </h2>
        <p className="text-xs text-text-muted">
          Hesap, görünüm ve veri ayarların.
        </p>
      </div>

      <div className="p-4 rounded-xl bg-surface border border-border">
        <div className="flex items-center gap-2 text-sm font-medium text-text mb-3">
          <User size={16} className="text-primary" />
          Hesap
        </div>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-lg font-bold text-primary overflow-hidden">
            {user?.avatar ? (
              <img
                src={user.avatar}
                alt={user?.name}
                className="w-full h-full object-cover"
              />
            ) : (
              user?.name.charAt(0).toUpperCase()
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-text">{user?.name}</p>
            <p className="text-xs text-text-muted">{user?.email}</p>
          </div>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-surface border border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-text">
            <Palette size={16} className="text-primary" />
            Tema
          </div>
          <button
            onClick={toggle}
            className="px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary/90 transition-colors text-sm font-medium"
          >
            {theme === "dark" ? "Aydınlık Moda Geç" : "Karanlık Moda Geç"}
          </button>
        </div>
        <p className="text-xs text-text-muted mt-1">
          Şu an: {theme === "dark" ? "Karanlık" : "Aydınlık"}
        </p>
      </div>

      <div className="p-4 rounded-xl bg-surface border border-border">
        <div className="flex items-center gap-2 text-sm font-medium text-text mb-1">
          <Database size={16} className="text-primary" />
          Veri
        </div>
        <p className="text-xs text-text-muted mb-3">
          Görevlerin hesabına bağlı ve sunucuda saklanır. Oturumu açmadan
          gelen veriler (Hızlı Deneme) tarayıcında yerel olarak tutulur. Bu
          buton hem yerel hem sunucu verisini kalıcı olarak siler.
        </p>
        <button
          onClick={handleWipe}
          disabled={clearing}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
            confirmReset
              ? "bg-danger text-white border-danger"
              : "bg-danger/10 text-danger border-danger/30 hover:bg-danger/20"
          } disabled:opacity-60 disabled:cursor-not-allowed`}
        >
          <Trash2 size={14} />
          {clearing
            ? "Siliniyor..."
            : confirmReset
              ? "Emin misin? Tekrar tıkla"
              : "Tüm verileri sil"}
        </button>
        {message && <p className="text-xs text-text-muted mt-2">{message}</p>}
      </div>

      <button
        onClick={handleLogout}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-border text-danger hover:bg-danger/10 transition-all text-sm font-medium"
      >
        <LogOut size={16} />
        Çıkış Yap
      </button>
    </div>
  );
}