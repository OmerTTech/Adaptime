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

### AI Hesap Verebilirlik (v1.1)
- **AI Mentor:** saatlik kontroller, kişiselleştirilmiş mesajlar, erteleme/dinlenme takibi, "ilk 5 dakika" adımları ve günlük başlangıç kartı.
- **Aktivite takibi:** her kontrol cevabı (başladım, devam ediyorum, tamamladım, dinleniyorum, başka iş, engel, ertele) ve serbest metin yanıtı kaydedilir.
- **Planlanan vs gerçekleşen:** dashboard ve analitikte odak/dinlenme/başka iş süreleri yalnızca senin bildirdiğin verilerden hesaplanır.
- **Odak sayfası:** 25/5, 25/15, 50/10 ve özel Pomodoro; görevle ilişkilendirme; oturum geçmişi.
- **Görev alanları:** öncelik (kritik/yüksek/orta/düşük), kategori, deadline, açıklama, ertelenme sayısı, tamamlanma zamanı.
- **Çakışma uyarısı:** aynı saat aralığına denk gelen açık görevler dashboard'da uyarılır.

Bildirim gerçekliği: Tarayıcı **açıkken** masaüstü bildirimi gösterilir. Tarayıcı kapalıyken bildirim için Web Push (VAPID) altyapısı gerekir; bu sürümde yok. Sunucu saatlik kontrolleri veritabanına yazar, uygulamayı açtığında bekleyen kontroller görünür.

### Günlük (Diary)
- Her gün için ruh hali/enerji, "neler oldu", "neleri ilerlettim", "neler öğrendim", "nerede takıldım", "sonraki adımlar" ve etiketler.
- **AI ile görev çıkar**: günlükten en fazla 6 somut görev önerilir; pop-up'ta istediklerini seçip yapılacaklara eklersin (AI yoksa yerel satır çıkarımı).
- **Mentor yorumu**: günlüğe 2-3 cümlelik değerlendirme + yarın için tek adım.
- Mentor, son günlük notunu saatlik kontrol mesajlarında bağlam olarak kullanır.

### Sesler ve kişiselleştirme
- 7 hazır ses (Chime, Soft, Bell, Digital, Success, Alert, Marimba) + kendi ses dosyanı yükleme.
- Olay bazlı atama: mentor kontrolü, görev tamamlandı, odak başlangıcı/bitişi, erteleme, hata. Ses seviyesi ayarlanabilir, her ses dinlenebilir.
- Profil fotoğrafı yükleme; bozuk avatar URL'lerinde baş harfe düşer.
- Görev renklerinde hazır paletin yanında özel renk seçici.

## AI Kurulumu (Gemini, free tier)

API anahtarları **yalnızca sunucuda** kullanılır (`.env`). İki biçim desteklenir:

```env
# 1) JSON array
GEMINI_API_KEYS=["AIza...key1","AIza...key2"]

# 2) Numaralı değişkenler
GEMINI_API_KEY_1=AIza...key1
GEMINI_API_KEY_2=AIza...key2
GEMINI_API_KEY_3=AIza...key3
GEMINI_API_KEY_4=AIza...key4

# Model (tek yerden değişir, ücretsiz katman)
GEMINI_MODEL=gemini-3.5-flash-lite
# Model bulunamazsa denenecek ücretsiz yedek (kota dolduğunda kullanılmaz)
GEMINI_FALLBACK_MODELS=gemini-2.5-flash-lite
```

- 429 / `RESOURCE_EXHAUSTED` alan anahtar 60 sn devre dışı kalır, sıradaki denenir.
- Tüm anahtarlar kotadaysa AI 5 dk durur ve mentor **kural tabanlı** mesajlara düşer (uygulama çalışmaya devam eder).
- Anahtar değerleri loglanmaz, frontend'e gönderilmez; `/api/accountability/ai-status` yalnızca sayı/durum döner.

Saatlik kontrol programı Ayarlar → "Saatlik hesap verebilirlik" bölümünden değiştirilir (varsayılan 11:00–23:00, `Asia/Baku`). Kontroller sunucudaki zamanlayıcı tarafından üretilir; sunucu kapalıysa o saat için kontrol oluşmaz.

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

## Günlük API'si

| Uç | Açıklama |
|---|---|
| `GET /api/diary?limit=30` | Günlük kayıtları (tarihe göre azalan) |
| `GET/PUT/DELETE /api/diary/:date` | Tek gün kaydı (upsert / sil) |
| `POST /api/diary/:date/suggest-tasks` | Günlükten AI görev önerileri (max 6) |
| `POST /api/diary/:date/reflect` | AI mentor yorumu |

## Hesap Verebilirlik API'si

| Uç | Açıklama |
|---|---|
| `GET /api/accountability/state` | Ayarlar, bekleyen kontroller, bugünün kontrolleri/aktiviteleri, özet, AI durumu |
| `PUT /api/accountability/settings` | Saatler, saat dilimi, ton, erteleme süresi, AI aç/kapa |
| `POST /api/accountability/check` | Manuel kontrol (5 dk'da bir) |
| `POST /api/accountability/respond` | Kontrol cevabı + görev durumu + takip planı |
| `POST /api/accountability/activity` | Serbest aktivite kaydı |
| `GET /api/accountability/daily-launch` | Günün görevi + ilk adım + ölçüt (günde bir) |
| `POST /api/accountability/first-steps` | Görev için ilk 5 dakika adımları |
| `POST /api/accountability/focus-sessions` | Odak/mola oturumu kaydı |
| `GET /api/accountability/ai-status` | Model + anahtar durumu (değer yok) |

Mongo koleksiyonları: `mentorsettings`, `mentorchecks`, `activitylogs`, `focussessions` (+ mevcut `routines`).

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