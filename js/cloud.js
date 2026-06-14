// Sincronización opcional en la nube usando Supabase (carga perezosa).
// Guarda un único registro por "clave" (un código que elige el usuario) con
// todo su inventario y mazos. Es opt-in: la app funciona sin esto.
import { loadScript, CDN } from "./cdn.js";

const KEY = "myl.cloud.v1";
const TABLE = "inventario_myl";

let cfg = read();
let sb = null;

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
export function getConfig() { return { ...cfg }; }
export function isConfigured() { return !!(cfg.url && cfg.key && cfg.clave); }
export function setConfig(c) {
  cfg = { url: (c.url || "").trim().replace(/\/$/, ""), key: (c.key || "").trim(), clave: (c.clave || "").trim() };
  localStorage.setItem(KEY, JSON.stringify(cfg));
  sb = null; // forzar recreación del cliente
}
export function disconnect() { cfg = {}; localStorage.removeItem(KEY); sb = null; }

async function client() {
  if (!isConfigured()) throw new Error("Sincronización no configurada");
  if (sb) return sb;
  await loadScript(CDN.supabase);
  sb = window.supabase.createClient(cfg.url, cfg.key);
  return sb;
}

// Descarga el snapshot remoto (o null si no existe). Lanza si hay error real.
export async function pull() {
  const c = await client();
  const { data, error } = await c.from(TABLE).select("datos,actualizado").eq("clave", cfg.clave).maybeSingle();
  if (error) throw new Error(error.message || "Error al leer de la nube");
  if (!data) return null;
  return { snapshot: data.datos, actualizado: data.actualizado };
}

// Sube el snapshot completo.
export async function push(snapshot) {
  const c = await client();
  const { error } = await c.from(TABLE).upsert(
    { clave: cfg.clave, datos: snapshot, actualizado: new Date().toISOString() },
    { onConflict: "clave" }
  );
  if (error) throw new Error(error.message || "Error al guardar en la nube");
}
