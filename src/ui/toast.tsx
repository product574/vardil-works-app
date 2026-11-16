import { Check } from "@phosphor-icons/react";
import { create } from "zustand";

type Toast = { id: number; text: string };
const useToasts = create<{ items: Toast[] }>(() => ({ items: [] }));
let n = 0;

/** Confirms that something the person just did has happened: "Variation approved". */
export function toast(text: string) {
  const id = ++n;
  useToasts.setState((s) => ({ items: [...s.items.slice(-2), { id, text }] }));
  window.setTimeout(() => useToasts.setState((s) => ({ items: s.items.filter((t) => t.id !== id) })), 3600);
}

export function Toaster() {
  const items = useToasts((s) => s.items);
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-24 z-50 flex flex-col items-end gap-2">
      {items.map((t) => (
        <div key={t.id} className="rise-in flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 shadow-pop">
          <Check size={16} weight="bold" className="text-ok" />
          {t.text}
        </div>
      ))}
    </div>
  );
}
