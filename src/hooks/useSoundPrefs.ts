import { useEffect, useState } from "react";
import {
  getSoundPrefs,
  subscribeSoundPrefs,
  updateSoundPrefs,
  type SoundPrefs,
} from "@/services/sound";

export function useSoundPrefs() {
  const [prefs, setPrefs] = useState<SoundPrefs>(getSoundPrefs);

  useEffect(() => {
    const unsubscribe = subscribeSoundPrefs(setPrefs);
    setPrefs(getSoundPrefs());
    return unsubscribe;
  }, []);

  return { prefs, update: updateSoundPrefs };
}
