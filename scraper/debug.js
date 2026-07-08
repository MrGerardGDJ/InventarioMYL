#!/usr/bin/env node
// Diagnóstico de codicetcg.org: ¿cómo entrega los datos? ¿tiene API JSON?
const H = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/json,*/*",
  "Accept-Language": "es-ES,es;q=0.9",
};

async function grab(url, { json = false } = {}) {
  try {
    const r = await fetch(url, { headers: H });
    const ct = r.headers.get("content-type") || "";
    const t = await r.text();
    console.log(`\n[${r.status}] ${ct} (${t.length}b) ${url}`);
    return { status: r.status, ct, t };
  } catch (e) { console.log(`ERR ${url}: ${e.message}`); return { status: 0, t: "" }; }
}

// 1) Página principal de la librería
const page = await grab("https://codicetcg.org/IMP/codice/library");
if (page.t) {
  // scripts
  const scripts = [...page.t.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map((m) => m[1]);
  console.log("SCRIPTS:", JSON.stringify(scripts.slice(0, 30)));
  // pistas de framework / API dentro del HTML
  const apiHits = [...page.t.matchAll(/https?:\/\/[^\s"'`)]*api[^\s"'`)]*/gi)].map((m) => m[0]);
  console.log("API URLs en HTML:", JSON.stringify([...new Set(apiHits)].slice(0, 20)));
  console.log("¿Next.js?", /_next|__NEXT_DATA__/.test(page.t), "| ¿React root?", /id="root"|__NUXT__|ng-version/.test(page.t));
  // buscar JSON embebido tipo __NEXT_DATA__
  const nd = page.t.match(/__NEXT_DATA__[^>]*>([\s\S]{0,300})/);
  if (nd) console.log("NEXT_DATA head:", nd[1].slice(0, 200));
}

// 2) Revisar los JS del sitio en busca de endpoints
const scripts = page.t ? [...page.t.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map((m) => m[1]) : [];
for (let s of scripts.slice(0, 12)) {
  if (s.startsWith("/")) s = "https://codicetcg.org" + s;
  if (!/^https?:/.test(s)) continue;
  const js = await grab(s);
  if (!js.t) continue;
  const hits = [...js.t.matchAll(/["'`](\/?(?:api|graphql|data|cards?|editions?|library)[^\s"'`]*)["'`]/gi)].map((m) => m[1]);
  const abs = [...js.t.matchAll(/https?:\/\/[a-z0-9.\-]*codice[^\s"'`)]*/gi)].map((m) => m[0]);
  const uniq = [...new Set([...hits, ...abs])].filter((x) => x.length > 3).slice(0, 25);
  if (uniq.length) console.log("  endpoints:", JSON.stringify(uniq));
}

// 3) Probar candidatos de API
console.log("\n== CANDIDATOS API ==");
for (const u of [
  "https://codicetcg.org/api/cards",
  "https://codicetcg.org/api/library",
  "https://codicetcg.org/api/IMP/library",
  "https://api.codicetcg.org/cards",
  "https://codicetcg.org/api/editions",
  "https://codicetcg.org/api/codice/library",
]) {
  const r = await grab(u, { json: true });
  if (r.status === 200 && /json/.test(r.ct)) console.log("   muestra:", r.t.slice(0, 300));
}
console.log("\n### FIN");
