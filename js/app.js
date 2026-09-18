/* =============================================================================
   app.js — Lógica principal de Inventario MyL
   -----------------------------------------------------------------------------
   Mapa del archivo (buscar el título de cada sección para saltar a ella):
     · Estado global ............ datos en memoria (catálogo, filtros, vista)
     · Carga de datos ........... fetch de data/*.json + normalización de cartas
     · Corrección de nombres .... arregla tildes/ñ consultando el perfil de la API
     · Filtros .................. poblar selects y aplicar filtros/ordenamientos
     · Render grid .............. grilla de cartas del Catálogo (paginada)
     · Modal detalle ............ ficha ampliada de una carta (API en vivo)
     · Carta manual ............. formulario para cartas fuera del catálogo
     · Ediciones personalizadas . gestor de ediciones propias + importador CSV
     · Colecciones .............. cuaderno digital por edición (cartas en B/N)
     · Cambios .................. inventario de intercambio + historial
     · Mazos .................... CRUD de mazos + resumen + exportaciones
     · Estadísticas ............. tarjetas, gráficos y progreso por edición
     · Exportar / Importar ...... Excel, PDF, CSV y respaldo JSON
     · Guardado / Sincronización  nube Supabase (push/pull/realtime)
     · Navegación / eventos ..... tabs, listeners y arranque (init)
   ========================================================================== */
import * as store from "./store.js";
import { exportExcel, exportPricesExcel, exportPDF, exportDeckExcel, exportDeckImage, exportCollectionPDF, deckSummary } from "./exporters.js";
import { renderDeckCharts } from "./charts.js";
import * as cloud from "./cloud.js";
import { NO_STRENGTH_TYPES } from "./icons.js";
import { importEditionFromWiki } from "./wiki-import.js";

