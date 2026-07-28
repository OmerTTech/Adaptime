import { useState } from "react";
import { useAppDispatch } from "@/store/hooks";
import { openAddModal } from "@/store/slices/uiSlice";
import { Plus, Sparkles, X } from "lucide-react";

export default function AddRoutineFAB() {
  const dispatch = useAppDispatch();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {isOpen && (
        <div className="absolute bottom-16 right-0 space-y-2 animate-in fade-in slide-in-from-bottom-2">
          <button
            onClick={() => {
              dispatch(openAddModal());
              setIsOpen(false);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface border border-border text-text text-sm font-medium shadow-lg hover:bg-surface-hover transition-all whitespace-nowrap"
          >
            <Plus size={16} className="text-primary" />
            Manuel Ekle
          </button>
          <button
            onClick={() => {
              dispatch(openAddModal("ai"));
              setIsOpen(false);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface border border-border text-text text-sm font-medium shadow-lg hover:bg-surface-hover transition-all whitespace-nowrap"
          >
            <Sparkles size={16} className="text-warning" />
            AI ile Oluştur
          </button>
        </div>
      )}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95 ${
          isOpen
            ? "bg-surface border border-border rotate-45"
            : "bg-primary hover:bg-primary-hover text-white shadow-primary/25"
        }`}
      >
        {isOpen ? (
          <X size={24} className="text-text -rotate-45" />
        ) : (
          <Plus size={24} />
        )}
      </button>
    </div>
  );
}
