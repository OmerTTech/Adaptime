import { useEffect, useState } from "react";
import { useAppDispatch } from "@/store/hooks";
import { addTask } from "@/store/slices/routineSlice";
import { useAuth } from "@/contexts/AuthContext";
import {
  templateApi,
  type TemplateDTO,
  type TemplateTaskDTO,
} from "@/services/api";
import { getRandomColor } from "@/utils";
import { playSound } from "@/services/sound";
import type { TaskCategory, TaskPriority } from "@/types";
import {
  Check,
  Clock,
  LayoutTemplate,
  Plus,
  Trash2,
  X,
} from "lucide-react";

interface TemplateTask {
  title: string;
  estimatedMinutes: number;
  priority: TaskPriority;
  category: TaskCategory;
  firstAction?: string;
}

interface Template {
  id: string;
  name: string;
  description: string;
  tasks: TemplateTask[];
}

/** Kendi şablonunu yazarken tutulan taslak. */
interface DraftRow {
  title: string;
  minutes: string;
}

interface Draft {
  name: string;
  description: string;
  rows: DraftRow[];
}

const TEMPLATES: Template[] = [
  {
    id: "exam",
    name: "Sınav haftası",
    description: "Tekrar + deneme + analiz döngüsü",
    tasks: [
      {
        title: "Konu tekrarı (en zayıf konu)",
        estimatedMinutes: 60,
        priority: "high",
        category: "study",
        firstAction: "Konu başlığını aç, 1 sayfa özet çıkar",
      },
      {
        title: "Deneme çöz",
        estimatedMinutes: 90,
        priority: "critical",
        category: "study",
        firstAction: "Telefonu uzağa koy, süreyi başlat",
      },
      {
        title: "Yanlış analizi",
        estimatedMinutes: 30,
        priority: "high",
        category: "study",
        firstAction: "Yanlışları türlere ayır",
      },
      {
        title: "Erken uyu",
        estimatedMinutes: 30,
        priority: "medium",
        category: "health",
        firstAction: "Ekranı kapat",
      },
    ],
  },
  {
    id: "busy-work",
    name: "Yoğun iş günü",
    description: "En önemli iş önce, kalanı sırayla",
    tasks: [
      {
        title: "Günün tek kritik işi",
        estimatedMinutes: 90,
        priority: "critical",
        category: "work",
        firstAction: "Dosyayı aç, ilk paragrafı yaz",
      },
      {
        title: "E-postaları topla ve yanıtla",
        estimatedMinutes: 30,
        priority: "medium",
        category: "work",
        firstAction: "Gelen kutusunu aç, 5 dakika ayıkla",
      },
      {
        title: "Gün sonu kısa özet",
        estimatedMinutes: 15,
        priority: "low",
        category: "work",
        firstAction: "3 madde yaz",
      },
    ],
  },
  {
    id: "sport",
    name: "Spor programı",
    description: "Isınma + ana antrenman + esneme",
    tasks: [
      {
        title: "Isınma",
        estimatedMinutes: 10,
        priority: "medium",
        category: "health",
        firstAction: "Spor kıyafetini giy",
      },
      {
        title: "Ana antrenman",
        estimatedMinutes: 45,
        priority: "high",
        category: "health",
        firstAction: "İlk seti başlat",
      },
      {
        title: "Esneme ve su",
        estimatedMinutes: 10,
        priority: "low",
        category: "health",
        firstAction: "Matı aç",
      },
    ],
  },
  {
    id: "cleaning",
    name: "Temizlik günü",
    description: "Oda oda, 25 dakikalık bloklar",
    tasks: [
      {
        title: "Mutfak",
        estimatedMinutes: 25,
        priority: "medium",
        category: "personal",
        firstAction: "Tezgâhı boşalt",
      },
      {
        title: "Banyo",
        estimatedMinutes: 25,
        priority: "medium",
        category: "personal",
        firstAction: "Temizlik malzemelerini al",
      },
      {
        title: "Oda topla",
        estimatedMinutes: 25,
        priority: "low",
        category: "personal",
        firstAction: "Yerdeki eşyaları kaldır",
      },
      {
        title: "Çamaşır",
        estimatedMinutes: 15,
        priority: "low",
        category: "personal",
        firstAction: "Makineyi doldur",
      },
    ],
  },
  {
    id: "rest",
    name: "Tatil / dinlenme",
    description: "Hafif gün: yürüyüş, kitap, erken uyku",
    tasks: [
      {
        title: "20 dakika yürüyüş",
        estimatedMinutes: 20,
        priority: "low",
        category: "health",
        firstAction: "Ayakkabıyı giy, kapıdan çık",
      },
      {
        title: "Kitap oku",
        estimatedMinutes: 30,
        priority: "low",
        category: "personal",
        firstAction: "Kitabı aç, 2 sayfa",
      },
      {
        title: "Ekransız 1 saat",
        estimatedMinutes: 60,
        priority: "medium",
        category: "health",
        firstAction: "Telefonu başka odaya bırak",
      },
    ],
  },
];