/* ===================== Estado global ===================== */
const state = {
  cards: [],        // catálogo completo (scrapeado + bundle + cartas manuales)
  editions: [],     // data/editions.json en orden de publicación por bloque
  editionName: {},  // slug -> nombre legible
  editionOrder: {}, // slug -> índice en editions.json (para ordenar por edición)
  filtered: [],     // resultado de applyFilters() que muestra la grilla
  page: 0,
  pageSize: 60,     // cartas por página en la grilla del Catálogo
  view: "coleccion",
  colFilter: "all", // filtro de la vista Colecciones: all | missing | owned
  prices: {},       // data/prices.json → { cardId: { mylserena, mesaredonda } }, cobertura parcial
  banlist: null,    // data/banlist.json → { meta, entries: [{edition, editionName, name, status, maxCopies}] }
  selectedCardId: null, // Catálogo: carta elegida para la ficha fija (memoria, no persiste)
  fichaNavList: null,   // Catálogo: orden de recorrido ← → de la ficha fija
  deckSelectedCardId: null, // Mazos: carta elegida para su propia ficha fija
  deckFichaNavList: null,   // Mazos: orden de recorrido ← → (array de cardId)
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/* ===================== Carga de datos ===================== */
async function loadData() {
  // GitHub Pages sirve estos archivos a través de un CDN (Fastly): el
  // header `cache: "no-cache"` solo le pide al NAVEGADOR que revalide en
  // vez de usar su copia local, pero esa revalidación puede seguir
  // recibiendo una respuesta vieja del propio CDN si su caché de borde
  // todavía no venció — no llega a origin a buscar la versión nueva.
  // Un parámetro de cache-busting en la URL fuerza una clave de caché
  // distinta en cada carga, así que ni el navegador ni el CDN pueden
  // devolver una copia vieja bajo ningún concepto. Reportado en la
  // práctica (09-08-2026): dos correcciones de datos ya subidas y
  // verificadas en el repo seguían sin verse en el sitio publicado.
  const v = Date.now();
  const [cardsRes, edRes, customRes, pricesRes, banlistRes] = await Promise.all([
    fetch(`./data/cards.json?v=${v}`).then((r) => r.json()).catch(() => ({ cards: [] })),
    fetch(`./data/editions.json?v=${v}`).then((r) => r.json()).catch(() => []),
    fetch(`./data/custom-cards.json?v=${v}`).then((r) => (r.ok ? r.json() : { cards: [] })).catch(() => ({ cards: [] })),
    fetch(`./data/prices.json?v=${v}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch(`./data/banlist.json?v=${v}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  state.prices = pricesRes?.prices || {};
  state.banlist = banlistRes && Array.isArray(banlistRes.entries) ? banlistRes : null;

  const scraped = (cardsRes.cards || cardsRes || []).map(normalizeCard);
  const bundledCustom = (customRes.cards || []).map(normalizeCard);
  state.baseCards = [...scraped, ...bundledCustom];
  // Ids del catálogo "oficial" (scraper + bundle compartido): distingue una
  // carta genuinamente creada por el usuario de una edición personal (que se
  // elimina del todo) de una edición LOCAL de una carta oficial (que al
  // "eliminarla" en realidad revierte a los datos originales, ver openModal).
  state.baseCardIds = new Set(state.baseCards.map((c) => c.id));
  state.editions = Array.isArray(edRes) ? edRes : [];
  state.editionName = Object.fromEntries(state.editions.map((e) => [e.slug, e.name]));
  // Orden real de publicación (editions.json viene ordenado por bloque/era)
  state.editionOrder = Object.fromEntries(state.editions.map((e, i) => [e.slug, i]));

  // Asegura nombre legible de edición y precalcula texto de búsqueda (una vez)
  for (const c of state.baseCards) {
    c.editionName = c.editionName || state.editionName[c.edition] || c.edition || "—";
    c.searchText = normText(c.name + " " + c.ability + " " + cardIdentifierText(c));
  }
  // Migración auto-reconciliante (Capa B): remapea inventario/mazos de
  // legacyId → id estable usando el catálogo. Idempotente; se cura sola cuando
  // vuelve una edición que había fallado.
  try {
    const legacyMap = {};
    for (const c of state.baseCards) if (c.legacyId && c.legacyId !== c.id) legacyMap[c.legacyId] = c.id;
    if (store.migrateKeys(legacyMap)) console.info("Inventario/mazos migrados a ids estables");
  } catch (e) { console.warn("migración de ids:", e); }

  rebuildCards();
  if (cardsRes.meta?.source === "seed") {
    showToast("Mostrando datos de demostración. Ejecuta el scraper para cargar el catálogo real.", 5000);
  }
}

function normalizeCard(c, i) {
  const id = c.id || `${c.edition || "x"}__${(c.name || "carta_" + i).toLowerCase().replace(/\s+/g, "_")}`;
  return {
    id,
    slug: c.slug || "",
    legacyId: c.legacyId || "",
    name: c.name || "Sin nombre",
    edition: c.edition || "",
    editionName: c.editionName || "",
    format: c.format || "",
    edid: c.edid || "",
    type: c.type || "—",
    race: c.race || "—",
    rarity: c.rarity || "—",
    keyword: c.keyword || "",
    cost: numOrNull(c.cost),
    strength: NO_STRENGTH_TYPES.has(c.type || "—") ? null : numOrNull(c.strength ?? c.attack),
    ability: c.ability || "",
    flavour: c.flavour || "",
    image: c.image || c.image_path || "",
    // Identificador de carta especial/promocional (ej. "Promo", "P-001").
    // Si está presente, la carta no usa número y se lista en la sección de
    // especiales, al inicio de la colección.
    specialId: c.specialId || "",
    custom: !!c.custom,
    // Preservar la marca de carta creada por el usuario: sin ella el detalle
    // no muestra los botones Editar/Eliminar (bug que impedía corregir la
    // edición de una carta manual mal escrita)
    userCustom: !!c.userCustom,
  };
}
function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
// Combina las cartas base (catálogo + bundle) con las cartas manuales del
// usuario. Una carta manual puede reusar el id de una carta base (se crea al
// "Editar" una carta oficial/bundled desde su detalle, ver openCardForm): en
// ese caso reemplaza a la base en vez de duplicarla — mismo id, así que las
// cantidades del inventario/mazos/colecciones no se pierden al editar.
function rebuildCards() {
  const userCustom = store.getCustomCards().map(normalizeCard);
  const overrideIds = new Set(userCustom.map((c) => c.id));
  for (const c of userCustom) {
    c.editionName = c.editionName || state.editionName[c.edition] || c.edition || "—";
    c.searchText = normText(c.name + " " + c.ability + " " + cardIdentifierText(c));
  }
  state.cards = (state.baseCards || []).filter((c) => !overrideIds.has(c.id)).concat(userCustom);
  // Las ediciones personalizadas aportan su nombre legible al mapa global
  for (const e of store.getCustomEditions()) state.editionName[e.slug] = e.name;
  editionCardsCache.clear(); // el catálogo cambió: invalida la caché de Colecciones
  cardIndex = null;          // y el índice id→carta de la vista Cambios
}
// Minúsculas sin diacríticos (á→a, ñ→n) para comparar/buscar sin importar tildes
function normText(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
// Identificador de carta para el buscador: el código especial tal cual se ve
// en su badge (ej. "LBPE25 - 01/21") Y esa misma cadena sin espacios/guiones/
// barras (para que "LBPE25-01/21" o "lbpe25 01 21" tecleado también calce),
// más el número de carta simple y con "#" para las numeradas.
function cardIdentifierText(c) {
  const parts = [];
  if (c.specialId) {
    parts.push(c.specialId, c.specialId.replace(/[^a-zA-Z0-9]+/g, ""));
  }
  const n = parseInt(c.edid, 10);
  if (Number.isFinite(n)) parts.push(String(n), "#" + n);
  return parts.join(" ");
}

/* --- Correcci\u00f3n perezosa de nombres (la API del listado los entrega sin
   tildes/\u00f1; el perfil s\u00ed los trae). Se corrigen solo las cartas visibles y
   se cachean para no volver a consultarlas. --- */
const nameCache = (() => { try { return JSON.parse(localStorage.getItem("myl.namecache.v1")) || {}; } catch { return {}; } })();
let nameCacheTimer;
function saveNameCache() {
  clearTimeout(nameCacheTimer);
  nameCacheTimer = setTimeout(() => { try { localStorage.setItem("myl.namecache.v1", JSON.stringify(nameCache)); } catch {} }, 800);
}
function displayName(card) { return nameCache[card.id] || card.name; }

let nameQueue = [], nameActive = 0;
function scheduleNameCorrection(cards) {
  for (const c of cards) { if (c.custom || c.id in nameCache) continue; nameQueue.push(c); }
  pumpNames();
}
function pumpNames() {
  while (nameActive < 6 && nameQueue.length) {
    const c = nameQueue.shift();
    if (c.id in nameCache) continue;
    nameActive++;
    fetchProfile(c).then((p) => {
      const nm = p?.details?.name?.trim();
      nameCache[c.id] = nm || c.name; // marca como revisada (evita reconsultar)
      if (nm && nm !== c.name) updateCardNameInDom(c.id, nm);
      saveNameCache();
    }).catch(() => {}).finally(() => { nameActive--; pumpNames(); });
  }
}
function updateCardNameInDom(id, name) {
  const sel = `.card[data-id="${CSS.escape(id)}"]`;
  const el = document.querySelector(sel + " .card-name");
  if (el) el.textContent = name;
  const ph = document.querySelector(sel + " .ph-name");
  if (ph) ph.textContent = name;
}

/* ===================== Filtros (poblar selects) ===================== */
function uniqueSorted(values) {
  return [...new Set(values.filter((v) => v && v !== "—"))].sort((a, b) =>
    String(a).localeCompare(String(b), "es")
  );
}
// Como uniqueSorted, pero agrupa variantes que solo difieren en
// tildes/mayúsculas/espacios bajo UNA sola etiqueta (la más frecuente entre
// las variantes) — evita que un dato viejo o cargado a mano con una tilde
// distinta (ej. "Talisman" sin acento) aparezca como una opción de filtro
// aparte de la misma categoría (bug real reportado 16-09-2026: "Talismán"
// y "Tótem" salían duplicados en el filtro Tipo del Catálogo).
function groupedUnique(values) {
  const groups = new Map(); // normText(valor) -> Map(valor tal cual -> cuántas veces aparece)
  for (const v of values) {
    if (!v || v === "—") continue;
    const key = normText(v).trim();
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, new Map());
    const counts = groups.get(key);
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  const canonical = [];
  for (const counts of groups.values()) {
    let best = null, bestCount = -1;
    for (const [raw, n] of counts) if (n > bestCount) { best = raw; bestCount = n; }
    canonical.push(best);
  }
  return canonical.sort((a, b) => String(a).localeCompare(String(b), "es"));
}
// Compara dos valores del mismo campo "agrupado" (ver groupedUnique) sin
// importar tildes/mayúsculas/espacios — usar en los filtros que se
// construyen con groupedUnique, para que elegir la opción canónica también
// calce con las variantes viejas de los datos.
function looseEq(a, b) { return normText(a).trim() === normText(b).trim(); }

const FMT_NAMES = { PE: "Primera Era", PB: "Primer Bloque", SB: "Segundo Bloque", FX: "Furia Extendido", NE: "Nueva Era / Imperio" };
function populateFilters() {
  // Formato
  fillSelect("#f-format", uniqueSorted(state.cards.map((c) => c.format)).map((f) => ({ value: f, label: FMT_NAMES[f] || f })));
  fillSelect("#f-race", uniqueSorted(state.cards.map((c) => c.race)).map((v) => ({ value: v, label: v })));
  fillSelect("#f-type", groupedUnique(state.cards.map((c) => c.type)).map((v) => ({ value: v, label: v })));
  fillSelect("#f-rarity", uniqueSorted(state.cards.map((c) => c.rarity)).map((v) => ({ value: v, label: v })));
  // Formato también en la vista de estadísticas
  fillSelect("#stats-format", uniqueSorted(state.cards.map((c) => c.format)).map((f) => ({ value: f, label: FMT_NAMES[f] || f })));
  refreshEditionOptions();
  refreshStatsEditionOptions();
}
function refreshStatsEditionOptions() {
  const sel = $("#stats-edition");
  if (!sel) return;
  const prev = sel.value;
  fillEditionSelect(sel, $("#stats-format").value, "Edición: todas");
  if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
}

function refreshEditionOptions() {
  const sel = $("#f-edition");
  const prev = sel.value;
  fillEditionSelect(sel, $("#f-format").value, "Edición");
  if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
}

// Agrupa las ediciones presentes en el dataset por bloque/era, respetando el
// orden de publicación de editions.json (no alfabético)
function editionOptionGroups(fmt) {
  const present = new Set(state.cards.filter((c) => !fmt || c.format === fmt).map((c) => c.edition));
  const groups = new Map();
  for (const e of state.editions) {
    if (!present.has(e.slug)) continue;
    present.delete(e.slug);
    const g = e.formatName || e.format || "Otros";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push({ value: e.slug, label: e.name });
  }
  // Ediciones creadas por el usuario en el gestor (aunque aún no tengan cartas)
  const customs = store.getCustomEditions().filter((e) => !fmt || e.format === fmt);
  if (customs.length) {
    groups.set("Mis ediciones", customs.map((e) => ({ value: e.slug, label: e.name })));
    for (const e of customs) present.delete(e.slug);
  }
  if (present.size) {
    const extra = [...present]
      .sort((a, b) => (state.editionName[a] || a).localeCompare(state.editionName[b] || b, "es"))
      .map((s) => ({ value: s, label: state.editionName[s] || s }));
    groups.set("Otras / personalizadas", extra);
  }
  return groups;
}

function fillEditionSelect(el, fmt, placeholder) {
  el.innerHTML = "";
  if (placeholder != null) {
    const o = document.createElement("option");
    o.value = "";
    o.textContent = placeholder;
    el.appendChild(o);
  }
  for (const [gname, items] of editionOptionGroups(fmt)) {
    const og = document.createElement("optgroup");
    og.label = gname;
    for (const it of items) {
      const o = document.createElement("option");
      o.value = it.value;
      o.textContent = it.label;
      og.appendChild(o);
    }
    el.appendChild(og);
  }
}

function fillSelect(sel, opts) {
  const el = $(sel);
  const first = el.querySelector("option");
  el.innerHTML = "";
  el.appendChild(first.cloneNode(true));
  for (const o of opts) {
    const opt = document.createElement("option");
    opt.value = o.value;
    opt.textContent = o.label;
    el.appendChild(opt);
  }
}

/* ===================== Aplicar filtros =====================
   Lee todos los controles del panel de filtros, filtra state.cards y ordena
   el resultado según #f-sort. El orden por "número de carta" usa edid (número
   dentro de la edición) y desempata por edición según el orden de publicación
   (editions.json), de modo que el listado quede estable y predecible. */
// Filtros de catálogo/formato/edición/raza/tipo/rareza/coste, SIN el de
// inventario (ownership) — se usa tanto para el listado real (applyFilters)
// como para calcular el conteo de cada píldora de "Inventario" sobre el
// resto de filtros activos (ver updateOwnershipPills).
function baseFilteredCards() {
  const q = normText($("#search").value.trim());
  const fmt = $("#f-format").value;
  const ed = $("#f-edition").value;
  const race = $("#f-race").value;
  const type = $("#f-type").value;
  const rarity = $("#f-rarity").value;
  const maxCost = Number($("#f-cost").value);
  return state.cards.filter((c) => {
    if (q && !c.searchText.includes(q)) return false;
    if (fmt && c.format !== fmt) return false;
    if (ed && c.edition !== ed) return false;
    if (race && c.race !== race) return false;
    if (type && !looseEq(c.type, type)) return false;
    if (rarity && c.rarity !== rarity) return false;
    if (maxCost < 12 && c.cost != null && c.cost > maxCost) return false;
    return true;
  });
}
function applyFilters() {
  const ownership = $("#f-ownership").value;
  const sort = $("#f-sort").value;

  let out = baseFilteredCards().filter((c) => {
    const qty = store.getQty(c.id);
    if (ownership === "owned" && qty < 1) return false;
    if (ownership === "missing" && qty >= 1) return false;
    if (ownership === "dup" && qty < 2) return false;
    if (ownership === "trade" && store.getAvailableQty(c.id) < 1) return false;
    return true;
  });

  out.sort((a, b) => {
    switch (sort) {
      case "name_desc": return b.name.localeCompare(a.name, "es");
      case "number": return cardNum(a) - cardNum(b) || editionOrd(a) - editionOrd(b) || a.name.localeCompare(b.name, "es");
      case "number_desc": return cardNum(b) - cardNum(a) || editionOrd(a) - editionOrd(b) || a.name.localeCompare(b.name, "es");
      case "cost": return (a.cost ?? 99) - (b.cost ?? 99);
      case "cost_desc": return (b.cost ?? -1) - (a.cost ?? -1);
      case "strength_desc": return (b.strength ?? -1) - (a.strength ?? -1);
      case "edition": return editionOrd(a) - editionOrd(b) || cardNum(a) - cardNum(b) || a.name.localeCompare(b.name, "es");
      case "qty_desc": return store.getQty(b.id) - store.getQty(a.id);
      default: return a.name.localeCompare(b.name, "es");
    }
  });

  state.filtered = out;
  state.page = 0;
  renderGrid(true);
  updateResultCount();
  updateOrphanNote();
}

// Número de la carta dentro de su edición (edid "037" → 37); sin número → al final
function cardNum(c) {
  const n = parseInt(c.edid, 10);
  return Number.isFinite(n) ? n : Infinity;
}
// Posición de la edición según el orden de publicación (editions.json)
function editionOrd(c) {
  const i = state.editionOrder?.[c.edition];
  return i == null ? 9999 : i;
}
// Ediciones Lootbox: dentro de ellas el identificador (LBPE24-01, PREMIUM PE
// 03, etc.) no refleja la rareza real de la carta. Ranking manual de más
// rara a más común, según la wiki de MyL (página "Frecuencia de Cartas":
// Secreta es "la carta más rara del juego") y los blogs de lanzamiento de
// cada caja (contenido garantizado: 1 Conmemorativa, 1 Secreta Promo, 3
// Premium, resto Arte Alternativo/Nuevas por caja, más una Ultra Secreta/
// Edición Limitada festiva de bonus con ~10% de probabilidad).
const LOOTBOX_EDITIONS = new Set(["lootbox_pe_2024", "lootbox_pe_2025"]);
const LOOTBOX_RARITY_KEYWORDS = [
  "EDICION LIMITADA", // bonus ultra secreta festiva, la más escasa
  "SECRETA",          // dorada / exclusiva / promo / plateada
  "CONMEMORATIVA",
  "LEGENDARIA",
  "PREMIUM",
  "PROMOCIONAL",
  "PROMO CXC",
  "LBPE",             // cartas numeradas base (arte alternativo / nuevas)
];
function lootboxRarityRank(specialId) {
  const s = normText(specialId).toUpperCase();
  for (let i = 0; i < LOOTBOX_RARITY_KEYWORDS.length; i++) {
    if (s.includes(LOOTBOX_RARITY_KEYWORDS[i])) return i;
  }
  return LOOTBOX_RARITY_KEYWORDS.length;
}
// Orden dentro de una edición (o de un grupo de ediciones, ver colecciones
// con varias ediciones): primero por orden de publicación de la edición
// (no-op cuando todas las cartas son de la misma edición), luego especiales/
// promocionales primero dentro de esa edición. Dentro de los especiales, las
// ediciones Lootbox usan el ranking de rareza; el resto, orden alfanumérico
// natural del identificador (P-1 < P-2 < P-10). Luego las numeradas por número.
function compareEditionCards(a, b) {
  const eo = editionOrd(a) - editionOrd(b);
  if (eo !== 0) return eo;
  const sa = a.specialId ? 1 : 0, sb = b.specialId ? 1 : 0;
  if (sa !== sb) return sb - sa;
  if (sa) {
    if (LOOTBOX_EDITIONS.has(a.edition) && LOOTBOX_EDITIONS.has(b.edition)) {
      const ra = lootboxRarityRank(a.specialId), rb = lootboxRarityRank(b.specialId);
      if (ra !== rb) return ra - rb;
    }
    return a.specialId.localeCompare(b.specialId, "es", { numeric: true, sensitivity: "base" });
  }
  return cardNum(a) - cardNum(b) || a.name.localeCompare(b.name, "es");
}

/* ===================== Cartas fuera de catálogo (huérfanas) ===================== */
function computeOrphans() {
  const ids = new Set(state.cards.map((c) => c.id));
  return Object.entries(store.getInventory())
    .filter(([id, q]) => q > 0 && !ids.has(id))
    .map(([id, qty]) => ({ id, qty }));
}
function updateOrphanNote() {
  const el = $("#orphan-note");
  if (!el) return;
  const n = computeOrphans().length;
  el.classList.toggle("hidden", n === 0);
  if (n) el.innerHTML = `<i class="ph ph-warning"></i> ${n} fuera de catálogo`;
}
function openOrphanModal() {
  const list = computeOrphans();
  const box = $("#orphan-modal-box");
  box.innerHTML = `
    <button class="modal-close" data-close-orphan>×</button>
    <h2>Cartas fuera de catálogo</h2>
    <p class="muted">Cantidades guardadas en tu inventario que no calzan con ninguna carta del catálogo actual (p. ej. una edición que TOR aún no publica, o un dato antiguo). <b>No se borran solas</b>: si la edición vuelve al catálogo, se reconectan automáticamente. Puedes eliminarlas manualmente si sabes que ya no aplican.</p>
    ${list.length
      ? `<div class="orphan-list">` + list.map((o) => `
          <div class="orphan-row" data-id="${escapeAttr(o.id)}">
            <span class="mono">${escapeHtml(o.id)}</span>
            <span class="muted">×${o.qty}</span>
            <button class="btn small" data-del-orphan>Eliminar</button>
          </div>`).join("") + `</div>`
      : `<p class="muted">No hay cartas fuera de catálogo.</p>`}`;
  box.querySelector("[data-close-orphan]").onclick = closeOrphanModal;
  box.querySelectorAll(".orphan-row").forEach((r) => {
    r.querySelector("[data-del-orphan]").onclick = () => {
      if (!confirm(`¿Eliminar la cantidad de «${r.dataset.id}» de tu inventario?`)) return;
      store.setQty(r.dataset.id, 0);
      r.remove();
      updateOrphanNote();
    };
  });
  $("#orphan-modal").classList.remove("hidden");
}
function closeOrphanModal() { $("#orphan-modal").classList.add("hidden"); }

function updateResultCount() {
  const n = state.filtered.length;
  const owned = state.filtered.filter((c) => store.getQty(c.id) > 0).length;
  $("#result-count").textContent = `${n} carta${n === 1 ? "" : "s"} · ${owned} en tu colección`;
  updateOwnershipPills();
}

// Píldoras del filtro "Inventario" (reemplaza visualmente al <select> oculto
// #f-ownership, que sigue siendo la fuente de verdad). El conteo de cada
// píldora es sobre el resto de filtros activos (formato/edición/raza/tipo/
// rareza/coste/búsqueda), no sobre el catálogo completo — así "Repetidas"
// muestra cuántas duplicadas hay DENTRO de lo que ya filtraste.
const OWNERSHIP_PILLS = [
  ["all", "Todas"], ["owned", "Que tengo"], ["missing", "Me faltan"],
  ["dup", "Repetidas"], ["trade", "Para cambio"],
];
function updateOwnershipPills() {
  const wrap = $("#f-ownership-pills");
  if (!wrap) return;
  const base = baseFilteredCards();
  const counts = {
    all: base.length,
    owned: base.filter((c) => store.getQty(c.id) >= 1).length,
    missing: base.filter((c) => store.getQty(c.id) < 1).length,
    dup: base.filter((c) => store.getQty(c.id) >= 2).length,
    trade: base.filter((c) => store.getAvailableQty(c.id) >= 1).length,
  };
  const current = $("#f-ownership").value;
  wrap.innerHTML = OWNERSHIP_PILLS.map(([val, label]) =>
    `<button type="button" class="pill${val === current ? " active" : ""}" data-own="${val}">${label} <span class="pill-count">${counts[val]}</span></button>`
  ).join("");
  wrap.querySelectorAll("[data-own]").forEach((btn) => {
    btn.onclick = () => {
      $("#f-ownership").value = btn.dataset.own;
      $("#f-ownership").dispatchEvent(new Event("change"));
    };
  });
}

/* ===================== Render grid ===================== */
function renderGrid(reset) {
  const grid = $("#cards-grid");
  if (reset) grid.innerHTML = "";
  const start = state.page * state.pageSize;
  const slice = state.filtered.slice(start, start + state.pageSize);
  const frag = document.createDocumentFragment();
  for (const card of slice) frag.appendChild(cardEl(card, state.filtered));
  grid.appendChild(frag);
  scheduleNameCorrection(slice);

  $("#grid-empty").classList.toggle("hidden", state.filtered.length !== 0);
  const hasMore = (state.page + 1) * state.pageSize < state.filtered.length;
  $("#load-more").classList.toggle("hidden", !hasMore);
}

// Crea el nodo de una carta para cualquier grilla (Catálogo y Colecciones).
// La clase .owned refleja si hay copias en el inventario; en la vista
// Colecciones el CSS usa esa clase para el efecto bloqueada/desbloqueada.
// navList (opcional): lista ordenada de cartas de la grilla actual, para que
// el modal de detalle pueda ofrecer "anterior/siguiente" dentro de ese mismo
// listado (ver openModal).
function cardEl(card, navList) {
  const qty = store.getQty(card.id);
  const el = document.createElement("div");
  el.className = "card" + (qty > 0 ? " owned" : "") + (card.id === state.selectedCardId ? " selected" : "");
  el.dataset.id = card.id;

  const dName = displayName(card);
  const num = cardNum(card); // número dentro de la edición (Infinity si no tiene)
  const img = card.image
    ? `<img loading="lazy" src="${escapeAttr(card.image)}" alt="${escapeAttr(dName)}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'placeholder'}))" />`
    : `<div class="placeholder"></div>`;

  const activeDeck = store.getDeck(store.getSetting("activeDeckId"));
  const deckBtn = `<button class="qty-btn deck-add" title="${activeDeck ? "Añadir a «" + escapeAttr(activeDeck.name) + "»" : "Añadir a un mazo"}"><i class="ph ph-stack"></i><i class="ph ph-plus"></i></button>`;

  el.innerHTML = `
    <div class="card-img" data-act="detail">
      ${img}
      <div class="card-veil"></div>
      ${card.strength != null ? `<span class="badge-str"><i class="ph ph-sword"></i>${card.strength}</span>` : ""}
      ${card.cost != null ? `<span class="badge-cost"><i class="ph ph-coin"></i>${card.cost}</span>` : ""}
      ${card.specialId ? `<span class="badge-num special">${escapeHtml(card.specialId)}</span>` : Number.isFinite(num) ? `<span class="badge-num">#${num}</span>` : ""}
      <span class="badge-qty${qty > 0 ? "" : " hidden"}" data-role="badge-qty">${qty}</span>
      <div class="card-overlay-text">
        <div class="card-name">${escapeHtml(dName)}</div>
        <div class="card-type-rarity"><span>${escapeHtml(card.type)}</span><span class="dot">·</span><span>${escapeHtml(card.rarity)}</span></div>
      </div>
    </div>
    <div class="card-body">
      <div class="card-meta">${escapeHtml(card.editionName || "")}</div>
      <div data-role="avail">${availableMetaHtml(card.id)}</div>
      <div class="qty-row">
        <button class="qty-btn" data-act="minus">−</button>
        <input type="number" min="0" class="qty-num-input ${qty === 0 ? "zero" : qty >= 2 ? "dup" : ""}" data-role="qty" value="${qty}" />
        <button class="qty-btn" data-act="plus">+</button>
        ${deckBtn}
      </div>
    </div>`;

  el.addEventListener("click", (e) => {
    if (e.target.closest(".deck-add")) { addToDeckQuick(card); return; }
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "plus") changeQty(el, card, +1);
    else if (act === "minus") changeQty(el, card, -1);
    else if (act === "detail") {
      if (state.view === "coleccion") selectCard(card, navList);
      else openModal(card, navList);
    }
  });
  el.querySelector('[data-role="qty"]').addEventListener("change", (e) => {
    setQtyDirect(el, card, Number(e.target.value));
  });
  el.querySelector(".card-img").addEventListener("dblclick", () => openModal(card, navList));
  return el;
}

// Reparte el total que tienes de una carta en 3 baldes que SIEMPRE suman el
// total (para poder mostrar "dónde están tus cartas" sin que los números
// dejen copias sin contar): colección (las que nunca marcaste para cambio),
// paraCambio (ofrecidas y libres ahora mismo — esto es "lo disponible") y
// enMazo (ofrecidas pero que un mazo tuyo está usando). Si en algún momento
// un mazo usa más copias de las que tienes ofrecidas, enMazo se recorta a lo
// ofrecido (no puede "deber" más que eso) y paraCambio queda en 0.
function tradeBreakdown(cardId) {
  const owned = store.getQty(cardId);
  const offered = store.getTradeQty(cardId);
  const paraCambio = store.getAvailableQty(cardId); // max(0, offered - copias en mazos)
  const enMazo = offered - paraCambio; // el resto de lo ofrecido, en uso en algún mazo
  return { owned, offered, coleccion: owned - offered, paraCambio, enMazo };
}

// "Disponible ×N": copias que tienes marcadas para cambio/venta y que
// ningún mazo tuyo está usando ahora mismo (store.getAvailableQty). Vacío si
// no hay ninguna disponible, para no ensuciar la tarjeta.
function availableMetaHtml(cardId) {
  const avail = store.getAvailableQty(cardId);
  return avail > 0 ? `<div class="card-meta card-trade">Disponible ×${avail}</div>` : "";
}

// Desglose siempre visible de dónde están las copias de esta carta, para
// que el dueño no tenga que adivinar por qué "disponible" es menor a lo que
// marcó para cambio. Pinta en rojo solo si hay copias comprometidas en un
// mazo (si no, es pura información, no una advertencia).
function renderDeckHint(el, cardId) {
  if (!el) return;
  const b = tradeBreakdown(cardId);
  el.textContent = b.owned ? `Colección: ${b.coleccion} · Para cambio: ${b.paraCambio} · En mazo: ${b.enMazo}` : "";
  el.classList.toggle("warn", b.enMazo > 0);
}

// Cambia la cantidad de una carta desde la grilla y actualiza SOLO los nodos
// afectados (sin re-render completo). Al alternar .owned, en Colecciones el
// CSS anima el paso blanco y negro ⇄ color de la imagen.
function changeQty(el, card, delta) {
  const qty = store.addQty(card.id, delta);
  reflectQtyOnCardEl(el, card, qty);
}
// Edición directa: el input de cantidad de la tarjeta escribe el valor
// absoluto (no un delta) — mismo patrón que store.setQty ya usa en otros
// lados de la app (sin ventana flotante, se edita el dato mismo).
function setQtyDirect(el, card, value) {
  const qty = Math.max(0, Math.floor(Number(value) || 0));
  store.setQty(card.id, qty);
  reflectQtyOnCardEl(el, card, qty);
}
function reflectQtyOnCardEl(el, card, qty) {
  if (el) {
    const numEl = el.querySelector('[data-role="qty"]');
    if (numEl && document.activeElement !== numEl) numEl.value = qty;
    if (numEl) { numEl.classList.toggle("zero", qty === 0); numEl.classList.toggle("dup", qty >= 2); }
    const badgeEl = el.querySelector('[data-role="badge-qty"]');
    if (badgeEl) { badgeEl.textContent = qty; badgeEl.classList.toggle("hidden", qty === 0); }
    el.classList.toggle("owned", qty > 0);
    const availEl = el.querySelector('[data-role="avail"]');
    if (availEl) availEl.innerHTML = availableMetaHtml(card.id);
  }
  updateResultCount();
  if (state.view === "colecciones") updateCollectionProgress();
  if (state.selectedCardId === card.id) updateFichaQty(qty);
}

/* ===================== Ficha fija (Catálogo) =====================
   Panel a la derecha del Catálogo con la carta elegida en la grilla —
   se actualiza al hacer click (no abre el modal; eso queda para el botón
   de expandir, doble clic o la tecla Espacio) y admite recorrer con
   teclado. state.selectedCardId vive en memoria (no persiste). */
function selectCard(card, navList) {
  state.selectedCardId = card.id;
  state.fichaNavList = navList || state.filtered;
  $$("#cards-grid .card").forEach((el) => el.classList.toggle("selected", el.dataset.id === card.id));
  renderFicha();
}
function fichaNavIndex() {
  const list = state.fichaNavList || state.filtered;
  return list.findIndex((c) => c.id === state.selectedCardId);
}
function fichaNavStep(delta) {
  const list = state.fichaNavList || state.filtered;
  const i = fichaNavIndex();
  if (i === -1) return;
  const next = list[i + delta];
  if (next) selectCard(next, list);
}
function updateFichaQty(qty) {
  const el = $("#ficha-qty");
  if (el) el.textContent = qty;
  const art = $("#ficha-art");
  if (art) art.classList.toggle("owned", qty > 0);
}
function fichaChangeQty(delta) {
  const card = cardById(state.selectedCardId);
  if (!card) return;
  const qty = store.addQty(card.id, delta);
  reflectQtyOnCardEl($(`#cards-grid .card[data-id="${escapeAttr(card.id)}"]`), card, qty);
}
function fichaSetQty(qty) {
  const card = cardById(state.selectedCardId);
  if (!card) return;
  store.setQty(card.id, qty);
  reflectQtyOnCardEl($(`#cards-grid .card[data-id="${escapeAttr(card.id)}"]`), card, qty);
}
function renderFicha() {
  const panel = $("#ficha-panel");
  if (!panel) return;
  const card = cardById(state.selectedCardId);
  const empty = panel.querySelector(".ficha-empty");
  const content = panel.querySelector("#ficha-content");
  if (!card) {
    empty.classList.remove("hidden");
    content.classList.add("hidden");
    return;
  }
  empty.classList.add("hidden");
  content.classList.remove("hidden");

  const qty = store.getQty(card.id);
  const dName = displayName(card);
  const num = cardNum(card);
  const img = card.image
    ? `<img src="${escapeAttr(card.image)}" alt="${escapeAttr(dName)}" />`
    : `<div class="placeholder"></div>`;
  $("#ficha-holo").dataset.rarity = holoSlug(card);
  $("#ficha-art").className = "ficha-art holo-art" + (qty > 0 ? " owned" : "");
  $("#ficha-art").innerHTML = `
    ${img}
    <div class="card-veil"></div>
    <div class="foil" ${hasFoil(card) ? "" : "hidden"}></div>
    ${card.strength != null ? `<span class="badge-str"><i class="ph ph-sword"></i>${card.strength}</span>` : ""}
    ${card.cost != null ? `<span class="badge-cost"><i class="ph ph-coin"></i>${card.cost}</span>` : ""}
    <div class="card-overlay-text ficha-overlay-text">
      <div class="ficha-card-name">${escapeHtml(dName)}</div>
      <div class="ficha-card-sub">${escapeHtml(card.editionName || "")} · ${card.specialId ? escapeHtml(card.specialId) : Number.isFinite(num) ? "nº " + String(num).padStart(3, "0") : ""} · ${escapeHtml(card.rarity)}</div>
    </div>`;

  updateFichaQty(qty);
  $("#ficha-ability-text").innerHTML = card.ability ? nl2br(card.ability) : `<span class="muted">Sin texto.</span>`;

  const b = tradeBreakdown(card.id);
  const ref = marketRefPrice(card.id);
  const banEntry = getBanlistEntry(card);
  const banText = banEntry ? (banEntry.status === "banned" ? "Prohibida" : `Máx. ${banEntry.maxCopies}`) : "Sin restricción";
  const nDecks = store.getDecks().filter((d) => (d.cards[card.id] || 0) > 0).length;
  const meta = [
    ["En tus mazos", nDecks ? `${nDecks} mazo${nDecks === 1 ? "" : "s"}` : "—"],
    ["Repetidas", Math.max(0, b.owned - 1)],
    ["Precio ref.", ref != null ? fmtCLP(ref) : "—"],
    ["Banlist", banText],
  ];
  $("#ficha-meta").innerHTML = meta.map(([k, v]) =>
    `<div class="ficha-meta-item"><span class="ficha-meta-k">${escapeHtml(k)}</span><span class="ficha-meta-v${k === "Banlist" && banEntry ? " warn" : ""}">${escapeHtml(String(v))}</span></div>`
  ).join("");

  $("#ficha-add-deck").onclick = () => addToDeckQuick(card);
  $("#ficha-offer").onclick = () => {
    if (store.getAvailableQty(card.id) < 1 && store.getQty(card.id) > 0) store.addTradeQty(card.id, 1);
    showToast(`«${dName}» ofrecida para cambio o venta`);
  };
  $("#ficha-sell").onclick = () => openSellModal(card);
  $("#ficha-expand").onclick = () => openModal(card, state.fichaNavList || state.filtered);

  const i = fichaNavIndex();
  const list = state.fichaNavList || state.filtered;
  $("#ficha-prev").disabled = i <= 0;
  $("#ficha-next").disabled = i === -1 || i >= list.length - 1;
}

/* ===================== Ficha fija (Mazos) =====================
   Misma idea que la ficha del Catálogo (arriba) pero el contador cuenta
   copias EN EL MAZO (store.deckSetQty/deckAdd), no en el inventario, y las
   acciones son de mazo: quitar, saltar a la carta en el Catálogo, u
   ofrecerla para cambio. state.deckSelectedCardId/deckFichaNavList son
   independientes de selectedCardId/fichaNavList (vistas distintas, no se
   pisan entre sí). navList acá es un array de cardId (no de cartas), en el
   orden visual de la composición (ver renderDeckContents). */
function selectDeckCard(cid, navList) {
  state.deckSelectedCardId = cid;
  if (navList) state.deckFichaNavList = navList;
  $$("#deck-contents .deck-card-row").forEach((el) => el.classList.toggle("selected", el.dataset.cid === cid));
  renderDeckFicha();
}
function deckFichaNavIndex() {
  const list = state.deckFichaNavList || [];
  return list.indexOf(state.deckSelectedCardId);
}
function deckFichaNavStep(delta) {
  const list = state.deckFichaNavList || [];
  const i = deckFichaNavIndex();
  if (i === -1) return;
  const next = list[i + delta];
  if (next) selectDeckCard(next, list);
}
function updateDeckFichaQty(qty) {
  const el = $("#deck-ficha-qty");
  if (el) el.textContent = qty;
}
function activeDeckOrNull() { return store.getDeck(store.getSetting("activeDeckId")); }
function deckFichaChangeQty(delta) {
  const deck = activeDeckOrNull();
  const cid = state.deckSelectedCardId;
  if (!deck || !cid) return;
  store.deckAdd(deck.id, cid, delta);
  updateDeckCounts(); refreshActiveDeckCount();
  renderDeckContents(deck);
}
function deckFichaSetQty(qty) {
  const deck = activeDeckOrNull();
  const cid = state.deckSelectedCardId;
  if (!deck || !cid) return;
  store.deckSetQty(deck.id, cid, qty);
  updateDeckCounts(); refreshActiveDeckCount();
  renderDeckContents(deck);
}
function renderDeckFicha() {
  const panel = $("#deck-ficha-panel");
  if (!panel) return;
  const deck = activeDeckOrNull();
  const cid = state.deckSelectedCardId;
  const card = deck && cid ? cardById(cid) : null;
  const empty = panel.querySelector(".ficha-empty");
  const content = panel.querySelector("#deck-ficha-content");
  if (!deck || !card) {
    empty.classList.remove("hidden");
    content.classList.add("hidden");
    return;
  }
  empty.classList.add("hidden");
  content.classList.remove("hidden");

  const qty = deck.cards[cid] || 0;
  const own = store.getQty(cid);
  const dName = displayName(card);
  const num = cardNum(card);
  const img = card.image
    ? `<img src="${escapeAttr(card.image)}" alt="${escapeAttr(dName)}" />`
    : `<div class="placeholder"></div>`;
  $("#deck-ficha-holo").dataset.rarity = holoSlug(card);
  $("#deck-ficha-art").className = "ficha-art holo-art" + (own > 0 ? " owned" : "");
  $("#deck-ficha-art").innerHTML = `
    ${img}
    <div class="card-veil"></div>
    <div class="foil" ${hasFoil(card) ? "" : "hidden"}></div>
    ${card.strength != null ? `<span class="badge-str"><i class="ph ph-sword"></i>${card.strength}</span>` : ""}
    ${card.cost != null ? `<span class="badge-cost"><i class="ph ph-coin"></i>${card.cost}</span>` : ""}
    <div class="card-overlay-text ficha-overlay-text">
      <div class="ficha-card-name">${escapeHtml(dName)}</div>
      <div class="ficha-card-sub">${escapeHtml(card.editionName || "")} · ${card.specialId ? escapeHtml(card.specialId) : Number.isFinite(num) ? "nº " + String(num).padStart(3, "0") : ""} · ${escapeHtml(card.rarity)}</div>
    </div>`;

  updateDeckFichaQty(qty);
  $("#deck-ficha-ability-text").innerHTML = card.ability ? nl2br(card.ability) : `<span class="muted">Sin texto.</span>`;

  const otherDecks = store.decksUsingCard(cid, deck.id).length;
  const ref = marketRefPrice(cid);
  const meta = [
    ["Copias que tienes", own],
    ["En otros mazos", otherDecks ? `${otherDecks} mazo${otherDecks === 1 ? "" : "s"}` : "—"],
    ["Repetidas libres", store.getAvailableQty(cid)],
    ["Precio ref.", ref != null ? fmtCLP(ref) : "—"],
  ];
  $("#deck-ficha-meta").innerHTML = meta.map(([k, v]) =>
    `<div class="ficha-meta-item"><span class="ficha-meta-k">${escapeHtml(k)}</span><span class="ficha-meta-v${k === "Repetidas libres" ? " accent" : ""}">${escapeHtml(String(v))}</span></div>`
  ).join("");

  $("#deck-ficha-remove").onclick = () => {
    store.deckSetQty(deck.id, cid, 0);
    updateDeckCounts(); refreshActiveDeckCount();
    state.deckSelectedCardId = null;
    renderDeckContents(deck);
    showToast(`«${dName}» quitada del mazo`);
  };
  $("#deck-ficha-catalog").onclick = () => jumpToCatalogCard(card);
  $("#deck-ficha-offer").onclick = () => {
    if (store.getAvailableQty(cid) < 1 && own > 0) store.addTradeQty(cid, 1);
    showToast(`«${dName}» ofrecida para cambio o venta`);
  };
  $("#deck-ficha-expand").onclick = () => {
    const navCards = (state.deckFichaNavList || []).map((id) => cardById(id)).filter(Boolean);
    openModal(card, navCards);
  };

  const i = deckFichaNavIndex();
  const list = state.deckFichaNavList || [];
  $("#deck-ficha-prev").disabled = i <= 0;
  $("#deck-ficha-next").disabled = i === -1 || i >= list.length - 1;
}
// Salta al Catálogo, limpia los filtros para asegurar que la carta sea
// visible, la busca por nombre y la deja seleccionada en su propia ficha.
function jumpToCatalogCard(card) {
  switchView("coleccion");
  $("#search").value = displayName(card);
  ["#f-ownership", "#f-format", "#f-edition", "#f-race", "#f-type", "#f-rarity", "#f-sort"].forEach((s) => { const el = $(s); if (el) el.selectedIndex = 0; });
  $("#f-cost").value = 12; $("#cost-val").textContent = "∞";
  refreshEditionOptions();
  applyFilters();
  const found = state.filtered.find((c) => c.id === card.id);
  if (found) {
    selectCard(found, state.filtered);
    requestAnimationFrame(() => $(`#cards-grid .card[data-id="${escapeAttr(card.id)}"]`)?.scrollIntoView({ block: "center" }));
  }
}

/* ===================== Modal detalle ===================== */
const FORMAT_LABELS = { empire: "Imperio", unified: "Unificado", first_era: "Primera Era", infantry: "Infantería", vcr: "VCR", joust: "Justa", reborn: "Renacido" };
const profileCache = new Map();
function fetchProfile(card) {
  const edition = card.edition;
  const slug = card.slug || card.id.split("__").slice(2).join("__");
  if (!edition || !slug) return Promise.resolve(null);
  const key = edition + "/" + slug;
  if (profileCache.has(key)) return profileCache.get(key);
  const p = fetch(`https://api.myl.cl/cards/profile/${encodeURIComponent(edition)}/${encodeURIComponent(slug)}`)
    .then((r) => (r.ok ? r.json() : null)).catch(() => null);
  profileCache.set(key, p);
  return p;
}
function nl2br(s) { return escapeHtml(s).replace(/\n/g, "<br>"); }

// Navegación anterior/siguiente del modal de detalle: navList es la lista
// (Catálogo filtrado, grilla de una Colección, u ofrecidas en Cambio y
// Ventas) desde la que se abrió la carta actual — null si se abrió sin una
// lista asociada (no debería pasar desde la UI, pero por si acaso).
let modalNavList = null;
let modalNavIndex = -1;

function updateModalNavButtons() {
  const prevBtn = $("#modal-prev");
  const nextBtn = $("#modal-next");
  const has = modalNavList && modalNavList.length > 1 && modalNavIndex !== -1;
  prevBtn.classList.toggle("hidden", !has);
  nextBtn.classList.toggle("hidden", !has);
  if (!has) return;
  prevBtn.disabled = modalNavIndex <= 0;
  nextBtn.disabled = modalNavIndex >= modalNavList.length - 1;
}

function modalNavStep(delta) {
  if (!modalNavList) return;
  const i = modalNavIndex + delta;
  if (i < 0 || i >= modalNavList.length) return;
  openModal(modalNavList[i], modalNavList, i);
}

function openModal(card, navList, navIndex) {
  modalNavList = navList || null;
  modalNavIndex = modalNavList ? (navIndex ?? modalNavList.findIndex((c) => c.id === card.id)) : -1;
  updateModalNavButtons();
  const qty = store.getQty(card.id);
  const box = $("#modal-box");
  const img = card.image
    ? `<img src="${escapeAttr(card.image)}" alt="${escapeAttr(card.name)}" />`
    : `<div class="placeholder" style="color:var(--muted);padding:20px;text-align:center">Sin imagen</div>`;
  const tag = (t) => `<span class="tag">${escapeHtml(t)}</span>`;
  box.innerHTML = `
    <button class="modal-close" data-close>×</button>
    <div class="card-detail">
      <div class="cd-image holo holo-lg" data-rarity="${holoSlug(card)}" ${card.image ? 'data-zoom="1"' : ""}>
        <div class="holo-art">
          ${img}
          <div class="foil" ${hasFoil(card) ? "" : "hidden"}></div>
          ${card.image ? '<span class="cd-zoom-hint"><i class="ph ph-magnifying-glass-plus"></i> Ampliar</span>' : ""}
        </div>
      </div>
      <div class="cd-body">
        <h2 id="cd-name">${escapeHtml(displayName(card))}</h2>
        <div class="m-tags">
          ${tag(card.editionName || "")}${tag(card.race)}${tag(card.type)}${tag(card.rarity)}
          ${card.cost != null ? tag("Coste " + card.cost) : ""}${card.strength != null ? tag("Fuerza " + card.strength) : ""}
        </div>
        <div class="qty-row" style="border:none;padding:0;margin:14px 0">
          <button class="qty-btn" data-m="minus">−</button>
          <input type="number" min="0" class="qty-num-input ${qty === 0 ? "zero" : ""}" data-role="mqty" value="${qty}" style="flex:none;width:44px" />
          <button class="qty-btn" data-m="plus">+</button>
          <button class="btn small" data-add-deck><i class="ph ph-stack"></i> Añadir a mazo</button>
        </div>
        <div class="trade-ctl">
          <span class="muted">Disponible:</span>
          <button class="qty-btn" data-t="minus">−</button>
          <b data-role="tqty">${store.getAvailableQty(card.id)}</b>
          <button class="qty-btn" data-t="plus">+</button>
          <span class="muted">copias listas para cambiar, vender o meter a un mazo</span>
        </div>
        <div class="muted deck-hint" data-role="deckhint"></div>
        <div class="sync-row" style="margin-top:4px">
          <button class="btn small" data-edit-card><i class="ph ph-pencil-simple"></i> Editar</button>
          ${card.userCustom
            ? `<button class="btn small" data-del-card>${state.baseCardIds?.has(card.id) ? '<i class="ph ph-arrow-counter-clockwise"></i> Revertir a la original' : '<i class="ph ph-trash"></i> Eliminar'}</button>`
            : ""}
        </div>
        <div class="cd-section"><h4>Habilidad</h4><div id="cd-ability">${card.ability ? nl2br(card.ability) : "<span class='muted'>Sin texto.</span>"}</div></div>
        ${card.flavour ? `<div class="cd-section"><h4>Historia</h4><p class="cd-flavour">«${escapeHtml(card.flavour)}»</p></div>` : ""}
        <div id="cd-extra" class="cd-extra"><p class="muted">Cargando detalle ampliado…</p></div>
      </div>
    </div>`;

  renderDeckHint(box.querySelector('[data-role="deckhint"]'), card.id);
  box.querySelector("[data-close]").onclick = closeModal;
  const zoomEl = box.querySelector("[data-zoom]");
  if (zoomEl) zoomEl.onclick = () => openZoom(card.image, card.name);
  box.querySelector("[data-add-deck]").onclick = () => addToDeckQuick(card);
  const editBtn = box.querySelector("[data-edit-card]");
  if (editBtn) editBtn.onclick = () => { closeModal(); openCardForm(card); };
  const delBtn = box.querySelector("[data-del-card]");
  if (delBtn) delBtn.onclick = () => {
    const isOverride = state.baseCardIds?.has(card.id);
    const msg = isOverride
      ? `¿Revertir «${card.name}» a los datos originales? (no pierdes tus cantidades, solo la edición que le hiciste)`
      : `¿Eliminar la carta manual «${card.name}»?`;
    if (!confirm(msg)) return;
    store.deleteCustomCard(card.id);
    populateFilters(); refreshAll(); closeModal();
    refreshEditionsModalIfOpen();
    showToast(isOverride ? "Carta revertida a la versión original" : "Carta eliminada");
  };
  const applyModalQty = (newQty) => {
    const mq = box.querySelector('[data-role="mqty"]');
    if (document.activeElement !== mq) mq.value = newQty;
    mq.classList.toggle("zero", newQty === 0);
    const gridCard = document.querySelector(`.card[data-id="${CSS.escape(card.id)}"]`);
    if (gridCard) {
      const g = gridCard.querySelector('[data-role="qty"]');
      g.value = newQty; g.classList.toggle("zero", newQty === 0); g.classList.toggle("dup", newQty >= 2);
      gridCard.classList.toggle("owned", newQty > 0);
      const availEl = gridCard.querySelector('[data-role="avail"]');
      if (availEl) availEl.innerHTML = availableMetaHtml(card.id);
    }
    updateResultCount();
    if (state.view === "colecciones") updateCollectionProgress();
    // Cambiar la cantidad ajusta lo disponible por defecto (ver
    // autoAdjustTradeOnQtyChange en store.js): refleja el nuevo valor.
    const tq = box.querySelector('[data-role="tqty"]');
    if (tq) tq.textContent = store.getAvailableQty(card.id);
    renderDeckHint(box.querySelector('[data-role="deckhint"]'), card.id);
  };
  box.querySelectorAll("[data-m]").forEach((b) => {
    b.onclick = () => applyModalQty(store.addQty(card.id, b.dataset.m === "plus" ? 1 : -1));
  });
  box.querySelector('[data-role="mqty"]').addEventListener("change", (e) => {
    const newQty = Math.max(0, Math.floor(Number(e.target.value) || 0));
    store.setQty(card.id, newQty);
    applyModalQty(newQty);
  });
  // Control "Disponible" del detalle (marcar/desmarcar copias ofrecidas para
  // cambio/venta/mazo — el +/- edita el total ofrecido; lo mostrado es lo
  // disponible EN VIVO, que puede no subir si un mazo ya está usando el resto)
  box.querySelectorAll("[data-t]").forEach((b) => {
    b.onclick = () => {
      const beforeOffered = store.getTradeQty(card.id);
      const afterOffered = store.addTradeQty(card.id, b.dataset.t === "plus" ? 1 : -1);
      if (b.dataset.t === "plus" && afterOffered === beforeOffered) {
        showToast(beforeOffered === 0 ? "Primero marca que tienes la carta (+)" : "Ya ofreces todas tus copias", 2800);
      }
      box.querySelector('[data-role="tqty"]').textContent = store.getAvailableQty(card.id);
      renderDeckHint(box.querySelector('[data-role="deckhint"]'), card.id);
      const gridCard = document.querySelector(`.card[data-id="${CSS.escape(card.id)}"]`);
      const availEl = gridCard?.querySelector('[data-role="avail"]');
      if (availEl) availEl.innerHTML = availableMetaHtml(card.id);
    };
  });

  $("#modal").classList.remove("hidden");

  // Detalle ampliado en vivo (api.myl.cl)
  fetchProfile(card).then((p) => renderProfileExtra(p, card));
}

function renderProfileExtra(p, card) {
  const box = $("#cd-extra");
  if (!box) return;
  // Corrige el nombre (tildes/ñ) con el del perfil
  const realName = p?.details?.name?.trim();
  if (card && realName) {
    const h = $("#cd-name"); if (h) h.textContent = realName;
    if (realName !== card.name) { nameCache[card.id] = realName; saveNameCache(); updateCardNameInDom(card.id, realName); }
  }
  if (!p || !p.details) {
    box.innerHTML = `<p class="muted">No se pudo cargar el detalle ampliado (revisa tu conexión).</p>`;
    return;
  }
  let html = "";
  // Habilidad formateada del perfil (si difiere/está más completa)
  const ab = p.details.ability_html || p.details.ability;
  if (ab) { const a = $("#cd-ability"); if (a) a.innerHTML = nl2br(ab); }

  // Formatos / torneos
  const vf = p.valid_formats || {};
  const valid = Object.entries(vf).filter(([, v]) => v).map(([k]) => FORMAT_LABELS[k] || k);
  if (valid.length) {
    html += `<div class="cd-section"><h4>Formatos de torneo</h4><div class="m-tags">${valid.map((f) => `<span class="tag ok-tag">✓ ${escapeHtml(f)}</span>`).join("")}</div></div>`;
  }
  // Palabras clave
  const kws = (p.keywords || []).map((k) => k.name || k.slug).filter(Boolean);
  if (kws.length) html += `<div class="cd-section"><h4>Palabras clave</h4><div class="m-tags">${kws.map((k) => `<span class="tag">${escapeHtml(k)}</span>`).join("")}</div></div>`;

  // Datos de edición / ilustrador
  const meta = [];
  const ill = p.illustrator?.name || p.details.illustrator;
  if (ill && typeof ill === "string") meta.push(["Ilustrador", ill]);
  if (p.edition?.title) meta.push(["Edición", p.edition.title]);
  if (p.edition?.date_release && !/^1990|^2000/.test(p.edition.date_release)) meta.push(["Lanzamiento", p.edition.date_release]);
  if (meta.length) html += `<div class="cd-section"><h4>Ficha</h4>${meta.map(([k, v]) => `<div class="cd-meta"><span>${escapeHtml(k)}</span><b>${escapeHtml(v)}</b></div>`).join("")}</div>`;

  // Errata
  const errata = (p.errata || []).map((e) => e.text || e.description || e.errata).filter(Boolean);
  if (errata.length) html += `<div class="cd-section"><h4>Errata / aclaraciones</h4>${errata.map((t) => `<p class="muted">${nl2br(t)}</p>`).join("")}</div>`;

  // Productos donde aparece
  const prods = (p.products || []).map((x) => x.name || x.title).filter(Boolean);
  if (prods.length) html += `<div class="cd-section"><h4>Aparece en</h4><div class="m-tags">${prods.map((x) => `<span class="tag">${escapeHtml(x)}</span>`).join("")}</div></div>`;

  box.innerHTML = html || `<p class="muted">Sin información adicional.</p>`;
}

function openZoom(src, alt) {
  let z = $("#img-zoom");
  if (!z) {
    z = document.createElement("div");
    z.id = "img-zoom";
    z.className = "img-zoom hidden";
    z.addEventListener("click", () => z.classList.add("hidden"));
    document.body.appendChild(z);
  }
  z.innerHTML = `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt || "")}" />`;
  z.classList.remove("hidden");
}
function closeModal() { $("#modal").classList.add("hidden"); }

/* ===================== Carta manual (formulario) ===================== */
let cfImageData = "";
function editionSlug(text) {
  return normText(text).trim().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") || "personalizada";
}
function populateEditionDatalist() {
  const dl = $("#cf-editions");
  if (!dl) return;
  const names = [...new Set(state.cards.map((c) => c.editionName).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  dl.innerHTML = names.map((n) => `<option value="${escapeAttr(n)}"></option>`).join("");
}
// preset (opcional): { editionName, format, nextNum } para prellenar el
// formulario al agregar cartas desde el gestor de ediciones
function openCardForm(card, preset) {
  populateEditionDatalist();
  // "editing" es true para CUALQUIER carta que se abre desde su detalle, sea
  // oficial/bundled o ya manual: precarga sus datos igual. La diferencia está
  // en qué pasa al guardar (ver saveCardForm) — si la carta todavía no es
  // userCustom, guardar crea una copia local con el MISMO id (reemplaza a la
  // original en vez de duplicarla, ver rebuildCards) en lugar de actualizar
  // una carta manual ya existente.
  const editing = !!card;
  const isNewOverride = editing && !card.userCustom;
  $("#cf-title").textContent = editing
    ? (isNewOverride ? "Editar carta (crea una copia local)" : "Editar carta")
    : "Agregar carta manual";
  $("#cf-id").value = editing ? card.id : "";
  $("#cf-name").value = editing ? card.name : "";
  // Prioriza el nombre "canónico" de la edición (por slug, el mismo que usa
  // el resto de la app) sobre card.editionName: el scraper de TOR a veces
  // guarda en la carta un nombre abreviado ("LPE 2023") que no calza con el
  // de data/editions.json ("Leyendas - Primera Era 2023") — si se usara ese
  // nombre acá, al guardar saveCardForm no lo reconocería como la MISMA
  // edición y crearía una edición fantasma nueva y desconectada.
  $("#cf-edition").value = editing ? (state.editionName[card.edition] || card.editionName || "") : (preset?.editionName || "");
  $("#cf-number").value = editing ? (card.edid ? parseInt(card.edid, 10) : "") : (preset?.nextNum || "");
  $("#cf-special").value = editing ? (card.specialId || "") : "";
  $("#cf-format").value = editing ? (card.format || "NE") : (preset?.format || "NE");
  $("#cf-race").value = editing && card.race !== "—" ? card.race : "";
  $("#cf-type").value = editing ? card.type : "Aliado";
  $("#cf-rarity").value = editing && card.rarity !== "—" ? card.rarity : "";
  $("#cf-cost").value = editing && card.cost != null ? card.cost : "";
  $("#cf-strength").value = editing && card.strength != null ? card.strength : "";
  $("#cf-ability").value = editing ? card.ability : "";
  $("#cf-flavour").value = editing ? card.flavour : "";
  $("#cf-image-url").value = editing && /^https?:|^\.\//.test(card.image || "") ? card.image : "";
  $("#cf-image-file").value = "";
  cfImageData = editing ? (card.image || "") : "";
  renderCfPreview();
  $("#cf-delete").style.display = editing && card.userCustom ? "" : "none";
  $("#card-form-modal").classList.remove("hidden");
  // Al agregar una carta especial desde el gestor, el foco va al identificador
  if (!editing && preset?.special) $("#cf-special").focus();
}
function closeCardForm() { $("#card-form-modal").classList.add("hidden"); }
function renderCfPreview() {
  const src = $("#cf-image-url").value.trim() || cfImageData;
  $("#cf-preview").innerHTML = src ? `<img src="${escapeAttr(src)}" alt="" />` : "";
}
function saveCardForm(another) {
  const name = $("#cf-name").value.trim();
  if (!name) { showToast("Escribe al menos el nombre"); return; }
  const edName = $("#cf-edition").value.trim() || "Personalizada";
  // Resuelve la edición POR NOMBRE: si coincide con una edición del gestor o
  // una oficial, se reutiliza su slug real (crítico tras renombrar: el slug
  // original no cambia, y derivarlo del nombre nuevo crearía una edición
  // duplicada y desconectada)
  let slug, finalEdName = edName;
  const matchCustom = store.getCustomEditions().find((e) => normText(e.name) === normText(edName));
  if (matchCustom) { slug = matchCustom.slug; finalEdName = matchCustom.name; }
  else {
    const official = Object.entries(state.editionName).find(([, n]) => normText(n) === normText(edName));
    if (official) { slug = official[0]; finalEdName = official[1]; }
    else slug = editionSlug(edName);
  }
  const numVal = $("#cf-number").value;
  const specialVal = $("#cf-special").value.trim();
  const card = {
    name,
    edition: slug,
    editionName: finalEdName,
    // Una carta especial usa su identificador; el número queda solo para las normales
    specialId: specialVal,
    edid: (specialVal || numVal === "") ? "" : String(Math.max(1, Math.floor(Number(numVal)))).padStart(3, "0"),
    format: $("#cf-format").value,
    type: $("#cf-type").value,
    race: $("#cf-race").value.trim() || "—",
    rarity: $("#cf-rarity").value.trim() || "—",
    cost: $("#cf-cost").value === "" ? null : Number($("#cf-cost").value),
    strength: $("#cf-strength").value === "" ? null : Number($("#cf-strength").value),
    ability: $("#cf-ability").value.trim(),
    flavour: $("#cf-flavour").value.trim(),
    image: $("#cf-image-url").value.trim() || cfImageData || "",
  };
  const id = $("#cf-id").value;
  // id puede venir de una carta oficial/bundled que todavía no es userCustom
  // (se está editando por primera vez): en ese caso no existe en customCards
  // todavía, así que hay que CREARLA ahí (con ese mismo id, para que
  // reemplace a la original — ver rebuildCards) en vez de actualizarla.
  const isExistingCustom = id && store.getCustomCards().some((c) => c.id === id);
  if (isExistingCustom) store.updateCustomCard(id, card);
  else store.addCustomCard(id ? { ...card, id } : card);
  // refreshAll() (no solo applyFilters) porque este formulario ahora se abre
  // desde CUALQUIER vista (Colecciones, Cambios, Mazos...), no solo el
  // Catálogo — sin esto, editar una carta desde su detalle en Colecciones
  // guardaba bien pero la grilla de la colección seguía mostrando los datos
  // viejos hasta cambiar de vista y volver.
  populateFilters(); refreshAll();
  refreshEditionsModalIfOpen();
  if (another) {
    // Mantiene edición/formato/raza/rareza; limpia lo específico de la carta.
    // El número avanza solo al siguiente para cargar la edición en orden.
    $("#cf-id").value = "";
    $("#cf-name").value = "";
    $("#cf-number").value = numVal === "" || specialVal ? "" : Number(numVal) + 1;
    $("#cf-special").value = "";
    $("#cf-cost").value = "";
    $("#cf-strength").value = "";
    $("#cf-ability").value = "";
    $("#cf-flavour").value = "";
    $("#cf-image-url").value = "";
    $("#cf-image-file").value = "";
    cfImageData = "";
    renderCfPreview();
    $("#cf-delete").style.display = "none";
    $("#cf-title").textContent = "Agregar carta manual";
    $("#cf-name").focus();
    showToast("Guardada ✓ — agrega la siguiente");
  } else {
    closeCardForm();
    showToast(id ? "Carta actualizada" : "Carta agregada ✓");
  }
}
function bindCardFormEvents() {
  $("#btn-add-card").addEventListener("click", () => openCardForm(null));
  $("#cf-save").addEventListener("click", () => saveCardForm(false));
  $("#cf-save-another").addEventListener("click", () => saveCardForm(true));
  $("#cf-delete").addEventListener("click", () => {
    const id = $("#cf-id").value;
    if (id && confirm("¿Eliminar esta carta manual?")) {
      store.deleteCustomCard(id);
      rebuildCards(); populateFilters(); applyFilters(); closeCardForm();
      refreshEditionsModalIfOpen();
      showToast("Carta eliminada");
    }
  });
  $$("[data-close-cf]").forEach((el) => el.addEventListener("click", closeCardForm));
  $("#cf-image-url").addEventListener("input", renderCfPreview);
  $("#cf-image-file").addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 1.5 * 1024 * 1024) { showToast("Imagen muy grande (máx ~1.5 MB)", 3500); e.target.value = ""; return; }
    const reader = new FileReader();
    reader.onload = () => { cfImageData = reader.result; $("#cf-image-url").value = ""; renderCfPreview(); };
    reader.readAsDataURL(f);
  });
  // Antes no había forma de dejar una carta SIN imagen: borrar el texto del
  // campo URL no alcanzaba, porque al guardar se seguía usando cfImageData
  // (la imagen cargada al abrir el formulario, o el archivo subido) como
  // respaldo — el campo de texto vacío nunca "ganaba". Este botón limpia
  // los dos a la vez, que es la única forma real de vaciarla.
  $("#cf-image-remove").addEventListener("click", () => {
    $("#cf-image-url").value = "";
    $("#cf-image-file").value = "";
    cfImageData = "";
    renderCfPreview();
  });
}

/* ===================== Ediciones personalizadas (gestor) =====================
   Apartado "Ediciones" de la barra del Catálogo. Permite crear/editar/eliminar
   ediciones propias con nombre, descripción, bloque, total esperado de cartas
   y su listado numerado. Las cartas se agregan de dos formas complementarias:
   - Importando un CSV UTF-8 (plantilla descargable; columna imagen = URL).
     El número identifica la carta: reimportar actualiza en vez de duplicar.
   - Una a una con el formulario de carta manual (botón "Agregar carta").
   Renombrar la edición actualiza el nombre en todas sus cartas (el slug no
   cambia, así colecciones e inventario no se desconectan). */

const ED_FORMATS = [
  ["NE", "Nueva Era / Imperio"], ["PB", "Primer Bloque"], ["PE", "Primera Era"],
  ["SB", "Segundo Bloque"], ["FX", "Furia Extendido"], ["OT", "Otro"],
];
const CSV_HEADERS = ["numero", "especial", "nombre", "tipo", "raza", "rareza", "coste", "fuerza", "habilidad", "historia", "imagen"];

// Estado del modal: lista de ediciones o editor de una edición concreta
let edModal = { mode: "list", slug: null, csv: null };

function openEditionsModal(slug) {
  edModal = { mode: slug ? "edit" : "list", slug: slug || null, csv: null };
  renderEditionsModal();
  $("#editions-modal").classList.remove("hidden");
}
function closeEditionsModal() { $("#editions-modal").classList.add("hidden"); }
function refreshEditionsModalIfOpen() {
  if (!$("#editions-modal").classList.contains("hidden")) renderEditionsModal();
}

function renderEditionsModal() {
  const box = $("#editions-box");
  if (edModal.mode === "edit") { renderEditionEditor(box); return; }

  const eds = store.getCustomEditions();
  const rows = eds.map((e) => {
    const count = state.cards.filter((c) => c.edition === e.slug && c.userCustom).length;
    return `<div class="ed-row" data-slug="${escapeAttr(e.slug)}">
      <span class="ed-name">${escapeHtml(e.name)}</span>
      <span class="ed-meta">${count} carta${count === 1 ? "" : "s"}${e.expectedTotal ? " de " + e.expectedTotal : ""}</span>
      <button class="btn small" data-ed-edit>Editar</button>
      <button class="btn small" data-ed-del>Eliminar</button>
    </div>`;
  }).join("");
  box.innerHTML = `
    <button class="modal-close" data-close-ed>×</button>
    <h2>Mis ediciones</h2>
    <p class="muted">Crea tus propias ediciones con nombre, descripción y listado de cartas numerado. Se usan igual que las oficiales: aparecen en los filtros y puedes coleccionarlas.</p>
    <div class="sync-row" style="align-items:flex-end">
      <label class="field" style="flex:1;min-width:200px;margin:0"><span>Nombre de la nueva edición</span><input id="ed-new-name" type="text" placeholder="Ej: Brotherhood" /></label>
      <button class="btn primary" id="ed-create">Crear edición</button>
    </div>
    <div class="ed-list">${rows || `<p class="muted">Aún no tienes ediciones propias.</p>`}</div>`;

  box.querySelector("[data-close-ed]").onclick = closeEditionsModal;
  box.querySelector("#ed-create").onclick = () => {
    const name = $("#ed-new-name").value.trim();
    if (!name) { showToast("Escribe el nombre de la edición"); return; }
    const slug = editionSlug(name);
    if (store.getCustomEdition(slug) || (state.editionName[slug] && !store.getCustomEdition(slug))) {
      showToast(`Ya existe una edición llamada «${state.editionName[slug] || name}»`, 3500);
      return;
    }
    store.createCustomEdition({ slug, name });
    rebuildCards(); populateFilters();
    edModal = { mode: "edit", slug, csv: null };
    renderEditionsModal();
    showToast(`Edición «${name}» creada`);
  };
  box.querySelectorAll(".ed-row").forEach((row) => {
    const slug = row.dataset.slug;
    row.querySelector("[data-ed-edit]").onclick = () => { edModal = { mode: "edit", slug, csv: null }; renderEditionsModal(); };
    row.querySelector("[data-ed-del]").onclick = () => deleteEditionFlow(slug);
  });
}

function deleteEditionFlow(slug) {
  const ed = store.getCustomEdition(slug);
  if (!ed) return;
  const cards = state.cards.filter((c) => c.edition === slug && c.userCustom);
  if (!confirm(`¿Eliminar la edición «${ed.name}»?`)) return;
  if (cards.length && confirm(`La edición tiene ${cards.length} carta(s) manual(es).\n\nAceptar = eliminar también sus cartas\nCancelar = conservar las cartas (quedarán como edición suelta)`)) {
    for (const c of cards) store.deleteCustomCard(c.id);
  }
  store.deleteCustomEdition(slug);
  rebuildCards(); populateFilters(); applyFilters();
  edModal = { mode: "list", slug: null, csv: null };
  renderEditionsModal();
  showToast(`Edición «${ed.name}» eliminada`);
}

function editionCustomCards(slug) {
  return state.cards
    .filter((c) => c.edition === slug && c.userCustom)
    .sort(compareEditionCards); // especiales primero, luego por número
}

function renderEditionEditor(box) {
  const ed = store.getCustomEdition(edModal.slug);
  if (!ed) { edModal = { mode: "list", slug: null, csv: null }; renderEditionsModal(); return; }
  const cards = editionCustomCards(ed.slug);
  const specials = cards.filter((c) => c.specialId);
  const normals = cards.filter((c) => !c.specialId);
  const fmtOpts = ED_FORMATS.map(([v, l]) => `<option value="${v}" ${ed.format === v ? "selected" : ""}>${l}</option>`).join("");
  const cardRow = (c) => {
    const n = cardNum(c);
    const label = c.specialId ? escapeHtml(c.specialId) : Number.isFinite(n) ? "#" + n : "—";
    return `<div class="ed-card-row" data-id="${escapeAttr(c.id)}">
      <span class="ec-num">${label}</span>
      <span class="ec-name">${escapeHtml(c.name)}</span>
      <button class="btn small" data-ec-edit>Editar</button>
      <button class="btn small" data-ec-del>Quitar</button>
    </div>`;
  };

  box.innerHTML = `
    <button class="modal-close" data-close-ed>×</button>
    <button class="btn small" id="ed-back">← Mis ediciones</button>
    <h2 style="margin-top:10px">${escapeHtml(ed.name)}</h2>
    <div class="cf-grid">
      <label class="field"><span>Nombre *</span><input id="ed-name" type="text" value="${escapeAttr(ed.name)}" /></label>
      <label class="field"><span>Bloque / formato</span><select id="ed-format">${fmtOpts}</select></label>
      <label class="field cf-full"><span>Descripción</span><textarea id="ed-desc" rows="2">${escapeHtml(ed.description || "")}</textarea></label>
      <label class="field"><span>Número de cartas de la edición (opcional)</span><input id="ed-total" type="number" min="0" value="${ed.expectedTotal ?? ""}" placeholder="Ej: 100" /></label>
    </div>
    <div class="sync-row"><button class="btn primary" id="ed-save">Guardar cambios</button></div>

    <h3 class="sync-h3">Cartas especiales / promocionales (${specials.length})</h3>
    <p class="muted" style="margin:4px 0 0">Cartas sin número, con identificador propio (ej: Promo, P-001). Se muestran al inicio de la colección.</p>
    <div class="ed-cards">${specials.map(cardRow).join("") || `<p class="muted">Sin cartas especiales.</p>`}</div>
    <div class="sync-row"><button class="btn" id="ed-add-special">Agregar carta especial</button></div>

    <h3 class="sync-h3">Listado de cartas de la edición (${normals.length}${ed.expectedTotal ? " de " + ed.expectedTotal : ""})</h3>
    <div class="ed-cards">${normals.map(cardRow).join("") || `<p class="muted">Aún no tiene cartas numeradas. Agrégalas una a una o importa el listado desde un CSV.</p>`}</div>
    <div class="sync-row"><button class="btn" id="ed-add-card">Agregar carta</button></div>

    <h3 class="sync-h3">Cargar cartas desde myl.fandom.com</h3>
    <p class="muted">Trae automáticamente el listado numerado (y sus promocionales, si indicas la página) directo desde el wiki, sin pasar por un archivo CSV. Solo completa las cartas que encuentra por su página exacta — las que no puede identificar con certeza quedan listadas abajo para completarlas a mano o pidiéndole a Claude que las resuelva con la skill <span class="mono">importar-edicion-myl-wiki</span>. La imagen es aún más estricta: solo se usa si viene de una página propia de esta edición, nunca de una compartida con otra (una carta "remake" puede tener el mismo nombre y arte parecido a una versión anterior, pero con distinta habilidad) — si no hay imagen confirmada, la carta queda sin imagen para que la completes a mano. Si tu navegador no logra conectar (algunos sitios bloquean estas peticiones), usa el CSV de más abajo como alternativa.</p>
    <div class="cf-grid">
      <label class="field"><span>Nombre de la edición en el wiki</span><input id="wi-name" type="text" value="${escapeAttr(ed.name)}" placeholder="Ej: Bruderschaft" /></label>
      <label class="field"><span>Página de promocionales (opcional)</span><input id="wi-promo" type="text" placeholder="Ej: Lista de cartas Promo de Brotherhood" /></label>
    </div>
    <div class="sync-row"><button class="btn primary" id="wi-load">Buscar y cargar cartas</button></div>
    <div id="wi-status" class="muted" style="margin-top:8px"></div>
    <div id="wi-report" class="csv-report"></div>

    <h3 class="sync-h3">Importar listado desde CSV (UTF-8)</h3>
    <p class="muted">Columnas: <b>numero, especial, nombre, tipo, raza, rareza, coste, fuerza, habilidad, historia, imagen</b>. Usa <b>numero</b> para las cartas normales o <b>especial</b> (ej: Promo, P-001) para las promocionales — una de las dos, no ambas. La imagen debe ser un enlace (https://…). El número o identificador especial identifica cada carta: si reimportas el archivo, esas filas <b>actualizan</b> la carta en vez de duplicarla.</p>
    <div class="sync-row">
      <button class="btn" id="ed-tpl">Descargar plantilla CSV</button>
      <label class="btn" style="cursor:pointer">Elegir archivo CSV<input id="ed-csv" type="file" accept=".csv,text/csv" hidden /></label>
    </div>
    <div id="ed-csv-preview" class="csv-report"></div>`;

  box.querySelector("[data-close-ed]").onclick = closeEditionsModal;
  $("#ed-back").onclick = () => { edModal = { mode: "list", slug: null, csv: null }; renderEditionsModal(); };
  $("#ed-save").onclick = () => {
    const name = $("#ed-name").value.trim();
    if (!name) { showToast("El nombre no puede quedar vacío"); return; }
    const totalRaw = $("#ed-total").value;
    store.updateCustomEdition(ed.slug, {
      name,
      description: $("#ed-desc").value.trim(),
      format: $("#ed-format").value,
      expectedTotal: totalRaw === "" ? null : Math.max(0, Math.floor(Number(totalRaw))),
    });
    if (name !== ed.name) store.renameEditionOnCards(ed.slug, name); // renombra en bloque
    rebuildCards(); populateFilters(); applyFilters();
    if (state.view === "colecciones") renderCollectionsView();
    renderEditionsModal();
    showToast("Edición guardada ✓");
  };
  $("#ed-add-card").onclick = () => {
    const nums = normals.map(cardNum).filter(Number.isFinite);
    openCardForm(null, { editionName: ed.name, format: ed.format === "OT" ? "NE" : ed.format, nextNum: (nums.length ? Math.max(...nums) : 0) + 1 });
  };
  $("#ed-add-special").onclick = () => {
    openCardForm(null, { editionName: ed.name, format: ed.format === "OT" ? "NE" : ed.format, special: true });
  };
  box.querySelectorAll(".ed-card-row").forEach((row) => {
    const card = cardById(row.dataset.id);
    row.querySelector("[data-ec-edit]").onclick = () => { if (card) openCardForm(card); };
    row.querySelector("[data-ec-del]").onclick = () => {
      if (!card || !confirm(`¿Quitar «${card.name}» de la edición? (Se elimina la carta manual)`)) return;
      store.deleteCustomCard(card.id);
      rebuildCards(); populateFilters(); applyFilters();
      renderEditionsModal();
    };
  });
  $("#wi-load").onclick = () => loadEditionFromWiki(ed);
  $("#ed-tpl").onclick = downloadCSVTemplate;
  $("#ed-csv").onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { edModal.csv = parseEditionCSV(String(reader.result), ed); renderCSVPreview(ed); };
    reader.readAsText(f, "utf-8");
    e.target.value = "";
  };
}

function downloadCSVTemplate() {
  const tpl =
    CSV_HEADERS.join(",") + "\n" +
    `1,,Ejemplo Aliado,Aliado,Guerrero,Cortesano,3,2,"Cuando entra en juego, roba una carta.","Texto de ambientación.",https://ejemplo.com/carta1.png\n` +
    `2,,Ejemplo Talismán,Talismán,,Real,2,,"Destierra un Oro en juego.",,\n` +
    `,Promo,Inti,Aliado,Sacerdote,Promocional,3,4,"Ejemplo de carta promocional sin número.",,https://ejemplo.com/inti.png\n` +
    `,P-001,Lautaro,Aliado,Guerrero,Promocional,4,5,"Otra promocional con identificador propio.",,\n`;
  // BOM para que Excel lo abra directo como UTF-8
  download("plantilla_edicion.csv", "\uFEFF" + tpl, "text/csv;charset=utf-8");
  showToast("Plantilla descargada: llénala en Excel/Sheets y guárdala como CSV UTF-8");
}

/* --- Parseo CSV robusto: soporta comillas, comas y saltos de línea entre comillas --- */
function parseCSV(text) {
  text = String(text).replace(/^\uFEFF/, ""); // quita el BOM si viene de Excel
  const rows = [];
  let row = [], cell = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
      else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

// Valida el CSV y lo convierte en cartas listas para importar a la edición.
// Devuelve { cards: [...], errors: ["fila N: motivo", ...] }
function parseEditionCSV(text, ed) {
  const rows = parseCSV(text);
  if (!rows.length) return { cards: [], errors: ["El archivo está vacío."] };
  const header = rows[0].map((h) => normText(h).trim());
  const idx = {};
  for (const col of CSV_HEADERS) idx[col] = header.indexOf(col);
  if (idx.nombre === -1) return { cards: [], errors: ['Falta la columna "nombre" en la primera fila. Descarga la plantilla para ver el formato.'] };

  const cards = [], errors = [], seenNums = new Set(), seenSpecials = new Set();
  const get = (r, col) => (idx[col] === -1 ? "" : (r[idx[col]] ?? "").trim());
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i], fila = i + 1;
    const nombre = get(r, "nombre");
    if (!nombre) { errors.push(`fila ${fila}: sin nombre`); continue; }
    const numRaw = get(r, "numero");
    const espRaw = get(r, "especial");
    if (numRaw !== "" && espRaw !== "") { errors.push(`fila ${fila} («${nombre}»): usa "numero" O "especial", no ambos`); continue; }
    let num = null;
    if (espRaw !== "") {
      const key = normText(espRaw);
      if (seenSpecials.has(key)) { errors.push(`fila ${fila} («${nombre}»): identificador especial "${espRaw}" repetido en el archivo`); continue; }
      seenSpecials.add(key);
    } else if (numRaw !== "") {
      num = Number(numRaw);
      if (!Number.isInteger(num) || num < 1) { errors.push(`fila ${fila} («${nombre}»): número inválido "${numRaw}"`); continue; }
      if (seenNums.has(num)) { errors.push(`fila ${fila} («${nombre}»): número ${num} repetido en el archivo`); continue; }
      seenNums.add(num);
    }
    const imagen = get(r, "imagen");
    if (imagen && !/^https?:\/\//i.test(imagen)) { errors.push(`fila ${fila} («${nombre}»): la imagen debe ser un enlace https://…`); continue; }
    const numOrEmpty = (col) => { const v = get(r, col); if (v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : NaN; };
    const coste = numOrEmpty("coste"), fuerza = numOrEmpty("fuerza");
    if (Number.isNaN(coste) || Number.isNaN(fuerza)) { errors.push(`fila ${fila} («${nombre}»): coste o fuerza no numérico`); continue; }
    cards.push({
      name: nombre,
      edition: ed.slug,
      editionName: ed.name,
      specialId: espRaw,
      edid: num ? String(num).padStart(3, "0") : "",
      format: ed.format === "OT" ? "NE" : ed.format,
      type: get(r, "tipo") || "—",
      race: get(r, "raza") || "—",
      rarity: get(r, "rareza") || "—",
      cost: coste, strength: fuerza,
      ability: get(r, "habilidad"),
      flavour: get(r, "historia"),
      image: imagen,
      _num: num,
      _esp: espRaw,
    });
  }
  return { cards, errors };
}

function renderCSVPreview(ed) {
  const boxp = $("#ed-csv-preview");
  const { cards, errors } = edModal.csv || { cards: [], errors: [] };
  const errList = errors.slice(0, 12).map((e) => `<div class="err">✗ ${escapeHtml(e)}</div>`).join("") +
    (errors.length > 12 ? `<div class="err">… y ${errors.length - 12} error(es) más</div>` : "");
  boxp.innerHTML = `
    <p><b>${cards.length}</b> carta(s) lista(s) para importar${errors.length ? ` · <b>${errors.length}</b> fila(s) con error que se omitirán` : " · sin errores"}.</p>
    ${errList}
    ${cards.length ? `<div class="sync-row"><button class="btn primary" id="ed-import">Importar ${cards.length} carta(s)</button></div>` : ""}`;
  const btn = $("#ed-import");
  if (btn) btn.onclick = () => importCSVCards(ed);
}

// Importa las filas válidas: crea cartas nuevas o actualiza las existentes de
// la edición que tengan el mismo número, el mismo identificador especial, o el
// mismo nombre si la fila no trae ninguno de los dos
// Crea o actualiza cartas manuales de una edición, emparejando por número o
// identificador especial (o por nombre si la carta no trae ninguno de los
// dos) para que reimportar el mismo listado actualice en vez de duplicar.
// La usan tanto el importador CSV como la carga desde el wiki.
function mergeEditionCards(ed, cards, matchKeyOf) {
  const existing = store.getCustomCards().filter((c) => c.edition === ed.slug);
  let created = 0, updated = 0;
  for (const card of cards) {
    const key = matchKeyOf(card);
    const match = existing.find((c) =>
      key.esp ? normText(c.specialId || "") === normText(key.esp)
        : key.num != null ? parseInt(c.edid, 10) === key.num
        : normText(c.name) === normText(card.name)
    );
    if (match) { store.updateCustomCard(match.id, card); updated++; }
    else { store.addCustomCard(card); created++; }
  }
  return { created, updated };
}

function importCSVCards(ed) {
  const { created, updated } = mergeEditionCards(
    ed,
    edModal.csv.cards.map(({ _num, _esp, ...card }) => card),
    (card) => ({ num: card.edid ? parseInt(card.edid, 10) : null, esp: card.specialId })
  );
  edModal.csv = null;
  rebuildCards(); populateFilters(); applyFilters();
  renderEditionsModal();
  showToast(`Importación lista: ${created} carta(s) nueva(s), ${updated} actualizada(s)`, 4500);
}

// Trae el listado de una edición directamente desde myl.fandom.com (ver
// js/wiki-import.js) y lo fusiona en la edición actual. Igual que el CSV,
// nunca sobrescribe con datos inciertos: lo que el módulo no pudo resolver
// con certeza llega vacío y se lista aparte para completar a mano.
async function loadEditionFromWiki(ed) {
  const wikiName = $("#wi-name").value.trim();
  if (!wikiName) { showToast("Escribe el nombre de la edición en el wiki"); return; }
  const promoPage = $("#wi-promo").value.trim() || null;
  const btn = $("#wi-load");
  const statusEl = $("#wi-status");
  const reportEl = $("#wi-report");
  reportEl.innerHTML = "";
  btn.disabled = true;
  statusEl.textContent = "Conectando con myl.fandom.com…";
  try {
    const { cards, report } = await importEditionFromWiki({
      wikiEditionName: wikiName,
      editionSlug: ed.slug,
      editionDisplayName: ed.name,
      format: ed.format === "OT" ? "NE" : ed.format,
      promoPage,
      onProgress: (msg) => { statusEl.textContent = msg; },
    });
    const { created, updated } = mergeEditionCards(
      ed, cards, (card) => ({ num: card.edid ? parseInt(card.edid, 10) : null, esp: card.specialId })
    );
    rebuildCards(); populateFilters(); applyFilters();
    // renderEditionsModal() reconstruye el DOM del modal (box.innerHTML = ...),
    // así que statusEl/reportEl/btn quedan apuntando a nodos ya desprendidos:
    // hay que volver a pedir las referencias DESPUÉS de re-renderizar.
    renderEditionsModal();
    const gaps = report.sinResolver.length;
    const noImg = report.imagenDescartadaPorConfianza.length;
    $("#wi-status").textContent = `Listo: ${created} carta(s) nueva(s), ${updated} actualizada(s).`;
    let reportHtml = "";
    if (gaps) {
      reportHtml +=
        `<p>${gaps} carta(s) no se pudieron identificar con certeza en el wiki y quedaron con datos mínimos (nombre, tipo, rareza):</p>` +
        report.sinResolver.slice(0, 30).map((e) => `<div class="err">✗ ${escapeHtml(e.nombre)}</div>`).join("") +
        (gaps > 30 ? `<div class="err">… y ${gaps - 30} más</div>` : "") +
        `<p class="muted">Pídele a Claude que las complete con la skill <span class="mono">importar-edicion-myl-wiki</span>, o edítalas a mano arriba.</p>`;
    }
    if (noImg) {
      reportHtml +=
        `<p>${noImg} carta(s) se identificaron bien pero se dejaron <b>sin imagen a propósito</b>: la única imagen encontrada venía de una página de OTRA edición (una carta "remake"/reimpresa puede compartir arte con una versión anterior que tiene distinta habilidad). Complétalas a mano cuando escanees tu carta física, en el listado de arriba.</p>`;
    }
    if (!reportHtml) reportHtml = `<p>Todas las cartas se identificaron con certeza, con imagen propia de esta edición ✓</p>`;
    $("#wi-report").innerHTML = reportHtml;
    showToast(`Cargado desde el wiki: ${created + updated} carta(s)`, 4500);
  } catch (e) {
    statusEl.textContent = "";
    reportEl.innerHTML = `<p class="err">✗ ${escapeHtml(e.message)}</p>`;
    btn.disabled = false;
  }
}

function bindEditionEvents() {
  $("#btn-editions").addEventListener("click", () => openEditionsModal());
  $("#editions-modal").addEventListener("click", (e) => {
    if (e.target.classList.contains("modal-backdrop")) closeEditionsModal();
  });
}

/* ===================== Añadir a mazo (desde Colección) ===================== */
function addToDeckQuick(card) {
  const activeId = store.getSetting("activeDeckId");
  if (activeId && store.getDeck(activeId)) {
    store.deckAdd(activeId, card.id, 1);
    const d = store.getDeck(activeId);
    refreshActiveDeckCount();
    showToast(`«${card.name}» → ${d.name} (${d.cards[card.id]})`);
  } else {
    openDeckPicker(card);
  }
}

function openDeckPicker(card) {
  const decks = store.getDecks();
  const box = $("#deck-modal-box");
  const list = decks.length
    ? decks.map((d) => `<button class="picker-deck" data-id="${escapeAttr(d.id)}">
        <span class="pd-name">${escapeHtml(d.name)}</span>
        <span class="muted">${d.cards[card.id] ? "ya tienes ×" + d.cards[card.id] + " · " : ""}${store.deckCount(d.id)} cartas</span>
      </button>`).join("")
    : `<p class="muted">Aún no tienes mazos. Crea uno abajo.</p>`;
  box.innerHTML = `
    <button class="modal-close" data-close-deck>×</button>
    <h2>Añadir a un mazo</h2>
    <p class="muted">«${escapeHtml(card.name)}»</p>
    <div class="picker-list">${list}</div>
    <button class="btn full" data-new-deck><i class="ph ph-plus"></i> Crear mazo nuevo y añadir</button>`;
  box.querySelector("[data-close-deck]").onclick = closeDeckModal;
  box.querySelectorAll(".picker-deck").forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.id;
      store.deckAdd(id, card.id, 1);
      store.setSetting("activeDeckId", id);
      refreshActiveDeckUI();
      showToast(`«${card.name}» → ${store.getDeck(id).name}`);
      closeDeckModal();
    };
  });
  box.querySelector("[data-new-deck]").onclick = () => {
    const name = prompt("Nombre del nuevo mazo:", "Mazo nuevo");
    if (name === null) return;
    const d = store.createDeck(name);
    store.deckAdd(d.id, card.id, 1);
    store.setSetting("activeDeckId", d.id);
    refreshActiveDeckUI();
    showToast(`Mazo «${d.name}» creado con «${card.name}»`);
    closeDeckModal();
  };
  $("#deck-modal").classList.remove("hidden");
}
function closeDeckModal() { $("#deck-modal").classList.add("hidden"); }

function populateActiveDeckSelect() {
  const sel = $("#active-deck-select");
  if (!sel) return;
  const decks = store.getDecks();
  const active = store.getSetting("activeDeckId") || "";
  sel.innerHTML = `<option value="">(ninguno)</option>` +
    decks.map((d) => `<option value="${escapeAttr(d.id)}">${escapeHtml(d.name)}</option>`).join("");
  sel.value = decks.some((d) => d.id === active) ? active : "";
}
function refreshActiveDeckCount() {
  const el = $("#active-deck-count");
  if (!el) return;
  const d = store.getDeck(store.getSetting("activeDeckId"));
  el.textContent = d ? `${store.deckCount(d.id)} cartas` : "Elige o crea un mazo para agregar";
}
function refreshActiveDeckUI() { populateActiveDeckSelect(); refreshActiveDeckCount(); }

function bindDeckBarEvents() {
  $("#active-deck-select").addEventListener("change", (e) => {
    store.setSetting("activeDeckId", e.target.value || null);
    refreshActiveDeckCount();
  });
  $("#active-deck-new").addEventListener("click", () => {
    const name = prompt("Nombre del nuevo mazo:", "Mazo nuevo");
    if (name === null) return;
    const d = store.createDeck(name);
    store.setSetting("activeDeckId", d.id);
    refreshActiveDeckUI();
    showToast(`Mazo «${d.name}» creado y activo`);
  });
  $$("[data-close-deck]").forEach((el) => el.addEventListener("click", closeDeckModal));
}

/* ===================== Colecciones (cuaderno de colección digital) =====================
   Una "colección" es el álbum digital de una o más ediciones (`col.editions`,
   array de slugs — ver store.js): al crearla se eligen las ediciones y la
   vista muestra todas sus cartas juntas, agrupadas por edición en su orden de
   publicación y ordenadas por número (edid) dentro de cada una. Pensado para
   agrupar, por ejemplo, todas las "Mundos Perdidos" de un mismo año en una
   sola colección que se va completando con cada lanzamiento nuevo, en vez de
   tener una colección suelta por edición.
   Las cantidades NO viven en la colección: se leen del inventario, por lo que
   marcar copias aquí o en el Catálogo es equivalente. El efecto visual de
   "carta bloqueada" (blanco y negro → color) lo resuelve CSS con la clase
   .owned que cardEl()/changeQty() mantienen al día (ver styles.css,
   sección Colecciones). */

// Cartas de las ediciones de la colección, ordenadas por edición (orden de
// publicación) y luego por número de carta. Se cachean por colección (no por
// edición: dos colecciones pueden compartir o combinar ediciones distinto)
// para no recorrer el catálogo completo (~20k cartas) en cada clic de +/−;
// rebuildCards() limpia la caché cuando cambia el catálogo.
const editionCardsCache = new Map();
function collectionCards(col) {
  let arr = editionCardsCache.get(col.id);
  if (!arr) {
    const eds = new Set(col.editions);
    arr = state.cards
      .filter((c) => eds.has(c.edition))
      .sort(compareEditionCards); // por edición, especiales primero, luego por número
    editionCardsCache.set(col.id, arr);
  }
  return arr;
}
// Progreso de la colección: únicas poseídas / total combinado de sus ediciones.
// En ediciones personalizadas con "total esperado" definido, ese total pesa
// para ESA edición aunque aún no se hayan cargado todas sus cartas (útil para
// ir completando una edición nueva a medida que el wiki la documenta).
function collectionStats(col) {
  const cards = collectionCards(col);
  const owned = cards.filter((c) => store.getQty(c.id) > 0).length;
  const specials = cards.filter((c) => c.specialId).length;
  let numberedTotal = 0;
  for (const slug of col.editions) {
    const ce = store.getCustomEdition(slug);
    const edNumbered = cards.filter((c) => c.edition === slug && !c.specialId).length;
    numberedTotal += Math.max(edNumbered, Number(ce?.expectedTotal) || 0);
  }
  const total = specials + numberedTotal;
  return { total, owned, pct: total ? Math.round((owned / total) * 100) : 0 };
}

// Texto corto para mostrar una lista de nombres de edición (1-2 = unidos con
// "+"; más = las primeras 2 y "y N más"). Se usa tanto para mostrar una
// colección ya creada como para armarle un nombre automático al crearla.
function joinEditionNames(names) {
  if (names.length <= 2) return names.join(" + ");
  return `${names.slice(0, 2).join(", ")} y ${names.length - 2} más`;
}
function collectionEditionNames(col) {
  return col.editions.map((s) => state.editionName[s] || s);
}
function collectionEditionLabel(col) {
  return joinEditionNames(collectionEditionNames(col));
}

// Panel lateral: lista de colecciones con su barra de progreso.
// Al final delega en renderCollectionDetail() para pintar la activa.
function renderCollectionsView() {
  const list = $("#collection-list");
  const cols = store.getCollections();
  let activeId = store.getSetting("activeCollectionId");
  // Si no hay colección activa (p. ej. recién creada desde un intercambio),
  // se selecciona la primera para no mostrar un panel vacío
  if (!store.getCollection(activeId) && cols.length) {
    activeId = cols[0].id;
    store.setSetting("activeCollectionId", activeId);
  }
  list.innerHTML = cols.length ? "" : `<p class="muted">Aún no tienes colecciones.</p>`;
  for (const col of cols) {
    const s = collectionStats(col);
    const row = document.createElement("div");
    row.className = "col-item" + (col.id === activeId ? " active" : "");
    row.dataset.colId = col.id;
    row.draggable = true;
    row.innerHTML = `
      <div class="col-top">
        <span class="col-drag-handle" title="Arrastra para reordenar">⠿</span>
        <span class="d-name">${escapeHtml(col.name)}</span>
        <button class="qty-btn" data-move-up title="Subir">▲</button>
        <button class="qty-btn" data-move-down title="Bajar">▼</button>
        <button class="qty-btn" data-del title="Eliminar colección"><i class="ph ph-trash"></i></button>
      </div>
      <div class="col-ed muted" title="${escapeAttr(collectionEditionNames(col).join(", "))}">${escapeHtml(collectionEditionLabel(col))}</div>
      <span class="ep-bar"><span class="ep-fill" style="width:${s.pct}%"></span></span>
      <div class="col-nums muted">${s.owned}/${s.total} (${s.pct}%)</div>`;
    row.querySelector(".d-name").onclick = () => {
      store.setSetting("activeCollectionId", col.id);
      renderCollectionsView();
    };
    row.querySelector("[data-del]").onclick = () => {
      if (!confirm(`¿Eliminar la colección «${col.name}»?\n\n(No borra las cantidades de tu inventario)`)) return;
      store.deleteCollection(col.id);
      if (store.getSetting("activeCollectionId") === col.id) store.setSetting("activeCollectionId", null);
      renderCollectionsView();
    };
    // Botones ▲▼ como alternativa accesible/táctil al arrastre (el drag &
    // drop nativo de HTML5 no funciona con touch en muchos navegadores).
    row.querySelector("[data-move-up]").onclick = () => moveCollection(col.id, -1);
    row.querySelector("[data-move-down]").onclick = () => moveCollection(col.id, +1);
    // Arrastrar y soltar para reordenar libremente el panel lateral.
    row.addEventListener("dragstart", (e) => {
      state.draggedCollectionId = col.id;
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragend", () => row.classList.remove("dragging"));
    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (state.draggedCollectionId && state.draggedCollectionId !== col.id) row.classList.add("drag-over");
    });
    row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      row.classList.remove("drag-over");
      const draggedId = state.draggedCollectionId;
      state.draggedCollectionId = null;
      if (!draggedId || draggedId === col.id) return;
      reorderCollectionsByDrop(draggedId, col.id);
    });
    list.appendChild(row);
  }
  renderCollectionDetail();
}
// Mueve una colección un puesto arriba/abajo (delta -1/+1) en el panel lateral.
function moveCollection(id, delta) {
  const ids = store.getCollections().map((c) => c.id);
  const i = ids.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  store.reorderCollections(ids);
  renderCollectionsView();
}
// Reordena tras soltar `draggedId` sobre la fila de `targetId`.
function reorderCollectionsByDrop(draggedId, targetId) {
  const ids = store.getCollections().map((c) => c.id);
  const from = ids.indexOf(draggedId);
  const to = ids.indexOf(targetId);
  if (from === -1 || to === -1) return;
  ids.splice(from, 1);
  ids.splice(to, 0, draggedId);
  store.reorderCollections(ids);
  renderCollectionsView();
}

