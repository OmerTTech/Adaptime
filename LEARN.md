# LEARN.md — Adaptime Rehberi

Bu doküman uygulamanın nasıl çalıştığını, veri akışını, yapılan tasarım kararlarını ve gelecekte geliştirme yapmak isteyenler için kritik noktaları detaylı anlatır.

---

## 1. Uygulama Fikri

Adaptime gününü saat dilimlerine bölüp planlayan kişinin, **planın gerçek hayata uymadığı** anlarda (gecikme, akış, erken bitirme) hızlı ve bilinçli kararlar vermesine yardımcı olur. Analog saat metaforu, günün tamamını tek ekranda "görebilmek" içindir; zamanın akışkanlığı hissi, planın da akışkan olduğunu hatırlatır.

## 2. Temel Kavramlar

### TaskBlock (görev)
Her görev aşağıdaki alanlara sahiptir:

| Alan | Anlamı |
|---|---|
| `id` | Benzersiz kimlik |
| `title` | Başlık |
| `startTime` / `endTime` | Planlanan başlangıç/bitiş (ms — **opsiyonel**) |
| `originalDuration` | Orijinal planlanan süre |
| `estimatedMinutes` | Plansız görevler için tahmini süre |
| `color` | Saat üzerindeki renk |
| `status` | `pending` \| `active` \| `paused` \| `completed` \| `skipped` |
| `startedAt` | Gerçek başlangıç anı |
| `pausedAt` / `pausedDuration` | Duraklatma bilgisi |
| `flowExtensions` | Kaç kez flow eklenmiş |

**Planlı vs Plansız görev:** `startTime` ve `endTime` tanımlıysa görev **planlı**'dır ve saat/timeline üzerinde yer alır. Tanımlı değilse **plansız**'dır; "Yapılacaklar" listesinde bekler.

Bu ayrımı type guard ile yaparız — `isScheduled(task)` TypeScript seviyesinde `ScheduledTask` (startTime/endTime zorunlu) tipine daraltır. Böylece `.filter(isScheduled)` sonrası özelliklere erişirken `undefined` kontrolüne gerek kalmaz.

```ts
// src/types/index.ts (özet)
export type ScheduledTask = TaskBlock & {
  startTime: number;
  endTime: number;
  originalDuration: number;
};

export function isScheduled(task: TaskBlock): task is ScheduledTask {
  return (
    typeof task.startTime === "number" &&
    typeof task.endTime === "number" &&
    task.endTime > task.startTime
  );
}
```

### DayRoutine (günlük rutin)
Bir güne ait: `id`, `date` (YYYY-MM-DD), `tasks`, `dayEndTime`, `streak`.

## 3. Veri Akışı

### Frontend → Backend
- `src/services/api.ts`: tüm HTTP çağrıları `apiFetch<T>` üzerinden gider. JWT `localStorage`'tan (`adaptime-token`) alınıp `Authorization: Bearer ...` başlığına konur.
- `AuthContext` token ve `/me` kullanıcı bilgisini sağlar.
- `routineSlice` (Redux Toolkit) günlük rutini yönetir: `loadTodayRoutine`, `loadRoutineHistory`, `saveRoutineToBackend` async thunk'ları; ekleme/silme/başlatma/güncelleme senkron reducer'ları.

### Backend
- `server/` ESM TypeScript, `tsx` ile çalıştırılır.
- **`/api/auth`** — Google OAuth (`google-auth-library` ile ID token doğrulama) + demo girişi + `/me`.
- **`/api/routines`** — CRUD, `/streak`, `/history` (route sırasına dikkat: catch-all `/:date` sonradır).
- **`/api/generate-routine`** — Gemini destekli AI rutin önerisi (JWT korumalı).
- Mongoose ile MongoDB; bağlantı yoksa **offline mod**: sunucu yine başlar, sağlık ucu `mongo: "disconnected"` döner.

## 4. Zaman Motorları (`src/engine/`)

Üç senaryo, üç motor:

1. **`timeEngine.ts` — Mola (pause):** `calculatePauseImpact` aktif görevi bulur, mola süresine göre **shift / cut / balance** modlarında etkiyi önizler.
   - `shift`: tüm görevler +mola kadar ileri.
   - `cut`: süre kesilir, plan değişmez.
   - `balance`: mola, aktif görevden sonraki görevlere eşit dağıtılır.