const emptyRow = (): DraftRow => ({ title: "", minutes: "30" });

export default function TemplatePickerModal({ onClose }: { onClose: () => void }) {
  const dispatch = useAppDispatch();
  const { token } = useAuth();
  const [applied, setApplied] = useState<string | null>(null);

  // Kullanıcının kendi şablonları (sunucuda saklanır).
  const [userTemplates, setUserTemplates] = useState<TemplateDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    templateApi
      .list(token)
      .then((res) => {
        if (!cancelled) setUserTemplates(res.templates ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Şablonlar yüklenemedi");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const applyTemplate = (template: Template) => {
    template.tasks.forEach((task) => {
      dispatch(
        addTask({
          title: task.title,
          estimatedMinutes: task.estimatedMinutes,
          priority: task.priority,
          category: task.category,
          color: getRandomColor(),
          firstAction: task.firstAction,
        }),
      );
    });
    playSound("taskComplete");
    setApplied(template.id);
    window.setTimeout(onClose, 700);
  };

  const applyCustomTemplate = (template: TemplateDTO) => {
    template.tasks.forEach((task) => {
      dispatch(
        addTask({
          title: task.title,
          estimatedMinutes: task.estimatedMinutes,
          priority: task.priority,
          category: task.category,
          color: getRandomColor(),
          firstAction: task.firstAction,
        }),
      );
    });
    playSound("taskComplete");
    setApplied(template.id);
    window.setTimeout(onClose, 700);
  };

  const updateRow = (index: number, patch: Partial<DraftRow>) => {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            rows: prev.rows.map((row, i) =>
              i === index ? { ...row, ...patch } : row,
            ),
          }
        : prev,
    );
  };

  const saveDraft = async () => {
    if (!token || !draft || saving) return;
    const tasks: TemplateTaskDTO[] = draft.rows
      .filter((row) => row.title.trim())
      .map((row) => ({
        title: row.title.trim(),
        estimatedMinutes: Math.max(1, Math.round(Number(row.minutes) || 30)),
        priority: "medium",
        category: "work",
      }));
    if (!draft.name.trim() || tasks.length === 0) {
      setError("Şablon adı ve en az bir görev gerekli");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await templateApi.create(
        {
          name: draft.name.trim(),
          description: draft.description.trim() || undefined,
          tasks,
        },
        token,
      );
      setUserTemplates((prev) => [res.template, ...prev]);
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Şablon kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  const removeTemplate = async (id: string) => {
    if (!token || deletingId) return;
    setDeletingId(id);
    setError(null);
    try {
      await templateApi.remove(id, token);
      setUserTemplates((prev) => prev.filter((t) => t.id !== id));
      setConfirmId(null);
    } catch {
      setError("Şablon silinemedi");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-border bg-surface p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-text flex items-center gap-1.5">
              <LayoutTemplate size={15} className="text-primary" />
              Şablonlar
            </h3>
            <p className="text-[11px] text-text-muted mt-0.5">
              Görevler saatsiz eklenir; saatlerini sonra planlayabilirsin.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover"
          >
            <X size={16} />
          </button>
        </div>

        {error && (
          <p className="mb-2 text-[11px] text-danger leading-snug">{error}</p>
        )}

        {/* Şablonlarım */}
        <div className="mb-4">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <h4 className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">
              Şablonlarım
            </h4>
            {token && !draft && (
              <button
                onClick={() => {
                  setError(null);
                  setDraft({
                    name: "",
                    description: "",
                    rows: [emptyRow()],
                  });
                }}
                className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              >
                <Plus size={12} />
                Yeni şablon
              </button>
            )}
          </div>

          {!token ? (
            <p className="text-[11px] text-text-muted">
              Kendi şablonlarını oluşturmak için giriş yapmalısın.
            </p>
          ) : loading ? (
            <p className="text-[11px] text-text-muted">Yükleniyor…</p>
          ) : (
            <div className="space-y-2">
              {userTemplates.length === 0 && !draft && (
                <p className="text-[11px] text-text-muted">
                  Henüz kendi şablonun yok. “Yeni şablon” ile sık yaptığın bir
                  günü şablon olarak kaydet.
                </p>
              )}

              {userTemplates.map((template) => (
                <div
                  key={template.id}
                  className="rounded-xl border border-border bg-background p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-text">
                        {template.name}
                      </p>
                      <p className="text-[11px] text-text-muted">
                        {template.description ||
                          `${template.tasks.length} görev`}
                      </p>
                    </div>
                    <div className="shrink-0 flex items-center gap-1.5">
                      <button
                        onClick={() => applyCustomTemplate(template)}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                          applied === template.id
                            ? "bg-success text-white"
                            : "bg-primary text-white hover:bg-primary/90"
                        }`}
                      >
                        {applied === template.id ? (
                          <span className="flex items-center gap-1">
                            <Check size={12} /> Eklendi
                          </span>
                        ) : (
                          "Uygula"
                        )}
                      </button>
                      {confirmId === template.id ? (
                        <button
                          onClick={() => removeTemplate(template.id)}
                          disabled={deletingId === template.id}
                          className="px-2 py-1.5 rounded-lg text-[11px] font-medium bg-danger text-white disabled:opacity-50"
                          title="Silmeyi onayla"
                        >
                          {deletingId === template.id ? "…" : "Sil?"}
                        </button>
                      ) : (
                        <button
                          onClick={() => setConfirmId(template.id)}
                          aria-label={`${template.name} şablonunu sil`}
                          className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-surface-hover"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {template.tasks.map((task, i) => (
                      <li
                        key={`${task.title}-${i}`}
                        className="flex items-center gap-1.5 text-[11px] text-text-muted"
                      >
                        <Clock size={10} className="shrink-0" />
                        <span className="truncate">{task.title}</span>
                        <span className="ml-auto shrink-0">
                          {task.estimatedMinutes} dk
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {draft && (
                <div className="rounded-xl border border-primary/40 bg-background p-3 space-y-2">
                  <p className="text-xs font-semibold text-text">Yeni şablon</p>
                  <input
                    value={draft.name}
                    onChange={(e) =>
                      setDraft((prev) =>
                        prev ? { ...prev, name: e.target.value } : prev,
                      )
                    }
                    placeholder="Şablon adı (örn. Sabah rutini)"
                    maxLength={80}
                    className="w-full px-2.5 py-2 rounded-lg bg-surface border border-border text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <input
                    value={draft.description}
                    onChange={(e) =>
                      setDraft((prev) =>
                        prev ? { ...prev, description: e.target.value } : prev,
                      )
                    }
                    placeholder="Kısa açıklama — opsiyonel"
                    maxLength={200}
                    className="w-full px-2.5 py-2 rounded-lg bg-surface border border-border text-xs text-text focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />

                  <div className="space-y-1.5">
                    {draft.rows.map((row, index) => (
                      <div key={index} className="flex items-center gap-1.5">
                        <input
                          value={row.title}
                          onChange={(e) =>
                            updateRow(index, { title: e.target.value })
                          }
                          placeholder={`Görev ${index + 1}`}
                          maxLength={160}
                          className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-surface border border-border text-xs text-text focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                        <input
                          type="number"
                          min={1}
                          max={600}
                          value={row.minutes}
                          onChange={(e) =>
                            updateRow(index, { minutes: e.target.value })
                          }
                          className="w-16 shrink-0 px-2 py-1.5 rounded-lg bg-surface border border-border text-xs text-text tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40"
                          aria-label="Tahmini dakika"
                        />
                        <button
                          onClick={() =>
                            setDraft((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    rows: prev.rows.filter(
                                      (_, i) => i !== index,
                                    ),
                                  }
                                : prev,
                            )
                          }
                          disabled={draft.rows.length === 1}
                          aria-label="Görevi kaldır"
                          className="p-1 rounded text-text-muted hover:text-danger disabled:opacity-30"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      onClick={() =>
                        setDraft((prev) =>
                          prev
                            ? { ...prev, rows: [...prev.rows, emptyRow()] }
                            : prev,
                        )
                      }
                      className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                    >
                      <Plus size={12} />
                      Görev ekle
                    </button>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          setDraft(null);
                          setError(null);
                        }}
                        className="px-3 py-1.5 rounded-lg text-[11px] text-text-muted hover:text-text"
                      >
                        Vazgeç
                      </button>
                      <button
                        onClick={saveDraft}
                        disabled={saving}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-primary text-white hover:bg-primary-hover disabled:opacity-50"
                      >
                        {saving ? "Kaydediliyor…" : "Kaydet"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Hazır şablonlar */}
        <h4 className="text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-1.5">
          Hazır şablonlar
        </h4>
        <div className="space-y-2">
          {TEMPLATES.map((template) => (
            <div
              key={template.id}
              className="rounded-xl border border-border bg-background p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-text">{template.name}</p>
                  <p className="text-[11px] text-text-muted">{template.description}</p>
                </div>
                <button
                  onClick={() => applyTemplate(template)}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                    applied === template.id
                      ? "bg-success text-white"
                      : "bg-primary text-white hover:bg-primary/90"
                  }`}
                >
                  {applied === template.id ? (
                    <span className="flex items-center gap-1">
                      <Check size={12} /> Eklendi
                    </span>
                  ) : (
                    "Uygula"
                  )}
                </button>
              </div>
              <ul className="mt-2 space-y-1">
                {template.tasks.map((task) => (
                  <li
                    key={task.title}
                    className="flex items-center gap-1.5 text-[11px] text-text-muted"
                  >
                    <Clock size={10} className="shrink-0" />
                    <span className="truncate">{task.title}</span>
                    <span className="ml-auto shrink-0">{task.estimatedMinutes} dk</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
