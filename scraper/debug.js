#!/usr/bin/env node
/**
 * Diagnóstico: descubre cómo carga sus datos tor.myl.cl.
 * - Intercepta respuestas de red (busca JSON / endpoints de API).
 * - Reporta selectores candidatos en el DOM ya renderizado.
 *
 * Uso: node debug.js [edicion]   (por defecto: helenica)
 */
import { chromium } from "playwright";

const edition = process.argv[2] || "helenica";
const url = `https://tor.myl.cl/cartas/${edition}`;
console.log(`\n### DIAGNÓSTICO de ${url}\n`);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
});
const page = await ctx.newPage();

const responses = [];
page.on("response", async (res) => {
  try {
    const ct = res.headers()["content-type"] || "";
    const u = res.url();
    const isJson = ct.includes("json") || /\.json(\?|$)/.test(u);
    const interesting = isJson || /api|carta|card|search|edici|coleccion/i.test(u);
    if (!interesting) return;
    let sample = "";
    if (isJson) {
      const txt = await res.text().catch(() => "");
      sample = txt.slice(0, 1200);
    }
    responses.push({ status: res.status(), ct, url: u, sample });
  } catch {}
});

await page.goto(url, { waitUntil: "networkidle", timeout: 60000 }).catch((e) => console.log("goto:", e.message));
await page.waitForTimeout(4000);

console.log("== TÍTULO ==", await page.title());

// Conteo de selectores candidatos
const counts = await page.evaluate(() => {
  const sels = [
    ".cardinfo", ".content-title", ".cardability", ".lazyimg", "a.ng-scope",
    "[ng-repeat]", ".card", ".carta", ".col", "img", "[class*='card']", "[class*='carta']",
  ];
  const out = {};
  for (const s of sels) out[s] = document.querySelectorAll(s).length;
  return out;
});
console.log("== CONTEO SELECTORES ==");
console.log(JSON.stringify(counts, null, 2));

// Clases más frecuentes en el body (pista de estructura)
const topClasses = await page.evaluate(() => {
  const freq = {};
  document.querySelectorAll("*").forEach((el) => {
    el.classList.forEach((c) => (freq[c] = (freq[c] || 0) + 1));
  });
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 40);
});
console.log("== CLASES MÁS FRECUENTES ==");
console.log(JSON.stringify(topClasses));

// Muestra del HTML renderizado de un posible contenedor de carta
const snippet = await page.evaluate(() => {
  const cand = document.querySelector("[ng-repeat], [class*='card'], .col");
  return cand ? cand.outerHTML.slice(0, 1500) : "(sin candidato)";
});
console.log("== SNIPPET DOM ==\n", snippet);

console.log(`\n== RESPUESTAS DE RED INTERESANTES (${responses.length}) ==`);
for (const r of responses) {
  console.log(`\n[${r.status}] ${r.ct}\n${r.url}`);
  if (r.sample) console.log("  muestra:", r.sample.replace(/\n/g, " "));
}

await browser.close();
console.log("\n### FIN DIAGNÓSTICO\n");
