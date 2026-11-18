/**
 * Drawn pictures of vehicle damage for the sample data (Oisin, 18 Nov: "make fictional photos of
 * van damages"; he picked drawings over empty frames). They are drawings, not photographs, and
 * each says so in its corner. Kept as small SVG pictures made here, not as files.
 */

const SKY = `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b9c7d6"/><stop offset="1" stop-color="#e3e8ee"/></linearGradient><linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbfbfc"/><stop offset="1" stop-color="#dfe3e8"/></linearGradient><radialGradient id="dent" cx="0.5" cy="0.45" r="0.6"><stop offset="0" stop-color="#8f98a3"/><stop offset="0.7" stop-color="#c9ced6"/><stop offset="1" stop-color="#e6e9ee" stop-opacity="0"/></radialGradient><linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b7388"/><stop offset="1" stop-color="#2c3b49"/></linearGradient></defs>`;
const TAG = `<rect x="0" y="452" width="640" height="28" fill="#000" opacity="0.55"/><text x="12" y="471" font-family="Arial,Helvetica,sans-serif" font-size="14" fill="#fff">Sample picture, drawn for the demo. Not a photograph.</text>`;
const wrap = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480" width="640" height="480">${SKY}${inner}${TAG}</svg>`;

const PICTURES: Record<string, { label: string; svg: string }> = {
  "door-scrape": {
    label: "Scrape and dent along the sliding door",
    svg: wrap(`<rect width="640" height="480" fill="url(#sky)"/><rect y="400" width="640" height="80" fill="#6b7078"/>
<rect x="-20" y="40" width="700" height="350" rx="26" fill="url(#body)" stroke="#aab1ba" stroke-width="3"/>
<rect x="-20" y="250" width="700" height="34" fill="#242255"/><rect x="-20" y="284" width="700" height="6" fill="#b3202a"/>
<path d="M150 40V390M470 40V390" stroke="#9aa2ac" stroke-width="4"/><rect x="170" y="70" width="280" height="120" rx="10" fill="url(#glass)" opacity="0.35"/>
<rect x="390" y="212" width="58" height="16" rx="8" fill="#3a4049"/>
<ellipse cx="300" cy="318" rx="120" ry="52" fill="url(#dent)"/>
<path d="M175 300C240 286 330 296 452 322M182 316C250 304 330 312 446 338M196 334C260 326 320 332 420 352M210 290C260 280 330 286 400 300" stroke="#5d646e" stroke-width="5" stroke-linecap="round" fill="none" opacity="0.85"/>
<path d="M186 308C250 296 330 304 448 330" stroke="#c9712f" stroke-width="2.5" stroke-linecap="round" fill="none" opacity="0.8"/>
<path d="M560 390a70 70 0 0 1 140 0" fill="#2b2f36"/><circle cx="630" cy="400" r="58" fill="#1d2026"/>`),
  },
  mirror: {
    label: "Wing mirror broken, glass cracked and housing loose",
    svg: wrap(`<rect width="640" height="480" fill="url(#sky)"/><rect y="410" width="640" height="70" fill="#6b7078"/>
<path d="M260 0H640V420H330Q250 300 260 0Z" fill="url(#body)" stroke="#aab1ba" stroke-width="3"/>
<path d="M330 40H640V230H352Q318 140 330 40Z" fill="url(#glass)"/><path d="M352 262H640V296H360Z" fill="#242255"/>
<path d="M352 196L250 214" stroke="#2b2f36" stroke-width="16" stroke-linecap="round"/>
<g transform="rotate(-14 170 220)"><rect x="70" y="140" width="190" height="150" rx="34" fill="#23262c"/><rect x="88" y="158" width="154" height="114" rx="22" fill="#9fb4c6"/>
<path d="M165 215L96 166M165 215L236 170M165 215L240 250M165 215L120 268M165 215L92 230M165 215L190 160M165 215L176 270M130 190L112 214L140 240M200 190L214 222L190 248" stroke="#f4f7fa" stroke-width="2.5" fill="none"/>
<path d="M70 250q40 46 120 40" stroke="#0f1114" stroke-width="5" fill="none"/></g>
<path d="M92 400l16 8-10 12M150 418l14-6 6 12M210 404l-8 12 14 6" stroke="#dfe6ee" stroke-width="3" fill="none"/>`),
  },
  "rear-bumper": {
    label: "Rear bumper cracked and pushed in on the nearside",
    svg: wrap(`<rect width="640" height="480" fill="url(#sky)"/><rect y="404" width="640" height="76" fill="#6b7078"/>
<rect x="70" y="20" width="500" height="330" rx="22" fill="url(#body)" stroke="#aab1ba" stroke-width="3"/>
<path d="M320 24V348" stroke="#9aa2ac" stroke-width="4"/><rect x="110" y="50" width="180" height="110" rx="10" fill="url(#glass)"/><rect x="350" y="50" width="180" height="110" rx="10" fill="url(#glass)"/>
<rect x="70" y="232" width="500" height="26" fill="#242255"/><rect x="250" y="276" width="140" height="40" rx="5" fill="#f4e9a8" stroke="#555" stroke-width="2"/><text x="320" y="303" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="20" fill="#333">SAMPLE</text>
<rect x="80" y="180" width="30" height="120" rx="8" fill="#b3202a"/><rect x="530" y="180" width="30" height="120" rx="8" fill="#b3202a"/>
<path d="M50 350H590V398Q590 410 574 410H66Q50 410 50 398Z" fill="#2b2f36"/>
<path d="M74 352Q150 392 250 366L238 408H68Q52 408 52 396Z" fill="#17191d"/>
<path d="M92 360l38 14-12 14 46 4M180 356l-10 22 34 10-6 18M250 364l-26 30" stroke="#8d949d" stroke-width="3" fill="none" stroke-linecap="round"/>
<path d="M96 300q30 30 96 26" stroke="#8f98a3" stroke-width="4" fill="none" opacity="0.8"/>`),
  },
  windscreen: {
    label: "Windscreen cracked from a stone chip on the passenger side",
    svg: wrap(`<rect width="640" height="480" fill="url(#sky)"/><rect y="420" width="640" height="60" fill="#6b7078"/>
<path d="M60 430V250Q70 60 320 50Q570 60 580 250V430Z" fill="url(#body)" stroke="#aab1ba" stroke-width="3"/>
<path d="M110 250Q124 96 320 88Q516 96 530 250Z" fill="url(#glass)"/>
<path d="M60 300H580" stroke="#9aa2ac" stroke-width="3"/><rect x="60" y="318" width="520" height="24" fill="#242255"/>
<path d="M150 250L300 206M340 250L500 204" stroke="#15171b" stroke-width="6" stroke-linecap="round"/>
<circle cx="410" cy="160" r="9" fill="#e9eff5"/>
<path d="M410 160L372 132M410 160L446 126M410 160L462 170M410 160L430 204M410 160L378 196M410 160L356 160M410 160Q470 190 524 236M410 160Q330 150 250 110" stroke="#eef3f8" stroke-width="2.5" fill="none"/>
<circle cx="410" cy="160" r="26" fill="none" stroke="#eef3f8" stroke-width="1.5" opacity="0.8"/>
<rect x="130" y="356" width="90" height="34" rx="12" fill="#f3f0d2" stroke="#aab1ba"/><rect x="420" y="356" width="90" height="34" rx="12" fill="#f3f0d2" stroke="#aab1ba"/>`),
  },
  wheel: {
    label: "Front tyre flat and the wheel scuffed on a kerb",
    svg: wrap(`<rect width="640" height="480" fill="url(#sky)"/><rect y="380" width="640" height="100" fill="#6b7078"/><rect y="350" width="640" height="34" fill="#a7adb5"/><path d="M0 350H640" stroke="#8a9099" stroke-width="3"/>
<path d="M-10 60H660V300H470A150 150 0 0 0 170 300H-10Z" fill="url(#body)" stroke="#aab1ba" stroke-width="3"/><rect x="-10" y="150" width="670" height="30" fill="#242255"/>
<path d="M176 372Q170 220 320 216Q470 220 464 372Q470 404 320 404Q170 404 176 372Z" fill="#1b1e23"/>
<circle cx="320" cy="304" r="84" fill="#c4cad2" stroke="#8a9099" stroke-width="4"/><circle cx="320" cy="304" r="20" fill="#6f7780"/>
<path d="M320 224V284M320 324V384M240 304H300M340 304H400M264 248L306 290M334 318L376 360M376 248L334 290M306 318L264 360" stroke="#8a9099" stroke-width="10" stroke-linecap="round"/>
<path d="M250 352q30 30 70 32M262 340q24 26 52 30M388 344q-20 28-52 36" stroke="#5a6068" stroke-width="5" fill="none" stroke-linecap="round"/>
<path d="M190 396Q320 420 450 396" stroke="#0e1013" stroke-width="10" fill="none" stroke-linecap="round"/>`),
  },
  "tail-light": {
    label: "Offside tail light smashed, bulb holder showing",
    svg: wrap(`<rect width="640" height="480" fill="url(#sky)"/><rect y="414" width="640" height="66" fill="#6b7078"/>
<path d="M-10 20H380Q420 20 424 60V414H-10Z" fill="url(#body)" stroke="#aab1ba" stroke-width="3"/><rect x="-10" y="250" width="434" height="30" fill="#242255"/>
<path d="M120 24V412" stroke="#9aa2ac" stroke-width="4"/>
<rect x="290" y="90" width="96" height="250" rx="22" fill="#2a1416" stroke="#6a1d22" stroke-width="4"/>
<path d="M298 100h80v70l-30 26-22-18-28 30Z" fill="#c3242e"/><path d="M298 330h80v-58l-24-22-26 26-30-18Z" fill="#c3242e"/><path d="M300 108h30l-12 46Z" fill="#e8747b" opacity="0.7"/>
<circle cx="338" cy="222" r="20" fill="#d9dde2" stroke="#7a828c" stroke-width="3"/><circle cx="338" cy="222" r="8" fill="#f2c94c"/>
<path d="M300 430l22-8 6 16M360 440l20-12 12 14M420 432l-10-18 22-2M468 444l16-10 8 14" fill="#c3242e" stroke="#7d151c" stroke-width="2"/>
<path d="M250 190q20 40 16 96" stroke="#8f98a3" stroke-width="4" fill="none" opacity="0.8"/>`),
  },
};

export const DAMAGE_PICTURES = Object.keys(PICTURES);

/** The drawn picture's address (a data: SVG), or null for a name that is not one of them. */
export function damagePictureUrl(name: string): string | null {
  const p = PICTURES[name];
  return p ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(p.svg)}` : null;
}
export const damagePictureLabel = (name: string) => PICTURES[name]?.label ?? "Vehicle damage";
/** The picture as it would be written to a file, for checks. */
export const damagePictureSvg = (name: string) => PICTURES[name]?.svg ?? "";
