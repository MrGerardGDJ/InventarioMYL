#!/usr/bin/env node
/**
 * Diagnóstico 3: claves top-level de la API + patrón de URL de imágenes (desde el DOM).
 */
import { chromium } from "playwright";

const slug = process.argv[2] || "helenica";

// 1) Estructura de la API
const apiUrl = `https://api.myl.cl/cards/edition/${slug}`;
const res = await fetch(apiUrl, {
  headers: {
    "User-Agent": "Mozilla/5.0 Chrome/124.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    Origin: "https://tor.myl.cl",
    Referer: "https://tor.myl.cl/",
  },
});
const data = JSON.parse(await res.text());
console.log("== TOP-LEVEL KEYS ==", JSON.stringify(Object.keys(data)));
for (const [k, v] of Object.entries(data)) {
  if (Array.isArray(v)) {
    console.log(`\n[array] ${k}: ${v.length} items | claves item:`, JSON.stringify(Object.keys(v[0] || {})));
    if (v.length && Object.keys(v[0]).length <= 4) console.log("   muestra:", JSON.stringify(v.slice(0, 6)));
  } else {
    console.log(`[scalar/obj] ${k}:`, JSON.stringify(v).slice(0, 120));
  }
}

// 2) Patrón de imagen desde la página renderizada
const browser = await chromium.launch({ headless: true });
const page = await browser.newContext({ userAgent: "Mozilla/5.0 Chrome/124.0 Safari/537.36" }).then((c) => c.newPage());
await page.goto(`https://tor.myl.cl/cartas/${slug}`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
await page.waitForTimeout(3500);
const imgs = await page.evaluate(() => {
  const els = Array.from(document.querySelectorAll(".lazyimg, img")).slice(0, 6);
  return els.map((el) => ({
    tag: el.tagName,
    src: el.getAttribute("src"),
    backImg: el.getAttribute("back-img"),
    ngSrc: el.getAttribute("ng-src"),
    dataSrc: el.getAttribute("data-src"),
    style: (el.getAttribute("style") || "").slice(0, 160),
  }));
});
console.log("\n== IMÁGENES (primeros 6 elementos) ==");
console.log(JSON.stringify(imgs, null, 2));
await browser.close();
console.log("\n### FIN\n");
