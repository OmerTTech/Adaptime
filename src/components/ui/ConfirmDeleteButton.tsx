import { useEffect, useRef, useState, type ReactNode } from "react";
import { CircleHelp, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConfirmDeleteButtonProps {
  onConfirm: () => void;
  /** Buton ipucu metni */
  title?: string;
  /** Boştaki (silmeye hazır olmayan) görünüm sınıfları */
  className?: string;
  /** İlk dokunuştan sonraki "onay bekliyor" görünümü */
  armedClassName?: string;
  /** İkon boyutu */
  size?: number;
  /** Boşta gösterilecek ikon (varsayılan: çöp kutusu) */
  icon?: ReactNode;
  /** Onay penceresinin süresi (ms) */
  timeout?: number;
}

/**
 * İki dokunuşlu silme düğmesi.
 * İlk dokunuş düğmeyi kırmızı onay moduna alır, ikinci dokunuş siler.
 * `timeout` süresi içinde ikinci dokunuş gelmezse kendiliğinden iptal olur.
 */
export default function ConfirmDeleteButton({
  onConfirm,
  title = "Sil",
  className,
  armedClassName,
  size = 16,
  icon,
  timeout = 3000,
}: ConfirmDeleteButtonProps) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const handleClick = () => {
    if (timer.current) clearTimeout(timer.current);
    if (!armed) {
      setArmed(true);
      timer.current = setTimeout(() => setArmed(false), timeout);
      return;
    }
    setArmed(false);
    onConfirm();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        className,
        armed &&
          (armedClassName ??
            "bg-danger text-white ring-2 ring-danger/60 scale-105 animate-pulse"),
      )}
      title={armed ? "Silmeyi onaylamak için tekrar bas" : title}
      aria-label={armed ? "Silmeyi onayla" : title}
      aria-pressed={armed}
    >
      {armed ? (
        <CircleHelp size={size} strokeWidth={2.6} />
      ) : (
        icon ?? <Trash2 size={size} />
      )}
    </button>
  );
}
