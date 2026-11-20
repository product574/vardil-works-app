import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { openClientDemo, sendWorkspace, useAnnouncements, useWorkspace } from "@/app/workspace";
import { useAccess } from "@/data/access";
import { usePrefs } from "@/data/store";
import { ALWAYS_ON, APP_INFO, packageOf } from "@/lib/apps";
import { dFull, plural } from "@/lib/format";
import { Badge, Button, cx, Empty, Field, PageBody, PageHead, Panel, Section } from "@/ui";
import { toast } from "@/ui/toast";

/** Shown where something can only be saved on the hosted demo. */
function NeedsServer() {
  return (
    <p className="rounded-md bg-warn-soft px-3 py-2.5 text-warn">
      This copy has no server, so clients cannot be saved here for them to see on their own computer. On the hosted demo they are saved on Cloudflare. For a pitch in this browser, use Packages and access, and Settings, Branding.
    </p>
  );
}

/** Where Cloudflare's sign-in list stands, and a button to write it again. */
function CloudflarePanel() {
  const cf = useWorkspace((s) => s.cloudflare);
  const [busy, setBusy] = useState(false);
  if (!cf) return null;
  if (!cf.linked)
    return (
      <Panel className="px-4 py-3">
        <p className="font-medium">Cloudflare is not linked yet</p>
        <p className="text-muted">Clients are saved here, but Cloudflare's list of who may sign in has to be kept by hand until the three settings in the README ("Clients and Cloudflare") are added to the project. Until then, add each client's emails to the Demo access policy yourself.</p>
      </Panel>
    );
  return (
    <Panel className="flex flex-wrap items-center gap-3 px-4 py-3">
      <p className="min-w-0 flex-1 basis-72">
        <span className="block font-medium">{cf.error ? "Cloudflare's list is out of date" : "Cloudflare's list is up to date"}</span>
        <span className={cx("block", cf.error ? "text-warn" : "text-muted")}>
          {cf.error ? `The last update failed: ${cf.error}` : `${plural(cf.count, "client email")} can sign in.${cf.syncedAt ? ` Last updated ${dFull(cf.syncedAt.slice(0, 10))} at ${cf.syncedAt.slice(11, 16)}.` : ""}`}
        </span>
      </p>
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await sendWorkspace({ action: "sync_cloudflare" });
          setBusy(false);
          toast(r.error ?? r.cloudflare?.message ?? "Done");
        }}
      >
        Update Cloudflare now
      </Button>
    </Panel>
  );
}

/**
 * Clients (19 Nov, made fuller on 20 Nov): every client, who signs in to their demo, their apps
 * and their look. Each is saved on the server and opens on a page of its own.
 */
