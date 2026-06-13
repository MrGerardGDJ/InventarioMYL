#!/usr/bin/env node
/**
 * Scraper de cartas de Mitos y Leyendas para la app Inventario MyL.
 *
 * Usa la API pública que alimenta a tor.myl.cl:
 *   GET https://api.myl.cl/cards/edition/{slug}
 * que devuelve { edition, races, types, rarities, keywords, cards }.
 * Las imágenes siguen el patrón:
 *   https://api.myl.cl/static/cards/{ed_edid}/{edid}.png
 *
 * Escribe ../data/cards.json
 *
 * Uso:
 *   node scrape.js                       # todas las ediciones
 *   node scrape.js --edition helenica espada_sagrada
 *   node scrape.js --format PB
 *   node scrape.js --limit 5             # primeras N (prueba)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { allEditions, slugToName } from "./editions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "data", "cards.json");
const API = "https://api.myl.cl/cards/edition";
const IMG = "https://api.myl.cl/static/cards";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Origin: "https://tor.myl.cl",
  Referer: "https://tor.myl.cl/",
};

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

console.log(`Scrapeando ${editions.length} ediciones desde ${API}`);

/* ---------- helpers ---------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
function titleCase(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(^|[\s("'¡¿\-/])([a-záéíóúñü])/g, (_, p, c) => p + c.toUpperCase());
}
// Construye un mapa id->name desde la primera clave top-level que sea un arreglo {id,name}
function lookup(data, ...keys) {
  for (const k of keys) {
    if (Array.isArray(data[k]) && data[k][0] && "id" in data[k][0]) {
      return new Map(data[k].map((o) => [String(o.id), o.name]));
    }
  }
  return new Map();
}

/* ---------- recorrido ---------- */
const all = [];
const seen = new Set();
let okEditions = 0;

for (const ed of editions) {
  process.stdout.write(`• ${ed.name} (${ed.slug}) … `);
  try {
    const res = await fetch(`${API}/${ed.slug}`, { headers: HEADERS });
    if (!res.ok) {
      console.log(`HTTP ${res.status}`);
      continue;
    }
    const data = JSON.parse(await res.text());
    const cards = data.cards || (Array.isArray(data) ? data : []);
    const races = lookup(data, "races", "race");
    const types = lookup(data, "types", "type");
    const rarities = lookup(data, "rarities", "rarity");
    const keywords = lookup(data, "keywords", "keyword");
    const edTitle = data.edition?.title || ed.name || slugToName(ed.slug);

    let added = 0;
    for (const c of cards) {
      const edid = String(c.edid ?? "").padStart(3, "0");
      const id = `${ed.slug}__${edid}__${c.slug || added}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const edImgId = String(c.ed_edid ?? data.edition?.id ?? "");
      all.push({
        id,
        name: titleCase(c.name) || "(sin nombre)",
        edition: ed.slug,
        editionName: edTitle,
        format: ed.format,
        edid,
        type: types.get(String(c.type)) || "—",
        race: races.get(String(c.race)) || "—",
        rarity: rarities.get(String(c.rarity)) || "—",
        keyword: keywords.get(String(c.keywords)) || "",
        cost: num(c.cost),
        strength: num(c.damage),
        ability: (c.ability || "").replace(/\s+/g, " ").trim(),
        flavour: (c.flavour || "").replace(/\s+/g, " ").trim(),
        image: edImgId && c.edid != null ? `${IMG}/${edImgId}/${c.edid}.png` : "",
      });
      added++;
    }
    okEditions++;
    console.log(`${added} cartas`);
  } catch (err) {
    console.log(`error: ${err.message}`);
  }
  await sleep(120);
}

/* ---------- escribir salida ---------- */
all.sort((a, b) => a.editionName.localeCompare(b.editionName, "es") || a.name.localeCompare(b.name, "es"));
const payload = {
  meta: {
    source: "api.myl.cl",
    generatedAt: new Date().toISOString(),
    editions: okEditions,
    count: all.length,
  },
  cards: all,
};
fs.writeFileSync(OUT, JSON.stringify(payload));
console.log(`\n✓ ${all.length} cartas de ${okEditions}/${editions.length} ediciones → ${OUT}`);

// Muestra de validación
console.log("\n=== MUESTRA (primeras 3) ===");
console.log(JSON.stringify(all.slice(0, 3), null, 2));
const withImg = all.filter((c) => c.image).length;
const withRace = all.filter((c) => c.race !== "—").length;
console.log(`\nResumen: ${all.length} cartas · ${withImg} con imagen · ${withRace} con raza resuelta`);
