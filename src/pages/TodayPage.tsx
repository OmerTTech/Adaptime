import { useEffect, useRef } from "react";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import {
  loadTodayRoutine,
  saveRoutineToBackend,
  migrateDates,
  skipTask,
  resetRoutine,
  setStreak,
} from "@/store/slices/routineSlice";
import { setActivePage, type PageName } from "@/store/slices/uiSlice";
import { loadAccountabilityState } from "@/store/slices/mentorSlice";
import { useAuth } from "@/contexts/AuthContext";
import { routineApi } from "@/services/api";
import { useAccountabilityEngine } from "@/hooks/useAccountabilityEngine";
import OClock from "@/components/clock/OClock";
import TimelineView from "@/components/timeline/TimelineView";
import FocusTimer from "@/components/timer/FocusTimer";
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
import StatsPage from "@/pages/StatsPage";
import SettingsPage from "@/pages/SettingsPage";
import MentorPage from "@/pages/MentorPage";
import FocusPage from "@/pages/FocusPage";
import DiaryPage from "@/pages/DiaryPage";
import { isScheduled } from "@/types";
import {
  BookOpen,
  BrainCircuit,
  Calendar,
  ChartBar,
  LogOut,
  Settings,
  Sun,
  Timer,
} from "lucide-react";

const NAV: { page: PageName; label: string; icon: typeof Sun }[] = [
  { page: "today", label: "Bugün", icon: Sun },
  { page: "mentor", label: "Mentor", icon: BrainCircuit },
  { page: "focus", label: "Odak", icon: Timer },
  { page: "diary", label: "Günlük", icon: BookOpen },
  { page: "stats", label: "Analitik", icon: ChartBar },
  { page: "settings", label: "Ayarlar", icon: Settings },
];

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return "İyi geceler";
  if (hour < 12) return "Günaydın";
  if (hour < 18) return "İyi günler";
  return "İyi akşamlar";
}

export default function TodayPage() {
  const { user, token, logout } = useAuth();
  const dispatch = useAppDispatch();
  const viewMode = useAppSelector((state) => state.ui.viewMode);
  const page = useAppSelector((state) => state.ui.activePage);
  const routine = useAppSelector((state) => state.routine.currentRoutine);
  const tasks = routine?.tasks ?? [];

  useAccountabilityEngine(token);

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

  // Fix task timestamps that are 24h off due to old date bug
  useEffect(() => {
    dispatch(migrateDates());
  }, [dispatch]);

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
    if (syncTimeout.current) clearTimeout(syncTimeout.current);
    syncTimeout.current = setTimeout(() => {
      dispatch(saveRoutineToBackend({ routine, token }))
        .unwrap()
        // Kayıt sunucuya gittikten sonra mentor/analitik özetini hemen tazele;
        // aksi halde sayaçlar 60 saniyelik yoklamaya kadar eski kalıyor.
        .then(() => dispatch(loadAccountabilityState(token)))
        .catch(() => {
          /* offline: sonraki değişiklikte tekrar denenir */
        });
    }, 1500);
    return () => {
      if (syncTimeout.current) clearTimeout(syncTimeout.current);
    };
  }, [token, routine, dispatch]);

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

  const handleLogout = () => {
    dispatch(resetRoutine());
    logout();
  };

  const handlePage = (p: PageName) => dispatch(setActivePage(p));

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
            <div className="hidden sm:flex items-center gap-1 rounded-xl bg-surface border border-border p-1 shrink-0">
              {NAV.map(({ page: p, label, icon: Icon }) => (
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
                  {label}
                </button>
              ))}
            </div>
            {user && (
              <div className="flex items-center gap-2 shrink-0">
                <Avatar user={user} size={32} />
                <button
                  onClick={handleLogout}
                  className="p-2 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text transition-colors"
                  title="Çıkış Yap"
                >
                  <LogOut size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
        {/* Mobile tab bar */}
        <div className="sm:hidden max-w-4xl mx-auto px-2 pb-2 flex gap-0.5">
          {NAV.map(({ page: p, label, icon: Icon }) => (
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
              {label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 pt-6 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:pb-10">
        {page === "stats" && (
          <div className="flex justify-center sm:hidden py-2">
            <div className="flex items-center gap-1 rounded-xl bg-surface border border-border p-1">
              <DayEndTimeBadge />
              <StreakBadge />
            </div>
          </div>
        )}

        {page === "today" && (
          <>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-text-muted">
                  {greeting()}
                  {user?.name ? `, ${user.name.split(" ")[0]}` : ""}
                </p>
                <h2 className="text-xl font-bold text-text">Bugünün planı</h2>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <DayEndTimeBadge />
                <StreakBadge />
                <ViewToggle />
              </div>
            </div>

            <TodayOverview />

            <div className="mt-3 grid grid-cols-1 gap-2">
              <MentorCard />
              <DiaryCard />
            </div>

            {hasActiveTask && (
              <div className="mt-6">
                <FocusTimer />
              </div>
            )}

            {viewMode === "oclock" && (
              <div className={`flex justify-center ${hasActiveTask ? "mt-8" : "mt-8"}`}>
                <OClock />
              </div>
            )}

            {tasks.length > 0 && (
              <div className={viewMode === "timeline" ? "" : "mt-8"}>
                <TimelineView />
              </div>
            )}
          </>
        )}

        {page === "mentor" && <MentorPage />}
        {page === "focus" && <FocusPage />}
        {page === "diary" && <DiaryPage />}
        {page === "stats" && <StatsPage />}
        {page === "settings" && <SettingsPage />}
      </main>

      {page === "today" && <AddRoutineFAB />}
      {isAddModalOpen && addModalMode === "ai" && <AIAddTaskModal />}
      {isAddModalOpen && addModalMode === "manual" && <AddTaskModal />}
      {isEditModalOpen && <EditTaskModal />}
      {isPauseModalOpen && <PauseOptionsModal />}
      {isFlowModalOpen && <FlowStateModal />}
      {isEarlyFinishModalOpen && <EarlyFinishModal />}
      {isPreviewModalOpen && <ImpactPreviewModal />}
    </div>
  );
}
