import { useState } from "react";
import { connectEmail, connectWhatsApp, disconnect } from "@/data/actions";
import { useData, usePrefs } from "@/data/store";
import { dFull } from "@/lib/format";
import { CHAT_APP_NAME } from "@/lib/chat";
import { PACKAGE } from "@/lib/accounts-export";
import { Badge, Button, Dialog, Field, PageBody, PageHead, Panel, Section, Segmented } from "@/ui";
import { toast } from "@/ui/toast";

/**
 * What the system connects to in a real build (Admin, 16 Nov, after the templates Aodhan shared
 * all had one). In the demo nothing is connected, and the page says so: the sample data stands
 * in for each one.
 */
export function Connections() {
  const brand = usePrefs((s) => s.brand);
  const setBrand = usePrefs((s) => s.setBrand);
  const uk = brand.region === "UK";
  const rows: [name: string, what: string][] = [
    ["Microsoft 365", `Email for info@, accounts@ and each person's own mailbox. A reply approved here goes out from Outlook, in the same thread.`],
    [CHAT_APP_NAME[brand.chatApp], "Team chat: each channel is read as messages arrive, anything someone has to act on is tagged and passed to them, and a reply approved here is posted in the same channel."],
    [PACKAGE, "Client invoices and approved supplier and subcontractor invoices go across with their nominal codes and departments, so nobody types them twice. Sage keeps the VAT return, payroll and the bank."],
    [uk ? "HMRC, Construction Industry Scheme" : "Revenue, Relevant Contracts Tax", uk ? "Subcontractors verified and the right deduction taken before each payment." : "Subcontract payments notified and the deduction rate checked before each payment."],
    ["The firm's bank", "Payments in are matched to invoices each morning, so Overdue is right before anyone looks."],
    ["SharePoint", "Project files kept in the firm's own storage, one folder per project, the same folders as on each project's Files tab."],
  ];
  return (
    <>
      <PageHead title="Connections" note="The systems this connects to when it is built for a firm. In this demo nothing is connected: the sample data stands in for each one, and nothing leaves this browser." />
      <PageBody>
        <MessagingConnections />
        <div className="mb-4 flex max-w-5xl flex-wrap items-center gap-3">
          <p className="mr-auto">Team chat runs on</p>
          <Segmented
            label="Team chat app"
            value={brand.chatApp}
            onChange={(v) => { setBrand({ chatApp: v }); toast(`Team chat now shows ${CHAT_APP_NAME[v]}`); }}
            options={[{ value: "teams", label: "Microsoft Teams" }, { value: "slack", label: "Slack" }]}
          />
        </div>
        <Panel className="max-w-5xl overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>System</th>
                <th>What it does here</th>
                <th>In this demo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([name, what]) => (
                <tr key={name}>
                  <td className="font-medium whitespace-nowrap">{name}</td>
                  <td>{what}</td>
                  <td className="whitespace-nowrap text-muted">Sample data</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </PageBody>
    </>
  );
}

/**
 * Email and WhatsApp (19 Nov): what the week's roster goes out by (Schedule, Send the week). In
 * the demo the sign-in is pretend and nothing leaves this browser; a real build connects the
 * firm's own Google or Microsoft mailbox and its WhatsApp Business number.
 */
function MessagingConnections() {
  const c = useData((s) => s.db.connections);
  const [open, setOpen] = useState<"email" | "whatsapp" | null>(null);
  const rows: { key: "email" | "whatsapp"; name: string; what: string; on: string | null; since?: string }[] = [
    { key: "email", name: "Email (Gmail or Outlook)", what: "Each person's week goes to their own email address.", on: c.email ? `${c.email.provider}, ${c.email.account}` : null, ...(c.email ? { since: c.email.at } : {}) },
    { key: "whatsapp", name: "WhatsApp Business", what: "Each person's week goes to their phone by WhatsApp.", on: c.whatsapp ? c.whatsapp.number : null, ...(c.whatsapp ? { since: c.whatsapp.at } : {}) },
  ];
  return (
    <Section title="Messages to your people" className="mb-6 max-w-5xl">
      <Panel>
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1 basis-64">
                <span className="block font-medium">{r.name}</span>
                <span className="block text-[0.93rem] text-muted">{r.on ? `Connected: ${r.on}, since ${dFull(r.since!.slice(0, 10))}` : r.what}</span>
              </span>
              {r.on ? (
                <>
                  <Badge tone="ok">Connected</Badge>
                  <Button size="sm" variant="ghost" onClick={() => { disconnect(r.key); toast(`${r.name} disconnected`); }}>
                    Disconnect
                  </Button>
                </>
              ) : (
                <Button variant="primary" onClick={() => setOpen(r.key)}>
                  Connect
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Panel>
      <p className="mt-2 text-[0.93rem] text-muted">In this demo the sign-in is pretend and nothing is sent: Schedule shows each message as it would arrive.</p>
      {open && <ConnectDialog which={open} onClose={() => setOpen(null)} />}
    </Section>
  );
}

function ConnectDialog({ which, onClose }: { which: "email" | "whatsapp"; onClose: () => void }) {
  const brand = usePrefs((s) => s.brand);
  const [provider, setProvider] = useState<"Gmail" | "Outlook">("Outlook");
  const [account, setAccount] = useState(which === "email" ? `office@${brand.emailDomain}` : "+353 91 555 0100");
  const ok = which === "email" ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.trim()) : account.replace(/\D/g, "").length >= 9;
  return (
    <Dialog
      open
      onClose={onClose}
      title={which === "email" ? "Connect email" : "Connect WhatsApp Business"}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!ok}
            onClick={() => {
              if (which === "email") connectEmail(provider, account);
              else connectWhatsApp(account);
              toast(which === "email" ? `${provider} connected: ${account.trim()}` : `WhatsApp Business connected: ${account.trim()}`);
              onClose();
            }}
          >
            {which === "email" ? `Sign in with ${provider === "Gmail" ? "Google" : "Microsoft"}` : "Connect"}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        {which === "email" && <Segmented label="Mailbox" value={provider} onChange={setProvider} options={[{ value: "Outlook", label: "Outlook" }, { value: "Gmail", label: "Gmail" }]} />}
        <Field label={which === "email" ? "The mailbox the roster comes from" : "The firm's WhatsApp Business number"}>{(id) => <input id={id} className="field" value={account} onChange={(e) => setAccount(e.target.value)} />}</Field>
        <p className="text-[0.93rem] text-muted">{which === "email" ? "A real build opens the Google or Microsoft sign-in here. In this demo it is pretend." : "A real build links the number through Meta's WhatsApp Business platform. In this demo it is pretend."}</p>
      </div>
    </Dialog>
  );
}
