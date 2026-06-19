#!/usr/bin/env node
/**
 * Scraper de cartas de Mitos y Leyendas para la app Inventario MyL.
 *
 * Fuente: API pública que alimenta tor.myl.cl.
 *   - https://api.myl.cl/cards/edition/todas        → todas las cartas (descubre ediciones)
 *   - https://api.myl.cl/cards/edition/{slug}        → cartas + tablas (raza/tipo/rareza) por edición
 *   - imágenes: https://api.myl.cl/static/cards/{ed_edid}/{edid}.png
 *
 * Estrategia: descubre la lista de ediciones desde "todas" (incluye las nuevas
 * y futuras) y la combina con la lista conocida (recupera ediciones antiguas
 * que "todas" no incluye). Consulta cada edición y deduplica por carta.
 *
 * Escribe ../data/cards.json
 *
 * Uso:
 *   node scrape.js                 # todo
 *   node scrape.js --limit 5       # prueba rápida (primeras N ediciones)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { allEditions, slugToName, FORMATS } from "./editions.js";

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

const argv = process.argv.slice(2);
const limitArg = argv.indexOf("--limit");
const limit = limitArg !== -1 ? Number(argv[limitArg + 1]) : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const norm = (s) => String(s || "").toLowerCase().replace(/[-_\s]/g, "");
function titleCase(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim()
    .replace(/(^|[\s("'¡¿\-/])([a-záéíóúñü])/g, (_, p, c) => p + c.toUpperCase());
}
function cleanTitle(t) {
  return String(t || "").replace(/^\s*(IMP|IMPERIO|PE|PB|SB|FX|NE)\s*[-–:]\s*/i, "").trim();
}
function lookup(data, ...keys) {
  for (const k of keys) {
    if (Array.isArray(data[k]) && data[k][0] && "id" in data[k][0]) {
      return new Map(data[k].map((o) => [String(o.id), o.name]));
    }
  }
  return new Map();
}

async function getJson(url) {
  const r = await fetch(url, { headers: HEADERS });
  const t = await r.text();
  if (!r.ok) return null;
  // El backend a veces antepone un warning antes del JSON; toma el último objeto.
  try { return JSON.parse(t); }
  catch {
    const i = t.lastIndexOf('{"status"');
    try { return JSON.parse(t.slice(i)); } catch { return null; }
  }
}

/* ---------- mapa slug→formato (desde la lista conocida) ---------- */
const fmtByNorm = new Map();
const nameByNorm = new Map();
for (const e of allEditions()) {
  fmtByNorm.set(norm(e.slug), e.format);
  nameByNorm.set(norm(e.slug), e.name);
}
function formatFor(slug) {
  return fmtByNorm.get(norm(slug)) || "NE"; // por defecto Imperio/Nueva Era
}

/* ---------- 1) descubrir ediciones desde "todas" ---------- */
console.log("Descubriendo ediciones desde /todas …");
const todas = await getJson(`${API}/todas`);
const discovered = new Set();
if (todas?.cards) {
  for (const c of todas.cards) if (c.ed_slug) discovered.add(c.ed_slug);
  console.log(`  todas: ${todas.cards.length} cartas, ${discovered.size} ediciones`);
} else {
  console.log("  (no se pudo leer /todas; se usará solo la lista conocida)");
}

/* ---------- 2) lista de ediciones a consultar (unión, sin duplicar normalizados) ---------- */
const slugs = [];
const seenNorm = new Set();
function addSlug(s) {
  const n = norm(s);
  if (!n || seenNorm.has(n)) return;
  seenNorm.add(n);
  slugs.push(s);
}
for (const s of discovered) addSlug(s);          // canónicos + nuevos (prioridad)
for (const e of allEditions()) addSlug(e.slug);  // recupera ediciones antiguas omitidas por "todas"

let editionsToFetch = slugs;
if (limit) editionsToFetch = editionsToFetch.slice(0, limit);
console.log(`Consultando ${editionsToFetch.length} ediciones…\n`);

/* ---------- 3) consultar cada edición y deduplicar por carta ---------- */
const all = [];
const seenCards = new Set(); // clave: ed_edid/edid (única por carta física)
let okEditions = 0;

