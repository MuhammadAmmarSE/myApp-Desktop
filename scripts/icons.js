// Draws Redline's desktop icons from the same gem and orbit as the phone's icon, in Chromium:
//   build/icon.png (1024), build/icon.ico (Windows, 16-256), build/icon.icns (macOS),
//   build/icons/<n>x<n>.png (Linux), resources/icon.png (the window and notifications, 512),
//   resources/tray/ tray.png + tray@2x.png (Linux), tray.ico (Windows),
//   trayTemplate.png + trayTemplate@2x.png (macOS menu bar, black on clear).
// Needs Playwright with its Chromium: npm run icons (NODE_PATH may point at a global install).
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const out = (...p) => {
  const f = path.join(ROOT, ...p);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  return f;
};

// the gem's ten facets (as BrandMark.tsx), the accent mixed lighter or darker
const ACCENT = "#E11D2E";
const ACCENT2 = "#FF3B4D";
const mix = (pct, to) => `color-mix(in srgb, ${ACCENT} ${100 - pct}%, ${to})`;
const FACETS = [
  ["512.0,408.5 601.6,563.8 422.4,563.8", mix(16, "white")],
  ["512.0,408.5 711.2,397.0 601.6,563.8", ACCENT],
  ["601.6,563.8 512.0,742.0 422.4,563.8", mix(45, "black")],
  ["422.4,563.8 312.8,397.0 512.0,408.5", mix(24, "white")],
  ["512.0,408.5 312.8,397.0 512.0,282.0", mix(38, "white")],
  ["512.0,408.5 512.0,282.0 711.2,397.0", mix(20, "white")],
  ["601.6,563.8 711.2,397.0 711.2,627.0", mix(42, "black")],
  ["601.6,563.8 711.2,627.0 512.0,742.0", mix(66, "black")],
  ["422.4,563.8 512.0,742.0 312.8,627.0", mix(22, "black")],
  ["422.4,563.8 312.8,627.0 312.8,397.0", mix(12, "white")],
];
const STARS = [
  [640, 180, 4], [210, 300, 7], [150, 520, 5], [820, 360, 5], [880, 560, 4], [260, 760, 4], [760, 780, 6], [400, 880, 4],
];

// the app icon: a rounded square (macOS keeps the edge clear; every platform reads it as one shape)
const appIcon = (full) => `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <radialGradient id="bg" cx="50%" cy="46%" r="62%">
      <stop offset="0" stop-color="#3a0d13"/>
      <stop offset="0.55" stop-color="#1a090c"/>
      <stop offset="1" stop-color="#0b0a0c"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.42"/>
      <stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.10"/>
      <stop offset="0.5" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="body"><rect x="${full ? 0 : 100}" y="${full ? 0 : 100}" width="${full ? 1024 : 824}" height="${full ? 1024 : 824}" rx="${full ? 0 : 186}"/></clipPath>
    <clipPath id="front"><rect x="0" y="512" width="1024" height="512"/></clipPath>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#000" flood-opacity="0.45"/>
    </filter>
  </defs>
  ${full ? "" : `<rect x="100" y="100" width="824" height="824" rx="186" fill="#000" filter="url(#shadow)"/>`}
  <g clip-path="url(#body)">
    <rect width="1024" height="1024" fill="url(#bg)"/>
    <g transform="translate(512 520) scale(${full ? 1 : 0.94}) translate(-512 -512)">
      <circle cx="512" cy="512" r="360" fill="url(#glow)"/>
      ${STARS.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#ff6b78" opacity="0.75"/>`).join("")}
      <g transform="rotate(-17 512 512)"><ellipse cx="512" cy="512" rx="372" ry="112" fill="none" stroke="#8c1a26" stroke-width="16" opacity="0.85"/></g>
      ${FACETS.map(([p, f]) => `<polygon points="${p}" fill="${f}" stroke="rgba(255,255,255,0.22)" stroke-width="4" stroke-linejoin="round"/>`).join("")}
      <polygon points="512.0,408.5 512.0,282.0 312.8,397.0" fill="#fff" opacity="0.10"/>
      <g transform="rotate(-17 512 512)"><ellipse cx="512" cy="512" rx="372" ry="112" fill="none" stroke="${ACCENT2}" stroke-width="22" stroke-linecap="round" clip-path="url(#front)"/></g>
    </g>
    <rect width="1024" height="1024" fill="url(#sheen)"/>
  </g>
  ${full ? "" : `<rect x="101" y="101" width="822" height="822" rx="185" fill="none" stroke="#fff" stroke-opacity="0.09" stroke-width="2"/>`}
