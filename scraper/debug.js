#!/usr/bin/env node
const H = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "text/html,application/json,*/*", "Accept-Language": "es-ES,es;q=0.9",
};
const get = async (u, opt = {}) => { try { const r = await fetch(u, { headers: { ...H, ...(opt.headers || {}) } }); return { s: r.status, ct: r.headers.get("content-type") || "", t: await r.text() }; } catch (e) { return { s: 0, t: "", err: e.message }; } };

const page = (await get("https://codicetcg.org/IMP/codice/library")).t;

// 1) clave anon (JWT) y su contexto
const keys = [...new Set([...page.matchAll(/eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{10,}/g)].map((m) => m[0]))];
console.log("JWT encontrados:", keys.length);
for (const k of keys.slice(0, 2)) {
  const i = page.indexOf(k);
  console.log("\n--- contexto clave ---\n", page.slice(i - 220, i + 40).replace(/\s+/g, " "));
  try { const payload = JSON.parse(Buffer.from(k.split(".")[1], "base64").toString()); console.log("payload:", JSON.stringify(payload)); } catch {}
}

// 2) URLs candidatas a backend (no fonts/cloudflare/google/bunny)
const urls = [...new Set([...page.matchAll(/https:\/\/[a-z0-9.\-]+\.[a-z]{2,}(?:\/[^\s"'`)]*)?/gi)].map((m) => m[0]))]
  .filter((u) => !/fonts\.|cloudflare|googletag|gstatic|umami|google|schema\.org|vuejs|w3\.org|bunny/.test(u));
console.log("\nURLs backend candidatas:", JSON.stringify(urls.slice(0, 30)));

// 3) Buscar 'ref' del proyecto o config supabase en el HTML
const cfg = page.match(/["'](supabase[A-Za-z]*)["']\s*:\s*["']([^"']+)["']/gi);
console.log("\nconfig supabase en HTML:", JSON.stringify(cfg ? cfg.slice(0, 6) : null));
const refCtx = page.match(/[a-z0-9]{20}\.supabase\.(co|red|in)/gi);
console.log("host supabase:", JSON.stringify(refCtx));
console.log("### FIN");
