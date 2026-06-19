#!/usr/bin/env node
// ¿La API entrega el nombre con ñ/acentos? ¿titleCase los conserva en Node 20?
function titleCase(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim()
    .replace(/(^|[\s("'¡¿\-/])([a-záéíóúñü])/g, (_, p, c) => p + c.toUpperCase());
}
console.log("node", process.version);
for (const t of ["señor de las llamas", "compañía voladora", "niño rojo"]) {
  console.log(JSON.stringify(t), "=>", JSON.stringify(titleCase(t)));
}

const H = {
  "User-Agent": "Mozilla/5.0 Chrome/124.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Origin: "https://tor.myl.cl", Referer: "https://tor.myl.cl/",
};
const r = await fetch("https://api.myl.cl/cards/edition/legado-gotico", { headers: H });
const data = JSON.parse(await r.text());
const cards = data.cards || [];
// nombres crudos que deberían tener ñ/acento
const interesting = cards.filter((c) => /se.?or|compa|ni.?o|a.?o|espa|drag/i.test(c.name)).slice(0, 12);
console.log("\n== NOMBRES CRUDOS (API) ==");
for (const c of interesting) console.log(JSON.stringify(c.name), "| ability tiene ñ:", /ñ/.test(c.ability || ""));
console.log("### FIN");
