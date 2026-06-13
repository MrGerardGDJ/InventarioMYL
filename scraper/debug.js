#!/usr/bin/env node
/**
 * Diagnóstico: encontrar el endpoint que lista TODAS las ediciones/formatos,
 * para no depender de una lista fija.
 */
const H = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Origin: "https://tor.myl.cl",
  Referer: "https://tor.myl.cl/",
};

async function show(url, { json = true } = {}) {
  try {
    const r = await fetch(url, { headers: H });
    const t = await r.text();
    console.log(`\n[${r.status}] ${url}  (${t.length} bytes)`);
    if (json) console.log(t.slice(0, 900));
    return t;
  } catch (e) {
    console.log(`ERR ${url}: ${e.message}`);
    return "";
  }
}

// 1) Candidatos a endpoint de lista de ediciones
console.log("===== CANDIDATOS DE LISTA DE EDICIONES =====");
for (const u of [
  "https://api.myl.cl/editions",
  "https://api.myl.cl/cards/editions",
  "https://api.myl.cl/cards/edition",
  "https://api.myl.cl/formats",
  "https://api.myl.cl/cards/formats",
  "https://api.myl.cl/blocks",
  "https://api.myl.cl/editions/all",
  "https://api.myl.cl/cards/editions/all",
]) {
  await show(u);
}

// 2) Buscar el endpoint en los JS del sitio
console.log("\n\n===== JS DEL SITIO =====");
const index = await show("https://tor.myl.cl/", { json: false });
const scripts = [...index.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map((m) => m[1]);
console.log("scripts:", JSON.stringify(scripts));
for (let s of scripts) {
  if (/^\/\//.test(s)) s = "https:" + s;
  else if (s.startsWith("/")) s = "https://tor.myl.cl" + s;
  else if (!/^https?:/.test(s)) s = "https://tor.myl.cl/" + s;
  if (!s.includes("tor.myl.cl")) continue;
  try {
    const js = await (await fetch(s, { headers: H })).text();
    const hits = [...js.matchAll(/https:\/\/api\.myl\.cl\/[^\s"'`)]+/g)].map((m) => m[0]);
    const edLines = js.split("\n").filter((l) => /edition|formato|format|bloque|block/i.test(l) && /api\.myl|http|\/cards\//i.test(l));
    if (hits.length || edLines.length) {
      console.log(`\n--- ${s} ---`);
      console.log("endpoints api.myl.cl:", JSON.stringify([...new Set(hits)].slice(0, 20)));
      console.log("líneas edición:", edLines.slice(0, 8).map((l) => l.trim()).join("\n"));
    }
  } catch (e) {
    console.log("err js", s, e.message);
  }
}
console.log("\n### FIN\n");