// Detalle de la colección activa: nombre editable, barra de progreso grande,
// filtro (todas/faltantes/obtenidas) y la grilla de cartas de la edición.
function renderCollectionDetail() {
  const wrap = $("#collection-detail");
  const col = store.getCollection(store.getSetting("activeCollectionId"));
  if (!col) {
    wrap.innerHTML = `<p class="muted">Crea una colección con <b>+ Nueva colección</b>: eliges una o más ediciones y verás todas sus cartas ordenadas por número, marcando tu progreso.</p>`;
    return;
  }
  const s = collectionStats(col);
  wrap.innerHTML = `
    <div class="col-head">
      <h2><input id="col-name-edit" value="${escapeAttr(col.name)}" /></h2>
      <span class="tag" title="${escapeAttr(collectionEditionNames(col).join(", "))}">${escapeHtml(collectionEditionLabel(col))}</span>
      <div class="spacer"></div>
      <button class="btn small" id="col-edit-editions" title="Agregar o quitar ediciones de esta colección"><i class="ph ph-pencil-simple"></i> Editar ediciones</button>
      <button class="btn small" id="col-export-pdf" title="PDF con la grilla de cartas, tal como se ve acá — para llevar a una jornada de intercambio"><i class="ph ph-file-pdf"></i> Exportar PDF</button>
      <label class="field inline"><span>Mostrar</span>
        <select id="col-filter">
          <option value="all">Todas las cartas</option>
          <option value="missing">Solo las que faltan</option>
          <option value="owned">Solo las que tengo</option>
        </select>
      </label>
    </div>
    <div class="col-progress-big">
      <span class="ep-bar"><span class="ep-fill" id="col-fill" style="width:${s.pct}%"></span></span>
      <span class="muted" id="col-progress-text">${s.owned}/${s.total} cartas (${s.pct}%)</span>
    </div>
    <div id="collection-grid"></div>
    <div id="col-empty" class="empty hidden">No hay cartas con este filtro.</div>`;

  $("#col-name-edit").onchange = (e) => {
    store.renameCollection(col.id, e.target.value.trim() || "Colección");
    renderCollectionsView();
  };
  const filterSel = $("#col-filter");
  filterSel.value = state.colFilter || "all";
  filterSel.onchange = (e) => { state.colFilter = e.target.value; renderCollectionGrid(col); };
  $("#col-export-pdf").onclick = () => exportCollectionAsPDF(col);
  $("#col-edit-editions").onclick = () => openCollectionModal(col);
  renderCollectionGrid(col);
}

