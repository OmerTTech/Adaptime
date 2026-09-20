# CHANGELOG

Bu projede yapılan değişikliklerin geçmişi. Biçim [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) esas alınır.

## [1.0.0] - 2026-09-20

### Eklendi
- **Google ile giriş (Firebase Auth)**: `firebase` SDK ile frontend'te `signInWithPopup`; backend'te ID token, Firebase projesinin public key'leriyle doğrulanır (`jsonwebtoken`, service account gerektirmez). `VITE_FIREBASE_*` / `FIREBASE_PROJECT_ID` tanımlıysa aktif.
- **Hızlı Görev (plansız)**: süre vermeden görev ekleme; görevler "Yapılacaklar" listesinde bekler, sonradan zaman verilebilir.
- **Görev düzenleme geliştirmeleri**: "Şimdi Zaman Ver", "Planı Kaldır", tahmini süre girişi.
- **Gerçek streak hesaplama**: sunucuda ardışık tamamlanan gün serisi (`GET /api/routines/streak`).
- **İstatistik sayfası**: bugün tamamlananlar, son 7/30 gün bar grafiği, odak süresi, gün geçmişi.
- **Ayarlar sayfası**: hesap, tema, tüm verileri silme (yerel + sunucu), çıkış.
- **Günlük rutin geçmişi**: `loadRoutineHistory` + `GET /api/routines/history`.
- **`isScheduled` type guard**: plansız görevlerin güvenle ayırt edilmesi (tip düzeyinde).

### Değişti
- Routine şemasına `startedAt`, `pausedAt`, `estimatedMinutes` (opsiyonel) eklendi; `TaskBlock.startTime/endTime/originalDuration` opsiyonel oldu.
- Sahte streak artışı kaldırıldı; streak artık sunucudan gerçek veriyle geliyor.
- Timeline, saat ve zaman motorları plansız görevleri yok sayacak şekilde filtreliyor.
- `saveRoutineToBackend` artık `pausedAt` bilgisini silmeden kaydediyor.

### Güvenlik
- `helmet` aktif; CORS beyaz liste (`CORS_ORIGINS` env) — izin verilmeyen origin 403 ile reddedilir.
- Rate limit: genel API, auth ve AI uçları için ayrı limitler (`express-rate-limit`).
- AI rutin önerisi ucu (`/api/generate-routine`) artık JWT korumalı.
- `JWT_SECRET` üretimde zorunlu; geliştirme fallback'i devredışı bırakıldı.
- Express JSON body limiti (1mb) ve global hata/404 işleyiciler.

### Düzeltildi
- Routları öldüren sıralama hatası: `/:date` artık `/streak` ve `/history`'den sonra tanımlı.
- `EarlyFinishModal`'da render sırasında dispatch çağrısı `useEffect`'e taşındı.
- `FlowStateModal`'da zaman ekleme butonlarının tıklama işleyicisi.
- Negatif süre hesabı önizlemelerde matematiksel koruma ile ele alındı.
- Route parametresi için tarih biçimi doğrulaması (`parseDate`).

### Yeni Kurulum Gereksinimleri
- `.env`'e `FIREBASE_PROJECT_ID`, `VITE_FIREBASE_*` değerleri ve `CORS_ORIGINS` eklenebilir (opsiyonel — `.env.example`'a işlendi).
- Google Cloud OAuth Client ID yerine Firebase Authentication kullanılır (upgrade / billing gerektirmez).

## [0.1.0] - Demo seviyesi

- Analog saat görünümü, görev ekleme/düzenleme, zaman çizelgesi, odak zamanlayıcı.
- Flow State, Erken Bitiş, Mola modalları (ilk sürüm).
- Hızlı Deneme (demo) girişi, yerel veri (localStorage + Redux Persist).
- AI rutin önerisi (Gemini, anahtar yoksa örnek veriye düşer).

[1.0.0]: #unreleased-comparison
[0.1.0]: #unreleased-comparison