2. **`flowState.ts` — Flow:** +N dakika ekler; `shift` (tümünü kaydır) veya `eatNext` (sonraki görevden düş).
3. **`earlyFinish.ts` — Erken Bitiş:** kalan süre mesafesince **pullForward** (sonraki görevlere çek, gün erken biter) ya da **extendBreak** (dinlenmeye ekle).

Her motor bir `Impact` nesnesi döndürür ve `ImpactPreviewModal`, onay vermeden önce yeni zaman çizelgesini gösterir.

**Kritik kural:** Motorlar **planlı (`ScheduledTask`)** görevler üzerinde çalışır. Plansız görevler asla zaman hesaplarına dahil edilmez.

## 5. UI Bileşenleri

- **`OClock`** — SVG analog saat. Görevler açısal yaylar; renk kodlu. Plansız görevler saatte görünmez (uyarı sayacı gösterilir).
- **`TimelineView`** — Günün lineer zaman çizelgesi; başında **Yapılacaklar** paneli (plansız + tamamlanmamış).
- **`FocusTimer`** — Aktif görev için gerçek süre hesaplaması; `startedAt`, `pausedAt`, `pausedDuration` ile 100% doğru `workedMs`.
- **Modallar** — `PauseModal` (mola öncesi mod seçimi), `ImpactPreviewModal` (önizleme + onay), `FlowStateModal`, `EarlyFinishModal`. Hepsi `uiSlice` state'inden yönetilir.

## 6. İstatistik ve Streak

- **Streak** `GET /api/routines/streak`: bugün ya da dün tamamlanmış günlerden geriye sayar. Bugün henüz tamamlanmadıysa seriyi kırmaz. Frontend gruplandırılmış `setStreak` ile gösterilir.
- **İstatistik sayfası** `history` dilimden günleri hesaplar (son 7/30 gün), tamamlanan sayısı ve odak süresini bar grafik olarak gösterir.

## 7. Güvenlik

- `helmet` güvenlik başlıkları.
- CORS yalnızca `CORS_ORIGINS` listesindeki origin'den (yoksa localhost dev origins) — izinsiz origin 403.
- Rate limit: `/api` genel 300/15dk, `/api/auth` 20/15dk, `/api/generate-routine` 30/saat.
- `JWT_SECRET` üretimde **zorunlu**; geliştirmede fallback token üretimi devam eder.
- AI ucu JWT korumalıdır; request anahtarı (Gemini) yalnız sunucuda tutulur.

## 8. Geliştirme Notları

### Paketler / mimari kararlar
- `redux-persist` ile yerel veri devamı sağlanır; logout'ta `resetRoutine` tüm state'i sıfırlar (Redux iki kere calisir mı? — `resetRoutine` senkron reducer'dır, bir kez).
- `AddTaskModal` iki mod sunar: **Hızlı** (plansız) ve **Planlı** (saat seçer). `EditTaskModal` aynı şekilde plansız görevi "Şimdi Zaman Ver" ile zamanlar.
- AI önerisi `aiApi.generateRoutine(prompt, token)` — modal, üretilen planı kullanıcının seçimine sunar; onaylanan görevler `addTask` ile eklenir.

### Sık yapılan hatalar
1. **Route sırası:** `router.get("/:date")` catch-all'dir. `/streak` ve `/history`'den önce yazılırsa onları yutar. (2026-09 düzeltildi)
2. **Render sırasında dispatch:** `EarlyFinishModal`'da olduğu gibi — mutlaka `useEffect`'e taşıyın.
3. **Plansız görev şeması:** `startTime`/`endTime` undefined olabilir; `Math.round(...)` gibi işlemlerden önce `isScheduled` guard'ı çağırın.

## 9. Yapılacaklar (gelecek)
- Çoklu gün öngörüsü (haftalık plan).
- Görev sürükle-bırak ile yeniden zamanlama.
- İstatistiklerde hedef / grafik detaylandırma.
- Google OAuth'a refresh token entegrasyonu.
- PWA / mobil ağırlıklı zamanlayıcı görünümü.