// Genera el PDF de una colección: grilla de miniaturas seccionada por
// Edición y luego por Rareza/Frecuencia, cartas ascendentes por número
// dentro de cada sección — útil para llevar a una jornada de intercambio y
// detectar de un vistazo qué falta. Respeta el filtro "Mostrar" de la
// pantalla (Todas/Solo las que faltan/Solo las que tengo): si el filtro ya
// deja solo un estado (todas faltan, o todas se tienen), el PDF sale a
// todo color — el tratamiento blanco y negro solo tiene sentido cuando se
// mezclan ambos estados, y aun así ahora se acompaña de una cinta "FALTA"
// (ver exportCollectionPDF) porque varios dueños de colecciones físicas
// leían el blanco y negro al revés. Descarga cientos de imágenes en
// algunas ediciones, así que muestra progreso — puede tardar.
function exportCollectionAsPDF(col) {
  let cards = collectionCards(col);
  const filterMode = state.colFilter || "all";
  if (filterMode === "missing") cards = cards.filter((c) => store.getQty(c.id) === 0);
  else if (filterMode === "owned") cards = cards.filter((c) => store.getQty(c.id) > 0);
  if (!cards.length) { showToast("No hay cartas con este filtro para exportar"); return; }
  cards = [...cards].sort((a, b) =>
    editionOrd(a) - editionOrd(b) ||
    rarityRank(a) - rarityRank(b) ||
    cardNum(a) - cardNum(b) ||
    a.name.localeCompare(b.name, "es")
  );
  showToast("Generando PDF… 0%", 60000);
  exportCollectionPDF(col, cards, store.getQty, displayName, filterMode, (done, total) => {
    showToast(`Generando PDF… ${Math.round((done / total) * 100)}%`, 60000);
  })
    .then(() => showToast("PDF descargado ✓"))
    .catch((e) => showToast("Error al generar el PDF: " + e.message, 4500));
}

// Grilla del álbum: reutiliza cardEl() del Catálogo (mismos botones +/− y
// detalle). Si la edición tiene cartas especiales/promocionales, se muestran
// como listado inicial con su propio título y luego el listado numerado.
// Cada grilla interna lleva la clase .collection-grid, que activa en CSS el
// modo bloqueado (blanco y negro) para las cartas sin copias.
function renderCollectionGrid(col) {
  const wrap = $("#collection-grid");
  if (!wrap) return;
  let cards = collectionCards(col);
  const f = state.colFilter || "all";
  if (f === "missing") cards = cards.filter((c) => store.getQty(c.id) === 0);
  else if (f === "owned") cards = cards.filter((c) => store.getQty(c.id) > 0);
  // El buscador global de la barra superior también filtra dentro de la colección
  const query = normText($("#search").value.trim());
  if (query) cards = cards.filter((c) => c.searchText.includes(query));

  const specials = cards.filter((c) => c.specialId);
  const normals = cards.filter((c) => !c.specialId);
  wrap.innerHTML = "";
  // Se va llenando en el mismo orden en que se arman las secciones abajo, así
  // el modal navega anterior/siguiente siguiendo el orden visual real (todas
  // las secciones ya están armadas para cuando el usuario alcanza a hacer clic).
  const navList = [];
  const addSection = (title, list) => {
    if (!list.length) return;
    if (title) {
      const h = document.createElement("h3");
      h.className = "col-section-title";
      h.textContent = title;
      wrap.appendChild(h);
    }
    const g = document.createElement("div");
    g.className = "cards-grid collection-grid";
    for (const c of list) { navList.push(c); g.appendChild(cardEl(c, navList)); }
    wrap.appendChild(g);
  };
  if (col.editions.length > 1) {
    // Colección con varias ediciones agrupadas: una sub-grilla por edición,
    // en su orden de publicación (cards ya viene ordenado así) — tanto para
    // especiales como para numeradas, si no, con varias ediciones cuyas
    // cartas son 100% especiales (p. ej. Lootbox 2024 + 2025) quedarían todas
    // mezcladas en una sola sección y no se distinguiría "el tipo de Lootbox".
    for (const slug of col.editions) {
      const edSpecials = specials.filter((c) => c.edition === slug);
      const edNormals = normals.filter((c) => c.edition === slug);
      const edName = state.editionName[slug] || slug;
      addSection(`${edName} — promocionales / especiales (${edSpecials.length})`, edSpecials);
      addSection(`${edName} (${edNormals.length})`, edNormals);
    }
  } else if (specials.length) {
    addSection(`Cartas promocionales / especiales (${specials.length})`, specials);
    addSection(`Listado de cartas de la edición (${normals.length})`, normals);
  } else {
    addSection(null, normals); // sin especiales y una sola edición: una sola grilla, como siempre
  }
  scheduleNameCorrection(cards);
  $("#col-empty").classList.toggle("hidden", cards.length !== 0);
}

// Actualiza barras de progreso (detalle + panel lateral) al cambiar cantidades
function updateCollectionProgress() {
  const col = store.getCollection(store.getSetting("activeCollectionId"));
  if (!col) return;
  const s = collectionStats(col);
  const fill = $("#col-fill");
  if (fill) fill.style.width = s.pct + "%";
  const txt = $("#col-progress-text");
  if (txt) txt.textContent = `${s.owned}/${s.total} cartas (${s.pct}%)`;
  const row = document.querySelector(`.col-item[data-col-id="${CSS.escape(col.id)}"]`);
  if (row) {
    row.querySelector(".ep-fill").style.width = s.pct + "%";
    row.querySelector(".col-nums").textContent = `${s.owned}/${s.total} (${s.pct}%)`;
  }
}

