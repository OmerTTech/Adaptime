import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  deleteDiaryEntry,
  loadDiaryEntries,
  loadDiaryEntry,
  reflectDiary,
  saveDiaryEntry,
  suggestDiaryTasks,
  clearSuggestions,
  clearReflection,
} from "@/store/slices/diarySlice";
import { addTask } from "@/store/slices/routineSlice";
import { playSound } from "@/services/sound";
import { formatRelative, getRandomColor, getTodayString } from "@/utils";
import TaskSuggestionsModal from "@/components/diary/TaskSuggestionsModal";
import type { DiaryEntry, TaskSuggestion } from "@/types";
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Save,
  Sparkles,
  Trash2,
  Bot,
  Smile,
} from "lucide-react";

const MOOD_LABELS = ["Çok kötü", "Kötü", "Orta", "İyi", "Harika"];

function emptyEntry(date: string): DiaryEntry {
  return {
    dateKey: date,
    mood: 3,
    energy: 3,
    highlights: "",
    progress: "",
    learnings: "",
    blockers: "",
    nextSteps: "",
    tags: [],
  };
}

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function formatDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function DiaryPage() {
  const { token } = useAuth();
  const dispatch = useAppDispatch();
  const entries = useAppSelector((s) => s.diary.entries);
  const current = useAppSelector((s) => s.diary.current);
  const loading = useAppSelector((s) => s.diary.loading);
  const saving = useAppSelector((s) => s.diary.saving);
  const suggestLoading = useAppSelector((s) => s.diary.suggestLoading);
  const suggestions = useAppSelector((s) => s.diary.suggestions);
  const suggestionsSource = useAppSelector((s) => s.diary.suggestionsSource);
  const reflection = useAppSelector((s) => s.diary.reflection);
  const reflectionSource = useAppSelector((s) => s.diary.reflectionSource);
  const reflecting = useAppSelector((s) => s.diary.reflecting);
  const deleting = useAppSelector((s) => s.diary.deleting);
  const error = useAppSelector((s) => s.diary.error);

  const today = getTodayString();
  const [date, setDate] = useState(today);
  const [form, setForm] = useState<DiaryEntry>(() => emptyEntry(today));
  const [tagsInput, setTagsInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (token) dispatch(loadDiaryEntries(token));
  }, [token, dispatch]);

  useEffect(() => {
    if (token) dispatch(loadDiaryEntry({ token, date }));
  }, [token, date, dispatch]);

  useEffect(() => {
    if (current && current.dateKey === date) {
      setForm(current);
      setTagsInput((current.tags ?? []).join(", "));
    } else if (!loading) {
      setForm(emptyEntry(date));
      setTagsInput("");
    }
  }, [current, date, loading]);

  const hasContent = useMemo(
    () =>
      Boolean(
        form.highlights.trim() ||
          form.progress.trim() ||
          form.learnings.trim() ||
          form.blockers.trim() ||
          form.nextSteps.trim(),
      ),
    [form],
  );

  const setField = (field: keyof DiaryEntry, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const buildEntry = (): DiaryEntry => ({
    ...form,
    dateKey: date,
    tags: tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 10),
  });

  const handleSave = async (silent = false) => {
    if (!token) return;
    const saved = await dispatch(saveDiaryEntry({ token, entry: buildEntry() })).unwrap();
    if (!silent) {
      setSavedFlash(true);
      playSound("taskComplete");
      setTimeout(() => setSavedFlash(false), 1800);
    }
    dispatch(loadDiaryEntries(token));
    return saved;
  };

  const handleSuggest = async () => {
    if (!token) return;
    await handleSave(true);
    dispatch(clearSuggestions());
    try {
      await dispatch(suggestDiaryTasks({ token, date })).unwrap();
      setShowSuggestions(true);
    } catch {
      playSound("error");
    }
  };

  const handleReflect = async () => {
    if (!token) return;
    await handleSave(true);
    dispatch(clearReflection());
    try {
      await dispatch(reflectDiary({ token, date })).unwrap();
    } catch {
      playSound("error");
    }
  };

  const handleAddSuggestions = (selected: TaskSuggestion[]) => {
    selected.forEach((s) => {
      dispatch(
        addTask({
          title: s.title,
          priority: s.priority,
          category: s.category,
          estimatedMinutes: s.estimatedMinutes,
          color: getRandomColor(),
          description: s.reason,
        }),
      );
    });
    if (selected.length > 0) playSound("taskComplete");
    setShowSuggestions(false);
    dispatch(clearSuggestions());
  };

  const handleDelete = async () => {
    if (!token) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await dispatch(deleteDiaryEntry({ token, date }));
    setConfirmDelete(false);
    setForm(emptyEntry(date));
    setTagsInput("");
  };

  const fields: {
    key: keyof DiaryEntry;
    label: string;
    placeholder: string;
  }[] = [
    {
      key: "highlights",
      label: "Bugün neler oldu?",
      placeholder: "Yaşadıkların, dikkatini çekenler, önemli anlar...",
    },
    {
      key: "progress",
      label: "Neleri ilerlettim?",
      placeholder: "Tamamladığın işler, attığın adımlar, çözdüğün problemler...",
    },
    {
      key: "learnings",
      label: "Neler öğrendim?",
      placeholder: "Yeni bildiğin bir şey, fark ettiğin bir hata, çıkardığın ders...",
    },
    {
      key: "blockers",
      label: "Nerede takıldım?",
      placeholder: "Engeller, ertelemeler, eksik kalanlar...",
    },
    {
      key: "nextSteps",
      label: "Sonraki adımlar",
      placeholder: "Yarın yapacağın 1-3 somut adım (göreve dönüştürülebilir)",
    },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-text flex items-center gap-2">
            <BookOpen size={18} className="text-primary" />
            Günlük
          </h2>
          <p className="text-xs text-text-muted">
            Gününü, gelişimini ve sonraki adımlarını kaydet. Mentor mesajları bu
            notları da dikkate alır.
          </p>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setDate(shiftDate(date, -1))}
            className="p-1.5 rounded-lg bg-surface border border-border text-text-muted hover:text-text"
            title="Önceki gün"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => setDate(today)}
            className="px-2.5 py-1.5 rounded-lg bg-surface border border-border text-[11px] text-text-muted hover:text-text"
          >
            Bugün
          </button>
          <button
            onClick={() => setDate(shiftDate(date, 1))}
            disabled={date >= today}
            className="p-1.5 rounded-lg bg-surface border border-border text-text-muted hover:text-text disabled:opacity-40"
            title="Sonraki gün"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-text-muted">
        <CalendarDays size={13} />
        <span className="capitalize">{formatDate(date)}</span>
        {date === today && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
            bugün
          </span>
        )}
      </div>

      {error && (
        <div className="text-xs text-danger bg-danger/10 border border-danger/25 rounded-xl px-3 py-2">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-surface p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-text-muted mb-1.5">Ruh hali</p>
            <div className="flex gap-1">
              {MOOD_LABELS.map((label, i) => (
                <button
                  key={label}
                  onClick={() => setField("mood", i + 1)}
                  title={label}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] border transition-colors ${
                    form.mood === i + 1
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "bg-background border-border text-text-muted hover:text-text"
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1.5">Enerji</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setField("energy", n)}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] border transition-colors ${
                    form.energy === n
                      ? "bg-warning/15 border-warning/40 text-warning"
                      : "bg-background border-border text-text-muted hover:text-text"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        {fields.map((field) => (
          <div key={field.key}>
            <label className="text-xs font-medium text-text mb-1 block">
              {field.label}
            </label>
            <textarea
              value={String(form[field.key] ?? "")}
              onChange={(e) => setField(field.key, e.target.value)}
              placeholder={field.placeholder}
              rows={3}
              maxLength={4000}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-text text-sm resize-vertical focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        ))}

        <div>
          <label className="text-xs text-text-muted mb-1 block">
            Etiketler <span className="opacity-60">(virgülle ayır)</span>
          </label>
          <input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="kodlama, sağlık, öğrenme"
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleSave()}
            disabled={!token || saving || (!hasContent && !current)}
            title={
              hasContent || current
                ? "Günlüğü kaydet"
                : "Kaydetmek için en az bir alanı doldur"
            }
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {savedFlash ? "Kaydedildi" : "Kaydet"}
          </button>

          <button
            onClick={handleSuggest}
            disabled={!token || suggestLoading || !hasContent}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-warning/10 border border-warning/30 text-warning text-xs font-medium hover:bg-warning/20 transition-colors disabled:opacity-50"
            title={hasContent ? "Günlükten görev çıkar" : "Önce günlüğü doldur"}
          >
            {suggestLoading ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Sparkles size={13} />
            )}
            Görev çıkar
          </button>

          <button
            onClick={handleReflect}
            disabled={!token || reflecting || !hasContent}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-xs font-medium hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            {reflecting ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Bot size={13} />
            )}
            Mentor yorumu
          </button>

          {(current || hasContent) && (
            <button
              onClick={handleDelete}
              disabled={!token || deleting}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                confirmDelete
                  ? "bg-danger text-white border-danger"
                  : "bg-danger/10 text-danger border-danger/30 hover:bg-danger/20"
              }`}
            >
              <Trash2 size={13} />
              {confirmDelete ? "Emin misin?" : "Sil"}
            </button>
          )}
        </div>

        {suggestionsSource === "fallback" && (
          <p className="text-[10px] text-text-muted">
            AI erişilemedi; öneriler günlüğündeki satırlardan yerel olarak çıkarıldı.
          </p>
        )}
      </div>

      {reflection && (
        <div className="rounded-2xl border border-success/25 bg-success/5 p-4">
          <p className="text-[10px] uppercase tracking-wide text-success mb-1">
            Mentor yorumu · {reflectionSource === "ai" ? "AI" : "kural"}
          </p>
          <p className="text-sm text-text leading-relaxed">{reflection}</p>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-surface p-4">
        <h3 className="text-sm font-semibold text-text flex items-center gap-1.5 mb-2">
          <Smile size={14} className="text-text-muted" />
          Geçmiş günler
        </h3>
        {entries.length === 0 ? (
          <p className="text-xs text-text-muted">Henüz günlük kaydı yok.</p>
        ) : (
          <div className="space-y-1">
            {entries.slice(0, 12).map((entry) => {
              const preview =
                entry.highlights || entry.progress || entry.nextSteps || "(boş)";
              return (
                <button
                  key={entry.dateKey}
                  onClick={() => setDate(entry.dateKey)}
                  className={`w-full text-left px-2.5 py-2 rounded-lg border transition-colors ${
                    entry.dateKey === date
                      ? "bg-primary/10 border-primary/30"
                      : "bg-background border-border hover:border-border/80"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-text">
                      {entry.dateKey}
                      {entry.dateKey === today && (
                        <span className="text-[10px] text-primary ml-1">bugün</span>
                      )}
                    </span>
                    <span className="text-[10px] text-text-muted">
                      {entry.mood}/5 · {entry.energy}/5 ·{" "}
                      {entry.updatedAt
                        ? formatRelative(new Date(entry.updatedAt).getTime())
                        : ""}
                    </span>
                  </div>
                  <p className="text-[11px] text-text-muted truncate mt-0.5">
                    {preview}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4">
        <h3 className="text-sm font-semibold text-text flex items-center gap-1.5 mb-1">
          <CheckCircle2 size={14} className="text-success" />
          İpucu
        </h3>
        <p className="text-xs text-text-muted">
          "Sonraki adımlar" alanına yazdığın satırlar, "Görev çıkar" ile bir tıkla
          yapılacaklar listene dönüşür. Mentor, günlüğündeki son notu okuyarak
          saatlik kontrol mesajlarını kişiselleştirir.
        </p>
      </div>

      {showSuggestions && suggestions && suggestions.length > 0 && (
        <TaskSuggestionsModal
          suggestions={suggestions}
          onClose={() => setShowSuggestions(false)}
          onAdd={handleAddSuggestions}
        />
      )}
    </div>
  );
}
