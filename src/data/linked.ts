/**
 * Whether this screen is linked to the shared firm on the server (21 Nov 2026). Kept in a module
 * of its own so the store can ask without importing the link itself (src/data/shared.ts).
 *
 * While `on`, the server holds the firm: the store does not keep it in the browser, does not
 * rebuild it for a new day or a client's look, and "Reset demo data" asks the server instead.
 */
export const linked: { on: boolean; reset: (() => void) | null } = { on: false, reset: null };