// Modal de creación/edición: checklist de ediciones agrupadas por bloque (con
// buscador para filtrar, hay 130+ ediciones) + nombre opcional. Se puede
// elegir 1 o varias — pensado para agrupar, por ejemplo, todas las "Mundos
// Perdidos" de un año en una sola colección que se completa con cada
// lanzamiento nuevo, en vez de tener una colección suelta por edición.
// Mismo modal sirve para "Editar ediciones" de una colección ya creada
// (agregar/quitar sin perder nombre ni posición en la lista): se le pasa la
// colección y colModalEditingId guarda su id mientras el modal está abierto.
let colModalSelected = new Set();
let colModalEditingId = null;
function openCollectionModal(existingCol) {
  colModalEditingId = existingCol ? existingCol.id : null;
  // Al editar, se descartan ediciones que la colección todavía trae en su
  // array `editions` pero que ya no existen en el catálogo (renombradas,
  // fusionadas o eliminadas) — si no, el checklist nunca les muestra una
  // casilla para desmarcarlas (editionOptionGroups() no las lista) y
  // quedan "pegadas" para siempre por más que el usuario guarde cambios:
  // colModalSelected las traía precargadas desde existingCol.editions sin
  // que hubiera forma de tocarlas en la UI. Bug real reportado por el
  // dueño del inventario (09-08-2026): "el editor tampoco está editando".
  let dropped = 0;
  const validEditions = (existingCol ? existingCol.editions : []).filter((slug) => {
    const ok = state.editionName[slug] !== undefined;
    if (!ok) dropped++;
    return ok;
  });
  colModalSelected = new Set(validEditions);
  $("#col-edition-search").value = "";
  $("#col-name").value = "";
  $("#col-name-field").classList.toggle("hidden", !!existingCol);
  $("#col-modal-title").textContent = existingCol ? "Editar ediciones" : "Nueva colección";
  $("#col-modal-hint").textContent = existingCol
    ? `Marca o desmarca ediciones de «${existingCol.name}». El nombre y la posición de la colección no cambian.`
    : `Elige una o más ediciones para esta colección — por ejemplo, agrupa todas las "Mundos Perdidos" de un año en una sola, y la vas completando a medida que salen. Verás todas sus cartas ordenadas por edición y número; las que aún no tienes aparecen en blanco y negro, como bloqueadas.`;
  $("#col-create").textContent = existingCol ? "Guardar cambios" : "Crear colección";
  renderCollectionEditionList("");
  $("#collection-modal").classList.remove("hidden");
  $("#col-edition-search").focus();
  if (dropped) {
    const singular = dropped === 1;
    showToast(`${dropped} ${singular ? "edición" : "ediciones"} de esta colección ya ${singular ? "no existe" : "no existen"} en el catálogo — se quitaron al abrir este editor. Guarda para confirmar.`, 5000);
  }
}
function closeCollectionModal() { $("#collection-modal").classList.add("hidden"); }
// Redibuja el checklist filtrado por texto; la selección vive en
// colModalSelected (no en el DOM) para no perderla al filtrar y que
// desaparezcan de la vista las que ya estaban marcadas.
function renderCollectionEditionList(filterText) {
  const box = $("#col-edition-list");
  const q = normText((filterText || "").trim());
  let html = "";
  let any = false;
  for (const [gname, items] of editionOptionGroups("")) {
    const visible = q ? items.filter((it) => normText(it.label).includes(q)) : items;
    if (!visible.length) continue;
    any = true;
    html += `<div class="col-edition-group-label">${escapeHtml(gname)}</div>`;
    for (const it of visible) {
      html += `<label class="col-edition-item">
        <input type="checkbox" value="${escapeAttr(it.value)}" ${colModalSelected.has(it.value) ? "checked" : ""} />
        <span>${escapeHtml(it.label)}</span>
      </label>`;
    }
  }
  box.innerHTML = any ? html : `<p class="col-edition-empty">Sin resultados${filterText ? ` para "${escapeHtml(filterText)}"` : ""}.</p>`;
  box.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.onchange = () => {
      if (cb.checked) colModalSelected.add(cb.value);
      else colModalSelected.delete(cb.value);
      $("#col-edition-count").textContent = colModalSelected.size;
    };
  });
  $("#col-edition-count").textContent = colModalSelected.size;
}
function createCollectionFromModal() {
  // Orden de publicación, no el orden en que se clickearon
  const eds = [...colModalSelected].sort((a, b) => (state.editionOrder[a] ?? 9999) - (state.editionOrder[b] ?? 9999));
  if (!eds.length) { showToast("Elige al menos una edición para la colección"); return; }
  if (colModalEditingId) {
    store.setCollectionEditions(colModalEditingId, eds);
    // collectionCards() cachea por col.id (para no recorrer el catálogo
    // completo en cada +/-, ver más abajo) — esa caché nunca se invalidaba
    // al cambiar las ediciones de una colección ya existente, solo al
    // cambiar el catálogo (rebuildCards()), así que el cambio quedaba
    // invisible hasta recargar la página. Bug real reportado por el dueño
    // del inventario (09-08-2026): "debo recargar la página para que los
    // cambios se reflejen".
    editionCardsCache.delete(colModalEditingId);
    closeCollectionModal();
    renderCollectionsView();
    showToast(`Ediciones actualizadas ✓ (${eds.length} edición${eds.length === 1 ? "" : "es"})`);
    return;
  }
  // Sin nombre explícito: 1 edición toma su nombre; varias, se listan (o "y N más")
  const autoName = joinEditionNames(eds.map((s) => state.editionName[s] || s));
  const name = $("#col-name").value.trim() || autoName;
  const col = store.createCollection(name, eds);
  store.setSetting("activeCollectionId", col.id);
  closeCollectionModal();
  renderCollectionsView();
  showToast(`Colección «${name}» creada ✓ (${eds.length} edición${eds.length === 1 ? "" : "es"})`);
}
function bindCollectionEvents() {
  $("#new-collection").addEventListener("click", () => openCollectionModal());
  $("#col-create").addEventListener("click", createCollectionFromModal);
  $("#col-edition-search").addEventListener("input", (e) => renderCollectionEditionList(e.target.value));
  $$("[data-close-col]").forEach((el) => el.addEventListener("click", closeCollectionModal));
  $("#collection-modal").addEventListener("click", (e) => {
    if (e.target.classList.contains("modal-backdrop")) closeCollectionModal();
  });
}

/* ===================== Cambios (inventario de intercambio) =====================
   Flujo completo:
   1) El usuario marca copias repetidas como "para cambio" — desde el buscador
      de esta vista o desde el detalle de cualquier carta (control "Para cambio").
      El store garantiza que nunca se ofrezcan más copias de las que se tienen.
   2) Al registrar un intercambio (botón Intercambiar de una carta ofrecida):
      se descuenta 1 copia de la entregada, se suma 1 de la recibida, y la
      recibida entra automáticamente a la colección de su edición — si esa
      colección no existe, se crea sola en ese momento.
   3) Todo queda en el historial (myl.tradelog.v1), visible al pie de la vista. */

// Índice id→carta para resolver nombres rápido (se invalida en rebuildCards)
let cardIndex = null;
function cardById(id) {
  if (!cardIndex) cardIndex = new Map(state.cards.map((c) => [c.id, c]));
  return cardIndex.get(id) || null;
}

function renderTradeView() {
  renderTradeList();
  renderTradeLog();
  renderSaleLog();
}

// Formatea un precio en pesos chilenos ($1.234)
function fmtCLP(n) { return "$" + Math.round(n).toLocaleString("es-CL"); }
// "hace 5 días" / "hoy" / "hace 3 meses" — usado en la cabecera de Mazos.
function relTime(ts) {
  if (!ts) return null;
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days <= 0) return "hoy";
  if (days === 1) return "hace 1 día";
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  if (months < 12) return `hace ${months} mes${months === 1 ? "" : "es"}`;
  const years = Math.floor(months / 12);
  return `hace ${years} año${years === 1 ? "" : "s"}`;
}
// Rareza -> slug de la rampa de color del marco holográfico (ver .holo en
// styles.css). Corregido 16-09-2026 (el dueño lo marcó al revés): el aro
// morado es de Promocional, el verde jade es de Secreta. Las rarezas sin
// rampa propia (Milenaria, Set Paralelo, Ficha, Legendaria) caen al
// degradado de acento del sistema a propósito — devuelven "" y el CSS ya
// trae ese fallback.
const RARITY_SLUG = {
  "vasallo": "vasallo",
  "cortesano": "cortesano",
  "real": "real",
  "mega real": "mega-real",
  "ultra real": "ultra-real",
  "secreta": "secreta",
  "promocional": "promocional",
};
function raritySlug(rarity) {
  if (!rarity) return "";
  const key = String(rarity)
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return RARITY_SLUG[key] || "";
}
// Foil sobre el arte de la carta (ver .foil en styles.css). Vasallo y
// Cortesano NO son foil por sí solos — TOR/nuestro catálogo hoy no trae
// ningún campo de acabado (foil/finish/variant/acabado/version: se
// comprobó contra la API cruda de TOR y no existe) — salvo un caso real
// que sí queda registrado en los datos: las cartas "Premium" de las
// ediciones Lootbox (data/custom-cards.json) traen specialId "PREMIUM
// ..." independiente de su rareza — 37 son Real pero 5 son Vasallo/
// Cortesano, y esas 5 son justo el caso "algunas sí son foil aunque su
// rareza normalmente no lo sea" que reportó el dueño. Para el resto de
// Vasallo/Cortesano sin ninguna marca, solo queda declararlas a mano en
// FOIL_CORRECTIONS (mismo mecanismo que RARITY_CORRECTIONS en
// scraper/corrections.js). El resto de las rarezas es foil siempre.
const FOIL_OPT_IN = new Set(["vasallo", "cortesano"]);
// cardId -> true, para cartas Vasallo/Cortesano puntuales que sí son foil
// y no se detectan por specialId "PREMIUM" (llenar a mano si aparecen).
const FOIL_CORRECTIONS = {};
function declaresFoil(card) {
  if (FOIL_CORRECTIONS[card.id]) return true;
  if (card.foil === true) return true;
  if (typeof card.specialId === "string" && /premium/i.test(card.specialId)) return true;
  // Todas las ediciones "Mundos Perdidos" son foil, sin importar la rareza
  // (confirmado por el dueño 16-09-2026) — pisa el default no-foil de
  // Vasallo/Cortesano igual que el caso "Premium" de arriba.
  if (typeof card.edition === "string" && card.edition.startsWith("mundos_perdidos")) return true;
  const fields = [card.foil, card.finish, card.variant, card.acabado, card.version];
  return fields.some((v) =>
    typeof v === "string" &&
    v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes("foil")
  );
}
// El set "SCLPE" (Leyendas PE 4.0, data/custom-cards.json, specialId
// "SCLPE4-NN") tiene relieve pero NO brilla como el foil real — reportado
// por el dueño 16-09-2026. Nunca es foil, sin importar su rareza (pisa
// incluso a Real/Mega Real/Ultra Real/Secreta, que por rareza sí lo
// serían).
function isNonFoilPrint(card) {
  return typeof card.specialId === "string" && /^sclpe/i.test(card.specialId);
}
// TOR marca ~600 cartas Oro con `rarity: "Oro"` (o "—"/"Sin Frecuencia") —
// un cajón de sastre para cuando no tiene el dato, NO una rareza real como
// Real/Vasallo/Mega Real/etc. Un Oro con una de esas rarezas SÍ conocidas
// (incluye Promocional y Secreta, que son marcas especiales legítimas) NO
// es un "Oro liso" aunque no tenga habilidad — conserva su color de rareza
// normal más abajo.
const ORO_PLACEHOLDER_RARITIES = new Set(["oro", "sin frecuencia", "—", "-", ""]);
function hasRealRarity(card) {
  return !ORO_PLACEHOLDER_RARITIES.has(normText(card.rarity).trim());
}
// Un Oro "especial" (Premium, Promocional, Secreta, de un evento como
// Juego Organizado o un Torneo Premier, o cualquier otra marca que ya
// detecte declaresFoil) sigue las reglas normales de aura/foil por rareza
// aunque sea de tipo Oro — nunca cae al tratamiento de "Oro liso" de abajo.
function isSpecialOro(card) {
  return hasRealRarity(card) || declaresFoil(card) ||
    (typeof card.edition === "string" && /juego_organizado|torneo/i.test(card.edition));
}
// Un Oro "liso" (sin rareza real asignada y sin ninguna marca especial) es
// la carta de relleno más básica del juego: el aro es SIEMPRE dorado y
// NUNCA es foil — tenga o no tenga habilidad de texto, eso no decide nada
// acá, lo que importa es si tiene o no una rareza/frecuencia real asignada.
// Corregido 17-09-2026: la versión anterior solo miraba la habilidad
// (`!ability`), así que un Oro liso CON habilidad (ej. "Yasakani") se
// quedaba con un aro genérico sin sentido Y con foil — ninguno de los dos
// correcto. Un Oro CON rareza real (ej. El Dorado, Mega Real) sigue
// coloreado por esa rareza sin importar si tiene habilidad o no.
function isPlainOro(card) {
  return card.type === "Oro" && !isSpecialOro(card);
}
function holoSlug(card) {
  if (isPlainOro(card)) return "oro";
  return raritySlug(card.rarity);
}
function hasFoil(card) {
  if (isNonFoilPrint(card)) return false;
  if (isPlainOro(card)) return false;
  if (declaresFoil(card)) return true;
  return !FOIL_OPT_IN.has(raritySlug(card.rarity));
}
// Precio referencial de una carta (data/prices.json) — cobertura parcial,
// ver docs/FUENTES-DATOS.md sección 6b. null si no se encontró ninguna tienda.
function cardPriceInfo(cardId) { return state.prices[cardId] || null; }
// Precio de referencia de una carta según cardPriceInfo, prefiriendo
// mylserena sobre mesaredonda (mismo criterio que ya usaba el resto de la
// vista de Cambio y Ventas). null si no hay ninguna fuente.
function marketRefPrice(cardId) {
  const p = cardPriceInfo(cardId);
  return p ? (p.mylserena ?? p.mesaredonda ?? null) : null;
}
// Compara el valor que el dueño le asignó a una carta con el precio de
// referencia scrapeado. El valor propio es el dato protagonista ahora (ver
// conocimiento.md); la referencia solo se usa para el indicador
// sobre/bajo/en mercado, con un margen de ±5% para no marcar como
// "distinto" una diferencia de un par de pesos.
function myPriceInfo(cardId) {
  const mine = store.getMyPrice(cardId);
  const market = marketRefPrice(cardId);
  let status = "sin-valor";
  let diffPct = null;
  if (mine != null && market != null) {
    diffPct = (mine - market) / market;
    status = diffPct > 0.05 ? "sobre" : diffPct < -0.05 ? "bajo" : "en";
  } else if (mine != null) {
    status = "sin-mercado";
  }
  return { mine, market, diffPct, status };
}

// Lista de cartas ofrecidas para cambio/venta, agrupada en secciones por
// rareza (de más "pro" a más básica, ver RARITY_ORDER) y con un filtro para
// ver solo una rareza a la vez. Cada fila: imagen, cantidad disponible,
// precio referencial (si se encontró en alguna tienda) y los botones
// Intercambiar/Vender.
// Filtros combinables de Cambio y Ventas: rareza (ya existía) + edición,
// raza y tipo (nuevos), todos AND entre sí, más un selector de orden
// (agrupado por rareza — el comportamiento de siempre — o plano por
// nombre/edición/raza/tipo, ascendente o descendente).
const TRADE_FILTERS = [
  ["trade-rarity", "rarity", "Todas las rarezas"],
  ["trade-edition", "editionName", "Todas las ediciones"],
  ["trade-race", "race", "Todas las razas"],
  ["trade-type", "type", "Todos los tipos"],
];

function renderTradeList() {
  const wrap = $("#trade-list");
  const entries = Object.entries(store.getTradeList());
  renderTradeStats(entries);
  wrap.className = "trade-list";
  if (!entries.length) {
    wrap.innerHTML = `<p class="muted">Busca arriba una carta que tengas repetida y ofrécela; también puedes hacerlo desde el detalle de cualquier carta.</p>`;
    for (const [id, field, label] of TRADE_FILTERS) updateTradeFilterSelect(id, field, label, []);
    return;
  }
  // El buscador de la barra superior filtra qué tarjetas se muestran acá
  // (mismo criterio que ya usan Mazos y Colecciones); el resumen y el valor
  // potencial de arriba siguen calculándose sobre TODO lo ofrecido, no solo
  // lo que calza con la búsqueda.
  const query = normText($("#search").value.trim());
  const orphanIds = [];
  const offeredCards = [];
  for (const [id] of entries) {
    const c = cardById(id);
    if (!c) { orphanIds.push(id); continue; } // ya no está en el catálogo: no se puede mostrar como fila
    if (query && !c.searchText.includes(query)) continue;
    offeredCards.push(c);
  }
  // Cada selector se arma con lo ofrecido ANTES de aplicar los filtros
  // (mismo criterio que las píldoras de inventario del Catálogo, ver
  // baseFilteredCards): así ninguno se autorrestringe con los demás.
  for (const [id, field, label] of TRADE_FILTERS) updateTradeFilterSelect(id, field, label, offeredCards);
  let shownCards = offeredCards;
  const activeFilters = [];
  for (const [id, field] of TRADE_FILTERS) {
    const sel = $("#" + id);
    const val = sel ? sel.value : "";
    if (val) {
      shownCards = field === "type"
        ? shownCards.filter((c) => looseEq(c.type, val))
        : shownCards.filter((c) => (c[field] || "—") === val);
      activeFilters.push(true);
    }
  }
  const valueFilter = $("#trade-value-filter") ? $("#trade-value-filter").value : "";
  if (valueFilter === "sin-valor") { shownCards = shownCards.filter((c) => store.getMyPrice(c.id) == null); activeFilters.push(true); }
  else if (valueFilter === "con-valor") { shownCards = shownCards.filter((c) => store.getMyPrice(c.id) != null); activeFilters.push(true); }

  wrap.innerHTML = "";
  if (!shownCards.length && !orphanIds.length) {
    wrap.innerHTML = `<p class="muted">Ninguna carta ofrecida coincide con ${activeFilters.length ? "esos filtros" : "la búsqueda de la barra superior"}.</p>`;
    return;
  }

  const sortMode = $("#trade-sort") ? $("#trade-sort").value : "number";
  let navList;
  if (sortMode.startsWith("rarity")) {
    const byRarity = new Map();
    for (const c of shownCards) {
      const key = c.rarity || "—";
      if (!byRarity.has(key)) byRarity.set(key, []);
      byRarity.get(key).push(c);
    }
    const rarityKeys = [...byRarity.keys()].sort(sortMode === "rarity_asc" ? (a, b) => rarityCompare(b, a) : rarityCompare);
    const groups = rarityKeys.map((rarity) => ({ rarity, cards: byRarity.get(rarity).sort((a, b) => displayName(a).localeCompare(displayName(b), "es")) }));
    navList = groups.flatMap((g) => g.cards);
    for (const g of groups) {
      const title = document.createElement("h4");
      title.className = "trade-rarity-title";
      title.textContent = g.rarity;
      wrap.appendChild(title);
      for (const c of g.cards) wrap.appendChild(tradeCardEl(c, navList));
    }
  } else {
    navList = [...shownCards].sort(tradeSortComparator(sortMode));
    for (const c of navList) wrap.appendChild(tradeCardEl(c, navList));
  }
  if (orphanIds.length) {
    const note = document.createElement("p");
    note.className = "muted";
    note.textContent = `${orphanIds.length} carta(s) ofrecida(s) ya no están en el catálogo (id: ${orphanIds.join(", ")}).`;
    wrap.appendChild(note);
  }
}

function tradeSortComparator(mode) {
  const field = mode.replace(/_desc$/, "");
  const desc = mode.endsWith("_desc");
  if (field === "number") {
    const cmp0 = (a, b) => cardNum(a) - cardNum(b) || editionOrd(a) - editionOrd(b) || displayName(a).localeCompare(displayName(b), "es");
    return (a, b) => { const cmp = cmp0(a, b); return desc ? -cmp : cmp; };
  }
  if (field === "value") {
    // Sin valor asignado se trata como el más bajo (aparece al final al
    // ordenar de más cara a más barata, y primero al ordenar al revés).
    return (a, b) => {
      const va = store.getMyPrice(a.id) ?? -1;
      const vb = store.getMyPrice(b.id) ?? -1;
      const cmp = va - vb || displayName(a).localeCompare(displayName(b), "es");
      return desc ? -cmp : cmp;
    };
  }
  const key = field === "name" ? (c) => displayName(c) : field === "edition" ? (c) => c.editionName || "" : (c) => c[field] || "";
  return (a, b) => {
    const cmp = key(a).localeCompare(key(b), "es") || displayName(a).localeCompare(displayName(b), "es");
    return desc ? -cmp : cmp;
  };
}

// Opciones de un filtro de Cambio y Ventas: solo los valores que hay entre
// lo ofrecido (no todo el catálogo), en orden alfabético (la rareza usa
// rarityCompare, igual que las secciones). Conserva la selección previa si
// sigue entre las opciones disponibles.
function updateTradeFilterSelect(id, field, allLabel, offeredCards) {
  const sel = $("#" + id);
  if (!sel) return;
  const prev = sel.value;
  // El campo "type" agrupa variantes con/sin tilde (ver groupedUnique) —
  // mismo bug real que el filtro Tipo del Catálogo, con datos legacy de
  // cartas manuales viejas.
  const values = field === "type"
    ? groupedUnique(offeredCards.map((c) => c.type))
    : [...new Set(offeredCards.map((c) => c[field] || "—"))];
  values.sort(field === "rarity" ? rarityCompare : (a, b) => a.localeCompare(b, "es"));
  sel.innerHTML = `<option value="">${escapeHtml(allLabel)}</option>` +
    values.map((v) => `<option value="${escapeAttr(v)}">${escapeHtml(v)}</option>`).join("");
  sel.value = values.includes(prev) ? prev : "";
}

// Barra de estadísticas de Cambio y Ventas (arriba de la lista, mismo
// componente .stats-grid/.stat-card que usa la vista Estadísticas): cartas
// ofrecidas, valor potencial de venta, cambios hechos y vendido este año.
// Reemplaza al viejo <aside> con texto explicativo + resumen en prosa.
function renderTradeStats(entries) {
  const el = $("#trade-stats");
  if (!el) return;
  const copies = entries.reduce((a, [, n]) => a + n, 0);
  const offeredCard = entries.length
    ? statCard(copies, `${entries.length} carta${entries.length === 1 ? "" : "s"} distinta${entries.length === 1 ? "" : "s"}`)
    : statCard(0, "Sin cartas ofrecidas");

  let total = 0, ownValuedCopies = 0, refValuedCopies = 0, unpricedCopies = 0;
  for (const [id, qty] of entries) {
    const mine = store.getMyPrice(id);
    const unit = mine != null ? mine : marketRefPrice(id);
    if (unit != null) { total += unit * qty; if (mine != null) ownValuedCopies += qty; else refValuedCopies += qty; }
    else unpricedCopies += qty;
  }
  const pricedCopies = ownValuedCopies + refValuedCopies;
  const valueLbl = pricedCopies
    ? `${pricedCopies} copia${pricedCopies === 1 ? "" : "s"} con valor${unpricedCopies ? ` · ${unpricedCopies} sin valor` : ""}`
    : "Sin valores asignados";
  const valueCard = statCard(pricedCopies ? fmtCLP(total) : "—", valueLbl);

  const tradeLog = store.getTradeLog();
  const tradeLbl = tradeLog.length ? `Último: ${new Date(tradeLog[0].date).toLocaleDateString("es-CL")}` : "Sin registros";
  const tradeCard = statCard(tradeLog.length, tradeLbl);

  const thisYear = new Date().getFullYear();
  const salesThisYear = store.getSaleLog().filter((e) => new Date(e.date).getFullYear() === thisYear);
  const soldThisYear = salesThisYear.reduce((a, e) => a + (e.price || 0), 0);
  const soldLbl = `${salesThisYear.length} venta${salesThisYear.length === 1 ? "" : "s"} este año`;
  const soldCard = statCard(fmtCLP(soldThisYear), soldLbl);

  el.innerHTML = offeredCard + valueCard + tradeCard + soldCard;
}

