#!/usr/bin/env node
/**
 * Scraper de cartas de Mitos y Leyendas (tor.myl.cl) para la app Inventario MyL.
 *
 * Recorre cada edición en /cartas/{slug}, espera a que la app Angular renderice
 * y extrae los datos de cada carta desde el DOM. Escribe ../data/cards.json.
 *
 * Uso:
 *   node scrape.js                      # todas las ediciones
 *   node scrape.js --edition espada_sagrada helenica   # solo algunas
 *   node scrape.js --format PB          # solo un formato (PE|PB|SB|FX|NE)
 *   node scrape.js --limit 5            # primeras N ediciones (útil para probar)
 *
 * Requiere: npm install  (instala Playwright + Chromium)
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { allEditions, slugToName } from "./editions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = "https://tor.myl.cl";
const OUT = path.join(__dirname, "..", "data", "cards.json");

/* ---------- argumentos ---------- */
const argv = process.argv.slice(2);
function argList(flag) {
  const i = argv.indexOf(flag);
  if (i === -1) return null;
  const vals = [];
  for (let j = i + 1; j < argv.length && !argv[j].startsWith("--"); j++) vals.push(argv[j]);
  return vals;
}
const onlyEditions = argList("--edition");
const onlyFormat = argList("--format")?.[0];
const limit = argList("--limit")?.[0] ? Number(argList("--limit")[0]) : null;

let editions = allEditions();
if (onlyFormat) editions = editions.filter((e) => e.format === onlyFormat);
if (onlyEditions) editions = editions.filter((e) => onlyEditions.includes(e.slug));
if (limit) editions = editions.slice(0, limit);

console.log(`Scrapeando ${editions.length} ediciones de ${BASE}`);

/* ---------- extracción dentro del navegador ---------- */
// Se ejecuta en el contexto de la página. Es defensiva: intenta varias
// estructuras de DOM ya que el marcado del sitio puede cambiar.
function extractCards() {
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  const num = (s) => {
    const m = clean(s).match(/-?\d+/);
    return m ? Number(m[0]) : null;
  };

  // Candidatos a contenedor de carta
  let nodes = Array.from(document.querySelectorAll(".cardinfo"));
  if (nodes.length === 0) nodes = Array.from(document.querySelectorAll("[class*='card']")).filter((n) => n.querySelector("img"));

  const out = [];
  for (const node of nodes) {
    const titleEl = node.querySelector(".content-title, .card-title, h3, h2, .title");
    const name = clean(titleEl?.textContent);
    if (!name) continue;

    const imgEl = node.querySelector("img");
    const image =
      imgEl?.getAttribute("back-img") ||
      imgEl?.getAttribute("data-src") ||
      imgEl?.getAttribute("src") ||
      "";

    const abilityEl = node.querySelector(".cardability, .ability, .card-text, .descripcion");
    const ability = clean(abilityEl?.textContent);

    // Lee pares etiqueta:valor del texto del contenedor
    const text = clean(node.textContent);
    const field = (labels) => {
      for (const label of labels) {
        const re = new RegExp(label + "\\s*:?\\s*([\\wáéíóúñ\\-]+)", "i");
        const m = text.match(re);
        if (m) return clean(m[1]);
      }
      return "";
    };

    out.push({
      name,
      image: image.startsWith("//") ? "https:" + image : image,
      rarity: field(["Rareza", "Rarity"]),
      type: field(["Tipo", "Type"]),
      race: field(["Raza", "Race"]),
      strength: num(field(["Fuerza", "Ataque"])),
      cost: num(field(["Coste", "Costo", "Cost"])),
      ability,
    });
  }
  return out;
}

/* ---------- recorrido ---------- */
const all = [];
const seen = new Set();

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  viewport: { width: 1366, height: 900 },
});
const page = await ctx.newPage();

for (const ed of editions) {
  const url = `${BASE}/cartas/${ed.slug}`;
  process.stdout.write(`• ${ed.name} (${ed.slug}) … `);
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    // Espera a que Angular pinte tarjetas
    await page
      .waitForSelector(".cardinfo, [class*='card'] img", { timeout: 20000 })
      .catch(() => {});
    // Hace scroll para forzar lazy-loading
    await autoScroll(page);
    const cards = await page.evaluate(extractCards);

    let added = 0;
    for (const c of cards) {
      const id = `${ed.slug}__${c.name.toLowerCase().replace(/[^\wáéíóúñ]+/g, "_").replace(/^_+|_+$/g, "")}`;
      if (seen.has(id)) continue;
      seen.add(id);
      all.push({
        id,
        name: c.name,
        edition: ed.slug,
        editionName: ed.name || slugToName(ed.slug),
        format: ed.format,
        type: c.type || "—",
        race: c.race || "—",
        rarity: c.rarity || "—",
        cost: c.cost,
        strength: c.strength,
        ability: c.ability || "",
        image: c.image || "",
      });
      added++;
    }
    console.log(`${added} cartas`);
  } catch (err) {
    console.log(`error: ${err.message}`);
  }
}

await browser.close();

/* ---------- escribir salida ---------- */
all.sort((a, b) => a.editionName.localeCompare(b.editionName, "es") || a.name.localeCompare(b.name, "es"));
const payload = {
  meta: {
    source: "tor.myl.cl",
    generatedAt: new Date().toISOString(),
    editions: editions.length,
    count: all.length,
  },
  cards: all,
};
fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(`\n✓ ${all.length} cartas escritas en ${OUT}`);

// Muestra de validación (útil para revisar la extracción en los logs)
console.log("\n=== MUESTRA (primeras 5 cartas) ===");
console.log(JSON.stringify(all.slice(0, 5), null, 2));
const withImg = all.filter((c) => c.image).length;
const withCost = all.filter((c) => c.cost != null).length;
console.log(`\nResumen: ${all.length} cartas · ${withImg} con imagen · ${withCost} con coste`);

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let total = 0;
      const step = 800;
      const timer = setInterval(() => {
        window.scrollBy(0, step);
        total += step;
        if (total >= document.body.scrollHeight + 2000) {
          clearInterval(timer);
          resolve();
        }
      }, 120);
    });
  });
  await page.waitForTimeout(500);
}
