import * as si from "simple-icons";
import fs from "node:fs";
// Every catalog slug in src/lib/catalog.ts gets a logo. Run: node scripts/make-logos.mjs
const catalog = fs.readFileSync(new URL("../src/lib/catalog.ts", import.meta.url), "utf8");
const wanted = [...catalog.matchAll(/slug: "([a-z0-9]+)"/g)].map((m) => m[1]);
const bySlug = new Map(Object.values(si).filter((i) => i && i.slug).map((i) => [i.slug, i]));
const out = [];
for (const slug of wanted) {
  const icon = bySlug.get(slug);
  if (!icon) { console.log("MISSING", slug); continue; }
  const hex = icon.hex;
  const r = parseInt(hex.slice(0,2),16), g = parseInt(hex.slice(2,4),16), b = parseInt(hex.slice(4,6),16);
  const lum = (0.299*r + 0.587*g + 0.114*b)/255;
  const fg = lum > 0.7 ? "#111111" : "#ffffff";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" role="img"><title>${icon.title}</title><rect width="48" height="48" rx="12" fill="#${hex}"/><g transform="translate(10.8 10.8) scale(1.1)"><path fill="${fg}" d="${icon.path}"/></g></svg>`;
  fs.writeFileSync(`public/logos/${slug}.svg`, svg);
  out.push({slug, name: icon.title, hex});
}
console.log(JSON.stringify(out));
