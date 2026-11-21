/**
 * The entry of the phone app on its own (21 Nov): `npm run build:phone` puts this in place of
 * src/main.tsx (see `phoneEntry` in vite.config.ts), so the packaged iPhone and Android app
 * holds the phone app and nothing of the office screens. No server is asked who is signed in:
 * the app opens on its own sign-in by mobile number.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PhoneOnly } from "./PhoneOnly";
import "../styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PhoneOnly />
  </StrictMode>,
);
