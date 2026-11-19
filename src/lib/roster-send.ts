/**
 * The week's roster as each person gets it by email and WhatsApp (19 Nov, Oisin's pick: "each
 * person their own week"). Pure: the screen shows these messages, and the action files them.
 * In the demo nothing leaves the browser; a real build sends the same text.
 */
import type { Connections, Holiday, Person, PlanEntry, Project } from "@/data/types";

export type RosterMessage = { personId: string; name: string; to: string; via: "email" | "whatsapp"; text: string };

const dayName = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-IE", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });

/** What is missing before the week can go out, in plain words. Null when it can. */
export function rosterBlocker(c: Connections): string | null {
  if (!c.email && !c.whatsapp) return "Connect email or WhatsApp in Admin, Connections first.";
  return null;
}

/**
 * One message per person and channel: their days, the site and its address, and who runs it.
 * Only people with something planned that week get one. Email goes where they have an address and
 * email is connected; WhatsApp where they have a phone and WhatsApp is connected.
 */
export function rosterMessages(args: { week: string[]; plan: Pick<PlanEntry, "personId" | "projectId" | "date" | "part">[]; people: Person[]; projects: Project[]; holidays: Pick<Holiday, "personId" | "status" | "from" | "to">[]; connections: Connections; firm: string }): RosterMessage[] {
  const { week, plan, people, projects, holidays, connections, firm } = args;
  const ids = [...new Set(plan.filter((p) => week.includes(p.date)).map((p) => p.personId))];
  const out: RosterMessage[] = [];
  for (const id of ids) {
    const person = people.find((p) => p.id === id && p.active);
    if (!person) continue;
    const lines = week.map((d) => {
      const rows = plan.filter((p) => p.personId === id && p.date === d);
      const off = holidays.some((h) => h.personId === id && h.status === "Approved" && d >= h.from && d <= h.to);
      if (rows.length === 0) return `${dayName(d)}: ${off ? "on leave" : "not planned yet"}`;
      return `${dayName(d)}: ${rows
        .map((r) => {
          const site = projects.find((p) => p.id === r.projectId);
          const boss = people.find((p) => p.id === site?.siteManagerId);
          return `${site?.code} ${site?.name}, ${site?.location}${r.part === "half" ? " (half day)" : ""}${boss ? `. Site manager ${boss.name}, ${boss.phone}` : ""}`;
        })
        .join("; ")}`;
    });
    const first = person.name.split(" ")[0];
    const text = `Hi ${first}, your week from ${dayName(week[0]!)}:\n${lines.join("\n")}\nIf anything is wrong, reply to this message or tell your site manager. ${firm}`;
    if (connections.email && person.email) out.push({ personId: id, name: person.name, to: person.email, via: "email", text });
    if (connections.whatsapp && person.phone) out.push({ personId: id, name: person.name, to: person.phone, via: "whatsapp", text });
  }
  return out;
}
