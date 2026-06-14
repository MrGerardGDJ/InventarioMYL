#!/usr/bin/env node
const H = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Origin: "https://knomoio.github.io",
  Referer: "https://tor.myl.cl/",
};
const r = await fetch("https://api.myl.cl/cards/profile/chile_oculto/la_rubia_de_kennedy", { headers: H });
const data = JSON.parse(await r.text());
console.log("valid_formats:", JSON.stringify(data.valid_formats, null, 1));
console.log("keywords:", JSON.stringify(data.keywords, null, 1));
console.log("errata:", JSON.stringify(data.errata, null, 1));
console.log("products:", JSON.stringify(data.products, null, 1));
console.log("details keys:", JSON.stringify(Object.keys(data.details || {})));
console.log("details.ability_html:", JSON.stringify(data.details?.ability_html));
console.log("### FIN");
