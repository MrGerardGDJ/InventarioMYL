// Almacenamiento local: inventario, mazos y preferencias.
// Se guarda en localStorage del navegador y notifica cambios (para sincronización
// en la nube e indicadores de "guardado").

const KEYS = {
  inv: "myl.inventory.v1",
  decks: "myl.decks.v1",
  collections: "myl.collections.v1",
  trade: "myl.trade.v1",
  tradeLog: "myl.tradelog.v1",
  saleLog: "myl.salelog.v1",
  editions: "myl.editions.v1",
  settings: "myl.settings.v1",
  meta: "myl.meta.v1",
  custom: "myl.customcards.v1",
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

/* ===== Notificación de cambios ===== */
const listeners = new Set();
export function onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); }
let meta = read(KEYS.meta, { updatedAt: 0 });
// origin: 'local' (cambio del usuario) o 'remote' (aplicado desde la nube)
function notify(origin = "local") {
  if (origin === "local") { meta.updatedAt = Date.now(); write(KEYS.meta, meta); }
  for (const cb of listeners) { try { cb(origin); } catch {} }
}
export function getUpdatedAt() { return meta.updatedAt || 0; }
export function setUpdatedAt(ts) { meta.updatedAt = ts || Date.now(); write(KEYS.meta, meta); }

/* ===== Inventario ===== */
let inventory = read(KEYS.inv, {}); // { cardId: cantidad }

export function getQty(id) { return inventory[id] || 0; }
// Ajusta cuántas copias quedan "disponibles" (trade[id]) cada vez que cambia
// la cantidad que tienes, para no tener que corregirlo a mano cada vez:
//   - Al SUMAR copias por primera vez (antes tenías 0), se reserva 1 copia
//     de colección y el resto entra disponible por defecto.
//   - Al sumar copias teniendo ya al menos 1, las nuevas entran disponibles
//     completas (no se vuelve a reservar una copia de colección).
//   - Al RESTAR copias, se resta primero de lo disponible (protege la copia
//     de colección mientras te quede al menos 1 copia en el inventario).
// Sigue siendo editable a mano después (setTradeQty/addTradeQty) — esto solo
// fija el valor por defecto al cambiar la cantidad, no un tope fijo.
function autoAdjustTradeOnQtyChange(id, prevQty, newQty) {
  const delta = newQty - prevQty;
  if (delta === 0) return;
  let t = trade[id] || 0;
  if (delta > 0) t += prevQty === 0 ? Math.max(0, delta - 1) : delta;
  else t += delta;
  t = Math.max(0, Math.min(t, newQty));
  if (t === 0) delete trade[id]; else trade[id] = t;
  write(KEYS.trade, trade);
}
export function setQty(id, qty) {
  qty = Math.max(0, Math.floor(qty || 0));
  const prevQty = inventory[id] || 0;
  if (qty === 0) delete inventory[id];
  else inventory[id] = qty;
  autoAdjustTradeOnQtyChange(id, prevQty, qty);
  write(KEYS.inv, inventory);
  notify();
}
export function addQty(id, delta) { setQty(id, getQty(id) + delta); return getQty(id); }
export function ownedCount() { return Object.keys(inventory).length; }
export function totalCards() { return Object.values(inventory).reduce((a, b) => a + b, 0); }
export function getInventory() { return { ...inventory }; }
export function replaceInventory(obj, origin = "local") {
  inventory = {};
  for (const [id, qty] of Object.entries(obj || {})) {
    const n = Math.max(0, Math.floor(Number(qty) || 0));
    if (n > 0) inventory[id] = n;
  }
  write(KEYS.inv, inventory);
  notify(origin);
}
export function mergeInventory(obj) {
  for (const [id, qty] of Object.entries(obj || {})) {
    const n = Math.max(0, Math.floor(Number(qty) || 0));
    if (n > 0) inventory[id] = (inventory[id] || 0) + n;
  }
  write(KEYS.inv, inventory);
  notify();
}

/* ===== Mazos ===== */
let decks = read(KEYS.decks, []);

