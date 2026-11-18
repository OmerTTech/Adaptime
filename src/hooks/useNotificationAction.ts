import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { adjustTaskEnd, completeTask } from "@/store/slices/routineSlice";
import { isScheduled } from "@/types";

/**
 * Bildirim düğmelerinden gelen derin bağlantıları uygular:
 *   /?task=<id>&do=complete  → görevi tamamla
 *   /?task=<id>&do=extend    → bitişi 10 dk uzat
 *   /?task=<id>              → yalnızca görevi vurgula
 * Parametreler işlendikten sonra adres çubuğundan temizlenir.
 */
export function useNotificationAction() {
  const dispatch = useAppDispatch();
  const routine = useAppSelector((state) => state.routine.currentRoutine);

  useEffect(() => {
    if (!routine) return;
    const params = new URLSearchParams(window.location.search);
    const taskId = params.get("task");
    const action = params.get("do");
    if (!taskId) return;

    const task = routine.tasks.find((t) => t.id === taskId);

    if (task && action === "complete" && task.status !== "completed") {
      dispatch(completeTask(taskId));
    } else if (task && action === "extend" && isScheduled(task)) {
      dispatch(adjustTaskEnd({ id: taskId, minutes: 10 }));
    }

    // Aynı bağlantı yeniden yüklenince tekrar tetiklenmesin.
    params.delete("task");
    params.delete("do");
    const query = params.toString();
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
    );
  }, [routine, dispatch]);
}
