import { Link, Navigate } from "react-router-dom";
import { useAccess } from "@/data/access";
import { setSiteAccess } from "@/data/actions";
import { co } from "@/data/place";
import { useData } from "@/data/store";
import { dShort, plural } from "@/lib/format";
import { siteAccessPeople, siteCell, siteCounts, sitesToShare } from "@/lib/site-access";
import { Empty, PageBody, PageHead, Panel, Switch } from "@/ui";
import { toast } from "@/ui/toast";

const listed = (names: string[]) => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/**
 * Which sites each site manager can open (Oisin, 17 Nov). A row per site that is live or about
 * to start, a column per site manager. Whoever runs a site always opens it; the managing director
 * switches a site on for anyone else who should have it. Like Roles and access, this is the
 * managing director's alone, so nobody can give themselves a site.
 */
export function SiteAccess() {
  const db = useData((s) => s.db);
  const md = useAccess().role === "md";
  if (!md) return <Navigate to="/admin" replace />;
  const sites = sitesToShare(db.projects);
  const { choose, every } = siteAccessPeople(db);
  const given = db.siteAccess.filter((g) => sites.some((s) => s.id === g.projectId) && choose.some((p) => p.id === g.personId)).length;
  return (
    <>
      <PageHead
        title="Site access"
        note={`Decide which sites each site manager can open. Everyone opens the sites they run. Switch a site on for someone else and they get it as one of their own: the project page, its timesheet and plan, its requests, its group chat, and the job on their phone. ${given === 0 ? "Nobody has been given a site they do not run." : `${plural(given, "site has", "sites have")} been given to someone who does not run ${given === 1 ? "it" : "them"}.`}`}
      />
      <PageBody className="grid max-w-5xl gap-3">
        <Panel className="overflow-x-auto">
          {sites.length === 0 || choose.length === 0 ? (
            <Empty title={sites.length === 0 ? "No sites are live or about to start" : "Nobody is at site manager level"}>Sites appear here once a quote is won, and people once they are set to the site manager level in Roles and access.</Empty>
          ) : (
            <table className="tbl" aria-label="Sites each site manager can open">
              <thead>
                <tr>
                  <th>Site</th>
                  {choose.map((p) => {
                    const n = siteCounts(sites, p.id, db.siteAccess);
                    return (
                      <th key={p.id} scope="col" className="w-28 align-bottom whitespace-normal">
                        {p.name}
                        <span className="block font-normal">{plural(n.runs + n.given, "site")}</span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sites.map((site) => (
                  <tr key={site.id}>
                    <th scope="row" className="text-left font-normal whitespace-normal">
                      <Link to={`/projects/${site.code}`} className="font-medium text-accent-ink underline-offset-2 hover:underline">
                        {site.code}
                      </Link>{" "}
                      <span className="font-medium text-ink">{site.name}</span>
                      <span className="block text-[0.87rem]">{site.status === "Not started" ? `Starts ${dShort(site.startDate)}` : co(site.county)}</span>
                    </th>
                    {choose.map((p) => {
                      const cell = siteCell(site, p.id, db.siteAccess);
                      return (
                        <td key={p.id} className="align-middle">
                          {cell === "runs" ? (
                            <span className="text-[0.93rem] text-muted">Runs it</span>
                          ) : (
                            <Switch
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
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <p className="max-w-[75ch] text-[0.93rem] text-muted">
          What someone can do on a site they are given is the same as on their own, set for the level in{" "}
          <Link to="/admin/access" className="font-medium text-accent-ink underline-offset-2 hover:underline">
            Roles and access
          </Link>
          . The crew still see whoever runs the site as their site manager. Finished jobs stay with whoever ran them.
        </p>
        {every.length > 0 && (
          <p className="max-w-[75ch] text-[0.93rem] text-muted">
            {listed(every.map((p) => p.name))} {every.length === 1 ? "sees" : "see"} every project already, so there is nothing to pick for them. That is "See every project" under Roles and access, By person.
          </p>
        )}
      </PageBody>
    </>
  );
}
