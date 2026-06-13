#!/usr/bin/env node
const H = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Origin: "https://tor.myl.cl",
  Referer: "https://tor.myl.cl/",
};

async function getJson(url) {
  const r = await fetch(url, { headers: H });
  const t = await r.text();
  try { return { status: r.status, data: JSON.parse(t), len: t.length }; }
  catch { return { status: r.status, raw: t.slice(0, 300), len: t.length }; }
}

// 1) cards/edition SIN slug → ¿lista de ediciones?
console.log("===== cards/edition (sin slug) =====");
{
  const { status, data, raw, len } = await getJson("https://api.myl.cl/cards/edition");
  console.log("status", status, "len", len);
  if (data) {
    console.log("top keys:", JSON.stringify(Object.keys(data)));
    for (const [k, v] of Object.entries(data)) {
      if (Array.isArray(v)) console.log(`  ${k}: ${v.length} items, claves:`, JSON.stringify(Object.keys(v[0] || {})), "muestra:", JSON.stringify(v[0]));
    }
  } else console.log("raw:", raw);
}

// 2) cards/edition/todas → ¿todas las cartas?
console.log("\n===== cards/edition/todas =====");
{
  const { status, data, raw, len } = await getJson("https://api.myl.cl/cards/edition/todas");
  console.log("status", status, "len", len);
  if (data) {
    console.log("top keys:", JSON.stringify(Object.keys(data)));
    const cards = data.cards || (Array.isArray(data) ? data : null);
    if (cards) {
      const eds = {};
      for (const c of cards) eds[c.ed_slug] = (eds[c.ed_slug] || 0) + 1;
      console.log("total cartas:", cards.length, "| ediciones distintas:", Object.keys(eds).length);
      console.log("ediciones:", JSON.stringify(eds));
      console.log("muestra carta:", JSON.stringify(cards[0]));
    }
  } else console.log("raw:", raw);
}

// 3) Probar slugs de ediciones nuevas
console.log("\n===== SLUGS NUEVOS =====");
for (const s of ["onyria","vudu","vudú","libertadores","los_libertadores","libertadores_de_america"]) {
  const { status, data, len } = await getJson("https://api.myl.cl/cards/edition/" + encodeURIComponent(s));
  const n = data?.cards?.length;
  console.log(`${status} len=${len} cards=${n ?? "-"}  slug=${s}` + (data?.edition?.title ? ` title="${data.edition.title}"` : ""));
}
console.log("\n### FIN\n");
