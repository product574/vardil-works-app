import { usePrefs } from "./store";

/** A county as it is written in each region: "Co. Galway" in Ireland, plain "Cumbria" in the UK. */
export const co = (county: string) => (usePrefs.getState().brand.region === "UK" ? county : `Co. ${county}`);
