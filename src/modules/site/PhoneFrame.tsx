/**
 * A phone-sized frame for the Site phone screen (merged 19 Nov, Oisin's pick C of three
 * pictures: both phones side by side, each phone-sized, scrolling inside itself). The phone's
 * own sheets open over its screen, not over the page (`PhoneSheetHost` in src/ui). On a real
 * phone, or any screen narrower than 40rem, there is no frame: the phone fills the screen and
 * its sheets are ordinary dialogs (his pick).
 */
import { type ReactNode, useEffect, useState } from "react";
import { PhoneSheetHost } from "@/ui";

const FRAMED = "(min-width: 40rem)";

function useFramed() {
  const [framed, setFramed] = useState(() => typeof window !== "undefined" && window.matchMedia(FRAMED).matches);
  useEffect(() => {
    const q = window.matchMedia(FRAMED);
    const on = () => setFramed(q.matches);
    on();
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return framed;
}

export function PhoneFrame({ label, children }: { label: string; children: ReactNode }) {
  const framed = useFramed();
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  if (!framed)
    return (
      <section aria-label={label} className="site-app w-full">
        {children}
      </section>
    );
  return (
    // The label is on the whole phone, so the sheets that open over its screen are inside it too.
    <section aria-label={label} className="site-app relative shrink-0 rounded-[2.5rem] border-[0.75rem] border-bezel bg-bezel shadow-pop">
      {/* The camera notch, for the look of a phone. */}
      <div aria-hidden className="absolute top-0 left-1/2 z-30 h-5 w-28 -translate-x-1/2 rounded-b-xl bg-bezel" />
      <div className="h-[min(50rem,calc(100dvh-21rem))] min-h-[34rem] w-[24rem] overflow-y-auto overscroll-contain rounded-[1.75rem] bg-surface pt-5">
        <PhoneSheetHost.Provider value={host}>{children}</PhoneSheetHost.Provider>
      </div>
      <div ref={setHost} className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-[1.75rem] [&>*]:pointer-events-auto" />
    </section>
  );
}
