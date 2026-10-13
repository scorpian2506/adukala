// Regenerates the app icons from the shared mark geometry in src/components/logoMark.ts.
//   npx tsx scripts/gen-icons.mts
// Writes public/icon.svg (favicon), public/icon-512.png, public/icon-maskable-512.png
// and public/apple-icon.png. Uses sharp, which ships with Next.
import { writeFileSync } from "node:fs";
import sharp from "sharp";
import { MARK, MARK_HEX } from "../src/components/logoMark";

const S = 512;
// Optical centre of the mark on its 48 grid (bbox is x 3–45, y 2.5–47).
const CX = 24;
const CY = 24.75;

function iconSvg({ radius, scale }: { radius: number; scale: number }) {
  const tx = S / 2 - CX * scale;
  const ty = S / 2 - CY * scale;
  const r = MARK.rim;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}">`,
    `<rect width="${S}" height="${S}"${radius ? ` rx="${radius}"` : ""} fill="${MARK_HEX.ink}"/>`,
    `<g transform="translate(${+tx.toFixed(2)} ${+ty.toFixed(2)}) scale(${scale})">`,
    `<path d="${MARK.flame}" fill="${MARK_HEX.flame}"/>`,
    `<path d="${MARK.core}" fill="${MARK_HEX.bowl}"/>`,
    `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="${r.rx}" fill="${MARK_HEX.paper}"/>`,
    `<path d="${MARK.bowl}" fill="${MARK_HEX.bowl}"/>`,
    `</g></svg>`,
  ].join("");
}

// Rounded tile for browsers; full-bleed squares where the platform applies its own mask.
const tile = iconSvg({ radius: 112, scale: 7.2 });
const bleed = iconSvg({ radius: 0, scale: 6.8 });
const maskable = iconSvg({ radius: 0, scale: 5.4 }); // inside the 80% safe circle

const png = (svg: string, size: number, out: string) =>
  sharp(Buffer.from(svg), { density: 300 }).resize(size, size).flatten({ background: MARK_HEX.ink }).png().toFile(out);

writeFileSync("public/icon.svg", tile + "\n");
await Promise.all([
  sharp(Buffer.from(tile), { density: 300 }).resize(512, 512).png().toFile("public/icon-512.png"),
  png(maskable, 512, "public/icon-maskable-512.png"),
  png(bleed, 180, "public/apple-icon.png"),
]);
console.log("icons written");
