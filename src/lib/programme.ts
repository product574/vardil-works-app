/**
 * A project's programme (20 Nov, the Oldstone template): each item of the scope as a bar across
 * the weeks, worked out from the job's start and finish, with today marked and late items in red.
 * The client's own programme file (MS Project or PDF) can be attached beside it. Pure, with tests.
 */
import type { Project, ScopeTask } from "@/data/types";
import { addDays, weekStartOf } from "./dates";
import { daysBetween } from "./status";

export type ProgrammeState = "done" | "late" | "now" | "later";
export type ProgrammeRow = { id: string; label: string; start: string; end: string; state: ProgrammeState; doneOn?: string; lateBy: number };
export const PROGRAMME_LABEL: Record<ProgrammeState, string> = { done: "Done", late: "Running late", now: "Under way", later: "To come" };

/**
 * The scope items in order, spread across the job: each starts a share of the way through and
 * runs a little longer than its share, so neighbouring items overlap as they do on site.
 */
export function programme(p: Pick<Project, "startDate" | "endDate">, tasks: Pick<ScopeTask, "id" | "description" | "done" | "completedAt">[], today: string): ProgrammeRow[] {
  const span = Math.max(1, daysBetween(p.startDate, p.endDate));
  const n = tasks.length;
  return tasks.map((t, i) => {
    const start = addDays(p.startDate, Math.floor((span * i) / n));
    const end = addDays(p.startDate, Math.min(span, Math.ceil((span * (i + 1.35)) / n)));
    const doneOn = t.done ? t.completedAt?.slice(0, 10) : undefined;
    const state: ProgrammeState = t.done ? "done" : end < today ? "late" : start <= today ? "now" : "later";
    return { id: t.id, label: t.description, start, end, state, ...(doneOn ? { doneOn } : {}), lateBy: state === "late" ? daysBetween(end, today) : 0 };
  });
}

/** The Monday of every week the programme covers, for the heading. */
export function programmeWeeks(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = weekStartOf(from); d <= to; d = addDays(d, 7)) out.push(d);
  return out;
}

/** Where a day falls along the programme, as a share from 0 to 1, for drawing bars and the today line. */
export const along = (day: string, from: string, to: string) => Math.min(1, Math.max(0, daysBetween(from, day) / Math.max(1, daysBetween(from, to))));
