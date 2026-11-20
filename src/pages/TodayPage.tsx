import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import {
  addTask,
  loadTodayRoutine,
  loadRoutineHistory,
  saveRoutineToBackend,
  flushPendingWrites,
  migrateDates,
  skipTask,
  resetRoutine,
  setStreak,
  pauseTask,
  resumeTask,
  type SyncConflictDiff,
} from "@/store/slices/routineSlice";
import {
  setActivePage,
  setSelectedDate,
  type PageName,
} from "@/store/slices/uiSlice";
import { loadAccountabilityState } from "@/store/slices/mentorSlice";
import { useAuth } from "@/contexts/AuthContext";
import { routineApi } from "@/services/api";
import { refreshPushSubscription } from "@/services/push";
import { useAccountabilityEngine } from "@/hooks/useAccountabilityEngine";
import { useFocusGuard } from "@/hooks/useFocusGuard";
import { useNotificationAction } from "@/hooks/useNotificationAction";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useI18n } from "@/i18n";
import OClock from "@/components/clock/OClock";
import TimelineView from "@/components/timeline/TimelineView";
import FocusTimer from "@/components/timer/FocusTimer";
import FocusRecoveryNotice from "@/components/timer/FocusRecoveryNotice";
import ViewToggle from "@/components/ui/ViewToggle";
import DayEndTimeBadge from "@/components/ui/DayEndTimeBadge";
import StreakBadge from "@/components/ui/StreakBadge";
import AddRoutineFAB from "@/components/routine/AddRoutineFAB";
import AddTaskModal from "@/components/routine/AddTaskModal";
import EditTaskModal from "@/components/routine/EditTaskModal";
import AIAddTaskModal from "@/components/routine/AIAddTaskModal";
import PauseOptionsModal from "@/components/modals/PauseOptionsModal";
import FlowStateModal from "@/components/modals/FlowStateModal";
import EarlyFinishModal from "@/components/modals/EarlyFinishModal";
import ImpactPreviewModal from "@/components/modals/ImpactPreviewModal";
import MentorCard from "@/components/accountability/MentorCard";
import TodayOverview from "@/components/accountability/TodayOverview";
import DiaryCard from "@/components/accountability/DiaryCard";
import Avatar from "@/components/ui/Avatar";
import MissedRepeats from "@/components/timeline/MissedRepeats";
import CarryOver from "@/components/timeline/CarryOver";
import CalendarPanel from "@/components/calendar/CalendarPanel";
import NowNextCard from "@/components/timeline/NowNextCard";
import QuickCapture from "@/components/routine/QuickCapture";
import FocusCompanion from "@/components/accountability/FocusCompanion";
import DeletedTasks from "@/components/timeline/DeletedTasks";
import DayPlanView from "@/components/calendar/DayPlanView";
import ConflictPrompt from "@/components/timeline/ConflictPrompt";
import SearchModal from "@/components/ui/SearchModal";
import PwaHints from "@/components/ui/PwaHints";
import DayClosingModal from "@/components/timeline/DayClosingModal";
import { getTodayString } from "@/utils";