for (const slug of editionsToFetch) {
  process.stdout.write(`• ${slug} … `);
  const data = await getJson(`${API}/${encodeURIComponent(slug)}`);
  if (!data || !Array.isArray(data.cards)) { console.log("sin datos"); await sleep(80); continue; }

  const races = lookup(data, "races", "race");
  const types = lookup(data, "types", "type");
  const rarities = lookup(data, "rarities", "rarity");
  const keywords = lookup(data, "keywords", "keyword");
  const edTitleRaw = data.edition?.title || nameByNorm.get(norm(slug)) || slugToName(slug);
  const edTitle = cleanTitle(edTitleRaw) || edTitleRaw;
  const format = formatFor(slug);

  let added = 0;
  for (const c of data.cards) {
    const edImgId = String(c.ed_edid ?? data.edition?.id ?? "");
    const edidRaw = String(c.edid ?? "");
    const key = `${edImgId}/${edidRaw}`;
    if (seenCards.has(key)) continue;
    seenCards.add(key);
    const edid = edidRaw.padStart(3, "0");
    all.push({
      id: `${norm(slug)}__${edid}__${c.slug || added}`,
      name: titleCase(c.name) || "(sin nombre)",
      edition: slug,
      editionName: edTitle,
      format,
      edid,
      type: types.get(String(c.type)) || "—",
      race: races.get(String(c.race)) || "—",
      rarity: rarities.get(String(c.rarity)) || "—",
      keyword: keywords.get(String(c.keywords)) || "",
      cost: num(c.cost),
      strength: num(c.damage),
      ability: (c.ability || "").replace(/\s+/g, " ").trim(),
      flavour: (c.flavour || "").replace(/\s+/g, " ").trim(),
      image: edImgId && edidRaw ? `${IMG}/${edImgId}/${edidRaw}.png` : "",
    });
    added++;
  }
  okEditions++;
  console.log(`${added} cartas (${edTitle})`);
  await sleep(80);
}

/* ---------- 3.5) enriquecer nombres con acentos/ñ desde el perfil ---------- */
// El listado de la API entrega los nombres SIN diacríticos; el perfil sí los trae.
// Se consulta el perfil de cada carta (con concurrencia) para corregir el nombre.
const noNames = argv.includes("--no-names");
const reenrich = argv.includes("--reenrich");
if (!noNames && all.length) {
  const PROFILE = "https://api.myl.cl/cards/profile";
  // Incremental: reutiliza nombres ya corregidos de una corrida previa y solo
  // consulta el perfil de cartas nuevas. (--reenrich fuerza revisar todo.)
  const prevName = new Map();
  let prevHadDiacritics = false;
  try {
    const prev = JSON.parse(fs.readFileSync(OUT, "utf8"));
    for (const c of prev.cards || []) {
      prevName.set(c.id, c.name);
      if (/[áéíóúñü]/i.test(c.name)) prevHadDiacritics = true;
    }
  } catch {}
  const baseline = prevHadDiacritics && !reenrich; // ya existe una base corregida
  let pending = all;
  if (baseline) {
    for (const c of all) if (prevName.has(c.id)) c.name = prevName.get(c.id);
    pending = all.filter((c) => !prevName.has(c.id)); // solo cartas nuevas
  }
  console.log(`\nCorrigiendo nombres (acentos/ñ): ${pending.length} por consultar` +
    (baseline ? ` (reutilizadas ${all.length - pending.length} de la base previa)` : ` (base completa)`));

  let idx = 0, done = 0, fixed = 0;
  async function worker() {
    while (idx < pending.length) {
      const card = pending[idx++];
      const slug = card.id.split("__").slice(2).join("__");
      try {
        const r = await fetch(`${PROFILE}/${encodeURIComponent(card.edition)}/${encodeURIComponent(slug)}`, { headers: HEADERS });
        if (r.ok) {
          const pj = await r.json();
          const nm = pj?.details?.name;
          if (nm && nm.trim() && nm.trim() !== card.name) { card.name = nm.trim(); fixed++; }
        }
      } catch {}
      if (++done % 1500 === 0) console.log(`  ${done}/${pending.length} (corregidos: ${fixed})`);
    }
  }
  await Promise.all(Array.from({ length: 12 }, worker));
  console.log(`✓ nombres: consultados ${pending.length}, corregidos ${fixed}`);
}

/* ---------- 4) escribir salida ---------- */
all.sort((a, b) => (a.editionName || "").localeCompare(b.editionName || "", "es") || a.name.localeCompare(b.name, "es"));
const payload = {
  meta: { source: "api.myl.cl", generatedAt: new Date().toISOString(), editions: okEditions, count: all.length },
  cards: all,
};
fs.writeFileSync(OUT, JSON.stringify(payload));
console.log(`\n✓ ${all.length} cartas de ${okEditions} ediciones → ${OUT}`);

const withImg = all.filter((c) => c.image).length;
const withRace = all.filter((c) => c.race !== "—").length;
const fmtCount = {};
for (const c of all) fmtCount[c.format] = (fmtCount[c.format] || 0) + 1;
console.log(`Resumen: ${all.length} cartas · ${withImg} con imagen · ${withRace} con raza · formatos ${JSON.stringify(fmtCount)}`);
console.log("Ediciones nuevas presentes:", ["onyria", "libertadores", "ritual_vudu", "kvsm_titanes", "dia_de_muertos", "chile_oculto"].filter((s) => all.some((c) => c.edition === s)).join(", "));
