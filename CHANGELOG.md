# CHANGELOG

Bu projede yapılan değişikliklerin geçmişi. Biçim [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) esas alınır.

## [1.2.0] - 2026-11-14

### Eklendi
- **Günlük (Diary)**: ruh hali/enerji, neler oldu, ilerleme, öğrendiklerim, engeller, sonraki adımlar, etiketler; tarih gezinme, geçmiş kayıtlar, silme.
- **AI ile günlükten görev çıkarma**: en fazla 6 öneri (başlık, gerekçe, öncelik, süre, kategori), pop-up'ta seçim yapıp yapılacaklara ekleme; AI yoksa satır bazlı yerel çıkarım.
- **Günlük mentor yorumu**: AI destekli 2-3 cümlelik değerlendirme + yarın için tek adım.
- **Mentor bağlamı günlüğü okur**: saatlik kontrol mesajları son günlük notunu dikkate alır.
- **Ses sistemi**: 7 sentezlenmiş ses (Chime, Soft, Bell, Digital, Success, Alert, Marimba), olay bazlı seçim (mentor kontrolü, görev tamamlandı, odak başlangıç/bitiş, erteleme, hata), ses seviyesi, kendi ses dosyasını yükleme (max 1.5 MB, cihazda saklanır), her sesi dinleme.
- **Profil fotoğrafı**: bozuk Firebase avatar URL'lerinde kırık resim ikonu yerine baş harf fallback'i; kullanıcı kendi fotoğrafını yükleyebilir/kaldırabilir.
- **Özel renk seçici**: görev ekleme/düzenleme modallarında hazır renklerin sağında native color picker.
- **Veri dışa aktarma**: görevler, geçmiş, günlük ve mentor ayarlarını JSON olarak indirme.

### Değişti
- **Aydınlık tema kontrastı** artırıldı (kenarlıklar, ikincil metin, yüzeyler).
- Üst menüye **Günlük** eklendi (mobilde 6 sekme).
- Dashboard'a günlük kartı eklendi.

## [1.1.0] - 2026-11-14

### Eklendi
- **AI Accountability System**: saatlik hesap verebilirlik kontrolleri, mentor mesajları, aktivite kaydı ve planlanan/gerçekleşen karşılaştırması.
- **Gemini entegrasyonu (free tier)**: `GEMINI_MODEL` (varsayılan `gemini-3.5-flash-lite`), çoklu anahtar rotasyonu (`GEMINI_API_KEYS` veya `GEMINI_API_KEY_1..N`), 429/RESOURCE_EXHAUSTED ayrımı, anahtar başına cooldown ve tüm anahtarlar dolduğunda global duraklama.
- **AI yoksa yerel fallback**: tüm mentor mesajları kural tabanlı üretilebilir; görev, bildirim ve odak sistemi AI'ya bağımlı değil.
- **Saatlik kontrol motoru (sunucu)**: `Asia/Baku` varsayılan, 11:00–23:00 arası kontrol, ayarlanabilir saatler, idempotent (`userId + dedupeKey` unique), dinlenmede susma, snooze/dinlenme sonrası takip kontrolü.
- **Etkileşimli mentor ekranı**: Göreve başla / Devam ediyorum / Tamamladım / Dinleniyorum / Başka işle meşgulüm / 15-30 dk ertele / Engelle karşılaştım + serbest metin yanıtı.
- **Görev onayı**: görev yalnızca kullanıcı açıkça "Tamamladım" dediğinde `completed` olur; sunucu ve istemci aynı durumu yazar.
- **Görev modeli genişletildi**: `priority`, `category`, `deadline`, `description`, `progress`, `completedAt`, `firstAction`, `notes`, `delayCount` (eski kayıtlar bozulmadan).
- **İlk 5 dakika**: görev için 3 küçük başlangıç adımı (AI veya kural tabanlı), ilk adım göreve kaydedilebilir.
- **Günlük başlangıç**: günün en önemli görevi + ilk adım + tamamlanma ölçütü (günde bir kez üretilir ve saklanır).
- **Odak (Pomodoro) sayfası**: 25/5, 25/15, 50/10 ve özel süreler, görev ilişkisi, gerçek zaman damgasına dayalı sayaç, oturum kaydı.
- **Analitik**: geciken/ertelenen görevler, deadline başarı oranı, odak/dinlenme/başka iş süreleri, kontrol yanıtlama oranı, planlanan vs bildirilen süre.
- **Dashboard**: günün önceliği, aktif görev, sonraki deadline, sonraki kontrol, günlük ilerleme, plan çakışması uyarısı ve mentor kartı.
- **Bildirimler**: izin akışı + uygulama açıkken masaüstü bildirimi (aynı kontrol için tekrar yok).

### Değişti
- Üst menü: Bugün / Mentor / Odak / Analitik / Ayarlar (mobilde 5 sekmeli alt bar).
- `GEMINI_API_KEYS` boşken AI ucu hata vermek yerine yerel plana düşer.
- `/api/generate-routine` ortak Gemini servisini kullanır (anahtar/log güvenliği).

### Notlar
- Tarayıcı kapalıyken bildirim **yok**: bu sürümde Web Push (VAPID) altyapısı kurulmadı; sunucu kontrolleri saklar, uygulama açılınca gösterilir.
- Sunucu saatlik kontrol üretimi için çalışır durumda olmalıdır.

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