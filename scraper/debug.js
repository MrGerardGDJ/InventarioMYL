#!/usr/bin/env node
// Diagnóstico de mazos.cl: ¿framework? ¿API JSON abierta? ¿backend (supabase/firebase)?
const H = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "text/html,application/json,*/*", "Accept-Language": "es-ES,es;q=0.9",
};
const get = async (u) => { try { const r = await fetch(u, { headers: H, redirect: "follow" }); const t = await r.text(); return { s: r.status, ct: r.headers.get("content-type") || "", server: r.headers.get("server") || "", t }; } catch (e) { return { s: 0, t: "", err: e.message }; } };

for (const path of ["", "cartas", "biblioteca", "library", "buscador", "cards"]) {
  const u = "https://mazos.cl/" + path;
  const r = await get(u);
  console.log(`\n[${r.s}] ${r.ct} server=${r.server} len=${(r.t || "").length} ${u}`);
}

const home = await get("https://mazos.cl/");
if (home.t) {
  const scripts = [...new Set([...home.t.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map((m) => m[1]))];
  console.log("\nSCRIPTS:", JSON.stringify(scripts.slice(0, 25)));
  console.log("framework:", {
    next: /_next|__NEXT_DATA__/.test(home.t),
    nuxt: /__NUXT__|_nuxt\//.test(home.t),
    react: /id="root"/.test(home.t),
    wordpress: /wp-content|wp-json/.test(home.t),
    angular: /ng-version|ng-app/.test(home.t),
    laravel: /csrf-token|laravel/i.test(home.t),
  });
  const apis = [...new Set([...home.t.matchAll(/https?:\/\/[^\s"'`)]*?(?:api|wp-json|supabase|firebaseio|graphql)[^\s"'`)]*/gi)].map((m) => m[0]))];
  console.log("API URLs en HTML:", JSON.stringify(apis.slice(0, 20)));
  console.log("supabase?", /supabase/i.test(home.t), "| firebase?", /firebase/i.test(home.t), "| wp-json?", /wp-json/i.test(home.t));
}

// Probar endpoints típicos
console.log("\n== CANDIDATOS API ==");
for (const u of [
  "https://mazos.cl/wp-json/",
  "https://mazos.cl/wp-json/wp/v2/",
  "https://mazos.cl/api/cards",
  "https://mazos.cl/api/cartas",
  "https://mazos.cl/api/",
  "https://api.mazos.cl/",
]) {
  const r = await get(u);
  console.log(`[${r.s}] ${r.ct} len=${(r.t || "").length} ${u}` + (r.s === 200 && /json/.test(r.ct) ? " -> " + r.t.slice(0, 160).replace(/\s+/g, " ") : ""));
}
console.log("### FIN");
