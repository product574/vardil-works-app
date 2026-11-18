/**
 * Opening a kept file. The demo keeps every file in the browser as a data address, so a file's
 * address is its data; a real build would fetch a signed link from storage here (the Secure-All
 * build does). The sample data's documents have no data and are drawn when opened instead.
 */
import type { Proof } from "@/data/types";

export async function proofUrl(p: Proof): Promise<string | null> {
  return p.dataUrl || null;
}

/** A data address as a file the browser can show or save. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  const head = dataUrl.slice(5, Math.max(comma, 5));
  const body = dataUrl.slice(comma + 1);
  const type = head.split(";")[0] || "application/octet-stream";
  if (!/;base64$/i.test(head)) return new Blob([decodeURIComponent(body)], { type });
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}
