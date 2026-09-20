# Adaptime — Akıllı Günlük Planlama

Saat biçiminde görevlerin olduğu, "akış" ve "mola" duygusunu bir analog saat üzerinde gösteren, kişiye özel gün planı uygulaması. Kurtarıcı (relief) durumlar için öneriler sunar: akışa girilince süre ekleme, erken bitirme, molada dengeli yeniden planlama.

![stack](https://img.shields.io/badge/stack-React%20%2B%20Vite%20%2B%20TypeScript%20%2B%20Express%20%2B%20MongoDB-blue)

---

## Özellikler

### Ana Planlama
- Görevleri saat dilimleriyle (örn. 09:00 – 11:00) planla; her görev analog saat üzerinde renkli bir yay olarak görünür.
- **Hızlı Görev (plansız):** süre vermeden bekleme listesine ekle ("Yapılacaklar"). Daha sonra tek tıkla bir zaman akışına bağla.
- Gün bitiş saati otomatik hesaplanır; sürüklemeden, butonlarla tüm düzeni kaydırabilirsin.

### Akış & Mola Duygusu
- **Flow State:** görev sırasında akışa girersen +15/30/45/60 dakika ekle. Tüm günü kaydır (shift) ya da sonraki görevden düş (eatNext).
- **Erken Bitiş:** görevi erken bitirdiysen kalan süreyi dinlenmeye ekle ya da sonraki görevlere çekerek günü erken bitir.
- **Mola (Pause):** görevdeyken verilen molanın etkisi önizlenir; tümünü kaydır / kes / kalan görevlere dağıt seçeneklerinden birini seç.
- Tüm değişiklikler uygulanmadan önce **Onay penceresinde** önizlenir.

### İstatistik & Takip
- Gerçek günlük **streak** (ardışık tamamlanan günler — sunucuda hesaplanır).
- Bugün tamamlanan görevler, son 7 / 30 gün bar grafiği, odak süresi, tarih geçmişi.

## Giriş Yöntemleri
- **Google ile giriş** (Firebase Auth): Firebase yapılandırması (`VITE_FIREBASE_*`) tanımlıysa aktif. Sunucu ID token'ı Firebase projesinin public key'leriyle doğrular (service account gerektirmez).
- **Hızlı Deneme (demo):** kimlik bilgisi gerektirmez; veriler tarayıcıda yerel tutulur.

---

## Hızlı Başlangıç

Gereksinimler: Node.js 20+ , MongoDB (opsiyonel — kurulu değilse offline modda çalışır).

```bash
npm install
```

`.env` dosyası oluştur (örnek: `.env.example`):

```env
# Server
MONGODB_URI=mongodb://localhost:27017/adaptime
JWT_SECRET=uzun-rastgele-bir-secret
# Firebase Auth (Google login) — Firebase console proje ID'si
FIREBASE_PROJECT_ID=<firebase-proje-id>
# CORS_ORIGINS=http://localhost:5173
CORS_ORIGINS=http://localhost:5173
# Gemini AI rutin önerisi (opsiyonel)
GEMINI_API_KEYS=[]
# Client
VITE_API_URL=http://localhost:3001
# Firebase web app config (Firebase console → Project settings → Web app)
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
```

Geliştirme modunda iki terminal:

```bash
# Terminal 1 — API (3001)
npm run dev:server

# Terminal 2 — Frontend (5173, /api proxy'li)
npm run dev
```

Üretim build'i:

```bash
npm run build     # typecheck (client+server) + vite build
npm start         # server'ı çalıştır
```

---

## Mimari

```
src/
├── components/
│   ├── clock/      Analog saat ve zaman izleme
│   ├── modals/     Flow / Erken Bitiş / Mola onay pencereleri
│   ├── routine/    Görev ekleme / düzenleme / AI önerisi
│   ├── timeline/   Günün saat çizelgesi + Yapılacaklar
│   └── timer/      Odak zamanlayıcı
├── engine/         Zaman hesapları: timeEngine, flowState, earlyFinish
├── pages/          Login, Today, Stats, Settings
├── services/       API istemcisi
├── store/          Redux Toolkit: routineSlice, uiSlice
└── types/          Paylaşılan tipler (isScheduled guard)
server/
├── routes/         auth (Firebase + demo), routines, ai
├── models/         User, Routine şemaları
└── middleware/     JWT auth
```

- Frontend: React 19 + Vite 8 + Redux Toolkit + Tailwind v4
- Backend: Express + Mongoose, `server/` klasöründe ESM TypeScript
- Dev sırasında Vite `/api` isteğini `http://localhost:3001`'e proxy yapar.

---

## Dokümantasyon
- `LEARN.md` — uygulamayı ve mimariyi derinlemesine anlatan rehber
- `CHANGELOG.md` — sürüm geçmişi
- `VERSION` — güncel sürüm