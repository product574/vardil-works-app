import { useState } from "react";
import { authMode } from "@/app/auth";
import { DEFAULT_BRAND, DEMO_BUILT_BY, DEMO_BUILT_BY_URL } from "@/config/brand";
import { useData, usePrefs } from "@/data/store";
import { PACKAGE_NAME } from "@/lib/accounts-export";
import { shrinkImage } from "@/lib/image";
import { REGION } from "@/lib/money";
import { Button, cx, Dialog, Fact, Field, PageBody, PageHead, Panel, Section, Segmented } from "@/ui";
import { PickFile } from "@/ui/files";
import { toast } from "@/ui/toast";

const COLOURS: [string, string][] = [
  ["#4682B4", "Steel blue"],
  ["#2F6F5E", "Slate green"],
  ["#8A4B2A", "Brick"],
  ["#5B5F97", "Indigo"],
  ["#3F4A56", "Graphite"],
  ["#B26A00", "Ochre"],
];

/** Re-brand the demo for a prospect: name, colour and logo. Applies straight away and survives a data reset. */
export function Branding() {
  const brand = usePrefs((s) => s.brand);
  const edits = usePrefs((s) => s.brandEdits);
  const setBrand = usePrefs((s) => s.setBrand);
  const resetBrand = usePrefs((s) => s.resetBrand);
  const [error, setError] = useState("");
  const changed = Object.keys(edits).some((k) => ["brandName", "legalName", "tagline", "accent", "logoUrl"].includes(k));
  const hex = /^#[0-9a-f]{6}$/i.test(brand.accent);
  return (
    <>
      <PageHead
        title="Branding"
        note="Put a prospect's own name, colour and logo on the demo before a call. It changes everywhere at once, including the sign-in page and the documents."
        actions={
          changed && (
            <Button
              onClick={() => {
                const { region, accountsPackage, chatApp } = brand;
                resetBrand();
                setBrand({ region, accountsPackage, chatApp });
                toast(`Back to ${DEFAULT_BRAND.brandName}`);
              }}
            >
              Back to {DEFAULT_BRAND.brandName}
            </Button>
          )
        }
      />
      <PageBody className="grid max-w-5xl items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid gap-5">
          <Section title="Name">
            <Panel className="grid gap-3 px-4 py-4 sm:grid-cols-2">
              <Field label="Short name" hint="Top left of every screen.">{(id) => <input id={id} className="field" value={brand.brandName} onChange={(e) => setBrand({ brandName: e.target.value })} />}</Field>
              <Field label="Full trading name" hint="On quotes, invoices and exports.">{(id) => <input id={id} className="field" value={brand.legalName} onChange={(e) => setBrand({ legalName: e.target.value })} />}</Field>
              <Field label="Line under the name" className="sm:col-span-2">{(id) => <input id={id} className="field" value={brand.tagline} onChange={(e) => setBrand({ tagline: e.target.value })} />}</Field>
            </Panel>
          </Section>
          <Section title="Colour">
            <Panel className="px-4 py-4">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Accent colour">
                {COLOURS.map(([value, name]) => (
                  <button key={value} type="button" aria-pressed={brand.accent.toLowerCase() === value.toLowerCase()} onClick={() => setBrand({ accent: value })} className={cx("press flex items-center gap-2 rounded-md border px-2.5 py-1.5", brand.accent.toLowerCase() === value.toLowerCase() ? "border-accent bg-accent-soft" : "border-line-strong hover:border-accent")}>
                    <span className="size-4 rounded-full" style={{ background: value }} />
                    {name}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <Field label="Or the firm's own colour" hint="Six characters after the #, as their designer would give it.">{(id) => <input id={id} className={cx("field w-36 font-mono", !hex && "border-bad")} value={brand.accent} onChange={(e) => setBrand({ accent: e.target.value.trim() })} />}</Field>
                <input type="color" aria-label="Pick a colour" className="h-9 w-12 cursor-pointer rounded-md border border-line-strong bg-surface" value={hex ? brand.accent : DEFAULT_BRAND.accent} onChange={(e) => setBrand({ accent: e.target.value })} />
              </div>
              {!hex && <p className="mt-1 text-bad">That is not a colour code yet. It needs a # and six characters, such as #4682B4.</p>}
            </Panel>
          </Section>
          <Section title="Logo">
            <Panel className="px-4 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <PickFile accept="image/*" what="logo" onFile={(f) => { setError(""); shrinkImage(f, 480, 0.9).then((pic) => setBrand({ logoUrl: pic.dataUrl })).catch((e: Error) => setError(e.message)); }} />
                {brand.logoUrl && (
                  <Button variant="ghost" onClick={() => setBrand({ logoUrl: "" })}>
                    Remove logo
                  </Button>
                )}
              </div>
              <p className="mt-1 text-[0.87rem] text-muted">A wide logo on a white or clear background works best. Without one, the short name is shown as text.</p>
              <p role="alert" className="text-bad">
                {error}
              </p>
            </Panel>
          </Section>
        </div>
        <Section title="How it looks">
          <Panel className="overflow-hidden">
            <div className="border-b border-line px-4 py-3">{brand.logoUrl ? <img src={brand.logoUrl} alt={brand.brandName} className="h-8 w-auto" /> : <p className="font-display text-[1.4rem] leading-none font-semibold text-accent-ink">{brand.brandName || "Name"}</p>}</div>
            <div className="grid gap-3 px-4 py-4">
              <p className="text-muted">{brand.tagline}</p>
              <Button variant="primary" className="w-fit">
                A main button
              </Button>
              <p>
                A link looks <span className="font-medium text-accent-ink underline underline-offset-2">like this</span>.
              </p>
              <p className="w-fit rounded bg-accent-soft px-2 py-0.5 text-accent-ink">A highlighted row</p>
              <p className="text-[0.87rem] text-muted">{brand.legalName}</p>
            </div>
          </Panel>
        </Section>
      </PageBody>
    </>
  );
}

/** Ireland or the UK, and which accounts package the firm uses. */
export function RegionAccounts() {
  const brand = usePrefs((s) => s.brand);
  const setBrand = usePrefs((s) => s.setBrand);
  const reset = useData((s) => s.reset);
  const [to, setTo] = useState<"IE" | "UK" | null>(null);
  const WHAT: Record<"IE" | "UK", string[]> = {
    IE: ["Euro", `VAT at ${REGION.IE.vatPct}% on the work`, "Counties written Co. Galway", "Vehicle test called CVRT", "Irish phone numbers and number plates"],
    UK: ["Pounds sterling", `VAT at ${REGION.UK.vatPct}%`, "UK counties", "Vehicle test called MOT", "UK phone numbers and number plates"],
  };
  return (
    <>
      <PageHead title="Region and accounts" note="Set these to match the prospect before a call, so the money, the place names and the export file all look like theirs." />
      <PageBody className="grid max-w-3xl gap-6">
        <Section title="Region">
          <Panel className="px-4 py-4">
            <Segmented label="Region" value={brand.region} onChange={(v) => v !== brand.region && setTo(v)} options={[{ value: "IE", label: "Ireland" }, { value: "UK", label: "United Kingdom" }]} />
            <ul className="mt-3 grid gap-1 text-muted">
              {WHAT[brand.region].map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <p className="mt-3 text-[0.93rem] text-muted">Firm, town and people names in the sample data are invented and stay the same in both.</p>
          </Panel>
        </Section>
        <Section title="Accounts package">
          <Panel className="px-4 py-4">
            <Segmented label="Accounts package" value={brand.accountsPackage} onChange={(v) => { setBrand({ accountsPackage: v }); toast(`Exports will be laid out for ${PACKAGE_NAME[v]}`); }} options={[{ value: "sage50", label: "Sage 50" }, { value: "xero", label: "Xero" }, { value: "sheet", label: "Spreadsheet" }]} />
            <p className="mt-3 text-muted">Decides the layout of the file on Invoicing, Accounts export. Changing it never touches the data.</p>
          </Panel>
        </Section>
      </PageBody>
      <Dialog
        open={to !== null}
        onClose={() => setTo(null)}
        title={`Switch to ${to === "UK" ? "the United Kingdom" : "Ireland"}?`}
        footer={
          <>
            <Button onClick={() => setTo(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!to) return;
                setBrand({ region: to });
                reset();
                toast(`Now set up for ${to === "UK" ? "the United Kingdom" : "Ireland"}, with fresh sample data`);
                setTo(null);
              }}
            >
              Switch and rebuild the sample data
            </Button>
          </>
        }
      >
        <p>The sample data is rebuilt for the new region, so anything you have changed in this demo (approvals, photos, plans) goes back to the starting point. Branding and access settings for people are rebuilt too; your name, colour and logo are kept.</p>
      </Dialog>
    </>
  );
}

export function About() {
  const brand = usePrefs((s) => s.brand);
  const db = useData((s) => s.db);
  const day = useData((s) => s.day);
  return (
    <>
      <PageHead title="About this demo" note="A working demonstration of an operations system for a construction contractor. Everything on screen is sample data held in this browser." />
      <PageBody className="grid max-w-3xl gap-6">
        <Section title="What you are looking at">
          <Panel className="grid gap-2 px-4 py-4">
            <p>One system for the whole firm: sales, projects, the weekly plan, people, plant and fleet, files, invoicing, the shared email, a client portal, a phone view for the crew, and an admin area for requests, access and billing.</p>
            <p>The firm is invented. It is set up as a conservation and restoration contractor so the detail is realistic, and it can be re-branded for any contractor under Branding.</p>
            <p>Where the system reads paperwork, drafts a reply or suggests where something belongs, a person always checks and approves it. Nothing is sent on its own.</p>
          </Panel>
        </Section>
        <Section title="The sample data">
          <Panel className="px-4 py-2">
            <dl>
              <Fact label="Today in the demo">{new Date(day + "T12:00:00Z").toLocaleDateString("en-IE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</Fact>
              <Fact label="Set up for">
                {brand.region === "UK" ? "United Kingdom" : "Ireland"}, {PACKAGE_NAME[brand.accountsPackage]}
              </Fact>
              <Fact label="In it">
                {db.projects.length} projects, {db.people.filter((p) => p.active).length} people, {db.quotes.length} quotes, {db.plant.length} items of plant, {db.vehicles.filter((v) => v.active).length} vehicles, {db.files.length} files
              </Fact>
              <Fact label="Where it lives">
                {authMode === "access"
                  ? "In this browser only, and nobody else sees it. The one exception is Ask AI: a question goes to the AI model with a summary of this sample data, and Vardil keeps a record of the questions asked."
                  : "In this browser only. Nothing you do here is sent anywhere, and nobody else sees it."}
              </Fact>
              <Fact label="To start again">Click your initials at the top right, then Reset demo data.</Fact>
            </dl>
          </Panel>
        </Section>
        <p className="text-muted">
          Built by{" "}
          <a href={DEMO_BUILT_BY_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-accent-ink underline underline-offset-2">
            {DEMO_BUILT_BY}
          </a>
          .
        </p>
      </PageBody>
    </>
  );
}
