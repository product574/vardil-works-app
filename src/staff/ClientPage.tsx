import { ArrowSquareOut, Trash } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { openClientDemo, sendWorkspace, type SendResult, useWorkspace } from "@/app/workspace";
import { useAccess } from "@/data/access";
import { usePrefs } from "@/data/store";
import { ALWAYS_ON, APP_INFO, type AppKey, type ClientConfig, type ClientLook, MAX_EMAILS, PACKAGES, sampleDomain, SOLD_APPS, splitEmails, starterLook } from "@/lib/apps";
import { shrinkImage } from "@/lib/image";
import { defaultDesign, type InvoiceDesign } from "@/lib/invoices";
import { COLOURS } from "@/modules/settings/Settings";
import { Button, cx, Dialog, Field, PageBody, PageHead, Panel, Section, Segmented, Tick } from "@/ui";
import { PickFile } from "@/ui/files";
import { toast } from "@/ui/toast";

const HEX = /^#[0-9a-f]{6}$/i;

const TEXT_FIELDS: { key: keyof InvoiceDesign; label: string; rows?: number; wide?: boolean }[] = [
  { key: "address", label: "Address", rows: 3, wide: true },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Accounts email" },
  { key: "vatNumber", label: "VAT number" },
  { key: "companyNumber", label: "Company number" },
  { key: "bankName", label: "Bank" },
  { key: "iban", label: "IBAN" },
  { key: "bic", label: "BIC" },
  { key: "terms", label: "Payment terms", rows: 2, wide: true },
  { key: "footer", label: "Last line", wide: true },
];
const SWITCHES: { key: "showLogo" | "showBank" | "showSite" | "rule"; label: string }[] = [
  { key: "showLogo", label: "Logo on the invoice" },
  { key: "showBank", label: "Bank details" },
  { key: "showSite", label: "Site address and project code" },
  { key: "rule", label: "A line in their colour under the heading" },
];

/** The region's starting paper for this look: what every field shows until it is changed. */
const baseDesign = (look: ClientLook) => defaultDesign(look.region, sampleDomain(look.brandName));

/** Say how a save went on Cloudflare, in words. */
export function cloudflareNote(r: SendResult): { tone: "ok" | "warn"; text: string } | null {
  const cf = r.cloudflare;
  if (!cf) return null;
  const out = cf.signedOut?.length ? ` Signed out now: ${cf.signedOut.join(", ")}.` : "";
  return { tone: cf.ok ? "ok" : "warn", text: cf.message + out };
}

/**
 * One client (20 Nov, decision 209): who signs in to their demo (named emails only), which apps
 * they have, how it looks (name, logo, colour, region) and what their invoices carry. Saving
 * writes it on the server and brings Cloudflare's sign-in list into line; anyone taken off the
 * list is signed out at once.
 */
export function ClientPage() {
  const { id = "new" } = useParams();
  const access = useAccess();
  const online = useWorkspace((s) => s.online);
  const clients = useWorkspace((s) => s.clients);
  const client = id === "new" ? null : (clients.find((c) => c.id === id) ?? null);
  if (!access.staffMode) return <Navigate to="/" replace />;
  if (!online) return <Navigate to="/vardil/clients" replace />;
  if (id !== "new" && !client) return <Navigate to="/vardil/clients" replace />;
  // A fresh form whenever another client is opened.
  return <ClientForm key={client?.id ?? "new"} client={client} />;
}

