#!/usr/bin/env node
/**
 * Scraper de la Ban List "Primera Era — Formato Racial Edición" para la app
 * Inventario MyL.
 *
 * Fuente: https://blog.myl.cl/ban-list-primera-era-formato-racial-edicion/
 * Es una entrada de blog de WordPress que Fénix actualiza in-place cada vez
 * que sale una nueva versión de la ban list (no hay un endpoint de datos:
 * hay que parsear las 3 tablas HTML del artículo).
 *
 * Estructura de las tablas (siempre las primeras 3 <table> del artículo, en
 * este orden): prohibidas, límite a 1 copia, límite a 2 copias. Cada tabla
 * tiene una fila de encabezado con el nombre de las 5 ediciones del formato
 * (El Reto / Mundo Gótico / La Ira del Nahual / Ragnarok / Espíritu de
 * Dragón) y filas de datos con hasta 5 celdas, una por edición (celda vacía
 * o "–" si esa columna ya no tiene más cartas en esa fila).
 *
 * Escribe ../data/banlist.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "data", "banlist.json");
const EDITIONS_FILE = path.join(__dirname, "..", "data", "editions.json");
const SOURCE_URL = "https://blog.myl.cl/ban-list-primera-era-formato-racial-edicion/";
const FORMAT_NAME = "Primera Era — Racial Edición";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
};

function stripAccents(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#8211;/g, "–").replace(/&#8217;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}
function stripTags(s) {
  return decodeEntities(String(s).replace(/<[^>]+>/g, "")).trim();
}

function parseTable(tableHtml) {
  const rows = tableHtml.match(/<tr[\s\S]*?<\/tr>/g) || [];
  return rows.map((r) => {
    const cells = r.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/g) || [];
    return cells.map((c) => stripTags(c.replace(/^<t[dh][^>]*>/, "").replace(/<\/t[dh]>$/, "")));
  });
}

// Junta las filas de una tabla en {edición_header: [nombres...]}, ignorando
// celdas vacías o el separador "–" que usan para rellenar columnas cortas.
function tableToByEdition(tableHtml) {
  const rows = parseTable(tableHtml);
  if (!rows.length) return {};
  const header = rows[0];
  const byEdition = {};
  for (const h of header) byEdition[h] = [];
  for (const row of rows.slice(1)) {
    row.forEach((cell, i) => {
      const name = cell.trim();
      const h = header[i];
      if (!h || !name || name === "–" || name === "-") return;
      byEdition[h].push(name);
    });
  }
  return byEdition;
}

// Quita palabras de enlace ("de", "del", "la", ...) además de tildes, para
// que "Espíritu de Dragón" (blog) calce con "Espiritu Del Dragon" (catálogo)
// aunque una use "de" y la otra "del".
const STOPWORDS = new Set(["de", "del", "la", "el", "los", "las"]);
function normEditionKey(s) {
  return stripAccents(s).split(/\s+/).filter((w) => w && !STOPWORDS.has(w)).join(" ");
}

async function main() {
  const editions = JSON.parse(fs.readFileSync(EDITIONS_FILE, "utf-8"));
  const editionByNorm = new Map(editions.map((e) => [normEditionKey(e.name), e]));
  function resolveEdition(blogName) {
    const key = normEditionKey(blogName);
    const hit = editionByNorm.get(key);
    if (hit) return hit;
    // fallback: contiene/está contenido (por si el blog usa una variante corta/larga)
    for (const [norm, e] of editionByNorm) {
      if (norm.includes(key) || key.includes(norm)) return e;
    }
    return null;
  }

  const res = await fetch(SOURCE_URL, { headers: HEADERS });
  if (!res.ok) throw new Error(`No se pudo descargar la ban list: HTTP ${res.status}`);
  const html = await res.text();

  // El artículo puede traer el contenido antes de los comentarios; recortamos
  // ahí si existe esa marca, si no usamos todo el resto del documento.
  const articleEnd = html.indexOf('id="div-comment-');
  const content = html.slice(html.indexOf('<div class="entry-content">'), articleEnd !== -1 ? articleEnd : undefined);

  const tables = content.match(/<table[\s\S]*?<\/table>/g) || [];
  if (tables.length < 3) {
    throw new Error(`Se esperaban al menos 3 tablas (prohibidas/límite1/límite2) y se encontraron ${tables.length} — revisar si cambió el formato de la página.`);
  }

  const STATUS = [
    { key: "banned", table: tables[0], maxCopies: 0 },
    { key: "limit1", table: tables[1], maxCopies: 1 },
    { key: "limit2", table: tables[2], maxCopies: 2 },
  ];

  const entries = [];
  const unresolvedEditions = new Set();
  for (const { key, table, maxCopies } of STATUS) {
    const byEdition = tableToByEdition(table);
    for (const [blogEditionName, names] of Object.entries(byEdition)) {
      const ed = resolveEdition(blogEditionName);
      if (!ed) { unresolvedEditions.add(blogEditionName); continue; }
      for (const name of names) {
        entries.push({ edition: ed.slug, editionName: ed.name, name, status: key, maxCopies });
      }
    }
  }
  if (unresolvedEditions.size) {
    console.warn("⚠ Ediciones de la ban list sin match en data/editions.json:", [...unresolvedEditions].join(", "));
  }

  // Metadatos de la actualización (best-effort — no revienta el scraper si
  // el texto exacto cambia, solo deja los campos sin llenar).
  const titleMatch = content.match(/Actualizaci[oó]n\s+([^<]+?)\s*<\/(?:em|strong|h[1-4])>/i);
  const updateLabel = titleMatch ? stripTags(titleMatch[1]) : null;
  const effectiveMatch = content.match(/vigente desde el ([^.]+?) para todos los torneos/i);
  const effectiveNote = effectiveMatch ? stripTags(effectiveMatch[1]) : null;

  const out = {
    meta: {
      sourceUrl: SOURCE_URL,
      format: FORMAT_NAME,
      updateLabel,
      effectiveNote,
      scrapedAt: new Date().toISOString(),
      totalEntries: entries.length,
    },
    entries,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2), "utf-8");
  console.log(`✓ ${entries.length} entradas escritas en ${path.relative(process.cwd(), OUT)}`);
  console.log(`  banned=${entries.filter((e) => e.status === "banned").length} limit1=${entries.filter((e) => e.status === "limit1").length} limit2=${entries.filter((e) => e.status === "limit2").length}`);
  if (updateLabel) console.log(`  actualización: ${updateLabel}`);
}

main().catch((e) => {
  console.error("✗ Error scrapeando la ban list:", e.message);
  process.exit(1);
});
