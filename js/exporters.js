// Exportación a Excel (.xlsx) y PDF con diseño cuidado. Carga perezosa.
import { loadScript, CDN } from "./cdn.js";
import { typeIcon, raceIcon } from "./icons.js";

const FMT_NAMES = { PE: "Primera Era", PB: "Primer Bloque", SB: "Segundo Bloque", FX: "Furia Extendido", NE: "Nueva Era / Imperio" };
const today = () => new Date().toISOString().slice(0, 10);

// Logo de la app como dataURL (para incrustarlo en la imagen exportada)
let _logoData;
async function getLogoData() {
  if (_logoData !== undefined) return _logoData;
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i); i.onerror = rej;
      i.src = "./assets/myl-logo.png";
    });
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d");
    // El logo nuevo tiene fondo transparente; el PDF/Excel exportado es
    // blanco, así que se rellena blanco antes de dibujar (si no, toDataURL
    // en JPEG convierte la transparencia en negro).
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);
    _logoData = c.toDataURL("image/jpeg", 0.9);
  } catch { _logoData = ""; }
  return _logoData;
}

// Resumen agregado del conjunto de cartas
export function summarize(cards, getQty) {
  let uniqueOwned = 0, copies = 0;
  const byFmt = {};
  for (const c of cards) {
    const q = getQty(c.id);
    if (q > 0) { uniqueOwned++; copies += q; }
    const f = (byFmt[c.format] ||= { total: 0, owned: 0 });
    f.total++; if (q > 0) f.owned++;
  }
  const pct = cards.length ? Math.round((uniqueOwned / cards.length) * 100) : 0;
  return { total: cards.length, uniqueOwned, copies, pct, byFmt };
}

function rows(cards, getQty) {
  const out = [["Nombre", "Edición", "Formato", "Tipo", "Raza", "Rareza", "Coste", "Fuerza", "Cantidad"]];
  for (const c of cards) {
    out.push([c.name, c.editionName || c.edition, FMT_NAMES[c.format] || c.format,
      c.type, c.race, c.rarity, c.cost ?? "", c.strength ?? "", getQty(c.id)]);
  }
  return out;
}

// Código interno de la carta tal como lo muestra la app (badge de la
// grilla): el specialId tal cual si lo tiene, o "#NNN" para las numeradas.
// No es necesariamente el código impreso en la carta física (ej. no
// reconstruye "TKPE24-01/28") — es el identificador que este catálogo usa.
function cardCode(c) {
  if (c.specialId) return c.specialId;
  const n = parseInt(c.edid, 10);
  return Number.isFinite(n) ? "#" + String(n).padStart(3, "0") : "";
}

