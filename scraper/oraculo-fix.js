#!/usr/bin/env node
/**
 * Corrige en data/custom-cards.json las cartas de Leyendas - Primera Era 4.0
 * (registradas a mano, con datos de la versión ANTERIOR de varias cartas)
 * usando el Oráculo PE como referencia — pero SOLO donde se verificó contra la
 * carta impresa: el Oráculo a veces va atrasado respecto de una carta retocada
 * (p. ej. Fribert: el Oráculo conserva su fuerza antigua y lo anota como
 * "rework en Leyendas 4.0"), así que un cruce automático no basta.
 *
 * Entrada: veredictos de una revisión visual carta por carta (imagen vs. las dos
 * versiones de los datos). Cada veredicto: { num, nombre, coincide, impreso, notas }
 * con coincide ∈ oraculo | nuestro | mixto | ninguno | ilegible.
 *   - oraculo  → se aplican los datos del Oráculo: coste, fuerza y raza; la habilidad y la leyenda solo
 *                si el texto es otro (similitud < 80 %): si es la misma con otra redacción se conserva
 *                la nuestra (el Oráculo tiene erratas de tipeo: «juega», «Unica»…).
 *   - mixto    → raza, coste y fuerza del Oráculo; la habilidad se deja como está.
 *   - nuestro / ninguno / ilegible → no se toca; ninguno e ilegible quedan listados para revisión.
 *
 * Uso:
 *   node oraculo-fix.js <carpeta-de-veredictos>           # simulacro
 *   node oraculo-fix.js <carpeta> --apply                             # escribe data/custom-cards.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const D = (f) => path.join(__dirname, "..", "data", f);
const dir = process.argv[2];
const apply = process.argv.includes("--apply");
if (!dir) { console.error("Falta la carpeta con los veredictos (subcarpetas loteN con veredictos.json)"); process.exit(1); }
const EDITION = "leyendas_primera_era_4_0";

const raw = fs.readFileSync(D("custom-cards.json"), "utf8");
const data = JSON.parse(raw);
const ora = JSON.parse(fs.readFileSync(D("oraculo.json"), "utf8")).cartas;
const map = JSON.parse(fs.readFileSync(D("oraculo-map.json"), "utf8")).map;

const flat = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
// Similitud 0..1 (Dice sobre bigramas): distingue "otra redacción" (≥ 0,8) de "otro texto" (< 0,8)
function sim(a, b) {
  a = flat(a); b = flat(b);
  if (a === b) return 1;
  if (!a || !b) return 0;
  const bi = (x) => { const m = new Map(); for (let i = 0; i < x.length - 1; i++) { const g = x.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); } return m; };
  const A = bi(a), B = bi(b); let inter = 0, tot = 0;
  for (const [g, n] of A) { inter += Math.min(n, B.get(g) || 0); tot += n; }
  for (const n of B.values()) tot += n;
  return (2 * inter) / tot;
}
const tidy = (s) => String(s || "").replace(/\r\n?/g, "\n").trim();
const canon = {};
for (const c of data.cards) if (c.race && c.race !== "—") canon[flat(c.race)] ||= c.race;
const raza = (r) => canon[flat(r)] || r;

const veredictos = [];
for (const lote of fs.readdirSync(dir).filter((d) => /^lote\d+$/.test(d))) {
  const f = path.join(dir, lote, "veredictos.json");
  if (fs.existsSync(f)) veredictos.push(...JSON.parse(fs.readFileSync(f, "utf8")));
}
const porNum = new Map(veredictos.map((v) => [String(v.num), v]));
console.log(`Veredictos leídos: ${veredictos.length}`);

const cambios = [], revisar = [], cuenta = {};
let out = raw;
for (const c of data.cards) {
  if (c.edition !== EDITION) continue;
  const v = porNum.get(String(c.edid || c.specialId));
  if (!v) continue;
  cuenta[v.coincide] = (cuenta[v.coincide] || 0) + 1;
  if (v.coincide !== "oraculo" && v.coincide !== "mixto") { if (v.coincide !== "nuestro") revisar.push(`${v.num} ${c.name}: ${v.coincide}${v.notas ? " — " + v.notas : ""}`); continue; }
  const o = ora[map[c.id]];
  if (!o) continue;
  const antes = JSON.parse(JSON.stringify(c));
  const dif = [];
  const h = tidy(o.h);
  const cambiaTexto = v.coincide === "oraculo" && h && sim(c.ability, h) < 0.8;
  if (cambiaTexto) { c.ability = h; dif.push("habilidad"); }
  if (c.type !== "Oro" && o.c != null && c.cost !== o.c) { dif.push(`coste ${c.cost ?? "—"}→${o.c}`); c.cost = o.c; }
  if (c.type === "Aliado" && o.f != null && c.strength !== o.f) { dif.push(`fuerza ${c.strength ?? "—"}→${o.f}`); c.strength = o.f; }
  if (c.type === "Aliado" && o.r && flat(c.race).split(" ")[0] !== flat(o.r).split(" ")[0] && !flat(c.race).startsWith(flat(o.r))) { dif.push(`raza ${c.race}→${raza(o.r)}`); c.race = raza(o.r); }
  if (o.l && cambiaTexto) { c.flavour = tidy(o.l); dif.push("leyenda"); }
  if (!dif.length) continue;
  cambios.push({ nombre: c.name, num: c.edid || c.specialId, dif });
  const blk = (x) => "  " + JSON.stringify(x, null, 1).replace(/\n/g, "\n  ");
  const viejo = blk(antes);
  if (out.split(viejo).length !== 2) throw new Error(`No se encontró el bloque exacto de ${c.id}`);
  out = out.replace(viejo, () => blk(c));
}

console.log(`${apply ? "APLICADO" : "SIMULACRO"}: ${cambios.length} cartas corregidas · veredictos ${JSON.stringify(cuenta)} · ${revisar.length} para revisión manual`);
for (const x of cambios) console.log(`  ${x.num} ${x.nombre}: ${x.dif.join(", ")}`);
for (const x of revisar) console.log(`  (revisar) ${x}`);
if (apply) {
  JSON.parse(out);
  fs.writeFileSync(D("custom-cards.json"), out);
  const md = [
    "# Correcciones aplicadas a data/custom-cards.json (Leyendas - Primera Era 4.0)", "",
    `Generado por \`scraper/oraculo-fix.js\` el ${new Date().toISOString().slice(0, 10)} a partir de una **verificación visual contra la carta impresa** (${veredictos.length} cartas revisadas; veredictos: ${JSON.stringify(cuenta)}). Se corrigieron ${cambios.length} cartas con los datos del Oráculo; el resto se dejó como estaba.`, "",
    ...cambios.map((x) => `- ${x.num} ${x.nombre}: ${x.dif.join(", ")}`), "",
    "Para revisión manual (mixtas, sin coincidencia o ilegibles):", ...revisar.map((x) => `- ${x}`), "",
  ].join("\n");
  fs.writeFileSync(path.join(__dirname, "..", "docs", "AUDITORIA-ORACULO-correcciones.md"), md);
}
