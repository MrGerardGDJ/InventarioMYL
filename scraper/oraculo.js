#!/usr/bin/env node
/**
 * Agente recopilador del Oráculo PE (https://tomacotgc.ddns.net/Oraculo).
 *
 * El Oráculo PE (Rene Figueroa) es la base de datos de cartas de Primera Era
 * con el texto VIGENTE de cada carta, sus aclaraciones de reglamento, la
 * leyenda (texto de ambientación), el marco (edición de diseño), las
 * mecánicas, los límites de copias por formato y todas sus impresiones
 * (producto + número) con imagen de alta resolución.
 *
 * Qué hace:
 *   1. Lee la página de documentos y descubre los productos (galerías):
 *        /imagenes?productoNombre=<CLAVE>   → cartas del producto (cartaId + versionId + imagen)
 *   2. Para cada carta distinta pide el detalle:
 *        POST /cartas/getcarddetails (cartaId, versionId)   → JSON
 *   3. Escribe un archivo compacto: ../data/oraculo.json
 *   La caché cruda queda en ./.cache/ (no se versiona) para reanudar si se corta.
 *
 * Uso:
 *   node oraculo.js                    # todo (≈1.500 cartas, ~30 min a ritmo cortés)
 *   node oraculo.js --product HLPE26   # solo un producto (se mezcla con lo ya guardado)
 *   node oraculo.js --refresh          # ignora la caché de detalles y vuelve a pedirlos
 *   node oraculo.js --delay 600        # ms entre peticiones (por defecto 450)
 *
 * El servidor es un equipo casero: nunca más de 2 peticiones simultáneas y con pausa.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = "https://tomacotgc.ddns.net";
const OUT = path.join(__dirname, "..", "data", "oraculo.json");
const CACHE_DIR = path.join(__dirname, ".cache");
const CACHE_DET = path.join(CACHE_DIR, "oraculo-detalles.json");
const CACHE_GAL = path.join(CACHE_DIR, "oraculo-galerias.json");
const UA = "Mozilla/5.0 (InventarioMyL-oraculo-agent)";

const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(n); return i === -1 ? null : argv[i + 1]; };
const onlyProduct = arg("--product");
const refresh = argv.includes("--refresh");
const DELAY = Number(arg("--delay") || 450);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return fb; } };
const unesc = (s) => String(s ?? "").replace(/&#x([0-9A-F]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');

async function http(url, opts = {}, tries = 4) {
  let last;
  for (let t = 0; t < tries; t++) {
    try {
      const r = await fetch(url, { ...opts, headers: { "User-Agent": UA, ...(opts.headers || {}) } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) { last = e; await sleep(1500 * (t + 1)); }
  }
  throw new Error(`${url}: ${last?.message}`);
}

async function discoverProducts() {
  const html = await http(`${BASE}/Oraculo/Documentos`);
  return [...new Set([...html.matchAll(/\/imagenes\?productoNombre=([A-Za-z0-9_-]+)/g)].map((m) => m[1]))].sort();
}

async function readGallery(key) {
  const html = await http(`${BASE}/imagenes?productoNombre=${key}`);
  const titulo = unesc((html.match(/<h1>(.*?)<\/h1>/s) || [])[1] || key);
  const items = [...html.matchAll(/data-src="([^"]+)">\s*<a href="#" class="ora-carta__lamina open-modal"\s*data-carta-id="(\d+)" data-version-id="(\d+)"\s*aria-label="([^"]*)"/g)]
    .map((m) => ({ img: m[1], cartaId: +m[2], versionId: +m[3], nombre: unesc(m[4]).replace(/^Ver /, "") }));
  // Láminas sin carta asociada en la base (cartaId 0): se conservan solo por su imagen
  const huerfanas = [...html.matchAll(/data-src="([^"]+)"/g)].map((m) => m[1]).filter((u) => !items.some((i) => i.img === u));
  return { key, titulo, items, huerfanas };
}

async function readDetail(cartaId, versionId) {
  const body = new URLSearchParams({ cartaId: String(cartaId), versionId: String(versionId) });
  const txt = await http(`${BASE}/cartas/getcarddetails`, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  return JSON.parse(txt);
}

// Entrada compacta: solo lo que usa la app (sin nulos ni vacíos)
function compact(d, keyByVersion) {
  const put = (o, k, v) => { if (v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && !v.length)) o[k] = v; };
  const o = {};
  put(o, "n", d.nombre);
  put(o, "h", d.habilidad);
  put(o, "a", d["aclaración"] ?? d.aclaracion);
  put(o, "l", d.leyenda);
  put(o, "c", d.costeOro);
  put(o, "f", d.fuerza);
  put(o, "t", d.tipoStr);
  put(o, "r", d.razaStr);
  put(o, "e", d.edicionNombre);
  put(o, "k", d.mecanicas);
  put(o, "x", d.limiteCopias);
  put(o, "y", (d.copiasPorFormato || []).map((z) => [z.formato, z.maxCopias]));
  put(o, "m", (d.fechaModificacion || "").slice(0, 10));
  put(o, "v", (d.versiones || []).map((v) => {
    const arr = [v.versionId, keyByVersion.get(v.versionId) || null, v.numero];
    if (v.nota) arr.push(v.nota);
    return arr;
  }));
  return o;
}

async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const claves = onlyProduct ? [onlyProduct] : await discoverProducts();
  console.log(`Productos: ${claves.length}`);

  const galerias = readJson(CACHE_GAL, {});
  for (const k of claves) {
    galerias[k] = await readGallery(k);
    console.log(`  ${k}: ${galerias[k].titulo} · ${galerias[k].items.length} cartas${galerias[k].huerfanas.length ? ` (+${galerias[k].huerfanas.length} láminas sin carta)` : ""}`);
    await sleep(DELAY);
  }
  fs.writeFileSync(CACHE_GAL, JSON.stringify(galerias));

  const keyByVersion = new Map();
  const primeraVersion = new Map();
  for (const g of Object.values(galerias)) for (const i of g.items) {
    if (!i.cartaId) continue;
    keyByVersion.set(i.versionId, g.key);
    if (!primeraVersion.has(i.cartaId)) primeraVersion.set(i.cartaId, i.versionId);
  }

  const detalles = refresh ? {} : readJson(CACHE_DET, {});
  const pendientes = [...primeraVersion].filter(([cid]) => !detalles[cid]);
  console.log(`Detalles: ${Object.keys(detalles).length} en caché, ${pendientes.length} por pedir`);

  let hechas = 0, fallos = 0;
  async function worker(cola) {
    while (cola.length) {
      const [cid, vid] = cola.shift();
      try { detalles[cid] = await readDetail(cid, vid); } catch (e) { fallos++; console.warn(`  ✗ carta ${cid}: ${e.message}`); }
      if (++hechas % 100 === 0) { fs.writeFileSync(CACHE_DET, JSON.stringify(detalles)); console.log(`  ${hechas}/${pendientes.length}`); }
      await sleep(DELAY);
    }
  }
  const cola = [...pendientes];
  await Promise.all([worker(cola), worker(cola)]);
  fs.writeFileSync(CACHE_DET, JSON.stringify(detalles));

  // Con --product se mezcla con el archivo existente; sin él se reconstruye entero
  const prev = onlyProduct ? readJson(OUT, null) : null;
  const cartas = prev?.cartas || {};
  for (const [cid, d] of Object.entries(detalles)) cartas[cid] = compact(d, keyByVersion);
  const productos = Object.fromEntries(Object.values(galerias).map((g) => [g.key, { nombre: g.titulo, cartas: g.items.length, laminasSinCarta: g.huerfanas.length }]));
  const out = {
    meta: { fuente: `${BASE}/Oraculo`, scrapedAt: new Date().toISOString(), cartas: Object.keys(cartas).length, productos: Object.keys(productos).length },
    productos: { ...(prev?.productos || {}), ...productos },
    cartas,
  };
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`✓ ${OUT}: ${out.meta.cartas} cartas, ${out.meta.productos} productos, ${fallos} fallos`);
  if (fallos) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
