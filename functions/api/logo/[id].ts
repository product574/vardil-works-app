/**
 * /api/logo/<client id>: a client's logo (20 Nov), for their own people and for Vardil staff.
 * Kept on the server as a JPEG or PNG picture, checked when it was saved, and sent back as an
 * image only: never anything a browser would run.
 */
import { ensureWorkspaceSchema, logoFor } from "../../../server/workspace";
import { type Env, who } from "../workspace";

const none = () => new Response("Not found", { status: 404, headers: { "content-type": "text/plain", "cache-control": "no-store" } });

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const id = typeof params.id === "string" ? params.id : "";
  if (!/^[a-z0-9-]{4,64}$/i.test(id)) return none();
  const me = await who(request, env);
  if (!me || !env.DB) return none();
  await ensureWorkspaceSchema(env.DB);
  const logo = await logoFor(env.DB, id, me.email, me.staff);
  const m = logo ? /^data:(image\/(?:jpeg|png));base64,(.+)$/i.exec(logo) : null;
  if (!m) return none();
  const bytes = Uint8Array.from(atob(m[2]!), (c) => c.charCodeAt(0));
  return new Response(bytes, {
    headers: {
      "content-type": m[1]!.toLowerCase(),
      // The address changes with the logo, so it can be kept, but only by this person's browser.
      "cache-control": "private, max-age=86400",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'",
    },
  });
};