function ClientForm({ client }: { client: ClientConfig | null }) {
  const navigate = useNavigate();
  const setRole = usePrefs((s) => s.setRole);
  const [name, setName] = useState(client?.name ?? "");
  const [emails, setEmails] = useState<string[]>(client?.emails ?? []);
  const [adding, setAdding] = useState("");
  const [apps, setApps] = useState<AppKey[]>(client?.apps ?? PACKAGES[0]!.apps);
  const [automations, setAutomations] = useState(client?.automations ?? false);
  const [look, setLook] = useState<ClientLook>(client?.look ?? starterLook(""));
  // Only what differs from the region's starting paper is kept, so a change of region or name still gives sensible paper.
  const [edits, setEdits] = useState<Partial<InvoiceDesign>>(client?.look.design ?? {});
  // The logo: unchanged, a new picture, or taken off.
  const [logo, setLogo] = useState<{ url: string; changed: boolean }>({ url: client?.logoUrl ?? "", changed: false });
  const [error, setError] = useState("");
  // A new client's page opens again under its own address, carrying how the save went.
  const [note, setNote] = useState<{ tone: "ok" | "warn"; text: string } | null>((useLocation().state as { note?: { tone: "ok" | "warn"; text: string } | null } | null)?.note ?? null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);

  // A new client's names follow the client name until someone types their own.
  const [lookTouched, setLookTouched] = useState(!!client);
  useEffect(() => {
    if (!lookTouched) setLook((l) => ({ ...l, brandName: name.trim(), legalName: name.trim() ? `${name.trim()} Ltd` : "" }));
  }, [name, lookTouched]);
  const editLook = (p: Partial<ClientLook>) => {
    setLookTouched(true);
    setLook((l) => ({ ...l, ...p }));
  };

  const addEmails = () => {
    const { good, bad } = splitEmails(adding);
    if (bad.length) return setError(`Not an email: ${bad.join(", ")}. Named emails only, such as majella@oldstone.ie.`);
    const next = [...emails, ...good.filter((e) => !emails.includes(e))];
    if (next.length > MAX_EMAILS) return setError(`One client can have ${MAX_EMAILS} people at most.`);
    setEmails(next);
    setAdding("");
    setError("");
  };
  const toggle = (a: AppKey) => setApps((s) => (s.includes(a) ? s.filter((x) => x !== a) : [...s, a]));
  const base = baseDesign(look);
  const design: InvoiceDesign = { ...base, ...edits };
  const setField = <K extends keyof InvoiceDesign>(k: K, v: InvoiceDesign[K]) =>
    setEdits((e) => {
      const next = { ...e };
      if (v === base[k]) delete next[k];
      else next[k] = v;
      return next;
    });

  const save = async () => {
    setNote(null);
    if (!name.trim()) return setError("Give the client a name.");
    if (adding.trim()) return setError("Press Add for the emails in the box first, or clear it.");
    if (!look.brandName.trim()) return setError("Give their demo a short name.");
    if (!HEX.test(look.accent)) return setError("Their colour needs a # and six characters, such as #4682B4.");
    setBusy(true);
    const full: ClientLook = { ...look, brandName: look.brandName.trim(), legalName: look.legalName.trim() || look.brandName.trim(), design: edits };
    const r = await sendWorkspace({ action: "set_client", id: client?.id ?? null, name: name.trim(), emails, apps, automations, look: full });
    if (r.error) {
      setBusy(false);
      return setError(r.error);
    }
    const savedId = r.id ?? client?.id;
    if (savedId && logo.changed) {
      const lr = await sendWorkspace({ action: "set_logo", id: savedId, logo: logo.url || null });
      if (lr.error) {
        setBusy(false);
        setError(`Saved, but the logo was not: ${lr.error}`);
        if (!client) navigate(`/vardil/clients/${savedId}`, { replace: true });
        return;
      }
    }
    setBusy(false);
    setError("");
    const cf = cloudflareNote(r);
    toast(`${name.trim()} saved`);
    if (cf) setNote(cf);
    if (!client && savedId) navigate(`/vardil/clients/${savedId}`, { replace: true, state: { note: cf } });
  };

  const open = () => {
    if (!client) return;
    openClientDemo(client.id);
    setRole("md");
    navigate("/");
  };

  const hex = HEX.test(look.accent);
  const dirty = !client;
  return (
    <>
      <PageHead
        title={client ? client.name : "Add a client"}
        note="Who signs in to their demo, which apps they have, and how it looks. They see exactly this, on any computer, and cannot change it."
        actions={
          <>
            {client && (
              <Button onClick={open}>
                <ArrowSquareOut size={17} /> Open their demo
              </Button>
            )}
            <Button variant="primary" disabled={busy} onClick={() => void save()}>
              {busy ? "Saving" : "Save"}
            </Button>
          </>
        }
      />
      <PageBody className="grid max-w-5xl items-start gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="grid min-w-0 gap-6">
          {(error || note) && (
            <p role={error ? "alert" : "status"} className={cx("rounded-md px-3 py-2.5", error ? "bg-bad-soft text-bad" : note?.tone === "ok" ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn")}>
              {error || note?.text}
            </p>
          )}

          <Section title="Who signs in">
            <Panel className="grid gap-3 px-4 py-4">
              <Field label="Client name" hint="As we know them in Vardil HQ.">{(fid) => <input id={fid} className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Oldstone Conservation" />}</Field>
              <div>
                <p className="mb-1 text-[0.93rem] font-medium">People who can sign in</p>
                {emails.length === 0 ? (
                  <p className="text-muted">Nobody yet. Until someone is added, nobody can open this client's demo.</p>
                ) : (
                  <ul aria-label="People who can sign in" className="divide-y divide-line rounded-md border border-line">
                    {emails.map((e) => (
                      <li key={e} className="flex items-center gap-2 px-3 py-1.5">
                        <span className="min-w-0 flex-1 break-all">{e}</span>
                        <Button size="sm" variant="ghost" aria-label={`Take ${e} off`} onClick={() => setEmails((s) => s.filter((x) => x !== e))}>
                          <Trash size={16} /> Take off
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Add people" hint="One email each, or several separated by commas or new lines. Named emails only, never a whole domain." className="min-w-0 flex-1 basis-72">
                  {(fid) => <textarea id={fid} rows={2} className="field" value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="majella@oldstone.ie, pat@oldstone.ie" />}
                </Field>
                <Button onClick={addEmails} disabled={!adding.trim()}>
                  Add
                </Button>
              </div>
              {client && <p className="text-[0.87rem] text-muted">Anyone you take off is taken off Cloudflare's list when you save, and signed out straight away.</p>}
            </Panel>
          </Section>

          <Section title="Apps">
            <Panel className="grid gap-3 px-4 py-4">
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
            </Panel>
          </Section>

          <Section title="How it looks">
            <Panel className="grid gap-4 px-4 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Short name" hint="Top left of every screen.">{(fid) => <input id={fid} className="field" value={look.brandName} onChange={(e) => editLook({ brandName: e.target.value })} />}</Field>
                <Field label="Full trading name" hint="On quotes, invoices and exports.">{(fid) => <input id={fid} className="field" value={look.legalName} onChange={(e) => editLook({ legalName: e.target.value })} />}</Field>
                <Field label="Line under the name" className="sm:col-span-2">{(fid) => <input id={fid} className="field" value={look.tagline} onChange={(e) => editLook({ tagline: e.target.value })} placeholder="Conservation contractors" />}</Field>
              </div>
              <div>
                <p className="mb-1 text-[0.93rem] font-medium">Colour</p>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Their colour">
                  {COLOURS.map(([value, label]) => (
                    <button key={value} type="button" aria-pressed={look.accent.toLowerCase() === value.toLowerCase()} onClick={() => editLook({ accent: value.toLowerCase() })} className={cx("press flex items-center gap-2 rounded-md border px-2.5 py-1.5", look.accent.toLowerCase() === value.toLowerCase() ? "border-accent bg-accent-soft" : "border-line-strong hover:border-accent")}>
                      <span className="size-4 rounded-full" style={{ background: value }} />
                      {label}
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <Field label="Or their own colour" hint="Six characters after the #.">{(fid) => <input id={fid} className={cx("field w-36 font-mono", !hex && "border-bad")} value={look.accent} onChange={(e) => editLook({ accent: e.target.value.trim() })} />}</Field>
                  <input type="color" aria-label="Pick a colour" className="h-9 w-12 cursor-pointer rounded-md border border-line-strong bg-surface" value={hex ? look.accent : "#4682b4"} onChange={(e) => editLook({ accent: e.target.value })} />
                </div>
              </div>
              <div>
                <p className="mb-1 text-[0.93rem] font-medium">Logo</p>
                <div className="flex flex-wrap items-center gap-3">
                  <PickFile
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    what="logo"
                    onFile={(f) => {
                      setError("");
                      // Drawn again as a JPEG, which also takes anything hidden out of an SVG; smaller again if still too big.
                      shrinkImage(f, 480, 0.9)
                        .then((pic) => (pic.dataUrl.length > 200_000 ? shrinkImage(f, 320, 0.8) : pic))
                        .then((pic) => (pic.dataUrl.length > 200_000 ? Promise.reject(new Error("That picture is too detailed to keep. Try a simpler logo file.")) : setLogo({ url: pic.dataUrl, changed: true })))
                        .catch((e: Error) => setError(e.message));
                    }}
                  />
                  {logo.url && (
                    <Button variant="ghost" onClick={() => setLogo({ url: "", changed: true })}>
                      Remove logo
                    </Button>
                  )}
                </div>
                <p className="mt-1 text-[0.87rem] text-muted">PNG, JPEG or SVG. A wide logo on a white background works best. Without one, the short name is shown as text.</p>
              </div>
              <div>
                <p className="mb-1 text-[0.93rem] font-medium">Region</p>
                <Segmented label="Region" value={look.region} onChange={(v) => editLook({ region: v })} options={[{ value: "IE", label: "Ireland" }, { value: "UK", label: "United Kingdom" }]} />
                <p className="mt-1 text-[0.87rem] text-muted">{look.region === "IE" ? "Euro, 13.5% VAT, Safe Pass, CVRT." : "Pounds, 20% VAT, CSCS card, MOT."} The sample projects and people stay ABC's invented ones.</p>
              </div>
            </Panel>
          </Section>

          <Section title="Their invoices">
            <Panel className="grid gap-3 px-4 py-4 sm:grid-cols-2">
              {TEXT_FIELDS.map((f) => (
                <Field key={f.key} label={f.label} className={f.wide ? "sm:col-span-2" : undefined}>
                  {(fid) =>
                    f.rows ? (
                      <textarea id={fid} rows={f.rows} className="field" value={String(design[f.key])} onChange={(e) => setField(f.key, e.target.value)} />
                    ) : (
                      <input id={fid} className="field" value={String(design[f.key])} onChange={(e) => setField(f.key, e.target.value)} />
                    )
                  }
                </Field>
              ))}
              <ul className="grid gap-1 sm:col-span-2 sm:grid-cols-2" aria-label="On the invoice">
                {SWITCHES.map((s) => (
                  <li key={s.key} className="flex items-center gap-2">
                    <Tick on={design[s.key]} label={s.label} onChange={() => setField(s.key, !design[s.key])} />
                    <span>{s.label}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </Section>

          {client && (
            <Section title="Remove this client">
              <Panel className="flex flex-wrap items-center gap-3 px-4 py-4">
                <p className="min-w-0 flex-1 basis-64 text-muted">Takes everyone on the list off Cloudflare and signs them out. Nothing in Vardil HQ is kept for them.</p>
                <Button onClick={() => setRemoving(true)}>Remove {client.name}</Button>
              </Panel>
            </Section>
          )}
          {dirty && <span className="sr-only">New client, not saved yet</span>}
        </div>

        <Section title="Preview">
          <Preview look={look} logo={logo.url} />
        </Section>
      </PageBody>
      {client && (
        <Dialog
          open={removing}
          onClose={() => setRemoving(false)}
          title={`Remove ${client.name}?`}
          footer={
            <>
              <Button onClick={() => setRemoving(false)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={async () => {
                  const r = await sendWorkspace({ action: "delete_client", id: client.id });
                  if (r.error) {
                    setRemoving(false);
                    return setError(r.error);
                  }
                  const cf = cloudflareNote(r);
                  toast(`${client.name} removed`);
                  navigate("/vardil/clients", { replace: true, state: { note: cf } });
                }}
              >
                Confirm remove
              </Button>
            </>
          }
        >
          <p>{client.emails.length ? `${client.emails.length === 1 ? "The one person" : `All ${client.emails.length} people`} on their list will be taken off Cloudflare and signed out now.` : "Nobody is on their list, so nobody is signed out."}</p>
        </Dialog>
      )}
    </>
  );
}

/** The top of their demo in their colour, drawn here with the look being edited rather than the one in force. */
function Preview({ look, logo }: { look: ClientLook; logo: string }) {
  const a = HEX.test(look.accent) ? look.accent : "#4682b4";
  return (
    <div role="figure" aria-label="Preview of their demo">
    <Panel className="overflow-hidden">
      <div className="border-b border-line px-4 py-3">{logo ? <img src={logo} alt={look.brandName} className="h-8 w-auto max-w-full" /> : <p className="font-display text-[1.4rem] leading-none font-semibold" style={{ color: `color-mix(in srgb, ${a} 68%, black)` }}>{look.brandName || "Name"}</p>}</div>
      <div className="grid gap-3 px-4 py-4">
        {look.tagline && <p className="text-muted">{look.tagline}</p>}
        <span className="w-fit rounded-md px-3 py-1.5 font-medium text-white" style={{ background: a }}>
          A main button
        </span>
        <p className="w-fit rounded px-2 py-0.5" style={{ background: `color-mix(in srgb, ${a} 13%, white)`, color: `color-mix(in srgb, ${a} 68%, black)` }}>
          A highlighted row
        </p>
        <p className="text-[0.87rem] text-muted">{look.legalName || look.brandName}</p>
      </div>
    </Panel>
    </div>
  );
}
