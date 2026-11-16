import { describe, expect, it } from "vitest";
import { dailyLimit, limitHeaders } from "./limit";

describe("the daily limit on Ask AI questions", () => {
  it("is off unless the project sets a whole number above 0", () => {
    for (const off of [undefined, "", "0", "-5", "abc", "0.5"]) expect(dailyLimit(off)).toBe(0);
    expect(dailyLimit("30")).toBe(30);
    expect(dailyLimit(" 12 ")).toBe(12);
    expect(dailyLimit("7.9")).toBe(7);
  });

  it("sends no count of questions left when there is no limit", () => {
    expect(limitHeaders(0, 250, "question")).toEqual({});
  });

  it("counts the question being asked, but not the rounds after a draft", () => {
    expect(limitHeaders(30, 4, "question")).toEqual({ "x-ask-remaining": "25", "x-ask-limit": "30" });
    expect(limitHeaders(30, 5, "continue")).toEqual({ "x-ask-remaining": "25", "x-ask-limit": "30" });
    expect(limitHeaders(3, 3, "question")).toEqual({ "x-ask-remaining": "0", "x-ask-limit": "3" });
  });
});
