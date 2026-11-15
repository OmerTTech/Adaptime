import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  loadAccountabilityState,
  loadDailyLaunch,
  requestMentorCheck,
} from "@/store/slices/mentorSlice";
import { setActivePage } from "@/store/slices/uiSlice";
import { showCheckNotification } from "@/services/notifications";
import { playSound } from "@/services/sound";

/**
 * Hesap verebilirlik motoru (istemci tarafı).
 * - Giriş yapıldığında mentor state'ini yükler.
 * - 60 saniyede bir sunucudan bekleyen kontrolleri çeker.
 * - Yeni kontrol varsa (izin verildiyse) masaüstü bildirimi gösterir.
 * - İlk açılışta günlük "Daily Launch" kartını hazırlar.
 *
 * Not: Tarayıcı kapalıyken bildirim gönderilmez; sunucudaki kontrol
 * kayıtları saklanır ve uygulama açıldığında gösterilir.
 */
export function useAccountabilityEngine(token: string | null) {
  const dispatch = useAppDispatch();
  const pending = useAppSelector((s) => s.mentor.pending);
  const dailyLaunch = useAppSelector((s) => s.mentor.dailyLaunch);
  const launchRequested = useRef(false);
  const lastSoundCheckId = useRef<string | null>(null);

  useEffect(() => {
    if (!token) return;
    dispatch(loadAccountabilityState(token));
    const interval = setInterval(() => {
      dispatch(loadAccountabilityState(token));
    }, 60_000);
    return () => clearInterval(interval);
  }, [token, dispatch]);

  // Günlük launch: günde bir kez, sessizce (sunucu tarihi baz alır).
  useEffect(() => {
    if (!token || dailyLaunch || launchRequested.current) return;
    launchRequested.current = true;
    dispatch(loadDailyLaunch(token))
      .unwrap()
      .catch(() => {
        launchRequested.current = false;
      });
  }, [token, dailyLaunch, dispatch]);

  // Yeni bekleyen kontrolü bildirim + ses olarak göster.
  useEffect(() => {
    if (!token || pending.length === 0) return;
    const latest = pending[0];
    if (lastSoundCheckId.current !== latest._id) {
      lastSoundCheckId.current = latest._id;
      playSound("mentorCheck");
    }
    showCheckNotification(latest, () => dispatch(setActivePage("mentor")));
  }, [pending, token, dispatch]);

  return {
    pendingCheck: pending[0] ?? null,
    pendingCount: pending.length,
    refresh: () => {
      if (token) dispatch(loadAccountabilityState(token));
    },
    requestCheck: () => {
      if (token) dispatch(requestMentorCheck(token));
    },
  };
}
