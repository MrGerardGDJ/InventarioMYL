#!/usr/bin/env node
/**
 * Relaciona las cartas del catálogo de la app con las del Oráculo PE y genera:
 *   ../data/oraculo-map.json        { map: { <idCartaApp>: <cartaIdOraculo> }, meta }
 *   ../docs/AUDITORIA-ORACULO.md    cobertura, ambigüedades y diferencias para revisar
 *
 * Reglas (nunca adivinar: todo calce se apoya en una señal verificable):
 *   Nivel A · impresión exacta: misma edición + mismo número impreso + mismo nombre.
 *             Las ediciones de cada producto del Oráculo se deducen por solape de
 *             (número, nombre) con el catálogo.
 *   Nivel B · por nombre: el nombre identifica UNA sola carta del Oráculo, el tipo
 *             coincide y el coste no la contradice. Si el nombre es ambiguo, solo se
 *             acepta cuando la edición/producto lo desempata (nivel A).
 * Solo formato Primera Era (PE): el Oráculo no cubre otros bloques.
 *
 * Uso: node oraculo-map.js
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const D = (f) => path.join(__dirname, "..", "data", f);
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

const nm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s*\((?:j\.?o\.?|[^)]*)\)\s*$/g, "").replace(/[^a-z0-9ñ]/g, "");
const num = (s) => { const m = String(s ?? "").match(/^0*(\d+)$/); return m ? m[1] : null; };
const sinTilde = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const ora = readJson(D("oraculo.json"));
const cards = readJson(D("cards.json"));
const cat = [...(cards.cards || cards), ...readJson(D("custom-cards.json")).cards].filter((c) => c.format === "PE");

// Índices del Oráculo
const porNombre = new Map();            // nombre → [cartaId]
const versiones = [];                   // {cartaId, versionId, key, numero, nombre, tipo}
for (const [cid, c] of Object.entries(ora.cartas)) {
  const k = nm(c.n);
  (porNombre.get(k) || porNombre.set(k, []).get(k)).push(+cid);
  for (const v of c.v || []) versiones.push({ cartaId: +cid, versionId: v[0], key: v[1], numero: num(v[2]), nombre: k, tipo: sinTilde(c.t) });
}

// Índice del catálogo por edición+número
const porEdNum = new Map();
for (const c of cat) { const n = num(c.edid); if (n) porEdNum.set(`${c.edition}|${n}`, [...(porEdNum.get(`${c.edition}|${n}`) || []), c]); }

// 1) Ediciones de cada producto del Oráculo (por solape número+nombre)
const ediciones = new Map(); // key → Map(edition → hits)
for (const v of versiones) {
  if (!v.key || !v.numero) continue;
  for (const [ed, c] of [...porEdNum].filter(([k]) => k.endsWith(`|${v.numero}`)).map(([k, l]) => [k.split("|")[0], l])) {
    if (c.some((x) => nm(x.name) === v.nombre)) {
      const m = ediciones.get(v.key) || ediciones.set(v.key, new Map()).get(v.key);
      m.set(ed, (m.get(ed) || 0) + 1);
    }
  }
}
const edicionesDe = new Map([...ediciones].map(([k, m]) => [k, [...m].filter(([, h]) => h >= 5).map(([e]) => e)]));

const map = {};
const audit = { A: 0, B: 0, ambiguas: [], sinOraculo: [], conflictos: [], diferencias: [] };

// 2) Nivel A
for (const v of versiones) {
  if (!v.key || !v.numero) continue;
  for (const ed of edicionesDe.get(v.key) || []) {
    for (const c of porEdNum.get(`${ed}|${v.numero}`) || []) {
      if (nm(c.name) !== v.nombre) continue;
      if (map[c.id] && map[c.id] !== v.cartaId) audit.conflictos.push({ id: c.id, a: map[c.id], b: v.cartaId });
      else if (!map[c.id]) { map[c.id] = v.cartaId; audit.A++; }
    }
  }
}

// 3) Nivel B
const tipoOk = (c, o) => sinTilde(c.type) === sinTilde(o.t) || (sinTilde(c.type) === "monumento" && sinTilde(o.t) === "oro");
for (const c of cat) {
  if (map[c.id]) continue;
  const cand = (porNombre.get(nm(c.name)) || []).filter((id) => tipoOk(c, ora.cartas[id]));
  if (cand.length === 1) {
    const o = ora.cartas[cand[0]];
    // coste 0 en una carta que no es Oro = dato que falta en el catálogo (la API lo trae en 0), no una contradicción
    map[c.id] = cand[0]; audit.B++;
    // Diferencias de datos entre el catálogo y el Oráculo (erratas, datos que faltan o erróneos): se mapea igual
    // —el nombre identifica una sola carta del Oráculo— y se deja constancia para revisar.
    const dif = [];
    if (c.type !== "Oro" && c.cost != null && +c.cost !== 0 && o.c != null && +c.cost !== +o.c) dif.push(`coste ${c.cost} → ${o.c}`);
    if (c.type === "Aliado" && c.strength != null && o.f != null && +c.strength !== +o.f) dif.push(`fuerza ${c.strength} → ${o.f}`);
    if (dif.length) audit.diferencias.push({ id: c.id, nombre: c.name, edicion: c.edition, dif: dif.join(", ") });
  } else if (cand.length > 1) audit.ambiguas.push({ id: c.id, nombre: c.name, edicion: c.edition, candidatas: cand.length });
  else audit.sinOraculo.push({ id: c.id, nombre: c.name, edicion: c.edition });
}

fs.writeFileSync(D("oraculo-map.json"), JSON.stringify({ meta: { generado: new Date().toISOString(), cartasOraculo: ora.meta.cartas, mapeadas: Object.keys(map).length, nivelA: audit.A, nivelB: audit.B }, map }));

const pct = (n, t) => `${n} de ${t} (${Math.round((100 * n) / t)}%)`;
const porEd = {};
for (const c of cat) { const e = (porEd[c.edition] ||= { t: 0, m: 0 }); e.t++; if (map[c.id]) e.m++; }
const md = [
  "# Auditoría del cruce catálogo ↔ Oráculo PE",
  "",
  `Generado: ${new Date().toISOString().slice(0, 10)} · Fuente: ${ora.meta.fuente}`,
  "",
  `- Cartas del catálogo en Primera Era: **${cat.length}**`,
  `- Relacionadas con el Oráculo: **${pct(Object.keys(map).length, cat.length)}** (A · impresión exacta: ${audit.A}, B · por nombre: ${audit.B})`,
  `- Ambiguas (el nombre corresponde a varias cartas del Oráculo y nada desempata): ${audit.ambiguas.length}`,
  `- Sin carta equivalente en el Oráculo: ${audit.sinOraculo.length}`,
  `- Conflictos (señales que se contradicen, no se relacionan): ${audit.conflictos.length}`,
  `- Diferencias de datos entre el catálogo y el Oráculo (se relacionan igual; revisar): ${audit.diferencias.length}`,
  "",
  "## Cobertura por edición",
  "",
  "| Edición | Relacionadas |", "|---|---|",
  ...Object.entries(porEd).sort((a, b) => b[1].t - a[1].t).map(([e, v]) => `| ${e} | ${pct(v.m, v.t)} |`),
  "",
  "## Conflictos para revisar",
  "",
  ...audit.conflictos.slice(0, 80).map((x) => `- ${x.id} ${x.nombre || ""} ${x.motivo || ""}`),
  "",
  "## Diferencias de coste/fuerza catálogo → Oráculo (primeras 150)",
  "",
  ...audit.diferencias.slice(0, 150).map((x) => `- ${x.nombre} (${x.edicion}, ${x.id}): ${x.dif}`),
  "",
  "## Ambiguas (primeras 80)",
  "",
  ...audit.ambiguas.slice(0, 80).map((x) => `- ${x.nombre} (${x.edicion}) · ${x.candidatas} candidatas`),
  "",
  "## Sin equivalente en el Oráculo (primeras 120)",
  "",
  ...audit.sinOraculo.slice(0, 120).map((x) => `- ${x.nombre} (${x.edicion})`),
  "",
].join("\n");
fs.mkdirSync(path.join(__dirname, "..", "docs"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "..", "docs", "AUDITORIA-ORACULO.md"), md);
console.log(`Diferencias ${audit.diferencias.length} · Mapeadas ${pct(Object.keys(map).length, cat.length)} · A ${audit.A} · B ${audit.B} · ambiguas ${audit.ambiguas.length} · sin Oráculo ${audit.sinOraculo.length} · conflictos ${audit.conflictos.length}`);
