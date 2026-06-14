// Exportación a Excel (.xlsx) y PDF con diseño cuidado. Carga perezosa.
import { loadScript, CDN } from "./cdn.js";

const FMT_NAMES = { PE: "Primera Era", PB: "Primer Bloque", SB: "Segundo Bloque", FX: "Furia Extendido", NE: "Nueva Era / Imperio" };
const today = () => new Date().toISOString().slice(0, 10);

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
