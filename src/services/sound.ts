/**
 * Ses sistemi.
 * Hazır "sevilen" sesler Web Audio ile sentezlenir (dosya yok, gecikme yok).
 * Kullanıcı kendi ses dosyasını da yükleyebilir (localStorage'da data URL).
 *
 * Tamamen istemci tarafıdır; sunucuya ses gitmez.
 */

export type SoundId =
  | "none"
  | "chime"
  | "soft"
  | "bell"
  | "digital"
  | "success"
  | "alert"
  | "marimba"
  | "custom";

export type SoundEvent =
  | "mentorCheck"
  | "taskComplete"
  | "focusStart"
  | "focusEnd"
  | "snooze"
  | "error";

interface Tone {
  freq: number;
  duration: number;
  delay?: number;
  type?: OscillatorType;
  gain?: number;
}

export const SOUND_OPTIONS: { id: SoundId; label: string; description: string }[] = [
  { id: "chime", label: "Chime", description: "Yumuşak üç notalı çan" },
  { id: "soft", label: "Soft", description: "Kısa, sakin tek nota" },
  { id: "bell", label: "Bell", description: "Berrak çan sesi" },
  { id: "digital", label: "Digital", description: "Keskin iki bip" },
  { id: "success", label: "Success", description: "Yükselen başarı motifi" },
  { id: "alert", label: "Alert", description: "Dikkat çeken kısa uyarı" },
  { id: "marimba", label: "Marimba", description: "Ahşap, sıcak tonlar" },
  { id: "custom", label: "Özel ses", description: "Kendi yüklediğin dosya" },
  { id: "none", label: "Sessiz", description: "Bu olayda ses çıkarma" },
];

const PRESETS: Record<Exclude<SoundId, "none" | "custom">, Tone[]> = {
  chime: [
    { freq: 880, duration: 0.22, type: "sine" },
    { freq: 1174.66, duration: 0.24, delay: 0.16, type: "sine" },
    { freq: 1567.98, duration: 0.42, delay: 0.34, type: "sine", gain: 0.85 },
  ],
  soft: [{ freq: 528, duration: 0.28, type: "triangle", gain: 0.8 }],
  bell: [
    { freq: 987.77, duration: 0.5, type: "sine", gain: 0.9 },
    { freq: 1975.53, duration: 0.5, type: "sine", gain: 0.25 },
  ],
  digital: [
    { freq: 1046.5, duration: 0.09, type: "square", gain: 0.4 },
    { freq: 1318.51, duration: 0.11, delay: 0.11, type: "square", gain: 0.4 },
  ],
  success: [
    { freq: 659.25, duration: 0.14, type: "triangle" },
    { freq: 783.99, duration: 0.14, delay: 0.12, type: "triangle" },
    { freq: 1046.5, duration: 0.3, delay: 0.24, type: "triangle" },
  ],
  alert: [
    { freq: 392, duration: 0.16, type: "sawtooth", gain: 0.35 },
    { freq: 392, duration: 0.16, delay: 0.22, type: "sawtooth", gain: 0.35 },
  ],
  marimba: [
    { freq: 523.25, duration: 0.2, type: "sine", gain: 0.9 },
    { freq: 659.25, duration: 0.22, delay: 0.14, type: "sine", gain: 0.8 },
    { freq: 783.99, duration: 0.34, delay: 0.28, type: "sine", gain: 0.7 },
  ],
};

export interface SoundPrefs {
  enabled: boolean;
  volume: number;
  master: SoundId;
  events: Record<SoundEvent, SoundId | "default">;
  customDataUrl: string | null;
  customName: string | null;
}

const STORAGE_KEY = "adaptime-sound-prefs-v1";

const DEFAULT_PREFS: SoundPrefs = {
  enabled: true,
  volume: 0.5,
  master: "chime",
  events: {
    mentorCheck: "default",
    taskComplete: "success",
    focusStart: "soft",
    focusEnd: "bell",
    snooze: "soft",
    error: "alert",
  },
  customDataUrl: null,
  customName: null,
};

let prefs: SoundPrefs = load();

const listeners = new Set<(p: SoundPrefs) => void>();

function load(): SoundPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<SoundPrefs>;
    return {
      ...DEFAULT_PREFS,
      ...parsed,
      events: { ...DEFAULT_PREFS.events, ...(parsed.events ?? {}) },
      volume:
        typeof parsed.volume === "number"
          ? Math.min(1, Math.max(0, parsed.volume))
          : DEFAULT_PREFS.volume,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function getSoundPrefs(): SoundPrefs {
  return prefs;
}

export function subscribeSoundPrefs(fn: (p: SoundPrefs) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function updateSoundPrefs(patch: Partial<SoundPrefs>): SoundPrefs {
  prefs = {
    ...prefs,
    ...patch,
    events: { ...prefs.events, ...(patch.events ?? {}) },
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* kota dolabilir: custom ses yüklenemezse sessizce devam */
  }
  listeners.forEach((fn) => fn(prefs));
  return prefs;
}

/* ------------------------------------------------------------------ */
/* Çalma                                                               */
/* ------------------------------------------------------------------ */

let audioCtx: AudioContext | null = null;
let customAudio: HTMLAudioElement | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

function playTones(tones: Tone[], volume: number): void {
  const ctx = getContext();
  if (!ctx || tones.length === 0) return;
  const start = ctx.currentTime + 0.01;

  tones.forEach((tone) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = tone.type ?? "sine";
    osc.frequency.value = tone.freq;

    const at = start + (tone.delay ?? 0);
    const peak = Math.max(0.0001, volume * (tone.gain ?? 1) * 0.28);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + tone.duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + tone.duration + 0.05);
  });
}

export function playSoundId(id: SoundId, volumeOverride?: number): void {
  if (id === "none") return;
  const volume = volumeOverride ?? prefs.volume;

  if (id === "custom") {
    if (!prefs.customDataUrl) return;
    try {
      if (!customAudio || customAudio.src !== prefs.customDataUrl) {
        customAudio = new Audio(prefs.customDataUrl);
      }
      customAudio.volume = Math.min(1, Math.max(0, volume));
      customAudio.currentTime = 0;
      void customAudio.play().catch(() => {});
    } catch {
      /* tarayıcı autoplay engeli */
    }
    return;
  }

  playTones(PRESETS[id], volume);
}

export function resolveSound(event: SoundEvent): SoundId {
  const choice = prefs.events[event] ?? "default";
  return choice === "default" ? prefs.master : choice;
}

/** Olay sesi çalar (kapalıysa hiçbir şey yapmaz). */
export function playSound(event: SoundEvent): void {
  if (!prefs.enabled) return;
  playSoundId(resolveSound(event));
}

export function resetSoundPrefs(): SoundPrefs {
  prefs = { ...DEFAULT_PREFS, events: { ...DEFAULT_PREFS.events } };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* yoksay */
  }
  listeners.forEach((fn) => fn(prefs));
  return prefs;
}
