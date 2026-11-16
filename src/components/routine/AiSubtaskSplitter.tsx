import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { accountabilityApi } from "@/services/api";
import { ListChecks, Loader2, Plus, Sparkles, X } from "lucide-react";

interface AiSubtaskSplitterProps {
  title: string;
  description: string;
  /** Zaten eklenmiş alt görevler: tekrar önerilmesin. */
  existing?: string[];
  onAdd: (titles: string[]) => void;
}

/**
 * Açıklamayı AI ile alt görev listesine böler.
 * Öneriler işaretlenebilir; seçilenler göreve alt görev olarak eklenir.
 */
export default function AiSubtaskSplitter({
  title,
  description,
  existing = [],
  onAdd,
}: AiSubtaskSplitterProps) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"ai" | "fallback" | null>(null);
  const [items, setItems] = useState<{ text: string; checked: boolean }[]>([]);

  const run = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await accountabilityApi.subtasks(
        { title: title.trim(), description: description.trim() },
        token,
      );
      const lower = new Set(existing.map((e) => e.trim().toLowerCase()));
      const fresh = res.items
        .filter((i) => !lower.has(i.trim().toLowerCase()))
        .map((text) => ({ text, checked: true }));
      setItems(fresh);
      setSource(res.source);
      if (fresh.length === 0) {
        setError("Yeni alt görev çıkmadı; açıklamayı biraz detaylandır.");
      }
    } catch {
      setError("Alt görevler oluşturulamadı, tekrar dene.");
    } finally {
      setLoading(false);
    }
  };

  const selected = items.filter((i) => i.checked);

  return (
    <div className="rounded-xl border border-dashed border-primary/40 bg-primary/[0.04] p-2.5">
      <div className="flex items-center gap-2">
        <ListChecks size={13} className="text-primary shrink-0" />
        <p className="text-[11px] text-text-muted flex-1 min-w-0">
          Açıklamayı yaz, alt görevlere bölsün.
        </p>
        <button
          type="button"
          onClick={run}
          disabled={loading || (!title.trim() && !description.trim())}
          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/15 text-primary text-[11px] font-medium hover:bg-primary/25 transition-colors disabled:opacity-40"
          title="Açıklamadan alt görev listesi çıkar"
        >
          {loading ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <Sparkles size={11} />
          )}
          Alt görevlere böl
        </button>
      </div>

      {error && <p className="text-[10px] text-danger mt-1.5">{error}</p>}

      {items.length > 0 && (
        <div className="mt-2 space-y-1">
          {items.map((item, i) => (
            <label
              key={`${item.text}-${i}`}
              className="flex items-start gap-2 rounded-lg bg-background/70 border border-border/70 px-2 py-1 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={item.checked}
                onChange={(e) =>
                  setItems((prev) =>
                    prev.map((it, idx) =>
                      idx === i ? { ...it, checked: e.target.checked } : it,
                    ),
                  )
                }
                className="mt-0.5 w-3.5 h-3.5 rounded accent-primary shrink-0"
              />
              <span
                className={`text-[11px] leading-snug ${
                  item.checked ? "text-text" : "text-text-muted line-through"
                }`}
              >
                {item.text}
              </span>
            </label>
          ))}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                onAdd(selected.map((i) => i.text));
                setItems([]);
                setSource(null);
              }}
              disabled={selected.length === 0}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary text-white text-[11px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-40"
            >
              <Plus size={11} />
              Seçilenleri ekle ({selected.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setItems([]);
                setSource(null);
              }}
              className="flex items-center gap-1 text-[10px] text-text-muted hover:text-text"
            >
              <X size={10} /> Vazgeç
            </button>
            {source === "fallback" && (
              <span className="text-[9px] text-text-muted/70 ml-auto">
                AI yok: açıklama satırlarından bölündü
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
