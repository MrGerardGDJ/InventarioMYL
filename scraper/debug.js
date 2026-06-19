#!/usr/bin/env node
const H = { "User-Agent": "Mozilla/5.0 Chrome/124.0 Safari/537.36", Accept: "application/json,text/plain,*/*", Origin: "https://tor.myl.cl", Referer: "https://tor.myl.cl/" };

// 1) nombre crudo en el listado de la edición
const ed = await (await fetch("https://api.myl.cl/cards/edition/calavera", { headers: H })).json();
const c = (ed.cards || []).find((x) => x.slug === "compaia-voladora") || (ed.cards || []).find((x) => /compa/i.test(x.name));
console.log("LISTADO  name:", JSON.stringify(c?.name), "| slug:", JSON.stringify(c?.slug));

// 2) nombre en el perfil
const prof = await (await fetch(`https://api.myl.cl/cards/profile/calavera/${c?.slug}`, { headers: H })).json();
console.log("PERFIL   details.name:", JSON.stringify(prof?.details?.name));
console.log("PERFIL   details.slug:", JSON.stringify(prof?.details?.slug));

// 3) ¿hay endpoint de búsqueda con nombres correctos?
try {
  const s = await fetch("https://api.myl.cl/cards/search", {
    method: "POST", headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "compañia" }),
  });
  const sj = await s.json();
  console.log("SEARCH status", s.status, "keys", JSON.stringify(Object.keys(sj || {})));
  const arr = sj.cards || sj.data || (Array.isArray(sj) ? sj : []);
  console.log("SEARCH primeros nombres:", JSON.stringify((arr || []).slice(0, 5).map((x) => x.name)));
} catch (e) { console.log("SEARCH err", e.message); }
console.log("### FIN");