/* ===================== EXCEL ===================== */
export async function exportExcel(cards, getQty, scopeLabel = "Colección") {
  await loadScript(CDN.xlsx);
  const XLSX = window.XLSX;
  const s = summarize(cards, getQty);

  const resumen = [
    ["Inventario Mitos y Leyendas"],
    ["Generado", new Date().toLocaleString("es-CL")],
    ["Alcance", scopeLabel],
    [],
    ["Cartas en el listado", s.total],
    ["Cartas únicas que tengo", s.uniqueOwned],
    ["Copias totales", s.copies],
    ["Avance", s.pct + "%"],
    [],
    ["Formato", "Tengo", "Total", "Avance"],
    ...Object.entries(s.byFmt).map(([f, v]) => [FMT_NAMES[f] || f, v.owned, v.total, (v.total ? Math.round((v.owned / v.total) * 100) : 0) + "%"]),
  ];

  const wb = XLSX.utils.book_new();
  const wsR = XLSX.utils.aoa_to_sheet(resumen);
  wsR["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 10 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, wsR, "Resumen");

  const data = rows(cards, getQty);
  const wsC = XLSX.utils.aoa_to_sheet(data);
  wsC["!cols"] = [{ wch: 34 }, { wch: 26 }, { wch: 18 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 7 }, { wch: 7 }, { wch: 9 }];
  wsC["!autofilter"] = { ref: `A1:I${data.length}` };
  wsC["!freeze"] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(wb, wsC, "Cartas");

  XLSX.writeFile(wb, `inventario_myl_${today()}.xlsx`);
}

/* ===================== EXCEL: precios referenciales ===================== */
// Listado de cartas con su código, edición, el valor que el dueño le asignó
// (getMyPrice, ver store.getMyPrice) y el precio referencial de venta de
// carta suelta cruzado contra data/prices.json (mylserena.cl +
// mesaredondatcg.cl, ver docs/FUENTES-DATOS.md sección 6b) como contexto.
// Cobertura PARCIAL a propósito: solo se listan cartas con valor propio y/o
// precio de referencia, nunca un valor inventado. Cuando hay precio de
// ambas tiendas se muestran las dos columnas por separado — un solo número
// "de mercado" con 2 fuentes sería un promedio inventado sin base
// estadística real, así que se deja que el dueño decida cuál mirar.
export async function exportPricesExcel(cards, getQty, getMyPrice, scopeLabel = "Colección") {
  await loadScript(CDN.xlsx);
  const XLSX = window.XLSX;

  const v = Date.now();
  const pricesRes = await fetch(`./data/prices.json?v=${v}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const prices = pricesRes?.prices || {};

  const withPrice = cards.filter((c) => prices[c.id] || getMyPrice(c.id) != null);
  const header = ["Nombre", "Código", "Edición", "Formato", "Tengo", "Mi valor", "Precio mylserena.cl", "Precio mesaredondatcg.cl"];
  const data = [header];
  for (const c of withPrice) {
    const p = prices[c.id] || {};
    data.push([
      c.name, cardCode(c), c.editionName || c.edition, FMT_NAMES[c.format] || c.format,
      getQty(c.id), getMyPrice(c.id) ?? "", p.mylserena ?? "", p.mesaredonda ?? "",
    ]);
  }

  const info = [
    ["Precios de cartas — Inventario MyL"],
    ["Generado", new Date().toLocaleString("es-CL")],
    ["Alcance", scopeLabel],
    ["Mi valor", "el precio que tú le asignaste a la carta desde Cambio y Ventas"],
    ["Fuentes de referencia", "mylserena.cl y mesaredondatcg.cl — precio de venta de carta suelta más barato encontrado en cada tienda"],
    ["Cartas listadas", withPrice.length, "de", cards.length, "(con valor propio y/o precio de referencia)"],
    [],
    ["El precio de referencia es parcial a propósito: solo aparece en cartas cuya edición se pudo cruzar con evidencia real"],
    ["contra el código de cada tienda (no se inventan precios de ediciones sin verificar)."],
  ];

  const wb = XLSX.utils.book_new();
  const wsI = XLSX.utils.aoa_to_sheet(info);
  wsI["!cols"] = [{ wch: 30 }, { wch: 20 }, { wch: 8 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, wsI, "Info");

  const wsC = XLSX.utils.aoa_to_sheet(data);
  wsC["!cols"] = [{ wch: 34 }, { wch: 12 }, { wch: 30 }, { wch: 12 }, { wch: 7 }, { wch: 10 }, { wch: 16 }, { wch: 18 }];
  wsC["!autofilter"] = { ref: `A1:H${data.length}` };
  wsC["!freeze"] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(wb, wsC, "Precios");

  XLSX.writeFile(wb, `precios_myl_${today()}.xlsx`);
  return { total: cards.length, withPrice: withPrice.length };
}

/* ===================== PDF ===================== */
export async function exportPDF(cards, getQty, scopeLabel = "Colección") {
  await loadScript(CDN.jspdf);
  await loadScript(CDN.autotable);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const s = summarize(cards, getQty);
  const W = doc.internal.pageSize.getWidth();
  const GOLD = [201, 161, 59];

  // Encabezado
  doc.setFillColor(15, 17, 23); doc.rect(0, 0, W, 64, "F");
  doc.setTextColor(...GOLD); doc.setFont("helvetica", "bold"); doc.setFontSize(20);
  doc.text("Inventario Mitos y Leyendas", 40, 32);
  doc.setTextColor(200); doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text(`${scopeLabel}  ·  ${new Date().toLocaleString("es-CL")}`, 40, 50);

  // Tarjetas de resumen
  const cardsRow = [
    ["Cartas en listado", s.total],
    ["Únicas que tengo", s.uniqueOwned],
    ["Copias totales", s.copies],
    ["Avance", s.pct + "%"],
  ];
  let x = 40; const y = 80, cw = (W - 80) / 4 - 10;
  cardsRow.forEach(([lbl, val]) => {
    doc.setFillColor(247, 247, 250); doc.roundedRect(x, y, cw, 52, 6, 6, "F");
    doc.setTextColor(40); doc.setFont("helvetica", "bold"); doc.setFontSize(18);
    doc.text(String(val), x + 12, y + 26);
    doc.setTextColor(110); doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    doc.text(String(lbl), x + 12, y + 42);
    x += cw + 13;
  });

  // Resumen por formato
  doc.autoTable({
    startY: y + 70,
    head: [["Formato", "Tengo", "Total", "Avance"]],
    body: Object.entries(s.byFmt).map(([f, v]) => [FMT_NAMES[f] || f, v.owned, v.total, (v.total ? Math.round((v.owned / v.total) * 100) : 0) + "%"]),
    theme: "grid",
    headStyles: { fillColor: GOLD, textColor: 20 },
    styles: { fontSize: 9 },
    margin: { left: 40, right: 40 },
  });

  // Tabla de cartas
  const data = rows(cards, getQty);
  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 18,
    head: [data[0]],
    body: data.slice(1),
    theme: "striped",
    headStyles: { fillColor: [31, 35, 48], textColor: 220 },
    alternateRowStyles: { fillColor: [245, 246, 250] },
    styles: { fontSize: 7.5, cellPadding: 2.5, overflow: "ellipsize" },
    columnStyles: { 0: { cellWidth: 150 }, 6: { halign: "center" }, 7: { halign: "center" }, 8: { halign: "center", fontStyle: "bold" } },
    margin: { left: 40, right: 40 },
    didDrawPage: () => {
      const p = doc.internal.getNumberOfPages();
      doc.setFontSize(8); doc.setTextColor(150);
      doc.text(`Página ${p}`, W - 60, doc.internal.pageSize.getHeight() - 16);
    },
  });

  doc.save(`inventario_myl_${today()}.pdf`);
}

/* ===================== COLECCIÓN: PDF visual (grilla tipo "Colecciones") =====================
   A diferencia de exportPDF (tabla de texto), esto genera un PDF que se ve
   como la vista Colecciones de la app: una grilla de miniaturas de cartas,
   con esquinas redondeadas y una sombra suave (igual que .card-img en
   styles.css), seccionada por Edición y luego por Rareza/Frecuencia (con
   las cartas de cada sección ordenadas por número ascendente — el orden
   final lo arma exportCollectionAsPDF, en js/app.js, acá solo se detectan
   los cambios de edición/rareza para saber cuándo abrir una sección
   nueva). Pensado para llevarlo impreso o en el celular a una jornada de
   intercambio y detectar de un vistazo qué falta, sin tener que leer una
   lista de texto. */
const CARD_ASPECT = 88 / 63; // alto/ancho, igual que aspect-ratio del grid de Colecciones

function cardNumOf(c) {
  const n = parseInt(c.edid, 10);
  return Number.isFinite(n) ? n : null;
}

function loadImageOnce(url, timeoutMs) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const timer = setTimeout(() => resolve(null), timeoutMs);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    // Las imágenes externas (api.myl.cl, CDN del wiki) ya se pidieron antes
    // SIN crossOrigin (el <img> normal de la grilla, en cualquier vista de la
    // app) — el navegador puede reusar esa respuesta cacheada "no-CORS" en
    // vez de volver a pedirla validada, y el canvas queda "tainted" aunque el
    // servidor sí mande Access-Control-Allow-Origin. Se agrega un parámetro
    // único para forzar una petición nueva que sí pase por la validación
    // CORS. Las imágenes propias (mismo origen que la app) no lo necesitan —
    // un origen igual nunca deja el canvas "tainted" sin importar la caché,
    // así que se evita el cache-busting ahí para no perder el beneficio de
    // la caché del navegador en colecciones grandes (cientos de imágenes).
    const isExternal = /^https?:\/\//i.test(url);
    if (isExternal) {
      const sep = url.includes("?") ? "&" : "?";
      img.src = url + sep + "_pdfcors=1";
    } else {
      img.src = url;
    }
  });
}

// Varios reintentos con timeout creciente: en colecciones grandes (cientos
// de imágenes en paralelo, ver CONCURRENCY más abajo) alguna puede tardar
// más que un timeout corto por congestión de red pasajera, no porque esté
// realmente rota — el dueño del inventario prefiere que el PDF tarde lo que
// haga falta antes que dejar cartas sin imagen. 5 intentos, 8s/12s/16s/20s/24s
// (~80s de margen total en el peor caso, solo para la carta que lo necesite).
const LOAD_IMAGE_TIMEOUTS = [8000, 12000, 16000, 20000, 24000];
async function loadImageEl(url) {
  if (!url) return null;
  for (const timeoutMs of LOAD_IMAGE_TIMEOUTS) {
    const img = await loadImageOnce(url, timeoutMs);
    if (img) return img;
  }
  return null;
}

// Dibuja la miniatura de una carta en un canvas fuera de pantalla y
// devuelve su dataURL, ya recortada a esquinas redondeadas (mismo look que
// .card-img de la app) — el fondo del recorte se rellena con --bg-2 (el
// mismo tono Nocturne que usa el resto del PDF, no blanco ni transparente)
// para poder seguir exportando JPEG liviano en vez de PNG.
// Si `dim` es true, aplica blanco y negro + oscurecido a nivel de píxel
// (equivalente a filter: grayscale(1) brightness(0.5) que usa la vista
// Colecciones) para que el PDF se vea igual que la app.
function roundedRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function renderCardThumb(img, dim, w, h, label) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  const radius = Math.round(w * 0.07);
  ctx.fillStyle = "#1c1e2c"; // --bg-2 (Nocturne) — mismo fondo que el resto del PDF, no blanco
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  roundedRectPath(ctx, 0, 0, w, h, radius);
  ctx.clip();
  let drewImage = false;
  if (img && img.naturalWidth) {
    // cubre el marco manteniendo proporción (equivalente a object-fit: cover)
    const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    drewImage = true;
  }
  if (!drewImage) {
    // Sin imagen: marcador oscuro con el nombre, como .placeholder en la app
    ctx.fillStyle = dim ? "#14161e" : "#1f2330";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = dim ? "#5b6273" : "#e7e9ee";
    ctx.font = `bold ${Math.round(h * 0.09)}px Arial`;
    ctx.textAlign = "center";
    const words = String(label || "").split(" ");
    let line = "", ly = h * 0.42, lh = h * 0.11;
    for (const w2 of words) {
      const test = line ? line + " " + w2 : w2;
      if (ctx.measureText(test).width > w * 0.85 && line) { ctx.fillText(line, w / 2, ly); line = w2; ly += lh; }
      else line = test;
    }
    if (line) ctx.fillText(line, w / 2, ly);
  }
  ctx.restore();
  // getImageData/toDataURL tiran SecurityError si el canvas quedó "tainted"
  // (puede pasar aunque el servidor mande CORS, ver nota en loadImageEl) —
  // sin esto, UNA sola carta con ese problema aborta el PDF entero. El
  // recorte a esquinas ya quedó aplicado por ctx.clip() antes de dibujar,
  // así que esto solo necesita tocar los píxeles, no la forma.
  try {
    if (drewImage && dim) {
      const data = ctx.getImageData(0, 0, w, h);
      const px = data.data;
      for (let i = 0; i < px.length; i += 4) {
        const gray = (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) * 0.5;
        px[i] = px[i + 1] = px[i + 2] = gray;
      }
      ctx.putImageData(data, 0, 0);
    }
  } catch { /* canvas tainted: se deja la imagen a color, mejor que nada */ }
  try {
    return c.toDataURL("image/jpeg", 0.85);
  } catch {
    // canvas tainted pese al cache-busting de loadImageEl (caso raro): se
    // dibuja el marcador en vez de perder toda la exportación por una carta.
    return renderCardThumb(null, dim, w, h, label);
  }
}

function truncateText(doc, text, maxWidth) {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && doc.getTextWidth(s + "…") > maxWidth) s = s.slice(0, -1);
  return s + "…";
}

const FILTER_MODE_LABEL = { all: "Todas las cartas", missing: "Solo las que faltan", owned: "Solo las que tengo" };

// Calcula dónde va cada elemento (encabezado de edición, encabezado de
// rareza, carta) sin dibujar nada todavía — separa "dónde va cada cosa" de
// "cómo se dibuja", así la altura total de páginas se conoce ANTES de
// empezar a pintar la primera (para el "Página X/Y" del encabezado) sin
// duplicar la lógica de layout en dos pasadas distintas. `cards` debe venir
// YA ordenado Edición → Rareza → Número (ver sortCardsForCollectionPdf en
// app.js) — acá solo se detectan los cambios de esos dos campos para saber
// cuándo abrir una sección nueva.
function planCollectionLayout(cards, geo) {
  const { topY, bottomLimit, cols, rowH, EDITION_H, RARITY_H } = geo;
  const ops = [];
  let page = 0, y = topY, col = 0;
  let prevEdition = null, prevRarity = null;
  const newPage = () => { page++; y = topY; col = 0; };
  const ensure = (need) => { if (y + need > bottomLimit) newPage(); };

  cards.forEach((c, idx) => {
    const editionName = c.editionName || c.edition || "—";
    const rarityName = c.rarity || "—";
    const editionChanged = editionName !== prevEdition;
    const rarityChanged = editionChanged || rarityName !== prevRarity;
    if (rarityChanged && col !== 0) {
      // cierra la fila a medias de la sección anterior antes de abrir una
      // nueva — si no, el encabezado nuevo se dibuja encima de esas cartas
      // en vez de debajo (bug real: se detectó con Playwright/PyMuPDF,
      // el encabezado de la siguiente edición quedaba superpuesto sobre la
      // última fila incompleta de la anterior).
      y += rowH;
      col = 0;
    }
    if (editionChanged) {
      ensure(EDITION_H + RARITY_H + rowH);
      ops.push({ type: "edition", page, y, label: editionName });
      y += EDITION_H;
      prevEdition = editionName;
      prevRarity = null; // fuerza también el encabezado de rareza abajo
    }
    if (rarityChanged) {
      ensure(RARITY_H + rowH);
      ops.push({ type: "rarity", page, y, label: rarityName });
      y += RARITY_H;
      prevRarity = rarityName;
      col = 0; // cada grupo de rareza arranca en fila propia, no a mitad de una
    }
    if (col === 0) ensure(rowH);
    ops.push({ type: "card", page, x: geo.startX + col * (geo.cellW0 + geo.gutterX), y, idx });
    col++;
    if (col === cols) { col = 0; y += rowH; }
  });

  return { ops, totalPages: page + 1 };
}

// collection: { name } · cards: cartas YA ordenadas Edición → Rareza →
// Número (ver exportCollectionAsPDF, en js/app.js). filterMode: "all" |
// "missing" | "owned" — viene del filtro "Mostrar" de la pantalla de
// Colecciones. Con "missing"/"owned" el PDF sale a todo color (todas las
// cartas mostradas ya comparten el mismo estado, blanco y negro no aporta
// nada ahí). Con "all" (mezcla), las que faltan se ven en blanco y negro
// COMO ANTES, pero además llevan una etiqueta "FALTA" explícita — varios
// dueños de colecciones físicas leían el blanco y negro al revés (creían
// que las cartas EN COLOR eran las que faltaban), así que ya no depende
// solo del color para entenderse. onProgress(done, total): opcional, para
// la barra de progreso mientras se cargan las imágenes (puede ser lento
// con ediciones de 300+ cartas).
export async function exportCollectionPDF(collection, cards, getQty, displayName, filterMode, onProgress) {
  await loadScript(CDN.jspdf);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  // Paleta Nocturne (ver :root en css/styles.css) — el PDF ya no sale sobre
  // blanco, usa los mismos tonos oscuros que el resto de la app.
  const PAGE_BG = [22, 24, 38];     // --bg
  const HEADER_BG = [16, 18, 32];   // --bg-deep
  const BANNER_BG = [35, 37, 50];   // --bg-3
  const TRACK_BG = [28, 30, 44];    // --bg-2 (fondo de la barra de progreso vacía)
  const ACCENT = [181, 171, 252];   // --accent-2 (más claro que --accent para que el texto se lea bien sobre fondo oscuro)
  const TEXT = [233, 233, 237];     // --text
  const TEXT_DIM = [172, 172, 179]; // --text-70 mezclado sobre --bg-2, para texto secundario
  const MUTED = [150, 152, 164];    // --muted mezclado, para las cartas que faltan
  const MUTED_DIM = [110, 112, 124]; // aún más apagado, para el nombre de las que faltan
  const DIVIDER = [64, 67, 84];     // --border-strong mezclado, línea sutil de los encabezados de rareza
  const RED = [196, 60, 68];
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const mixed = filterMode !== "missing" && filterMode !== "owned";

  const ownedCount = cards.filter((c) => getQty(c.id) > 0).length;
  const pct = cards.length ? Math.round((ownedCount / cards.length) * 100) : 0;

  // Precarga las imágenes con concurrencia limitada (una edición puede tener
  // 300+ cartas); cada una se rasteriza ya con su tratamiento visual final
  // (esquinas redondeadas + blanco y negro si corresponde) para no repetir
  // el trabajo de canvas al dibujar la grilla.
  const SCALE = 3, cardW = 68 * SCALE, cardH = Math.round(cardW * CARD_ASPECT);
  const thumbs = new Array(cards.length);
  let doneCount = 0;
  const CONCURRENCY = 4; // menos que antes: menos peticiones a la vez → menos timeouts por congestión propia
  let next = 0;
  async function worker() {
    while (next < cards.length) {
      const i = next++;
      const c = cards[i];
      const isOwned = getQty(c.id) > 0;
      const dim = mixed && !isOwned;
      const img = c.image ? await loadImageEl(c.image) : null;
      const name = displayName ? displayName(c) : c.name;
      thumbs[i] = renderCardThumb(img, dim, cardW, cardH, name);
      doneCount++;
      if (onProgress) onProgress(doneCount, cards.length);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // ---- Layout: márgenes, grilla y tamaños de los encabezados de sección ----
  const marginX = 30, headerH = 66, marginBottom = 28;
  const gutterX = 10, gutterY = 8, labelH = 20;
  const cellW0 = 68, cellH0 = Math.round(cellW0 * CARD_ASPECT);
  const EDITION_H = 26, RARITY_H = 16;
  const cols = Math.max(1, Math.floor((W - marginX * 2) / (cellW0 + gutterX)));
  const rowH = cellH0 + gutterY + labelH;
  const gridW = cols * (cellW0 + gutterX) - gutterX;
  const startX = marginX + (W - marginX * 2 - gridW) / 2;
  const topY = headerH + 14;
  const bottomLimit = H - marginBottom;

  const { ops, totalPages } = planCollectionLayout(cards, {
    topY, bottomLimit, cols, rowH, EDITION_H, RARITY_H, startX, cellW0, gutterX,
  });

  function drawHeader(pageNum) {
    doc.setFillColor(...PAGE_BG); doc.rect(0, 0, W, H, "F");
    doc.setFillColor(...HEADER_BG); doc.rect(0, 0, W, headerH, "F");
    doc.setTextColor(...ACCENT); doc.setFont("helvetica", "bold"); doc.setFontSize(16);
    doc.text(collection.name, marginX, 26);
    doc.setTextColor(...TEXT_DIM); doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
    doc.text(
      `${ownedCount}/${cards.length} cartas (${pct}%)  ·  ${FILTER_MODE_LABEL[filterMode] || FILTER_MODE_LABEL.all}  ·  ` +
      `${new Date().toLocaleDateString("es-CL")}  ·  Página ${pageNum}/${totalPages}`,
      marginX, 44
    );
    const barX = marginX, barY = 52, barW = 220, barH = 6;
    doc.setFillColor(...TRACK_BG); doc.roundedRect(barX, barY, barW, barH, 3, 3, "F");
    if (pct > 0) { doc.setFillColor(...ACCENT); doc.roundedRect(barX, barY, Math.max(6, barW * pct / 100), barH, 3, 3, "F"); }
  }

  function drawEditionBanner(y, label) {
    doc.setFillColor(...BANNER_BG);
    doc.roundedRect(startX, y, gridW, 20, 4, 4, "F");
    doc.setTextColor(...ACCENT); doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text(truncateText(doc, label, gridW - 16), startX + 8, y + 14);
  }

  function drawRarityBanner(y, label) {
    const text = String(label).toUpperCase();
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(text, startX, y + 9);
    const tw = doc.getTextWidth(text);
    doc.setDrawColor(...DIVIDER); doc.setLineWidth(0.6);
    doc.line(startX + tw + 8, y + 6.5, startX + gridW, y + 6.5);
  }

  // Sombra suave + esquinas ya redondeadas en la miniatura (ver
  // renderCardThumb) — pedido por el dueño para que las cartas del PDF se
  // vean como las de la app en vez de rectángulos planos a los bordes.
  function drawCardShadow(x, y) {
    try {
      doc.saveGraphicsState();
      doc.setGState(new doc.GState({ opacity: 0.45 }));
      doc.setFillColor(0, 0, 0);
      doc.roundedRect(x + 1.8, y + 2.6, cellW0, cellH0, 5, 5, "F");
      doc.restoreGraphicsState();
    } catch { /* jsPDF sin soporte de GState en este navegador: se omite la sombra */ }
  }

  // Etiqueta "FALTA" superpuesta en la esquina — la señal explícita que no
  // depende de leer bien el blanco y negro (ver comentario de la función).
  function drawMissingBadge(x, y) {
    doc.setFillColor(...RED);
    doc.roundedRect(x - 3, y - 3, 30, 11, 3, 3, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(6.2);
    doc.text("FALTA", x - 3 + 15, y - 3 + 7.8, { align: "center" });
  }

  let drawnPage = -1;
  for (const op of ops) {
    if (op.page !== drawnPage) {
      if (drawnPage >= 0) doc.addPage();
      drawnPage = op.page;
      drawHeader(drawnPage + 1);
    }
    if (op.type === "edition") { drawEditionBanner(op.y, op.label); continue; }
    if (op.type === "rarity") { drawRarityBanner(op.y, op.label); continue; }
    // op.type === "card"
    const c = cards[op.idx];
    const owned = getQty(c.id) > 0;
    drawCardShadow(op.x, op.y);
    doc.addImage(thumbs[op.idx], "JPEG", op.x, op.y, cellW0, cellH0);
    if (mixed && !owned) drawMissingBadge(op.x, op.y);
    const num = cardNumOf(c);
    const ident = c.specialId || (num != null ? "#" + num : "");
    const labelDim = mixed && !owned;
    doc.setFont("helvetica", "bold"); doc.setFontSize(7);
    doc.setTextColor(...(labelDim ? MUTED : TEXT));
    doc.text(truncateText(doc, ident, cellW0), op.x, op.y + cellH0 + 9);
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
    doc.setTextColor(...(labelDim ? MUTED_DIM : TEXT_DIM));
    const name = displayName ? displayName(c) : c.name;
    doc.text(truncateText(doc, name, cellW0), op.x, op.y + cellH0 + 18);
  }
  if (drawnPage === -1) drawHeader(1); // sin cartas no debería pasar (ver guard en app.js), por si acaso

  const fname = collection.name.replace(/\s+/g, "_").replace(/[^\w-]/g, "");
  doc.save(`coleccion_${fname}_${today()}.pdf`);
}


/* ===================== MAZO: helpers ===================== */
function fmtDate(ts) {
  const d = ts ? new Date(ts) : new Date();
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
}
// Devuelve las cartas del mazo enriquecidas y agrupadas por tipo
function deckRows(deck, cards, getQty, displayName) {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const rows = [];
  for (const [cid, q] of Object.entries(deck.cards)) {
    const c = byId.get(cid) || { name: cid, race: "—", type: "Otro", cost: null, strength: null, rarity: "—", editionName: "" };
    rows.push({
      qty: q, name: displayName ? displayName(c) : c.name, race: c.race, type: c.type,
      cost: c.cost, strength: c.strength, rarity: c.rarity, edition: c.editionName || c.edition || "",
      own: getQty(cid), missing: Math.max(0, q - getQty(cid)),
    });
  }
  rows.sort((a, b) => (a.type || "").localeCompare(b.type || "", "es") || a.name.localeCompare(b.name, "es"));
  return rows;
}

// Resumen del mazo: totales, distribución por tipo y matriz tipo × coste
export function deckSummary(deck, cards, getQty, displayName) {
  const rows = deckRows(deck, cards, getQty, displayName);
  const total = rows.reduce((s, r) => s + r.qty, 0);
  const missing = rows.reduce((s, r) => s + r.missing, 0);
  const TYPE_ORDER = ["Aliado", "Talismán", "Tótem", "Arma", "Oro", "Monumento", "Otro"];
  const typeTotal = {}, matrix = {}, costKeys = new Set();
  for (const r of rows) {
    const t = r.type || "Otro";
    typeTotal[t] = (typeTotal[t] || 0) + r.qty;
    const ck = r.cost == null ? "–" : (r.cost >= 8 ? "8+" : String(r.cost));
    (matrix[t] ||= {})[ck] = (matrix[t][ck] || 0) + r.qty;
    costKeys.add(ck);
  }
  const ord = (k) => (k === "–" ? 999 : k === "8+" ? 100 : Number(k));
  const cols = [...costKeys].sort((a, b) => ord(a) - ord(b));
  const typesPresent = TYPE_ORDER.filter((t) => typeTotal[t]);
  for (const t of Object.keys(typeTotal)) if (!typesPresent.includes(t)) typesPresent.push(t);
  const colTotal = (c) => typesPresent.reduce((s, t) => s + (matrix[t][c] || 0), 0);
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
  return { rows, total, missing, typeTotal, matrix, cols, typesPresent, colTotal, pct };
}

/* ===================== MAZO: Excel ===================== */
export async function exportDeckExcel(deck, cards, getQty, displayName) {
  await loadScript(CDN.xlsx);
  const XLSX = window.XLSX;
  const rows = deckRows(deck, cards, getQty, displayName);
  const total = rows.reduce((s, r) => s + r.qty, 0);
  const missing = rows.reduce((s, r) => s + r.missing, 0);

  const head = [
    [`Mazo: ${deck.name}`],
    ["Actualizado", fmtDate(deck.updatedAt)],
    ["Total de cartas", total],
    ["Te faltan", missing],
    [],
    ["Cant.", "Nombre", "Raza", "Tipo", "Coste", "Fuerza", "Rareza", "Edición", "Tengo", "Faltan"],
  ];
  const body = rows.map((r) => [r.qty, r.name, r.race, r.type, r.cost ?? "", r.strength ?? "", r.rarity, r.edition, r.own, r.missing || ""]);
  const ws = XLSX.utils.aoa_to_sheet(head.concat(body));
  ws["!cols"] = [{ wch: 6 }, { wch: 30 }, { wch: 16 }, { wch: 12 }, { wch: 7 }, { wch: 7 }, { wch: 14 }, { wch: 22 }, { wch: 7 }, { wch: 7 }];
  ws["!autofilter"] = { ref: `A6:J${6 + body.length}` };
  const wb = XLSX.utils.book_new();

  // Hoja "Resumen": distribución por tipo + matriz tipo × coste
  const S = deckSummary(deck, cards, getQty, displayName);
  const resumen = [
    [`Resumen: ${deck.name}`],
    ["Actualizado", fmtDate(deck.updatedAt)],
    ["Total de cartas", S.total],
    [],
    ["Distribución por tipo", "Cantidad", "%"],
    ...S.typesPresent.map((t) => [t, S.typeTotal[t], S.pct(S.typeTotal[t]) + "%"]),
    [],
    ["Detalle por tipo y coste"],
    ["Tipo", ...S.cols, "Total"],
    ...S.typesPresent.map((t) => [t, ...S.cols.map((c) => S.matrix[t][c] || ""), S.typeTotal[t]]),
    ["Total", ...S.cols.map((c) => S.colTotal(c)), S.total],
  ];
  const wsR = XLSX.utils.aoa_to_sheet(resumen);
  wsR["!cols"] = [{ wch: 16 }, ...S.cols.map(() => ({ wch: 5 })), { wch: 7 }];
  XLSX.utils.book_append_sheet(wb, wsR, "Resumen");

  XLSX.utils.book_append_sheet(wb, ws, "Mazo");
  XLSX.writeFile(wb, `mazo_${deck.name.replace(/\s+/g, "_")}_${today()}.xlsx`);
}

/* ===================== MAZO: Imagen (PNG) ===================== */
export async function exportDeckImage(deck, cards, getQty, displayName) {
  await loadScript(CDN.html2canvas);
  const logo = await getLogoData();
  const { rows, total, missing, typeTotal, matrix, cols, typesPresent, colTotal, pct } = deckSummary(deck, cards, getQty, displayName);

  // Agrupa por tipo
  const groups = {};
  for (const r of rows) (groups[r.type] ||= []).push(r);

  const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const colsHtml = Object.entries(groups).map(([type, rs]) => `
    <div style="break-inside:avoid;margin-bottom:14px">
      <div style="color:#d9b85a;font-weight:700;font-size:15px;border-bottom:1px solid #3a3f50;padding-bottom:4px;margin-bottom:6px">
        ${typeIcon(type)} ${esc(type)} <span style="color:#8b93a7;font-weight:400">(${rs.reduce((a, r) => a + r.qty, 0)})</span>
      </div>
      ${rs.map((r) => `
        <div style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:14px">
          <span style="color:#d9b85a;font-weight:700;min-width:26px">${r.qty}×</span>
          <span style="flex:1;color:#fff">${esc(r.name)}${r.missing ? ` <span style="color:#e5707a;font-size:12px">(faltan ${r.missing})</span>` : ""}</span>
          <span style="color:#9aa1b2;font-size:12px">${raceIcon(r.race)} ${esc(r.race)}</span>
          ${r.cost != null ? `<span style="background:#1f2330;color:#e7e9ee;border-radius:10px;padding:1px 7px;font-size:12px">⛁ ${r.cost}</span>` : ""}
          ${r.strength != null ? `<span style="background:#7a2a2f;color:#fff;border-radius:6px;padding:1px 7px;font-size:12px">⚔ ${r.strength}</span>` : ""}
        </div>`).join("")}
    </div>`).join("");

  const distHtml = typesPresent.map((t) => `
    <div style="flex:1;min-width:120px;background:#171a23;border:1px solid #2b3040;border-radius:10px;padding:10px 12px">
      <div style="font-size:12px;color:#9aa1b2">${typeIcon(t)} ${esc(t)}</div>
      <div style="font-size:22px;font-weight:800;color:#d9b85a">${typeTotal[t]}<span style="font-size:12px;color:#8b93a7;font-weight:400"> · ${pct(typeTotal[t])}%</span></div>
    </div>`).join("");

  const th = (x) => `<th style="padding:5px 8px;color:#9aa1b2;font-weight:600;border-bottom:1px solid #2b3040;text-align:center">${x}</th>`;
  const td = (x, b) => `<td style="padding:5px 8px;text-align:center;${b ? "font-weight:700;color:#d9b85a" : "color:#e7e9ee"}">${x || ""}</td>`;
  const matrixHtml = `
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:10px">
      <thead><tr><th style="padding:5px 8px;text-align:left;color:#9aa1b2;border-bottom:1px solid #2b3040">Tipo</th>${cols.map((c) => th(c)).join("")}${th("Total")}</tr></thead>
      <tbody>
        ${typesPresent.map((t) => `<tr><td style="padding:5px 8px;color:#e7e9ee">${typeIcon(t)} ${esc(t)}</td>${cols.map((c) => td(matrix[t][c])).join("")}${td(typeTotal[t], true)}</tr>`).join("")}
        <tr style="border-top:1px solid #2b3040"><td style="padding:5px 8px;color:#9aa1b2;font-weight:700">Total</td>${cols.map((c) => td(colTotal(c), true)).join("")}${td(total, true)}</tr>
      </tbody>
    </table>`;

  const summaryHtml = `
    <div style="font-size:12px;color:#c9a13b;letter-spacing:1px;margin-bottom:8px">DISTRIBUCIÓN POR TIPO</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">${distHtml}</div>
    <div style="font-size:12px;color:#c9a13b;letter-spacing:1px">DETALLE POR TIPO Y COSTE</div>
    ${matrixHtml}
    <div style="height:18px"></div>`;

  const node = document.createElement("div");
  node.style.cssText = "position:fixed;left:-9999px;top:0;width:680px;padding:24px;background:#0f1117;color:#e7e9ee;font-family:Segoe UI,system-ui,sans-serif;box-sizing:border-box";
  node.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #c9a13b;padding-bottom:10px;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:12px">
        ${logo ? `<img src="${logo}" style="height:58px;width:auto;border-radius:6px" />` : ""}
        <div>
          <div style="font-size:13px;color:#c9a13b;letter-spacing:1px">INVENTARIO MyL · MAZO</div>
          <div style="font-size:24px;font-weight:800">${esc(deck.name)}</div>
        </div>
      </div>
      <div style="text-align:right;font-size:12px;color:#9aa1b2">
        <div><b style="color:#e7e9ee">${total}</b> cartas${missing ? ` · faltan ${missing}` : ""}</div>
        <div>Actualizado: ${fmtDate(deck.updatedAt)}</div>
      </div>
    </div>
    ${rows.length ? summaryHtml : ""}
    <div style="column-count:2;column-gap:24px">${colsHtml || '<span style="color:#9aa1b2">Mazo vacío</span>'}</div>
    <div style="margin-top:18px;text-align:center;color:#5b6273;font-size:11px">knomoio.github.io/InventarioMYL</div>`;
  document.body.appendChild(node);
  try {
    const canvas = await window.html2canvas(node, { backgroundColor: "#0f1117", scale: 2 });
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `mazo_${deck.name.replace(/\s+/g, "_")}_${today()}.png`;
    a.click();
  } finally {
    node.remove();
  }
}
