import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { loadTodayRoutine, resetRoutine } from "@/store/slices/routineSlice";
import { setProgressiveLists, setSeriousMode } from "@/store/slices/uiSlice";
import { saveMentorSettings } from "@/store/slices/mentorSlice";
import { useTheme, type Palette as PaletteName } from "@/contexts/ThemeContext";
import { LANGUAGES, useI18n } from "@/i18n";
import {
  API_URL,
  accountApi,
  backupApi,
  pushApi,
  routineApi,
} from "@/services/api";
import { readFocusPrefs, writeFocusPrefs } from "@/services/focusPrefs";
import {
  notificationPermission,
  requestNotificationPermission,
} from "@/services/notifications";
import {
  disablePush,
  enablePush,
  pushBlocker,
  pushSubscriptionState,
  pushSupported,
  sendTestPush,
} from "@/services/push";
import {
  SOUND_OPTIONS,
  playSoundId,
  resolveSound,
  type SoundEvent,
  type SoundId,
} from "@/services/sound";
import { useSoundPrefs } from "@/hooks/useSoundPrefs";
import {
  avatarKey,
  readAvatarFile,
  removeCustomAvatar,
  setCustomAvatar,
} from "@/services/avatar";
import Avatar from "@/components/ui/Avatar";
import { getTodayString } from "@/utils";
import { computeGamification } from "@/engine/gamification";
import type { MentorSettings, MentorTone } from "@/types";
import {
  ArchiveRestore,
  Bell,
  BellOff,
  BrainCircuit,
  CalendarClock,
  CalendarDays,
  Copy,
  ListOrdered,
  Clock3,
  Database,
  Download,
  Languages,
  Link2,
  Loader2,
  LogOut,
  Palette,
  Play,
  Settings,
  Share,
  Trash2,
  Timer,
  Trophy,
  Upload,
  User,
  Volume2,
} from "lucide-react";

const SOUND_EVENTS: { event: SoundEvent; label: string }[] = [
  { event: "mentorCheck", label: "Mentor kontrolü" },
  { event: "taskComplete", label: "Görev tamamlandı" },
  { event: "focusStart", label: "Odak başladı" },
  { event: "focusEnd", label: "Odak bitti" },
  { event: "snooze", label: "Erteleme / dinlenme" },
  { event: "error", label: "Hata" },
];

function soundLabel(id: SoundId): string {
  return SOUND_OPTIONS.find((o) => o.id === id)?.label ?? id;
}

/** Seçili kontrol saatlerini "11:00–14:00, 18:00–21:00" gibi özetler. */
function summarizeHours(hours: number[]): string {
  if (hours.length === 0) return "saat seçilmedi";
  const sorted = [...hours].sort((a, b) => a - b);
  const fmt = (h: number) => `${String(h).padStart(2, "0")}:00`;
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const hour = sorted[i];
    if (hour === prev + 1) {
      prev = hour;
      continue;
    }
    parts.push(start === prev ? fmt(start) : `${fmt(start)}–${fmt(prev)}`);
    start = hour;
    prev = hour;
  }
  parts.push(start === prev ? fmt(start) : `${fmt(start)}–${fmt(prev)}`);
  return parts.join(", ");
}

const TIMEZONES = [
  "Asia/Baku",
  "Europe/Istanbul",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "Asia/Dubai",
  "UTC",
];

const SUMMARY_TOGGLES: {
  key: "morning" | "evening" | "weekly";
  label: string;
  hint: string;
}[] = [
  {
    key: "morning",
    label: "08:00 sabah brifingi",
    hint: "Günün ilk görevi ve saat",
  },
  {
    key: "evening",
    label: "21:30 gün sonu özeti",
    hint: "Tamamlanan / kalan görev",
  },
  {
    key: "weekly",
    label: "Pazar 20:00 haftalık özet",
    hint: "Son 7 günün toplamı",
  },
];

/** iPhone'da Safari sekmesi ana ekrana eklenmemişse rehber gösterilir. */
function needsIosInstallGuide(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  const ua = navigator.userAgent;
  const ios =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!ios) return false;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  return !standalone;
}

const TONES: { value: MentorTone; label: string; hint: string }[] = [
  { value: "direct", label: "Doğrudan", hint: "Net ve disiplinli" },
  { value: "balanced", label: "Dengeli", hint: "Net ama destekleyici" },
  { value: "supportive", label: "Destekleyici", hint: "Sıcak ve teşvik edici" },
];

