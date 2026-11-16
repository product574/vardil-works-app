import { useEffect } from "react";
import { usePrefs } from "@/data/store";

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Applies the theme and the brand accent to the page.
 * Button fills, soft tints and readable accent text are all mixed from the one accent colour,
 * so re-branding the demo for a prospect means changing a single hex value.
 */
export function useBrandTheme() {
  const theme = usePrefs((s) => s.theme);
  const accent = usePrefs((s) => s.brand.accent);
  const brandName = usePrefs((s) => s.brand.brandName);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
    const a = HEX.test(accent) ? accent : "#4682B4";
    const dark = theme === "dark";
    root.style.setProperty("--accent", dark ? `color-mix(in srgb, ${a} 72%, white)` : a);
    root.style.setProperty("--accent-strong", dark ? `color-mix(in srgb, ${a} 88%, black)` : `color-mix(in srgb, ${a} 78%, black)`);
    root.style.setProperty("--accent-soft", dark ? `color-mix(in srgb, ${a} 22%, #19212a)` : `color-mix(in srgb, ${a} 13%, white)`);
    root.style.setProperty("--accent-ink", dark ? `color-mix(in srgb, ${a} 45%, white)` : `color-mix(in srgb, ${a} 68%, black)`);
  }, [theme, accent]);

  useEffect(() => {
    document.title = `${brandName} operations`;
  }, [brandName]);
}
