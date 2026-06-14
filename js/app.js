import * as store from "./store.js";
import { exportExcel, exportPDF } from "./exporters.js";
import { renderCharts } from "./charts.js";
import * as cloud from "./cloud.js";

/* ===================== Estado global ===================== */
const state = {
  cards: [],
  editions: [],
  editionName: {}, // slug -> nombre legible
  filtered: [],
  page: 0,
  pageSize: 60,
  view: "coleccion",
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/* ===================== Carga de datos ===================== */
async function loadData() {
  const [cardsRes, edRes] = await Promise.all([
    fetch("./data/cards.json").then((r) => r.json()).catch(() => ({ cards: [] })),
    fetch("./data/editions.json").then((r) => r.json()).catch(() => []),
  ]);

  state.cards = (cardsRes.cards || cardsRes || []).map(normalizeCard);
  state.editions = Array.isArray(edRes) ? edRes : [];
  state.editionName = Object.fromEntries(state.editions.map((e) => [e.slug, e.name]));

  // Asegura nombre legible de edición en cada carta
  // (prioriza el nombre que trae la propia carta desde el scraper)
  for (const c of state.cards) {
    c.editionName = c.editionName || state.editionName[c.edition] || c.edition || "—";
  }
  if (cardsRes.meta?.source === "seed") {
    showToast("Mostrando datos de demostración. Ejecuta el scraper para cargar el catálogo real.", 5000);
  }
}

function normalizeCard(c, i) {
  const id = c.id || `${c.edition || "x"}__${(c.name || "carta_" + i).toLowerCase().replace(/\s+/g, "_")}`;
  return {
    id,
    name: c.name || "Sin nombre",
    edition: c.edition || "",
    format: c.format || "",
    type: c.type || "—",
    race: c.race || "—",
    rarity: c.rarity || "—",
    cost: numOrNull(c.cost),
    strength: numOrNull(c.strength ?? c.attack),
    ability: c.ability || "",
    flavour: c.flavour || "",
    image: c.image || c.image_path || "",
  };
}
function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* ===================== Filtros (poblar selects) ===================== */
function uniqueSorted(values) {
  return [...new Set(values.filter((v) => v && v !== "—"))].sort((a, b) =>
    String(a).localeCompare(String(b), "es")
  );
}

function populateFilters() {
  // Formato
  const fmtNames = { PE: "Primera Era", PB: "Primer Bloque", SB: "Segundo Bloque", FX: "Furia Extendido", NE: "Nueva Era / Imperio" };
  fillSelect("#f-format", uniqueSorted(state.cards.map((c) => c.format)).map((f) => ({ value: f, label: fmtNames[f] || f })));
  fillSelect("#f-race", uniqueSorted(state.cards.map((c) => c.race)).map((v) => ({ value: v, label: v })));
  fillSelect("#f-type", uniqueSorted(state.cards.map((c) => c.type)).map((v) => ({ value: v, label: v })));
  fillSelect("#f-rarity", uniqueSorted(state.cards.map((c) => c.rarity)).map((v) => ({ value: v, label: v })));
  // Formato también en la vista de estadísticas
  fillSelect("#stats-format", uniqueSorted(state.cards.map((c) => c.format)).map((f) => ({ value: f, label: fmtNames[f] || f })));
  refreshEditionOptions();
}

function refreshEditionOptions() {
  const fmt = $("#f-format").value;
  // ediciones presentes en el dataset (respeta el formato seleccionado)
  const present = uniqueSorted(
    state.cards.filter((c) => !fmt || c.format === fmt).map((c) => c.edition)
  );
  const opts = present.map((slug) => ({ value: slug, label: state.editionName[slug] || slug }));
  fillSelect("#f-edition", opts);
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

/* ===================== Aplicar filtros ===================== */
function applyFilters() {
  const q = $("#search").value.trim().toLowerCase();
  const ownership = $("#f-ownership").value;
  const fmt = $("#f-format").value;
  const ed = $("#f-edition").value;
  const race = $("#f-race").value;
  const type = $("#f-type").value;
  const rarity = $("#f-rarity").value;
  const maxCost = Number($("#f-cost").value);
  const sort = $("#f-sort").value;

  let out = state.cards.filter((c) => {
    if (q && !(c.name.toLowerCase().includes(q) || c.ability.toLowerCase().includes(q))) return false;
    if (fmt && c.format !== fmt) return false;
    if (ed && c.edition !== ed) return false;
    if (race && c.race !== race) return false;
    if (type && c.type !== type) return false;
    if (rarity && c.rarity !== rarity) return false;
    if (maxCost < 12 && c.cost != null && c.cost > maxCost) return false;
    const qty = store.getQty(c.id);
    if (ownership === "owned" && qty < 1) return false;
    if (ownership === "missing" && qty >= 1) return false;
    if (ownership === "dup" && qty < 2) return false;
    return true;
  });

  out.sort((a, b) => {
    switch (sort) {
      case "name_desc": return b.name.localeCompare(a.name, "es");
      case "cost": return (a.cost ?? 99) - (b.cost ?? 99);
      case "cost_desc": return (b.cost ?? -1) - (a.cost ?? -1);
      case "strength_desc": return (b.strength ?? -1) - (a.strength ?? -1);
      case "edition": return (a.editionName || "").localeCompare(b.editionName || "", "es");
      case "qty_desc": return store.getQty(b.id) - store.getQty(a.id);
      default: return a.name.localeCompare(b.name, "es");
    }
  });

  state.filtered = out;
  state.page = 0;
  renderGrid(true);
  updateResultCount();
}

function updateResultCount() {
  const n = state.filtered.length;
  const owned = state.filtered.filter((c) => store.getQty(c.id) > 0).length;
  $("#result-count").textContent = `${n} carta${n === 1 ? "" : "s"} · ${owned} en tu colección`;
}

/* ===================== Render grid ===================== */
function renderGrid(reset) {
  const grid = $("#cards-grid");
  if (reset) grid.innerHTML = "";
  const start = state.page * state.pageSize;
  const slice = state.filtered.slice(start, start + state.pageSize);
  const frag = document.createDocumentFragment();
  for (const card of slice) frag.appendChild(cardEl(card));
  grid.appendChild(frag);

  $("#grid-empty").classList.toggle("hidden", state.filtered.length !== 0);
  const hasMore = (state.page + 1) * state.pageSize < state.filtered.length;
  $("#load-more").classList.toggle("hidden", !hasMore);
}

function cardEl(card) {
  const qty = store.getQty(card.id);
  const el = document.createElement("div");
  el.className = "card" + (qty > 0 ? " owned" : "");
  el.dataset.id = card.id;

  const img = card.image
    ? `<img loading="lazy" src="${escapeAttr(card.image)}" alt="${escapeAttr(card.name)}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'placeholder',innerHTML:'<div class=ph-name>${escapeAttr(card.name)}</div>'}))" />`
    : `<div class="placeholder"><div class="ph-name">${escapeHtml(card.name)}</div>${card.editionName || ""}</div>`;

  const activeDeck = store.getDeck(store.getSetting("activeDeckId"));
  const deckBtn = activeDeck
    ? `<button class="qty-btn deck-add" title="Añadir a «${escapeAttr(activeDeck.name)}»">＋🃏</button>`
    : "";

  el.innerHTML = `
    <div class="card-img" data-act="detail">
      ${card.cost != null ? `<span class="badge-cost">${card.cost}</span>` : ""}
      ${card.strength != null ? `<span class="badge-str">${card.strength}</span>` : ""}
      ${img}
    </div>
    <div class="card-body">
      <div class="card-name">${escapeHtml(card.name)}</div>
      <div class="card-meta">${escapeHtml(card.race)} · ${escapeHtml(card.type)}</div>
      <div class="card-meta">${escapeHtml(card.editionName || "")}</div>
      <div class="qty-row">
        <button class="qty-btn" data-act="minus">−</button>
        <span class="qty-num ${qty === 0 ? "zero" : ""}" data-role="qty">${qty}</span>
        <button class="qty-btn" data-act="plus">+</button>
        ${deckBtn}
      </div>
    </div>`;

  el.addEventListener("click", (e) => {
    const act = e.target.dataset.act;
    if (act === "plus") changeQty(el, card, +1);
    else if (act === "minus") changeQty(el, card, -1);
    else if (act === "detail") openModal(card);
    else if (e.target.classList.contains("deck-add")) {
      store.deckAdd(store.getSetting("activeDeckId"), card.id, 1);
      showToast(`«${card.name}» añadida al mazo`);
    }
  });
  return el;
}

function changeQty(el, card, delta) {
  const qty = store.addQty(card.id, delta);
  const numEl = el.querySelector('[data-role="qty"]');
  numEl.textContent = qty;
  numEl.classList.toggle("zero", qty === 0);
  el.classList.toggle("owned", qty > 0);
  updateResultCount();
}

/* ===================== Modal detalle ===================== */
function openModal(card) {
  const qty = store.getQty(card.id);
  const box = $("#modal-box");
  const img = card.image
    ? `<img src="${escapeAttr(card.image)}" alt="${escapeAttr(card.name)}" />`
    : `<div class="placeholder" style="color:var(--muted);padding:20px;text-align:center">Sin imagen</div>`;
  box.innerHTML = `
    <button class="modal-close" data-close>×</button>
    <div class="modal-detail">
      <div class="m-img">${img}</div>
      <div class="m-info">
        <h2>${escapeHtml(card.name)}</h2>
        <div class="m-tags">
          <span class="tag">${escapeHtml(card.editionName || "")}</span>
          <span class="tag">${escapeHtml(card.race)}</span>
          <span class="tag">${escapeHtml(card.type)}</span>
          <span class="tag">${escapeHtml(card.rarity)}</span>
          ${card.cost != null ? `<span class="tag">Coste ${card.cost}</span>` : ""}
          ${card.strength != null ? `<span class="tag">Fuerza ${card.strength}</span>` : ""}
        </div>
        <p>${escapeHtml(card.ability) || "<span class='muted'>Sin texto de habilidad.</span>"}</p>
        ${card.flavour ? `<p class="muted" style="font-style:italic">«${escapeHtml(card.flavour)}»</p>` : ""}
        <div class="qty-row" style="border:none;padding:0;margin-top:16px;max-width:200px">
          <button class="qty-btn" data-m="minus">−</button>
          <span class="qty-num ${qty === 0 ? "zero" : ""}" data-role="mqty">${qty}</span>
          <button class="qty-btn" data-m="plus">+</button>
        </div>
        <p class="muted" style="margin-top:6px">Cantidad en tu colección</p>
      </div>
    </div>`;
  box.querySelector("[data-close]").onclick = closeModal;
  box.querySelectorAll("[data-m]").forEach((b) => {
    b.onclick = () => {
      const newQty = store.addQty(card.id, b.dataset.m === "plus" ? 1 : -1);
      const mq = box.querySelector('[data-role="mqty"]');
      mq.textContent = newQty;
      mq.classList.toggle("zero", newQty === 0);
      // refleja en la grilla
      const gridCard = document.querySelector(`.card[data-id="${CSS.escape(card.id)}"]`);
      if (gridCard) {
        gridCard.querySelector('[data-role="qty"]').textContent = newQty;
        gridCard.querySelector('[data-role="qty"]').classList.toggle("zero", newQty === 0);
        gridCard.classList.toggle("owned", newQty > 0);
      }
      updateResultCount();
    };
  });
  $("#modal").classList.remove("hidden");
}
function closeModal() { $("#modal").classList.add("hidden"); }

/* ===================== Mazos ===================== */
function renderDecksView() {
  const list = $("#deck-list");
  const decks = store.getDecks();
  list.innerHTML = "";
  const activeId = store.getSetting("activeDeckId");
  if (decks.length === 0) {
    list.innerHTML = `<p class="muted">Aún no tienes mazos.</p>`;
  }
  for (const d of decks) {
    const row = document.createElement("div");
    row.className = "deck-item" + (d.id === activeId ? " active" : "");
    row.innerHTML = `
      <span class="d-name">${escapeHtml(d.name)}</span>
      <span class="d-count">${store.deckCount(d.id)}</span>
      <button class="qty-btn" data-del title="Eliminar">🗑</button>`;
    row.querySelector(".d-name").onclick = () => { store.setSetting("activeDeckId", d.id); renderDecksView(); renderDeckDetail(); };
    row.querySelector("[data-del]").onclick = () => {
      if (confirm(`¿Eliminar el mazo «${d.name}»?`)) {
        store.deleteDeck(d.id);
        if (activeId === d.id) store.setSetting("activeDeckId", null);
        renderDecksView(); renderDeckDetail();
      }
    };
    list.appendChild(row);
  }
  renderDeckDetail();
}

function renderDeckDetail() {
  const wrap = $("#deck-detail");
  const deck = store.getDeck(store.getSetting("activeDeckId"));
  if (!deck) {
    wrap.innerHTML = `<p class="muted">Selecciona o crea un mazo para empezar a construirlo. Desde la vista <b>Colección</b> puedes añadir cartas al mazo activo con el botón ＋🃏.</p>`;
    return;
  }
  const entries = Object.entries(deck.cards);
  const total = entries.reduce((a, [, q]) => a + q, 0);
  const byType = {};
  let missing = 0;
  for (const [cid, q] of entries) {
    const card = state.cards.find((c) => c.id === cid);
    const t = card ? card.type : "Otro";
    (byType[t] ||= []).push({ card, cid, q });
    const own = store.getQty(cid);
    if (own < q) missing += q - own;
  }

  let html = `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <h2><input id="deck-name" value="${escapeAttr(deck.name)}" style="background:var(--bg-3);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:6px 10px;font-size:18px;font-weight:700" /></h2>
      <span class="muted">${total} cartas</span>
      <div class="spacer" style="flex:1"></div>
      <button class="btn" id="deck-export">Exportar mazo</button>
    </div>`;
  if (missing > 0) html += `<div class="active-deck-banner">Te faltan <b>${missing}</b> copias de este mazo en tu colección.</div>`;

  for (const [type, rows] of Object.entries(byType)) {
    html += `<h3 class="deck-section-title">${escapeHtml(type)} (${rows.reduce((a, r) => a + r.q, 0)})</h3>`;
    for (const { card, cid, q } of rows) {
      const name = card ? card.name : cid;
      const own = store.getQty(cid);
      const lack = own < q ? ` <span style="color:var(--danger)">(faltan ${q - own})</span>` : "";
      html += `
        <div class="deck-row" data-cid="${escapeAttr(cid)}">
          <span class="dr-qty">${q}×</span>
          <span class="dr-name">${escapeHtml(name)}${lack}</span>
          <span class="dr-actions">
            <button class="qty-btn" data-d="minus">−</button>
            <button class="qty-btn" data-d="plus">+</button>
          </span>
        </div>`;
    }
  }
  if (entries.length === 0) html += `<p class="muted">Mazo vacío. Ve a la pestaña Colección y usa ＋🃏 para añadir cartas.</p>`;
  wrap.innerHTML = html;

  $("#deck-name").onchange = (e) => { store.renameDeck(deck.id, e.target.value || "Mazo"); renderDecksView(); };
  $("#deck-export").onclick = () => exportDeck(deck);
  wrap.querySelectorAll(".deck-row").forEach((row) => {
    const cid = row.dataset.cid;
    row.querySelectorAll("[data-d]").forEach((b) => {
      b.onclick = () => { store.deckAdd(deck.id, cid, b.dataset.d === "plus" ? 1 : -1); renderDeckDetail(); renderDecksView(); };
    });
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
  const base = fmt ? state.cards.filter((c) => c.format === fmt) : state.cards;

  const owned = base.filter((c) => store.getQty(c.id) > 0);
  const ownedCopies = base.reduce((s, c) => s + store.getQty(c.id), 0);
  const pct = base.length ? Math.round((owned.length / base.length) * 100) : 0;

  $("#stats-cards").innerHTML = `
    ${statCard(owned.length, "Cartas únicas")}
    ${statCard(ownedCopies, "Copias totales")}
    ${statCard(base.length, "Cartas en catálogo")}
    ${statCard(pct + "%", "Colección completa")}
    ${statCard(store.getDecks().length, "Mazos guardados")}`;

  // Gráficos (carga perezosa de Chart.js)
  renderCharts({ cards: state.cards, getQty: store.getQty, scope, format: fmt })
    .catch((e) => console.warn("charts:", e));

  // Progreso por edición (respeta el formato elegido)
  const byEd = {};
  for (const c of base) {
    const e = (byEd[c.edition] ||= { name: c.editionName, total: 0, owned: 0 });
    e.total++;
    if (store.getQty(c.id) > 0) e.owned++;
  }
  const rows = Object.values(byEd)
    .filter((e) => e.total > 0)
    .sort((a, b) => b.owned / b.total - a.owned / a.total || b.total - a.total);
  $("#stats-editions").innerHTML = rows
    .map((e) => {
      const p = Math.round((e.owned / e.total) * 100);
      return `<div class="ep-row">
        <span>${escapeHtml(e.name || "—")}</span>
        <span class="ep-bar"><span class="ep-fill" style="width:${p}%"></span></span>
        <span class="muted">${e.owned}/${e.total} (${p}%)</span>
      </div>`;
    })
    .join("") || `<p class="muted">Sin datos.</p>`;
}
function statCard(num, lbl) {
  return `<div class="stat-card"><div class="num">${num}</div><div class="lbl">${lbl}</div></div>`;
}

function statsExportPDF() {
  const scope = $("#stats-scope").value, fmt = $("#stats-format").value;
  let cards = fmt ? state.cards.filter((c) => c.format === fmt) : state.cards.slice();
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

  const inv = store.getInventory();
  if (format === "json") {
    const data = {
      app: "Inventario MyL",
      exportedAt: new Date().toISOString(),
      inventory: inv,
      decks: store.getDecks(),
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
  chipTimer = setTimeout(() => { if (!cloud.isConfigured()) setChip(""); else setChip("☁ Sincronizado", "ok"); }, 2500);
}

function refreshAll() {
  applyFilters();
  if (state.view === "mazos") renderDecksView();
  if (state.view === "stats") renderStats();
}

let pushTimer;
function scheduleCloudPush() {
  if (!cloud.isConfigured()) return;
  setChip("☁ Cambios sin subir…", "sync");
  clearTimeout(pushTimer);
  pushTimer = setTimeout(doCloudPush, 1800);
}
async function doCloudPush() {
  if (!cloud.isConfigured()) return;
  try { setChip("☁ Subiendo…", "sync"); await cloud.push(store.getSnapshot()); setChip("☁ Sincronizado", "ok"); }
  catch (e) { setChip("☁ Error", "err"); showToast("Error al sincronizar: " + e.message, 4000); }
}

async function cloudReconcile() {
  if (!cloud.isConfigured()) return;
  setChip("☁ Sincronizando…", "sync");
  try {
    const remote = await cloud.pull();
    const localTs = store.getUpdatedAt();
    if (remote && remote.snapshot) {
      const rTs = new Date(remote.actualizado).getTime() || remote.snapshot.updatedAt || 0;
      if (rTs > localTs) { store.applySnapshot(remote.snapshot); refreshAll(); setChip("☁ Sincronizado", "ok"); return; }
    }
    await cloud.push(store.getSnapshot());
    setChip("☁ Sincronizado", "ok");
  } catch (e) { setChip("☁ Error", "err"); showToast("Sincronización: " + e.message, 4000); }
}

function onStoreChange(origin) {
  if (origin === "remote") { refreshAll(); return; }
  if (cloud.isConfigured()) scheduleCloudPush();
  else flashChip("Guardado ✓", "ok");
}

/* ----- Modal de datos / nube ----- */
function openSyncModal() {
  const cfg = cloud.getConfig();
  $("#cloud-url").value = cfg.url || "";
  $("#cloud-key").value = cfg.key || "";
  $("#cloud-clave").value = cfg.clave || "";
  $("#cloud-status").textContent = cloud.isConfigured() ? "Sincronización activada." : "Sincronización no configurada.";
  $("#sync-modal").classList.remove("hidden");
}
function closeSyncModal() { $("#sync-modal").classList.add("hidden"); }

function bindSyncEvents() {
  $("#open-sync").addEventListener("click", openSyncModal);
  $$("[data-close-sync]").forEach((el) => el.addEventListener("click", closeSyncModal));
  $("#sync-help-toggle").addEventListener("click", (e) => { e.preventDefault(); $("#sync-help").classList.toggle("hidden"); });
  $("#sync-copy-sql").addEventListener("click", () => {
    navigator.clipboard.writeText($("#sync-sql").textContent).then(() => showToast("SQL copiado"));
  });
  $("#sync-backup").addEventListener("click", () => exportCollection("json"));
  $("#sync-restore").addEventListener("click", () => $("#import-file").click());

  $("#cloud-connect").addEventListener("click", async () => {
    const url = $("#cloud-url").value, key = $("#cloud-key").value, clave = $("#cloud-clave").value;
    if (!url || !key || !clave) { showToast("Completa URL, clave y código de colección", 3500); return; }
    cloud.setConfig({ url, key, clave });
    $("#cloud-status").textContent = "Conectando…";
    await cloudReconcile();
    $("#cloud-status").textContent = "Sincronización activada. Tus cambios se subirán solos.";
    showToast("Nube conectada ✓");
  });
  $("#cloud-push").addEventListener("click", async () => { if (!cloud.isConfigured()) return showToast("Conecta primero"); await doCloudPush(); showToast("Subido ✓"); });
  $("#cloud-pull").addEventListener("click", async () => {
    if (!cloud.isConfigured()) return showToast("Conecta primero");
    try {
      const r = await cloud.pull();
      if (r && r.snapshot) { store.applySnapshot(r.snapshot); refreshAll(); showToast("Bajado ✓"); setChip("☁ Sincronizado", "ok"); }
      else showToast("No hay datos en la nube todavía");
    } catch (e) { showToast("Error: " + e.message, 4000); }
  });
  $("#cloud-disconnect").addEventListener("click", () => {
    cloud.disconnect(); setChip(""); $("#cloud-status").textContent = "Sincronización desactivada.";
    showToast("Nube desconectada");
  });
}

/* ===================== Navegación / eventos ===================== */
function switchView(view) {
  state.view = view;
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === view));
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + view));
  if (view === "mazos") renderDecksView();
  if (view === "stats") renderStats();
}

function bindEvents() {
  // Tabs
  $$(".tab").forEach((t) => t.addEventListener("click", () => switchView(t.dataset.view)));

  // Filtros
  const debounced = debounce(applyFilters, 180);
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
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

  // Exportar / importar
  const dd = $(".dropdown");
  $("#btn-export").addEventListener("click", () => dd.classList.toggle("open"));
  document.addEventListener("click", (e) => { if (!dd.contains(e.target)) dd.classList.remove("open"); });
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

  // Estadísticas
  ["#stats-scope", "#stats-format"].forEach((s) => $(s).addEventListener("change", renderStats));
  $("#stats-export-pdf").addEventListener("click", statsExportPDF);

  // Datos / sincronización
  bindSyncEvents();

  // Tema
  $("#theme-toggle").addEventListener("click", toggleTheme);
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
  applyTheme(cur);
  store.setSetting("theme", cur);
}
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  $("#theme-toggle").textContent = theme === "light" ? "☀️" : "🌙";
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ===================== Init ===================== */
async function init() {
  applyTheme(store.getSetting("theme") || "dark");
  bindEvents();
  store.onChange(onStoreChange);
  await loadData();
  populateFilters();
  applyFilters();
  // Sincronización en la nube (si está configurada)
  if (cloud.isConfigured()) { setChip("☁ Sincronizado", "ok"); cloudReconcile(); }
}
init();
