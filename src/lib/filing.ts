/**
 * Where an unfiled document most likely belongs. Stands in for the model that reads what
 * arrives by email: it looks at the file name and who sent it, and suggests a project and a
 * folder with the reason, for a person to accept or change.
 */

export type FilingInput = { name: string; kind: string; addedBy: string; forProjectId?: string };
export type FilingContext = {
  projects: { id: string; code: string; name: string; description: string; status: string }[];
  /** People and the live sites they are on. */
  rosters: { personName: string; projectId: string }[];
  /** Suppliers and hire companies, with the project their most recent paperwork was for. */
  suppliers: { name: string; projectId: string }[];
};
export type Filing = { projectId: string | null; category: string; why: string };

const FOLDER_RULES: [RegExp, string][] = [
  [/handover cert|permit|risk|rams|safety|inspection/i, "Health and safety"],
  [/schedule rev|drawing|elevation|section|plan\b|rev [a-z]\b/i, "Drawings"],
  [/batch cert|test cert|conservation|mortar analysis|report/i, "Conservation reports"],
  [/docket|invoice|statement|credit note/i, "Invoices"],
  [/method statement/i, "Method statements"],
  [/photo|\.jpe?g$|\.png$|\.mp4$/i, "Photos and videos"],
];

/** Words that turn up in any firm's paperwork and say nothing about which job it is for. */
const COMMON = new Set(["renewal", "schedule", "revised", "certificate", "delivery", "docket", "insurance", "photo", "caption", "batch", "handover", "repair", "repairs", "works", "house", "church"]);
const words = (t: string) => (t.toLowerCase().match(/[a-z]{5,}/g) ?? []).filter((w) => !COMMON.has(w));

/** "C719, C720 and C722". */
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export function suggestFiling(f: FilingInput, ctx: FilingContext): Filing {
  const category = f.kind === "drawing" ? "Drawings" : (FOLDER_RULES.find(([re]) => re.test(f.name))?.[1] ?? "Correspondence");
  // 0. Whoever added it said which project it is for (the top bar's Add file, 21 Nov): only its folder is left to pick.
  const said = f.forProjectId ? ctx.projects.find((p) => p.id === f.forProjectId) : undefined;
  if (said) return { projectId: said.id, category, why: `${f.addedBy} added it for ${said.code}. It needs its folder` };
  const live = ctx.projects.filter((p) => p.status === "Live");
  const code = (id: string) => ctx.projects.find((p) => p.id === id)?.code ?? "";

  // 1. A site code written in the file name settles it.
  const named = ctx.projects.find((p) => f.name.toUpperCase().includes(p.code));
  if (named) return { projectId: named.id, category, why: `The file name mentions ${named.code}` };

  // 2. Sent by someone who is on exactly one live site.
  const sites = [...new Set(ctx.rosters.filter((r) => r.personName === f.addedBy).map((r) => r.projectId))];
  if (sites.length === 1) return { projectId: sites[0]!, category, why: `${f.addedBy} is on ${code(sites[0]!)} this week` };

  // 3. Sent by a supplier whose paperwork has all been for one project.
  const from = [...new Set(ctx.suppliers.filter((s) => s.name === f.addedBy).map((s) => s.projectId))];
  if (from.length === 1) return { projectId: from[0]!, category, why: `${f.addedBy} is supplying ${code(from[0]!)}` };

  // 4. Words in the file name that appear in exactly one live project's description.
  const hits = live.filter((p) => words(f.name).some((w) => words(`${p.name} ${p.description}`).some((x) => x.startsWith(w.replace(/s$/, "")) || w.startsWith(x.replace(/s$/, "")))));
  if (hits.length === 1) return { projectId: hits[0]!.id, category, why: `"${f.name.replace(/\.[a-z0-9]+$/i, "")}" matches the work on ${hits[0]!.code}` };

  if (from.length > 1) return { projectId: null, category, why: `${f.addedBy} supplies ${list(from.map(code).sort())}, so the project needs choosing` };
  return { projectId: null, category, why: "Nothing in the name or sender points to one project" };
}
