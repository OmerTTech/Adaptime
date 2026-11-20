import { useRef, useState } from "react";
import { useAppDispatch } from "@/store/hooks";
import { addTask } from "@/store/slices/routineSlice";
import { Lightbulb, Plus } from "lucide-react";

/**
 * 2.2 — Hızlı yakalama: her ekranda tek satır. Görev saatsiz "Yapılacaklar"
 * listesine düşer; gün sonunda karar verilir. Plan kurmayı beklemez.
 */
export default function QuickCapture() {
  const dispatch = useAppDispatch();
  const [value, setValue] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = () => {
    const title = value.trim();
    if (!title) return;
    dispatch(addTask({ title, estimatedMinutes: 15 }));
    setValue("");
    setFlash(`Eklendi: ${title}`);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 2500);
    inputRef.current?.focus();
  };

  return (
    <div className="rounded-xl border border-border bg-surface px-2.5 py-2">
      <div className="flex items-center gap-2">
        <Lightbulb size={14} className="text-warning shrink-0" />
        <input
          ref={inputRef}
          data-quick-capture
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            }
            if (e.key === "Escape") {
              setValue("");
              e.currentTarget.blur();
            }
          }}
          placeholder="Aklıma geldi… yaz, Enter'a bas (kısayol: N)"
          aria-label="Hızlı görev yakalama"
          className="flex-1 min-w-0 bg-transparent text-xs text-text placeholder:text-text-muted focus:outline-none"
        />
        <button
          type="button"
          onClick={save}
          disabled={!value.trim()}
          className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/10 border border-primary/30 text-primary text-[11px] font-medium hover:bg-primary/20 transition-colors disabled:opacity-40"
        >
          <Plus size={11} />
          Ekle
        </button>
      </div>
      {flash && (
        <p className="text-[10px] text-success mt-1 pl-6 truncate">{flash}</p>
      )}
    </div>
  );
}