// Fila individual de la lista de cambio/venta — miniatura + nombre a la
// izquierda, cantidad ofrecida al centro, "Mi valor" + indicador de mercado
// y los botones Intercambiar/Vender a la derecha (formato lista, no grilla
// de tarjetas — inspirado en la vista de mercado que mandó el dueño).
// navList: ver cardEl().
function tradeCardEl(card, navList) {
  const b = tradeBreakdown(card.id);
  const { offered, owned, paraCambio: available } = b;
  const el = document.createElement("div");
  el.className = "trade-row";
  el.dataset.id = card.id;

  const dName = displayName(card);
  const num = cardNum(card);
  const img = card.image
    ? `<img loading="lazy" src="${escapeAttr(card.image)}" alt="${escapeAttr(dName)}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'placeholder',innerHTML:'<div class=ph-name>${escapeAttr(dName)}</div>'}))" />`
    : `<div class="placeholder"><div class="ph-name">${escapeHtml(dName)}</div></div>`;

  const valueHtml = myValueSectionHtml(card.id);

  el.innerHTML = `
    <div class="tr-thumb" data-act="detail">
      ${card.cost != null ? `<span class="badge-cost">${card.cost}</span>` : ""}
      ${card.strength != null ? `<span class="badge-str">${card.strength}</span>` : ""}
      ${card.specialId ? `<span class="badge-num special">${escapeHtml(card.specialId)}</span>` : Number.isFinite(num) ? `<span class="badge-num">#${num}</span>` : ""}
      ${img}
    </div>
    <div class="tr-main" data-act="detail">
      <div class="tr-name">${escapeHtml(dName)}</div>
      <div class="tr-meta">${escapeHtml(card.editionName || "")}</div>
      <div class="trade-avail-note${offered > available ? "" : " ok"}">Colección: ${b.coleccion} · Disponible: <b>${available}</b> · En mazo: ${b.enMazo}</div>
    </div>
    <div class="tr-qty qty-row">
      <button class="qty-btn" data-tr="minus">−</button>
      <input type="number" min="0" max="${owned}" class="qty-num-input" data-role="tqty" value="${offered}" />
      <button class="qty-btn" data-tr="plus" ${offered >= owned ? "disabled" : ""}>+</button>
      <span class="muted trade-qty-label">ofrecidas</span>
    </div>
    <div class="tr-value">${valueHtml}</div>
    <div class="tr-actions trade-actions">
      <button class="btn small" data-exchange ${available < 1 ? "disabled" : ""}>Intercambiar</button>
      <button class="btn small" data-sell ${available < 1 ? "disabled" : ""}>Vender</button>
    </div>`;

  el.querySelector('[data-tr="minus"]').onclick = () => { store.addTradeQty(card.id, -1); renderTradeList(); };
  el.querySelector('[data-tr="plus"]').onclick = () => { store.addTradeQty(card.id, 1); renderTradeList(); };
  el.querySelector('[data-role="tqty"]').addEventListener("change", (e) => {
    store.setTradeQty(card.id, Number(e.target.value));
    renderTradeList();
  });
  el.querySelector("[data-exchange]").onclick = () => openTradeModal(card);
  el.querySelector("[data-sell]").onclick = () => openSellModal(card);
  el.querySelector('[data-role="myvalue"]').addEventListener("change", (e) => {
    const raw = e.target.value.trim();
    const value = raw ? Number(raw) : null;
    if (raw && !Number.isFinite(value)) { showToast("Valor inválido.", 2500); return; }
    store.setMyPrice(card.id, value);
    renderTradeList();
  });
  el.querySelectorAll('[data-act="detail"]').forEach((n) => { n.onclick = () => openModal(card, navList); });
  return el;
}

// Sección "Mi valor" de una tarjeta de Cambio y Ventas: el precio que el
// dueño le asignó (protagonista) + una píldora sobre/bajo/en línea con el
// precio de referencia scrapeado (data/prices.json), o solo la referencia
// como pista si todavía no le puso valor. Ver myPriceInfo().
function myValueSectionHtml(cardId) {
  const info = myPriceInfo(cardId);
  const mainHtml = `<span class="my-value-prefix">$</span><input type="number" min="0" step="1" class="my-value-input" data-role="myvalue" placeholder="Sin valorar" value="${info.mine != null ? info.mine : ""}" />`;
  let pillHtml = "";
  if (info.status === "sobre") pillHtml = `<span class="market-pill over">▲ Sobre mercado (${Math.round(info.diffPct * 100)}%)</span>`;
  else if (info.status === "bajo") pillHtml = `<span class="market-pill under">▼ Bajo mercado (${Math.round(info.diffPct * 100)}%)</span>`;
  else if (info.status === "en") pillHtml = `<span class="market-pill even">≈ En línea con el mercado</span>`;
  else if (info.status === "sin-mercado") pillHtml = `<span class="market-pill none">Sin referencia de mercado</span>`;
  else if (info.market != null) pillHtml = `<span class="market-pill none">Referencia: ${fmtCLP(info.market)}</span>`;
  return `<div class="my-value-row"><div class="my-value-main">${mainHtml}</div>${pillHtml}</div>`;
}

function renderTradeLog() {
  const wrap = $("#trade-log");
  const log = store.getTradeLog();
  if (!log.length) { wrap.innerHTML = `<p class="muted">Todavía no registras intercambios.</p>`; return; }
  wrap.innerHTML = log.map((e) => {
    const g = cardById(e.given), r = cardById(e.received);
    return `<div class="tlog-row">
      <span class="muted">${new Date(e.date).toLocaleString("es-CL")}</span>
      <span>Entregada: <b>${escapeHtml(g ? displayName(g) : e.given)}</b></span>
      <span>Recibida: <b>${escapeHtml(r ? displayName(r) : e.received)}</b></span>
    </div>`;
  }).join("");
}

function renderSaleLog() {
  const wrap = $("#sale-log");
  if (!wrap) return;
  const log = store.getSaleLog();
  if (!log.length) { wrap.innerHTML = `<p class="muted">Todavía no registras ventas.</p>`; return; }
  wrap.innerHTML = log.map((e) => {
    const c = cardById(e.cardId);
    return `<div class="tlog-row">
      <span class="muted">${new Date(e.date).toLocaleString("es-CL")}</span>
      <span>Vendida: <b>${escapeHtml(c ? displayName(c) : e.cardId)}</b> ×${e.qty}</span>
      <span>${e.price != null ? fmtCLP(e.price) : "sin precio registrado"}</span>
    </div>`;
  }).join("");
}

// Buscador de la vista: solo cartas con copias en el inventario (para ofrecerlas)
function renderTradeSearchResults() {
  const q = normText($("#trade-search").value.trim());
  const res = $("#trade-search-results");
  if (q.length < 2) { res.innerHTML = ""; return; }
  const matches = state.cards.filter((c) => store.getQty(c.id) > 0 && c.searchText.includes(q)).slice(0, 30);
  res.innerHTML = matches.map((c) => `
    <div class="dsr" data-id="${escapeAttr(c.id)}">
      <span class="dsr-name">${escapeHtml(displayName(c))}</span>
      <span class="dsr-meta">${escapeHtml(c.editionName || "")} · tienes ${store.getQty(c.id)} · en cambio ${store.getTradeQty(c.id)}</span>
      <button class="btn small" data-offer>Ofrecer copia</button>
    </div>`).join("") || `<p class="muted">Sin resultados (solo se listan cartas con copias en tu inventario).</p>`;
  res.querySelectorAll(".dsr").forEach((row) => {
    row.querySelector("[data-offer]").onclick = () => {
      const before = store.getTradeQty(row.dataset.id);
      const after = store.addTradeQty(row.dataset.id, 1);
      if (after === before) showToast("Ya ofreces todas las copias que tienes de esa carta", 3000);
      renderTradeList();
      renderTradeSearchResults(); // refresca los contadores de la fila
    };
  });
}

/* --- Modal para registrar el intercambio --- */
let tradeGivenCard = null; // carta que se entrega en el intercambio en curso

function openTradeModal(card) {
  tradeGivenCard = card;
  $("#tm-given").textContent = `«${displayName(card)}» (${card.editionName || "—"})`;
  $("#tm-search").value = "";
  $("#tm-results").innerHTML = "";
  $("#trade-modal").classList.remove("hidden");
  $("#tm-search").focus();
}
function closeTradeModal() {
  $("#trade-modal").classList.add("hidden");
  tradeGivenCard = null;
}
function renderTradeModalResults() {
  const q = normText($("#tm-search").value.trim());
  const res = $("#tm-results");
  if (q.length < 2) { res.innerHTML = ""; return; }
  const matches = state.cards.filter((c) => c.searchText.includes(q)).slice(0, 30);
  res.innerHTML = matches.map((c) => `
    <div class="dsr" data-id="${escapeAttr(c.id)}">
      <span class="dsr-name">${escapeHtml(displayName(c))}</span>
      <span class="dsr-meta">${escapeHtml(c.editionName || "")}${Number.isFinite(cardNum(c)) ? " · #" + cardNum(c) : ""}</span>
      <button class="btn small" data-receive>Esta recibí</button>
    </div>`).join("") || `<p class="muted">Sin resultados.</p>`;
  res.querySelectorAll(".dsr").forEach((row) => {
    row.querySelector("[data-receive]").onclick = () => {
      const received = cardById(row.dataset.id);
      if (received && tradeGivenCard) executeTrade(tradeGivenCard, received);
    };
  });
}

// Ejecuta el intercambio: ajusta inventario, colección automática e historial
function executeTrade(given, received) {
  if (store.getAvailableQty(given.id) < 1) { showToast("Esta carta ya no está disponible (sin copias, o comprometida en un mazo)", 3200); return; }
  if (!confirm(`¿Registrar este intercambio?\n\nEntregas: ${displayName(given)}\nRecibes: ${displayName(received)}`)) return;
  // addQty ya descuenta lo disponible por la misma cantidad (protege la
  // copia de colección) — ver autoAdjustTradeOnQtyChange en store.js.
  store.addQty(given.id, -1);      // la copia entregada sale del inventario
  store.addQty(received.id, +1);   // la recibida entra al inventario (y suma a disponible si ya tenías más)
  // Colección automática: la carta recibida debe quedar dentro de alguna
  // colección que incluya su edición (una colección puede agrupar varias,
  // ver arriba); si ninguna la incluye, se crea una nueva de esa sola
  // edición en este momento.
  let col = store.getCollections().find((c) => c.editions.includes(received.edition));
  let created = false;
  if (!col) {
    const name = state.editionName[received.edition] || received.editionName || received.edition || "Colección";
    col = store.createCollection(name, [received.edition]);
    created = true;
  }
  store.addTradeLogEntry({ given: given.id, received: received.id });
  closeTradeModal();
  renderTradeView();
  showToast(
    `Cambio registrado: entregaste «${displayName(given)}» y recibiste «${displayName(received)}», ` +
    `sumada a la colección «${col.name}»${created ? " (creada automáticamente)" : ""}.`, 5500);
}

/* --- Modal para registrar una venta --- */
let sellCard = null; // carta que se está vendiendo en el modal en curso

function openSellModal(card) {
  sellCard = card;
  const available = store.getAvailableQty(card.id);
  $("#sm-card").textContent = `«${displayName(card)}» (${card.editionName || "—"})`;
  const qtyInput = $("#sm-qty");
  qtyInput.value = 1;
  qtyInput.min = 1;
  qtyInput.max = available;
  const suggested = store.getMyPrice(card.id) ?? marketRefPrice(card.id);
  $("#sm-price").value = suggested != null ? suggested : "";
  $("#sell-modal").classList.remove("hidden");
  qtyInput.focus();
}
function closeSellModal() {
  $("#sell-modal").classList.add("hidden");
  sellCard = null;
}
// Ejecuta la venta: descuenta inventario y copias ofrecidas, deja registro
// en el historial de ventas (con precio si se ingresó uno).
function executeSale() {
  if (!sellCard) return;
  const available = store.getAvailableQty(sellCard.id);
  if (available < 1) { showToast("Esta carta ya no está disponible (sin copias, o comprometida en un mazo)", 3200); return; }
  let qty = parseInt($("#sm-qty").value, 10);
  if (!Number.isFinite(qty) || qty < 1) qty = 1;
  qty = Math.min(qty, available);
  const priceRaw = $("#sm-price").value.trim();
  const price = priceRaw ? Number(priceRaw) : null;
  const priceTxt = price != null && Number.isFinite(price) ? ` por ${fmtCLP(price)}` : "";
  const name = displayName(sellCard); // capturado antes de closeSellModal() (pone sellCard en null)
  if (!confirm(`¿Registrar venta de ${qty} copia${qty === 1 ? "" : "s"} de «${name}»${priceTxt}?`)) return;
  // addQty ya descuenta lo disponible por la misma cantidad — ver
  // autoAdjustTradeOnQtyChange en store.js.
  store.addQty(sellCard.id, -qty);
  store.addSaleLogEntry({ cardId: sellCard.id, qty, price: Number.isFinite(price) ? price : null });
  closeSellModal();
  renderTradeView();
  showToast(`Venta registrada: ${qty} copia${qty === 1 ? "" : "s"} de «${name}»${priceTxt}.`, 4500);
}

function bindTradeEvents() {
  for (const [id] of TRADE_FILTERS) $("#" + id).addEventListener("change", renderTradeList);
  $("#trade-value-filter").addEventListener("change", renderTradeList);
  $("#trade-sort").addEventListener("change", renderTradeList);
  $("#trade-search").addEventListener("input", debounce(renderTradeSearchResults, 180));
  $("#tm-search").addEventListener("input", debounce(renderTradeModalResults, 180));
  $$("[data-close-trade]").forEach((el) => el.addEventListener("click", closeTradeModal));
  $("#trade-modal").addEventListener("click", (e) => {
    if (e.target.classList.contains("modal-backdrop")) closeTradeModal();
  });
  $$("[data-close-sell]").forEach((el) => el.addEventListener("click", closeSellModal));
  $("#sell-modal").addEventListener("click", (e) => {
    if (e.target.classList.contains("modal-backdrop")) closeSellModal();
  });
  $("#sm-confirm").addEventListener("click", executeSale);
}

// Reglas generales de construcción de mazo (fuente: cartasmitosyleyendasoficial.
// wordpress.com/reglas-de-mitos-y-leyendas — 50 cartas, 3 copias por nombre) y
// del formato Racial Edición (mínimo de Aliados, ver blog.myl.cl/ban-list-
// primera-era-formato-racial-edicion). Compartidas entre la pestaña Cartas
// (espacios de carta faltante) y Estrategia (texto del diagnóstico).
const MYL_DECK_SIZE = 50;
const RACIAL_MIN_ALLIES = 16;

/* ===================== Ban List (Primera Era — Racial Edición) =====================
   Fuente: data/banlist.json (scraper/scrape-banlist.js, se re-scrapea solo
   cada semana junto al catálogo — ver .github/workflows/scrape-data.yml).
   Es un aviso INFORMATIVO sobre UN formato específico (Racial Edición), no
   una validación de legalidad general: un mazo pensado para otro formato
   puede mostrar el aviso igual y no aplica.
   Matching por NOMBRE solamente (no por edición): la propia página agrupa
   las cartas por "edición que da soporte a esa raza", que no siempre
   coincide con la edición real en la que TOR tiene catalogada la carta
   (ej. "Grifo"/"Trauko" están bajo la columna Ira del Nahual en la ban list
   pero en el catálogo están cargados como de El Reto) — intentarlo por
   edición dejaba ~35% de las cartas sin poder verificarse. Por nombre solo
   se resuelve un ~96%; el resto son 3 erratas de tipeo del blog (ver
   BANLIST_NAME_ALIASES). */
const BANLIST_NAME_ALIASES = {
  "niahm": "niamh",              // blog.myl.cl: "Niahm" — catálogo (TOR): "Niamh"
  "anima negra": "nima negra",   // blog.myl.cl: "Anima Negra" — catálogo: "Nima Negra"
  "zhang guo la": "zhang guo lao", // blog.myl.cl: "Zhang Guo La" — catálogo: "Zhang Guo Lao"
};
function banlistNormName(s) {
  const n = normText(s).replace(/[^a-z0-9]+/g, " ").trim();
  return BANLIST_NAME_ALIASES[n] || n;
}
let banlistByName = null;
function getBanlistEntry(card) {
  if (!state.banlist || !card) return null;
  if (!banlistByName) {
    banlistByName = new Map();
    for (const e of state.banlist.entries) banlistByName.set(banlistNormName(e.name), e);
  }
  return banlistByName.get(banlistNormName(card.name)) || null;
}
// Aviso en texto plano para una fila del mazo, o "" si no aplica.
function banlistWarning(card, qtyInDeck) {
  const e = getBanlistEntry(card);
  if (!e) return "";
  if (e.status === "banned") return `Prohibida en Racial Edición (ban list ${state.banlist.meta.updateLabel || ""})`;
  if (qtyInDeck > e.maxCopies) return `Máx. ${e.maxCopies} copia${e.maxCopies === 1 ? "" : "s"} en Racial Edición, tienes ${qtyInDeck} (ban list ${state.banlist.meta.updateLabel || ""})`;
  return "";
}

/* ===================== Mazos ===================== */
// Tab activa dentro del detalle de un mazo (Cartas/Estadística/Estrategia/
// Distribución) — un solo valor global, no por mazo: cambiar de mazo
// mantiene la misma tab que se estaba mirando.
let deckTab = "cartas";
function switchDeckTab(tab) {
  deckTab = tab;
  $$("#deck-detail [data-deck-tab]").forEach((b) => b.classList.toggle("active", b.dataset.deckTab === tab));
  $$("#deck-detail .deck-tab-panel").forEach((p) => p.classList.toggle("hidden", p.id !== `deck-tab-${tab}`));
}

// Estado de una fila de "Mis mazos": en borrador (menos de MYL_DECK_SIZE
// cartas en total), faltan N copias (completo en cantidad pero sin todas
// las copias en tu colección), o completo.
function deckStatusInfo(deck) {
  const total = store.deckCount(deck.id);
  if (total < MYL_DECK_SIZE) return { cls: "", icon: "ph-warning-circle", text: "en borrador" };
  const missing = computeDeckStrategy(deck).missingCopies;
  if (missing > 0) return { cls: "", icon: "ph-warning-circle", text: `faltan ${missing} copia${missing === 1 ? "" : "s"}` };
  return { cls: "complete", icon: "ph-check-circle", text: "completo" };
}

function renderDecksView() {
  const list = $("#deck-list");
  const decks = store.getDecks();
  list.innerHTML = "";
  const activeId = store.getSetting("activeDeckId");
  const countEl = $("#deck-list-count");
  if (countEl) countEl.textContent = decks.length || "";
  if (decks.length === 0) {
    list.innerHTML = `<p class="muted">Aún no tienes mazos.</p>`;
  }
  for (const d of decks) {
    const row = document.createElement("div");
    row.className = "deck-item" + (d.id === activeId ? " active" : "");
    row.dataset.deckId = d.id;
    const st = deckStatusInfo(d);
    row.innerHTML = `
      <div class="deck-item-top">
        <span class="d-name">${escapeHtml(d.name)}</span>
        <span class="d-count">${store.deckCount(d.id)}</span>
        <button class="d-del" data-del title="Eliminar"><i class="ph ph-trash"></i></button>
      </div>
      <div class="deck-item-status ${st.cls}"><i class="ph ${st.icon}"></i> ${escapeHtml(st.text)}</div>`;
    row.addEventListener("click", (e) => {
      if (e.target.closest("[data-del]")) return;
      store.setSetting("activeDeckId", d.id);
      renderDecksView();
    });
    row.querySelector("[data-del]").onclick = (e) => {
      e.stopPropagation();
      if (confirm(`¿Eliminar el mazo «${d.name}»?`)) {
        store.deleteDeck(d.id);
        if (activeId === d.id) store.setSetting("activeDeckId", null);
        renderDecksView();
      }
    };
    list.appendChild(row);
  }
  refreshActiveDeckUI();
  renderDeckDetail();
}

// Formato predominante entre las cartas del mazo (los mazos no guardan un
// campo de formato propio — se infiere de sus cartas, igual que la barra de
// disponibilidad ya usa card.format para otras cosas).
function deckFormat(deck) {
  const counts = {};
  for (const cid of Object.keys(deck.cards)) {
    const card = state.cards.find((c) => c.id === cid);
    if (card?.format) counts[card.format] = (counts[card.format] || 0) + 1;
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top ? FMT_NAMES[top[0]] || top[0] : null;
}

// Las 4 cifras de la fila de KPI de arriba (ver computeDeckStrategy para
// missingCopies/avgCost, que ya se calculaban para la pestaña Estadística).
function computeDeckKpis(deck) {
  const strat = computeDeckStrategy(deck);
  const total = strat.total;
  const armed = total - strat.missingCopies;
  const armedPct = total ? Math.round((armed / total) * 100) : 0;
  const aliados = strat.byType["Aliado"] || 0;
  const talismanesArmas = (strat.byType["Talismán"] || 0) + (strat.byType["Arma"] || 0) + (strat.byType["Tótem"] || 0);
  const orosMonumentos = (strat.byType["Oro"] || 0) + (strat.byType["Monumento"] || 0);
  let missingCards = 0, missingInRepeats = 0;
  for (const [cid, q] of Object.entries(deck.cards)) {
    const own = store.getQty(cid);
    if (own < q) {
      missingCards++;
      // Cuánto de lo que falta se podría cubrir con copias de esa misma
      // carta que ya marcaste para cambio (en vez de comprar/conseguir más).
      missingInRepeats += Math.min(q - own, store.getTradeQty(cid));
    }
  }
  return { total, armed, armedPct, aliados, talismanesArmas, orosMonumentos, missingCards, missingInRepeats, missingCopies: strat.missingCopies, avgCost: strat.avgCost, allyTotal: strat.allyTotal };
}
function renderDeckKpis(deck) {
  const box = $("#deck-kpis-top");
  if (!box) return;
  const k = computeDeckKpis(deck);
  box.innerHTML = [
    statCard3("Cartas del mazo", k.total, `${k.aliados} aliados · ${k.talismanesArmas} talismanes · ${k.orosMonumentos} oros`),
    statCard3("Armado", `${k.armed}<span class="num-of">/${k.total}</span>`, `${k.armedPct}% con lo que tienes`),
    statCard3("Te faltan", `${k.missingCopies} copia${k.missingCopies === 1 ? "" : "s"}`,
      k.missingCopies ? `de ${k.missingCards} carta${k.missingCards === 1 ? "" : "s"}${k.missingInRepeats ? ` · ${k.missingInRepeats} en tus repetidas` : ""}` : "tienes todas las copias",
      k.missingCopies ? "highlight" : ""),
    statCard3("Coste medio", k.allyTotal ? k.avgCost.toFixed(1) : "—", "de tus Aliados"),
  ].join("");
}

function renderDeckDetail() {
  const wrap = $("#deck-detail");
  const deck = store.getDeck(store.getSetting("activeDeckId"));
  if (!deck) {
    wrap.innerHTML = `<p class="muted">Selecciona o crea un mazo para empezar a construirlo. Desde la vista <b>Colección</b> puedes añadir cartas al mazo activo con el botón “+” de la tarjeta, o buscarlas aquí abajo.</p>`;
    return;
  }
  const fmt = deckFormat(deck);
  const createdLbl = deck.createdAt ? `Creado en ${new Date(deck.createdAt).toLocaleDateString("es-CL", { month: "long" })}` : null;
  const updatedLbl = deck.updatedAt ? `última vez editado ${relTime(deck.updatedAt)}` : null;
  wrap.innerHTML = `
    <div class="deck-kicker-line">${fmt ? escapeHtml(fmt) + " · " : ""}${store.deckCount(deck.id)} CARTAS</div>
    <div style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap">
      <div style="flex:1;min-width:200px">
        <h2><input id="deck-name" class="deck-title-input" value="${escapeAttr(deck.name)}" /></h2>
        <div class="deck-context-line">${[createdLbl, updatedLbl].filter(Boolean).join(" · ") || "—"} ${deckStatusBadgeHtml(deck)}</div>
      </div>
      <div class="actions">
        <div class="dropdown" id="deck-export-dropdown">
          <button class="btn" id="deck-export-btn"><i class="ph ph-export"></i> Exportar</button>
          <div class="dropdown-menu">
            <button id="deck-xlsx"><i class="ph ph-file-xls"></i> Excel</button>
            <button id="deck-img"><i class="ph ph-image"></i> Imagen</button>
            <button id="deck-txt"><i class="ph ph-text-align-left"></i> Texto</button>
          </div>
        </div>
        <button class="btn primary" id="deck-add-cards"><i class="ph ph-magnifying-glass"></i> Añadir cartas</button>
      </div>
    </div>
    <p class="muted deck-status-note">${deck.status === "secundario"
      ? "Mazo Secundario: es un plan/experimento — no reserva copias de tus cartas ni compite con tus otros mazos."
      : "Mazo Principal: compite por copias con tus otros mazos Principal (si comparten una carta, la disponibilidad se reparte entre ellos)."}</p>

    <div id="deck-kpis-top" class="stats-grid cols-4"></div>

    <div class="tabs deck-tabs">
      <button class="tab" data-deck-tab="cartas"><i class="ph ph-cards"></i> Cartas</button>
      <button class="tab" data-deck-tab="estadistica"><i class="ph ph-chart-bar"></i> Estadística</button>
      <button class="tab" data-deck-tab="estrategia"><i class="ph ph-brain"></i> Estrategia</button>
    </div>
    <div id="deck-tab-cartas" class="deck-tab-panel">
      <div id="deck-banner"></div>
      <div class="deck-add-search">
        <input id="deck-search" type="search" placeholder="Buscar carta por nombre para añadir a este mazo…" autocomplete="off" />
        <div id="deck-search-results" class="deck-search-results"></div>
      </div>
      <label class="field inline deck-sort-field">
        <span>Ordenar cartas por</span>
        <select id="deck-sort">
          <option value="number">Número (ascendente)</option>
          <option value="number_desc">Número (descendente)</option>
          <option value="name">Nombre (A→Z)</option>
          <option value="name_desc">Nombre (Z→A)</option>
          <option value="rarity_desc">Rareza (más pro primero)</option>
          <option value="rarity_asc">Rareza (más básica primero)</option>
        </select>
      </label>
      <div id="deck-contents"></div>
    </div>
    <div id="deck-tab-estadistica" class="deck-tab-panel">
      <div id="deck-summary" class="deck-summary"></div>
    </div>
    <div id="deck-tab-estrategia" class="deck-tab-panel">
      <div id="deck-strategy"></div>
    </div>`;

  $$("#deck-detail [data-deck-tab]").forEach((b) => (b.onclick = () => switchDeckTab(b.dataset.deckTab)));
  switchDeckTab(deckTab);

  $("#deck-name").onchange = (e) => { store.renameDeck(deck.id, e.target.value || "Mazo"); populateActiveDeckSelect(); updateDeckCounts(); };
  $("#deck-sort").value = store.getSetting("deckSort") || "number";
  $("#deck-sort").onchange = (e) => { store.setSetting("deckSort", e.target.value); renderDeckContents(deck); };
  wrap.querySelector("[data-status]").onclick = () => {
    store.setDeckStatus(deck.id, deck.status === "principal" ? "secundario" : "principal");
    renderDecksView(); // recalcula disponibilidad en este mazo y en los que compartan cartas
  };
  const exportDd = $("#deck-export-dropdown");
  $("#deck-export-btn").onclick = () => exportDd.classList.toggle("open");
  $("#deck-txt").onclick = () => { exportDd.classList.remove("open"); exportDeck(deck); };
  $("#deck-xlsx").onclick = () => {
    exportDd.classList.remove("open");
    showToast("Generando Excel…", 4000);
    exportDeckExcel(deck, state.cards, store.getQty, displayName)
      .then(() => showToast("Excel descargado ✓")).catch((e) => showToast("Error: " + e.message, 4000));
  };
  $("#deck-img").onclick = () => {
    exportDd.classList.remove("open");
    showToast("Generando imagen…", 4000);
    exportDeckImage(deck, state.cards, store.getQty, displayName)
      .then(() => showToast("Imagen descargada ✓")).catch((e) => showToast("Error: " + e.message, 4000));
  };
  $("#deck-add-cards").onclick = () => { switchDeckTab("cartas"); $("#deck-search")?.focus(); };

  renderDeckKpis(deck);

  const di = $("#deck-search");
  di.oninput = debounce(() => {
    const q = normText(di.value.trim());
    const res = $("#deck-search-results");
    if (q.length < 2) { res.innerHTML = ""; return; }
    const matches = state.cards.filter((c) => c.searchText.includes(q)).slice(0, 30);
    res.innerHTML = matches.map((c) => {
      const own = store.getQty(c.id);
      return `<div class="dsr" data-id="${escapeAttr(c.id)}">
        <span class="dsr-name">${escapeHtml(displayName(c))}</span>
        <span class="dsr-meta">${escapeHtml(c.editionName || "")} · <span class="${own > 0 ? "owned-tag" : ""}">tengo ${own}</span></span>
        <button class="qty-btn" data-add title="Añadir al mazo"><i class="ph ph-plus"></i></button>
      </div>`;
    }).join("") || `<p class="muted">Sin resultados</p>`;
    res.querySelectorAll(".dsr").forEach((row) => {
      row.querySelector("[data-add]").onclick = () => {
        store.deckAdd(deck.id, row.dataset.id, 1);
        renderDeckContents(deck); updateDeckCounts(); refreshActiveDeckCount();
      };
    });
  }, 180);

  renderDeckContents(deck);
}

// Pestaña "Cartas": el listado de cartas del mazo, pero mostrado como la
// pestaña Distribución que existía antes por separado (imágenes agrupadas
// en zonas) — se fusionaron porque las imágenes se ven mucho mejor que la
// lista de texto plana, sin perder ninguna función (buscador para añadir,
// +/- de cantidad, avisos de ban list y de copias faltantes).
const DECK_ZONE_TITLES = {
  Aliado: "Aliados",
  Apoyo: "Talismanes y armas",
  Oro: "Oros y monumentos",
  Otro: "Otras",
};
const DECK_SUPPORT_TYPES = new Set(["Talismán", "Arma", "Tótem"]);
// Orden de "más pro" a "más básica" acordado con el dueño (24-08-2026): las
// rarezas especiales (no se sacan de sobres) van arriba de todo, con un
// orden fijo entre ellas ya que la app no guarda si una carta es foil/full
// art/normal; luego la escalera normal de sobre, de Secreta a Vasallo (la
// más baja). Cualquier rareza no listada (vacía, "Sin Frecuencia", errores
// de datos) queda al final.
const RARITY_ORDER = [
  "Milenaria", "Set Paralelo", "Promocional", "Ficha",
  "Secreta", "Legendaria", "Ultra Real", "Mega Real", "Real", "Cortesano", "Vasallo",
];
function rarityRankByName(name) {
  const i = RARITY_ORDER.indexOf(name);
  return i === -1 ? RARITY_ORDER.length : i;
}
function rarityRank(card) { return rarityRankByName(card.rarity); }
// Compara dos nombres de rareza según RARITY_ORDER (más "pro" primero),
// con desempate alfabético para las que no están en la lista.
function rarityCompare(a, b) {
  return rarityRankByName(a) - rarityRankByName(b) || a.localeCompare(b, "es");
}
function deckZoneOf(card) {
  if (card.type === "Oro" || card.type === "Monumento") return "Oro";
  if (card.type === "Aliado") return "Aliado";
  return DECK_SUPPORT_TYPES.has(card.type) ? "Apoyo" : "Otro";
}

function renderDeckContents(deck) {
  const cont = $("#deck-contents");
  if (!cont) return;
  const entries = Object.entries(deck.cards);
  const total = entries.reduce((a, [, q]) => a + q, 0);
  const totalEl = $("#deck-total"); if (totalEl) totalEl.textContent = `${total} cartas`;

  // El buscador global filtra qué cartas se muestran; los totales, el
  // resumen y los avisos siguen calculándose sobre el mazo completo.
  const query = normText($("#search").value.trim());

  const groups = { Aliado: [], Apoyo: [], Oro: [], Otro: [] };
  let missing = 0;
  let banIssues = 0;
  let allyTotal = 0;
  for (const [cid, q] of entries) {
    const card = state.cards.find((c) => c.id === cid);
    if (!card) continue;
    const own = store.getQty(cid);
    if (own < q) missing += q - own;
    if (banlistWarning(card, q)) banIssues++;
    if (card.type === "Aliado") allyTotal += q;
    if (query && !card.searchText.includes(query)) continue;
    groups[deckZoneOf(card)].push({ card, cid, q });
  }

  const banner = $("#deck-banner");
  if (banner) {
    let bannerHtml = "";
    if (missing > 0) bannerHtml += `<div class="active-deck-banner">Te faltan <b>${missing}</b> copias de este mazo en tu colección.</div>`;
    if (banIssues > 0) bannerHtml += `<div class="active-deck-banner ban-banner"><i class="ph ph-prohibit"></i> <b>${banIssues}</b> carta${banIssues === 1 ? "" : "s"} de este mazo ${banIssues === 1 ? "tiene un problema" : "tienen problemas"} con la ban list del formato Racial Edición (ver detalle abajo, en rojo).</div>`;
    banner.innerHTML = bannerHtml;
  }

  renderDeckKpis(deck);
  updateActiveDeckListRow(deck);

  if (entries.length === 0) {
    cont.innerHTML = `<p class="muted">Mazo vacío. Busca una carta arriba para añadirla, o usa el botón “+” en la Colección.</p>`;
    state.deckFichaNavList = [];
    renderDeckFicha();
    renderDeckSummary(deck); renderDeckStrategy(deck);
    return;
  }

  let html = "";
  const navList = []; // orden visual de cid, para ← → en la ficha
  for (const key of ["Aliado", "Apoyo", "Oro", "Otro"]) {
    const zoneCards = groups[key];
    // El "espacio de carta" de Aliados faltantes se muestra siempre que el
    // mazo tenga menos del mínimo, incluso si el buscador de arriba está
    // ocultando todas las filas de esa zona (para que no desaparezca).
    const showAllyGap = key === "Aliado" && allyTotal < RACIAL_MIN_ALLIES;
    if (!zoneCards.length && !showAllyGap) continue;
    const zoneQty = zoneCards.reduce((a, x) => a + x.q, 0);
    const sortMode = store.getSetting("deckSort") || "number";
    zoneCards.sort((a, b) => {
      switch (sortMode) {
        case "number": return cardNum(a.card) - cardNum(b.card) || editionOrd(a.card) - editionOrd(b.card) || displayName(a.card).localeCompare(displayName(b.card), "es");
        case "number_desc": return cardNum(b.card) - cardNum(a.card) || editionOrd(a.card) - editionOrd(b.card) || displayName(a.card).localeCompare(displayName(b.card), "es");
        case "name_desc": return displayName(b.card).localeCompare(displayName(a.card), "es");
        case "rarity_desc": return rarityRank(a.card) - rarityRank(b.card) || displayName(a.card).localeCompare(displayName(b.card), "es");
        case "rarity_asc": return rarityRank(b.card) - rarityRank(a.card) || displayName(a.card).localeCompare(displayName(b.card), "es");
        default: return displayName(a.card).localeCompare(displayName(b.card), "es");
      }
    });
    for (const x of zoneCards) navList.push(x.cid);
    html += `<div class="deck-group">
      <div class="deck-group-head"><span class="dgh-name">${escapeHtml(DECK_ZONE_TITLES[key])}</span><span class="dgh-count">${zoneQty} cartas</span><span class="dgh-rule"></span></div>
      <div class="deck-group-grid">${zoneCards.map(({ card, cid, q }) => deckCardRowHtml(card, cid, q, deck)).join("")}`;
    if (showAllyGap) {
      const need = RACIAL_MIN_ALLIES - allyTotal;
      html += deckGapRowHtml(`Faltan ${need} Aliado${need === 1 ? "" : "s"}`, `Mínimo ${RACIAL_MIN_ALLIES} en el formato Racial Edición`);
    }
    html += `</div></div>`;
  }
  if (total < MYL_DECK_SIZE) {
    const need = MYL_DECK_SIZE - total;
    html += `<div class="deck-group">
      <div class="deck-group-head"><span class="dgh-name">Por completar</span><span class="dgh-count">${need} cartas</span><span class="dgh-rule"></span></div>
      <div class="deck-group-grid">${deckGapRowHtml(`Faltan ${need} carta${need === 1 ? "" : "s"}`, `El Mazo Castillo estándar usa ${MYL_DECK_SIZE} — busca arriba para completarlo`)}</div>
    </div>`;
  }
  if (!html) html = `<p class="muted">Ninguna carta del mazo coincide con la búsqueda de la barra superior.</p>`;
  cont.innerHTML = html;
  state.deckFichaNavList = navList;
  cont.querySelectorAll(".deck-card-row[data-cid]").forEach((row) => {
    row.classList.toggle("selected", row.dataset.cid === state.deckSelectedCardId);
    row.addEventListener("click", () => selectDeckCard(row.dataset.cid, navList));
  });
  if (state.deckSelectedCardId && !navList.includes(state.deckSelectedCardId)) {
    state.deckSelectedCardId = null;
  }
  renderDeckFicha();
  renderDeckSummary(deck);
  renderDeckStrategy(deck);
}
// Actualiza solo la fila de este mazo en "Mis mazos" (conteo + estado) sin
// re-renderizar toda la lista — se llama en cada cambio de cantidad para
// que el estado se vea al instante sin perder el scroll de la lista.
function updateActiveDeckListRow(deck) {
  const row = $(`.deck-item[data-deck-id="${escapeAttr(deck.id)}"]`);
  if (!row) return;
  const st = deckStatusInfo(deck);
  const countEl = row.querySelector(".d-count");
  if (countEl) countEl.textContent = store.deckCount(deck.id);
  const statusEl = row.querySelector(".deck-item-status");
  if (statusEl) {
    statusEl.className = `deck-item-status ${st.cls}`;
    statusEl.innerHTML = `<i class="ph ${st.icon}"></i> ${escapeHtml(st.text)}`;
  }
}

// Fila de una carta del mazo (miniatura 26×36 + nombre/metadato + cantidad),
// ver spec de la vista Mazos: un clic selecciona la carta y actualiza la
// ficha fija de la derecha, no abre modal ni suma/resta acá — eso ahora vive
// en el stepper "En este mazo" de la ficha (ver selectDeckCard/renderDeckFicha).
function deckCardRowHtml(card, cid, q, deck) {
  const dName = displayName(card);
  const own = store.getQty(cid);
  const missing = own < q;
  const banWarn = banlistWarning(card, q);
  const img = card.image
    ? `<img loading="lazy" src="${escapeAttr(card.image)}" alt="${escapeAttr(dName)}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'placeholder',innerHTML:''}))" />`
    : `<div class="placeholder"></div>`;
  return `<div class="deck-card-row${missing ? " missing" : ""}${banWarn ? " has-ban" : ""}" data-cid="${escapeAttr(cid)}">
    <div class="dcr-thumb">${img}</div>
    <div class="dcr-main">
      <div class="dcr-name">${escapeHtml(dName)}</div>
      <div class="dcr-meta">×${q} · tienes ${own}</div>
    </div>
    ${banWarn ? `<i class="ph ph-prohibit dcr-warn" title="${escapeAttr(banWarn)}"></i>` : ""}
    <div class="dcr-qty">×${q}</div>
  </div>`;
}

// "Espacio de carta" punteado que marca un hueco del mazo (faltan Aliados
// para el mínimo del formato, o cartas para llegar a las 50).
function deckGapRowHtml(title, sub) {
  return `<div class="deck-gap-row">
    <div class="dcr-thumb"><i class="ph ph-plus"></i></div>
    <div class="dcr-main">
      <div class="dcr-name">${escapeHtml(title)}</div>
      <div class="dcr-meta">${escapeHtml(sub)}</div>
    </div>
  </div>`;
}

function renderDeckSummary(deck) {
  const box = $("#deck-summary");
  if (!box) return;
  const S = deckSummary(deck, state.cards, store.getQty, displayName);
  if (!S.total) { box.innerHTML = `<p class="muted">Mazo vacío — agrega cartas en la pestaña «Cartas» para ver las estadísticas.</p>`; return; }
  const strat = computeDeckStrategy(deck);

  const kpis = [
    statCard(`${strat.total}<span class="num-of">/${MYL_DECK_SIZE}</span>`, "Cartas en el mazo"),
    statCard(`${strat.allyTotal}<span class="num-of">/${RACIAL_MIN_ALLIES}</span>`, "Aliados (mín. Racial Ed.)"),
    statCard(strat.allyTotal ? strat.avgCost.toFixed(1) : "—", "Coste promedio"),
    statCard(strat.raceEntries.length, "Razas distintas"),
    statCard(strat.missingCopies, "Copias faltantes"),
    statCard(strat.banIssues.length, "Avisos de ban list"),
  ].join("");

  const head = `<tr><th>Tipo</th>${S.cols.map((c) => `<th>${c}</th>`).join("")}<th>Total</th></tr>`;
  const body = S.typesPresent.map((t) =>
    `<tr><td>${escapeHtml(t)}</td>${S.cols.map((c) => `<td>${S.matrix[t][c] || ""}</td>`).join("")}<td class="b">${S.typeTotal[t]}</td></tr>`).join("");
  const totalRow = `<tr class="tot"><td>Total</td>${S.cols.map((c) => `<td>${S.colTotal(c)}</td>`).join("")}<td>${S.total}</td></tr>`;

  box.innerHTML = `
    <div class="stats-grid deck-kpis">${kpis}</div>
    <div class="charts-grid deck-charts-grid">
      <div class="chart-card"><h4>Curva de coste (Aliados)</h4><div class="chart-wrap"><canvas id="deck-chart-cost"></canvas></div></div>
      <div class="chart-card"><h4>Distribución por tipo</h4><div class="chart-wrap"><canvas id="deck-chart-type"></canvas></div></div>
      <div class="chart-card"><h4>Razas (Aliados)</h4><div class="chart-wrap"><canvas id="deck-chart-race"></canvas></div></div>
    </div>
    <div class="ds-title">Detalle por tipo y coste</div>
    <div class="ds-matrix"><table>${head}${body}${totalRow}</table></div>`;

  renderDeckCharts(strat).catch((e) => console.warn("deck charts:", e));
}

/* ===================== Estrategia (análisis por reglas) =====================
   Diagnóstico heurístico, NO una IA conversacional: son puros cálculos sobre
   curva de coste, proporciones de tipo, concentración racial, ban list y
   copias faltantes. Se separó el cálculo (computeDeckStrategy) del texto
   (deckStrategyText) a propósito — si el día de mañana se conecta una IA de
   verdad (ver conocimiento.md), esta misma estructura de datos le sirve de
   entrada en vez de tener que rehacer el análisis. */
function computeDeckStrategy(deck) {
  const entries = Object.entries(deck.cards);
  const cardsFull = entries.map(([cid, q]) => ({ card: state.cards.find((c) => c.id === cid), cid, q })).filter((x) => x.card);
  const total = cardsFull.reduce((a, x) => a + x.q, 0);

  const byType = {};
  for (const { card, q } of cardsFull) byType[card.type] = (byType[card.type] || 0) + q;

  const allies = cardsFull.filter((x) => x.card.type === "Aliado");
  const allyTotal = allies.reduce((a, x) => a + x.q, 0);

  const curve = {};
  for (const { card, q } of allies) {
    const c = card.cost ?? 0;
    curve[c] = (curve[c] || 0) + q;
  }
  const avgCost = allyTotal ? allies.reduce((a, x) => a + (x.card.cost || 0) * x.q, 0) / allyTotal : 0;
  const lowCost = allies.filter((x) => (x.card.cost ?? 99) <= 2).reduce((a, x) => a + x.q, 0);
  const highCost = allies.filter((x) => (x.card.cost ?? 0) >= 6).reduce((a, x) => a + x.q, 0);

  const byRace = {};
  for (const { card, q } of allies) {
    if (card.race && card.race !== "—") byRace[card.race] = (byRace[card.race] || 0) + q;
  }
  const raceEntries = Object.entries(byRace).sort((a, b) => b[1] - a[1]);
  const topRace = raceEntries[0] || null;
  const raceConcentration = allyTotal && topRace ? topRace[1] / allyTotal : 0;

  // Regla general de MyL: máximo 3 copias por nombre de carta (las únicas son
  // 1, pero el catálogo no marca hoy cuáles son "única" así que no se filtra
  // eso acá — ver nota en la recomendación).
  const overLimit = cardsFull.filter((x) => x.q > 3);
  const banIssues = cardsFull.filter((x) => banlistWarning(x.card, x.q));
  const missingCopies = cardsFull.reduce((a, x) => a + Math.max(0, x.q - store.getQty(x.cid)), 0);

  return { total, byType, allies, allyTotal, curve, avgCost, lowCost, highCost, raceEntries, topRace, raceConcentration, overLimit, banIssues, missingCopies };
}

function deckStrategyText(deck) {
  const s = computeDeckStrategy(deck);
  if (!s.total) return null;

  const fortalezas = [];
  const debilidades = [];
  const recomendaciones = [];

  if (s.total === MYL_DECK_SIZE) fortalezas.push(`Tiene exactamente ${MYL_DECK_SIZE} cartas: el tamaño estándar del Mazo Castillo en Mitos y Leyendas.`);
  else if (s.total < MYL_DECK_SIZE) debilidades.push(`Tiene ${s.total} cartas — la construcción estándar usa ${MYL_DECK_SIZE} (te faltan ${MYL_DECK_SIZE - s.total}, marcadas en la pestaña Cartas; algunos formatos especiales usan otra regla).`);
  else debilidades.push(`Tiene ${s.total} cartas, por sobre las ${MYL_DECK_SIZE} de la construcción estándar. Más cartas diluye la probabilidad de sacar tus piezas clave en un turno dado.`);

  if (s.overLimit.length) {
    recomendaciones.push(`${s.overLimit.length} carta${s.overLimit.length === 1 ? "" : "s"} supera${s.overLimit.length === 1 ? "" : "n"} las 3 copias que permite la regla general (las cartas "única" son solo 1 copia — revisa si alguna de estas lo es): ${s.overLimit.map((x) => `${displayName(x.card)} ×${x.q}`).join(", ")}.`);
  }

  const allyPct = s.total ? Math.round((s.allyTotal / s.total) * 100) : 0;
  if (!s.allyTotal) debilidades.push("No tiene ningún Aliado — son las únicas cartas que atacan y defienden, sin ellos el mazo no puede jugarse.");
  else if (s.allyTotal < RACIAL_MIN_ALLIES) debilidades.push(`Tiene ${s.allyTotal} Aliados — el formato Racial Edición exige un mínimo de ${RACIAL_MIN_ALLIES} (marcado en la pestaña Cartas). Si no juegas ese formato, esta regla no te aplica.`);
  else if (allyPct < 40) debilidades.push(`Solo ${allyPct}% del mazo son Aliados (${s.allyTotal} de ${s.total}). Con pocos, te puedes quedar sin línea de batalla tras los primeros intercambios.`);
  else if (allyPct <= 65) fortalezas.push(`Buena proporción de Aliados (${allyPct}% del mazo, ${s.allyTotal} cartas).`);
  else debilidades.push(`${allyPct}% del mazo son Aliados — muy alto; puede faltarte remoción o soporte (Talismanes/Armas/Tótems) para complementarlos.`);

  if (s.allyTotal) {
    if (s.avgCost <= 3.5) fortalezas.push(`Curva de coste baja (promedio ${s.avgCost.toFixed(1)}): buen ritmo desde los primeros turnos.`);
    else if (s.avgCost > 5) debilidades.push(`Curva de coste alta (promedio ${s.avgCost.toFixed(1)}): puede costarte tener presencia en el tablero temprano.`);
    if (s.lowCost === 0) debilidades.push("No hay Aliados de coste 0 a 2: sin jugadas tempranas, dependes de tus Oros para llegar a las cartas caras.");
    if (s.highCost === 0) recomendaciones.push("No hay Aliados de coste 6 o más: considera 1-2 amenazas grandes para cerrar partidas que se alargan.");
  }

  if (s.topRace) {
    const [raceName, raceQty] = s.topRace;
    const pct = Math.round(s.raceConcentration * 100);
    if (pct >= 50) fortalezas.push(`Fuerte identidad racial: ${pct}% de tus Aliados son ${raceName} (${raceQty} de ${s.allyTotal}). Revisa si tus Talismanes/Tótems dan bonos a esa raza para aprovecharlo al máximo.`);
    else if (s.raceEntries.length >= 5 && pct < 25) debilidades.push(`Los Aliados están repartidos en ${s.raceEntries.length} razas distintas sin ninguna dominante. La mayoría de las sinergias en MyL son por raza — así es difícil que tus cartas se potencien entre sí.`);
  }

  if (s.banIssues.length) {
    const label = state.banlist?.meta?.updateLabel ? ` (ban list ${state.banlist.meta.updateLabel})` : "";
    debilidades.push(`${s.banIssues.length} carta${s.banIssues.length === 1 ? "" : "s"} con problemas en el formato Racial Edición${label} — detalle en la pestaña Cartas.`);
  }
  if (s.missingCopies > 0) {
    recomendaciones.push(`Te faltan ${s.missingCopies} copia${s.missingCopies === 1 ? "" : "s"} en tu colección física para poder armar este mazo tal cual está.`);
  }

  if (!fortalezas.length) fortalezas.push("Todavía no hay suficientes cartas para identificar fortalezas claras.");
  if (!debilidades.length) debilidades.push("No se detectaron problemas estructurales con las reglas revisadas.");
  if (!recomendaciones.length) recomendaciones.push("Sin recomendaciones adicionales por ahora.");

  const diagnostico = `Mazo de ${s.total} cartas: ${s.allyTotal} Aliados, ${s.byType["Talismán"] || 0} Talismanes, ${s.byType["Arma"] || 0} Armas, ${s.byType["Tótem"] || 0} Tótems, ${s.byType["Oro"] || 0} Oros${s.byType["Monumento"] ? `, ${s.byType["Monumento"]} Monumentos` : ""}.`;

  return { diagnostico, fortalezas, debilidades, recomendaciones };
}

function renderDeckStrategy(deck) {
  const box = $("#deck-strategy");
  if (!box) return;
  const total = Object.values(deck.cards).reduce((a, b) => a + b, 0);
  if (!total) { box.innerHTML = `<p class="muted">Mazo vacío — agrega cartas en la pestaña «Cartas» para ver un diagnóstico.</p>`; return; }
  const r = deckStrategyText(deck);
  const li = (arr) => arr.map((t) => `<li>${escapeHtml(t)}</li>`).join("");
  box.innerHTML = `
    <p class="muted strat-note">Análisis automático por reglas (curva de coste, proporciones, sinergia racial, ban list) — todavía no es una IA conversacional que lea habilidades en detalle.</p>
    <div class="strat-section"><h4>Diagnóstico</h4><p>${escapeHtml(r.diagnostico)}</p></div>
    <div class="strat-section"><h4><i class="ph ph-shield-check"></i> Fortalezas</h4><ul>${li(r.fortalezas)}</ul></div>
    <div class="strat-section"><h4><i class="ph ph-warning"></i> Debilidades</h4><ul>${li(r.debilidades)}</ul></div>
    <div class="strat-section"><h4><i class="ph ph-wrench"></i> Recomendaciones</h4><ul>${li(r.recomendaciones)}</ul></div>`;
}

// Badge clickeable del estado de un mazo: Principal (compite por cartas con
// otros mazos Principal) o Secundario (plan/experimento, no reserva nada).
function deckStatusBadgeHtml(deck) {
  const isPrincipal = deck.status !== "secundario";
  return `<button class="deck-status-badge ${isPrincipal ? "principal" : "secundario"}" data-status
    title="${isPrincipal ? "Mazo Principal: compite por cartas con otros mazos Principal. Click para pasar a Secundario." : "Mazo Secundario: no reserva cartas, ideal para planes/experimentos. Click para pasar a Principal."}">
    ${isPrincipal ? '<i class="ph ph-puzzle-piece"></i> Principal' : '<i class="ph ph-note-pencil"></i> Secundario'}
  </button>`;
}

function updateDeckCounts() {
  $$("#deck-list .deck-item").forEach((row) => {
    const id = row.dataset.deckId;
    const c = row.querySelector(".d-count");
    if (id && c) c.textContent = store.deckCount(id);
  });
}

/* ===================== Estadísticas ===================== */
function statsScopeLabel() {
  const sc = $("#stats-scope").value;
  const fm = $("#stats-format");
  const fTxt = fm.value ? " · " + fm.options[fm.selectedIndex].text : "";
  return (sc === "owned" ? "Solo las que tengo" : sc === "missing" ? "Solo faltantes" : "Todo el catálogo") + fTxt;
}

function renderStats() {
  const scope = $("#stats-scope")?.value || "all";
  const fmt = $("#stats-format")?.value || "";
  const ed = $("#stats-edition")?.value || "";
  let base = fmt ? state.cards.filter((c) => c.format === fmt) : state.cards;
  if (ed) base = base.filter((c) => c.edition === ed);

  const owned = base.filter((c) => store.getQty(c.id) > 0);
  const ownedCopies = base.reduce((s, c) => s + store.getQty(c.id), 0);
  const repeatedCopies = base.reduce((s, c) => s + Math.max(0, store.getQty(c.id) - 1), 0);
  const pct = base.length ? Math.round((owned.length / base.length) * 100) : 0;

  // Anillo de progreso (circunferencia r=46 → 2π·46 ≈ 289)
  const CIRC = 2 * Math.PI * 46;
  const ring = $("#progress-ring-fill");
  if (ring) ring.setAttribute("stroke-dasharray", `${(CIRC * (pct / 100)).toFixed(1)} ${CIRC.toFixed(1)}`);
  const pctEl = $("#progress-ring-pct"); if (pctEl) pctEl.textContent = pct + "%";
  const subEl = $("#progress-ring-sub"); if (subEl) subEl.textContent = `${owned.length.toLocaleString("es-CL")} de ${base.length.toLocaleString("es-CL")} cartas`;

  const scopeLbl = scope === "owned" ? "Solo las que tengo" : scope === "missing" ? "Solo las que me faltan" : "Todo el catálogo";
  const edCount = new Set(base.map((c) => c.edition)).size;
  const ctxEl = $("#stats-context"); if (ctxEl) ctxEl.textContent = `${scopeLbl} · ${edCount} edición${edCount === 1 ? "" : "es"}`;

  // Progreso por edición (respeta formato/edición elegidos)
  const byEd = {};
  for (const c of base) {
    const e = (byEd[c.edition] ||= { name: c.editionName, total: 0, owned: 0 });
    e.total++;
    if (store.getQty(c.id) > 0) e.owned++;
  }
  const editionsComplete = Object.values(byEd).filter((e) => e.total > 0 && e.owned === e.total).length;
  const ownCards = base.filter((c) => c.userCustom).length;
  const ownEditions = store.getCustomEditions().length;
  const repeatedCards = base.filter((c) => store.getQty(c.id) > 1).length;

  // Valor estimado: precio propio o de referencia, solo de lo que se posee
  // (mismo criterio que "Valor potencial" de Cambio y Ventas).
  let estValue = 0, pricedCopies = 0;
  for (const c of owned) {
    const q = store.getQty(c.id);
    const unit = store.getMyPrice(c.id) ?? marketRefPrice(c.id);
    if (unit != null) { estValue += unit * q; pricedCopies += q; }
  }

  $("#stats-cards").innerHTML = [
    statCard3("Cartas distintas", owned.length.toLocaleString("es-CL"), `de ${base.length.toLocaleString("es-CL")} del catálogo`),
    statCard3("Copias totales", ownedCopies.toLocaleString("es-CL"), `${repeatedCopies.toLocaleString("es-CL")} repetidas`),
    statCard3("Ediciones completas", editionsComplete, `de ${edCount} edición${edCount === 1 ? "" : "es"}`, "highlight"),
    statCard3("Cartas propias", ownCards, ownEditions ? `${ownEditions} edición${ownEditions === 1 ? "" : "es"} creada${ownEditions === 1 ? "" : "s"} por ti` : "agregadas a mano"),
    statCard3("Repetidas", repeatedCards, "cartas con 2+ copias"),
    statCard3("Valor estimado", pricedCopies ? fmtCLP(estValue) : "—", "según precios de referencia"),
  ].join("");

  // Curva de coste + Por tipo: barras CSS (sin Chart.js) de lo que tienes.
  // El selector "Alcance" no las afecta — el título ya dice "cartas que
  // tienes", así que siempre muestran la colección, nunca el catálogo
  // completo ni lo que falta (mostrar miles de cartas del catálogo bajo esa
  // leyenda sería confuso).
  renderCostCurveBars(owned);
  renderTypeBars(owned);

  const rows = Object.entries(byEd)
    .map(([slug, e]) => ({ slug, ...e }))
    .filter((e) => e.total > 0)
    .sort((a, b) => b.owned / b.total - a.owned / a.total || b.total - a.total);
  $("#stats-editions").innerHTML = rows
    .map((e) => {
      const p = Math.round((e.owned / e.total) * 100);
      const high = p >= 70;
      return `<div class="ep-row" data-edition="${escapeAttr(e.slug)}">
        <div class="ep-info"><div class="ep-name">${escapeHtml(e.name || "—")}</div><div class="ep-meta">${e.owned} de ${e.total}</div></div>
        <span class="ep-bar"><span class="ep-fill${high ? " high" : ""}" style="width:${p}%"></span></span>
        <span class="ep-pct${high ? " high" : ""}">${p}%</span>
      </div>`;
    })
    .join("") || `<p class="muted">Sin datos.</p>`;
  $$("#stats-editions .ep-row").forEach((row) => { row.onclick = () => jumpToAlbumEdition(row.dataset.edition); });
}
function renderCostCurveBars(cards) {
  const box = $("#cost-curve-bars");
  if (!box) return;
  const costMap = new Map();
  for (const c of cards) {
    if (c.cost == null) continue;
    const k = c.cost >= 11 ? "11+" : String(c.cost);
    costMap.set(k, (costMap.get(k) || 0) + 1);
  }
  const keys = [...Array(11).keys()].map(String).concat("11+").filter((k) => costMap.has(k));
  if (!keys.length) { box.innerHTML = `<p class="muted">Sin datos.</p>`; return; }
  const max = Math.max(1, ...keys.map((k) => costMap.get(k)));
  box.innerHTML = keys.map((k) => {
    const v = costMap.get(k);
    const h = Math.max(2, Math.round((v / max) * 100));
    return `<div class="ccb-col">
      <span class="ccb-val">${v}</span>
      <div class="ccb-bar${v === max ? " max" : ""}" style="height:${h}%"></div>
      <span class="ccb-lbl">${k}</span>
    </div>`;
  }).join("");
}
function renderTypeBars(cards) {
  const box = $("#type-bars");
  if (!box) return;
  const m = new Map();
  for (const c of cards) {
    if (!c.type || c.type === "—") continue;
    m.set(c.type, (m.get(c.type) || 0) + 1);
  }
  const entries = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!entries.length) { box.innerHTML = `<p class="muted">Sin datos.</p>`; return; }
  const max = Math.max(1, ...entries.map((e) => e[1]));
  box.innerHTML = entries.map(([t, v], i) => {
    const w = Math.max(2, Math.round((v / max) * 100));
    return `<div class="tb-row">
      <div class="tb-top"><span class="tb-name">${escapeHtml(t)}</span><span class="tb-val">${v}</span></div>
      <div class="tb-track"><div class="tb-fill${i === 0 ? " top" : ""}" style="width:${w}%"></div></div>
    </div>`;
  }).join("");
}
// Clic en una fila de "Progreso por edición" → la vista Álbum, a la
// colección que sigue esa edición (crea una de un solo click si no existe
// ninguna todavía, igual que el gestor de colecciones ya permite).
function jumpToAlbumEdition(slug) {
  if (!slug) return;
  let col = store.getCollections().find((c) => c.editions.includes(slug));
  if (!col) col = store.createCollection(state.editionName[slug] || slug, [slug]);
  store.setSetting("activeCollectionId", col.id);
  switchView("colecciones");
}
function statCard(num, lbl) {
  return `<div class="stat-card"><div class="num">${num}</div><div class="lbl">${lbl}</div></div>`;
}
// Variante de 3 líneas (etiqueta arriba, cifra, subtexto abajo) — fila de
// KPI de Mazos y Estadísticas. `cls` agrega modificadores como "highlight"
// o "clickable".
function statCard3(label, num, sub, cls = "") {
  return `<div class="stat-card${cls ? " " + cls : ""}"><div class="lbl-top">${escapeHtml(label)}</div><div class="num">${num}</div><div class="lbl">${escapeHtml(sub)}</div></div>`;
}

function statsExportPDF() {
  const scope = $("#stats-scope").value, fmt = $("#stats-format").value, ed = $("#stats-edition").value;
  let cards = fmt ? state.cards.filter((c) => c.format === fmt) : state.cards.slice();
  if (ed) cards = cards.filter((c) => c.edition === ed);
  if (scope === "owned") cards = cards.filter((c) => store.getQty(c.id) > 0);
  else if (scope === "missing") cards = cards.filter((c) => store.getQty(c.id) === 0);
  if (cards.length > 1500 && !confirm(`Son ${cards.length} cartas. El PDF puede ser grande. ¿Continuar?`)) return;
  showToast("Generando PDF…", 5000);
  exportPDF(cards, store.getQty, statsScopeLabel())
    .then(() => showToast("PDF descargado ✓"))
    .catch((e) => showToast("Error: " + e.message, 4000));
}

/* ===================== Exportar / Importar ===================== */
function download(filename, text, mime = "application/json") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function scopeLabel() {
  const own = $("#f-ownership");
  const ownTxt = own.selectedIndex > 0 ? own.options[own.selectedIndex].text : "Todas las cartas";
  const ed = $("#f-edition");
  const edTxt = ed.value ? " · " + ed.options[ed.selectedIndex].text : "";
  return ownTxt + edTxt;
}

function exportCollection(format) {
  // Excel / PDF: exportan el conjunto filtrado actual
  if (format === "xlsx" || format === "pdf") {
    const cards = state.filtered.length ? state.filtered : state.cards;
    if (format === "pdf" && cards.length > 1500 &&
        !confirm(`Vas a exportar ${cards.length} cartas a PDF (puede tardar). \n\nSugerencia: filtra primero (p. ej. "Solo las que tengo" o una edición). ¿Continuar igual?`)) return;
    showToast("Generando archivo…", 5000);
    const fn = format === "xlsx" ? exportExcel : exportPDF;
    fn(cards, store.getQty, scopeLabel())
      .then(() => showToast(format === "xlsx" ? "Excel descargado ✓" : "PDF descargado ✓"))
      .catch((e) => showToast("Error al exportar: " + e.message, 4000));
    return;
  }
  if (format === "prices-xlsx") {
    const cards = state.filtered.length ? state.filtered : state.cards;
    showToast("Generando Excel de precios…", 5000);
    exportPricesExcel(cards, store.getQty, store.getMyPrice, scopeLabel())
      .then(({ withPrice, total }) => showToast(`Excel descargado ✓ (${withPrice} de ${total} cartas con valor propio o precio de referencia)`, 5000))
      .catch((e) => showToast("Error al exportar: " + e.message, 4000));
    return;
  }

  const inv = store.getInventory();
  if (format === "json") {
    const data = {
      app: "Inventario MyL",
      exportedAt: new Date().toISOString(),
      inventory: inv,
      decks: store.getDecks(),
      collections: store.getCollections(),
      trade: store.getTradeList(),
      tradeLog: store.getTradeLog(),
    };
    download(`coleccion_myl_${today()}.json`, JSON.stringify(data, null, 2));
    showToast("Colección exportada (JSON)");
    return;
  }
  // CSV
  const wantMissing = format === "missing-csv";
  const rows = [["nombre", "edicion", "formato", "tipo", "raza", "rareza", "coste", "fuerza", "cantidad"]];
  for (const c of state.cards) {
    const qty = inv[c.id] || 0;
    if (wantMissing ? qty > 0 : qty === 0) continue;
    rows.push([c.name, c.editionName, c.format, c.type, c.race, c.rarity, c.cost ?? "", c.strength ?? "", wantMissing ? "" : qty]);
  }
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
  download(`${wantMissing ? "faltantes" : "coleccion"}_myl_${today()}.csv`, csv, "text/csv");
  showToast(`Exportado (CSV): ${rows.length - 1} filas`);
}

function exportDeck(deck) {
  const lines = [`# ${deck.name}`];
  for (const [cid, q] of Object.entries(deck.cards)) {
    const card = state.cards.find((c) => c.id === cid);
    lines.push(`${q} ${card ? card.name : cid}`);
  }
  download(`mazo_${deck.name.replace(/\s+/g, "_")}.txt`, lines.join("\n"), "text/plain");
  showToast("Mazo exportado");
}

