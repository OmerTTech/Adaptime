import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { saveMentorSettings } from "@/store/slices/mentorSlice";
import type { MentorSettings, MentorTone } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

const TONES: { value: MentorTone; label: string }[] = [
  { value: "direct", label: "Net" },
  { value: "balanced", label: "Dengeli" },
  { value: "supportive", label: "Destekleyici" },
];

export default function MentorQuickSettings({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const { token } = useAuth();
  const dispatch = useAppDispatch();
  const settings = useAppSelector((s) => s.mentor.settings);
  const saving = useAppSelector((s) => s.mentor.savingSettings);
  const [sentences, setSentences] = useState(settings?.maxSentences ?? 8);

  useEffect(() => {
    if (settings?.maxSentences) setSentences(settings.maxSentences);
  }, [settings?.maxSentences]);

  const patch = (p: Partial<MentorSettings>) => {
    if (!token) return;
    dispatch(saveMentorSettings({ token, patch: p }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface border-border sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-text">Mentor ayarları</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-text-muted">Kontroller</span>
            <button
              type="button"
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

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-text-muted">AI (Gemini)</span>
            <button
              type="button"
              onClick={() => patch({ aiEnabled: !(settings?.aiEnabled ?? true) })}
              disabled={!settings || !token}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${
                settings?.aiEnabled ?? true
                  ? "bg-primary/10 border-primary/40 text-primary"
                  : "bg-background border-border text-text-muted"
              }`}
            >
              {settings?.aiEnabled ?? true ? "Açık" : "Kapalı"}
            </button>
          </div>

          <div>
            <p className="text-xs text-text-muted mb-1.5">Mentor tonu</p>
            <div className="flex flex-wrap gap-1.5">
              {TONES.map((tone) => (
                <button
                  key={tone.value}
                  type="button"
                  onClick={() => patch({ tone: tone.value })}
                  disabled={!settings || !token}
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

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-text-muted">
                En fazla cümle sayısı
              </span>
              <span className="text-xs font-semibold text-text tabular-nums">
                {sentences}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={20}
              step={1}
              value={sentences}
              onChange={(e) => setSentences(Number(e.target.value))}
              onPointerUp={() => patch({ maxSentences: sentences })}
              onKeyUp={() => patch({ maxSentences: sentences })}
              disabled={!settings || !token}
              className="w-full accent-primary"
            />
            <p className="text-[10px] text-text-muted/70 mt-1">
              Mentor yanıtı en az 1, en fazla {sentences} cümle yazar.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            {saving && <Loader2 size={13} className="animate-spin text-text-muted" />}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary-hover transition-colors"
            >
              Tamam
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