export function getDecks() { return decks; }
export function getDeck(id) { return decks.find((d) => d.id === id) || null; }
export function createDeck(name) {
  const deck = { id: "d" + Date.now().toString(36), name: name || "Mazo nuevo", cards: {}, updatedAt: Date.now() };
  decks.push(deck);
  write(KEYS.decks, decks);
  notify();
  return deck;
}
export function renameDeck(id, name) {
  const d = getDeck(id);
  if (d) { d.name = name; d.updatedAt = Date.now(); write(KEYS.decks, decks); notify(); }
}
export function deleteDeck(id) {
  decks = decks.filter((d) => d.id !== id);
  write(KEYS.decks, decks);
  notify();
}
export function deckAdd(deckId, cardId, delta = 1) {
  const d = getDeck(deckId);
  if (!d) return;
  const n = Math.max(0, (d.cards[cardId] || 0) + delta);
  if (n === 0) delete d.cards[cardId];
  else d.cards[cardId] = n;
  d.updatedAt = Date.now();
  write(KEYS.decks, decks);
  notify();
}
export function deckCount(deckId) {
  const d = getDeck(deckId);
  if (!d) return 0;
  return Object.values(d.cards).reduce((a, b) => a + b, 0);
}
export function replaceDecks(arr, origin = "local") {
  if (Array.isArray(arr)) { decks = arr; write(KEYS.decks, decks); notify(origin); }
}

/* ===== Cartas para cambio (inventario de intercambio) =====
   trade: { cardId: copias ofrecidas }. Copias del inventario marcadas como
   disponibles para cambiar/vender/usar en mazos; nunca puede haber más
   ofrecidas que copias en el inventario (setQty y setTradeQty lo garantizan).
   Su valor por defecto se ajusta solo al cambiar la cantidad que tienes (ver
   autoAdjustTradeOnQtyChange) pero sigue siendo editable a mano. El
   descuento por copias usadas en mazos NO se guarda acá — ver getAvailableQty,
   que lo resta en vivo para no desincronizarse si editas mazos seguido.
   tradeLog: historial de intercambios registrados, del más reciente al más
   antiguo: [{ given: cardId entregada, received: cardId recibida, date }]. */
let trade = read(KEYS.trade, {});
let tradeLog = read(KEYS.tradeLog, []);

export function getTradeQty(id) { return trade[id] || 0; }
export function setTradeQty(id, n) {
  n = Math.max(0, Math.floor(n || 0));
  const owned = getQty(id);
  if (n > owned) n = owned; // tope: lo que realmente tienes
  if (n === 0) delete trade[id];
  else trade[id] = n;
  write(KEYS.trade, trade);
  notify();
}
export function addTradeQty(id, delta) { setTradeQty(id, getTradeQty(id) + delta); return getTradeQty(id); }
export function getTradeList() { return { ...trade }; }
// Cuántas copias de esta carta están comprometidas ahora mismo en TUS mazos
// (sumado entre todos, no solo el activo — si dos mazos usan la misma carta
// compiten por las mismas copias físicas).
function deckUsageForCard(id) {
  let total = 0;
  for (const d of decks) total += d.cards[id] || 0;
  return total;
}
// Disponible EN VIVO: lo que marcaste para cambio/venta menos lo que tus
// mazos están usando ahora mismo. No se guarda aparte (evita que quede
// desincronizado si editas mazos seguido) — se recalcula cada vez que se pide.
export function getAvailableQty(id) {
  return Math.max(0, getTradeQty(id) - deckUsageForCard(id));
}
export function replaceTrade(obj, origin = "local") {
  trade = {};
  for (const [id, n] of Object.entries(obj || {})) {
    const v = Math.max(0, Math.floor(Number(n) || 0));
    if (v > 0) trade[id] = v;
  }
  write(KEYS.trade, trade);
  notify(origin);
}
export function getTradeLog() { return tradeLog.slice(); }
export function addTradeLogEntry(entry) {
  tradeLog.unshift({ given: entry.given, received: entry.received, date: entry.date || Date.now() });
  write(KEYS.tradeLog, tradeLog);
  notify();
}
export function replaceTradeLog(arr, origin = "local") {
  if (Array.isArray(arr)) { tradeLog = arr; write(KEYS.tradeLog, tradeLog); notify(origin); }
}

/* ===== Historial de ventas =====
   saleLog: [{ cardId, qty, price (CLP total de esa venta, o null si no se
   ingresó), date }], del más reciente al más antiguo. La venta en sí solo
   descuenta inventory/trade (mismas funciones de arriba) — esto es
   puramente el registro. */
let saleLog = read(KEYS.saleLog, []);

export function getSaleLog() { return saleLog.slice(); }
export function addSaleLogEntry(entry) {
  saleLog.unshift({ cardId: entry.cardId, qty: entry.qty || 1, price: entry.price ?? null, date: entry.date || Date.now() });
  write(KEYS.saleLog, saleLog);
  notify();
}
export function replaceSaleLog(arr, origin = "local") {
  if (Array.isArray(arr)) { saleLog = arr; write(KEYS.saleLog, saleLog); notify(origin); }
}

