import * as si from "simple-icons";
import fs from "node:fs";
const wanted = ["whatsapp","instagram","youtube","spotify","netflix","swiggy","zomato","uber","snapchat","amazon","phonepe","googlepay","gmail","googlemaps","pinterest","reddit","facebook","telegram"];
const out = [];
for (const slug of wanted) {
  const key = "si" + slug[0].toUpperCase() + slug.slice(1);
  const icon = si[key];
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
