import { describe, expect, it } from "vitest";
import { namesMatch, regsMatch } from "./match";

describe("does a document belong where it is being filed", () => {
  it("matches a name whatever the case, accents, order or middle name", () => {
    expect(namesMatch("SEAN KELLY", "Seán Kelly")).toBe("match");
    expect(namesMatch("KELLY, SEAN PATRICK", "Seán Kelly")).toBe("match");
    expect(namesMatch("Mr. Ger O'Brien", "Ger OBrien")).toBe("match");
  });
  it("warns when the licence is someone else's", () => {
    expect(namesMatch("Oisin Murphy", "Seán Kelly")).toBe("mismatch");
    expect(namesMatch("Seán Byrne", "Seán Kelly")).toBe("mismatch");
  });
  it("says nothing when there is no name to compare", () => {
    expect(namesMatch("", "Seán Kelly")).toBe("unknown");
  });
  it("compares registrations with dashes, spaces and case ignored", () => {
    expect(regsMatch("241 g 5120", "241-G-5120")).toBe("match");
    expect(regsMatch("241-G-5121", "241-G-5120")).toBe("mismatch");
    expect(regsMatch("", "241-G-5120")).toBe("unknown");
  });
});