export default function SettingsPage() {
  const { user, token, logout } = useAuth();
  const dispatch = useAppDispatch();
  const {
    theme,
    toggle,
    palette,
    setPalette,
    contrast,
    setContrast,
    colorblind,
    setColorblind,
  } = useTheme();
  const { lang, setLang, t } = useI18n();
  const settings = useAppSelector((s) => s.mentor.settings);
  const ai = useAppSelector((s) => s.mentor.ai);
  const saving = useAppSelector((s) => s.mentor.savingSettings);

  const [confirmReset, setConfirmReset] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [focusPrefs, setFocusPrefs] = useState(() => readFocusPrefs());
  const [calendarToken, setCalendarToken] = useState<string | null>(null);
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [calendarMessage, setCalendarMessage] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [webhookInput, setWebhookInput] = useState("");
  const [webhookBusy, setWebhookBusy] = useState(false);
  const [webhookMessage, setWebhookMessage] = useState<string | null>(null);
  const [confirmAccountDelete, setConfirmAccountDelete] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [permission, setPermission] = useState(notificationPermission());
  const [pushState, setPushState] = useState<
    "unsupported" | "denied" | "off" | "on"
  >("off");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);
  const [serverPush, setServerPush] = useState<{
    subscribed: number;
    lastSentAt?: number | null;
  } | null>(null);
  const { prefs: soundPrefs, update: updateSound } = useSoundPrefs();
  const routineState = useAppSelector((s) => s.routine);
  const progressiveLists = useAppSelector((s) => s.ui.progressiveLists);
  const seriousMode = useAppSelector((s) => s.ui.seriousMode);
  const diaryEntries = useAppSelector((s) => s.diary.entries);
  const game = useMemo(
    () =>
      computeGamification(
        routineState.history,
        routineState.currentRoutine,
        routineState.currentRoutine?.streak ?? 0,
        getTodayString(),
      ),
    [routineState.history, routineState.currentRoutine],
  );
  const [avatarMessage, setAvatarMessage] = useState<string | null>(null);
  const [soundMessage, setSoundMessage] = useState<string | null>(null);
  const [iosGuide, setIosGuide] = useState(false);
  // Özet anahtarları: sunucu ayarı yoksa üçü de açık kabul edilir.
  const summaryState = {
    morning: settings?.summaries?.morning !== false,
    evening: settings?.summaries?.evening !== false,
    weekly: settings?.summaries?.weekly !== false,
  };

  useEffect(() => {
    setPermission(notificationPermission());
    void pushSubscriptionState().then(setPushState);
    setIosGuide(needsIosInstallGuide());
  }, []);

  // Sunucudaki kayıtlı cihaz sayısı ve son başarılı gönderim zamanı.
  useEffect(() => {
    if (!token) return;
    pushApi
      .status(token)
      .then(setServerPush)
      .catch(() => {});
  }, [token]);

  const handleAvatarFile = async (file: File | undefined) => {
    if (!file || !user) return;
    try {
      const dataUrl = await readAvatarFile(file);
      setCustomAvatar(avatarKey(user), dataUrl);
      setAvatarMessage("Profil fotoğrafı güncellendi.");
    } catch (error) {
      setAvatarMessage(error instanceof Error ? error.message : "Yüklenemedi");
    }
  };

  const handleRemoveAvatar = () => {
    if (!user) return;
    removeCustomAvatar(avatarKey(user));
    setAvatarMessage("Özel fotoğraf kaldırıldı.");
  };

  const handleSoundFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      setSoundMessage("Sadece ses dosyası seçebilirsin (mp3/wav/ogg).");
      return;
    }
    if (file.size > 1_500_000) {
      setSoundMessage("Ses dosyası çok büyük (max 1.5 MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        updateSound({
          customDataUrl: reader.result,
          customName: file.name,
          master: "custom",
        });
        setSoundMessage(`Yüklendi: ${file.name}`);
      }
    };
    reader.onerror = () => setSoundMessage("Ses dosyası okunamadı.");
    reader.readAsDataURL(file);
  };

  // Sunucunun günlük otomatik yedekleri (son 7 gün).
  const [backups, setBackups] = useState<
    Array<{
      id: string;
      dateKey: string;
      createdAt: string;
      days: number;
      tasks: number;
    }>
  >([]);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    backupApi
      .list(token)
      .then((res) => {
        if (!cancelled) setBackups(res.items);
      })
      .catch(() => {
        /* çevrimdışı: liste boş kalır */
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    accountApi
      .webhook(token)
      .then((res) => {
        if (cancelled) return;
        setWebhookUrl(res.url);
        setWebhookInput(res.url ?? "");
      })
      .catch(() => {
        /* çevrimdışı: sonra tekrar denenir */
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const saveWebhook = async () => {
    if (!token || !webhookInput.trim()) return;
    setWebhookBusy(true);
    setWebhookMessage(null);
    try {
      const res = await accountApi.saveWebhook(webhookInput.trim(), token);
      setWebhookUrl(res.url);
      setWebhookMessage("Webhook kaydedildi. Görev tamamlandığında olay gider.");
    } catch (err) {
      setWebhookMessage(
        err instanceof Error ? err.message : "Webhook kaydedilemedi.",
      );
    } finally {
      setWebhookBusy(false);
    }
  };

  const testWebhook = async () => {
    if (!token) return;
    setWebhookBusy(true);
    try {
      const res = await accountApi.testWebhook(token);
      setWebhookMessage(
        res.ok
          ? "Test olayı gönderildi; adres 2xx döndü."
          : "Adres yanıt vermedi (2xx beklenir).",
      );
    } catch {
      setWebhookMessage("Test gönderilemedi.");
    } finally {
      setWebhookBusy(false);
    }
  };

  const removeWebhook = async () => {
    if (!token) return;
    setWebhookBusy(true);
    try {
      await accountApi.deleteWebhook(token);
      setWebhookUrl(null);
      setWebhookInput("");
      setWebhookMessage("Webhook kaldırıldı.");
    } catch {
      setWebhookMessage("Webhook kaldırılamadı.");
    } finally {
      setWebhookBusy(false);
    }
  };

  const handleRestore = async (id: string) => {
    if (!token) return;
    setRestoringId(id);
    setMessage(null);
    try {
      const res = await backupApi.restore(id, token);
      dispatch(loadTodayRoutine(token));
      setMessage(`${res.restored} gün yedekten geri yüklendi.`);
    } catch {
      setMessage("Geri yükleme başarısız.");
    } finally {
      setRestoringId(null);
    }
  };

  const handleExport = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      user: user?.email,
      routine: routineState.currentRoutine,
      history: routineState.history,
      diary: diaryEntries,
      mentorSettings: settings,
      soundPrefs,
    };
    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `adaptime-${getTodayString()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage("Veriler indirildi.");
    } catch {
      setMessage("Dışa aktarma başarısız.");
    }
  };

  const loadShare = async (rotate = false) => {
    if (!token) return;
    setShareBusy(true);
    setShareMessage(null);
    try {
      const res = rotate
        ? await accountApi.rotateShareToken(token)
        : await accountApi.shareToken(token);
      setShareToken(res.token);
      setShareMessage(rotate ? "Yeni bağlantı üretildi; eskisi geçersiz." : null);
    } catch {
      setShareMessage("Paylaşım bağlantısı oluşturulamadı.");
    } finally {
      setShareBusy(false);
    }
  };

  const copyShare = async () => {
    if (!shareToken) return;
    const url = `${window.location.origin}/?p=${shareToken}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareMessage("Bağlantı kopyalandı.");
    } catch {
      setShareMessage(url);
    }
  };

  const disableShare = async () => {
    if (!token) return;
    setShareBusy(true);
    try {
      await accountApi.disableShare(token);
      setShareToken(null);
      setShareMessage("Paylaşım kapatıldı.");
    } catch {
      setShareMessage("Paylaşım kapatılamadı.");
    } finally {
      setShareBusy(false);
    }
  };

  const hoursSummary = settings
    ? summarizeHours(settings.hours ?? [])
    : "yükleniyor…";

  const patch = (p: Partial<MentorSettings>) => {
    if (!token) return;
    dispatch(saveMentorSettings({ token, patch: p }));
  };

  const toggleHour = (hour: number) => {
    if (!settings) return;
    const hours = settings.hours.includes(hour)
      ? settings.hours.filter((h) => h !== hour)
      : [...settings.hours, hour].sort((a, b) => a - b);
    patch({ hours });
  };

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

  const handlePermission = async () => {
    const result = await requestNotificationPermission();
    setPermission(result);
  };

  const togglePush = async () => {
    if (!token) return;
    setPushBusy(true);
    setPushMessage(null);
    try {
      if (pushState === "on") {
        await disablePush(token);
        setPushState("off");
        setPushMessage("Arka plan bildirimleri kapatıldı.");
      } else {
        const res = await enablePush(token);
        setPushState(res.ok ? "on" : pushSupported() ? "off" : "unsupported");
        setPushMessage(res.message ?? "Arka plan bildirimleri açıldı.");
      }
    } finally {
      setPushBusy(false);
    }
  };

  const handleTestPush = async () => {
    if (!token) return;
    setPushBusy(true);
    try {
      const res = await sendTestPush(token);
      setPushMessage(res.message ?? (res.ok ? "Gönderildi." : "Gönderilemedi."));
      if (res.ok) pushApi.status(token).then(setServerPush).catch(() => {});
    } finally {
      setPushBusy(false);
    }
  };

  const calendarUrl = calendarToken
    ? `${API_URL}/api/calendar/${calendarToken}.ics`
    : null;

  const loadCalendar = async (rotate = false) => {
    if (!token) return;
    setCalendarBusy(true);
    setCalendarMessage(null);
    try {
      const res = rotate
        ? await accountApi.rotateCalendarToken(token)
        : await accountApi.calendarToken(token);
      setCalendarToken(res.token);
      if (rotate) setCalendarMessage("Yeni link oluşturuldu; eski link geçersiz.");
    } catch {
      setCalendarMessage("Takvim linki oluşturulamadı.");
    } finally {
      setCalendarBusy(false);
    }
  };

  const copyCalendar = async () => {
    if (!calendarUrl) return;
    try {
      await navigator.clipboard.writeText(calendarUrl);
      setCalendarMessage("Link kopyalandı.");
    } catch {
      setCalendarMessage("Kopyalanamadı; linki elle seç.");
    }
  };

  const handleDeleteAccount = async () => {
    if (!token) return;
    if (!confirmAccountDelete) {
      setConfirmAccountDelete(true);
      return;
    }
    setDeletingAccount(true);
    try {
      await accountApi.deleteAccount(token);
      dispatch(resetRoutine());
      logout();
    } catch {
      setMessage("Hesap silinemedi. Tekrar dene.");
      setConfirmAccountDelete(false);
    } finally {
      setDeletingAccount(false);
    }
  };

  const timezones =
    settings && !TIMEZONES.includes(settings.timezone)
      ? [settings.timezone, ...TIMEZONES]
      : TIMEZONES;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h2 className="text-lg font-bold text-text flex items-center gap-2">
          <Settings size={18} className="text-primary" />
          Ayarlar
        </h2>
        <p className="text-xs text-text-muted">
          Hesap, mentor, bildirim ve görünüm ayarların.
        </p>
      </div>

      <div className="p-4 rounded-xl bg-surface border border-border">
        <div className="flex items-center gap-2 text-sm font-medium text-text mb-3">
          <User size={16} className="text-primary" />
          Hesap
        </div>
        <div className="flex items-center gap-3">
          <Avatar user={user} size={48} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text">{user?.name}</p>
            <p className="text-xs text-text-muted truncate">{user?.email}</p>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <label className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-background border border-border text-text cursor-pointer hover:border-primary/40 transition-colors">
                <Upload size={11} />
                Fotoğraf yükle
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleAvatarFile(e.target.files?.[0])}
                />
              </label>
              <button
                onClick={handleRemoveAvatar}
                className="text-[11px] text-danger hover:underline"
              >
                Kaldır
              </button>
            </div>
            {avatarMessage && (
              <p className="text-[10px] text-text-muted mt-1">{avatarMessage}</p>
            )}
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex items-center gap-2">
            <Trophy size={14} className="text-warning" />
            <span className="text-xs font-medium text-text">İlerleme</span>
            <span className="ml-auto text-[11px] text-text-muted">
              Seviye {game.level.index} · {game.level.name}
            </span>
          </div>
          <div className="mt-1.5 flex items-baseline justify-between text-[10px] text-text-muted">
            <span className="tabular-nums">{game.xp} puan (son 30 gün)</span>
            <span>
              {game.level.next
                ? `${game.level.next - game.xp} puan → ${game.level.nextName}`
                : "En yüksek seviye"}
            </span>
          </div>
          <div className="mt-1 h-1.5 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-warning rounded-full transition-all"
              style={{ width: `${game.level.progress}%` }}
            />
          </div>
          <p className="text-[10px] text-text-muted mt-2">
            {game.badges.length}/8 rozet · {game.totalCompleted} görev
            tamamlandı
          </p>
          {game.badges.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {game.badges.map((badge) => (
                <span
                  key={badge.id}
                  title={`${badge.name}: ${badge.description}`}
                  className="text-[10px] px-1.5 py-0.5 rounded-md bg-background border border-border text-text-muted"
                >
                  {badge.icon} {badge.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mentor / hesap verebilirlik ayarları */}
      <div className="p-4 rounded-xl bg-surface border border-border space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-text">
            <BrainCircuit size={16} className="text-primary" />
            Saatlik hesap verebilirlik
            {saving && <Loader2 size={12} className="animate-spin text-text-muted" />}
          </div>
          <button
            onClick={() => patch({ enabled: !(settings?.enabled ?? true) })}
            disabled={!settings || !token}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${
              settings?.enabled ?? true
                ? "bg-success/10 border-success/30 text-success"
                : "bg-background border-border text-text-muted"
            }`}
          >
            {settings?.enabled ?? true ? "Açık" : "Kapalı"}
          </button>
        </div>

        <div>
          <p className="text-xs text-text-muted mb-1.5">
            Kontrol saatleri (yerel saat) · {hoursSummary}
          </p>
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: 24 }, (_, h) => h).map((hour) => {
              const active = settings?.hours.includes(hour) ?? false;
              return (
                <button
                  key={hour}
                  onClick={() => toggleHour(hour)}
                  disabled={!settings || !token}
                  className={`w-9 py-1 rounded-md text-[10px] tabular-nums border transition-colors disabled:opacity-50 ${
                    active
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "bg-background border-border text-text-muted hover:text-text"
                  }`}
                >
                  {String(hour).padStart(2, "0")}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs text-text-muted">
            Saat dilimi
            <select
              value={settings?.timezone ?? "Asia/Baku"}
              onChange={(e) => patch({ timezone: e.target.value })}
              disabled={!settings || !token}
              className="mt-1 w-full px-2.5 py-2 rounded-lg bg-background border border-border text-xs text-text disabled:opacity-50"
            >
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs text-text-muted">
            Erteleme süresi (dk)
            <input
              type="number"
              min={5}
              max={180}
              value={settings?.snoozeMinutes ?? 15}
              onChange={(e) =>
                patch({ snoozeMinutes: Number(e.target.value) || 15 })
              }
              disabled={!settings || !token}
              className="mt-1 w-full px-2.5 py-2 rounded-lg bg-background border border-border text-xs text-text disabled:opacity-50"
            />
          </label>

          <label className="text-xs text-text-muted">
            Mentor en fazla cümle (1-20)
            <input
              type="number"
              min={1}
              max={20}
              value={settings?.maxSentences ?? 8}
              onChange={(e) =>
                patch({ maxSentences: Number(e.target.value) || 8 })
              }
              disabled={!settings || !token}
              className="mt-1 w-full px-2.5 py-2 rounded-lg bg-background border border-border text-xs text-text disabled:opacity-50"
            />
          </label>
        </div>

        <div>
          <p className="text-xs text-text-muted mb-1.5">Mentor tonu</p>
          <div className="flex flex-wrap gap-1.5">
            {TONES.map((tone) => (
              <button
                key={tone.value}
                onClick={() => patch({ tone: tone.value })}
                disabled={!settings || !token}
                title={tone.hint}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50 ${
                  settings?.tone === tone.value
                    ? "bg-primary/10 border-primary/40 text-primary"
                    : "bg-background border-border text-text-muted hover:text-text"
                }`}
              >
                {tone.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-3">
          <div>
            <p className="text-xs text-text">AI mesajları (Gemini)</p>
            <p className="text-[10px] text-text-muted">
              {ai
                ? `${ai.model} · ${ai.availableKeys}/${ai.configuredKeys} anahtar kullanılabilir`
                : "Sunucudan durum alınamadı"}
              {ai?.blockedUntil ? " · kota nedeniyle geçici kapalı" : ""}
            </p>
          </div>
          <button
            onClick={() => patch({ aiEnabled: !(settings?.aiEnabled ?? true) })}
            disabled={!settings || !token}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${
              settings?.aiEnabled ?? true
                ? "bg-primary/10 border-primary/30 text-primary"
                : "bg-background border-border text-text-muted"
            }`}
          >
            {settings?.aiEnabled ?? true ? "Açık" : "Kapalı"}
          </button>
        </div>
        <p className="text-[10px] text-text-muted">
          AI kapalıyken veya kotada mentör mesajları kural tabanlı üretilir;
          görev ve bildirim sistemi çalışmaya devam eder.
        </p>
      </div>

      {/* Sesler */}
      <div className="p-4 rounded-xl bg-surface border border-border space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-text">
            <Volume2 size={16} className="text-primary" />
            Sesler
          </div>
          <button
            onClick={() => updateSound({ enabled: !soundPrefs.enabled })}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              soundPrefs.enabled
                ? "bg-success/10 border-success/30 text-success"
                : "bg-background border-border text-text-muted"
            }`}
          >
            {soundPrefs.enabled ? "Açık" : "Kapalı"}
          </button>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs text-text-muted mb-1">
            <span>Ses seviyesi</span>
            <span className="tabular-nums">{Math.round(soundPrefs.volume * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(soundPrefs.volume * 100)}
            onChange={(e) => updateSound({ volume: Number(e.target.value) / 100 })}
            onMouseUp={() => playSoundId(resolveSound("mentorCheck"))}
            onTouchEnd={() => playSoundId(resolveSound("mentorCheck"))}
            className="w-full accent-[var(--primary)]"
          />
        </div>

        <div>
          <p className="text-xs text-text-muted mb-1.5">Varsayılan ses</p>
          <div className="flex gap-2">
            <select
              value={soundPrefs.master}
              onChange={(e) => updateSound({ master: e.target.value as SoundId })}
              className="flex-1 min-w-0 px-2.5 py-2 rounded-lg bg-background border border-border text-xs text-text"
            >
              {SOUND_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label} — {option.description}
                </option>
              ))}
            </select>
            <button
              onClick={() => playSoundId(soundPrefs.master)}
              className="p-2 rounded-lg bg-background border border-border text-text-muted hover:text-text"
              title="Dinle"
            >
              <Play size={12} />
            </button>
          </div>
        </div>

        <div>
          <p className="text-xs text-text-muted mb-1.5">Olay bazlı sesler</p>
          <div className="space-y-1.5">
            {SOUND_EVENTS.map(({ event, label }) => {
              const value = soundPrefs.events[event] ?? "default";
              return (
                <div key={event} className="flex items-center gap-2">
                  <span className="text-[11px] text-text w-28 shrink-0">{label}</span>
                  <select
                    value={value}
                    onChange={(e) =>
                      updateSound({
                        events: {
                          ...soundPrefs.events,
                          [event]: e.target.value as SoundId | "default",
                        },
                      })
                    }
                    className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-background border border-border text-[11px] text-text"
                  >
                    <option value="default">
                      Varsayılan ({soundLabel(soundPrefs.master)})
                    </option>
                    {SOUND_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => playSoundId(resolveSound(event))}
                    className="p-1.5 rounded-lg bg-background border border-border text-text-muted hover:text-text"
                    title="Bu sesi dinle"
                  >
                    <Play size={11} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="border-t border-border pt-3">
          <p className="text-xs text-text-muted mb-1.5">Özel ses</p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background border border-border text-xs text-text cursor-pointer hover:border-primary/40 transition-colors">
              <Upload size={12} />
              Ses dosyası yükle
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => handleSoundFile(e.target.files?.[0])}
              />
            </label>
            <button
              onClick={() => playSoundId("custom")}
              disabled={!soundPrefs.customDataUrl}
              className="px-2.5 py-1.5 rounded-lg bg-background border border-border text-xs text-text-muted hover:text-text disabled:opacity-40"
            >
              Dinle
            </button>
            {soundPrefs.customDataUrl && (
              <button
                onClick={() =>
                  updateSound({
                    customDataUrl: null,
                    customName: null,
                    master: soundPrefs.master === "custom" ? "chime" : soundPrefs.master,
                  })
                }
                className="text-[11px] text-danger hover:underline"
              >
                Kaldır
              </button>
            )}
          </div>
          <p className="text-[10px] text-text-muted mt-1">
            {soundPrefs.customName
              ? `Yüklü: ${soundPrefs.customName}`
              : "MP3/WAV/OGG, max 1.5 MB. Yalnızca bu cihazda saklanır."}
          </p>
          {soundMessage && (
            <p className="text-[10px] text-text-muted mt-1">{soundMessage}</p>
          )}
        </div>
      </div>

      {/* Bildirimler */}
      <div className="p-4 rounded-xl bg-surface border border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-text">
            {permission === "granted" ? (
              <Bell size={16} className="text-primary" />
            ) : (
              <BellOff size={16} className="text-text-muted" />
            )}
            Bildirim izni
          </div>
          <button
            onClick={handlePermission}
            disabled={permission === "granted" || permission === "unsupported"}
            className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {permission === "granted"
              ? "İzin verildi"
              : permission === "unsupported"
                ? "Desteklenmiyor"
                : permission === "denied"
                  ? "Tarayıcıdan izin ver"
                  : "İzin ver"}
          </button>
        </div>
        <p className="text-[10px] text-text-muted mt-2">
          İzin verildiğinde uygulama açıkken mentor kontrolleri bildirim olarak
          gösterilir. Sekme kapalıyken de bildirim istiyorsan aşağıdaki arka plan
          bildirimlerini aç.
        </p>

        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium text-text">
                <Bell size={16} className={pushState === "on" ? "text-primary" : "text-text-muted"} />
                Arka plan bildirimleri
              </div>
              <p className="text-[10px] text-text-muted mt-1">
                {pushState === "on"
                  ? "Bu cihaz kayıtlı: görev saatinde ve uygulama kapalıyken de haber verilir."
                  : pushState === "denied"
                    ? "Tarayıcı bildirimleri engellemiş. Site ayarlarından izin ver."
                    : pushState === "unsupported"
                      ? (pushBlocker() ??
                        "Bu tarayıcı push bildirimlerini desteklemiyor.")
                      : "Kapalı. Açtığında bu cihaz sunucuya kaydedilir (VAPID)."}
              </p>
              {pushState === "on" && serverPush && (
                <p className="text-[10px] text-text-muted/80 mt-1">
                  Sunucuda {serverPush.subscribed} cihaz kayıtlı
                  {serverPush.lastSentAt
                    ? ` · son gönderim ${new Date(serverPush.lastSentAt).toLocaleString(
                        "tr-TR",
                        {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}`
                    : " · henüz gönderim yok"}
                </p>
              )}
            </div>
            <button
              onClick={togglePush}
              disabled={pushBusy || pushState === "unsupported" || pushState === "denied"}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {pushBusy ? "…" : pushState === "on" ? "Kapat" : "Aç"}
            </button>
          </div>

          {pushState === "on" && (
            <button
              onClick={handleTestPush}
              disabled={pushBusy}
              className="mt-2 w-full px-3 py-1.5 rounded-lg bg-surface-hover text-text text-xs hover:bg-surface-hover/70 transition-colors disabled:opacity-50"
            >
              Test bildirimi gönder
            </button>
          )}

          {pushMessage && (
            <p className="text-[10px] text-primary mt-1.5">{pushMessage}</p>
          )}

          <p className="text-[10px] text-text-muted/70 mt-2">
            Android'de bildirim için site <strong>https</strong> ile açılmalı
            (LAN IP'si http olmaz) ve Chrome'a bildirim izni verilmeli. Bildirimler gecikirse: Android Ayarlar → Uygulamalar → Chrome → Pil → Kısıtlamasız.
          </p>
        </div>

        {/* Sabah / akşam / haftalık özet bildirimleri */}
        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex items-center gap-2 text-sm font-medium text-text">
            <CalendarClock size={16} className="text-primary" />
            Özet bildirimleri
          </div>
          <p className="text-[10px] text-text-muted mt-1">
            Sunucu gönderir; uygulama kapalıyken de gelir. Arka plan
            bildirimleri açık olmalı. AI kotada değilse mentor mesajları kural
            tabanlıdır; bildirim başlıkları her zaman şablondur.
          </p>
          <ul className="mt-2 space-y-2">
            {SUMMARY_TOGGLES.map(({ key, label, hint }) => {
              const on = summaryState[key];
              return (
                <li key={key} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-text leading-snug">{label}</p>
                    <p className="text-[10px] text-text-muted">{hint}</p>
                  </div>
                  <button
                    onClick={() =>
                      patch({ summaries: { ...summaryState, [key]: !on } })
                    }
                    role="switch"
                    aria-checked={on}
                    aria-label={label}
                    disabled={!settings || !token}
                    className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
                      on ? "bg-primary" : "bg-border"
                    } disabled:opacity-50`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                        on ? "left-[18px]" : "left-0.5"
                      }`}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {iosGuide && (
          <div className="mt-3 pt-3 border-t border-border">
            <div className="flex items-center gap-2 text-sm font-medium text-text">
              <Share size={16} className="text-primary" />
              iPhone'da ana ekrana ekle
            </div>
            <ol className="mt-1.5 space-y-1 text-[10px] text-text-muted list-decimal list-inside">
              <li>Bu sayfayı Safari'de aç (Chrome'da yükleme olmaz).</li>
              <li>
                Alt bardaki <strong>Paylaş</strong> düğmesine dokun.
              </li>
              <li>
                <strong>Ana Ekrana Ekle</strong> → <strong>Ekle</strong>.
              </li>
              <li>
                Uygulamayı ana ekrandan aç, sonra burada bildirimleri aç.
              </li>
            </ol>
            <p className="text-[10px] text-text-muted/70 mt-1">
              iOS 16.4+ için push bildirimleri yalnızca ana ekrana eklenmiş
              uygulamada çalışır; Safari sekmesinde çalışmaz.
            </p>
          </div>
        )}
      </div>

      <div className="p-4 rounded-xl bg-surface border border-border">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-text">
            <Palette size={16} className="text-primary" />
            {t("settings.appearance")}
          </div>
          <button
            onClick={toggle}
            className="px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary/90 transition-colors text-sm font-medium"
          >
            {theme === "dark" ? "Aydınlık Moda Geç" : "Karanlık Moda Geç"}
          </button>
        </div>

        <p className="text-[11px] text-text-muted mt-3 mb-1.5">
          {t("settings.palette")}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: "indigo", label: "İndigo", color: "#6366f1" },
              { id: "forest", label: "Orman", color: "#16a34a" },
              { id: "ocean", label: "Okyanus", color: "#0284c7" },
              { id: "sand", label: "Kum", color: "#d97706" },
              { id: "berry", label: "Böğürtlen", color: "#db2777" },
            ] as { id: PaletteName; label: string; color: string }[]
          ).map((item) => (
            <button
              key={item.id}
              onClick={() => setPalette(item.id)}
              aria-pressed={palette === item.id}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] transition-colors ${
                palette === item.id
                  ? "border-primary bg-primary/10 text-text"
                  : "border-border text-text-muted hover:text-text"
              }`}
            >
              <span
                className="size-3 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              {item.label}
            </button>
          ))}
        </div>

        <label className="mt-3 pt-3 border-t border-border flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={contrast === "high"}
            onChange={(e) => setContrast(e.target.checked ? "high" : "normal")}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
          />
          <span className="min-w-0">
            <span className="block text-sm text-text">
              {t("settings.contrast")}
            </span>
            <span className="block text-xs text-text-muted mt-0.5">
              {t("settings.contrastHint")}
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2.5 py-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={colorblind}
            onChange={(e) => setColorblind(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
          />
          <span className="min-w-0">
            <span className="block text-sm text-text">
              {t("settings.colorblind")}
            </span>
            <span className="block text-xs text-text-muted mt-0.5">
              {t("settings.colorblindHint")}
            </span>
          </span>
        </label>
      </div>

      <div className="p-4 rounded-xl bg-surface border border-border">
        <div className="flex items-center gap-2 text-sm font-medium text-text">
          <Languages size={16} className="text-primary" />
          {t("settings.language")}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {LANGUAGES.map((item) => (
            <button
              key={item.id}
              onClick={() => setLang(item.id)}
              aria-pressed={lang === item.id}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                lang === item.id
                  ? "border-primary bg-primary/10 text-text"
                  : "border-border text-text-muted hover:text-text"
              }`}
            >
              {item.label}
              <span className="ml-1.5 text-[10px] text-text-muted">
                {item.short}
              </span>
            </button>
          ))}
        </div>
        <p className="text-xs text-text-muted mt-2">
          {t("settings.languageHint")}
        </p>
      </div>

      <div className="p-4 rounded-xl bg-surface border border-border">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-text">
            <ListOrdered size={16} className="text-primary" />
            Liste görünümü
          </div>
          <button
            onClick={() => dispatch(setProgressiveLists(!progressiveLists))}
            role="switch"
            aria-checked={progressiveLists}
            disabled={seriousMode}
            title={seriousMode ? "Ciddi mod açıkken tüm görevler gösterilir" : undefined}
            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
              progressiveLists ? "bg-primary" : "bg-border"
            } ${seriousMode ? "opacity-40 cursor-not-allowed" : ""}`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
                progressiveLists ? "left-[22px]" : "left-0.5"
              }`}
            />
          </button>
        </div>
        <p className="text-xs text-text-muted mt-1">
          {progressiveLists
            ? "Uzun listeler “Daha fazlasını göster” ile parça parça açılır (varsayılan)."
            : "Kapalı: yapılacaklar ve takvim listeleri tüm görevleri birden gösterir."}
        </p>

        <label className="mt-3 pt-3 border-t border-border flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={seriousMode}
            onChange={(e) => dispatch(setSeriousMode(e.target.checked))}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-text">Ciddi mod</span>
            <span className="block text-xs text-text-muted mt-0.5">
              Tüm görevler birden gösterilir; “kalanı sonra yaparsın” türü
              rahatlatıcı metinler gizlenir. Varsayılan kapalı.
            </span>
          </span>
        </label>
      </div>

      <div className="p-4 rounded-xl bg-surface border border-border">
        <div className="flex items-center gap-2 text-sm font-medium text-text mb-1">
          <Timer size={16} className="text-primary" />
          Odak davranışı
        </div>
        <label className="flex items-start gap-2.5 py-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={focusPrefs.autoPause}
            onChange={(e) => {
              const next = { ...focusPrefs, autoPause: e.target.checked };
              setFocusPrefs(next);
              writeFocusPrefs(next);
            }}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
          />
          <span className="min-w-0">
            <span className="block text-sm text-text">
              Sekme arka plana geçince sayacı duraklat
            </span>
            <span className="block text-xs text-text-muted mt-0.5">
              Açıkken başka sekmeye geçince odak sayacı durur; dönünce “Devam”
              ile sürer. Varsayılan kapalı.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2.5 py-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={focusPrefs.mute}
            onChange={(e) => {
              const next = { ...focusPrefs, mute: e.target.checked };
              setFocusPrefs(next);
              writeFocusPrefs(next);
            }}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
          />
          <span className="min-w-0">
            <span className="block text-sm text-text">
              Odak sırasında uygulama bildirimlerini gösterme
            </span>
            <span className="block text-xs text-text-muted mt-0.5">
              Telefon bildirimleri yine gelir; bu yalnızca uygulama açıkken
              çıkan masaüstü bildirimlerini susturur.
            </span>
          </span>
        </label>
      </div>

      <div className="p-4 rounded-xl bg-surface border border-border">
        <div className="flex items-center gap-2 text-sm font-medium text-text mb-1">
          <CalendarDays size={16} className="text-primary" />
          Takvim aboneliği
        </div>
        <p className="text-xs text-text-muted mb-2">
          Salt-okunur ICS adresi. Google Takvim → “Takvim ekle → URL ile”
          bölümüne yapıştır; Apple Takvim “Takvim aboneliği” ile ekler. Saatli
          ve tamamlanmamış görevler görünür.
        </p>
        {calendarUrl ? (
          <div className="space-y-2">
            <code className="block text-[10px] break-all rounded-lg bg-background border border-border px-2 py-1.5 text-text-muted">
              {calendarUrl}
            </code>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={copyCalendar}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/30 text-primary text-[11px] font-medium"
              >
                <Copy size={11} /> Kopyala
              </button>
              <button
                onClick={() => loadCalendar(true)}
                disabled={calendarBusy}
                className="px-2.5 py-1 rounded-lg border border-border text-[11px] text-text-muted hover:text-text disabled:opacity-50"
              >
                Linki yenile
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => loadCalendar(false)}
            disabled={calendarBusy}
            className="px-3 py-1.5 rounded-lg bg-background border border-border text-xs text-text hover:border-primary/40 transition-colors disabled:opacity-50"
          >
            {calendarBusy ? "Oluşturuluyor…" : "Abonelik linki oluştur"}
          </button>
        )}
        {calendarMessage && (
          <p className="text-[10px] text-text-muted mt-1.5">{calendarMessage}</p>
        )}
      </div>

      <div className="p-4 rounded-xl bg-surface border border-border">
        <div className="flex items-center gap-2 text-sm font-medium text-text mb-1">
          <Link2 size={16} className="text-primary" />
          {t("share.title")}
        </div>
        <p className="text-xs text-text-muted mb-2">{t("share.hint")}</p>
        {shareToken ? (
          <div className="space-y-2">
            <code className="block text-[10px] break-all rounded-lg bg-background border border-border px-2 py-1.5 text-text-muted">
              {`${window.location.origin}/?p=${shareToken}`}
            </code>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => void copyShare()}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/30 text-primary text-[11px] font-medium"
              >
                <Copy size={11} /> {t("share.copy")}
              </button>
              <button
                onClick={() => void loadShare(true)}
                disabled={shareBusy}
                className="px-2.5 py-1 rounded-lg border border-border text-[11px] text-text-muted hover:text-text disabled:opacity-50"
              >
                {t("share.rotate")}
              </button>
              <button
                onClick={() => void disableShare()}
                disabled={shareBusy}
                className="px-2.5 py-1 rounded-lg border border-border text-[11px] text-text-muted hover:text-danger disabled:opacity-50"
              >
                {t("share.disable")}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => void loadShare(false)}
            disabled={shareBusy}
            className="px-3 py-1.5 rounded-lg bg-background border border-border text-xs text-text hover:border-primary/40 transition-colors disabled:opacity-50"
          >
            {shareBusy ? "Oluşturuluyor…" : t("share.create")}
          </button>
        )}
        {shareMessage && (
          <p className="text-[10px] text-text-muted mt-1.5">{shareMessage}</p>
        )}
        <p className="text-[10px] text-text-muted/70 mt-1.5">
          Plan ortağı yalnızca bugünün görevlerini görür; günlük, not ve
          istatistikler paylaşılmaz. Bağlantıdaki “Başladın mı diye sor”
          düğmesi sana push bildirimi gönderir (3 saatte bir).
        </p>
      </div>

      <div className="p-4 rounded-xl bg-surface border border-border">
        <div className="flex items-center gap-2 text-sm font-medium text-text mb-1">
          <Share size={16} className="text-primary" />
          Webhook
        </div>
        <p className="text-xs text-text-muted mb-2">
          Bir görevi tamamladığında bu adrese tek bir JSON olayı gönderilir
          (<code className="text-[10px]">task.completed</code>). Zapier, Make,
          n8n veya kendi betiğinle kullanabilirsin. Google Takvim / Notion gibi
          iki yönlü entegrasyonlar OAuth hesabı gerektirir.
        </p>
        <div className="flex flex-wrap gap-1.5">
          <input
            value={webhookInput}
            onChange={(e) => setWebhookInput(e.target.value)}
            placeholder="https://ornek.com/adaptime-webhook"
            className="flex-1 min-w-[12rem] bg-background border border-border rounded-lg px-2 py-1.5 text-[11px] text-text focus:outline-none focus:border-primary"
          />
          <button
            onClick={() => void saveWebhook()}
            disabled={webhookBusy || !webhookInput.trim()}
            className="px-2.5 py-1.5 rounded-lg bg-primary text-white text-[11px] font-medium disabled:opacity-50"
          >
            Kaydet
          </button>
          {webhookUrl && (
            <>
              <button
                onClick={() => void testWebhook()}
                disabled={webhookBusy}
                className="px-2.5 py-1.5 rounded-lg border border-border text-[11px] text-text-muted hover:text-text disabled:opacity-50"
              >
                Test et
              </button>
              <button
                onClick={() => void removeWebhook()}
                disabled={webhookBusy}
                className="px-2.5 py-1.5 rounded-lg border border-border text-[11px] text-text-muted hover:text-danger disabled:opacity-50"
              >
                Kaldır
              </button>
            </>
          )}
        </div>
        {webhookMessage && (
          <p className="text-[10px] text-text-muted mt-1.5">{webhookMessage}</p>
        )}
      </div>

      <div className="p-4 rounded-xl bg-surface border border-border">
        <div className="flex items-center gap-2 text-sm font-medium text-text mb-1">
          <Database size={16} className="text-primary" />
          Veri
        </div>
        <p className="text-xs text-text-muted mb-3">
          Görevlerin, aktivite kayıtların ve odak oturumların hesabına bağlı
          olarak sunucuda saklanır. Bu buton görev verilerini kalıcı olarak siler.
        </p>
        <div className="mt-4 pt-3 border-t border-border">
          <div className="flex items-center gap-2 text-xs font-medium text-text mb-1">
            <ArchiveRestore size={14} className="text-primary" />
            Otomatik yedekler
            <span className="text-text-muted font-normal">— son 7 gün</span>
          </div>
          <p className="text-[11px] text-text-muted mb-2">
            Sunucu her gün planlarının bir kopyasını saklar. Bir şey ters
            giderse buradan geri dönebilirsin.
          </p>
          {backups.length === 0 ? (
            <p className="text-[11px] text-text-muted/70">Henüz yedek yok.</p>
          ) : (
            <ul className="space-y-1">
              {backups.map((backup) => (
                <li
                  key={backup.id}
                  className="flex items-center gap-2 text-[11px] text-text-muted"
                >
                  <span className="text-text tabular-nums">
                    {new Date(backup.createdAt).toLocaleString("tr-TR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="truncate">
                    {backup.days} gün · {backup.tasks} görev
                  </span>
                  <button
                    onClick={() => handleRestore(backup.id)}
                    disabled={restoringId === backup.id}
                    className="ml-auto shrink-0 px-2 py-1 rounded-lg bg-background border border-border text-[10px] text-text hover:border-primary/50 transition-colors disabled:opacity-50"
                  >
                    {restoringId === backup.id ? "Yükleniyor…" : "Geri yükle"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
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
              : "Tüm görev verilerini sil"}
        </button>
        {message && <p className="text-xs text-text-muted mt-2">{message}</p>}
        <button
          onClick={handleExport}
          className="mt-3 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-background border border-border text-text hover:border-primary/40 transition-colors"
        >
          <Download size={14} />
          Verileri indir (JSON)
        </button>
        <button
          onClick={handleDeleteAccount}
          disabled={deletingAccount}
          className={`mt-3 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
            confirmAccountDelete
              ? "bg-danger text-white border-danger"
              : "bg-transparent text-danger border-danger/30 hover:bg-danger/10"
          } disabled:opacity-60`}
        >
          <Trash2 size={14} />
          {deletingAccount
            ? "Siliniyor…"
            : confirmAccountDelete
              ? "Emin misin? Hesabı kalıcı sil"
              : "Hesabı ve tüm verileri sil"}
        </button>
        <p className="text-[10px] text-text-muted mt-1.5">
          Hesap silme geri alınamaz: görevler, günlük, yedekler ve bildirim
          kayıtları sunucudan kaldırılır.
        </p>
        <p className="text-[10px] text-text-muted mt-2 flex items-center gap-1">
          <Clock3 size={10} /> Aktivite ve odak geçmişi ayrı koleksiyonlarda tutulur.
        </p>
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
