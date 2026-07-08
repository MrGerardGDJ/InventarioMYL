#!/usr/bin/env node
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const get = async (u, headers = {}) => { try { const r = await fetch(u, { headers: { "User-Agent": UA, ...headers } }); return { s: r.status, ct: r.headers.get("content-type") || "", t: await r.text() }; } catch (e) { return { s: 0, t: "", err: e.message }; } };

// 1) anon key desde la página
const page = (await get("https://codicetcg.org/IMP/codice/library")).t;
const key = (page.match(/eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{10,}/) || [])[0];
console.log("anon key len:", key ? key.length : 0);
const BASE = "https://db.codicetcg.org/rest/v1";
const AUTH = { apikey: key, Authorization: "Bearer " + key };

// 2) OpenAPI root → tablas disponibles
const root = await get(BASE + "/", AUTH);
console.log("\nOpenAPI status", root.s, "len", root.t.length);
try {
  const spec = JSON.parse(root.t);
  const tables = Object.keys(spec.definitions || spec.components?.schemas || {});
  console.log("TABLAS:", JSON.stringify(tables));
} catch (e) { console.log("no OpenAPI JSON:", root.t.slice(0, 200)); }

// 3) Probar tablas candidatas
for (const tb of ["cards", "card", "editions", "edition", "sets", "expansions", "printings", "library", "cartas", "ediciones"]) {
  const r = await get(`${BASE}/${tb}?limit=1`, AUTH);
  if (r.s === 200) {
    let cols = "";
    try { const a = JSON.parse(r.t); cols = a[0] ? Object.keys(a[0]).join(",") : "(vacía)"; } catch {}
    console.log(`OK  ${tb}: ${cols}`);
  } else {
    console.log(`${r.s} ${tb}`);
  }
}
console.log("### FIN");
