import { Check } from "@phosphor-icons/react";
import { create } from "zustand";

/** `action` puts one button in the message, for taking back what was just done: "Undo". */
type Toast = { id: number; text: string; action?: { label: string; run: () => void } };
const useToasts = create<{ items: Toast[] }>(() => ({ items: [] }));
let n = 0;
const drop = (id: number) => useToasts.setState((s) => ({ items: s.items.filter((t) => t.id !== id) }));

/** Confirms that something the person just did has happened: "Variation approved". One with an action stays up longer. */
export function toast(text: string, action?: Toast["action"]) {
  const id = ++n;
  useToasts.setState((s) => ({ items: [...s.items.slice(-2), { id, text, action }] }));
  window.setTimeout(() => drop(id), action ? 9000 : 3600);
}

export function Toaster() {
  const items = useToasts((s) => s.items);
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-24 z-50 flex flex-col items-end gap-2">
      {items.map((t) => (
        <div key={t.id} className="rise-in pointer-events-auto flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 shadow-pop">
          <Check size={16} weight="bold" className="text-ok" />
          {t.text}
          {t.action && (
            <button
              type="button"
              className="press ml-1 rounded-md px-2 py-0.5 font-medium text-accent-ink hover:bg-accent-soft"
              onClick={() => {
                t.action?.run();
                drop(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
