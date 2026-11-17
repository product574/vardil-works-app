/**
 * Reimbursements on their way to being paid (the call with Oldstone's managing director,
 * 17 Nov: once the director approves one, have it ready to export for the office to pay).
 * A claim is made on the site phone, answered in Admin, and an approved one waits here until
 * the office exports it; from then it is with them for payment.
 *
 * Pure functions: no React, no store.
 */
type Claim = { id: string; personId: string; date: string; kind: string; what: string; amount: number; projectId: string | null; status: "Waiting" | "Approved" | "Declined"; decidedBy?: string; decidedAt?: string; exportedAt?: string; exportedBy?: string };
type Who = { id: string; name: string; sageNo?: string };
type Site = { id: string; code: string };

/** Approved and not yet exported: what the office has to pay. Oldest claim first. */
export const toPay = <C extends Claim>(claims: C[]): C[] => claims.filter((c) => c.status === "Approved" && !c.exportedAt).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

/** Approved and already exported for payment, newest export first. */
export const sentForPayment = <C extends Claim>(claims: C[]): C[] => claims.filter((c) => c.status === "Approved" && !!c.exportedAt).sort((a, b) => b.exportedAt!.localeCompare(a.exportedAt!) || a.id.localeCompare(b.id));

/** Where a claim stands, in the words the person who made it reads on their phone. */
export function claimStage(c: Pick<Claim, "status" | "exportedAt">): "Waiting" | "Declined" | "Approved, with the office to pay" | "Sent for payment" {
  if (c.status !== "Approved") return c.status;
  return c.exportedAt ? "Sent for payment" : "Approved, with the office to pay";
}

/** What each person is owed out of a list of claims, most first. */
export function owedByPerson<C extends Claim>(claims: C[]): { personId: string; claims: number; amount: number }[] {
  const m = new Map<string, { claims: number; amount: number }>();
  for (const c of claims) {
    const t = m.get(c.personId) ?? { claims: 0, amount: 0 };
    m.set(c.personId, { claims: t.claims + 1, amount: Math.round((t.amount + c.amount) * 100) / 100 });
  }
  return [...m.entries()].map(([personId, t]) => ({ personId, ...t })).sort((a, b) => b.amount - a.amount || a.personId.localeCompare(b.personId));
}

const cell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/**
 * The file for the office: one row per approved claim, with the employee number payroll knows
 * the person by, what it was for and the amount to pay back (as on the receipt, VAT included).
 */
export function reimbursementCsv(day: string, claims: Claim[], people: Who[], sites: Site[]): { fileName: string; text: string } {
  const rows = [
    ["Employee No", "Surname", "Forename", "Paid on", "For", "Detail", "Site", "Amount", "Approved by", "Approved on"],
    ...claims.map((c) => {
      const p = people.find((x) => x.id === c.personId);
      const parts = (p?.name ?? "").split(" ");
      return [p?.sageNo ?? "", parts.slice(1).join(" "), parts[0] ?? "", dmy(c.date), c.kind, c.what, sites.find((s) => s.id === c.projectId)?.code ?? "General", c.amount.toFixed(2), c.decidedBy ?? "", c.decidedAt ? dmy(c.decidedAt.slice(0, 10)) : ""];
    }),
  ];
  return { fileName: `reimbursements-to-pay-${day}.csv`, text: rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n" };
}