/* ===== Colecciones (una o más ediciones que se quieren completar) =====
   Una colección NO guarda cantidades: es una vista de un grupo de ediciones
   sobre el inventario (ej. agrupar todas las "Mundos Perdidos" de un año en
   una sola colección que se va completando con cada lanzamiento). Borrarla
   nunca borra cantidades.
   Campo `editions`: array de slugs, SIEMPRE no vacío. Formato viejo (una sola
   edición en `edition`, de antes de que existiera esta función): se migra acá
   una sola vez al cargar — así el resto de la app (y una colección que venga
   de la nube de otro dispositivo con la versión vieja) nunca necesita el
   fallback, siempre puede leer `col.editions` directo. */
function migrateCollection(c) {
  if (Array.isArray(c.editions) && c.editions.length) return c;
  return { ...c, editions: c.edition ? [c.edition] : [] };
}
let collections = read(KEYS.collections, []).map(migrateCollection).filter((c) => c.editions.length);
write(KEYS.collections, collections); // persiste la migración, no solo en memoria

export function getCollections() { return collections; }
export function getCollection(id) { return collections.find((c) => c.id === id) || null; }
export function createCollection(name, editions) {
  const eds = Array.isArray(editions) ? editions.filter(Boolean) : [editions].filter(Boolean);
  const col = { id: "c" + Date.now().toString(36), name: name || "Colección", editions: eds, updatedAt: Date.now() };
  collections.push(col);
  write(KEYS.collections, collections);
  notify();
  return col;
}
export function renameCollection(id, name) {
  const c = getCollection(id);
  if (c) { c.name = name; c.updatedAt = Date.now(); write(KEYS.collections, collections); notify(); }
}
// Reemplaza las ediciones agrupadas de una colección ya creada (agregar o
// quitar ediciones sin tener que recrearla, lo que perdería su nombre y
// posición en la lista). Ignora vacío: una colección siempre necesita al
// menos una edición.
export function setCollectionEditions(id, editions) {
  const c = getCollection(id);
  const eds = Array.isArray(editions) ? editions.filter(Boolean) : [];
  if (c && eds.length) { c.editions = eds; c.updatedAt = Date.now(); write(KEYS.collections, collections); notify(); }
}
export function deleteCollection(id) {
  collections = collections.filter((c) => c.id !== id);
  write(KEYS.collections, collections);
  notify();
}
// Reordena la lista de colecciones (arrastrar y soltar en el panel lateral).
// `orderedIds` trae el orden deseado; cualquier id que falte (no debería
// pasar) se agrega al final para no perder colecciones.
export function reorderCollections(orderedIds) {
  const byId = new Map(collections.map((c) => [c.id, c]));
  const reordered = orderedIds.map((id) => byId.get(id)).filter(Boolean);
  for (const c of collections) if (!orderedIds.includes(c.id)) reordered.push(c);
  collections = reordered;
  write(KEYS.collections, collections);
  notify();
}
export function replaceCollections(arr, origin = "local") {
  if (Array.isArray(arr)) {
    collections = arr.map(migrateCollection).filter((c) => c.editions.length);
    write(KEYS.collections, collections);
    notify(origin);
  }
}

/* ===== Migración de claves de carta (legacyId → id estable) =====
   Remapea inventario y mazos. Idempotente: solo actúa sobre claves presentes
   en el mapa y solo escribe/notifica si hubo cambios. */
export function migrateKeys(map) {
  let changed = false;
  const remap = (obj) => {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      const nk = map[k] || k;
      if (nk !== k) changed = true;
      out[nk] = (out[nk] || 0) + v;
    }
    return out;
  };
  const newInv = remap(inventory);
  for (const d of decks) d.cards = remap(d.cards);
  if (changed) {
    inventory = newInv;
    write(KEYS.inv, inventory);
    write(KEYS.decks, decks);
    notify();
  }
  return changed;
}

/* ===== Ediciones personalizadas del usuario =====
   [{ slug, name, description, format, expectedTotal, updatedAt }]
   El slug es la identidad (las cartas manuales se ligan por su campo edition);
   renombrar cambia solo el nombre visible y NO el slug, así las cartas y
   colecciones existentes no se desconectan. */
let customEditions = read(KEYS.editions, []);

