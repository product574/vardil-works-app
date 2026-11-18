// The trail of screens someone has opened since signing in, for the Back button in the top
// bar. The browser keeps its own history but will not say how deep it is, or whether the
// entry before this one is a screen of the app or the sign-in page, so the app keeps count.

/** `keys` are the router's keys for each screen opened, oldest first; `at` is the one on show. */
export type Trail = { keys: string[]; at: number };
export const NO_TRAIL: Trail = { keys: [], at: -1 };

/** How the router says it got here: a new screen, one swapped in place, or back, forward or a reload. */
export type Arrival = "PUSH" | "REPLACE" | "POP";

/**
 * The trail after arriving at the screen with this key. `fresh` is the first screen after
 * signing in or changing role: the trail starts again there, so Back never leads to the
 * sign-in page or to a screen the role before could open and this one cannot. A reload or the
 * browser's own back and forward (POP) find their place in the trail they already have.
 */
export function arrive(trail: Trail, key: string, how: Arrival, fresh = false): Trail {
  if (how === "POP") {
    const found = trail.keys.indexOf(key);
    return found >= 0 ? { keys: trail.keys, at: found } : { keys: [key], at: 0 };
  }
  if (fresh || trail.at < 0) return { keys: [key], at: 0 };
  if (trail.keys[trail.at] === key) return trail;
  const kept = trail.keys.slice(0, how === "PUSH" ? trail.at + 1 : trail.at);
  // A swap leaves whatever was ahead in place, as the browser does; a new screen drops it.
  return how === "PUSH" ? { keys: [...kept, key], at: kept.length } : { keys: [...kept, key, ...trail.keys.slice(trail.at + 1)], at: trail.at };
}

/** Is there a screen of the app to go back to? */
export const canGoBack = (trail: Trail) => trail.at > 0;
