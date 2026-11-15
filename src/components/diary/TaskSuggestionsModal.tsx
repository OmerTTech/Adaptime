import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PRIORITY_LABEL, type TaskSuggestion } from "@/types";
import { CheckCircle2, Sparkles } from "lucide-react";

interface TaskSuggestionsModalProps {
  suggestions: TaskSuggestion[];
  onClose: () => void;
  onAdd: (selected: TaskSuggestion[]) => void;
}

export default function TaskSuggestionsModal({
  suggestions,
  onClose,
  onAdd,
}: TaskSuggestionsModalProps) {
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(suggestions.map((_, i) => i)),
  );

  const toggle = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const chosen = suggestions.filter((_, i) => selected.has(i));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-surface border-border sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-text flex items-center gap-2">
            <Sparkles size={18} className="text-warning" />
            Günlükten çıkan görevler
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-text-muted">
          Önerileri gözden geçir; istemediklerinin seçimini kaldır. Seçilenler
          yapılacaklar listesine eklenir.
        </p>

        <div className="space-y-2">
          {suggestions.map((s, i) => {
            const isSelected = selected.has(i);
            return (
              <button
                key={`${s.title}-${i}`}
                onClick={() => toggle(i)}
                className={`w-full text-left p-3 rounded-xl border transition-all ${
                  isSelected
                    ? "border-primary/50 bg-primary/5"
                    : "border-border bg-background opacity-70"
                }`}
              >
                <div className="flex items-start gap-2">
                  <div
                    className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                      isSelected ? "border-primary bg-primary" : "border-border"
                    }`}
                  >
                    {isSelected && <CheckCircle2 size={12} className="text-white" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text">{s.title}</p>
                    {s.reason && (
                      <p className="text-[11px] text-text-muted mt-0.5">
                        {s.reason}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-[10px] text-text-muted">
                      <span className="px-1.5 py-0.5 rounded border border-border">
                        {PRIORITY_LABEL[s.priority]}
                      </span>
                      <span>~{s.estimatedMinutes} dk</span>
                      <span className="capitalize">{s.category}</span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="outline" onClick={onClose} className="flex-1 border-border text-text">
            Vazgeç
          </Button>
          <Button
            onClick={() => onAdd(chosen)}
            disabled={chosen.length === 0}
            className="flex-1 bg-primary hover:bg-primary-hover text-white"
          >
            Seçilenleri ekle ({chosen.length})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
