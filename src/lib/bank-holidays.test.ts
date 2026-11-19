import { describe, expect, it } from "vitest";
import { bankHolidayOn, bankHolidaysOf, builtInBankHolidays, easterSunday, isBankHoliday, isBuiltInBankHoliday, isRestDay, restDayKindOf, restDaysBetween } from "./bank-holidays";

// Bank holidays, built in and editable in Admin (Oisin, 17 Nov).
describe("public holidays", () => {
  it("finds Easter", () => {
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
    expect(easterSunday(2025)).toBe("2025-04-20");
  });

  it("lists Ireland's ten for a year, in date order", () => {
    expect(bankHolidaysOf(2026, "IE")).toEqual([
      { date: "2026-01-01", name: "New Year's Day" },
      { date: "2026-02-02", name: "St Brigid's Day" },
      { date: "2026-03-17", name: "St Patrick's Day" },
      { date: "2026-04-06", name: "Easter Monday" },
      { date: "2026-05-04", name: "May bank holiday" },
      { date: "2026-06-01", name: "June bank holiday" },
      { date: "2026-08-03", name: "August bank holiday" },
      { date: "2026-10-26", name: "October bank holiday" },
      { date: "2026-12-25", name: "Christmas Day" },
      { date: "2026-12-26", name: "St Stephen's Day" },
    ]);
  });

  it("puts St Brigid's Day on the 1st of February when that is a Friday, otherwise the first Monday", () => {
    // 1 February 2030 is a Friday.
    expect(bankHolidaysOf(2030, "IE").find((h) => h.name === "St Brigid's Day")!.date).toBe("2030-02-01");
    expect(bankHolidaysOf(2027, "IE").find((h) => h.name === "St Brigid's Day")!.date).toBe("2027-02-01");
    expect(bankHolidaysOf(2025, "IE").find((h) => h.name === "St Brigid's Day")!.date).toBe("2025-02-03");
  });

  it("lists England and Wales's eight, moving one that falls at a weekend to the next free weekday", () => {
    const uk = bankHolidaysOf(2026, "UK");
    expect(uk.map((h) => h.date)).toEqual(["2026-01-01", "2026-04-03", "2026-04-06", "2026-05-04", "2026-05-25", "2026-08-31", "2026-12-25", "2026-12-28"]);
    // Boxing Day 2026 is a Saturday, so the day in lieu is the Monday.
    expect(uk[7]).toEqual({ date: "2026-12-28", name: "Boxing Day (day in lieu)" });
    // Christmas 2027 is a Saturday and Boxing Day a Sunday: Monday and Tuesday in lieu.
    expect(bankHolidaysOf(2027, "UK").slice(-2).map((h) => h.date)).toEqual(["2027-12-27", "2027-12-28"]);
  });

  it("starts the records with last year, this year and next", () => {
    const list = builtInBankHolidays("2026-11-17", "IE");
    expect(list).toHaveLength(30);
    expect([list[0]!.date, list[29]!.date]).toEqual(["2025-01-01", "2027-12-26"]);
  });

  it("knows a public holiday in either region, for choosing the demo's day", () => {
    expect(isBuiltInBankHoliday("2026-10-26")).toBe(true);
    expect(isBuiltInBankHoliday("2026-08-31")).toBe(true);
    expect(isBuiltInBankHoliday("2026-11-17")).toBe(false);
  });
});

describe("rest days", () => {
  const list = builtInBankHolidays("2026-11-17", "IE");
  it("is a Saturday, a Sunday or a bank holiday", () => {
    expect(isRestDay(list, "2026-11-14")).toBe(true);
    expect(isRestDay(list, "2026-11-15")).toBe(true);
    expect(isRestDay(list, "2026-10-26")).toBe(true);
    expect(isRestDay(list, "2026-11-16")).toBe(false);
    expect(isBankHoliday(list, "2026-11-14")).toBe(false);
    expect(bankHolidayOn(list, "2026-10-26")?.name).toBe("October bank holiday");
  });
  it("falls under its day's overtime rule, a bank holiday coming first", () => {
    expect(restDayKindOf(list, "2026-11-14")).toBe("saturday");
    expect(restDayKindOf(list, "2026-11-15")).toBe("sunday");
    expect(restDayKindOf(list, "2026-10-26")).toBe("bank-holiday");
    // St Stephen's Day 2026 is a Saturday: a bank holiday, all double time.
    expect(restDayKindOf(list, "2026-12-26")).toBe("bank-holiday");
    expect(restDayKindOf(list, "2026-11-16")).toBeNull();
  });
  it("lists the rest days between two dates, newest first", () => {
    expect(restDaysBetween(list, "2026-10-24", "2026-11-01")).toEqual(["2026-11-01", "2026-10-31", "2026-10-26", "2026-10-25", "2026-10-24"]);
    expect(restDaysBetween(list, "2026-11-16", "2026-11-17")).toEqual([]);
    // A day the firm adds in Admin counts too.
    expect(restDaysBetween([...list, { date: "2026-11-18", name: "Firm closed" }], "2026-11-16", "2026-11-20")).toEqual(["2026-11-18"]);
  });
});
