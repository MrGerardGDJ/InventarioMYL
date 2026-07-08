#!/usr/bin/env node
const H = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "text/html,application/json,*/*", "Accept-Language": "es-ES,es;q=0.9",
};
const get = async (u) => { try { const r = await fetch(u, { headers: H }); return { s: r.status, ct: r.headers.get("content-type") || "", t: await r.text() }; } catch (e) { return { s: 0, t: "", err: e.message }; } };

// 1) JS principal: buscar backend de datos (supabase/directus/pocketbase/URLs)
const js = await get("https://codicetcg.org/_nuxt/Dn-Waz02.js");
console.log("JS status", js.s, "len", js.t.length);
const patterns = {
  supabaseUrl: /https:\/\/[a-z0-9]+\.supabase\.co[^\s"'`]*/gi,
  supabaseKey: /eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{10,}/g,
  restV1: /rest\/v1\/[a-z_]+/gi,
  absUrls: /https:\/\/(?!fonts\.|static\.cloudflare|cdnjs|www\.googletag)[a-z0-9.\-]+\.[a-z]{2,}\/[^\s"'`)]{2,40}/gi,
  apiRoutes: /["'`](\/api\/[a-z0-9/_\-{}$.:]+)["'`]/gi,
};
for (const [k, re] of Object.entries(patterns)) {
  const m = [...js.t.matchAll(re)].map((x) => x[0].replace(/^["'`]|["'`]$/g, ""));
  const uniq = [...new Set(m)].slice(0, 20);
  if (uniq.length) console.log(`\n${k}:`, JSON.stringify(uniq));
}

// 2) Página de librería: ¿datos embebidos (__NUXT_DATA__)?
const page = await get("https://codicetcg.org/IMP/codice/library");
console.log("\n\nPAGE status", page.s, "len", page.t.length);
const nd = page.t.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
if (nd) {
  console.log("__NUXT_DATA__ presente, len", nd[1].length);
  console.log("head:", nd[1].slice(0, 800));
} else {
  console.log("sin __NUXT_DATA__; ¿window.__NUXT__?", /window\.__NUXT__/.test(page.t));
  const wn = page.t.match(/window\.__NUXT__\s*=\s*([\s\S]{0,600})/);
  if (wn) console.log("__NUXT__ head:", wn[1].slice(0, 400));
}
// pistas de contenido de cartas en la página
console.log("menciona 'angeles'/'demonios'?", /angel|demoni/i.test(page.t));
console.log("### FIN");