</svg>`;

// the tray: a simple gem in a ring, clear around it, so it reads at 16 pixels
const trayIcon = (mono) => {
  const c = (hex, a = 1) => (mono ? `rgba(0,0,0,${a})` : hex);
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <defs><clipPath id="f"><rect x="0" y="32" width="64" height="32"/></clipPath></defs>
  <g transform="rotate(-18 32 32)"><ellipse cx="32" cy="32" rx="29" ry="10" fill="none" stroke="${c("#8c1a26", 0.55)}" stroke-width="4"/></g>
  <polygon points="32,9 51,20 51,43 32,55 13,43 13,20" fill="${c(ACCENT)}"/>
  <polygon points="32,9 51,20 32,25 13,20" fill="${c("#ff7b86")}"/>
  <polygon points="32,25 51,20 51,43 32,55" fill="${c("#a3121f", mono ? 0.8 : 1)}"/>
  <g transform="rotate(-18 32 32)"><ellipse cx="32" cy="32" rx="29" ry="10" fill="none" stroke="${c(ACCENT2)}" stroke-width="5" clip-path="url(#f)"/></g>
</svg>`;
};

// ICO and ICNS hold PNGs as they are
function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + i * 16;
    head.writeUInt8(size >= 256 ? 0 : size, e);
    head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(data.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...pngs.map((p) => p.data)]);
}
function icns(entries) {
  const parts = entries.map(([type, data]) => {
    const h = Buffer.alloc(8);
    h.write(type, 0, "ascii");
    h.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([h, data]);
  });
  const body = Buffer.concat(parts);
  const h = Buffer.alloc(8);
  h.write("icns", 0, "ascii");
  h.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([h, body]);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const render = async (svg, size) => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace(/width="(1024|64)" height="(1024|64)"/, `width="${size}" height="${size}"`)}</body></html>`);
    return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  };

  const app = {};
  for (const s of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) app[s] = await render(appIcon(false), s);
  fs.writeFileSync(out("build/icon.png"), app[1024]);
  fs.writeFileSync(out("resources/icon.png"), app[512]);
  for (const s of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) fs.writeFileSync(out(`build/icons/${s}x${s}.png`), app[s]);
  fs.writeFileSync(out("build/icon.ico"), ico([16, 24, 32, 48, 64, 128, 256].map((size) => ({ size, data: app[size] }))));
  fs.writeFileSync(
    out("build/icon.icns"),
    icns([
      ["icp4", app[16]],
      ["icp5", app[32]],
      ["icp6", app[64]],
      ["ic07", app[128]],
      ["ic08", app[256]],
      ["ic09", app[512]],
      ["ic10", app[1024]],
      ["ic11", app[32]],
      ["ic12", app[64]],
      ["ic13", app[256]],
      ["ic14", app[512]],
    ])
  );
  // the full-bleed square, for the README and places that draw their own corners
  fs.writeFileSync(out("build/icon-square.png"), await render(appIcon(true), 512));

  const tray = {};
  for (const s of [16, 20, 24, 32, 48]) tray[s] = await render(trayIcon(false), s);
  fs.writeFileSync(out("resources/tray/tray.png"), tray[16]);
  fs.writeFileSync(out("resources/tray/tray@2x.png"), tray[32]);
  fs.writeFileSync(out("resources/tray/tray.ico"), ico([16, 20, 24, 32, 48].map((size) => ({ size, data: tray[size] }))));
  fs.writeFileSync(out("resources/tray/trayTemplate.png"), await render(trayIcon(true), 16));
  fs.writeFileSync(out("resources/tray/trayTemplate@2x.png"), await render(trayIcon(true), 32));
  await browser.close();
  console.log("icons written: build/ and resources/");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