export function getCustomEditions() { return customEditions.slice(); }
export function getCustomEdition(slug) { return customEditions.find((e) => e.slug === slug) || null; }
export function createCustomEdition(ed) {
  const e = {
    slug: ed.slug,
    name: ed.name || ed.slug,
    description: ed.description || "",
    format: ed.format || "OT",
    expectedTotal: ed.expectedTotal ?? null,
    updatedAt: Date.now(),
  };
  customEditions.push(e);
  write(KEYS.editions, customEditions);
  notify();
  return e;
}
export function updateCustomEdition(slug, patch) {
  const i = customEditions.findIndex((e) => e.slug === slug);
  if (i === -1) return;
  customEditions[i] = { ...customEditions[i], ...patch, slug, updatedAt: Date.now() };
  write(KEYS.editions, customEditions);
  notify();
}
export function deleteCustomEdition(slug) {
  customEditions = customEditions.filter((e) => e.slug !== slug);
  write(KEYS.editions, customEditions);
  notify();
}
export function replaceCustomEditions(arr, origin = "local") {
  if (Array.isArray(arr)) { customEditions = arr; write(KEYS.editions, customEditions); notify(origin); }
}
// Renombrar en bloque: actualiza el nombre visible de la edición en todas sus
// cartas manuales de una sola vez (un solo write/notify)
export function renameEditionOnCards(slug, newName) {
  let changed = false;
  for (const c of customCards) {
    if (c.edition === slug && c.editionName !== newName) { c.editionName = newName; changed = true; }
  }
  if (changed) { write(KEYS.custom, customCards); notify(); }
  return changed;
}

/* ===== Cartas manuales del usuario (se sincronizan en la nube) ===== */
let customCards = read(KEYS.custom, []);
export function getCustomCards() { return customCards.slice(); }
export function addCustomCard(card) {
  // Sufijo aleatorio: Date.now() solo no basta cuando se agregan varias cartas
  // en el mismo milisegundo (p. ej. importación CSV) y los ids chocarían
  const id = card.id || "user__" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
  const c = { ...card, id, custom: true, userCustom: true };
  customCards.push(c);
  write(KEYS.custom, customCards);
  notify();
  return c;
}
export function updateCustomCard(id, patch) {
  const i = customCards.findIndex((c) => c.id === id);
  if (i === -1) return;
  customCards[i] = { ...customCards[i], ...patch, id, custom: true, userCustom: true };
  write(KEYS.custom, customCards);
  notify();
}
export function deleteCustomCard(id) {
  customCards = customCards.filter((c) => c.id !== id);
  write(KEYS.custom, customCards);
  notify();
}

/* ===== Snapshot completo (para respaldo / nube) ===== */
export function getSnapshot() {
  return {
    inventory: getInventory(),
    decks: JSON.parse(JSON.stringify(decks)),
    collections: JSON.parse(JSON.stringify(collections)),
    trade: getTradeList(),
    tradeLog: tradeLog.slice(),
    saleLog: saleLog.slice(),
    editions: getCustomEditions(),
    customCards: getCustomCards(),
    updatedAt: getUpdatedAt(),
  };
}
// Aplica un snapshot completo SIN marcarlo como cambio local (origin 'remote').
export function applySnapshot(snap) {
  if (!snap) return;
  replaceInventory(snap.inventory || {}, "remote");
  if (Array.isArray(snap.decks)) { decks = snap.decks; write(KEYS.decks, decks); }
  if (Array.isArray(snap.collections)) {
    collections = snap.collections.map(migrateCollection).filter((c) => c.editions.length);
    write(KEYS.collections, collections);
  }
  if (snap.trade && typeof snap.trade === "object") { trade = { ...snap.trade }; write(KEYS.trade, trade); }
  if (Array.isArray(snap.tradeLog)) { tradeLog = snap.tradeLog; write(KEYS.tradeLog, tradeLog); }
  if (Array.isArray(snap.saleLog)) { saleLog = snap.saleLog; write(KEYS.saleLog, saleLog); }
  if (Array.isArray(snap.editions)) { customEditions = snap.editions; write(KEYS.editions, customEditions); }
  if (Array.isArray(snap.customCards)) { customCards = snap.customCards; write(KEYS.custom, customCards); }
  if (snap.updatedAt) setUpdatedAt(snap.updatedAt);
  notify("remote");
}

/* ===== Preferencias ===== */
let settings = read(KEYS.settings, { theme: "dark", activeDeckId: null });
export function getSetting(k) { return settings[k]; }
export function setSetting(k, v) { settings[k] = v; write(KEYS.settings, settings); }
