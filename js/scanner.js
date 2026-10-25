// Escáner de cartas con cámara (fase 1): lee el NOMBRE impreso con OCR
// (Tesseract.js, cargado bajo demanda desde CDN) y propone las cartas del
// catálogo más parecidas. Nunca agrega sola: el usuario toca el candidato
// correcto (un mismo nombre puede existir en varias ediciones).
const TESS_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
const CARD_RATIO = 63 / 88;          // ancho / alto de una carta
const GUIDE_H = 0.86;                // alto del marco guía respecto al video
const NAME_BAND = { top: 0.035, h: 0.13 }; // franja del nombre, relativa al alto de la carta

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ ]+/g, " ").replace(/\s+/g, " ").trim();
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
const sim = (a, b) => (a && b ? 1 - lev(a, b) / Math.max(a.length, b.length) : 0);

// Mejores nombres del catálogo para un texto OCR (puede traer basura y varias líneas).
export function matchNames(ocrText, nameIndex, limit = 4) {
  const lines = String(ocrText || "").split(/\n+/).map(norm).filter((l) => l.length >= 3);
  if (!lines.length) return [];
  const joined = norm(ocrText);
  const probes = [...new Set([...lines, joined])];
  const scored = [];
  for (const [n, cards] of nameIndex) {
    let best = 0;
    for (const p of probes) {
      let s = sim(p, n);
      if (n.length >= 4 && p.length > n.length + 2) { // el nombre puede ir rodeado de basura: compara con ventanas
        for (let i = 0; i + n.length <= p.length; i++) s = Math.max(s, sim(p.slice(i, i + n.length), n) - 0.08);
      }
      best = Math.max(best, s);
    }
    if (n.length < 4 && best < 0.99) continue; // nombres cortísimos: solo calce exacto
    if (best >= 0.5) scored.push({ name: n, score: best, cards });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

let tessPromise = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  return (tessPromise ||= new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = TESS_URL; s.onload = () => res(window.Tesseract);
    s.onerror = () => { tessPromise = null; rej(new Error("No se pudo cargar el lector de texto (¿sin internet?)")); };
    document.head.appendChild(s);
  }));
}
let workerPromise = null;
function getWorker() {
  return (workerPromise ||= loadTesseract().then(async (T) => {
    const w = await T.createWorker("spa");
    await w.setParameters({ tessedit_pageseg_mode: "6" });
    return w;
  }).catch((e) => { workerPromise = null; throw e; }));
}

// Escala de grises con contraste; opcionalmente invertido (texto claro sobre fondo oscuro).
function prepare(src, invert) {
  const W = 700, H = Math.max(40, Math.round(src.height * (W / src.width)));
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d"); ctx.drawImage(src, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H), px = d.data;
  let lo = 255, hi = 0;
  for (let i = 0; i < px.length; i += 4) { const g = px[i] * .3 + px[i + 1] * .59 + px[i + 2] * .11; px[i] = g; lo = Math.min(lo, g); hi = Math.max(hi, g); }
  const k = hi > lo ? 255 / (hi - lo) : 1;
  for (let i = 0; i < px.length; i += 4) {
    let g = (px[i] - lo) * k; if (invert) g = 255 - g;
    px[i] = px[i + 1] = px[i + 2] = g;
  }
  ctx.putImageData(d, 0, 0);
  return c;
}

/**
 * opts: { mode: "inventory"|"deck", cards, filter?, deckName?, getQty, displayName, onConfirm(list:[{id,qty}]), toast }
 */
