import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  clearPendingConflict,
  updateTask,
} from "@/store/slices/routineSlice";
import { openEditModal } from "@/store/slices/uiSlice";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Clock3, Users } from "lucide-react";

/**
 * Yeni eklenen/düzenlenen görev başka bir görevle aynı saate düşerse
 * "birlikte mi yapacaksın?" diye sorar: tek dokunuşla paralel işaretler.
 */
export default function ConflictPrompt() {
  const dispatch = useAppDispatch();
  const pending = useAppSelector((s) => s.routine.pendingConflict);
  if (!pending) return null;

  const markTogether = () => {
    dispatch(updateTask({ id: pending.firstId, updates: { parallel: true } }));
    dispatch(updateTask({ id: pending.secondId, updates: { parallel: true } }));
    dispatch(clearPendingConflict());
  };

  const changeTime = () => {
    dispatch(clearPendingConflict());
    dispatch(openEditModal(pending.secondId));
  };

  return (
    <Dialog open onOpenChange={() => dispatch(clearPendingConflict())}>
      <DialogContent className="bg-surface border-border sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-text flex items-center gap-2">
            <Clock3 size={16} className="text-warning" />
            Saat çakışması
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-text-muted leading-relaxed">
          <span className="text-text font-medium">“{pending.firstTitle}”</span>{" "}
          ile{" "}
          <span className="text-text font-medium">“{pending.secondTitle}”</span>{" "}
          aynı saat aralığına denk geliyor. Bunları aynı anda mı yapacaksın?
        </p>

        <div className="flex flex-col gap-2 mt-1">
          <Button
            onClick={markTogether}
            className="w-full bg-primary text-white hover:bg-primary/90 gap-2"
          >
            <Users size={14} />
            Evet, aynı anda yapacağım
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={changeTime}
              className="flex-1 border-border text-text text-xs"
            >
              Saatini değiştir
            </Button>
            <Button
              variant="ghost"
              onClick={() => dispatch(clearPendingConflict())}
              className="flex-1 text-text-muted text-xs"
            >
              Şimdilik geç
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
