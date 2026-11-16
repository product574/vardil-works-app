import { beforeEach, describe, expect, it } from "vitest";
import { declineQuote, discardQuoteDraft, draftQuoteFromEnquiry, quoteBackToDraft, sendQuote } from "./actions";
import { useData } from "./store";

const db = () => useData.getState().db;

describe("what a move on the sales board does to the records", () => {
  beforeEach(() => useData.getState().reset());

  it("drafting from an enquiry, then taking it back to To quote, leaves nothing behind", () => {
    const e = db().enquiries.find((x) => x.status === "Logged" && !x.quoteId)!;
    const quotes = db().quotes.length;
    const approvals = db().approvals.length;
    const ref = draftQuoteFromEnquiry(e.id);
    const q = db().quotes.find((x) => x.ref === ref)!;
    expect(db().approvals.some((a) => a.quoteId === q.id && a.status === "Pending")).toBe(true);
    discardQuoteDraft(q.id);
    expect(db().quotes.length).toBe(quotes);
    expect(db().approvals.length).toBe(approvals);
    const back = db().enquiries.find((x) => x.id === e.id)!;
    expect([back.status, back.quoteId]).toEqual(["Logged", undefined]);
    expect(db().activity[0]!.what).toBe("Discarded a draft quote");
  });

  it("only a draft can be discarded", () => {
    const sent = db().quotes.find((x) => x.status === "Sent")!;
    discardQuoteDraft(sent.id);
    expect(db().quotes.find((x) => x.id === sent.id)?.status).toBe("Sent");
  });

  it("pulling a sent quote back makes it a draft again, out of the client's sight, until it is sent", () => {
    const q = db().quotes.find((x) => x.status === "Opened" && x.enquiryId)!;
    quoteBackToDraft(q.id);
    const after = db().quotes.find((x) => x.id === q.id)!;
    expect([after.status, after.sentAt, after.openedAt, after.chasedAt]).toEqual(["Draft", undefined, undefined, undefined]);
    expect(db().enquiries.find((x) => x.id === q.enquiryId)?.status).toBe("Logged");
    sendQuote(q.id);
    expect(db().quotes.find((x) => x.id === q.id)?.status).toBe("Sent");
    expect(db().enquiries.find((x) => x.id === q.enquiryId)?.status).toBe("Quoted");
  });

  it("a declined quote can be reopened, and a won one cannot be pulled back", () => {
    const q = db().quotes.find((x) => x.status === "Sent")!;
    declineQuote(q.id);
    quoteBackToDraft(q.id);
    expect(db().quotes.find((x) => x.id === q.id)?.status).toBe("Draft");
    expect(db().activity[0]!.what).toBe("Reopened a declined quote");
    const won = db().quotes.find((x) => x.status === "Accepted")!;
    quoteBackToDraft(won.id);
    expect(db().quotes.find((x) => x.id === won.id)?.status).toBe("Accepted");
  });
});
