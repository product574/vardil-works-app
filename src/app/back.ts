import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { arrive, canGoBack, NO_TRAIL, type Trail } from "@/lib/trail";

// Kept for the tab, so a reload does not forget how the person got to this screen.
const STORE = "cod.trail";

function saved(): Trail {
  try {
    const t = JSON.parse(sessionStorage.getItem(STORE) ?? "null") as Trail | null;
    return t && Array.isArray(t.keys) && typeof t.at === "number" ? t : NO_TRAIL;
  } catch {
    return NO_TRAIL;
  }
}

/**
 * Whether the Back button in the top bar has a screen to go back to. `who` is whoever is
 * signed in: when it changes, the trail starts again at the screen they land on, so Back
 * never leads into a screen that only the role before could open. The rule is in lib/trail.
 */
export function useCanGoBack(who: string) {
  const { key } = useLocation();
  const how = useNavigationType();
  const [trail, setTrail] = useState<Trail>(saved);
  const started = useRef(false);
  const last = useRef({ who, key });
  const startOver = useRef(false);

  useEffect(() => {
    const changed = last.current.who !== who;
    const fresh = !started.current || changed || startOver.current;
    // Changing role moves to that role's home straight after. If that move has not happened
    // yet, it is the next thing to arrive, and the trail starts again there instead.
    startOver.current = changed && last.current.key === key;
    started.current = true;
    last.current = { who, key };
    setTrail((t) => arrive(t, key, how, fresh));
  }, [key, how, who]);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(trail));
    } catch {
      // No room or no storage: the trail still works until the tab is reloaded.
    }
  }, [trail]);

  return canGoBack(trail);
}
