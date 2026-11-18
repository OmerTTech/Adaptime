import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { useAuth } from "@/contexts/AuthContext";
import {
  adjustTaskEnd,
  completeTask,
  loadTodayRoutine,
} from "@/store/slices/routineSlice";
import { routineApi } from "@/services/api";
import { getTodayString } from "@/utils";
import { isScheduled as isScheduledTask } from "@/types";

/**
 * Bildirim düğmelerinden gelen derin bağlantıları uygular:
 *   /?task=<id>&do=complete  → görevi tamamla
 *   /?task=<id>&do=extend    → bitişi 10 dk uzat
 *   /?task=<id>              → yalnızca görevi vurgula
 *   /?do=carry               → açık görevleri yarına devret
 * Parametreler işlendikten sonra adres çubuğundan temizlenir.
 */
export function useNotificationAction() {
  const dispatch = useAppDispatch();
  const { token } = useAuth();
  const routine = useAppSelector((state) => state.routine.currentRoutine);
  const carryStarted = useRef(false);

  useEffect(() => {
    if (!routine) return;
    const params = new URLSearchParams(window.location.search);
    const taskId = params.get("task");
    const action = params.get("do");
    if (!taskId && action !== "carry") return;

    const clearParams = () => {
      params.delete("task");
      params.delete("do");
      const query = params.toString();
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
      );
    };

    // Gün sonu özeti: "Yarına devret". Bir kez çalışır.
    if (action === "carry") {
      clearParams();
      if (!token || carryStarted.current) return;
      carryStarted.current = true;
      const today = getTodayString();
      const tomorrow = new Date(`${today}T12:00:00`);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const target = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
      void routineApi
        .carryAll(today, "move", token, target)
        .catch(() => undefined)
        .finally(() => dispatch(loadTodayRoutine(token)));
      return;
    }

    if (!taskId) return;
    const task = routine.tasks.find((t) => t.id === taskId);

    if (task && action === "complete" && task.status !== "completed") {
      dispatch(completeTask(taskId));
    } else if (task && action === "extend" && isScheduledTask(task)) {
      dispatch(adjustTaskEnd({ id: taskId, minutes: 10 }));
    }

    clearParams();
  }, [routine, dispatch, token]);
}
