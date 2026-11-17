import { Link, Navigate } from "react-router-dom";
import { useAccess } from "@/data/access";
import { setSiteAccess, setSiteManager } from "@/data/actions";
import { co } from "@/data/place";
import { useData } from "@/data/store";
import { dShort, plural } from "@/lib/format";
import { siteAccessPeople, siteCell, siteCodes, siteManagerChoices, sitesToShare } from "@/lib/site-access";
import { Empty, PageBody, PageHead, Panel, Tick } from "@/ui";
import { toast } from "@/ui/toast";

const listed = (names: string[]) => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/**
 * Who runs each site, and who else can open it (Oisin, 17 Nov). A row per site that is live or
 * about to start: a box to pick its site manager, then a tick under each other site manager who
 * can open it as well. Above it, each site manager with the sites they have. Like Roles and
 * access, this is the managing director's alone, so nobody can give themselves a site.
 */
export function SiteAccess() {
  const db = useData((s) => s.db);
  const md = useAccess().role === "md";
  if (!md) return <Navigate to="/admin" replace />;
  const sites = sitesToShare(db.projects);
  const { choose, every } = siteAccessPeople(db);
  const given = db.siteAccess.filter((g) => sites.some((s) => s.id === g.projectId) && choose.some((p) => p.id === g.personId)).length;
  const name = (id: string) => db.people.find((p) => p.id === id)?.name ?? "";
  return (
    <>
      <PageHead
        title="Site access"
        note={`Pick who runs each site, and tick anyone else who should open it too. A site someone runs or is given is theirs in every way their level allows: the project page, its timesheet and plan, its requests, its group chat, and the job on their phone. ${given === 0 ? "Nobody has been given a site they do not run." : `${plural(given, "site")} ${given === 1 ? "has" : "have"} been given to someone who does not run ${given === 1 ? "it" : "them"}.`}`}
      />
      <PageBody className="grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-5">
        {choose.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" aria-label="Site managers and their sites">
            {choose.map((p) => {
              const c = siteCodes(sites, p.id, db.siteAccess);
              return (
                <li key={p.id} className="rounded-lg border border-line bg-surface px-4 py-3">
                  <h2 className="font-sans text-[0.93rem] font-semibold">{p.name}</h2>
                  <p className="mt-1 font-display text-[1.9rem] leading-none font-semibold tabular-nums">{c.runs.length + c.given.length}</p>
                  <p className="text-[0.87rem] text-muted">{c.runs.length + c.given.length === 1 ? "site" : "sites"}</p>
                  <p className="mt-2 text-[0.93rem]">{c.runs.length ? `Runs ${listed(c.runs)}` : "Runs no site"}</p>
                  {c.given.length > 0 && <p className="text-[0.93rem] text-muted">Also opens {listed(c.given)}</p>}
                </li>
              );
            })}
          </ul>
        )}

        <div>
          <p className="mb-2 max-w-[95ch] text-[0.93rem] text-muted">
            To put someone else in charge of a site, change the name under Site manager. Under each name on the right, a tick means they can open the site and a dash means they cannot. Click one in a box to change it.
          </p>
          <Panel className="overflow-x-auto">
            {sites.length === 0 || choose.length === 0 ? (
              <Empty title={sites.length === 0 ? "No sites are live or about to start" : "Nobody is at site manager level"}>Sites appear here once a quote is won, and people once they are set to the site manager level in Roles and access.</Empty>
            ) : (
              <table className="tbl" aria-label="Sites each site manager can open">
                <thead>
                  <tr>
                    <th>Site</th>
                    <th className="w-52">Site manager</th>
                    {choose.map((p) => (
                      <th key={p.id} scope="col" className="w-28 align-bottom whitespace-normal">
                        {p.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sites.map((site) => {
                    const choices = siteManagerChoices(db, site);
                    return (
                      <tr key={site.id}>
                        <th scope="row" className="text-left font-normal whitespace-normal">
                          <Link to={`/projects/${site.code}`} className="font-medium text-accent-ink underline-offset-2 hover:underline">
                            {site.code}
                          </Link>{" "}
                          <span className="font-medium text-ink">{site.name}</span>
                          <span className="block text-[0.87rem]">{site.status === "Not started" ? `Starts ${dShort(site.startDate)}` : co(site.county)}</span>
                        </th>
                        <td className="align-middle">
                          <select
                            className="field h-9"
                            aria-label={`Site manager for ${site.code} ${site.name}`}
                            value={site.siteManagerId}
                            onChange={(e) => {
                              const before = name(site.siteManagerId);
                              setSiteManager(site.id, e.target.value);
                              toast(`${name(e.target.value)} now runs ${site.code} ${site.name}. ${before} no longer opens it, unless you tick their name`);
                            }}
                          >
                            {choices.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        {choose.map((p) => {
                          const cell = siteCell(site, p.id, db.siteAccess);
                          return (
                            <td key={p.id} className="align-middle">
                              {cell === "runs" ? (
                                <span className="flex items-center text-[0.87rem] font-medium whitespace-nowrap text-accent-ink">
                                  <Tick on label={`${p.name} runs ${site.code} ${site.name}`} locked />
                                  Runs it
                                </span>
                              ) : (
                                <Tick
                                  on={cell === "given"}
                                  label={`${p.name}: ${site.code} ${site.name}`}
                                  onChange={() => {
                                    setSiteAccess(p.id, site.id, cell !== "given");
                                    toast(cell === "given" ? `${p.name} can no longer open ${site.code} ${site.name}` : `${p.name} can now open ${site.code} ${site.name}`);
                                  }}
                                />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Panel>
        </div>
        <p className="max-w-[80ch] text-[0.93rem] text-muted">
          What someone can do on a site is set for the level in{" "}
          <Link to="/admin/access" className="font-medium text-accent-ink underline-offset-2 hover:underline">
            Roles and access
          </Link>
          . The crew see whoever runs the site as their site manager, and their requests go to that person. Finished jobs stay with whoever ran them.
        </p>
        {every.length > 0 && (
          <p className="max-w-[80ch] text-[0.93rem] text-muted">
            {listed(every.map((p) => p.name))} {every.length === 1 ? "sees" : "see"} every project already, so there is no column for them. They can still be picked as a site manager. That is "See every project" under Roles and access, By person.
          </p>
        )}
      </PageBody>
    </>
  );
}