// Sayfalar isteğe bağlı yüklenir: ilk açılış paketi küçük kalır.
const StatsPage = lazy(() => import("@/pages/StatsPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const MentorPage = lazy(() => import("@/pages/MentorPage"));
const FocusPage = lazy(() => import("@/pages/FocusPage"));
const DiaryPage = lazy(() => import("@/pages/DiaryPage"));
import { isScheduled } from "@/types";
import {
  BookOpen,
  BrainCircuit,
  Calendar,
  ChartBar,
  Focus,
  LogOut,
  Moon,
  Search,
  Settings,
  Sun,
  Timer,
  WifiOff,
} from "lucide-react";

const NAV: { page: PageName; labelKey: string; icon: typeof Sun }[] = [
  { page: "today", labelKey: "nav.today", icon: Sun },
  { page: "mentor", labelKey: "nav.mentor", icon: BrainCircuit },
  { page: "focus", labelKey: "nav.focus", icon: Timer },
  { page: "diary", labelKey: "nav.diary", icon: BookOpen },
  { page: "stats", labelKey: "nav.stats", icon: ChartBar },
  { page: "settings", labelKey: "nav.settings", icon: Settings },
];

/** 409 çakışmasında "bu cihazda ne farklı" cümlesi. */
function describeConflict(diff: SyncConflictDiff | null): string | null {
  if (!diff) return null;
  const parts: string[] = [];
  if (diff.added > 0) parts.push(`${diff.added} yeni görev`);
  if (diff.removed > 0) parts.push(`${diff.removed} silinmiş görev`);
  if (diff.changed > 0) parts.push(`${diff.changed} değişmiş görev`);
  if (parts.length === 0) return null;
  return `Bu cihazdaki planla sunucudaki plan farklı: ${parts.join(", ")}.`;
}

function greeting(t: (key: "greeting.night" | "greeting.morning" | "greeting.day" | "greeting.evening") => string): string {
  const hour = new Date().getHours();
  if (hour < 6) return t("greeting.night");
  if (hour < 12) return t("greeting.morning");
  if (hour < 18) return t("greeting.day");
  return t("greeting.evening");
}

export default function TodayPage() {
  const { user, token, logout } = useAuth();
  const { t } = useI18n();
  const dispatch = useAppDispatch();
  const viewMode = useAppSelector((state) => state.ui.viewMode);
  const page = useAppSelector((state) => state.ui.activePage);
  const routine = useAppSelector((state) => state.routine.currentRoutine);
  const tasks = routine?.tasks ?? [];
  // 409: başka bir cihaz/gün devri planı değiştirdi.
  const syncConflict = useAppSelector((s) => s.routine.syncConflict);
  const syncConflictDiff = useAppSelector((s) => s.routine.syncConflictDiff);
  // Çevrimdışıyken kaydedilemeyen değişiklik var mı?
  const pendingSave = useAppSelector((s) => s.routine.pendingSave);
  const online = useOnlineStatus();
  const [searchOpen, setSearchOpen] = useState(false);
  const [dayClosingOpen, setDayClosingOpen] = useState(false);
  // 2.1 — "Şimdi ne yapmalıyım?" sade modu: tek kart, tek karar.
  const [simpleMode, setSimpleMode] = useState(
    () => localStorage.getItem("adaptime-simple") === "1",
  );
  const selectedDate = useAppSelector((state) => state.ui.selectedDate);
  // Takvimde bugün dışında bir gün seçiliyse o günün planı gösterilir.
  const isTodayView = selectedDate === getTodayString();

  // Bildirim aboneliği eski bir VAPID anahtarıyla kalmışsa sessizce yenile.
  useEffect(() => {
    if (token) void refreshPushSubscription(token);
  }, [token]);

  useAccountabilityEngine(token);
  // Odak sayacı açık kalmışsa süreyi saymaz; süre bitince arka plan bildirimi.
  useFocusGuard(token);
  // Bildirimdeki "Tamamlandı" / "10 dk daha" düğmelerinden gelen komutlar.
  useNotificationAction();

  // 2.2 — Klavye kısayolları: N hızlı yakalama, F odak, Space tek aktif görevi
  // duraklat/devam ettir. Yazı alanlarında ve kısayol tuşlarındayken susar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ctrl+K / Cmd+K: yazı alanında bile görev aramayı açar.
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setSearchOpen((v) => !v);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const el = e.target as HTMLElement | null;
      const typing =
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable);
      if (typing) return;

      if (e.key === "n" || e.key === "N") {
        const input = document.querySelector(
          "[data-quick-capture]",
        ) as HTMLInputElement | null;
        if (input) {
          e.preventDefault();
          input.focus();
        }
        return;
      }
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        dispatch(setActivePage("focus"));
        return;
      }
      if (e.key === " " || e.code === "Space") {
        const active = tasks.filter((t) => t.status === "active");
        const paused = tasks.filter((t) => t.status === "paused");
        if (active.length === 1) {
          e.preventDefault();
          dispatch(pauseTask(active[0].id));
        } else if (active.length === 0 && paused.length === 1) {
          e.preventDefault();
          dispatch(resumeTask(paused[0].id));
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch, tasks]);

  // Load routine from backend on login
  useEffect(() => {
    if (token) {
      dispatch(loadTodayRoutine(token));
    }
  }, [token, dispatch]);

  // Load real streak from backend (based on completed days)
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    routineApi
      .getStreak(token)
      .then((res) => {
        if (!cancelled) dispatch(setStreak(res.currentStreak));
      })
      .catch(() => {
        /* offline */
      });
    return () => {
      cancelled = true;
    };
  }, [token, dispatch, routine?.date, tasks.length]);

  // Tahmin doğruluğu ve analitik için son 30 günün planı (bir kez).
  const historyLoaded = useAppSelector((s) => s.routine.historyLoaded);
  useEffect(() => {
    if (token && !historyLoaded) {
      dispatch(loadRoutineHistory({ token, limit: 30 }));
    }
  }, [token, historyLoaded, dispatch]);

  // Fix task timestamps that are 24h off due to old date bug
  useEffect(() => {
    dispatch(migrateDates());
  }, [dispatch]);

  // Görev başlatılınca odak penceresi görünsün: sayfa yukarı kayar.
  // Yalnızca yeni başlayan görevlerde tetiklenir (durum yeniden yüklemelerinde değil).
  const runningSignature = tasks
    .filter((t) => t.status === "active" && t.startedAt)
    .map((t) => `${t.id}:${t.startedAt}`)
    .sort()
    .join("|");
  const lastRunningSignature = useRef<string>("");
  useEffect(() => {
    if (
      !runningSignature ||
      runningSignature === lastRunningSignature.current
    ) {
      lastRunningSignature.current = runningSignature;
      return;
    }
    lastRunningSignature.current = runningSignature;
    if (!isTodayView) return;

    window.scrollTo({ top: 0, behavior: "smooth" });
    // Odak penceresi (FocusTimer) hemen üstte değilse görünür alana getir.
    const timer = window.setTimeout(() => {
      const el = document.querySelector('[data-focus-timer="true"]');
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [runningSignature, isTodayView]);

  // Auto-skip pending SCHEDULED tasks whose endTime has passed
  useEffect(() => {
    const check = () => {
      const now = Date.now();
      tasks.forEach((t) => {
        if (
          t.status === "pending" &&
          isScheduled(t) &&
          (t.endTime ?? 0) < now
        ) {
          dispatch(skipTask(t.id));
        }
      });
    };
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, [tasks, dispatch]);

  // Sync to backend on changes (debounced 1.5s)
  const syncTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!token || !routine) return;
    // Çakışma çözülene kadar otomatik kayıt durur; her değişiklik 409 almasın.
    if (syncConflict) return;
    if (syncTimeout.current) clearTimeout(syncTimeout.current);
    syncTimeout.current = setTimeout(() => {
      dispatch(saveRoutineToBackend({ routine, token }))
        .unwrap()
        // Kayıt sunucuya gittikten sonra mentor/analitik özetini hemen tazele;
        // aksi halde sayaçlar 60 saniyelik yoklamaya kadar eski kalıyor.
        .then((res) => {
          // Çevrimdışı ya da çakışma: sunucudaki durum eski, özeti tazeleme.
          if (!res?.offline && !res?.conflict) {
            dispatch(loadAccountabilityState(token));
          }
        })
        .catch(() => {
          /* offline: sonraki değişiklikte tekrar denenir */
        });
    }, 1500);
    return () => {
      if (syncTimeout.current) clearTimeout(syncTimeout.current);
    };
  }, [token, routine, syncConflict, dispatch]);

  // Çevrimdışıyken IndexedDB kuyruğuna giren yazmalar: bağlantı gelince gönder.
  useEffect(() => {
    if (!online || !pendingSave || !token) return;
    dispatch(flushPendingWrites());
  }, [online, pendingSave, token, dispatch]);

  const isAddModalOpen = useAppSelector((state) => state.ui.isAddModalOpen);
  const isEditModalOpen = useAppSelector((state) => state.ui.isEditModalOpen);
  const addModalMode = useAppSelector((state) => state.ui.addModalMode);
  const isPauseModalOpen = useAppSelector((state) => state.ui.isPauseModalOpen);
  const isFlowModalOpen = useAppSelector((state) => state.ui.isFlowModalOpen);
  const isEarlyFinishModalOpen = useAppSelector(
    (state) => state.ui.isEarlyFinishModalOpen,
  );
  const isPreviewModalOpen = useAppSelector(
    (state) => state.ui.isPreviewModalOpen,
  );

  const hasActiveTask = tasks.some(
    (t) => t.status === "active" || t.status === "paused",
  );

  const today = new Date();
  const dateStr = today.toLocaleDateString("tr-TR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Boş gün: tek tıkla bugünün küçük bir örnek planı.
  const addSamplePlan = () => {
    const start = new Date();
    start.setSeconds(0, 0);
    start.setMinutes(Math.ceil(start.getMinutes() / 30) * 30);
    const base = start.getTime();
    const hour = 3_600_000;
    dispatch(
      addTask({
        title: "Tek bir işe odaklan",
        startTime: base,
        endTime: base + (25 * 60_000),
        priority: "high",
      }),
    );
    dispatch(
      addTask({
        title: "Kısa mola / esneme",
        startTime: base + (30 * 60_000),
        endTime: base + (35 * 60_000),
        priority: "low",
        category: "health",
      }),
    );
    dispatch(
      addTask({
        title: "Günün küçük bir adımı",
        startTime: base + hour,
        endTime: base + hour + (20 * 60_000),
        priority: "medium",
      }),
    );
  };

  const handleLogout = () => {
    dispatch(resetRoutine());
    logout();
  };

  const handlePage = (p: PageName) => dispatch(setActivePage(p));

  // "Bu cihazı koru": sunucudaki sürümü yok sayıp yerel planı yazar.
  const handleKeepLocal = () => {
    if (!token || !routine) return;
    dispatch(saveRoutineToBackend({ routine, token, force: true }))
      .unwrap()
      .then(() => dispatch(loadAccountabilityState(token)))
      .catch(() => {
        /* çevrimdışı: sonraki değişiklikte tekrar denenir */
      });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 shrink-0">
            <h1 className="text-lg font-bold text-text whitespace-nowrap">Adaptime</h1>
            <div className="hidden lg:flex items-center gap-1.5 text-xs text-text-muted whitespace-nowrap">
              <Calendar size={12} className="shrink-0" />
              <span className="whitespace-nowrap">{dateStr}</span>
            </div>
          </div>
                      <div className="flex items-center gap-1.5 min-w-0 justify-end">
              <button
                onClick={() => setSearchOpen(true)}
                className="p-2 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text transition-colors"
                title={t("common.searchShortcut")}
                aria-label={t("common.search")}
              >
                <Search size={16} />
              </button>
            <div className="hidden sm:flex items-center gap-1 rounded-xl bg-surface border border-border p-1 shrink-0">
              {NAV.map(({ page: p, labelKey, icon: Icon }) => (
                <button
                  key={p}
                  onClick={() => handlePage(p)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    page === p
                      ? "bg-primary text-white"
                      : "text-text-muted hover:text-text"
                  }`}
                >
                  <Icon size={13} />
                  {t(labelKey as Parameters<typeof t>[0])}
                </button>
              ))}
            </div>
            {user && (
              <div className="flex items-center gap-2 shrink-0">
                <Avatar user={user} size={32} />
                <button
                  onClick={handleLogout}
                  className="p-2 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text transition-colors"
                  title={t("common.logout")}
                >
                  <LogOut size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
        {/* Mobile tab bar */}
        <div className="sm:hidden max-w-4xl mx-auto px-2 pb-2 flex gap-0.5">
          {NAV.map(({ page: p, labelKey, icon: Icon }) => (
            <button
              key={p}
              onClick={() => handlePage(p)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${
                page === p
                  ? "bg-primary text-white"
                  : "text-text-muted hover:text-text"
              }`}
            >
              <Icon size={14} />
              {t(labelKey as Parameters<typeof t>[0])}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 pt-6 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:pb-10">
        <div className="mb-3">
          <PwaHints />
        </div>
        {syncConflict && (
          <div className="mb-4 flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl bg-warning/10 border border-warning/40 text-[11px] text-text">
            <span className="flex-1 min-w-[12rem] leading-snug">
              Bu plan başka bir cihazda değişti. Otomatik kayıt, sen karar verene
              kadar durduruldu.
            </span>
            {describeConflict(syncConflictDiff) && (
              <span className="basis-full leading-snug text-text-muted">
                {describeConflict(syncConflictDiff)}
              </span>
            )}
            <button
              onClick={() => token && dispatch(loadTodayRoutine(token))}
              className="px-2.5 py-1 rounded-lg bg-primary text-white text-[11px] font-medium hover:bg-primary-hover transition-colors"
            >
              Sunucudan yükle
            </button>
            <button
              onClick={handleKeepLocal}
              className="px-2.5 py-1 rounded-lg bg-background border border-border text-[11px] text-text hover:border-primary/50 transition-colors"
            >
              Bu cihazı koru
            </button>
          </div>
        )}
        {(!online || pendingSave) && (
          <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-xl bg-surface border border-border text-[11px] text-text-muted">
            <WifiOff size={12} className="shrink-0 text-warning" />
            <span className="flex-1 leading-snug">
              {online
                ? "Değişiklikler gönderilemedi — bağlantı gelince tekrar denenecek."
                : "Çevrimdışısın — değişiklikler bu cihazda saklanıyor, bağlantı gelince gönderilecek."}
            </span>
          </div>
        )}

        {page === "stats" && (
          <div className="flex justify-center sm:hidden py-2">
            <div className="flex items-center gap-1 rounded-xl bg-surface border border-border p-1">
              <DayEndTimeBadge />
              <StreakBadge />
            </div>
          </div>
        )}

        {page === "today" && simpleMode && (
          <div className="max-w-2xl mx-auto pt-2 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-text-muted">
                {greeting(t as never)}
                {user?.name ? `, ${user.name.split(" ")[0]}` : ""}
              </p>
              <button
                onClick={() => {
                  setSimpleMode(false);
                  localStorage.setItem("adaptime-simple", "0");
                }}
                className="px-2.5 py-1.5 rounded-lg bg-surface border border-border text-[11px] text-text-muted hover:text-text"
              >
                Sade modu kapat
              </button>
            </div>
            <NowNextCard />
            <p className="text-[11px] text-text-muted text-center">
              Yalnızca şu anki görev ve tek “Başla” düğmesi görünür.
            </p>
          </div>
        )}

        {page === "today" && !simpleMode && (
          <>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-text-muted">
                  {greeting(t as never)}
                  {user?.name ? `, ${user.name.split(" ")[0]}` : ""}
                </p>
                <h2 className="text-xl font-bold text-text">Bugünün planı</h2>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <DayEndTimeBadge />
                <StreakBadge />
                <ViewToggle />
                <button
                  onClick={() => {
                    setSimpleMode(true);
                    localStorage.setItem("adaptime-simple", "1");
                  }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface border border-border text-xs text-text-muted hover:text-text transition-colors"
                  title="Yalnızca şu anki görevi göster"
                >
                  <Focus size={12} /> Sade mod
                </button>
                <button
                  onClick={() => setDayClosingOpen(true)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface border border-border text-xs text-text-muted hover:text-text transition-colors"
                >
                  <Moon size={12} /> Günü kapat
                </button>
              </div>
            </div>

            {isTodayView && <TodayOverview />}

            {isTodayView && <FocusRecoveryNotice />}

            {isTodayView && (
              <div className="mt-3 space-y-2">
                <QuickCapture />
                <NowNextCard />
                <FocusCompanion />
              </div>
            )}

            {isTodayView && tasks.length === 0 && (
              <div className="mt-3 rounded-xl border border-dashed border-border bg-surface p-4 text-center">
                <p className="text-xs text-text-muted">
                  Bugün henüz görev yok. Boş sayfa da bir başlangıç.
                </p>
                <button
                  onClick={addSamplePlan}
                  className="mt-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
                >
                  Tek tıkla örnek plan
                </button>
              </div>
            )}

            {isTodayView && (
              <div className="mt-3 space-y-2">
                <MissedRepeats />
                <CarryOver />
              </div>
            )}

            {isTodayView && (
              <div className="mt-3 grid grid-cols-1 gap-2">
                <MentorCard />
                <DiaryCard />
              </div>
            )}

            {hasActiveTask && isTodayView && (
              <div className="mt-6">
                <FocusTimer />
              </div>
            )}

            {isTodayView && viewMode === "oclock" && (
              <div className={`flex justify-center ${hasActiveTask ? "mt-8" : "mt-8"}`}>
                <OClock />
              </div>
            )}

            {/* Takvim, yapılacaklar/planlı görevler listesinin hemen üstünde. */}
            <div
              className={`w-full max-w-2xl mx-auto ${isTodayView && viewMode === "oclock" ? "mt-6" : "mt-3"}`}
            >
              <CalendarPanel />

              {/* Son silinen görevler takvimin hemen altında, listelerin yanında. */}
              {isTodayView && <DeletedTasks />}
            </div>

            {!isTodayView && (
              <div className="w-full max-w-2xl mx-auto mt-2 space-y-2">
                <DayPlanView />
                <button
                  onClick={() => dispatch(setSelectedDate(getTodayString()))}
                  className="w-full py-2 rounded-xl bg-surface border border-border text-xs text-text-muted hover:text-text transition-colors"
                >
                  Bugüne dön
                </button>
              </div>
            )}

            {isTodayView && tasks.length > 0 && (
              <div className={viewMode === "timeline" ? "mt-3" : "mt-3"}>
                <TimelineView />
              </div>
            )}
          </>
        )}

        <Suspense
          fallback={
            <div className="py-16 text-center text-sm text-text-muted">
              Yükleniyor…
            </div>
          }
        >
          {page === "mentor" && <MentorPage />}
          {page === "focus" && <FocusPage />}
          {page === "diary" && <DiaryPage />}
          {page === "stats" && <StatsPage />}
          {page === "settings" && <SettingsPage />}
        </Suspense>
      </main>

      {page === "today" && <AddRoutineFAB />}
      <ConflictPrompt />
      {isAddModalOpen && addModalMode === "ai" && <AIAddTaskModal />}
      {isAddModalOpen && addModalMode === "manual" && <AddTaskModal />}
      {isEditModalOpen && <EditTaskModal />}
      {isPauseModalOpen && <PauseOptionsModal />}
      {isFlowModalOpen && <FlowStateModal />}
      {isEarlyFinishModalOpen && <EarlyFinishModal />}
      {isPreviewModalOpen && <ImpactPreviewModal />}
      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
      {dayClosingOpen && <DayClosingModal onClose={() => setDayClosingOpen(false)} />}
    </div>
  );
}
