import { useEffect, useRef } from "react";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import {
  loadTodayRoutine,
  saveRoutineToBackend,
} from "@/store/slices/routineSlice";
import { useAuth } from "@/contexts/AuthContext";
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
import { Calendar, LogOut } from "lucide-react";

export default function TodayPage() {
  const { user, token, logout } = useAuth();
  const dispatch = useAppDispatch();
  const viewMode = useAppSelector((state) => state.ui.viewMode);
  const routine = useAppSelector((state) => state.routine.currentRoutine);
  const tasks = routine?.tasks ?? [];

  // Load routine from backend on login
  useEffect(() => {
    if (token) {
      dispatch(loadTodayRoutine(token));
    }
  }, [token, dispatch]);

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
          <div className="flex items-center gap-2">
            <DayEndTimeBadge />
            <StreakBadge />
            <ViewToggle />
            {user && (
              <div className="flex items-center gap-2 ml-2">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <button
                  onClick={logout}
                  className="p-2 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text transition-colors"
                  title="Çıkış Yap"
                >
                  <LogOut size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {hasActiveTask && <FocusTimer />}

        <div className={`flex justify-center ${hasActiveTask ? "mt-8" : ""}`}>
          {viewMode === "oclock" ? <OClock /> : <TimelineView />}
        </div>

        {tasks.length > 0 && viewMode === "oclock" && !hasActiveTask && (
          <div className="mt-8">
            <TimelineView />
          </div>
        )}
      </main>

      <AddRoutineFAB />
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
