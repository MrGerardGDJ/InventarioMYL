#!/usr/bin/env node
/**
 * Diagnóstico 4: patrón de URL de imágenes de cartas.
 * 1) Lee el controlador Angular del sitio y busca cómo arma la URL.
 * 2) Prueba URLs candidatas para una carta conocida (helenica / edid 001).
 */
const H = {
  "User-Agent": "Mozilla/5.0 Chrome/124.0 Safari/537.36",
  Accept: "*/*",
  Origin: "https://tor.myl.cl",
  Referer: "https://tor.myl.cl/",
};

// 1) Controlador y plantilla
for (const u of [
  "https://tor.myl.cl/js/ctrl.cards.js",
  "https://tor.myl.cl/views/cards.html",
]) {
  try {
    const t = await (await fetch(u, { headers: H })).text();
    const lines = t.split("\n").filter((l) => /static|\.png|image|img|src|api\.myl/i.test(l));
    console.log(`\n===== ${u} (${lines.length} líneas relevantes) =====`);
    console.log(lines.slice(0, 40).map((l) => l.trim()).join("\n"));
  } catch (e) {
    console.log("err", u, e.message);
  }
}

// 2) Probar candidatos de imagen (helenica, edid 001 = "gaia", edition id 20)
const candidates = [
  "https://api.myl.cl/static/cards/helenica/001.png",
  "https://api.myl.cl/static/cards/helenica/1.png",
  "https://api.myl.cl/static/cards/helenica/001.jpg",
  "https://api.myl.cl/static/cards/20/001.png",
  "https://api.myl.cl/static/helenica/001.png",
  "https://api.myl.cl/cards/helenica/001.png",
  "https://api.myl.cl/static/cards/helenica/gaia.png",
  "https://api.myl.cl/static/cards/helenica/001_gaia.png",
  "https://tor.myl.cl/static/cards/helenica/001.png",
];
console.log("\n===== PRUEBA DE IMÁGENES =====");
for (const u of candidates) {
  try {
    const r = await fetch(u, { headers: H, method: "GET" });
    const ct = r.headers.get("content-type") || "";
    const len = r.headers.get("content-length") || "?";
    console.log(`${r.status} ${ct} ${len}B  ${u}`);
  } catch (e) {
    console.log(`ERR ${u} ${e.message}`);
  }
}
console.log("\n### FIN\n");
