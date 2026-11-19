import { useState } from "react";
import { Navigate } from "react-router-dom";
import { sendWorkspace, useAnnouncements, useWorkspace } from "@/app/workspace";
import { useAccess } from "@/data/access";
import { usePrefs } from "@/data/store";
import { ALWAYS_ON, APP_INFO, type AppKey, appsOff, clientKey, type ClientConfig, PACKAGES, packageOf, SOLD_APPS } from "@/lib/apps";
import { dFull, plural } from "@/lib/format";
import { Badge, Button, Dialog, Empty, Field, PageBody, PageHead, Panel, Section, Tick } from "@/ui";
import { toast } from "@/ui/toast";

/** Shown where something can only be saved on the hosted demo. */
function NeedsServer() {
  return (
    <p className="rounded-md bg-warn-soft px-3 py-2.5 text-warn">
      This copy has no server, so a client's apps cannot be saved here for them to see on their own computer. On the hosted demo they are saved on Cloudflare. For a pitch in this browser, use Packages and access.
    </p>
  );
}

/**
 * Client apps (19 Nov): which apps each client has, saved on the server by their sign-in email or
 * their firm's domain. What is ticked here is what they see, on any computer; the rest shows on
 * their Vardil Works page as apps they could add.
 */
export function ClientApps() {
  const access = useAccess();
  const online = useWorkspace((s) => s.online);
  const clients = useWorkspace((s) => s.clients);
  const setPackage = usePrefs((s) => s.setPackage);
  const [edit, setEdit] = useState<ClientConfig | "new" | null>(null);
  if (!access.staffMode) return <Navigate to="/" replace />;
  return (
    <>
      <PageHead title="Client apps" note="Which apps each client has. They see these on any computer when they sign in; everything else shows on their Vardil Works page as apps they could add." actions={online && <Button variant="primary" onClick={() => setEdit("new")}>Add a client</Button>} />
      <PageBody className="grid max-w-5xl gap-4">
        {!online && <NeedsServer />}
        <Panel>
          {clients.length === 0 ? (
            <Empty title="No clients set up yet">A client with nothing saved sees every app. Add one to give them a package.</Empty>
          ) : (
            <table className="tbl" aria-label="Clients and their apps">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Package</th>
                  <th>Changed</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => {
                  const pkg = packageOf(c.apps, c.automations);
                  return (
                    <tr key={c.key}>
                      <td>
                        <span className="font-medium">{c.name}</span>
                        <span className="block text-[0.87rem] text-muted">{c.key.startsWith("@") ? `Everyone at ${c.key.slice(1)}` : c.key}</span>
                      </td>
                      <td>{pkg ? pkg.name : `${plural(c.apps.filter((a) => !ALWAYS_ON.includes(a)).length, "app")} of their own`}</td>
                      <td className="text-[0.93rem] text-muted">{c.updatedAt ? `${dFull(c.updatedAt.slice(0, 10))}, ${c.updatedBy}` : ""}</td>
                      <td className="text-right whitespace-nowrap">
                        <Button size="sm" variant="ghost" onClick={() => { setPackage(appsOff(c.apps), c.automations); toast(`${c.name}'s apps are on in this browser`); }}>
                          Show in this browser
                        </Button>{" "}
                        <Button size="sm" onClick={() => setEdit(c)}>
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
      {edit && <ClientDialog client={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function ClientDialog({ client, onClose }: { client: ClientConfig | null; onClose: () => void }) {
  const [key, setKey] = useState(client?.key ?? "");
  const [name, setName] = useState(client?.name ?? "");
  const [apps, setApps] = useState<AppKey[]>(client?.apps ?? PACKAGES[0]!.apps);
  const [automations, setAutomations] = useState(client?.automations ?? false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const k = clientKey(key);
  const toggle = (a: AppKey) => setApps((s) => (s.includes(a) ? s.filter((x) => x !== a) : [...s, a]));
  const save = async () => {
    if (!k) return setError("Type their email, or @ and their firm's domain for everyone there.");
    if (!name.trim()) return setError("Give the client a name.");
    setBusy(true);
    const problem = await sendWorkspace({ action: "set_client", key: k, name: name.trim(), apps, automations });
    setBusy(false);
    if (problem) return setError(problem);
    toast(`${name.trim()} saved`);
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={client ? `Apps for ${client.name}` : "Add a client"}
      footer={
        <>
          {client && (
            <Button
              variant="ghost"
              className="mr-auto"
              onClick={async () => {
                const problem = await sendWorkspace({ action: "delete_client", key: client.key });
                if (problem) return setError(problem);
                toast(`${client.name} removed. They see every app again`);
                onClose();
              }}
            >
              Remove
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={busy} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label="Client name">{(id) => <input id={id} className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Oldstone Conservation" />}</Field>
        <Field label="Their sign-in email, or @ and the firm's domain">{(id) => <input id={id} className="field" value={key} disabled={!!client} onChange={(e) => setKey(e.target.value)} placeholder="@oldstone.ie" />}</Field>
        <div className="flex flex-wrap gap-2">
          {PACKAGES.map((p) => (
            <Button key={p.key} size="sm" onClick={() => { setApps(p.apps); setAutomations(p.automations); }}>
              {p.name}
            </Button>
          ))}
        </div>
        <ul className="grid gap-1 sm:grid-cols-2" aria-label="Apps">
          {SOLD_APPS.map((a) => (
            <li key={a} className="flex items-center gap-2">
              <Tick on={ALWAYS_ON.includes(a) || apps.includes(a)} label={APP_INFO[a].name} locked={ALWAYS_ON.includes(a)} onChange={() => toggle(a)} />
              <span>{APP_INFO[a].name}</span>
            </li>
          ))}
          <li className="flex items-center gap-2">
            <Tick on={automations} label="Automations in Admin" onChange={() => setAutomations((v) => !v)} />
            <span>Automations in Admin</span>
          </li>
        </ul>
        {error && (
          <p role="alert" className="text-bad">
            {error}
          </p>
        )}
      </div>
    </Dialog>
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
      const problem = await sendWorkspace({ action: "announce", title: title.trim(), body: body.trim() });
      if (problem) return setError(problem);
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
                          const problem = await sendWorkspace({ action: "remove_announcement", id: a.id });
                          if (problem) return toast(problem);
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
                              const problem = await sendWorkspace({ action: "handle_request", id: r.id });
                              if (problem) return toast(problem);
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
