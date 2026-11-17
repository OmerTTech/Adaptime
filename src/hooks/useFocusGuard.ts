import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { reclaimFocusGap } from "@/store/slices/routineSlice";
import { setFocusReclaim } from "@/store/slices/uiSlice";
import { pushApi } from "@/services/api";
import { getTodayString } from "@/utils";
import type { TaskBlock } from "@/types";

/**
 * Odak sayacı nöbetçisi.
 *
 * Sorun: kullanıcı odak sayacını açık bırakıp uygulamayı kapatıyor, geri
 * döndüğünde görev hâlâ "çalışıyor" görünüyor ve aradaki saatler odak süresi
 * olarak sayılıyor.
 *
 * Çözüm iki katmanlı:
 * 1. Sekme açıkken her 30 saniyede bir "son görülme" zamanı yazılır. Yeni
 *    oturum açıldığında arada 15 dakikadan fazla boşluk varsa (uygulama
 *    kapalıydı) bu boşluk odak sayılmaz, görev duraklatılır ve kullanıcıya
 *    "bu süre sayılsın mı?" uyarısı gösterilir.
 * 2. Sekme görünürken sunucuya "buradayım" sinyali gider; süre bittiğinde
 *    uygulama içi alarm çalıyorsa telefona ayrıca bildirim gönderilmez.
 *    Uygulama kapalıysa sunucu süre bitiminde arka plan bildirimi yollar.
 */

const BEAT_KEY = "adaptime-focus-heartbeat";
/** Bu süreden uzun boşluk "uygulama kapalıydı" sayılır. */
const ABANDON_MS = 15 * 60_000;
/** Sunucuya görünürlük sinyali aralığı. */
const PING_MS = 60_000;
/** Yerel "son görülme" yazma aralığı. */
const BEAT_MS = 30_000;
const MAX_GAP_MS = 48 * 60 * 60_000;

interface FocusBeat {
  at: number;
  date: string;
  ids: string[];
}

function readBeat(): FocusBeat | null {
  try {
    const raw = localStorage.getItem(BEAT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FocusBeat>;
    if (typeof parsed.at !== "number" || typeof parsed.date !== "string") {
      return null;
    }
    if (!Array.isArray(parsed.ids)) return null;
    return {
      at: parsed.at,
      date: parsed.date,
      ids: parsed.ids.filter((id): id is string => typeof id === "string"),
    };
  } catch {
    return null;
  }
}

function writeBeat(beat: FocusBeat | null) {
  try {
    if (beat) localStorage.setItem(BEAT_KEY, JSON.stringify(beat));
    else localStorage.removeItem(BEAT_KEY);
  } catch {
    /* özel mod: sessizce yoksay */
  }
}

export function useFocusGuard(token: string | null) {
  const dispatch = useAppDispatch();
  const tasks = useAppSelector(
    (state) => state.routine.currentRoutine?.tasks ?? [],
  );
  const routineDate = useAppSelector(
    (state) => state.routine.currentRoutine?.date ?? "",
  );

  const activeKey = tasks
    .filter((task) => task.status === "active")
    .map((task) => task.id)
    .sort()
    .join("|");

  const initialTasks = useRef(tasks);
  const checked = useRef(false);
  const lastPing = useRef(0);

  // 1) Yeni oturum açıldı: önceki oturum kapanmadan önceki boşluğu hesapla.
  useEffect(() => {
    if (checked.current) return;
    checked.current = true;

    const beat = readBeat();
    if (!beat) return;

    const now = Date.now();
    const gap = now - beat.at;
    const today = getTodayString();
    const stale =
      beat.date !== today || gap < ABANDON_MS || gap > MAX_GAP_MS;

    if (stale) {
      if (gap > ABANDON_MS) writeBeat(null);
      return;
    }

    const entries = beat.ids
      .map((id) => initialTasks.current.find((task) => task.id === id))
      .filter(
        (task): task is TaskBlock => Boolean(task) && task!.status === "active",
      )
      .map((task) => ({ id: task.id, title: task.title, gapMs: gap }));

    writeBeat(null);
    if (entries.length === 0) return;

    entries.forEach((entry) =>
      dispatch(reclaimFocusGap({ id: entry.id, lastSeenAt: beat.at })),
    );
    dispatch(setFocusReclaim({ entries }));
  }, [dispatch]);

  // 2) Sekme açıkken "son görülme" yaz ve sunucuya görünürlük sinyali gönder.
  useEffect(() => {
    const ids = activeKey ? activeKey.split("|") : [];
    if (!token || ids.length === 0) {
      writeBeat(null);
      return;
    }

    const date = routineDate || getTodayString();
    const beat = () => {
      writeBeat({ at: Date.now(), date, ids });
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastPing.current >= PING_MS
      ) {
        lastPing.current = Date.now();
        void pushApi.focusPing(token).catch(() => undefined);
      }
    };

    const onLeave = () => writeBeat({ at: Date.now(), date, ids });

    beat();
    const interval = window.setInterval(beat, BEAT_MS);
    document.addEventListener("visibilitychange", onLeave);
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("beforeunload", onLeave);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onLeave);
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [token, activeKey, routineDate]);
}
