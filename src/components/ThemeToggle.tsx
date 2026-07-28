import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();

  return (
    <button
      onClick={toggle}
      className="fixed bottom-4 left-4 z-50 size-10 rounded-full bg-surface border border-border flex items-center justify-center text-text-muted hover:text-text hover:bg-surface-hover transition-all shadow-lg"
      aria-label="Temayı değiştir"
    >
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