export function openScanner(opts) {
  const pool = opts.filter ? opts.cards.filter(opts.filter) : opts.cards;
  const nameIndex = new Map();
  for (const c of pool) { const n = norm(opts.displayName(c)); if (n) (nameIndex.get(n) || nameIndex.set(n, []).get(n)).push(c); }

  const batch = new Map(); // id -> qty
  const root = document.createElement("div");
  root.className = "scan-overlay";
  root.innerHTML = `
    <div class="scan-box">
      <div class="scan-head">
        <b>${opts.mode === "deck" ? "Escanear al mazo" + (opts.deckName ? " · " + esc(opts.deckName) : "") : "Escanear a mi colección"}</b>
        <button class="scan-x" aria-label="Cerrar"><i class="ph ph-x"></i></button>
      </div>
      <div class="scan-cam"><video playsinline muted></video><div class="scan-guide"><div class="scan-band"></div></div></div>
      <p class="scan-hint muted">Encuadra la carta dentro del marco, con buena luz y sin reflejos; el nombre debe quedar en la franja marcada.</p>
      <div class="scan-actions">
        <button class="btn primary scan-shoot"><i class="ph ph-camera"></i> Escanear</button>
        <input class="scan-q" type="search" placeholder="…o busca por nombre" autocomplete="off" />
      </div>
      <div class="scan-status muted"></div>
      <div class="scan-cands"></div>
      <div class="scan-batch"></div>
    </div>`;
  document.body.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const video = $("video"), statusEl = $(".scan-status"), candsEl = $(".scan-cands"), batchEl = $(".scan-batch");
  let stream = null, busy = false;

  const close = () => { stream?.getTracks().forEach((t) => t.stop()); root.remove(); };
  $(".scan-x").onclick = () => { if (!batch.size || confirm("Hay cartas sin confirmar. ¿Cerrar y descartarlas?")) close(); };

  function renderBatch() {
    const total = [...batch.values()].reduce((a, b) => a + b, 0);
    if (!total) { batchEl.innerHTML = ""; return; }
    const byId = new Map(pool.map((c) => [c.id, c]));
    batchEl.innerHTML = `<div class="scan-batch-title">Por agregar · ${total} carta${total === 1 ? "" : "s"}</div>` +
      [...batch].map(([id, q]) => `<div class="scan-brow" data-id="${esc(id)}">
        <span class="scan-bname">${esc(opts.displayName(byId.get(id)))} <small class="muted">${esc(byId.get(id).editionName || "")}</small></span>
        <button class="scan-step" data-d="-1"><i class="ph ph-minus"></i></button><b>${q}</b><button class="scan-step" data-d="1"><i class="ph ph-plus"></i></button>
      </div>`).join("") +
      `<button class="btn primary scan-confirm"><i class="ph ph-check"></i> Confirmar ${opts.mode === "deck" ? "en el mazo" : "en mi colección"}</button>`;
    batchEl.querySelectorAll(".scan-brow").forEach((r) => r.querySelectorAll(".scan-step").forEach((b) => b.onclick = () => {
      const id = r.dataset.id, q = (batch.get(id) || 0) + Number(b.dataset.d);
      q > 0 ? batch.set(id, q) : batch.delete(id); renderBatch();
    }));
    batchEl.querySelector(".scan-confirm").onclick = () => {
      opts.onConfirm([...batch].map(([id, qty]) => ({ id, qty })));
      close();
    };
  }
  function add(id) { batch.set(id, (batch.get(id) || 0) + 1); renderBatch(); opts.toast?.("Añadida ✓", 900); }

  function renderCands(matches, note) {
    if (!matches.length) { candsEl.innerHTML = ""; statusEl.textContent = note || "No encontré coincidencias. Prueba de nuevo o busca por nombre."; return; }
    statusEl.textContent = note || "Toca la carta correcta (si hay varias ediciones, elige la que tienes en la mano):";
    candsEl.innerHTML = matches.map((m) => `<div class="scan-cand">
      <div class="scan-cname">${esc(opts.displayName(m.cards[0]))} <small class="muted">${Math.round(m.score * 100)}%</small></div>
      <div class="scan-variants">${m.cards.slice(0, 12).map((c) => `<button class="scan-var" data-id="${esc(c.id)}">
        ${c.image ? `<img loading="lazy" src="${esc(c.image)}" alt="" />` : `<span class="scan-noimg"></span>`}
        <span>${esc(c.editionName || "")}${c.rarity ? " · " + esc(c.rarity) : ""}</span></button>`).join("")}</div>
    </div>`).join("");
    candsEl.querySelectorAll(".scan-var").forEach((b) => b.onclick = () => add(b.dataset.id));
  }

  $(".scan-q").oninput = () => {
    const q = norm($(".scan-q").value);
    if (q.length < 2) { candsEl.innerHTML = ""; statusEl.textContent = ""; return; }
    const list = [...nameIndex].filter(([n]) => n.includes(q)).slice(0, 6).map(([n, cards]) => ({ name: n, score: 1, cards }));
    renderCands(list, list.length ? "Resultados de la búsqueda:" : "Sin resultados.");
  };

  $(".scan-shoot").onclick = async () => {
    if (busy || !video.videoWidth) return;
    busy = true; const btn = $(".scan-shoot"); btn.disabled = true;
    try {
      const vw = video.videoWidth, vh = video.videoHeight;
      const ch = vh * GUIDE_H, cw = ch * CARD_RATIO;
      const cx = (vw - cw) / 2, cy = (vh - ch) / 2;
      const sx = cx + cw * 0.04, sy = cy + ch * NAME_BAND.top, sw = cw * 0.92, sh = ch * NAME_BAND.h;
      const crop = document.createElement("canvas"); crop.width = sw; crop.height = sh;
      crop.getContext("2d").drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
      statusEl.textContent = "Leyendo carta… (la primera vez descarga el lector de texto)";
      const worker = await getWorker();
      let best = [];
      for (const inv of [false, true]) {
        const { data } = await worker.recognize(prepare(crop, inv));
        const m = matchNames(data.text, nameIndex);
        if (m.length && (!best.length || m[0].score > best[0].score)) best = m;
        if (best.length && best[0].score >= 0.9) break;
      }
      renderCands(best);
    } catch (e) {
      statusEl.textContent = "Error: " + e.message;
    } finally { busy = false; btn.disabled = false; }
  };

  navigator.mediaDevices?.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } }, audio: false })
    .then((s) => { stream = s; video.srcObject = s; return video.play(); })
    .catch((e) => { statusEl.textContent = "No pude abrir la cámara (" + (e.name || e.message) + "). Puedes buscar por nombre igualmente."; $(".scan-shoot").disabled = true; });
  if (!navigator.mediaDevices?.getUserMedia) { statusEl.textContent = "Este navegador no permite usar la cámara. Busca por nombre."; $(".scan-shoot").disabled = true; }
}
