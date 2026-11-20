import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

type Theme = "light" | "dark";
export type Palette = "indigo" | "forest" | "ocean" | "sand" | "berry";
export type Contrast = "normal" | "high";

interface ThemeContextType {
  theme: Theme;
  toggle: () => void;
  palette: Palette;
  setPalette: (palette: Palette) => void;
  contrast: Contrast;
  setContrast: (contrast: Contrast) => void;
  colorblind: boolean;
  setColorblind: (value: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

const PALETTES: Palette[] = ["indigo", "forest", "ocean", "sand", "berry"];

function readPalette(): Palette {
  const saved = localStorage.getItem("adaptime-palette") as Palette | null;
  return saved && PALETTES.includes(saved) ? saved : "indigo";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("adaptime-theme") as Theme | null;
    if (saved === "light" || saved === "dark") return saved;
    return "dark";
  });
  const [palette, setPalette] = useState<Palette>(readPalette);
  const [contrast, setContrast] = useState<Contrast>(() =>
    localStorage.getItem("adaptime-contrast") === "high" ? "high" : "normal",
  );
  const [colorblind, setColorblind] = useState<boolean>(
    () => localStorage.getItem("adaptime-colorblind") === "1",
  );

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.dataset.palette = palette;
    root.dataset.contrast = contrast;
    root.dataset.colorblind = colorblind ? "1" : "0";
    localStorage.setItem("adaptime-theme", theme);
    localStorage.setItem("adaptime-palette", palette);
    localStorage.setItem("adaptime-contrast", contrast);
    localStorage.setItem("adaptime-colorblind", colorblind ? "1" : "0");
  }, [theme, palette, contrast, colorblind]);

  const toggle = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggle,
        palette,
        setPalette,
        contrast,
        setContrast,
        colorblind,
        setColorblind,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
