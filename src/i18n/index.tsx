import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

/**
 * Hafif i18n katmanı (Plan 3 — 4.3).
 *
 * Sözlük yalnızca uygulama kabuğunu (gezinme, selamlama, ortak düğmeler,
 * ayar başlıkları) kapsar; eksik anahtar Türkçeye düşer. Böylece yeni metin
 * eklerken uygulama bozulmaz, çeviri kademeli tamamlanabilir.
 */

export type Lang = "tr" | "az" | "en";

const STORAGE_KEY = "adaptime-lang";

const tr = {
  "nav.today": "Bugün",
  "nav.mentor": "Mentor",
  "nav.focus": "Odak",
  "nav.diary": "Günlük",
  "nav.stats": "Analitik",
  "nav.settings": "Ayarlar",
  "common.loading": "Yükleniyor...",
  "common.logout": "Çıkış Yap",
  "common.search": "Görev ara",
  "common.searchShortcut": "Görev ara (Ctrl+K)",
  "common.themeToggle": "Temayı değiştir",
  "greeting.night": "İyi geceler",
  "greeting.morning": "Günaydın",
  "greeting.day": "İyi günler",
  "greeting.evening": "İyi akşamlar",
  "settings.language": "Dil",
  "settings.languageHint":
    "Arayüz dili anında değişir. Tarih ve saat biçimleri tarayıcı ayarına uyar.",
  "settings.appearance": "Görünüm",
  "settings.palette": "Renk paketi",
  "settings.contrast": "Yüksek kontrast",
  "settings.contrastHint": "Kenarlıkları ve metni daha belirgin yapar.",
  "settings.colorblind": "Renk körü modu",
  "settings.colorblindHint":
    "Tamamlandı/uyarı renkleri mavi-turuncu-mor ile ayrılır; renk tek başına anlam taşımaz.",
  "share.title": "Plan paylaşımı",
  "share.hint":
    "Salt-okunur bağlantı: plan ortağın bugünkü planını görebilir, değiştiremez.",
  "share.create": "Bağlantı oluştur",
  "share.copy": "Kopyala",
  "share.rotate": "Yenile",
  "share.disable": "Kapat",
  "share.readonly": "Salt okunur plan",
  "share.nudge": "Başladın mı diye sor",
  "share.nudgeSent": "Dürtme gönderildi.",
} as const;

type Key = keyof typeof tr;

const az: Partial<Record<Key, string>> = {
  "nav.today": "Bu gün",
  "nav.mentor": "Mentor",
  "nav.focus": "Fokus",
  "nav.diary": "Gündəlik",
  "nav.stats": "Analitika",
  "nav.settings": "Parametrlər",
  "common.loading": "Yüklənir...",
  "common.logout": "Çıxış",
  "common.search": "Tapşırıq axtar",
  "common.searchShortcut": "Tapşırıq axtar (Ctrl+K)",
  "common.themeToggle": "Temanı dəyiş",
  "greeting.night": "Gecən xeyir",
  "greeting.morning": "Sabahın xeyir",
  "greeting.day": "Yaxşı günlər",
  "greeting.evening": "Axşamın xeyir",
  "settings.language": "Dil",
  "settings.languageHint":
    "İnterfeys dili dərhal dəyişir. Tarix və saat formatları brauzer ayarına uyğunlaşır.",
  "settings.appearance": "Görünüş",
  "settings.palette": "Rəng paketi",
  "settings.contrast": "Yüksək kontrast",
  "settings.contrastHint": "Haşiyələri və mətni daha aydın edir.",
  "settings.colorblind": "Rəng korluğu rejimi",
  "settings.colorblindHint":
    "Tamamlanma/xəbərdarlıq rəngləri mavi-narıncı-bənövşəyi ilə ayrılır.",
  "share.title": "Plan paylaşımı",
  "share.hint":
    "Yalnız oxumaq üçün link: partnyor bugünkü planı görə bilər, dəyişdirə bilməz.",
  "share.create": "Link yarat",
  "share.copy": "Kopyala",
  "share.rotate": "Yenilə",
  "share.disable": "Bağla",
  "share.readonly": "Yalnız oxunan plan",
  "share.nudge": "Başladın?",
  "share.nudgeSent": "Dürtmə göndərildi.",
};

const en: Partial<Record<Key, string>> = {
  "nav.today": "Today",
  "nav.mentor": "Mentor",
  "nav.focus": "Focus",
  "nav.diary": "Journal",
  "nav.stats": "Analytics",
  "nav.settings": "Settings",
  "common.loading": "Loading...",
  "common.logout": "Log out",
  "common.search": "Search tasks",
  "common.searchShortcut": "Search tasks (Ctrl+K)",
  "common.themeToggle": "Toggle theme",
  "greeting.night": "Good night",
  "greeting.morning": "Good morning",
  "greeting.day": "Good day",
  "greeting.evening": "Good evening",
  "settings.language": "Language",
  "settings.languageHint":
    "The interface language changes instantly. Dates follow your browser locale.",
  "settings.appearance": "Appearance",
  "settings.palette": "Color pack",
  "settings.contrast": "High contrast",
  "settings.contrastHint": "Makes borders and text more distinct.",
  "settings.colorblind": "Colorblind mode",
  "settings.colorblindHint":
    "Success/warning colors switch to blue-orange-purple so color is never the only signal.",
  "share.title": "Plan sharing",
  "share.hint":
    "Read-only link: your partner can view today's plan but cannot change it.",
  "share.create": "Create link",
  "share.copy": "Copy",
  "share.rotate": "Rotate",
  "share.disable": "Disable",
  "share.readonly": "Read-only plan",
  "share.nudge": "Ask if started",
  "share.nudgeSent": "Nudge sent.",
};

const DICTS: Record<Lang, Partial<Record<Key, string>>> = { tr, az, en };

export const LANGUAGES: { id: Lang; label: string; short: string }[] = [
  { id: "tr", label: "Türkçe", short: "TR" },
  { id: "az", label: "Azərbaycanca", short: "AZ" },
  { id: "en", label: "English", short: "EN" },
];

export const LOCALES: Record<Lang, string> = {
  tr: "tr-TR",
  az: "az-AZ",
  en: "en-GB",
};

function detectLang(): Lang {
  const saved = localStorage.getItem(STORAGE_KEY) as Lang | null;
  if (saved && saved in DICTS) return saved;
  const nav = (navigator.language || "tr").toLowerCase();
  if (nav.startsWith("az")) return "az";
  if (nav.startsWith("en")) return "en";
  return "tr";
}

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: Key) => string;
  locale: string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);

  useEffect(() => {
    document.documentElement.lang = lang;
    localStorage.setItem(STORAGE_KEY, lang);
  }, [lang]);

  const setLang = useCallback((next: Lang) => setLangState(next), []);

  const t = useCallback(
    (key: Key) => DICTS[lang][key] ?? tr[key] ?? key,
    [lang],
  );

  return (
    <I18nContext.Provider value={{ lang, setLang, t, locale: LOCALES[lang] }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

/** Yalnızca çeviri fonksiyonu gereken yerler için kısayol. */
export function useT() {
  return useI18n().t;
}
