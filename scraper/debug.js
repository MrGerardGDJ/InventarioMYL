#!/usr/bin/env node
// Inspecciona el endpoint de perfil de carta y sus cabeceras CORS.
const H = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Origin: "https://knomoio.github.io",
  Referer: "https://tor.myl.cl/",
};

const urls = [
  "https://api.myl.cl/cards/profile/chile_oculto/la_rubia_de_kennedy",
  "https://api.myl.cl/cards/profile/helenica/gaia",
];

for (const u of urls) {
  console.log("\n===== " + u + " =====");
  try {
    const r = await fetch(u, { headers: H });
    console.log("status", r.status);
    console.log("CORS access-control-allow-origin:", r.headers.get("access-control-allow-origin"));
    const t = await r.text();
    let data; try { data = JSON.parse(t); } catch { data = null; }
    if (!data) { console.log("raw:", t.slice(0, 400)); continue; }
    console.log("TOP KEYS:", JSON.stringify(Object.keys(data)));
    for (const [k, v] of Object.entries(data)) {
      if (Array.isArray(v)) console.log(`  [array] ${k}: ${v.length}; item0:`, JSON.stringify(v[0]).slice(0, 300));
      else if (v && typeof v === "object") console.log(`  [obj] ${k}:`, JSON.stringify(v).slice(0, 400));
      else console.log(`  ${k}:`, JSON.stringify(v).slice(0, 200));
    }
  } catch (e) { console.log("ERR", e.message); }
}
console.log("\n### FIN\n");
