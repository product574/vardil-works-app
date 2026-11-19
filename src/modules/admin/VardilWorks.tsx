import { useState } from "react";
import { signedInEmail } from "@/app/auth";
import { DEPARTMENTS } from "@/app/departments";
import { sendWorkspace, useAnnouncements, useApps, useWorkspace } from "@/app/workspace";
import { usePrefs } from "@/data/store";
import { APP_INFO, type AppKey, SOLD_APPS } from "@/lib/apps";
import { dFull } from "@/lib/format";
import { Badge, Button, cx, PageBody, PageHead, Panel, Section } from "@/ui";
import { toast } from "@/ui/toast";

/**
 * Vardil Works (Oisin, 19 Nov): Vardil's page in every client's Admin. At the top, what Vardil
 * wants every client to know (written in Vardil HQ). Below, every app: the ones they have, on;
 * the ones they do not, blurred with the switch off and "Ask about this app", which lands with
 * Vardil as a lead. The client cannot switch anything here (his pick: read-only).
 */
export function VardilWorks() {
  const apps = useApps();
  const announcements = useAnnouncements();
  const brand = usePrefs((s) => s.brand);
  const online = useWorkspace((s) => s.online);
  const localRequests = usePrefs((s) => s.localAppRequests);
  const addLocal = usePrefs((s) => s.addLocalAppRequest);
  const [asked, setAsked] = useState<AppKey[]>([]);
  const email = signedInEmail() ?? `office@${brand.emailDomain}`;
  const have = SOLD_APPS.filter((a) => apps.on(a));
  const could = SOLD_APPS.filter((a) => !apps.on(a));
  const already = (a: AppKey) => asked.includes(a) || localRequests.some((r) => r.app === a && !r.handledAt);
  const ask = async (a: AppKey) => {
    if (online) {
      const problem = await sendWorkspace({ action: "ask_app", app: a, firm: brand.legalName });
      if (problem) return toast(problem);
    } else addLocal({ id: `ask-${Date.now()}`, email, firm: brand.legalName, app: a, at: new Date().toISOString() });
    setAsked((s) => [...s, a]);
    toast(`Thanks. Vardil will be in touch about ${APP_INFO[a].name}`);
  };
  const icon = (a: AppKey) => DEPARTMENTS.find((d) => d.key === a)?.icon;
  return (
    <>
      <PageHead title="Vardil Works" note="News from Vardil, and the apps in your system." />
      <PageBody className="grid max-w-5xl gap-6">
        <Section title="From Vardil">
          <Panel>
            <ul className="divide-y divide-line" aria-label="Announcements">
              {announcements.map((a) => (
                <li key={a.id} className="px-4 py-3">
                  <p className="font-medium">{a.title}</p>
                  <p className="mt-0.5 whitespace-pre-line">{a.body}</p>
                  <p className="mt-1 text-[0.87rem] text-muted">{dFull(a.at.slice(0, 10))}</p>
                </li>
              ))}
            </ul>
          </Panel>
        </Section>

        <Section title={`Your apps (${have.length})`}>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Your apps">
            {have.map((a) => {
              const Icon = icon(a);
              return (
                <li key={a} className="flex items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3">
                  {Icon && <Icon size={22} className="mt-0.5 shrink-0 text-accent-ink" />}
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{APP_INFO[a].name}</span>
                    <span className="block text-[0.93rem] text-muted">{APP_INFO[a].blurb}</span>
                  </span>
                  <OnOff on label={`${APP_INFO[a].name}: on`} />
                </li>
              );
            })}
          </ul>
        </Section>

        {could.length > 0 && (
          <Section title="Add to your system" aside={<span className="text-[0.93rem] text-muted">Each one works with what you have already</span>}>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Apps you could add">
              {could.map((a) => {
                const Icon = icon(a);
                return (
                  <li key={a} className="grid gap-2 rounded-lg border border-dashed border-line-strong bg-canvas px-4 py-3">
                    <div className="flex items-start gap-3">
                      {Icon && <Icon size={22} className="mt-0.5 shrink-0 text-muted blur-[1.5px]" aria-hidden />}
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-muted">{APP_INFO[a].name}</span>
                        <span className="block text-[0.93rem] text-muted blur-[1.5px] select-none" aria-hidden>
                          {APP_INFO[a].blurb}
                        </span>
                        <span className="sr-only">{APP_INFO[a].blurb}</span>
                      </span>
                      <OnOff on={false} label={`${APP_INFO[a].name}: not in your system`} />
                    </div>
                    {already(a) ? (
                      <Badge tone="ok">Asked. We will be in touch</Badge>
                    ) : (
                      <Button size="sm" className="justify-self-start" onClick={() => void ask(a)}>
                        Ask about this app
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </Section>
        )}
      </PageBody>
    </>
  );
}

/** A switch that shows whether an app is on. Only Vardil switches apps, so it cannot be pressed here. */
function OnOff({ on, label }: { on: boolean; label: string }) {
  return (
    <span role="img" aria-label={label} className={cx("relative mt-1 h-6 w-10 shrink-0 rounded-full", on ? "bg-accent-strong" : "bg-line-strong")}>
      <span className={cx("absolute top-1 size-4 rounded-full bg-white", on ? "right-1" : "left-1")} />
    </span>
  );
}
