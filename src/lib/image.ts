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

/** A file to attach to an email: a picture (shrunk) or a PDF within the size limit, as everywhere in the demo. */
export async function readAttachment(file: File): Promise<{ name: string; dataUrl: string; sizeKb: number }> {
  if (file.type.startsWith("image/")) {
    const { dataUrl, sizeKb } = await shrinkImage(file, 1400, 0.75);
    return { name: file.name, dataUrl, sizeKb: Math.max(1, sizeKb) };
  }
  if (file.type !== "application/pdf") throw new Error(`${file.name} was not attached. The demo keeps files in the browser, so it takes pictures and PDFs only.`);
  if (file.size / 1024 > PROOF_LIMIT_KB) throw new Error(`${file.name} is over ${PROOF_LIMIT_KB / 1000} MB, which is too big for the demo to keep in the browser.`);
  const dataUrl = await readAsDataUrl(file);
  return { name: file.name, dataUrl, sizeKb: Math.max(1, kb(dataUrl)) };
}

/**
 * An invoice, receipt or certificate for Fleet: PDF, photo, Word or Excel, as on the Lovable
 * prototype. Photos are shrunk; other files are kept as they are within `limitKb`. The demo keeps
 * files in the browser (small limit); a real build uploads them to storage.
 */
const FLEET_TYPES = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
export async function readUpload(file: File, limitKb: number): Promise<{ name: string; dataUrl: string }> {
  if (file.type.startsWith("image/")) return { name: file.name, dataUrl: (await shrinkImage(file, 1800, 0.8)).dataUrl };
  if (!FLEET_TYPES.includes(file.type) && !/\.(pdf|docx?|xlsx?)$/i.test(file.name)) throw new Error("Choose a PDF, a photo, or a Word or Excel file.");
  if (file.size / 1024 > limitKb) throw new Error(`That file is over ${Math.round(limitKb / 100) / 10} MB, which is more than ${limitKb > 5000 ? "the limit" : "the demo can keep in the browser. A photo of it works"}.`);
  return { name: file.name, dataUrl: await readAsDataUrl(file) };
}