function importCollection(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const inv = data.inventory || data;
      const merge = confirm("¿Combinar con tu colección actual?\n\nAceptar = combinar (suma cantidades)\nCancelar = reemplazar todo");
      if (merge) store.mergeInventory(inv);
      else store.replaceInventory(inv);
      if (Array.isArray(data.decks)) store.replaceDecks(data.decks);
      if (Array.isArray(data.collections)) store.replaceCollections(data.collections);
      if (data.trade && typeof data.trade === "object") store.replaceTrade(data.trade);
      if (Array.isArray(data.tradeLog)) store.replaceTradeLog(data.tradeLog);
      applyFilters();
      renderDecksView();
      showToast("Colección importada");
    } catch {
      showToast("Archivo no válido", 3000);
    }
  };
  reader.readAsText(file);
}

function csvCell(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function today() { return new Date().toISOString().slice(0, 10); }

/* ===================== Utilidades ===================== */
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

let toastTimer;
function showToast(msg, ms = 2200) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), ms);
}

/* ===================== Guardado / Sincronización ===================== */
function setChip(text, cls = "") {
  const c = $("#sync-chip");
  if (!c) return;
  c.textContent = text;
  c.className = "sync-chip " + cls;
}
let chipTimer;
function flashChip(text, cls) {
  setChip(text, cls);
  clearTimeout(chipTimer);
  chipTimer = setTimeout(() => { if (!cloud.isConfigured()) setChip(""); }, 2500);
}

