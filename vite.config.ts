import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { fileURLToPath, URL } from "node:url";

/**
 * Two builds:
 *  - `npm run build` makes the normal site in dist/ for hosting.
 *  - `npm run build:preview` makes one self-contained HTML file in dist-preview/ (scripts, styles
 *    and fonts all inside it) that opens anywhere without a server. It is for sharing a quick
 *    look, and uses in-memory navigation, so the address bar does not change between screens.
 */
/**
 * Stops a public build going out with the default login by accident. A production build that
 * is neither behind Cloudflare Access (VITE_LOGIN=access, which `npm run build:cloudflare` sets)
 * nor given a password of its own would let anyone in with demo / demo.
 * Set ALLOW_DEFAULT_LOGIN=1 to build anyway (local testing does).
 */
function loginCheck(mode: string) {
  return {
    name: "login-check",
    config(_: unknown, { command }: { command: string }) {
      if (command !== "build" || mode !== "production") return;
      const env = loadEnv(mode, process.cwd(), "VITE_");
      const login = (process.env.VITE_LOGIN ?? env.VITE_LOGIN ?? "").trim();
      if (login && login !== "access" && login !== "local") throw new Error(`VITE_LOGIN is "${login}". It must be "access" or "local" (see .env.example).`);
      if (login === "access" || env.VITE_DEMO_PASSWORD_SHA256) return;
      const text = "This build has no login of its own: anyone could sign in with demo / demo.\nFor the hosted demo use `npm run build:cloudflare` (Cloudflare Access does the sign-in).\nFor a local copy set VITE_DEMO_PASSWORD_SHA256 (see .env.example), or set ALLOW_DEFAULT_LOGIN=1 to build it anyway.";
      if (process.env.ALLOW_DEFAULT_LOGIN === "1") console.warn(`\n[login-check] ${text}\n`);
      else throw new Error(text);
    },
  };
}

export default defineConfig(({ mode }) => {
  const preview = mode === "preview";
  return {
    plugins: [loginCheck(mode), react(), tailwindcss(), ...(preview ? [viteSingleFile({ removeViteModuleLoader: true })] : [])],
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    base: preview ? "./" : "/",
    build: preview
      ? { outDir: "dist-preview", assetsInlineLimit: 100_000_000, cssCodeSplit: false }
      : {
          rollupOptions: {
            output: {
              // Vardil Works (19 Nov): every file that holds only staff screens goes in /staff/, which a second
              // Cloudflare Access application guards (README, "Vardil Works"). Shared code stays in /assets/.
              chunkFileNames: (chunk) => (chunk.facadeModuleId?.includes("/src/staff/") || chunk.name === "entry" ? "staff/[name]-[hash].js" : "assets/[name]-[hash].js"),
            },
          },
        },
    test: { environment: "node", include: ["src/**/*.test.ts", "server/**/*.test.ts"] },
  };
});
