#!/usr/bin/env node
// Captura de red: qué pide la librería de Códice a db.codicetcg.org
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36" });
const page = await ctx.newPage();

const reqs = [];
page.on("request", (r) => {
  const u = r.url();
  if (/db\.codicetcg\.org/.test(u)) {
    const h = r.headers();
    reqs.push({ m: r.method(), u, profile: h["accept-profile"] || h["content-profile"] || "", prefer: h["prefer"] || "", range: h["range"] || "" });
  }
});
const bodies = {};
page.on("response", async (res) => {
  const u = res.url();
  if (/db\.codicetcg\.org\/rest/.test(u)) {
    try { bodies[u] = { s: res.status(), t: (await res.text()).slice(0, 260) }; } catch {}
  }
});

await page.goto("https://codicetcg.org/IMP/codice/library", { waitUntil: "networkidle", timeout: 60000 }).catch((e) => console.log("goto:", e.message));
await page.waitForTimeout(4000);

console.log("== PETICIONES a db.codicetcg.org ==", reqs.length);
for (const r of reqs.slice(0, 25)) {
  console.log(`\n${r.m} ${decodeURIComponent(r.u)}`);
  if (r.profile) console.log("   profile:", r.profile);
  if (r.prefer) console.log("   prefer:", r.prefer);
  const b = bodies[r.u];
  if (b) console.log(`   -> ${b.s}: ${b.t.replace(/\s+/g, " ")}`);
}
await browser.close();
console.log("### FIN");
