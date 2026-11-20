import { useEffect, useMemo, useState } from "react";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { openEditModal } from "@/store/slices/uiSlice";
import { PRIORITY_LABEL, isScheduled } from "@/types";
import { CheckCircle2, Search, X } from "lucide-react";

/** Ctrl+K: başlık, açıklama ve alt görevlerde arama. */
export default function SearchModal({ onClose }: { onClose: () => void }) {
  const dispatch = useAppDispatch();
  const tasks = useAppSelector((s) => s.routine.currentRoutine?.tasks ?? []);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const results = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    if (!q) return [];
    return tasks
      .filter((t) => {
        const haystack = [
          t.title,
          t.description ?? "",
          t.firstAction ?? "",
          ...(t.subtasks ?? []).map((s) => s.title),
        ]
          .join(" ")
          .toLocaleLowerCase("tr");
        return haystack.includes(q);
      })
      .slice(0, 20);
  }, [tasks, query]);

  const open = (id: string) => {
    dispatch(openEditModal(id));
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-start justify-center pt-[12vh] px-3"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
          <Search size={15} className="text-text-muted shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Görev, açıklama veya adım ara…"
            aria-label="Görev ara"
            className="flex-1 bg-transparent text-sm text-text placeholder:text-text-muted focus:outline-none"
          />
          <button
            onClick={onClose}
            className="p-1 rounded-md text-text-muted hover:text-text"
            aria-label="Kapat"
          >
            <X size={14} />
          </button>
        </div>
        <div className="max-h-[55vh] overflow-y-auto p-1.5">
          {query.trim() === "" ? (
            <p className="text-[11px] text-text-muted px-2 py-3">
              Yazmaya başla. <span className="text-text">Ctrl+K</span> her yerden
              açar, <span className="text-text">Esc</span> kapatır.
            </p>
          ) : results.length === 0 ? (
            <p className="text-[11px] text-text-muted px-2 py-3">Eşleşen görev yok.</p>
          ) : (
            results.map((t) => (
              <button
                key={t.id}
                onClick={() => open(t.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-surface-hover transition-colors"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: t.color }}
                />
                <span
                  className={`text-xs flex-1 min-w-0 truncate ${
                    t.status === "completed" ? "text-text-muted line-through" : "text-text"
                  }`}
                >
                  {t.title}
                </span>
                {t.status === "completed" && (
                  <CheckCircle2 size={11} className="text-success shrink-0" />
                )}
                <span className="text-[10px] text-text-muted shrink-0">
                  {isScheduled(t) ? "planlı" : "yapılacak"} ·{" "}
                  {PRIORITY_LABEL[t.priority ?? "medium"]}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
