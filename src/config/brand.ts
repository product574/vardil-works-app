/**
 * Everything a prospect-specific copy of the demo needs to change lives in this one file.
 * The same values can be edited live in Settings > Branding, which stores them in the browser.
 *
 * To make a demo for a new prospect: change `brandName`, `legalName`, `accent`, and (optionally)
 * drop their logo into /public and set `logoUrl`. Nothing else needs touching.
 */
export type Region = "IE" | "UK";
export type AccountsPackage = "sage50" | "xero" | "sheet";
/** The firm's team chat, shown in Team chat and Admin, Connections (step 2). */
export type ChatApp = "teams" | "slack";

export type Brand = {
  /** Short name shown top left and on the sign-in page. */
  brandName: string;
  /** Full trading name used on documents, emails and exports. */
  legalName: string;
  /** One line under the name on the sign-in page. */
  tagline: string;
  /** Accent colour as a hex value. Buttons, links and highlights derive from it. */
  accent: string;
  /** Path under /public, or a full URL. Leave empty to show the name as text. */
  logoUrl: string;
  /** Sets currency, VAT rate, certificate names and vehicle test names. */
  region: Region;
  /** Which accounts package the invoicing export is laid out for. */
  accountsPackage: AccountsPackage;
  /** Which team chat the firm uses: Microsoft Teams or Slack. Changes how channels are named. */
  chatApp: ChatApp;
  /** Email domain used for the invented staff and shared mailboxes. */
  emailDomain: string;
};

export const DEFAULT_BRAND: Brand = {
  brandName: "ABC Construction",
  legalName: "ABC Construction Ltd",
  tagline: "Conservation contractors",
  accent: "#4682B4",
  logoUrl: "",
  region: "IE",
  accountsPackage: "sage50",
  chatApp: "teams",
  emailDomain: "abcconstruction.example",
};

/** Shown in the footer of the sign-in page and in Settings > About this demo. */
export const DEMO_BUILT_BY = "Vardil";
/** Where the "Built by" credit links to. Opens in a new tab. */
export const DEMO_BUILT_BY_URL = "https://vardil.com";
