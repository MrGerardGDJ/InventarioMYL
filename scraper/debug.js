#!/usr/bin/env node
const H = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "text/html,application/json,*/*", "Accept-Language": "es-ES,es;q=0.9",
};
const get = async (u) => { try { const r = await fetch(u, { headers: H }); return { s: r.status, ct: r.headers.get("content-type") || "", t: await r.text() }; } catch (e) { return { s: 0, t: "", err: e.message }; } };

// 1) Página: listar TODOS los chunks _nuxt (scripts + modulepreload) y __NUXT_DATA__ completo
const page = await get("https://codicetcg.org/IMP/codice/library");
const chunks = [...page.t.matchAll(/(?:src|href)=["'](\/_nuxt\/[^"']+\.js)["']/g)].map((m) => m[1]);
console.log("CHUNKS _nuxt:", JSON.stringify([...new Set(chunks)]));
const nd = page.t.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
if (nd) console.log("\n__NUXT_DATA__ FULL:\n", nd[1]);
console.log("\npage supabase.co?", /supabase\.co/.test(page.t), "| eyJ?", /eyJ[A-Za-z0-9_\-]{20,}/.test(page.t));

// 2) Buscar supabase URL + anon key en cada chunk
const found = new Set();
for (let c of [...new Set(chunks)]) {
  const u = "https://codicetcg.org" + c;
  const js = await get(u);
  if (!js.t) continue;
  const urls = [...js.t.matchAll(/https:\/\/[a-z0-9]{8,}\.supabase\.co/gi)].map((m) => m[0]);
  const keys = [...js.t.matchAll(/eyJ[A-Za-z0-9_\-]{30,}\.[A-Za-z0-9_\-]{30,}\.[A-Za-z0-9_\-]{20,}/g)].map((m) => m[0]);
  const supaCtx = [];
  let idx = js.t.toLowerCase().indexOf("supabase");
  let n = 0;
  while (idx !== -1 && n < 4) { supaCtx.push(js.t.slice(idx - 20, idx + 90)); idx = js.t.toLowerCase().indexOf("supabase", idx + 8); n++; }
  if (urls.length || keys.length) {
    urls.forEach((x) => found.add("URL " + x));
    keys.forEach((x) => found.add("KEY " + x.slice(0, 60) + "…len" + x.length));
    console.log(`\n[chunk ${c}] urls:`, JSON.stringify([...new Set(urls)]), "keys:", keys.length);
  }
  if (n && !urls.length) console.log(`\n[chunk ${c}] contexto 'supabase':`, JSON.stringify(supaCtx.slice(0, 2)));
}
console.log("\n== HALLAZGOS ==", JSON.stringify([...found]));
console.log("### FIN");
