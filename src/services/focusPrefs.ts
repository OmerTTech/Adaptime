const AUTO_PAUSE_KEY = "adaptime-focus-auto-pause";
const MUTE_KEY = "adaptime-focus-mute";

export interface FocusPrefs {
  /** Sekme arka plana geçince odak sayacını duraklat. */
  autoPause: boolean;
  /** Odak çalışırken uygulama içi bildirimleri gösterme. */
  mute: boolean;
}

function read(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function readFocusPrefs(): FocusPrefs {
  return { autoPause: read(AUTO_PAUSE_KEY), mute: read(MUTE_KEY) };
}

export function writeFocusPrefs(prefs: FocusPrefs): void {
  try {
    localStorage.setItem(AUTO_PAUSE_KEY, prefs.autoPause ? "1" : "0");
    localStorage.setItem(MUTE_KEY, prefs.mute ? "1" : "0");
  } catch {
    /* özel mod */
  }
  window.dispatchEvent(new CustomEvent("adaptime:focus-prefs"));
}
