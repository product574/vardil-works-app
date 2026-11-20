// What is left to bill on a project, and why its final account is held.
import { r2 } from "./money";

/**
 * The final account bills what the contract value has not billed already. Every other invoice
 * on the project counts, whatever state it is in (a stage payment still to be issued will be
 * issued), so nothing is billed twice.
 */
export function finalAccountNet(contractValue: number, otherInvoicesNet: number[]) {
  return Math.max(0, r2(contractValue - otherInvoicesNet.reduce((s, n) => s + n, 0)));
}

export type HoldFlags = { extrasFlag: boolean; snaggingFlag: boolean };

/** The reason written on a held invoice: "Variations to be agreed", "Snagging open", or both. */
export function holdReason(f: HoldFlags) {
  if (f.extrasFlag && f.snaggingFlag) return "Variations to be agreed and snagging open";
  return f.extrasFlag ? "Variations to be agreed" : "Snagging open";
}

/** The same reason inside a sentence: "variations are waiting to be agreed and snagging is open". */
export function holdWhy(f: HoldFlags) {
  return [f.extrasFlag && "variations are waiting to be agreed", f.snaggingFlag && "snagging is open"].filter(Boolean).join(" and ") || "a manager has held it";
}

/** The project history lines for invoicing, shared by the actions and the sample data so both read the same. */
export const invoicedLine = (ref: string, description: string) => `Invoiced ${ref}, ${description.charAt(0).toLowerCase()}${description.slice(1)}`;
export const paidLine = (ref: string, closing: boolean) => `${ref} paid${closing ? ": paid in full, project closed" : ""}`;

/**
 * The number an invoice goes by. Until it is issued that is our own reference (INV-5207); once
 * issued it is the number the client and the accounts package have (SI-10404), so every screen,
 * email and file uses that one.
 */
export const invoiceNo = (i: { ref: string; accountsNo?: string }) => i.accountsNo ?? i.ref;

/** The PDF of a sales invoice as it is filed with the project. A colon cannot go in a file name. */
export const salesInvoiceFile = (ref: string, description: string) => `${ref} ${description.replace(/:\s*/g, ", ")}.pdf`;
