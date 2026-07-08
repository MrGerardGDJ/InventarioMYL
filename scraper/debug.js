#!/usr/bin/env node
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const get = async (u, headers = {}) => { try { const r = await fetch(u, { headers: { "User-Agent": UA, ...headers } }); return { s: r.status, ct: r.headers.get("content-type") || "", t: await r.text(), h: r.headers }; } catch (e) { return { s: 0, t: "", err: e.message }; } };

const page = (await get("https://codicetcg.org/IMP/codice/library")).t;
const key = (page.match(/eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{10,}/) || [])[0];
const chunks = [...new Set([...page.matchAll(/(?:src|href)=["'](\/_nuxt\/[^"']+\.js)["']/g)].map((m) => m[1]))];

// 1) Buscar patrones de consulta supabase en todos los chunks
const pat = {
  from: /\.from\(["'`]([^"'`]+)["'`]/g,
  rpc: /\.rpc\(["'`]([^"'`]+)["'`]/g,
  schema: /\.schema\(["'`]([^"'`]+)["'`]/g,
  select: /\.select\(["'`]([^"'`]{3,80})["'`]/g,
  eq: /\.eq\(["'`]([^"'`]+)["'`]/g,
};
const acc = { from: new Set(), rpc: new Set(), schema: new Set(), select: new Set(), eq: new Set() };
for (const c of chunks) {
  const js = (await get("https://codicetcg.org" + c)).t;
  if (!js) continue;
  for (const [k, re] of Object.entries(pat)) for (const m of js.matchAll(re)) acc[k].add(m[1]);
}
for (const k of Object.keys(acc)) console.log(k + ":", JSON.stringify([...acc[k]].slice(0, 30)));

// 2) Probar tablas con conteo y esquemas alternativos
const BASE = "https://db.codicetcg.org/rest/v1";
for (const tb of [...acc.from].slice(0, 12)) {
  const r = await get(`${BASE}/${tb}?select=*&limit=1`, { apikey: key, Authorization: "Bearer " + key, Prefer: "count=exact" });
  let cols = ""; try { const a = JSON.parse(r.t); cols = a[0] ? Object.keys(a[0]).join(",") : "[]"; } catch { cols = r.t.slice(0, 80); }
  console.log(`  ${r.s} ${tb} range=${r.h && r.h.get ? r.h.get("content-range") : "?"} cols=${cols}`);
}
console.log("### FIN");
