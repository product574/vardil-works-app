import { beforeEach, describe, expect, it } from "vitest";
import { closureDays, holidayRows } from "@/lib/bank-holidays";
import { directorQueue } from "@/lib/requests";
import { addClosure, decideCert, markExpensePaid, moveRepair, removeClosure, reportRepair, submitCert, undoExpensePaid } from "./actions";
import { buildSeed } from "./seed";
import { useData, usePrefs } from "./store";

const DAY = "2026-11-19";
const db = () => useData.getState().db;

// The main offering (Oisin, 19 Nov): one phone for everyone, with everything it sends answered in Admin.
describe("the main offering", () => {
  beforeEach(() => {
    useData.setState(buildSeed(DAY));
    usePrefs.setState({ role: "md", asPersonId: null });
  });

  it("starts with sample repairs, a certificate to check and reimbursements to mark paid", () => {
    const q = directorQueue(db());
    expect(q.repairs.map((r) => r.status)).toEqual(["Reported"]);
    expect(q.certs).toHaveLength(1);
    expect(q.toPay.length).toBeGreaterThan(0);
  });

  it("takes a repair from Reported to In hand to Fixed, sends the machine off and brings it back", () => {
    const hoist = db().plant.find((p) => p.assetRef === "HS2")!;
    const before = hoist.status;
    const id = reportRepair({ personId: "p-101", item: { kind: "plant", refId: hoist.id, name: hoist.name }, where: "C720", what: "Cable frayed" }, []);
    expect(db().repairs[0]).toMatchObject({ id, status: "Reported", personId: "p-101" });
    moveRepair(id, "In hand", "Ordered a cable");
    expect(db().plant.find((p) => p.id === hoist.id)!.status).toBe("Off for repair");
    moveRepair(id, "Fixed");
    const r = db().repairs.find((x) => x.id === id)!;
    expect(r.status).toBe("Fixed");
    expect(r.steps.map((s) => [s.status, s.by, s.note])).toEqual([["In hand", "Aidan King", "Ordered a cable"], ["Fixed", "Aidan King", undefined]]);
    expect(db().plant.find((p) => p.id === hoist.id)!.status).toBe(before === "Off for repair" ? (hoist.projectId ? "On site" : "Available") : before);
    expect(db().activity[0]!.what).toBe("Marked a repair fixed");
  });

  it("counts a certificate from the phone only once the office accepts it", () => {
    const p = db().people.find((x) => x.id === "p-101")!;
    const c = p.certs[0]!;
    submitCert({ personId: p.id, kind: "ticket", certId: c.id, name: c.name, expires: "2029-11-19", photo: { name: "card.jpg", dataUrl: "data:image/jpeg;base64,AA" } });
    expect(db().people.find((x) => x.id === p.id)!.certs[0]!.expires).toBe(c.expires);
    const s = db().certSubmissions[0]!;
    decideCert(s.id, { expires: "2029-12-01" });
    const after = db().people.find((x) => x.id === p.id)!.certs.find((x) => x.id === c.id)!;
    expect(after.expires).toBe("2029-12-01");
    expect(after.proof?.name).toBe("card.jpg");
    expect(db().certSubmissions.find((x) => x.id === s.id)!.status).toBe("Accepted");
  });

  it("adds a certificate not on file, and turns one down with a note", () => {
    submitCert({ personId: "p-101", kind: "ticket", name: "First aid", expires: "2028-01-01", photo: { name: "fa.jpg", dataUrl: "" } });
    decideCert(db().certSubmissions[0]!.id, { expires: "2028-01-01" });
    expect(db().people.find((x) => x.id === "p-101")!.certs.some((c) => c.name === "First aid" && c.proofNeeded)).toBe(true);
    submitCert({ personId: "p-102", kind: "ticket", name: "Manual handling", expires: "2028-01-01", photo: { name: "m.jpg", dataUrl: "" } });
    decideCert(db().certSubmissions[0]!.id, null, "Blurred, send another");
    expect(db().certSubmissions[0]).toMatchObject({ status: "Turned down", note: "Blurred, send another" });
  });

  it("puts a licence from the phone on the record once accepted", () => {
    submitCert({ personId: "p-101", kind: "licence", licence: "driving", name: "Driving licence", expires: "2034-05-01", photo: { name: "dl.jpg", dataUrl: "data:image/jpeg;base64,AA" } });
    decideCert(db().certSubmissions[0]!.id, { expires: "2034-05-01" });
    expect(db().people.find((x) => x.id === "p-101")!.licences?.driving?.expiryDate).toBe("2034-05-01");
  });

  it("marks an approved reimbursement paid, and can take it back", () => {
    const x = directorQueue(db()).toPay[0]!;
    markExpensePaid(x.id);
    expect(db().expenses.find((e) => e.id === x.id)).toMatchObject({ paidBy: "Aidan King" });
    expect(directorQueue(db()).toPay.map((e) => e.id)).not.toContain(x.id);
    undoExpensePaid(x.id);
    expect(db().expenses.find((e) => e.id === x.id)!.paidAt).toBeUndefined();
  });

  it("sends a crew request straight to the office when there is no Projects app", () => {
    const held = db().requests.filter((r) => r.status === "Open" && r.heldBy === "site" && !r.decision);
    const site = directorQueue(db()).site.map((r) => r.id);
    const office = directorQueue(db(), { crewToOffice: true }).site.map((r) => r.id);
    for (const r of held) {
      expect(site).not.toContain(r.id);
      expect(office).toContain(r.id);
    }
  });

  it("adds a Christmas closure as working days shut, takes planned days off, and removes it as one", () => {
    const planned = db().plan.filter((p) => p.date === "2026-12-21").length;
    const out = addClosure("2026-12-21", "2027-01-04", "Christmas closedown");
    // 21 Dec to 4 Jan: eleven weekdays, less Christmas Day, St Stephen's Day... those already on the list.
    expect("days" in out && out.days).toBe(closureDays(buildSeed(DAY).db.bankHolidays, "2026-12-21", "2027-01-04").length);
    expect(db().plan.filter((p) => p.date === "2026-12-21")).toHaveLength(0);
    expect("off" in out && out.off).toBeGreaterThanOrEqual(planned);
    const rows = holidayRows(db().bankHolidays, "2026").filter((r) => r.kind === "closure");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Christmas closedown", from: "2026-12-21" });
    removeClosure((rows[0] as { closure: string }).closure);
    expect(db().bankHolidays.some((h) => h.name === "Christmas closedown")).toBe(false);
    expect(addClosure("2026-12-25", "2026-12-26", "x")).toEqual({ error: "Every working day in that range is already a company holiday" });
  });
});
