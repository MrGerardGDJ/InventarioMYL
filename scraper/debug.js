#!/usr/bin/env node
/**
 * Diagnóstico 2: inspecciona la API directa de datos.
 * Endpoint descubierto: https://api.myl.cl/cards/edition/{slug}
 */
const slug = process.argv[2] || "helenica";
const url = `https://api.myl.cl/cards/edition/${slug}`;
console.log(`\n### Consultando ${url}\n`);

const res = await fetch(url, {
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    Origin: "https://tor.myl.cl",
    Referer: "https://tor.myl.cl/",
  },
});
console.log("status:", res.status, "| content-type:", res.headers.get("content-type"));
const text = await res.text();
console.log("longitud:", text.length);
console.log("\n== PRIMEROS 1500 CHARS ==\n", text.slice(0, 1500));

try {
  const data = JSON.parse(text);
  const arr = Array.isArray(data) ? data : data.cards || data.data || data.result || Object.values(data)[0];
  console.log("\n== ¿ARREGLO? ==", Array.isArray(arr), "| total:", Array.isArray(arr) ? arr.length : "n/a");
  if (Array.isArray(arr) && arr.length) {
    console.log("\n== CLAVES DE LA PRIMERA CARTA ==");
    console.log(JSON.stringify(Object.keys(arr[0])));
    console.log("\n== PRIMERA CARTA COMPLETA ==");
    console.log(JSON.stringify(arr[0], null, 2));
    console.log("\n== SEGUNDA CARTA ==");
    console.log(JSON.stringify(arr[1], null, 2));
  } else {
    console.log("\n== CLAVES TOP-LEVEL ==", JSON.stringify(Object.keys(data)));
  }
} catch (e) {
  console.log("\nNo es JSON parseable:", e.message);
}
console.log("\n### FIN\n");
