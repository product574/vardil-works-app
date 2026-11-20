import { useState } from "react";
import { Link } from "react-router-dom";
import { fixSnag, reopenSnag } from "@/data/actions";
import { useDay } from "@/data/store";
import type { Project, Snag } from "@/data/types";
import { whenInline } from "@/lib/format";
import { Badge, Button, Dialog, Empty } from "@/ui";
import { toast } from "@/ui/toast";

/**
 * A list of snags (20 Nov, decision 234): what, where, whose list it came from, who is to fix it,
 * and Mark fixed. The same rows serve the section's screen (with the site named on each) and a
 * project's own Variations tab. Marking one fixed can be undone from the message or the row.
 */
export function SnagList({ snags, projects, canFix, empty }: { snags: Snag[]; projects?: Project[]; canFix: (s: Snag) => boolean; empty: string }) {
  const day = useDay();
  const [photo, setPhoto] = useState<Snag | null>(null);
  if (snags.length === 0) return <Empty title={empty} />;
  return (
    <>
      <ul className="divide-y divide-line" aria-label="Snags">
        {snags.map((s) => {
          const p = projects?.find((x) => x.id === s.projectId);
          return (
            <li key={s.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-3 py-2.5">
              <div className="min-w-0 flex-1 basis-64">
                <p className="font-medium">{s.what}</p>
                <p className="text-[0.93rem] text-muted">
                  {p && (
                    <>
                      <Link to={`/projects/${p.code}?tab=variations`} className="underline-offset-2 hover:underline">
                        {p.code} {p.name}
                      </Link>
                      .{" "}
                    </>
                  )}
                  {s.where && `${s.where}. `}
                  {s.from === "client" ? "From the client's list" : "From our own walk-round"}, added by {s.raisedBy} {whenInline(s.raisedAt, day)}.
                  {s.status === "Open" ? (s.fixBy ? ` To be fixed by ${s.fixBy}.` : " Nobody is down to fix it yet.") : ` Fixed by ${s.fixedBy} ${whenInline(s.fixedAt ?? "", day)}.`}
                </p>
                {s.photo && (
                  <button type="button" className="press mt-0.5 text-[0.93rem] font-medium text-accent-ink underline-offset-2 hover:underline" onClick={() => setPhoto(s)}>
                    See the photo
                  </button>
                )}
              </div>
              <Badge tone={s.status === "Open" ? "warn" : "ok"}>{s.status}</Badge>
              {canFix(s) &&
                (s.status === "Open" ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      fixSnag(s.id);
                      toast("Snag marked fixed", { label: "Undo", run: () => reopenSnag(s.id) });
                    }}
                  >
                    Mark fixed
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      reopenSnag(s.id);
                      toast("Snag open again");
                    }}
                  >
                    Open again
                  </Button>
                ))}
            </li>
          );
        })}
      </ul>
      {photo?.photo && (
        <Dialog open onClose={() => setPhoto(null)} title={photo.what} wide>
          <img src={photo.photo.dataUrl} alt={`Photo of the snag: ${photo.what}`} className="mx-auto max-h-[60dvh] rounded-md border border-line" />
          <p className="mt-3 text-[0.93rem] text-muted">
            {photo.photo.name}. Added by {photo.photo.addedBy}.
          </p>
        </Dialog>
      )}
    </>
  );
}
