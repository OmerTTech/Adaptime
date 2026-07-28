import { useState } from "react";
import { useAppDispatch } from "@/store/hooks";
import { addTask } from "@/store/slices/routineSlice";
import { closeAddModal } from "@/store/slices/uiSlice";
import { getTodayString, timeToTimestamp } from "@/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, CheckCircle, AlertCircle } from "lucide-react";

interface GeneratedTask {
  title: string;
  startHHMM: string;
  endHHMM: string;
}

const EXAMPLE_PROMPTS = [
  "Akşam 5'ten sonra 2 saat kod yazıp, 1 saat spor yapıp, gece anime izleyeceğim",
  "Sabah 9'da derslerim var, 12'ye kadar çalışıp öğleden sonra kitap okuyacağım",
  "14:00-16:00 arası İngilizce, 16:30-18:30 arası kodlama, akşam dinlenme",
];

export default function AIAddTaskModal() {
  const dispatch = useAppDispatch();
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [generatedTasks, setGeneratedTasks] = useState<GeneratedTask[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(new Set());
  const today = getTodayString();

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsLoading(true);
    setError(null);
    setGeneratedTasks([]);
    setSelectedTasks(new Set());

    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
      const res = await fetch(`${API_URL}/api/generate-routine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (!res.ok) throw new Error("API hatası");

      const data = await res.json();
      if (data.tasks && Array.isArray(data.tasks)) {
        setGeneratedTasks(data.tasks);
        setSelectedTasks(new Set(data.tasks.map((_: unknown, i: number) => i)));
      } else {
        throw new Error("Geçersiz yanıt");
      }
    } catch {
      setError("Rutin oluşturulamadı. Lütfen tekrar deneyin.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleTask = (index: number) => {
    setSelectedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleApply = () => {
    const colors = [
      "#FF6B6B",
      "#4ECDC4",
      "#45B7D1",
      "#96CEB4",
      "#FFEAA7",
      "#DDA0DD",
      "#98D8C8",
      "#F7DC6F",
    ];

    generatedTasks.forEach((task, i) => {
      if (!selectedTasks.has(i)) return;
      if (
        task.title.toLowerCase() === "mola" ||
        task.title.toLowerCase() === "dinlenme"
      )
        return;

      const start = timeToTimestamp(task.startHHMM, today);
      const end = timeToTimestamp(task.endHHMM, today);
      if (end <= start) return;

      dispatch(
        addTask({
          title: task.title,
          startTime: start,
          endTime: end,
          color: colors[i % colors.length],
        }),
      );
    });

    setPrompt("");
    setGeneratedTasks([]);
    dispatch(closeAddModal());
  };

  return (
    <Dialog open onOpenChange={() => dispatch(closeAddModal())}>
      <DialogContent className="bg-surface border-border sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-text flex items-center gap-2">
            <Sparkles size={18} className="text-warning" />
            AI ile Rutin Oluştur
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-text-muted mb-1 block">
              Günlük planınızı doğal dille yazın
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Örn: Akşam 5'ten sonra 2 saat kod yazıp, 1 saat spor yapıp, gece anime izleyeceğim"
              className="w-full h-24 px-3 py-2 rounded-xl bg-background border border-border text-text text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {EXAMPLE_PROMPTS.map((example, i) => (
              <button
                key={i}
                onClick={() => setPrompt(example)}
                className="text-[10px] px-2 py-1 rounded-full bg-surface-hover border border-border text-text-muted hover:text-text transition-colors"
              >
                {example.slice(0, 40)}...
              </button>
            ))}
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!prompt.trim() || isLoading}
            className="w-full bg-primary hover:bg-primary-hover text-white"
          >
            {isLoading ? (
              <>
                <Loader2 size={16} className="animate-spin mr-2" />
                Oluşturuluyor...
              </>
            ) : (
              <>
                <Sparkles size={16} className="mr-2" />
                Rutin Oluştur
              </>
            )}
          </Button>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {generatedTasks.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-text-muted font-medium">
                  Oluşturulan görevler ({selectedTasks.size}/
                  {generatedTasks.length} seçili)
                </p>
                <button
                  onClick={() =>
                    setSelectedTasks(
                      selectedTasks.size === generatedTasks.length
                        ? new Set()
                        : new Set(generatedTasks.map((_, i) => i)),
                    )
                  }
                  className="text-xs text-primary hover:text-primary-hover"
                >
                  {selectedTasks.size === generatedTasks.length
                    ? "Hiçbiri"
                    : "Tümünü Seç"}
                </button>
              </div>

              <div className="space-y-2">
                {generatedTasks.map((task, i) => {
                  const isSelected = selectedTasks.has(i);
                  const isBreak =
                    task.title.toLowerCase() === "mola" ||
                    task.title.toLowerCase() === "dinlenme";

                  return (
                    <button
                      key={i}
                      onClick={() => handleToggleTask(i)}
                      className={`w-full text-left p-3 rounded-xl border transition-all ${
                        isSelected
                          ? "border-primary/50 bg-primary/5"
                          : "border-border bg-background"
                      } ${isBreak ? "opacity-50" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                              isSelected
                                ? "border-primary bg-primary"
                                : "border-border"
                            }`}
                          >
                            {isSelected && (
                              <CheckCircle size={12} className="text-white" />
                            )}
                          </div>
                          <span
                            className={`text-sm font-medium ${
                              isSelected ? "text-text" : "text-text-muted"
                            }`}
                          >
                            {task.title}
                          </span>
                        </div>
                        <span className="text-xs text-text-muted tabular-nums">
                          {task.startHHMM} - {task.endHHMM}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setGeneratedTasks([]);
                    setSelectedTasks(new Set());
                  }}
                  className="flex-1 border-border text-text"
                >
                  Sıfırla
                </Button>
                <Button
                  onClick={handleApply}
                  disabled={selectedTasks.size === 0}
                  className="flex-1 bg-success hover:bg-success/90 text-white"
                >
                  <CheckCircle size={16} className="mr-2" />
                  Seçilenleri Ekle ({selectedTasks.size})
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
