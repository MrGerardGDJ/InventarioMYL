// Gráficos de la vista Estadísticas usando Chart.js (carga perezosa).
import { loadScript, CDN } from "./cdn.js";

const charts = {}; // id -> instancia Chart
// Paleta categórica Nocturne: empieza en el acento del sistema y se abre a
// tonos que conviven bien con el morado (--color-accent #9184d9) sin
// competir con él en los gráficos de una sola serie (ver ACCENT_SOLO).
const PALETTE = [
  "#9184d9", "#b5abfc", "#5b8def", "#46a758", "#e5484d", "#f2c14e",
  "#f59e0b", "#14b8a6", "#ec4899", "#64748b", "#84cc16", "#06b6d4",
  "#5d5294", "#ef4444", "#22c55e", "#eab308",
];
const ACCENT_SOLO = ["#b5abfc", "#9184d9", "#5d5294"]; // razas, coste, rareza

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function draw(id, config) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  if (charts[id]) charts[id].destroy();
  charts[id] = new window.Chart(canvas.getContext("2d"), config);
}

function countBy(cards, keyFn) {
  const m = new Map();
  for (const c of cards) {
    const k = keyFn(c);
    if (k == null || k === "—" || k === "") continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

function sortedEntries(map, limit) {
  let e = [...map.entries()].sort((a, b) => b[1] - a[1]);
  if (limit && e.length > limit) {
    const top = e.slice(0, limit);
    const rest = e.slice(limit).reduce((s, [, v]) => s + v, 0);
    if (rest > 0) top.push(["Otras", rest]);
    e = top;
  }
  return e;
}

const FMT_NAMES = { PE: "Primera Era", PB: "Primer Bloque", SB: "Segundo Bloque", FX: "Furia Ext.", NE: "Nueva Era/IMP" };

function setChartDefaults() {
  const Chart = window.Chart;
  Chart.defaults.color = cssVar("--color-text-55") || "rgba(233,233,237,.55)";
  Chart.defaults.font.family = cssVar("--font-body") || "Inter, system-ui, sans-serif";
  Chart.defaults.plugins.legend.labels.boxWidth = 12;
}

export async function renderCharts({ cards, getQty, scope = "all", format = "" }) {
  await loadScript(CDN.chart);
  setChartDefaults();

  // Conjunto base (respeta formato elegido en estadísticas)
  const base = format ? cards.filter((c) => c.format === format) : cards;
  // Conjunto según alcance para los gráficos por dimensión
  const set = base.filter((c) => {
    const q = getQty(c.id);
    if (scope === "owned") return q > 0;
    if (scope === "missing") return q === 0;
    return true;
  });

  const baseOpts = (legend = "right") => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: legend } },
  });

  // El progreso poseídas/faltantes ahora lo muestra el anillo SVG del
  // cintillo (ver renderStats() en app.js) — antes era este doughnut.

  // 2) Por formato
  const byFmt = countBy(set, (c) => c.format);
  draw("chart-format", {
    type: "doughnut",
    data: {
      labels: [...byFmt.keys()].map((k) => FMT_NAMES[k] || k),
      datasets: [{ data: [...byFmt.values()], backgroundColor: PALETTE, borderWidth: 0 }],
    },
    options: baseOpts("right"),
  });

  // 3) Top razas
  const byRace = sortedEntries(countBy(set, (c) => c.race), 12);
  draw("chart-race", {
    type: "bar",
    data: {
      labels: byRace.map((e) => e[0]),
      datasets: [{ label: "Cartas", data: byRace.map((e) => e[1]), backgroundColor: ACCENT_SOLO[0], borderRadius: 4 }],
    },
    options: { ...baseOpts(), indexAxis: "y", plugins: { legend: { display: false } } },
  });

  // 4) Curva de coste
  const costMap = new Map();
  for (const c of set) {
    if (c.cost == null) continue;
    const k = c.cost >= 11 ? "11+" : String(c.cost);
    costMap.set(k, (costMap.get(k) || 0) + 1);
  }
  const costKeys = [...Array(11).keys()].map(String).concat("11+").filter((k) => costMap.has(k));
  draw("chart-cost", {
    type: "bar",
    data: {
      labels: costKeys,
      datasets: [{ label: "Cartas", data: costKeys.map((k) => costMap.get(k) || 0), backgroundColor: ACCENT_SOLO[1], borderRadius: 4 }],
    },
    options: { ...baseOpts(), plugins: { legend: { display: false } } },
  });

  // 5) Por tipo
  const byType = sortedEntries(countBy(set, (c) => c.type));
  draw("chart-type", {
    type: "doughnut",
    data: {
      labels: byType.map((e) => e[0]),
      datasets: [{ data: byType.map((e) => e[1]), backgroundColor: PALETTE, borderWidth: 0 }],
    },
    options: baseOpts("right"),
  });

  // 6) Por rareza
  const byRarity = sortedEntries(countBy(set, (c) => c.rarity), 10);
  draw("chart-rarity", {
    type: "bar",
    data: {
      labels: byRarity.map((e) => e[0]),
      datasets: [{ label: "Cartas", data: byRarity.map((e) => e[1]), backgroundColor: ACCENT_SOLO[2], borderRadius: 4 }],
    },
    options: { ...baseOpts(), plugins: { legend: { display: false } } },
  });
}

// Gráficos de la pestaña Estadística de UN mazo (mismos colores/estilo que
// renderCharts para que se vean como parte de la misma app, no un widget
// aparte). `strategy` es el resultado de computeDeckStrategy() en app.js.
export async function renderDeckCharts(strategy) {
  await loadScript(CDN.chart);
  setChartDefaults();

  const baseOpts = (legend = "right") => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: legend } },
  });

  // Curva de coste (Aliados) — mismo azul que la curva de coste global
  const costKeys = Object.keys(strategy.curve).map(Number).sort((a, b) => a - b).map(String);
  draw("deck-chart-cost", {
    type: "bar",
    data: {
      labels: costKeys,
      datasets: [{ label: "Aliados", data: costKeys.map((k) => strategy.curve[k] || 0), backgroundColor: ACCENT_SOLO[1], borderRadius: 4 }],
    },
    options: { ...baseOpts(), plugins: { legend: { display: false } } },
  });

  // Distribución por tipo — mismo PALETTE que "Por tipo" en Estadísticas
  const typeEntries = Object.entries(strategy.byType).sort((a, b) => b[1] - a[1]);
  draw("deck-chart-type", {
    type: "doughnut",
    data: {
      labels: typeEntries.map((e) => e[0]),
      datasets: [{ data: typeEntries.map((e) => e[1]), backgroundColor: PALETTE, borderWidth: 0 }],
    },
    options: baseOpts("right"),
  });

  // Razas de los Aliados — mismo dorado que "Top razas" en Estadísticas
  const raceEntries = strategy.raceEntries.slice(0, 12);
  draw("deck-chart-race", {
    type: "bar",
    data: {
      labels: raceEntries.map((e) => e[0]),
      datasets: [{ label: "Aliados", data: raceEntries.map((e) => e[1]), backgroundColor: ACCENT_SOLO[0], borderRadius: 4 }],
    },
    options: { ...baseOpts(), indexAxis: "y", plugins: { legend: { display: false } } },
  });
}
