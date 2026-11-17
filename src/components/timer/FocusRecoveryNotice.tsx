import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { clearFocusReclaim } from "@/store/slices/uiSlice";
import { undoReclaimFocus } from "@/store/slices/routineSlice";
import { AlarmClock, X } from "lucide-react";

function humanGap(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} dk`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours} sa ${rest} dk` : `${hours} sa`;
}

/**
 * Uygulama kapalıyken açık kalan odak süresi için kısa uyarı.
 * Süre otomatik olarak sayılmaz; kullanıcı isterse tek tıkla geri alır.
 */
export default function FocusRecoveryNotice() {
  const dispatch = useAppDispatch();
  const notice = useAppSelector((state) => state.ui.focusReclaim);
  const tasks = useAppSelector(
    (state) => state.routine.currentRoutine?.tasks ?? [],
  );

  if (!notice || notice.entries.length === 0) return null;

  // Görev bu arada silindiyse uyarı anlamsız kalır.
  const live = notice.entries.filter((entry) =>
    tasks.some((task) => task.id === entry.id),
  );
  if (live.length === 0) return null;

  const totalGap = live.reduce((acc, entry) => acc + entry.gapMs, 0);
  const titles = live.map((entry) => `“${entry.title}”`).join(", ");

  const handleUndo = () => {
    live.forEach((entry) =>
      dispatch(undoReclaimFocus({ id: entry.id, gapMs: entry.gapMs })),
    );
    dispatch(clearFocusReclaim());
  };

  return (
    <div className="w-full max-w-md mx-auto mt-3 rounded-xl border border-warning/40 bg-warning/10 p-3 text-left">
      <div className="flex items-start gap-2">
        <AlarmClock size={15} className="text-warning mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-text">
            Odak sayacı açık kalmış
          </p>
          <p className="text-[11px] text-text-muted mt-0.5 leading-relaxed">
            Uygulama kapalıyken{" "}
            <strong className="text-text">{humanGap(totalGap)}</strong> geçti. Bu
            süre {titles} {live.length === 1 ? "görevine" : "görevlerine"} odak
            olarak yazılmadı ve görev
            {live.length === 1 ? "" : "ler"} duraklatıldı.
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <button
              onClick={handleUndo}
              className="px-2.5 py-1 rounded-lg border border-border bg-surface text-[11px] text-text-muted hover:text-text transition-colors"
              title="Uygulama kapalıyken de çalışmaya devam ettiysen bu süreyi odak süresine ekle"
            >
              Kapalıyken de çalıştım, süreyi ekle
            </button>
            <button
              onClick={() => dispatch(clearFocusReclaim())}
              className="px-2.5 py-1 rounded-lg bg-warning/20 text-[11px] font-medium text-warning hover:bg-warning/30 transition-colors"
              title="Gerçekten ara verdiysen bu süre odak sayılmadan kalsın"
            >
              Çalışmadım, sayılmasın
            </button>
          </div>
        </div>
        <button
          onClick={() => dispatch(clearFocusReclaim())}
          className="p-1 -m-1 rounded text-text-muted hover:text-text transition-colors"
          title="Kapat"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
