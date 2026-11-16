/**
 * Pictures and proof files added during the demo are kept in the browser, which has a small
 * ceiling (about 5 MB for everything). So photos are shrunk before they are stored, and other
 * files are refused over a size limit. With a real backend these would simply be uploaded.
 */

export const PROOF_LIMIT_KB = 1200;

const readAsDataUrl = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("The file could not be read."));
    r.readAsDataURL(file);
  });

const kb = (dataUrl: string) => Math.round((dataUrl.length * 3) / 4 / 1024);

/** Shrink a photo so its longest side is at most `maxSide` pixels and return it as a JPEG. */
export async function shrinkImage(file: Blob, maxSide = 1280, quality = 0.72): Promise<{ dataUrl: string; sizeKb: number }> {
  const src = await readAsDataUrl(file);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("That file is not a picture this browser can open."));
    img.src = src;
  });
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser could not prepare the picture.");
  // White behind, so a transparent PNG does not come out black as a JPEG.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  return { dataUrl, sizeKb: kb(dataUrl) };
}

/** A photo of a card (shrunk) or a PDF (kept as it is, within the size limit). */
export async function readProof(file: File): Promise<{ name: string; dataUrl: string }> {
  if (file.type.startsWith("image/")) return { name: file.name, dataUrl: (await shrinkImage(file, 1400, 0.75)).dataUrl };
  if (file.type !== "application/pdf") throw new Error("Attach a photo of the card or a PDF of the certificate.");
  if (file.size / 1024 > PROOF_LIMIT_KB) throw new Error(`That PDF is over ${PROOF_LIMIT_KB / 1000} MB, which is too big for the demo to keep in the browser. A photo of the card works.`);
  return { name: file.name, dataUrl: await readAsDataUrl(file) };
}

export const isPdf = (dataUrl: string) => dataUrl.startsWith("data:application/pdf");
