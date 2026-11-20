/**
 * Snags (20 Nov, decision 234). No random numbers, so nothing else in the sample data moves.
 *
 * Glebe House (C716) finished last week with its final account on hold for snagging: the client's
 * list from the handover walk-round, most of it still open. St Colman's wall (C715) had two snags
 * of the firm's own, both put right before it was handed over, so its hold is for variations only.
 */
import type { Db, Snag } from "../types";
import { at, workdays } from "./util";

type S = [code: string, what: string, where: string, from: Snag["from"], fixBy: string | null, raisedDaysAfterEnd: number, time: string, fixedDaysAfterEnd?: number];

const LIST: S[] = [
  ["C716", "Two sashes sticking after painting", "First floor, landing and back bedroom", "client", "p-121", 1, "11:10"],
  ["C716", "Paint run on the front door case, left pilaster", "Front door", "client", "p-121", 1, "11:15"],
  ["C716", "Sash cord frayed where it meets the pulley", "Dining room, east window", "client", "p-114", 1, "11:20"],
  ["C716", "Putty line uneven on one pane", "Kitchen window", "client", "p-121", 1, "11:25", 3],
  ["C715", "Coping stone not bedded fully at the gate pier", "East end, by the gate", "own", "p-128", -2, "15:40", -1],
  ["C715", "Mortar staining on two headstones beside the rebuilt section", "Graveyard side", "own", "p-104", -2, "15:50", 0],
];

export function seedSnags(today: string, projects: Db["projects"], people: Db["people"]): Snag[] {
  const name = (id: string | null) => (id ? people.find((p) => p.id === id)?.name : undefined);
  const out: Snag[] = [];
  LIST.forEach(([code, what, where, from, fixBy, raised, time, fixed], n) => {
    const p = projects.find((x) => x.code === code);
    if (!p) return;
    const manager = name(p.siteManagerId) ?? "The site manager";
    const cap = (d: string) => (d > today ? today : d);
    const fixer = name(fixBy);
    out.push({
      id: `snag-${n + 1}`,
      projectId: p.id,
      what,
      where,
      from,
      ...(fixer ? { fixBy: fixer } : {}),
      raisedBy: manager,
      raisedAt: at(cap(workdays(p.endDate, raised)), time),
      ...(fixed === undefined ? { status: "Open" as const } : { status: "Fixed" as const, fixedBy: fixer ?? manager, fixedAt: at(cap(workdays(p.endDate, fixed)), "16:05") }),
    });
  });
  // Newest first, as the actions keep them.
  return out.sort((a, b) => b.raisedAt.localeCompare(a.raisedAt) || a.id.localeCompare(b.id));
}