function refreshAll() {
  rebuildCards();
  applyFilters();
  if (state.view === "colecciones") renderCollectionsView();
  if (state.view === "cambios") renderTradeView();
  if (state.view === "mazos") renderDecksView();
  if (state.view === "stats") renderStats();
  refreshActiveDeckUI();
}

function autoUpload() { return store.getSetting("cloudAuto") !== false; } // por defecto sí

let pushTimer;
function scheduleCloudPush() {
  setChip("Cambios sin subir…", "sync");
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => doCloudPush(false), 1800);
}

async function doCloudPush(manual) {
  if (!cloud.isConfigured()) return;
  try {
    setChip("Subiendo…", "sync");
    const ts = await cloud.push(store.getSnapshot(), { accion: manual ? "guardado manual" : "automático", copias: store.totalCards() });
    cloud.setLastTs(ts);
    cloud.clearDirty();
    setChip("Guardado ✓", "ok");
  } catch (e) { setChip("Error", "err"); showToast("Error al subir: " + e.message, 4000); }
}

function adoptRemote(remote) {
  store.applySnapshot(remote.snapshot);
  cloud.setLastTs(remote.actualizado);
  cloud.clearDirty();
  refreshAll();
  setChip("Sincronizado", "ok");
}

// Reconciliación basada en "¿cambió la fila en la nube desde la última vez?"
async function cloudReconcile() {
  if (!cloud.isConfigured()) return;
  setChip("Sincronizando…", "sync");
  try {
    const remote = await cloud.pull();
    if (!remote || !remote.snapshot) { await doCloudPush(false); return; } // primera vez: subir
    const changedElsewhere = remote.actualizado !== cloud.getLastTs();
    if (!changedElsewhere) {
      if (cloud.isDirty()) await doCloudPush(false);
      else setChip("Sincronizado", "ok");
      return;
    }
    // La nube cambió desde otro dispositivo
    if (cloud.isDirty()) {
      const takeCloud = confirm(
        "Hay cambios en la NUBE (desde otro dispositivo) y también cambios locales sin subir.\n\n" +
        "Aceptar = usar lo de la NUBE (descarta lo local de este equipo)\n" +
        "Cancelar = subir lo de ESTE equipo (sobrescribe la nube)"
      );
      if (takeCloud) adoptRemote(remote);
      else await doCloudPush(false);
    } else {
      adoptRemote(remote);
    }
  } catch (e) { setChip("Error", "err"); showToast("Sincronización: " + e.message, 4000); }
}

/* ----- Tiempo real (Supabase Realtime) ----- */
async function startRealtime() {
  if (!cloud.isConfigured()) return;
  try { await cloud.subscribeRealtime(onRealtime); }
  catch (e) { console.warn("realtime:", e); }
}
function onRealtime({ snapshot, actualizado }) {
  if (!snapshot || actualizado === cloud.getLastTs()) return; // cambio propio
  if (cloud.isDirty()) {
    setChip("Cambios nuevos en la nube — toca Bajar", "sync");
    showToast("Hay cambios desde otro dispositivo. Toca Bajar para traerlos.", 4500);
    return;
  }
  store.applySnapshot(snapshot);
  cloud.setLastTs(actualizado);
  cloud.clearDirty();
  refreshAll();
  setChip("Actualizado", "ok");
  showToast("Actualizado en tiempo real desde la nube");
}

function onStoreChange(origin) {
  if (origin === "remote") { refreshAll(); return; }
  if (!cloud.isConfigured()) { flashChip("Guardado ✓", "ok"); return; }
  cloud.markDirty();
  if (autoUpload()) scheduleCloudPush();
  else setChip("Cambios sin subir — toca Guardar", "sync");
}

/* ----- Red de seguridad: re-sincroniza al volver a la pestaña y cada 30s ----- */
async function quietPull() {
  if (!cloud.isConfigured() || cloud.isDirty()) return;
  try {
    const r = await cloud.pull();
    if (r && r.snapshot && r.actualizado !== cloud.getLastTs()) {
      store.applySnapshot(r.snapshot);
      cloud.setLastTs(r.actualizado);
      cloud.clearDirty();
      refreshAll();
      setChip("Actualizado", "ok");
    }
  } catch {}
}
function startCloudBackgroundSync() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && cloud.isConfigured()) {
      startRealtime();   // reasegura la suscripción (el navegador la duerme en 2º plano)
      quietPull();       // y trae cambios perdidos al instante
    }
  });
  window.addEventListener("focus", () => { if (cloud.isConfigured()) quietPull(); });
  setInterval(() => { if (cloud.isConfigured() && document.visibilityState === "visible") quietPull(); }, 30000);
}

/* ----- Modal de datos / nube ----- */
function openSyncModal() {
  const cfg = cloud.getConfig();
  $("#cloud-url").value = cfg.url || "";
  $("#cloud-key").value = cfg.key || "";
  $("#cloud-clave").value = cfg.clave || "";
  $("#cloud-device").value = cfg.device || "";
  $("#cloud-auto").checked = autoUpload();
  $("#cloud-status").textContent = cloud.isConfigured()
    ? (cloud.isDirty() ? "Conectado. Tienes cambios sin subir." : "Conectado y sincronizado.")
    : "Sincronización no configurada.";
  $("#cloud-log").innerHTML = "";
  $("#sync-modal").classList.remove("hidden");
}
function closeSyncModal() { $("#sync-modal").classList.add("hidden"); }

async function showLog() {
  if (!cloud.isConfigured()) { showToast("Conecta primero"); return; }
  const box = $("#cloud-log");
  box.innerHTML = `<p class="muted">Cargando historial…</p>`;
  const rows = await cloud.getLog(30);
  if (rows == null) {
    box.innerHTML = `<p class="muted">El historial requiere una tabla extra. Ejecuta el SQL de "historial" (en la ayuda) una vez.</p>`;
    return;
  }
  if (!rows.length) { box.innerHTML = `<p class="muted">Aún no hay registros.</p>`; return; }
  box.innerHTML = `<table class="log-table"><thead><tr><th>Fecha</th><th>Dispositivo</th><th>Acción</th><th>Copias</th></tr></thead><tbody>` +
    rows.map((r) => `<tr><td>${new Date(r.creado).toLocaleString("es-CL")}</td><td>${escapeHtml(r.dispositivo || "—")}</td><td>${escapeHtml(r.accion || "—")}</td><td>${r.copias ?? ""}</td></tr>`).join("") +
    `</tbody></table>`;
}

async function connectCloud({ url, key, clave, device }) {
  if (!url || !key || !clave) { showToast("Completa URL, clave y código de colección", 3500); return false; }
  cloud.setConfig({ url, key, clave, device });
  $("#cloud-status").textContent = "Conectando…";
  await cloudReconcile();
  startRealtime();
  $("#cloud-status").textContent = "Conexión lista. " + (autoUpload() ? "Tus cambios se subirán solos." : "Recuerda tocar Guardar para subir.") + " Tiempo real activo.";
  showToast("Nube conectada ✓");
  return true;
}

// Arma un link con la config de sincronización (sin el nombre de dispositivo,
// que se ingresa por separado en cada uno) para copiar y abrir en otro aparato.
function buildMagicLink() {
  const cfg = cloud.getConfig();
  if (!cfg.url || !cfg.key || !cfg.clave) return null;
  const payload = btoa(unescape(encodeURIComponent(JSON.stringify({ url: cfg.url, key: cfg.key, clave: cfg.clave }))));
  return `${location.origin}${location.pathname}#sync=${payload}`;
}

// Si la URL trae #sync=..., autoconecta con esos datos y limpia el hash de
// inmediato (evita dejar la clave más tiempo del necesario en el historial).
async function tryMagicLinkFromHash() {
  const m = /^#sync=(.+)$/.exec(location.hash);
  if (!m) return;
  history.replaceState(null, "", location.pathname + location.search);
  try {
    const data = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
    if (!data.url || !data.key || !data.clave) return;
    const ok = await connectCloud({ url: data.url, key: data.key, clave: data.clave, device: $("#cloud-device").value });
    if (ok) $("#cloud-device").value = cloud.getConfig().device || "";
  } catch (e) {
    showToast("El link de sincronización no es válido.", 3500);
  }
}

function bindSyncEvents() {
  $("#open-sync").addEventListener("click", openSyncModal);
  $$("[data-close-sync]").forEach((el) => el.addEventListener("click", closeSyncModal));
  $("#sync-help-toggle").addEventListener("click", (e) => { e.preventDefault(); $("#sync-help").classList.toggle("hidden"); });
  $$("[data-copy-sql]").forEach((b) => b.addEventListener("click", () => {
    navigator.clipboard.writeText($("#" + b.dataset.copySql).textContent).then(() => showToast("SQL copiado"));
  }));
  $("#sync-backup").addEventListener("click", () => exportCollection("json"));
  $("#sync-restore").addEventListener("click", () => $("#import-file").click());

  $("#cloud-auto").addEventListener("change", (e) => {
    store.setSetting("cloudAuto", e.target.checked);
    if (e.target.checked && cloud.isConfigured() && cloud.isDirty()) doCloudPush(false);
  });

  $("#cloud-connect").addEventListener("click", async () => {
    const url = $("#cloud-url").value, key = $("#cloud-key").value, clave = $("#cloud-clave").value, device = $("#cloud-device").value;
    await connectCloud({ url, key, clave, device });
  });
  $("#cloud-magic-link").addEventListener("click", () => {
    const link = buildMagicLink();
    if (!link) { showToast("Conecta primero para poder generar el link", 3500); return; }
    navigator.clipboard.writeText(link).then(() => showToast("Link copiado ✓ Ábrelo en tu otro dispositivo"));
  });
  $("#cloud-push").addEventListener("click", async () => { if (!cloud.isConfigured()) return showToast("Conecta primero"); await doCloudPush(true); showToast("Guardado en la nube ✓"); openSyncModal(); });
  $("#cloud-pull").addEventListener("click", async () => {
    if (!cloud.isConfigured()) return showToast("Conecta primero");
    try {
      const r = await cloud.pull();
      if (r && r.snapshot) { adoptRemote(r); showToast("Bajado ✓"); }
      else showToast("No hay datos en la nube todavía");
    } catch (e) { showToast("Error: " + e.message, 4000); }
  });
  $("#cloud-disconnect").addEventListener("click", () => {
    cloud.unsubscribeRealtime();
    cloud.disconnect(); setChip(""); $("#cloud-status").textContent = "Sincronización desactivada.";
    showToast("Nube desconectada");
  });
  $("#cloud-log-btn").addEventListener("click", showLog);
}

/* ===================== Navegación / eventos ===================== */
function switchView(view) {
  state.view = view;
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === view));
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + view));
  if (view === "colecciones") renderCollectionsView();
  if (view === "cambios") renderTradeView();
  if (view === "mazos") renderDecksView();
  if (view === "stats") renderStats();
}

function bindEvents() {
  // Tabs
  $$(".tab").forEach((t) => t.addEventListener("click", () => switchView(t.dataset.view)));

  // Buscador global: filtra el Catálogo y también la vista activa
  // (dentro de una colección, del mazo abierto, o de Cambio y Ventas)
  const debounced = debounce(() => {
    applyFilters();
    if (state.view === "colecciones") {
      const col = store.getCollection(store.getSetting("activeCollectionId"));
      if (col) renderCollectionGrid(col);
    } else if (state.view === "mazos") {
      const deck = store.getDeck(store.getSetting("activeDeckId"));
      if (deck) renderDeckContents(deck);
    } else if (state.view === "cambios") {
      renderTradeList();
    }
  }, 180);
  $("#search").addEventListener("input", debounced);
  ["#f-ownership", "#f-edition", "#f-race", "#f-type", "#f-rarity", "#f-sort"].forEach((s) =>
    $(s).addEventListener("change", applyFilters)
  );
  $("#f-format").addEventListener("change", () => { refreshEditionOptions(); applyFilters(); });
  $("#f-cost").addEventListener("input", (e) => {
    const v = Number(e.target.value);
    $("#cost-val").textContent = v >= 12 ? "∞" : v;
    applyFilters();
  });
  $("#clear-filters").addEventListener("click", () => {
    $("#search").value = "";
    ["#f-ownership", "#f-format", "#f-edition", "#f-race", "#f-type", "#f-rarity", "#f-sort"].forEach((s) => ($(s).selectedIndex = 0));
    $("#f-cost").value = 12; $("#cost-val").textContent = "∞";
    refreshEditionOptions();
    applyFilters();
  });

  // Paginación
  $("#load-more").addEventListener("click", () => { state.page++; renderGrid(false); });

  // Modal
  $("#modal").addEventListener("click", (e) => { if (e.target.classList.contains("modal-backdrop")) closeModal(); });
  $("#modal-prev").addEventListener("click", () => modalNavStep(-1));
  $("#modal-next").addEventListener("click", () => modalNavStep(1));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal(); closeDeckModal(); closeSyncModal(); closeCardForm(); closeOrphanModal(); closeCollectionModal(); closeTradeModal();
      if (state.selectedCardId) { state.selectedCardId = null; $$("#cards-grid .card").forEach((el) => el.classList.remove("selected")); renderFicha(); }
      if (state.deckSelectedCardId) { state.deckSelectedCardId = null; $$("#deck-contents .deck-card-row").forEach((el) => el.classList.remove("selected")); renderDeckFicha(); }
      return;
    }
    const tag = document.activeElement?.tagName;
    const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    if (!$("#modal").classList.contains("hidden")) {
      if (typing) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); modalNavStep(e.key === "ArrowLeft" ? -1 : 1); }
      return;
    }
    if (typing) return;
    // Atajos de teclado de la ficha fija del Catálogo: ← → recorre, ↑ ↓
    // suma/resta una copia, 0–9 fija la cantidad, Espacio abre el detalle.
    if (state.view === "coleccion" && state.selectedCardId) {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); fichaNavStep(e.key === "ArrowLeft" ? -1 : 1); }
      else if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); fichaChangeQty(e.key === "ArrowUp" ? 1 : -1); }
      else if (e.key === " ") { e.preventDefault(); openModal(cardById(state.selectedCardId), state.fichaNavList || state.filtered); }
      else if (/^[0-9]$/.test(e.key)) { e.preventDefault(); fichaSetQty(Number(e.key)); }
    }
    // Mismos atajos para la ficha fija de Mazos, pero ↑↓/0-9 fijan la
    // cantidad EN EL MAZO (no el inventario) — ver deckFichaChangeQty/Set.
    else if (state.view === "mazos" && state.deckSelectedCardId) {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); deckFichaNavStep(e.key === "ArrowLeft" ? -1 : 1); }
      else if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); deckFichaChangeQty(e.key === "ArrowUp" ? 1 : -1); }
      else if (e.key === " ") { e.preventDefault(); $("#deck-ficha-expand")?.click(); }
      else if (/^[0-9]$/.test(e.key)) { e.preventDefault(); deckFichaSetQty(Number(e.key)); }
    }
  });
  $("#ficha-prev").addEventListener("click", () => fichaNavStep(-1));
  $("#ficha-next").addEventListener("click", () => fichaNavStep(1));
  $("#ficha-minus").addEventListener("click", () => fichaChangeQty(-1));
  $("#ficha-plus").addEventListener("click", () => fichaChangeQty(1));
  $("#deck-ficha-prev").addEventListener("click", () => deckFichaNavStep(-1));
  $("#deck-ficha-next").addEventListener("click", () => deckFichaNavStep(1));
  $("#deck-ficha-minus").addEventListener("click", () => deckFichaChangeQty(-1));
  $("#deck-ficha-plus").addEventListener("click", () => deckFichaChangeQty(1));
  $("#orphan-note").addEventListener("click", openOrphanModal);
  $("#orphan-modal").addEventListener("click", (e) => { if (e.target.classList.contains("modal-backdrop")) closeOrphanModal(); });
  $$("[data-close-orphan]").forEach((el) => el.addEventListener("click", closeOrphanModal));
  $("#deck-modal").addEventListener("click", (e) => { if (e.target.classList.contains("modal-backdrop")) closeDeckModal(); });

  // Exportar / importar
  const dd = $(".dropdown");
  $("#btn-export").addEventListener("click", () => dd.classList.toggle("open"));
  // Cierra cualquier .dropdown abierto (Catálogo o el de Exportar de Mazos,
  // que se re-crea cada vez que se renderiza el detalle del mazo) al hacer
  // click fuera de él.
  document.addEventListener("click", (e) => {
    $$(".dropdown.open").forEach((el) => { if (!el.contains(e.target)) el.classList.remove("open"); });
  });
  $$(".dropdown-menu button").forEach((b) =>
    b.addEventListener("click", () => { exportCollection(b.dataset.export); dd.classList.remove("open"); })
  );
  $("#btn-import").addEventListener("click", () => $("#import-file").click());
  $("#import-file").addEventListener("change", (e) => { if (e.target.files[0]) importCollection(e.target.files[0]); e.target.value = ""; });

  // Mazos
  $("#new-deck").addEventListener("click", () => {
    const name = prompt("Nombre del mazo:", "Mazo nuevo");
    if (name !== null) { const d = store.createDeck(name); store.setSetting("activeDeckId", d.id); renderDecksView(); }
  });
  bindDeckBarEvents();

  // Colecciones
  bindCollectionEvents();

  // Cambios (intercambio)
  bindTradeEvents();

  // Estadísticas
  $("#stats-scope").addEventListener("change", renderStats);
  $("#stats-edition").addEventListener("change", renderStats);
  $("#stats-format").addEventListener("change", () => { refreshStatsEditionOptions(); renderStats(); });
  $("#stats-export-pdf").addEventListener("click", statsExportPDF);

  // Datos / sincronización
  bindSyncEvents();

  // Carta manual
  bindCardFormEvents();

  // Gestor de ediciones personalizadas
  bindEditionEvents();

  // Tema
  $("#theme-toggle").addEventListener("click", toggleTheme);

  // Rail de navegación: colapsar/expandir
  $("#rail-collapse").addEventListener("click", toggleRail);
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
  applyTheme(cur);
  store.setSetting("theme", cur);
}
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const icon = $("#theme-toggle i");
  if (icon) icon.className = theme === "light" ? "ph ph-sun" : "ph ph-moon";
}

function toggleRail() {
  const expanded = !$(".app-shell").classList.contains("rail-expanded");
  applyRailState(expanded);
  store.setSetting("railExpanded", expanded);
}
function applyRailState(expanded) {
  $(".app-shell").classList.toggle("rail-expanded", expanded);
  const icon = $("#rail-collapse i");
  if (icon) icon.className = expanded ? "ph ph-caret-line-left" : "ph ph-caret-line-right";
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ===================== Init ===================== */
async function init() {
  applyTheme(store.getSetting("theme") || "dark");
  applyRailState(store.getSetting("railExpanded") ?? false);
  bindEvents();
  store.onChange(onStoreChange);
  await loadData();
  populateFilters();
  refreshActiveDeckUI();
  applyFilters();
  // Sincronización en la nube (si está configurada, o si llega un link mágico #sync=...)
  if (/^#sync=/.test(location.hash)) {
    await tryMagicLinkFromHash();
  } else if (cloud.isConfigured()) {
    setChip("Sincronizado", "ok"); cloudReconcile(); startRealtime();
  }
  startCloudBackgroundSync();
}
init();
