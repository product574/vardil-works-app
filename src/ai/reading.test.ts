import { describe, expect, it } from "vitest";
import { cleanReading, READ_LIMITS, readPrompt, readReadRequest, toolsFor } from "./reading";

describe("what the AI read from a document", () => {
  it("tidies an invoice reading: day-first dates, money as numbers, registrations in capitals", () => {
    const r = cleanReading("invoice", { garage_name: " Corrib Motors ", garage_town: "Oranmore", garage_county: "Co. Galway", invoice_no: "CM-20188", date: "16/11/2026", vat: "58.33", total: "€490.42", lines: [{ reg: "241-g-5120", amount: 490.42, description: "60,000 km service – brakes", mileage: 57140.4, category: "Service" }], notes: "" });
    expect(r).toEqual({ kind: "invoice", garageName: "Corrib Motors", garageTown: "Oranmore", garageCounty: "Galway", invoiceNo: "CM-20188", date: "2026-11-16", vat: 58.33, total: 490.42, lines: [{ reg: "241-G-5120", amount: 490.42, description: "60,000 km service, brakes", mileage: 57140, category: "Service" }], notes: "" });
  });
  it("leaves out what is not there instead of guessing", () => {
    const r = cleanReading("invoice", { garage_name: 7, date: "next week", total: -5, lines: "none" });
    expect(r).toMatchObject({ garageName: "", date: "", total: 0, lines: [] });
    expect(cleanReading("invoice", "not an object")).toBeNull();
  });
  it("a category the app does not have becomes Other", () => {
    const r = cleanReading("invoice", { lines: [{ reg: "241-G-5120", amount: 10, description: "x", mileage: 0, category: "Accident damage" }] });
    expect(r?.kind === "invoice" && r.lines[0]!.category).toBe("Other");
  });
  it("tidies a renewal or licence reading", () => {
    expect(cleanReading("renewal", { doc_type: "cpc", reg: "", name: "SEAN KELLY", expiry_date: "2028-05-31", paid_date: "", amount: 0, notes: "" })).toEqual({ kind: "renewal", docType: "cpc", reg: "", name: "SEAN KELLY", expiryDate: "2028-05-31", paidDate: "", amount: 0, notes: "" });
    expect(cleanReading("renewal", { doc_type: "passport", expiry_date: "28.02.2027" })).toMatchObject({ docType: "other", expiryDate: "2027-02-28" });
    // A date that does not exist is left out, not moved to a nearby one.
    expect(cleanReading("renewal", { doc_type: "tax", expiry_date: "31.02.2027" })).toMatchObject({ docType: "tax", expiryDate: "" });
  });
});

describe("the page's request to have a document read", () => {
  const data = "A".repeat(400);
  it("accepts a PDF or a photo of one of the three kinds", () => {
    expect(readReadRequest({ kind: "any", mediaType: "application/pdf", data, context: "" }).ok).toBe(true);
    expect(readReadRequest({ kind: "invoice", mediaType: "image/jpeg", data, context: "Vehicles: 241-G-5120" }).ok).toBe(true);
  });
  it("refuses other kinds, other file types, and anything too big or not a file", () => {
    expect(readReadRequest({ kind: "delete", mediaType: "application/pdf", data, context: "" })).toEqual({ ok: false, reason: "kind" });
    expect(readReadRequest({ kind: "invoice", mediaType: "text/html", data, context: "" })).toEqual({ ok: false, reason: "type" });
    expect(readReadRequest({ kind: "invoice", mediaType: "application/pdf", data: "<script>".repeat(40), context: "" })).toEqual({ ok: false, reason: "data" });
    expect(readReadRequest({ kind: "invoice", mediaType: "application/pdf", data: "A".repeat(READ_LIMITS.data + 1), context: "" })).toEqual({ ok: false, reason: "data" });
    expect(readReadRequest({ kind: "invoice", mediaType: "application/pdf", data, context: "x".repeat(READ_LIMITS.context + 1) })).toEqual({ ok: false, reason: "context" });
  });
  it("gives the model one tool for a known kind, and both when it must say what the document is", () => {
    expect(toolsFor("invoice").map((t) => t.name)).toEqual(["record_invoice"]);
    expect(toolsFor("renewal").map((t) => t.name)).toEqual(["record_renewal"]);
    expect(toolsFor("any").map((t) => t.name)).toEqual(["record_invoice", "record_renewal"]);
    expect(readPrompt("any", "Vehicles: 241-G-5120")).toContain("241-G-5120");
  });
});
