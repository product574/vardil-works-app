import { pct1 } from "@/lib/money";
import { marginFlag } from "@/lib/quotes";
import { cx } from "./index";

/** An estimated or actual margin in a table: thin in amber, a loss in red, none as a dash. */
export function MarginCell({ m, note }: { m: number | null; note?: string }) {
  const flag = marginFlag(m);
  return (
    <td className={cx("num", flag === "loss" ? "text-bad" : flag === "thin" ? "text-warn" : "")}>
      {m == null ? <span className="text-muted">-</span> : pct1(m)}
      {note && <span className="block text-[0.8125rem] text-muted">{note}</span>}
    </td>
  );
}
