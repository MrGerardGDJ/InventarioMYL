# Fuentes de datos de cartas MyL — guía de investigación

Documento para evaluar e integrar páginas que tengan el catálogo de cartas de
Mitos y Leyendas, además de TOR. Resume lo que ya investigamos y da una lista de
verificación para juzgar una fuente nueva.

Última actualización: 2026-07-08.

---

## 1) Cómo consume datos la app (lo que una fuente debe poder entregar)

La app carga `data/cards.json` (generado por `scraper/scrape.js`) y fusiona
`data/custom-cards.json` + cartas manuales del usuario. **Esquema de cada carta:**

```json
{
  "id": "edicion__001__slug",     // único
  "name": "Nombre",                // idealmente con tildes/ñ
  "edition": "slug_edicion",
  "editionName": "Nombre Edición",
  "format": "PE|PB|SB|FX|NE",      // bloque/formato
  "edid": "001",                   // número dentro de la edición
  "type": "Aliado|Talismán|Tótem|Arma|Oro|Monumento",
  "race": "Guerrero|Dragón|…",
  "rarity": "Cortesano|Real|…",
  "cost": 5,                        // número o null
  "strength": 4,                    // Fuerza; null en Talismán/Tótem/Oro/Monumento
  "ability": "texto…",
  "flavour": "texto de ambientación…",
  "image": "https://…/carta.png"   // URL directa a la imagen
}
```

Campos **mínimos deseables** de una fuente: nombre, edición, tipo, raza, coste,
fuerza, habilidad e **imagen accesible por URL**. Lo demás es bonus.

---

## 2) TOR — `tor.myl.cl` (fuente actual, API abierta) ✅

- **Web:** `https://tor.myl.cl` (AngularJS) → **API pública:** `https://api.myl.cl`
- **CORS abierto** (`access-control-allow-origin: *`) → se puede leer desde el navegador.
- **Bloquea bots simples** en el sitio web (403), pero la **API sí responde** con
  cabeceras de navegador normales.

### Endpoints
| Endpoint | Devuelve |
|---|---|
| `GET /cards/edition/{slug}` | `{ edition, races, types, rarities, keywords, cards[] }` de una edición |
| `GET /cards/edition/todas` | Todas las cartas de una vez (~11 MB) |
| `GET /cards/profile/{ed_slug}/{card_slug}` | Detalle: `details, valid_formats, illustrator, edition, errata, products, keywords` |
| Imagen | `https://api.myl.cl/static/cards/{ed_edid}/{edid}.png` (fallback `…/00/000.png`) |

### Campos de carta en el listado
`id, edid, slug, name, rarity(id), race(id), type(id), keywords(id), cost,
damage(=Fuerza), ability, flavour, ed_edid, ed_slug`.
Razas/tipos/rarezas vienen como **IDs** con sus tablas de equivalencia en la misma
respuesta.

### Notas importantes
- El **listado** entrega los nombres **SIN tildes/ñ** ("compania"); el **perfil**
  (`/cards/profile/...`) trae el nombre real ("Compañía"). La app corrige el
  título de forma perezosa desde el perfil.
- `valid_formats` (en el perfil) = formatos de torneo donde la carta es válida:
  `{ empire, unified, first_era, infantry, vcr }` (booleanos).
- Limitación observada: TOR a veces **tarda en publicar** ediciones nuevas.

---

## 3) Códice — `codicetcg.org` (NO integrable sin permiso) ⛔

- **Web:** Nuxt (Vue) tras Cloudflare. **Backend:** Supabase en `https://db.codicetcg.org`.
  Imágenes en CDN `https://codicetcg.b-cdn.net`.
- **No expone API pública de datos:**
  - Los `select` anónimos a sus tablas (`cartas`, `ediciones`) devuelven **vacío**.
  - La introspección REST (`/rest/v1/`) da **401**.
  - Al cargar la librería, el navegador **no hace llamadas directas** a la base:
    los datos se sirven **desde su propio servidor** (SSR/rutas internas).
- **Conclusión:** integrarla requeriría **sortear su diseño de acceso** sin permiso.
  No recomendado. Suele estar **más actualizada** que TOR, pero es un proyecto de
  fans con backend propio (que ellos pagan). Si publican una API abierta o dan
  permiso, se puede reconsiderar.

---

## 4) Lista de verificación para una fuente NUEVA

Para cada página candidata, revisa (idealmente con las **DevTools → pestaña Network**
del navegador mientras navegas su catálogo):

1. **¿Hay una API que devuelva JSON?**
   - Busca llamadas `fetch/XHR` a rutas tipo `/api/...`, `/rest/v1/...` (Supabase),
     `.json`, GraphQL, etc.
   - Prueba abrir esa URL directo en el navegador: ¿devuelve JSON con las cartas?
2. **¿CORS abierto?** (cabecera `access-control-allow-origin: *`).
   - Necesario para leerla desde la app (GitHub Pages) o el navegador. Sin CORS,
     habría que pasar por el scraper en GitHub Actions.
3. **¿Requiere login / clave?** Si necesita cuenta o token privado → normalmente no.
   - Una clave "anon/pública" expuesta en su web es de bajo riesgo para uso
     personal, pero **si el sitio restringe el acceso a sus datos, respétalo.**
4. **¿Trae los campos necesarios?** nombre, edición, tipo, raza, coste, fuerza,
   habilidad, e **imagen por URL directa**.
5. **¿Las imágenes son accesibles** por URL (sin token que expire)?
6. **¿Términos de uso / permiso?** Preferir fuentes con API oficial/abierta o pedir
   permiso al dueño. Ser **liviano** (bajo demanda, no espejos masivos).

Regla práctica: **si la fuente devuelve JSON abierto (como `api.myl.cl`) → integrable**;
si esconde los datos tras su servidor/login (como Códice) → mejor no.

---

## 5) Cómo integrar una fuente que sí sea abierta

Archivos a tocar en este repo:

- `scraper/scrape.js` — agregar la nueva fuente: consultar su API, mapear sus
  campos al esquema de la sección 1, y **fusionar** con TOR deduplicando por carta.
- `scraper/editions.js` — catálogo de ediciones/slugs por formato (si aplica).
- `data/cards.json` — salida (la genera el scraper; no editar a mano).
- La app ya fusiona `data/custom-cards.json` y las cartas manuales, así que una
  fuente nueva puede entrar por el scraper **o** como importación bajo demanda.

Patrón recomendado: **TOR como base + importar bajo demanda** lo que falte (para no
sobrecargar servidores ajenos).

---

## 6) Otras páginas/recursos MyL conocidos (para tu investigación)

> No verificados como "API abierta" salvo TOR. Punto de partida:

- **tor.myl.cl** — oficial (Salo MyL). API abierta `api.myl.cl`. ✅ (fuente actual)
- **codicetcg.org** — muy actualizada, backend Supabase cerrado. ⛔ (ver sección 3)
- **mazos.cl** — comunidad, armado/compartir mazos y resúmenes. Revisar si expone API.
- Repos en GitHub (scrapers/datos de fans): buscar "mitos y leyendas cartas json",
  p. ej. `andreuvv/myl_scraper`, `hernancasanova/Mitos-y-leyendas`.

Cuando encuentres una candidata, corre por ella la **lista de la sección 4** y, si
pasa, me pasas la URL de su API y la integro.

---

### Mientras tanto
- Cartas nuevas que TOR aún no publica: regístralas con **➕ Carta manual** →
  botón **"Guardar y agregar otra"** (mantiene edición/formato/raza). Todo se
  sincroniza en la nube.
- Cuando TOR publique la edición, el scraper semanal la trae sola.