export function ClientApps() {
  const access = useAccess();
  const online = useWorkspace((s) => s.online);
  const clients = useWorkspace((s) => s.clients);
  const setRole = usePrefs((s) => s.setRole);
  const navigate = useNavigate();
  const note = (useLocation().state as { note?: { tone: "ok" | "warn"; text: string } | null } | null)?.note ?? null;
  if (!access.staffMode) return <Navigate to="/" replace />;
  return (
    <>
      <PageHead title="Clients" note="Each client's demo: who signs in, which apps they have, and their name, logo and colour. They see exactly this on any computer; everything else shows on their Vardil Works page as apps they could add." actions={online && <Button variant="primary" onClick={() => navigate("/vardil/clients/new")}>Add a client</Button>} />
      <PageBody className="grid max-w-5xl gap-4">
        {!online && <NeedsServer />}
        {note && <p role="status" className={cx("rounded-md px-3 py-2.5", note.tone === "ok" ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn")}>{note.text}</p>}
        {online && <CloudflarePanel />}
        <Panel>
          {clients.length === 0 ? (
            <Empty title="No clients set up yet">Someone who signs in and is on no client's list sees the standard demo, ABC Construction with every app. Add a client to give them their own.</Empty>
          ) : (
            <table className="tbl" aria-label="Clients">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>People</th>
                  <th>Apps</th>
                  <th>Changed</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => {
                  const pkg = packageOf(c.apps, c.automations);
                  return (
                    <tr key={c.id}>
                      <td>
                        <span className="flex items-center gap-2.5">
                          {c.logoUrl ? <img src={c.logoUrl} alt="" className="h-7 w-12 shrink-0 object-contain" /> : <span aria-hidden className="size-4 shrink-0 rounded-full" style={{ background: c.look.accent }} />}
                          <span className="min-w-0">
                            <Link to={`/vardil/clients/${c.id}`} className="font-medium text-accent-ink hover:underline">{c.name}</Link>
                            <span className="block text-[0.87rem] text-muted">{c.look.region === "UK" ? "United Kingdom" : "Ireland"}</span>
                          </span>
                        </span>
                      </td>
                      <td>{c.emails.length ? plural(c.emails.length, "person", "people") : <span className="text-warn">Nobody yet</span>}</td>
                      <td>{pkg ? pkg.name : `${plural(c.apps.filter((a) => !ALWAYS_ON.includes(a)).length, "app")} of their own`}</td>
                      <td className="text-[0.93rem] text-muted">{c.updatedAt ? `${dFull(c.updatedAt.slice(0, 10))}, ${c.updatedBy}` : ""}</td>
                      <td className="text-right whitespace-nowrap">
                        <Button size="sm" variant="ghost" onClick={() => { openClientDemo(c.id); setRole("md"); navigate("/"); }}>
                          Open their demo
                        </Button>{" "}
                        <Button size="sm" onClick={() => navigate(`/vardil/clients/${c.id}`)}>
                          Change
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
      </PageBody>
    </>
  );
}

/** Announcements every client sees at the top of their Vardil Works page, newest first. */
export function Announcements() {
  const access = useAccess();
  const online = useWorkspace((s) => s.online);
  const list = useAnnouncements();
  const addLocal = usePrefs((s) => s.addLocalAnnouncement);
  const removeLocal = usePrefs((s) => s.removeLocalAnnouncement);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  if (!access.staffMode) return <Navigate to="/" replace />;
  const publish = async () => {
    if (!title.trim() || !body.trim()) return setError("Give it a heading and a few words.");
    if (online) {
      const { error } = await sendWorkspace({ action: "announce", title: title.trim(), body: body.trim() });
      if (error) return setError(error);
    } else addLocal({ id: `local-${Date.now()}`, title: title.trim(), body: body.trim(), at: new Date().toISOString(), by: "Vardil" });
    toast(online ? "Published to every client" : "Published in this browser");
    setTitle("");
    setBody("");
    setError("");
  };
  return (
    <>
      <PageHead title="Announcements" note={online ? "What every client sees at the top of Admin, Vardil Works: new features, changes, anything we want them to know." : "What clients see at the top of Admin, Vardil Works. This copy has no server, so these are kept in this browser only."} />
      <PageBody className="grid max-w-4xl gap-5">
        <Section title="New announcement">
          <Panel className="grid gap-3 p-4">
            <Field label="Heading">{(id) => <input id={id} className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Roster by WhatsApp is here" />}</Field>
            <Field label="What to say">{(id) => <textarea id={id} rows={3} className="field" value={body} onChange={(e) => setBody(e.target.value)} />}</Field>
            {error && (
              <p role="alert" className="text-bad">
                {error}
              </p>
            )}
            <div className="flex justify-end">
              <Button variant="primary" onClick={() => void publish()}>
                {online ? "Publish to every client" : "Publish"}
              </Button>
            </div>
          </Panel>
        </Section>
        <Section title="Published">
          <Panel>
            <ul className="divide-y divide-line">
              {list.map((a) => (
                <li key={a.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1 basis-64">
                    <span className="block font-medium">{a.title}</span>
                    <span className="block whitespace-pre-line">{a.body}</span>
                    <span className="block text-[0.87rem] text-muted">{dFull(a.at.slice(0, 10))}</span>
                  </span>
                  {a.id !== "welcome" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        if (online) {
                          const { error } = await sendWorkspace({ action: "remove_announcement", id: a.id });
                          if (error) return toast(error);
                        } else removeLocal(a.id);
                        toast("Announcement taken down");
                      }}
                    >
                      Take down
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        </Section>
      </PageBody>
    </>
  );
}

/** What clients asked about from their Vardil Works page: a lead each. */
export function AppRequests() {
  const access = useAccess();
  const online = useWorkspace((s) => s.online);
  const server = useWorkspace((s) => s.requests);
  const local = usePrefs((s) => s.localAppRequests);
  const handleLocal = usePrefs((s) => s.handleLocalAppRequest);
  if (!access.staffMode) return <Navigate to="/" replace />;
  const list = online ? server : local;
  const open = list.filter((r) => !r.handledAt);
  return (
    <>
      <PageHead title="App requests" note={`Clients who pressed "Ask about this app" on their Vardil Works page. ${open.length ? `${plural(open.length, "lead")} to follow up.` : "Nothing to follow up."}`} />
      <PageBody className="max-w-5xl">
        <Panel>
          {list.length === 0 ? (
            <Empty title="No requests yet">They arrive here when a client asks about an app they do not have.</Empty>
          ) : (
            <table className="tbl" aria-label="App requests">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>App</th>
                  <th>Asked</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className="font-medium">{r.firm || r.email}</span>
                      <span className="block text-[0.87rem] text-muted">{r.email}</span>
                    </td>
                    <td>{APP_INFO[r.app].name}</td>
                    <td className="text-muted">{dFull(r.at.slice(0, 10))}</td>
                    <td className="text-right">
                      {r.handledAt ? (
                        <Badge tone="ok">Followed up by {r.handledBy}</Badge>
                      ) : (
                        <Button
                          size="sm"
                          onClick={async () => {
                            if (online) {
                              const { error } = await sendWorkspace({ action: "handle_request", id: r.id });
                              if (error) return toast(error);
                            } else handleLocal(r.id, "Vardil");
                            toast("Marked as followed up");
                          }}
                        >
                          Mark followed up
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </PageBody>
    </>
  );
}
