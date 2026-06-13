// Almacenamiento local: inventario, mazos y preferencias.
// Todo se guarda en localStorage del navegador del usuario.

const KEYS = {
  inv: "myl.inventory.v1",
  decks: "myl.decks.v1",
  settings: "myl.settings.v1",
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

/* ===== Inventario ===== */
let inventory = read(KEYS.inv, {}); // { cardId: cantidad }

export function getQty(id) {
  return inventory[id] || 0;
}
export function setQty(id, qty) {
  qty = Math.max(0, Math.floor(qty || 0));
  if (qty === 0) delete inventory[id];
  else inventory[id] = qty;
  write(KEYS.inv, inventory);
}
export function addQty(id, delta) {
  setQty(id, getQty(id) + delta);
  return getQty(id);
}
export function ownedCount() {
  return Object.keys(inventory).length;
}
export function totalCards() {
  return Object.values(inventory).reduce((a, b) => a + b, 0);
}
export function getInventory() {
  return { ...inventory };
}
export function replaceInventory(obj) {
  inventory = {};
  for (const [id, qty] of Object.entries(obj || {})) {
    const n = Math.max(0, Math.floor(Number(qty) || 0));
    if (n > 0) inventory[id] = n;
  }
  write(KEYS.inv, inventory);
}
export function mergeInventory(obj) {
  for (const [id, qty] of Object.entries(obj || {})) {
    const n = Math.max(0, Math.floor(Number(qty) || 0));
    if (n > 0) inventory[id] = (inventory[id] || 0) + n;
  }
  write(KEYS.inv, inventory);
}

/* ===== Mazos ===== */
let decks = read(KEYS.decks, []); // [{id, name, cards:{cardId:qty}}]

export function getDecks() {
  return decks;
}
export function getDeck(id) {
  return decks.find((d) => d.id === id) || null;
}
export function createDeck(name) {
  const deck = { id: "d" + Date.now().toString(36), name: name || "Mazo nuevo", cards: {} };
  decks.push(deck);
  write(KEYS.decks, decks);
  return deck;
}
export function renameDeck(id, name) {
  const d = getDeck(id);
  if (d) { d.name = name; write(KEYS.decks, decks); }
}
export function deleteDeck(id) {
  decks = decks.filter((d) => d.id !== id);
  write(KEYS.decks, decks);
}
export function deckAdd(deckId, cardId, delta = 1) {
  const d = getDeck(deckId);
  if (!d) return;
  const n = Math.max(0, (d.cards[cardId] || 0) + delta);
  if (n === 0) delete d.cards[cardId];
  else d.cards[cardId] = n;
  write(KEYS.decks, decks);
}
export function deckCount(deckId) {
  const d = getDeck(deckId);
  if (!d) return 0;
  return Object.values(d.cards).reduce((a, b) => a + b, 0);
}
export function replaceDecks(arr) {
  if (Array.isArray(arr)) { decks = arr; write(KEYS.decks, decks); }
}

/* ===== Preferencias ===== */
let settings = read(KEYS.settings, { theme: "dark", activeDeckId: null });

export function getSetting(k) { return settings[k]; }
export function setSetting(k, v) { settings[k] = v; write(KEYS.settings, settings); }
