import { Link } from "react-router-dom";
import { useAccess } from "@/data/access";
import { chaseQuote } from "@/data/actions";
import { ageDays } from "@/data/kpis";
import { useData, useDay, usePrefs } from "@/data/store";
import type { Quote } from "@/data/types";
import { plural, whenInline } from "@/lib/format";
import { money0 } from "@/lib/money";
import { quoteTotal } from "@/lib/quotes";
import { Button, Empty, PageBody, PageHead, Panel, Section } from "@/ui";
import { toast } from "@/ui/toast";

/** Quotes that are with clients, grouped by what needs doing about them. */
export function Awaiting() {
  const db = useData((s) => s.db);
  const day = useDay();
  const region = usePrefs((s) => s.brand.region);
  const { seeValues, may } = useAccess();
  const canPrice = may("priceQuotes");
  const oldest = (a: Quote, b: Quote) => (a.sentAt ?? "").localeCompare(b.sentAt ?? "");
  const groups: { title: string; note: string; rows: Quote[]; action: "chase" | "reprice" }[] = [
    { title: "Queried", note: "The client has asked something. Answer or reprice.", rows: db.quotes.filter((q) => q.status === "Queried").sort(oldest), action: "reprice" },
    { title: "Opened, not answered", note: "They have read it. A call usually settles these.", rows: db.quotes.filter((q) => q.status === "Opened").sort(oldest), action: "chase" },
    { title: "Sent, not opened", note: "Not looked at yet.", rows: db.quotes.filter((q) => q.status === "Sent").sort(oldest), action: "chase" },
    { title: "Declined", note: "Worth asking why, or repricing a smaller scope.", rows: db.quotes.filter((q) => q.status === "Declined").sort(oldest), action: "reprice" },
  ];
  const waiting = groups.slice(0, 3).reduce((s, g) => s + g.rows.length, 0);

  return (
    <>
      <PageHead title="Awaiting response" note={`${plural(waiting, "quote")} with clients, oldest first in each group.`} />
      <PageBody className="grid max-w-5xl gap-6">
        {groups.map((g) => (
          <Section key={g.title} title={`${g.title} (${g.rows.length})`} aside={g.note}>
            <Panel>
              {g.rows.length === 0 ? (
                <Empty title="None" />
              ) : (
                <ul className="divide-y divide-line">
                  {g.rows.map((q) => {
                    const client = db.clients.find((c) => c.id === q.clientId);
                    return (
                      <li key={q.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <Link to={`/sales/quotes/${q.ref}`} className="font-medium underline-offset-2 hover:underline">
                            {q.ref} {q.title}
                          </Link>
                          <p className="text-[0.93rem] text-muted">
                            {client?.name}, {client?.contactName}, {client?.contactPhone}
                            {q.chasedAt && `. Last chased ${whenInline(q.chasedAt, day)}`}
                          </p>
                          {q.query && <p className="mt-1 text-[0.93rem] text-warn">"{q.query}"</p>}
                        </div>
                        {seeValues && <span className="font-medium">{money0(quoteTotal(q.lines), region)}</span>}
                        <span className="w-20 text-right text-[0.93rem] text-muted">{plural(ageDays(q.sentAt, day), "day")}</span>
                        {!canPrice ? null : g.action === "chase" ? (
                          <Button
                            size="sm"
                            onClick={() => {
                              chaseQuote(q.id);
                              toast(`Chase to ${client?.contactName} recorded`);
                            }}
                          >
                            Chase
                          </Button>
                        ) : (
                          <Link to={`/sales/quotes/${q.ref}`} className="press inline-flex h-8 items-center rounded-md border border-line-strong bg-surface px-2.5 text-[0.87rem] font-medium hover:border-accent hover:text-accent-ink">
                            Reprice
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          </Section>
        ))}
      </PageBody>
    </>
  );
}
