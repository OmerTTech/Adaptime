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
import { useAuth } from "@/contexts/AuthContext";
import { routineApi } from "@/services/api";
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
import StatsPage from "@/pages/StatsPage";
import SettingsPage from "@/pages/SettingsPage";
import { isScheduled } from "@/types";
import { Calendar, LogOut, Sun, ChartBar, Settings } from "lucide-react";

export default function TodayPage() {
  const { user, token, logout } = useAuth();
  const dispatch = useAppDispatch();
  const viewMode = useAppSelector((state) => state.ui.viewMode);
  const page = useAppSelector((state) => state.ui.activePage);
  const routine = useAppSelector((state) => state.routine.currentRoutine);
  const tasks = routine?.tasks ?? [];

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
      dispatch(saveRoutineToBackend({ routine, token }));
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
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-text">Adaptime</h1>
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-text-muted">
              <Calendar size={12} />
              <span>{dateStr}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="hidden sm:flex items-center gap-1 rounded-xl bg-surface border border-border p-1">
              <button
                onClick={() => handlePage("today")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  page === "today"
                    ? "bg-primary text-white"
                    : "text-text-muted hover:text-text"
                }`}
              >
                <Sun size={13} />
                Bugün
              </button>
              <button
                onClick={() => handlePage("stats")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  page === "stats"
                    ? "bg-primary text-white"
                    : "text-text-muted hover:text-text"
                }`}
              >
                <ChartBar size={13} />
                İstatistik
              </button>
              <button
                onClick={() => handlePage("settings")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  page === "settings"
                    ? "bg-primary text-white"
                    : "text-text-muted hover:text-text"
                }`}
              >
                <Settings size={13} />
                Ayarlar
              </button>
            </div>
            {page === "today" && (
              <div className="flex items-center gap-2">
                <DayEndTimeBadge />
                <StreakBadge />
                <ViewToggle />
              </div>
            )}
            {user && (
              <div className="flex items-center gap-2 ml-2">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary overflow-hidden">
                  {user.avatar ? (
                    <img
                      src={user.avatar}
                      alt={user.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    user.name.charAt(0).toUpperCase()
                  )}
                </div>
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
        <div className="sm:hidden max-w-4xl mx-auto px-4 pb-2 flex gap-1">
          {(
            [
              ["today", "Bugün", Sun],
              ["stats", "İstatistik", ChartBar],
              ["settings", "Ayarlar", Settings],
            ] as const
          ).map(([p, label, Icon]) => (
            <button
              key={p}
              onClick={() => handlePage(p)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors ${
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
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
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
            {hasActiveTask && <FocusTimer />}

            {viewMode === "oclock" && (
              <div className={`flex justify-center ${hasActiveTask ? "mt-8" : ""}`}>
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