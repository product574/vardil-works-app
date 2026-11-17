import { actAs, closeRequest, forwardCrewRequest } from "@/data/actions";
import { Button } from "@/ui";
import { toast } from "@/ui/toast";

/**
 * What a site manager does with a request from his crew: pass it to management as his own, or
 * deal with it on site. `as` is the site manager when the office is looking at his phone.
 */
export function CrewRequestButtons({ id, what, big, as }: { id: string; what: string; big?: boolean; as?: string }) {
  const run = (fn: () => void) => (as ? actAs(as, fn) : fn());
  return (
    <span className="flex flex-wrap gap-2">
      <Button
        size={big ? "lg" : "sm"}
        aria-label={`Mark dealt with: ${what}`}
        onClick={() => {
          run(() => closeRequest(id));
          toast("Marked as dealt with on site");
        }}
      >
        Mark dealt with
      </Button>
      <Button
        size={big ? "lg" : "sm"}
        variant="primary"
        aria-label={`Forward to management: ${what}`}
        onClick={() => {
          run(() => forwardCrewRequest(id));
          toast("Sent to management as your request. It waits for a yes or no in Admin");
        }}
      >
        Forward to management
      </Button>
    </span>
  );
}
