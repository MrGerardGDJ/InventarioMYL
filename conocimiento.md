# Conocimiento del proyecto — Inventario MyL

Documento de referencia para entender el proyecto y llevar registro de los cambios.
Actualízalo cada vez que se haga una modificación relevante.

## ¿Qué es?

Aplicación web estática (sin framework ni build) para llevar el inventario de cartas del
juego **Mitos y Leyendas (MyL)**: buscar cartas del catálogo oficial, marcar cuántas copias
se poseen, armar mazos, seguir colecciones por edición y ver estadísticas. Funciona
abriendo `index.html` (o sirviéndolo con cualquier servidor estático / GitHub Pages).

## Estructura de archivos

| Ruta | Rol |
|---|---|
| `index.html` | Única página. Contiene las 4 vistas (Catálogo, Colecciones, Mazos, Estadísticas) y todos los modales. |
| `css/styles.css` | Estilos. Temas claro/oscuro vía variables CSS y `[data-theme]`. |
| `js/app.js` | Lógica principal: carga de datos, filtros, render de grillas, mazos, colecciones, estadísticas, sincronización UI. |
| `js/store.js` | Persistencia en `localStorage`: inventario, mazos, colecciones, cartas manuales, preferencias. Notifica cambios (`onChange`). |
| `js/cloud.js` | Sincronización opcional con Supabase (tabla `inventario_myl` + historial + realtime). |
| `js/exporters.js` | Exportar a Excel (SheetJS), PDF (jsPDF) —de tabla y de grilla visual—, imagen de mazo y resumen de mazo. |
| `js/charts.js` | Gráficos de estadísticas (Chart.js, carga perezosa desde CDN). |
| `js/cdn.js` | Carga perezosa de librerías externas (SheetJS, jsPDF, Chart.js, Supabase). |
| `js/icons.js` | Iconos por tipo/raza y tipos sin fuerza (`NO_STRENGTH_TYPES`). |
| `data/cards.json` | Catálogo scrapeado de `api.myl.cl` (~19.800 cartas, 133 ediciones). |
| `data/editions.json` | Lista de ediciones **en orden por bloque/formato** (`slug`, `format`, `formatName`, `name`). Este orden se usa en la UI. |
| `data/custom-cards.json` | Cartas empaquetadas que TOR/api no tiene (p. ej. promos). |
| `js/wiki-import.js` | Trae el listado de una edición directo desde myl.fandom.com (API de MediaWiki, con CORS) para el botón "Buscar y cargar cartas" del gestor de Ediciones. Ver más abajo. |
| `.claude/skills/importar-edicion-myl-wiki/` | Skill de Claude Code: extrae una edición completa desde el wiki por línea de comandos (Python) cuando el botón del navegador no alcanza (ver más abajo). |
| `scraper/` | Scraper Node (`scrape.js` + `editions.js`) que regenera `data/*.json`. Corre también por GitHub Actions (`.github/workflows/scrape-data.yml`). `corrections.js` guarda correcciones manuales conocidas de numeración/id que TOR trae mal (se aplican por `id`, nunca lo cambian). |
| `docs/FUENTES-DATOS.md` | Investigación de fuentes de datos (api.myl.cl, mazos.cl, etc.). |

## Modelo de datos

**Carta** (normalizada en `normalizeCard()` de `app.js`):
`id` (estable, ej. `98-037` = idEdición-número), `legacyId`, `slug`, `name`, `edition` (slug),
`editionName`, `format` (PE/PB/SB/FX/NE), **`edid` = número de la carta dentro de su edición**
(string tipo `"037"`), `type`, `race`, `rarity`, `cost`, `strength`, `ability`, `flavour`, `image`, `custom`.

**Claves de localStorage** (`js/store.js`):

| Clave | Contenido |
|---|---|
| `myl.inventory.v1` | `{ cardId: cantidad }` |
| `myl.decks.v1` | `[{ id, name, cards:{cardId:n}, updatedAt }]` |
| `myl.collections.v1` | `[{ id, name, edition (slug), updatedAt }]` — las cantidades NO viven aquí; una colección es una "vista" de una edición sobre el inventario. |
| `myl.trade.v1` | `{ cardId: copias ofrecidas para cambio }` — nunca mayor que lo que hay en inventario (el store lo recorta solo). |
| `myl.editions.v1` | Ediciones personalizadas: `[{ slug, name, description, format, expectedTotal }]`. El slug es la identidad; renombrar no lo cambia (las cartas/colecciones no se desconectan). |
| `myl.tradelog.v1` | Historial de intercambios: `[{ given, received, date }]` (ids de carta, más reciente primero). |
| `myl.customcards.v1` | Cartas manuales del usuario |
| `myl.settings.v1` | Preferencias (`theme`, `activeDeckId`, `activeCollectionId`, `cloudAuto`, …) |
| `myl.meta.v1` | `updatedAt` del último cambio local |
| `myl.namecache.v1` | Corrección perezosa de nombres con tildes/ñ (la API de listado los entrega sin diacríticos) |

**Snapshot de nube / respaldo JSON**: `{ inventory, decks, collections, customCards, updatedAt }`
(ver `getSnapshot()` / `applySnapshot()` en `store.js`). El respaldo JSON del botón Exportar
incluye lo mismo.

## Conceptos clave de la UI

- **Catálogo** (`view-coleccion`): grilla con filtros (inventario, formato, edición agrupada
  por bloque, raza, tipo, rareza, coste) y ordenamientos, incluido **número de carta**.
  Botones +/− cambian cantidades; 🃏＋ agrega al mazo activo.
- **Editar CUALQUIER carta desde su detalle** (botón "✏️ Editar", visible en el
  modal de detalle de toda carta, no solo las manuales): al guardar, si la
  carta todavía no era `userCustom` (viene del scraper o del bundle
  compartido), se crea una copia local en `myl.customcards.v1` **con el mismo
  `id`** — en `rebuildCards()` (`js/app.js`) esa copia reemplaza a la
  original en vez de duplicarla, así que cantidades/mazos/para-cambio (todo
  keyed por `id`) no se pierden. Pensado para el caso real de TOR: ediciones
  como Leyendas 2023/2024 (tope 300) o Leyendas - Primera Era 4.0 (tope 320)
  traen, después del último número "normal", varias cartas coleccionista que
  en los hechos son **Promo** pero el scraper las numeró secuencialmente
  (ej. Leyendas 2023 #301-#326) — con este botón se les pone `specialId`
  ("Promo", "P-001"...) igual que a cualquier carta especial, y pasan a
  listarse en la sección de especiales al inicio de la Colección. El botón
  "🗑 Eliminar"/"↩ Revertir a la original" (mismo botón, texto según el caso:
  `state.baseCardIds.has(id)` distingue "esto reemplaza a una carta real" de
  "esto es 100% inventada por el usuario") borra la copia local — para una
  carta oficial eso simplemente la vuelve a mostrar tal cual está en el
  catálogo compartido, sin afectar tus cantidades.
- **Colecciones** (`view-colecciones`): cada colección se crea eligiendo **una o más
  ediciones** (`col.editions`, array de slugs — ver `js/store.js`), con un checklist con
  buscador en el modal de creación (hay 130+ ediciones, un `<select>` simple no alcanza).
  Pensado para agrupar, por ejemplo, todas las "Mundos Perdidos" de un mismo año en una
  sola colección que se va completando con cada lanzamiento nuevo, en vez de tener una
  colección suelta por edición. Muestra las cartas de todas sus ediciones juntas,
  **agrupadas por edición en su orden de publicación** (`compareEditionCards` ordena
  primero por `editionOrd`, no-op cuando es una sola edición) y por número dentro de cada
  una; con más de una edición, cada una tiene su propia sub-sección con título en la
  grilla (`renderCollectionGrid`). Las cartas con cantidad 0 se ven en blanco y negro y
  oscurecidas (vía CSS `.collection-grid .card:not(.owned)`); recuperan el color con
  transición al marcar la primera copia. Barra de progreso `poseídas/total` combinada de
  todas las ediciones del grupo. Formato viejo (colecciones de una sola edición, campo
  `edition` en vez de `editions`) se migra solo al cargar (`migrateCollection` en
  `store.js`) — nunca hace falta tocar datos guardados a mano.
- **Exportar PDF de una Colección** (botón "📄 Exportar PDF" en el detalle de
  una colección): genera un PDF con una **grilla de miniaturas**, no una
  tabla de texto — se ve igual que la vista en pantalla (`exportCollectionPDF`
  en `exporters.js`): las cartas que faltan quedan en blanco y negro y
  oscurecidas (mismo cálculo de píxeles que el filtro CSS de la vista:
  escala de grises + brillo al 50%), aplicado directamente sobre la imagen
  real de cada carta con un `<canvas>` fuera de pantalla antes de incrustarla
  en el PDF (`crossOrigin="anonymous"`; funciona porque tanto `api.myl.cl`
  como el CDN de imágenes del wiki envían `Access-Control-Allow-Origin: *`).
  Pensado para llevarlo a una jornada de intercambio y ver de un vistazo qué
  falta. Se pagina automáticamente (10 columnas × 4 filas por hoja A4
  apaisada); las cartas sin imagen muestran un marcador con el nombre, igual
  que en pantalla. Puede tardar con ediciones grandes (carga cada imagen con
  concurrencia limitada) — muestra progreso en el toast mientras genera.
- **Cambios** (`view-cambios`): inventario de intercambio. Se marcan copias repetidas
  como "para cambio" (desde esta vista o desde el detalle de una carta); al registrar un
  intercambio se descuenta la carta entregada, se suma la recibida y esta entra
  automáticamente a la colección de su edición (se crea sola si no existe). Historial al
  pie. Filtro "Ofrecidas para cambio" disponible también en el Catálogo.
- **Mazos** (`view-mazos`): CRUD de mazos, buscador interno, resumen por tipo/coste,
  export a Excel/imagen/texto.
- **Estadísticas** (`view-stats`): tarjetas, gráficos y progreso por edición.
- Nombres con tildes: el listado de la API viene sin diacríticos; al mostrarse una carta se
  consulta su perfil (`api.myl.cl/cards/profile/...`) y se cachea el nombre corregido.

## Decisiones / detalles no obvios

- `id` estable `<idEdición>-<edid>`; existe migración automática desde `legacyId`
  (`store.migrateKeys`) que se ejecuta en cada carga y es idempotente.
- Las cantidades de cartas viven SOLO en el inventario; mazos y colecciones referencian
  `cardId`. Borrar un mazo/colección nunca borra cantidades.
- "Cartas fuera de catálogo": cantidades cuyo id no existe en el catálogo actual; se
  muestran con el aviso ⚠ y no se borran solas.
- El orden "por edición" y los `<optgroup>` del selector de edición siguen el orden de
  `data/editions.json` (bloques: Primera Era → Primer Bloque → Segundo Bloque → Furia
  Extendido → Nueva Era/Imperio), no el alfabético.

## Carga de ediciones desde el wiki (myl.fandom.com)

Hay **dos caminos** para traer el listado de una edición completa desde el
wiki, con el mismo diseño de fondo: nunca adivinar. Se comprobó en la
práctica (edición Bruderschaft, ver registro del 21-07-2026 más abajo) que
aceptar automáticamente el primer resultado de búsqueda cuyo tipo coincide
puede asignarle a una carta los datos de OTRA carta — a "Daphne und Gregor"
casi se le asignan por error la imagen y el texto de "Niamh" (ambas Aliado/
Vasallo, pero cartas distintas). Por eso ambos caminos solo completan una
carta cuando encuentran su página **exacta** (de la edición o una página
base compartida); lo que no pueden resolver así queda listado aparte, nunca
se rellena con una conjetura.

1. **Botón "Buscar y cargar cartas"** (dentro de Ediciones → una edición
   → sección "Cargar cartas desde myl.fandom.com"): corre en el propio
   navegador, sin backend, llamando a la API de MediaWiki
   (`https://myl.fandom.com/es/api.php`) que expone CORS
   (`access-control-allow-origin: *`, confirmado con `curl`). Es la opción
   rápida para el caso simple. Implementado en `js/wiki-import.js` y cableado
   en `renderEditionEditor()`/`loadEditionFromWiki()` de `js/app.js`.
   - **Limitación conocida, sin confirmar en producción**: durante el
     desarrollo, un navegador automatizado (headless, sin pantalla, en un
     entorno de pruebas en la nube) no pudo completar ninguna petición a
     myl.fandom.com —ni siquiera a la API con CORS— mientras que `curl`
     desde la misma red sí. Es un patrón típico de protección anti-bot
     (Cloudflare) que distingue tráfico automatizado del de un navegador
     real; no hay forma de confirmar desde ese entorno si también afecta a
     un navegador real de un usuario. El botón atrapa cualquier error de
     red y lo explica con claridad (ver `apiGet()` en `wiki-import.js`) en
     vez de fallar en silencio, derivando al camino 2 si no conecta.
2. **Skill `importar-edicion-myl-wiki`** (`.claude/skills/…`): mismo proceso
   pero corrido por Claude desde la terminal con Python, para cuando el
   botón no conecta, o para resolver a mano —con verificación cruzada de
   varias señales, algo que no es seguro automatizar en un botón— las cartas
   que ni el botón ni la skill lograron ubicar por su página exacta. Ver el
   `SKILL.md` para el detalle completo del proceso y sus gotchas (namespace
   de archivo localizado de la API, bloques `<tabber>`, cartas con coste o
   fuerza "X").

Los dos comparten exactamente el mismo modelo de datos de salida (mismos
campos que produce el importador CSV) y el mismo criterio de fusión: se
empareja por número o identificador especial (o por nombre si la carta no
trae ninguno) para que repetir la carga actualice en vez de duplicar.

## ¿Cómo saber si TOR/la API ya tiene una edición nueva?

El scraper (`scraper/scrape.js`) **ya hace esto automáticamente**, no hace
falta tocar su código para eso: en el paso 1 consulta
`https://api.myl.cl/cards/edition/todas` y arma el conjunto `discovered` con
**todos** los `ed_slug` que encuentra ahí — no depende solo de la lista
estática `EDITION_SLUGS` de `scraper/editions.js`. Cualquier edición que TOR
agregue a su API aparece en `/todas` y el scraper la descubre sola. Además,
`.github/workflows/scrape-data.yml` corre el scraper **automáticamente cada
lunes a las 06:00 UTC** (y se puede disparar a mano desde la pestaña
Actions), así que el catálogo se termina actualizando solo con el tiempo.

Lo único que la detección automática NO resuelve sola: el **formato**
(PE/PB/SB/FX/NE) de una edición recién descubierta se asigna por
`formatFor(slug)`, que busca el slug en la lista estática conocida y usa
"NE" por defecto si no lo encuentra — así que una edición nueva con un slug
que el scraper nunca vio puede aparecer agrupada en el formato equivocado
hasta que alguien agregue su slug a `EDITION_SLUGS` en `scraper/editions.js`
(sí es una edición al código del scraper, deliberadamente fuera del alcance
de lo que se automatizó acá).

**Para chequear a mano si una edición específica ya está en la API**, sin
tocar nada del repo:
```bash
curl -s "https://api.myl.cl/cards/edition/todas" | python3 -c "
import json,sys
d = json.load(sys.stdin)
slugs = sorted(set(c['ed_slug'] for c in d['cards'] if c.get('ed_slug')))
print([s for s in slugs if 'TU_TEXTO_A_BUSCAR' in s.lower()])
"
```

### Ediciones agregadas manualmente porque TOR aún no las tenía

Cuando una edición existe en el wiki pero no en la API de TOR (verificado
con el chequeo de arriba), se extrae desde el wiki (skill
`importar-edicion-myl-wiki`) y se agrega directo a `data/editions.json` +
`data/custom-cards.json`, siguiendo el mismo mecanismo ya pensado para esto
("cartas empaquetadas que TOR/api no tiene"). **Riesgo a futuro**: si TOR
termina agregando esa misma edición (con otro slug, probablemente), sus
cartas quedarían duplicadas (una vez desde el scraper, otra desde el bundle
manual) — no hay una reconciliación automática todavía. Cuando se detecte
que TOR ya la tiene, hay que **quitar manualmente** el bloque
correspondiente de `custom-cards.json` y la entrada de `editions.json`.

- **`leyendas_primera_era_4_0`** ("Leyendas - Primera Era 4.0", lanzada el
  5-sep-2025): agregada el 21-07-2026, no está en `/todas` a esa fecha
  (verificado con el chequeo de arriba). 432 cartas: 352 numeradas (1-352) +
  80 del "Set Clásico" (subconjunto paralelo, tratamiento de barniz especial
  sin Foil, cargadas como especiales con identificador `SCLPE4-01`…
  `SCLPE4-80` — así es como el wiki y las cartas físicas las nombran; ver
  más abajo).
  **Solo 56/432 tienen imagen** — ver "Imágenes de ediciones remake" abajo:
  el resto se dejó sin imagen a propósito porque el wiki aún no tiene el
  escaneo genuino de esas cartas y traer el arte de una edición anterior
  puede corresponder a una versión distinta de la carta (habilidad
  diferente aunque el arte se vea igual). Las 80 del Set Clásico están
  **todas** sin imagen: el wiki lista para cada una una página propia
  "Nombre (SCLPE4)" pero ninguna de esas 80 páginas existe todavía
  (verificado el 02-08-2026 vía la API — las 80 dan `missingtitle`), así
  que no hay ningún scan específico que se le pueda pedir prestado sin
  violar la regla de "no reciclar arte de otra edición". El dueño del
  inventario las va escaneando y cargando a mano por el gestor de
  Ediciones a medida que consigue los sobres físicos.

- **8 ediciones `mundos_perdidos_*`** (agregadas el 02-08-2026, línea
  "Mundos Perdidos" — remakes anuales de 18-20 cartas de Primera Era,
  temáticos por raza/cultura). TOR solo tiene 3 de la línea completa
  (`mundos_perdidos_ciudad_de_los_cesares`, `..._horrores_de_salem`,
  `..._la_saga_de_volsung`, ya en `data/cards.json` desde el scraper). Las
  otras 3 que ya figuraban en `editions.json` (`..._leyendas_de_avalon`,
  `..._viaje_al_oeste`, `..._senores_del_trueno`) estaban **sin cartas en
  ningún lado** — aparecían en el selector de edición pero la colección
  salía vacía; un bug preexistente descubierto al revisar este pedido. Se
  completaron sus 20 cartas cada una y se agregaron 5 ediciones más que ni
  siquiera tenían entrada en `editions.json` (`..._nube_roja`,
  `..._tombstone`, `..._aliento_de_fuego`, `..._locura_de_dragon`,
  `..._horda_esteparia` — esta última junto con Locura de Dragón y Aliento
  de Fuego son el lanzamiento más reciente de la línea, con las que el
  dueño del inventario ya tiene sus 18 cartas físicas de Primera Era).
  Todas se extrajeron del wiki con la skill. Cobertura de imagen dispar
  según qué tan reciente es cada una — las 3 más nuevas (Horda Esteparia,
  Locura de Dragón, Aliento de Fuego) tienen **varias cartas sin página
  propia todavía en el wiki, ni siquiera una página base** (son cartas
  nuevas del juego, recién lanzadas — el wiki aún no las documenta card por
  card), así que quedaron con nombre/tipo/rareza nomás (sin habilidad ni
  imagen) hasta que el wiki las complete o el dueño las escanee.
  - **Formato de tabla nuevo que el extractor no soportaba**: estas 8
    ediciones usan `!'''Código'''` (con negrita) en vez de `!Código`, y el
    código no lleva guion entre el prefijo y el número (`MPAT 01/18`, no
    `MPAT - 01/18` como en LPE4) — se generalizó `_CODE_RE` y el regex de
    marcadores en `extract_myl_edition.py` para aceptar ambas variantes.
  - **Carta "00"**: varias de estas ediciones traen una carta firma/tótem
    numerada "00" (ej. `MPA 00/18` en Leyendas de Avalon). La app rechaza
    edid < 1 (tanto el importador CSV como el formulario manual de carta),
    así que el extractor ahora la carga como **especial** con identificador
    `<prefijo>-00` (ej. `MPA-00`) en vez de intentar forzarla a edid `000` —
    aparece primero en la colección, que es justamente el lugar visual que
    le corresponde a la carta "00".

- **`lootbox_pe_2024` y `lootbox_pe_2025`** (agregadas el 03-08-2026, 85 y
  90 cartas). No son ediciones numeradas: son productos "grab bag" de
  cartas coleccionista/promo repartidas en 5-6 categorías (Conmemorativas,
  Secretas, Premium, Artes Alternativos, Nuevas, Exclusivas), cada una con
  su propio código de origen — **todas** sus cartas se cargan como
  especiales (`specialId` = el código tal cual del wiki, ej.
  `PROMOCIONAL PE24 07`, `COLECCIONISTA...` no aplica acá pero mismo
  criterio), nunca con `edid` numérico. `lootbox_pe_2024` ya figuraba
  "fantasma" en `editions.json` (sin cartas, mismo bug que las 3 Mundos
  Perdidos de arriba); `lootbox_pe_2025` es edición nueva. 144/175 con
  imagen — el resto son reprints cuya página del wiki todavía no tiene un
  scan específico de esta versión (se dejaron sin imagen a propósito, ver
  regla de abajo). Extraídas con un script dedicado (no la skill
  genérica: la estructura multi-tabla-por-categoría no encaja con
  `parse_list_table`), reusando las funciones de resolución de
  `extract_myl_edition.py`. **Sigue pendiente `pb_lootbox_2023`**
  (también fantasma): no se encontró una página del wiki
  ("Lista de cartas de Lootbox Primer Bloque 2023") que le corresponda.

### Imágenes de ediciones "remake" / aniversario: no reciclar arte de otra edición

Se detectó en la práctica (Leyendas - Primera Era 4.0, reportado por el
dueño del inventario el 22-07-2026) que para ediciones tipo compilación o
remake, una carta puede compartir el mismo nombre y a veces el mismo arte
que su versión en una edición anterior, pero tener **habilidad u otros
datos distintos** en la impresión nueva — ej. Bjorn Ragnarsson en
Leyendas 4.0 (código `LPE4 - 62/320`) es una carta distinta a la de
Leyendas 3.0 (`LPE23 - 154/300`). Cuando el wiki todavía no tiene el
escaneo específico de la carta nueva (edición recién lanzada, comunidad del
wiki aún documentándola), el extractor puede terminar trayendo — con
confianza aparente — el arte de la carta de la edición ANTERIOR por la vía
de "página base" o "fuente citada en la Nota", que en los hechos puede ser
una carta distinta a la impresa en la edición nueva.

**Regla aplicada, y es el comportamiento POR DEFECTO desde el 22-07-2026**
(el usuario avisó que esto mismo ya le había pasado en otras ediciones
propias, cargadas con el botón del navegador, sin haberlo reportado antes —
así que se corrigió para todas las ediciones, no solo Leyendas 4.0): tanto
el script (`extract_myl_edition.py`) como el botón "Cargar desde wiki"
(`js/wiki-import.js`) solo usan la imagen cuando proviene de una página
**específica** de la edición que se está extrayendo (no de la página base
ni de la Nota) — para cualquier otro caso, dejar la carta sin imagen es
mejor que arriesgarse a mostrar la carta equivocada; se completa a mano
después (foto/escaneo del dueño de la carta física). El script conserva un
flag de escape, `--trust-fallback-images`, solo para cuando se sabe con
certeza que la edición es una reimpresión 1:1 estable de otra.

**Mejora del 02-08-2026** (reportado por el dueño del inventario: varias
cartas de sus colecciones personales "Brotherhood", "Brotherhood (V2)" y
"Bruderschaft" — traducciones al inglés/alemán de "La Cofradía" — tenían
imagen equivocada): se detectó que "página base" no siempre significa
"compartida con otra edición". Ediciones traducidas suelen titular la
página de una carta directamente con su nombre traducido sin
desambiguador (ej. "Harpyie", "Weißer Büffel" en Bruderschaft; "Ah Pooch",
"Achilles" en Brotherhood (V2)) porque ese nombre no colisiona con nada
más — la página SÍ es específica de esa edición, solo que el título no lo
delata. Se agregó un chequeo adicional en `resolveCardContent`/
`resolve_card_content`: cuando la página encontrada es "base" (mismo
título, sin paréntesis), se revisa el campo `edición=` de su propia
plantilla `{{Carta}}` — si declara la edición que se está cargando, se
trata como **específica** igual que si tuviera el paréntesis en el título;
si declara otra edición (o no declara nada), se mantiene como "base" (sin
imagen). Resultado al reprocesar: Brotherhood (V2) pasó a 170/170 cartas
con imagen (antes varias se descartaban sin necesidad); Bruderschaft y
Brotherhood (V1) mejoraron pero siguen con huecos reales — no toda carta
tiene página propia todavía en el wiki, y la versión V1 de 2003 tiene 28
filas de su tabla de listado directamente vacías (ni nombre ni carta) que
es un hueco del propio wiki, no del extractor.

Si el usuario tiene ediciones **propias** (creadas en su navegador con el
botón, no bundled en el repo) con este mismo problema de antes de esta
fecha, basta con volver a tocar "Buscar y cargar cartas" sobre esa edición:
la fusión es por número/especial (`mergeEditionCards`), así que reimportar
actualiza las cartas existentes — incluida su imagen, que ahora se
recalcula con la regla estricta — sin duplicarlas.

**Pendiente, no resuelto todavía**: el mismo problema puede afectar la
**habilidad/historia** (no solo la imagen) de las cartas resueltas por
"página base" o "Nota", ya que se probó que el texto de esas páginas
también puede corresponder a la versión ANTERIOR de la carta, no a la
impresión nueva. No hay todavía una forma automática de detectar esto (a
diferencia de la imagen, que se puede rastrear por su página de origen, el
texto de habilidad no tiene una señal tan clara de si cambió entre
ediciones). Si el dueño del inventario nota una habilidad incorrecta en
alguna carta de `leyendas_primera_era_4_0`, hay que corregirla a mano en
`data/custom-cards.json` (buscar por `id` o `name`).

## Registro de cambios

### 2026-08-04 (3ª iteración) — Corrige numeración de las 8 ediciones "Mundos Perdidos" cargadas del wiki (carta Promocional final mal numerada)
- El dueño del inventario notó, mientras editaba a mano su colección
  "Mundos Perdidos", que la carta "19 de 18" (o "20 de 18") de varias
  ediciones no calzaba como carta numerada normal y las pasó a Promo desde
  el detalle de la carta — pero al hacerlo en su navegador (edición local,
  no en el catálogo compartido) terminó con números desplazados en algunos
  casos. Se investigó el wikitext original de las 8 ediciones que cargamos
  nosotros mismos del wiki (`069a4af`, sesión anterior) y se confirmó que
  **su intuición era correcta**: cada edición "Mundos Perdidos" trae
  exactamente **una carta con `Frecuencia: Promocional`** (distinta de las
  demás, que son "Real") que el extractor había dejado como carta numerada
  normal en vez de tratarla como especial — igual que ya se hacía con la
  carta "00" (tótem/firma) en las ediciones que la tienen.
  - **Leyendas de Avalon, Señores del Trueno, Viaje al Oeste** (las 3 que
    ya tenían carta "00"): la carta "19/18" (Brunor, Poder del Relámpago,
    Ciudad Prohibida) pasó de numerada `edid: "019"` a especial
    (`MPA-19`, `MPT-19`, `MPO-19`). Quedan con 18 numeradas (1-18) + 2
    especiales (00 y 19), igual a como las ve el propio wiki.
  - **Aliento de Fuego, Horda Esteparia, Locura de Dragón, Nube Roja,
    Tombstone** (las 5 que no tienen carta "00", numeración corrida
    1-20): la carta "20/18" (Eggerich, Xiongnu, Brunhild, Snallygaster,
    Johnny Ringo) pasó de numerada a especial (`MPDI-20`, `MPAT-20`,
    `MPSG-20`, `MPRE-20`, `MPTO-20`). Quedan con 19 numeradas (1-19) + 1
    especial (20). El dueño solo pidió arreglar el patrón "00 o 19 de 18"
    que había notado, pero se corrigió también en estas 5 por ser
    exactamente el mismo problema (evidenciado por el campo `Frecuencia`
    del wiki, no una suposición) y dejar toda la familia "Mundos Perdidos"
    consistente.
  - Corrección aplicada solo sobre `edid`/`specialId` (el `id` estable de
    cada carta nunca se toca, mismo criterio que `corrections.js`), así
    que el inventario/mazos/colecciones de nadie se desconecta.
  - **No se tocaron** las otras 3 ediciones "Mundos Perdidos" (Ciudad de
    los Césares, Horrores de Salem, La Saga de Volsung): esas vienen
    directo de la API de TOR (`data/cards.json`), no las cargamos
    nosotros del wiki, así que no hay corrección local que aplicarles —
    la numeración que trae TOR se respeta tal cual.
  - Nota para el dueño del inventario: las ediciones locales que hizo a
    mano en su navegador (convertir a mano las cartas "00"/"19" a Promo)
    ahora quedaron redundantes con esta corrección del catálogo — puede
    usar "🗑 Eliminar / ↩ Revertir a la original" sobre esas cartas para
    que vuelvan a tomar los datos ya corregidos del catálogo compartido.

### 2026-08-04 (2ª iteración) — 252 imágenes de Leyendas 4.0 desde el sitemap de mylserena.cl (páginas de producto individuales)
- El dueño del inventario notó que mylserena.cl sí tenía la foto de cartas
  que en el inventario seguían sin imagen (ej. Rheda,
  https://mylserena.cl/rheda-lpe4-ur) — la categoría `leyendas-pe-40`
  scrapeada en la iteración anterior solo listaba 64 productos "en
  vitrina", pero la tienda tiene una página individual por carta aunque no
  aparezca en esa grilla. Se encontraron **todas** navegando
  `https://mylserena.cl/sitemap.xml` (permitido por `robots.txt`): 401 URLs
  cuyo slug contiene `lpe4`.
- **Señal de confianza mucho más fuerte que el nombre**: cada página de
  producto trae en su `description` (JSON-LD) el número exacto de la carta
  dentro de la edición — literalmente el mismo dato que el `edid`/
  `specialId` de nuestro catálogo, sin ambigüedad posible aunque el nombre
  se repita (LPE4 tiene ~24 nombres duplicados entre variantes de
  rareza/reimpresión, ej. "Antú" existe como Legendaria y como Mega Real).
  Tres formatos de `description` encontrados y sus tres reglas de
  emparejamiento exactas (nunca por nombre):
  - `"LPE4 33-320 - Dios - Imagen referencial"` → carta numerada normal,
    empareja contra `edid = "033"`.
  - `"SCLPE4 - 67/80 - Campeón - Imagen referencial"` → subset "Set
    Clásico" (reimpresiones con numeración propia 1-80), empareja contra
    `specialId = "SCLPE4-67"` (así ya estaban cargadas estas cartas en el
    catálogo).
  - `"LPE4 - 324 / 320 P - Oro - Imagen referencial"` → cartas promo que
    numéricamente exceden las 320 base (321-326), empareja contra
    `edid = "324"`.
  - Los 401 productos parseados dieron **0 casos sin match** contra el
    catálogo y **0 duplicados** apuntando a la misma carta — a diferencia
    de las iteraciones anteriores (por nombre) no hubo un solo caso
    ambiguo que descartar.
- De los 401, 252 correspondían a cartas que **todavía no tenían imagen**
  en `data/custom-cards.json` (las 149 restantes ya la tenían, de
  iteraciones previas). Las fotos originales de esta tienda son JPEG (no
  WebP como las descargadas antes vía su endpoint `/resize/`), así que se
  guardaron con extensión `.jpg` en `data/custom-images/mylserena/` —
  mismo criterio de copia propia que el resto del proyecto, ~215 KB
  promedio por archivo.
- **Cartas sin imagen en Leyendas - Primera Era 4.0: bajó de 265 a 13**
  (edid 330-338 y 340-342, más "Calabaza del Inmortal" #352 — esas 13 no
  tienen página de producto en la tienda, ni en la categoría ni en el
  sitemap, así que no hay de dónde sacarlas por ahora).

### 2026-08-04 — CRPE2, Vigilantes de la Noche, Juego Organizado, orden Lootbox por rareza, búsqueda por identificador y más imágenes mylserena
- **Dos ediciones nuevas que faltaban en la API de TOR** (confirmado: ausentes
  de `data/cards.json` tras un scrape completo), extraídas del wiki con
  parsers dedicados (tablas no estándar, no las soporta el parser genérico
  de `extract_myl_edition.py`):
  - **CRPE2 — Colecciones Raciales Primera Era Segunda Parte** (`crpe2`, 84
    cartas, numeradas 1-84, las 84 con imagen). Página wiki: "Lista de
    cartas de Colecciones Raciales Primera Era 2" (tabla `Código, Kit,
    Nombre, Tipo, Nota`; código con denominador separado por guion,
    `CRPE2-N-84`, no lo cubre el regex compartido).
  - **Vigilantes de la Noche** (`vigilantes_de_la_noche`, reutiliza una
    entrada "fantasma" que ya existía en `editions.json` con 0 cartas — se
    corrigió además su `name` a capitalización correcta). 23 cartas, las 23
    con imagen: 22 numeradas + 1 especial `HPE-00`. Página wiki: "Lista de
    cartas de Vigilantes de la Noche" (tabla de 7 columnas donde el nombre
    está en `cells[2]`, no en `cells[1]` como de costumbre; código
    `HPE - N/21`).
- **Nueva edición coleccionable "Juego Organizado - Primera Era"**
  (`juego_organizado_pe`, 121 cartas, 114 con imagen): el proyecto no tenía
  ninguna información previa sobre estas cartas (ni en `cards.json` ni en
  `custom-cards.json`), así que se buscó primero en las fuentes propias
  (nada) y luego en el wiki, encontrando la sección `==Juego Organizado==`
  de la página "Cartas Promo Primera Era Klu" (deliberadamente **no** se
  incluyó la sección separada "Cartas Promo 20 Años" de la misma página,
  que es otra categoría distinta). Todas las cartas son especiales
  (`specialId` "JO-01".."JO-121", en el mismo orden que la tabla de la
  wiki — no hay una numeración propia declarada en la fuente).
- **Orden de la colección Lootbox por rareza real**: se investigó en la
  wiki ("Frecuencia de Cartas": Secreta es textualmente "la carta más rara
  del juego") y en blogs de lanzamiento de blog.myl.cl el contenido
  garantizado de cada caja (1 Conmemorativa, 1 Secreta Promo, 3 Premium,
  resto Arte Alternativo/Nuevas, más una Ultra Secreta/Edición Limitada
  festiva de bonus con ~10% de probabilidad — la más escasa de todas). Con
  eso se armó `lootboxRarityRank()` en `js/app.js`: ranking manual por
  palabra clave del identificador (Edición Limitada > Secreta > Conmemorativa
  > Legendaria > Premium > Promocional > Promo CXC > numeradas LBPE),
  aplicado solo dentro de `lootbox_pe_2024`/`lootbox_pe_2025`
  (`LOOTBOX_EDITIONS`) antes de caer al orden alfanumérico normal en
  `compareEditionCards`.
- **`renderCollectionGrid` ahora separa también las especiales por
  edición** cuando la colección agrupa varias ediciones (antes solo
  separaba las numeradas) — necesario para que una colección Lootbox
  2024+2025 combinada muestre "separación entre tipos de Lootbox" en vez de
  mezclar las especiales de ambas cajas en una sola sección.
- **Buscador global por identificador de carta**: nueva `cardIdentifierText()`
  en `js/app.js`, sumada al `searchText` de cada carta junto al nombre/
  habilidad. Cubre el `specialId` tal cual se ve (ej. "LBPE25 - 01/21"), esa
  misma cadena sin espacios/guiones/barras (para que "LBPE25-01/21" o
  "lbpe25 01 21" tecleado también calce) y el número simple/con "#" para
  las cartas numeradas.
- **44 imágenes más reemplazadas por su versión de mejor calidad**: de las
  117 cartas con foto de mesaredondatcg.cl (fotos de carta física, algunas
  con dobleces/reflejos visibles — ver "Silencio" de LPE4 como ejemplo
  claro), se cruzaron sus nombres contra el catálogo ya scrapeado de
  mylserena.cl (`products_parsed.json`, 416 productos de las categorías
  `leyendas_pe_40`/`mundos_perdidos_1/2/3`/`lootbox_pe_2024/2025`) buscando
  la MISMA carta con una foto más nítida. Emparejamiento con el mismo
  criterio de confianza ya usado para mylserena: match exacto de nombre
  dentro de la subcategoría de la tienda que declara la edición exacta
  (`leyendas_pe_40`, o el sufijo `MP3 - Tombstone`/`MP3 - Nube Roja` dentro
  de `mundos_perdidos_3`), y para las subcategorías sin sufijo de edición
  (`mundos_perdidos_1`/`2`, que mezclan 3 ediciones cada una sin
  distinguirlas en la propia tienda) solo se aceptó cuando el nombre es
  único en todo el catálogo dentro de la familia "Mundos Perdidos" — igual
  que el método "único" ya usado en la iteración anterior. 44 de las 117
  tuvieron coincidencia verificable (`leyendas_primera_era_4_0`,
  `mundos_perdidos_tombstone`, `mundos_perdidos_nube_roja`,
  `mundos_perdidos_senores_del_trueno`, `mundos_perdidos_viaje_al_oeste`,
  `mundos_perdidos_leyendas_de_avalon`); se bajaron a resolución 800×1067 y
  reemplazaron en `data/custom-images/mylserena/` (mismo criterio de copia
  propia). Las 73 restantes se dejaron con su foto de mesaredondatcg.cl —
  sin coincidencia verificable en mylserena, no hay con qué reemplazarlas.

### 2026-08-03 (3ª iteración) — 112 imágenes más desde mylserena.cl
- El dueño del inventario encontró una segunda tienda
  (https://mylserena.cl/primera-era/singles-pe) con más cartas
  fotografiadas. A diferencia de mesaredondatcg.cl, esta tienda **no trae
  SKU/código en los datos del producto** (el campo está vacío en su HTML);
  lo que sí trae es el nombre con un sufijo entre paréntesis (ej. "Lamorak
  (LPE4 - MR)") y, más importante, el catálogo está organizado en
  **subcategorías por edición/producto**
  (`/primera-era/singles-pe/leyendas-pe-40`,
  `/primera-era/singles-pe/lootbox-pe-2024`,
  `/primera-era/singles-pe/mundos-perdidos-3`, etc.) — la propia tienda ya
  declara de qué edición es cada carta, así que sirve como señal de
  confianza igual de buena que un código exacto (mismo principio que el
  campo `edición=` de las páginas del wiki).
  - `mundos-perdidos-3` resultó ser una subcategoría "compilada" con varias
    de nuestras ediciones mezcladas, distinguidas por un sufijo adicional
    en el tag (`MP3 - Tombstone`, `MP3 - Nube Roja`, `MP3 - Aliento de
    Fuego`, `MP3 - Locura de Dragón`, `MP3 - Horda Esteparia`) — justo las
    5 ediciones con más huecos de imagen.
  - Dentro de cada subcategoría se emparejó por **nombre normalizado**; si
    el nombre se repetía dentro de la misma edición (pasa en LPE4, ver
    "K' Ak' Na" en la iteración de LPE4/Bruderschaft) se desambiguó
    comparando la rareza del tag de la tienda (MR/UR/Real/Legendaria/
    Promocional) contra la rareza ya conocida de la carta; si seguía
    ambiguo, se descartaba en vez de arriesgar — no hizo falta esta vez
    (0 casos ambiguos de 119 coincidencias).
  - Se bajaron y guardaron 112 fotos (7 eran duplicados de las 119
    coincidencias) en `data/custom-images/mylserena/` (mismo criterio que
    la iteración anterior: copia propia, no hotlink) a resolución 800×1067
    (la tienda permite pedir un tamaño mayor cambiando el segmento
    `/resize/W/H` de la URL de la imagen). Cartas sin imagen en total
    (LPE4 + Mundos Perdidos + Lootbox): bajó de 386 a 274 — casi todo
    Lootbox 2024 y las ediciones "MP3" quedaron completas.

### 2026-08-03 (2ª iteración) — Se cargan las ediciones Lootbox y 117 imágenes desde mesaredondatcg.cl
- **Imágenes**: el dueño del inventario aprobó incorporar las 117
  coincidencias verificadas por SKU contra mesaredondatcg.cl (ver iteración
  anterior). Se descargaron las 117 fotos y se guardaron en el repo, en
  `data/custom-images/mesaredonda/` (no se hotlinkearon — se bajó una copia
  propia, mismo criterio que `data/custom-images/ismael.webp` ya usado para
  Onyria), y se actualizó el campo `image` de esas 117 cartas en
  `data/custom-cards.json` (78 de `leyendas_primera_era_4_0`, 39 repartidas
  en 4 ediciones Mundos Perdidos). Cartas sin imagen en esas ediciones:
  bajó de 472 a 355.
- **Ediciones Lootbox**: se cargaron `lootbox_pe_2024` (85 cartas, la
  entrada "fantasma" que ya existía en `editions.json` ahora tiene sus
  cartas) y `lootbox_pe_2025` (90 cartas, edición nueva). A diferencia de
  una edición normal, **todas** sus cartas son especiales (`specialId`,
  sin `edid`) porque el producto en sí es una compilación de 5-6
  categorías de coleccionista/promo, cada una con su propio código de
  origen (`PROMO CONMEMORATIVA NN`, `SECRETA EXCLUSIVA PE NN`,
  `PREMIUM PE NN`, `PROMOCIONAL PE24/PE25 NN`, `LBPE24/LBPE25 - NN/21`,
  `EXCLUSIVA LPE24/25 NN`) — se conservó el código tal cual lo usa el
  wiki como `specialId`, en vez de inventar una numeración propia, porque
  es lo que va a coincidir con lo que el dueño ve impreso en su carta
  física. 144/175 con imagen (69/85 en 2024, 75/90 en 2025); el resto
  quedó sin imagen a propósito por la regla de "no reciclar arte de otra
  edición" (son reprints/remakes de cartas viejas cuya página del wiki
  todavía no tiene un scan específico de esta versión).
  - **Bug del wiki detectado al extraer**: la tabla de 2024 repite el
    código `PROMOCIONAL PE24 13` en dos filas distintas (Dinastía
    Imperial y Cernunno) — error de tipeo del propio wiki, no nuestro. Se
    resolvió agregando un sufijo de letra al segundo (`PROMOCIONAL PE24
    13-b`) para no perder ninguna carta ni chocar identificadores.
  - **Bug real encontrado y corregido** (afecta a cualquier edición, no
    solo Lootbox): `resolve_image_urls`/`resolveImageUrls` guardaba la URL
    de la imagen bajo la clave que la API de MediaWiki devuelve
    NORMALIZADA (con espacios), pero el nombre de archivo tal como
    aparece en el wikitext original (la clave por la que después se busca
    en ese diccionario) puede traer guion bajo — sin este alias, un
    archivo así (ej. `Promo_Conmemorativa_01.png`) quedaba con imagen
    resuelta pero invisible porque la clave nunca calzaba. Corregido en
    `extract_myl_edition.py` y `js/wiki-import.js` guardando también un
    alias con "_" en vez de " ". Subió de 63 a 69 cartas con imagen en
    Lootbox 2024 al aplicar el fix.
- No se tocó `pb_lootbox_2023`: sigue "fantasma" (sin cartas) porque no se
  encontró una página del wiki que le corresponda específicamente (a
  diferencia de Lootbox Primera Era, no hay "Lista de cartas de Lootbox
  Primer Bloque 2023" documentada) — queda pendiente si el dueño encuentra
  la fuente correcta.

### 2026-08-03 — Ediciones "Lootbox" y descubrimiento de Leyendas - Primer Bloque 4.0
- El dueño del inventario pidió investigar por qué no veía las ediciones
  "Lootbox" de Primera Era. Se encontró: `lootbox_pe_2024` y
  `pb_lootbox_2023` existen en `data/editions.json` pero **sin ninguna
  carta cargada en ningún lado** (mismo bug "edición fantasma" que se
  encontró y corrigió para 3 ediciones Mundos Perdidos el 02-08-2026) —
  y ni siquiera están en la API de TOR (confirmado con `/todas` en vivo).
  Tampoco existe `lootbox_pe_2025`. Las tres son ediciones "Lootbox"
  reales del wiki (`Lista de cartas de Lootbox Primera Era 2024/2025`),
  pero con una estructura muy distinta a una edición normal: son
  **compilaciones de cartas promocionales/coleccionista de OTROS
  productos** (secciones "Conmemorativas especiales", "Secretas Promo",
  "Premium", "Artes Alternativos", "Nuevas", "Exclusivas", cada una con su
  propio código de coleccionista) — no cartas numeradas de un set propio.
  **Pendiente de decisión del dueño**: cargarlas requiere el mismo
  cuidado categoría-por-categoría que "Coleccionista"/"Secreta Exclusiva"
  de `leyendas_primera_era_2023`; no se cargaron todavía, solo se dejó
  investigado y documentado acá.
- Al revisar por qué faltaban ediciones, se detectó (comparando contra
  https://mesaredondatcg.cl/categoria-producto/carta/, una tienda que
  vende singles con el código de coleccionista real en el SKU) que TOR
  agregó silenciosamente **`lpb_4.0`** ("Leyendas - Primer Bloque 4.0",
  400 cartas) a su API — pero el `data/cards.json` commiteado tenía casi
  3 semanas de antigüedad (generado el 13-07-2026) y nunca la había
  recogido. **No era una edición que faltara en TOR (como LPE4/Mundos
  Perdidos): es un catálogo desactualizado.** Se corrió el scraper
  completo (`node scrape.js`, sin `--limit`) para ponerlo al día — pasó
  de 129 a 137 ediciones. De paso: `lpb_4.0` no estaba en la lista
  estática `EDITION_SLUGS` de `scraper/editions.js`, así que el scraper
  la clasificaba con el formato por defecto ("NE") en vez de "PB" —
  corregido (se agregó a `EDITION_SLUGS.PB`) y se corrigió también el
  `format` de las 400 cartas ya generadas. Se agregó su entrada a
  `data/editions.json`.
- **Hallazgo aparte, sin aplicar todavía**: cruzando las 472 cartas sin
  imagen de `leyendas_primera_era_4_0` + Mundos Perdidos contra los
  SKU exactos de esa misma tienda (ej. "LPE4 - 19/320 UR" — el código
  confirma edición Y número exactos, no solo el nombre — nombres
  repetidos entre ediciones distintas son comunes, ver "Silencio" con 3
  SKU distintos de 3 ediciones distintas en la búsqueda) se encontraron
  **117 coincidencias verificadas por código** (78 de LPE4, 39 repartidas
  en 4 ediciones Mundos Perdidos) con foto real disponible. **No se
  hotlinkearon** las imágenes de la tienda a los datos compartidos: son
  fotos de producto de un tercero comercial (no un wiki de fans ni la
  API oficial), y además el CDN de esa tienda no manda cabecera CORS
  (`Access-Control-Allow-Origin`), así que tampoco funcionarían con el
  export a PDF (que necesita `crossOrigin="anonymous"` para el efecto
  blanco y negro). Queda para que el dueño del inventario baje las
  fotos de los 117 productos identificados y las suba él mismo por
  "Editar carta" (que ya soporta subir un archivo de imagen local, sin
  depender de hotlink).

### 2026-08-02 (7ª iteración) — Colecciones con varias ediciones agrupadas
- El dueño del inventario notó que una colección solo aceptaba una edición,
  y pidió poder agrupar varias — el caso real: TOR lanza ~6 ediciones
  "Mundos Perdidos" por año, y quiere ir sumándolas a una misma colección a
  medida que las va comprando, en vez de tener una colección suelta por
  cada una.
- Cambio de modelo: `col.editions` (array) reemplaza a `col.edition`
  (string). Migración automática y transparente al cargar (`store.js`,
  `migrateCollection`) — corre en `read(KEYS.collections)`,
  `replaceCollections` (llega de la nube) y `applySnapshot` (restaurar
  respaldo/pull de nube), así que una colección vieja de un dispositivo con
  la versión anterior de la app también se migra sola al sincronizar.
- Modal de creación: el `<select>` de una edición se reemplazó por un
  checklist con buscador (`#col-edition-search` + `#col-edition-list`,
  agrupado por bloque igual que antes) — con 130+ ediciones un select no
  alcanza. La selección se guarda en una variable (`colModalSelected`), no
  en el DOM, para no perderla al filtrar (los checkboxes marcados que el
  filtro esconde igual cuentan).
- `collectionCards`/`collectionStats` ahora recorren `col.editions`
  (antes una sola). `compareEditionCards` gana un criterio de orden previo:
  por `editionOrd` (orden de publicación) — no cambia nada cuando todas las
  cartas son de la misma edición, así que las colecciones existentes de una
  sola edición se ven exactamente igual que antes. La caché
  `editionCardsCache` pasó de indexarse por edición a por `id` de colección
  (dos colecciones pueden compartir o combinar ediciones distinto).
- La grilla (`renderCollectionGrid`) agrega una sub-sección con título por
  edición cuando hay más de una (`Mundos Perdidos - Aliento de Fuego (20)`,
  etc.) — con cientos de cartas de varias ediciones mezcladas en una sola
  grilla sería imposible ubicarse. El auto-nombre al crear sin escribir uno
  usa hasta 2 nombres de edición unidos con "+", o "primeras 2 y N más".
- El alta automática de colección al registrar un intercambio (`Cambios`)
  ahora busca una colección que **incluya** la edición de la carta recibida
  (`c.editions.includes(...)`) en vez de exigir coincidencia exacta de una
  sola edición — así, si ya agrupaste varias "Mundos Perdidos" en una
  colección, un intercambio de cualquiera de ellas cae ahí en vez de crear
  una colección nueva suelta.

### 2026-08-02 (6ª iteración) — Corrección de numeración de leyendas_primera_era_2023
- El dueño del inventario reportó que en su colección "Leyendas 2023" la
  primera carta se veía bien pero la segunda mostraba el número 3
  directamente. Se verificó contra el wiki
  (`Lista de cartas de Leyendas - Primera Era 3.0`, el mismo set que TOR
  llama "2023"): TOR numera con un desfase de +1 respecto al código impreso
  real en la carta (TOR #2 = código real "001", TOR #3 = código real "002",
  etc.) — la carta #1 de TOR ("Monedas De Oro") es en realidad el código
  "000" del set, una carta firma, mismo patrón que las cartas "00" de
  Mundos Perdidos.
- Además, TOR numera correlativamente 25 cartas más (302-326) que en
  realidad son 3 categorías de coleccionista/promo separadas, cada una con
  su propio código impreso (10 "LPE23-301..310", 12 "Coleccionista 01..12",
  3 "Secreta Exclusiva 1..3") — no una continuación del set principal.
- Corrección aplicada en `scraper/corrections.js`
  (`LEYENDAS_2023_CORRECTIONS`, 326 entradas por `id` de carta) y
  enganchada en `scrape.js` justo después de armar el catálogo: pisa
  `edid`/`specialId` de salida pero **nunca el `id`** (que sigue siendo el
  original de TOR), así que sobrevive a que el scraper se vuelva a correr
  (todos los lunes) y no rompe cantidades/mazos ya guardados contra esos
  ids. Se aplicó también a mano al `data/cards.json` ya commiteado para que
  el fix esté activo de inmediato sin esperar al próximo lunes.
- Resultado: 300 cartas numeradas 1-300 sin huecos ni duplicados, más 26
  especiales (antes eran 301 "numeradas" con un hueco encubierto por el
  desfase, más 25 numeradas de más que en realidad eran 3 categorías
  distintas de coleccionista).

### 2026-08-02 (5ª iteración) — Editar cualquier carta (no solo las manuales) para marcarla Promo
- El dueño del inventario pidió poder convertir a "Promo" cualquier carta,
  no solo las manuales — el caso real: Leyendas 2023 y Leyendas - Primera
  Era 4.0 traen, después de su tope oficial (300 y 320 respectivamente),
  varias cartas coleccionista numeradas secuencialmente por el scraper de
  TOR que en realidad son Promo (ver ejemplo completo arriba, "Conceptos
  clave de la UI").
- El botón "✏️ Editar" del detalle de carta ahora aparece siempre. Al
  guardar una carta que no era `userCustom`, se crea una copia local con el
  mismo `id` que reemplaza a la original en `rebuildCards()` (antes:
  `state.cards` era una simple concatenación sin dedup por id, así que esto
  habría duplicado la carta). "Eliminar" pasa a decir "↩ Revertir a la
  original" cuando el id corresponde a una carta real del catálogo.
- **Bug encontrado al generalizar** (se manifestó recién al probar con una
  carta oficial real, no con una manual): el campo `editionName` que trae
  cada carta del scraper de TOR a veces es una versión abreviada (ej. "LPE
  2023") que no calza con el nombre "canónico" en `data/editions.json`
  ("Leyendas - Primera Era 2023"). El formulario de edición precargaba ese
  nombre abreviado en el campo Edición; al guardar, `saveCardForm` no lo
  reconocía como la misma edición y creaba una edición fantasma nueva y
  desconectada — la carta "desaparecía" de su colección real. Se corrigió
  precargando el nombre por **slug** (`state.editionName[card.edition]`,
  siempre el nombre correcto) en vez de confiar en `card.editionName`.
- **Segundo bug encontrado**: `saveCardForm` refrescaba con `applyFilters()`
  (solo la grilla del Catálogo). Como el botón Editar ahora es alcanzable
  desde Colecciones/Cambios/Mazos, guardar ahí guardaba bien pero la vista
  activa seguía mostrando los datos viejos hasta cambiar de pestaña.
  Cambiado a `refreshAll()` (ya existía, usado en otros flujos globales como
  la sincronización en la nube), que refresca la vista que esté activa.

### 2026-08-02 (4ª iteración) — Imágenes recuperadas en páginas traducidas sin desambiguador
- El dueño del inventario reportó imágenes equivocadas en sus colecciones
  personales "Brotherhood", "Brotherhood V.2" y "Bruderschaft". Se agregó
  un chequeo del campo `edición=` de la propia plantilla `{{Carta}}` de la
  página base, para reconocer como específicas las páginas de cartas
  traducidas que no llevan desambiguador en el título (detalle completo en
  "Imágenes de ediciones remake/aniversario" arriba). Aplica a todas las
  ediciones, tanto en el script de la skill como en el botón del navegador.
- Se generaron CSV corregidos con el script para las 3 ediciones y se le
  entregaron al dueño para reimportar sobre sus colecciones existentes
  (`Ediciones → [edición] → Elegir archivo CSV`); la fusión es por número,
  así que sobreescribe la imagen equivocada (o la deja en blanco si de
  verdad no hay ninguna confiable) sin duplicar cartas.
- Se corrigió además una afirmación desactualizada en `conocimiento.md`
  que decía que Bruderschaft "no tenía este problema" — no era cierto,
  nunca se había medido: al extraerla se comprobó que solo 78/170 cartas
  tienen página específica con imagen confiable (antes de esta mejora, sin
  ella hubiera sido incluso menos).

### 2026-08-02 (3ª iteración) — 8 ediciones "Mundos Perdidos" agregadas
- El dueño del inventario pidió cargar el lanzamiento más reciente de la
  línea "Mundos Perdidos" (Aliento de Fuego, Locura de Dragón, Horda
  Esteparia — ya tiene las 18 cartas físicas de Primera Era de cada una) y
  de paso "las que falten" de esa línea. Al revisar, TOR solo tenía 3 de la
  línea completa; 3 ediciones más ya figuraban en `data/editions.json` pero
  **sin ninguna carta cargada en ningún archivo** (bug preexistente: el
  selector las mostraba pero la colección salía vacía), y otras 5 ni
  siquiera tenían entrada. Se completaron las 3 con cartas faltantes y se
  agregaron las 5 que faltaban por completo — 8 ediciones × 20 cartas
  (18 numeradas + carta "00" y/o una extra "Promocional" según la edición)
  extraídas del wiki con la skill `importar-edicion-myl-wiki`.
- El extractor (`extract_myl_edition.py`) no reconocía el formato de tabla
  de estas ediciones (`!'''Código'''` en negrita, código sin guion tipo
  `MPAT 01/18`) ni el patrón de "carta 00"; se generalizó para soportar
  ambos (detalle en "Ediciones agregadas manualmente" arriba).
- Cobertura de imagen: Leyendas de Avalon 16/20, Viaje al Oeste 11/20,
  Señores del Trueno 11/20, Nube Roja 8/20, Tombstone 5/20, Aliento de
  Fuego 7/20, Locura de Dragón 5/20, Horda Esteparia 1/20 — las 3 más
  nuevas (el lanzamiento que pidió el dueño) tienen varias cartas sin
  ninguna página en el wiki todavía (ni siquiera base), no solo sin imagen
  específica, por ser cartas nuevas recién salidas.

### 2026-08-02 (2ª iteración) — Identificador correcto del "Set Clásico" de LPE4
- El dueño del inventario confirmó que sus 80 cartas físicas del "Set
  Clásico" de Leyendas - Primera Era 4.0 llevan el código `SCLPE4-NN`, no
  `SC-NN` como se había cargado. Se renombró el campo `specialId` de esas
  80 cartas en `data/custom-cards.json` (de `SC-01`…`SC-80` a
  `SCLPE4-01`…`SCLPE4-80`); el `id` interno de cada carta no cambió, para
  no perder las cantidades que el dueño ya tuviera registradas contra el id
  anterior.
- El extractor de la skill (`extract_myl_edition.py`) generaba el prefijo
  `SC-` a mano (hardcodeado); se corrigió para que use el prefijo completo
  tal cual aparece en el código del wiki (`_CODE_RE` ahora captura todo el
  prefijo, no solo si empieza con "SC" o no) — así, si otra edición futura
  trae un subconjunto paralelo con un prefijo distinto, se conserva tal
  cual en vez de aplanarlo a `SC-`.
- Se aprovechó para verificar si había imágenes disponibles para esas 80
  cartas: el wiki lista, para cada una, un enlace a una página propia
  ("Nombre (SCLPE4)"), pero se comprobó vía la API de MediaWiki que
  **ninguna de las 80 páginas existe todavía** (`missingtitle` en las 80).
  No hay entonces ningún scan específico del Set Clásico que se pueda
  cargar sin violar la regla de "no reciclar arte de otra edición" — se
  mantienen las 80 sin imagen hasta que el wiki las suba o el dueño las
  escanee a mano.

### 2026-08-02 — Exportar PDF visual de una Colección
- Nuevo botón "📄 Exportar PDF" en el detalle de una Colección
  (`js/app.js`, `renderCollectionDetail` → `exportCollectionAsPDF`) que genera
  un PDF (`exportCollectionPDF` en `js/exporters.js`) con la misma grilla de
  miniaturas que se ve en pantalla — no una tabla de texto — pensado para
  llevar impreso a una jornada de intercambio de cartas e identificar de un
  vistazo cuáles faltan.
- Las cartas que no se poseen se dibujan en blanco y negro y oscurecidas: se
  cargan con un `<canvas>` fuera de pantalla (`crossOrigin="anonymous"`) y se
  les aplica el mismo cálculo de píxeles que el filtro CSS de la vista
  (escala de grises + brillo al 50%) antes de incrustarlas como JPEG en el
  PDF con jsPDF. Funciona porque tanto `api.myl.cl` como el CDN de imágenes
  del wiki (`static.wikia.nocookie.net`) envían
  `Access-Control-Allow-Origin: *`.
- Respeta el mismo orden que la vista (especiales primero, luego numeradas) y
  pagina automáticamente en A4 apaisado. Las imágenes se cargan con
  concurrencia limitada (6 a la vez) y se reporta el progreso vía toast; una
  carta sin imagen (o que no cargó a tiempo) se reemplaza por un marcador con
  el nombre, igual que en pantalla.

### 2026-07-22 — Regla de imágenes estricta por defecto (todas las ediciones) + bug de confianza
- La regla "solo confiar en la imagen de una página específica de la edición"
  (antes opt-in con `--strict-images`) pasó a ser el comportamiento **por
  defecto** tanto en el script de la skill como en el botón "Cargar desde
  wiki" (`js/wiki-import.js`) — el usuario reportó que el mismo problema le
  había pasado en otras ediciones propias, cargadas desde el botón, sin
  haberlo comentado antes. El script conserva `--trust-fallback-images`
  como escape para reimpresiones 1:1 estables donde reciclar el arte de la
  página base es seguro.
- **Bug encontrado al generalizar**: cuando el enlace del wiki no trae
  ningún paréntesis de desambiguación (ej. `[[Loup-Garou]]`), `title` y
  `base` son el mismo string — el código anterior etiquetaba ese caso como
  "específica" por estar en la primera rama del chequeo, cuando en realidad
  es indistinguible de una página base compartida. Corregido en
  `resolve_card_content`/`resolveCardContent` (Python y JS): solo cuenta
  como específica cuando `title` trae su propio paréntesis. Afectó a 7
  cartas de `leyendas_primera_era_4_0` que tenían imagen indebidamente
  (bajó de 63 a 56 con imagen confirmada).
- Al recalcular las imágenes de `leyendas_primera_era_4_0` con la lógica
  corregida, aparecieron **nombres de carta duplicados dentro de la misma
  edición** (25 casos — la versión "Secreta"/"Legendaria" de una carta
  comparte nombre con su versión numerada normal, ej. "Dragón Blanco" x2).
  Actualizar por nombre habría mezclado la imagen de una con la otra; se
  corrigió emparejando por el `id` exacto de cada carta (que sí es único,
  incluye el número o especial) en vez del nombre.

### 2026-07-21 (3ª iteración) — Corrección: imágenes ajenas en Leyendas - Primera Era 4.0
- El dueño del inventario detectó que muchas cartas de `leyendas_primera_era_4_0`
  mostraban el arte de una edición ANTERIOR (Leyendas 3.0 u otras) en vez del
  de la impresión nueva — y que, para esas cartas, la habilidad puede además
  ser distinta aunque el arte se parezca (ej. Bjorn Ragnarsson). Se corrigió
  quitando la imagen de toda carta cuya página de origen no fuera específica
  de esta edición: bajó de 384 a **63** cartas con imagen; el resto queda
  para que el dueño las escanee/cargue a mano por el gestor de Ediciones.
- El script de la skill ganó el flag **`--strict-images`**: solo confía en la
  imagen cuando la página de donde salió es específica de la edición
  extraída (no la página base ni la fuente de la Nota). Ver la sección
  "Imágenes de ediciones remake / aniversario" más arriba para el detalle y
  el riesgo pendiente (la misma duda aplica a habilidad/historia, sin una
  forma automática de detectarlo todavía).

### 2026-07-21 (2ª iteración) — Nueva edición "Leyendas - Primera Era 4.0" y mejoras al extractor del wiki
- **Nueva edición bundled** `leyendas_primera_era_4_0` en `data/editions.json`
  (grupo Primera Era) y sus 432 cartas en `data/custom-cards.json`: no está
  en la API de TOR (confirmado consultando `/todas` en vivo), así que se
  extrajo del wiki y se sumó al catálogo compartido de la app (visible para
  cualquiera que entre al sitio, no solo como "Mi edición" personal).
- El script de la skill (`extract_myl_edition.py`) ganó soporte genérico
  para casos que esta edición dejó en evidencia y que probablemente se
  repitan en futuras ediciones "Leyendas X.0":
  - **Tablas de listado con encabezado "Código"** en vez de "N°", donde la
    primera celda es un código compuesto (ej. "LPE4 - 01/320 S"); se extrae
    el número real de ahí.
  - **Más de una tabla de cartas en la misma página**: antes solo se leía
    la primera tabla (hasta el primer `|}`), perdiendo en silencio todo lo
    que viniera después (acá, el "Set Clásico" en su propia subsección con
    su propia tabla). Ahora se recorren todas las tablas de la página.
  - **Subconjuntos paralelos con su propia numeración** (código con prefijo
    "SC", ej. "SCLPE4 - 77/80"): se tratan como cartas **especiales** con
    identificador `SC-NN` en vez de forzarlas al mismo número que una carta
    distinta del set principal (evita que "SCLPE4 #77" choque con "LPE4
    #77").
  - **Columna "Nota"** de la tabla (declara la carta/edición de origen de un
    reprint): se prueba como página candidata ANTES de rendirse — es un
    dato que el propio wiki documenta, no una conjetura, así que es seguro
    aplicarlo automáticamente (a diferencia de la búsqueda por texto+tipo,
    que sigue sin aplicarse sola). Redujo de 56 a 44 las cartas sin
    resolver en esta edición (bajaron exactamente las 12 que sí citaban una
    fuente; las 44 restantes son cartas genuinamente nuevas sin artículo
    propio todavía en el wiki — hueco real, no de la herramienta).
- Se revisó `scraper/scrape.js` para confirmar cómo detecta ediciones
  nuevas: ya lo hace solo, consultando `/todas` en cada corrida (no depende
  solo de la lista estática), corriendo automáticamente cada lunes vía
  GitHub Actions — ver sección de arriba.

### 2026-07-21 — Botón "Cargar desde wiki" en el gestor de Ediciones
- Nuevo `js/wiki-import.js`: versión en el navegador (sin backend) de la
  skill `importar-edicion-myl-wiki`, usando la API de MediaWiki con CORS.
  Mismo diseño de "nunca adivinar" que la skill (ver sección arriba).
- Nueva sección "Cargar cartas desde myl.fandom.com" en el editor de una
  edición: nombre de la edición en el wiki, página de promocionales
  opcional, botón "Buscar y cargar cartas", estado de progreso e informe de
  huecos (cartas que no se pudieron identificar con certeza).
- Refactor: `mergeEditionCards()` extrae la lógica de fusión (emparejar por
  número/especial/nombre, crear o actualizar) que antes solo usaba el
  importador CSV, ahora compartida con la carga desde wiki.
- Verificado con la API real mockeada en Playwright (resolución por página
  específica, por página base, cartas con coste "X", cartas especiales,
  reimportación idempotente sin duplicar, y manejo de error con mensaje
  claro). Contra el wiki real, desde el navegador automatizado de pruebas de
  este entorno, la conexión sigue bloqueada (mismo patrón que con las
  imágenes del CDN) — **queda pendiente que se confirme en un navegador real**.

### 2026-07-20 (6ª iteración) — Cartas especiales / promocionales por edición
- Las cartas manuales ganan el campo **`specialId`** (identificador libre: "Promo",
  "P-001"…): identifica cartas promocionales que no llevan número de carta.
- **Colecciones**: si la edición tiene especiales, la vista se divide en dos
  secciones tituladas — "Cartas promocionales / especiales" al inicio y luego
  "Listado de cartas de la edición" (numeradas). Sin especiales, se ve como antes.
- **Gestor de ediciones**: sección propia de cartas especiales con botón
  "Agregar carta especial" (el formulario abre con foco en el identificador).
  El identificador aparece como insignia dorada en la esquina de la carta.
- **CSV**: nueva columna `especial` (excluyente con `numero`); la plantilla incluye
  ejemplos (Inti "Promo", Lautaro "P-001"). Al reimportar, las filas con el mismo
  identificador especial actualizan la carta en vez de duplicarla.
- El orden dentro de una edición es: especiales por identificador (orden natural,
  P-1 < P-2 < P-10) y luego numeradas por número (`compareEditionCards`).
- El "total esperado" de la edición aplica solo al listado numerado; las especiales
  se suman aparte en la barra de progreso de la colección.

### 2026-07-20 (5ª iteración) — Gestor de ediciones personalizadas con importador CSV
- **Nuevo apartado "Ediciones"** (botón en la barra del Catálogo): crear, editar y
  eliminar ediciones propias con nombre, descripción, bloque/formato y **total
  esperado de cartas**; renombrar actualiza todas sus cartas en bloque (el slug no
  cambia, así inventario y colecciones no se desconectan).
- **Listado de cartas numerado** por edición: agregar/editar/quitar cartas una a una
  (el formulario de carta manual ganó el campo "Número en la edición"; con "Guardar
  y agregar otra" el número avanza solo).
- **Importador CSV UTF-8** con plantilla descargable (BOM incluido para Excel),
  columnas `numero,nombre,tipo,raza,rareza,coste,fuerza,habilidad,historia,imagen`
  (imagen = URL https). Valida el archivo y muestra vista previa con errores por
  fila antes de importar; el número identifica la carta, por lo que **reimportar
  actualiza en vez de duplicar**.
- Las ediciones propias aparecen agrupadas como "Mis ediciones" en los selectores,
  se pueden coleccionar (la barra de progreso usa el total esperado si está definido)
  y se sincronizan en la nube (`myl.editions.v1`, incluida en respaldo/importación).

### 2026-07-20 (4ª iteración) — Corrección de cartas manuales, botón arriba y búsqueda global
- **Bug corregido**: las cartas manuales perdían la marca `userCustom` al normalizarse
  (`normalizeCard`), por lo que el detalle no mostraba Editar/Eliminar y era imposible
  corregir una edición mal escrita (p. ej. "brotherhood" → "Brotherhood"). Ahora se
  preserva la marca y las cartas manuales vuelven a ser editables, incluida su edición.
- El botón **“+ Nueva colección” quedó arriba** del listado (antes quedaba al fondo a
  medida que crecía la lista).
- El **buscador de la barra superior ahora también filtra dentro de la vista activa**:
  en Colecciones filtra las cartas de la colección abierta y en Mazos las filas del mazo
  abierto (los totales y el aviso de faltantes siguen calculándose sobre el mazo completo).

### 2026-07-20 (3ª iteración) — Inventario de intercambio (Cambios) y ajuste visual
- **Nueva vista "Cambios"**: marcar copias repetidas como disponibles para cambio
  (con tope en lo que realmente se tiene), registrar intercambios (entregada −1,
  recibida +1) e historial con fechas. La carta recibida entra automáticamente a la
  colección de su edición; si no existe esa colección, **se crea sola**.
- Control "Para cambio" en el modal de detalle de cualquier carta, indicador
  "En cambio ×n" en las grillas y filtro "Ofrecidas para cambio" en el Catálogo.
- Persistencia en `myl.trade.v1` y `myl.tradelog.v1`, incluidas en respaldo JSON,
  importación y snapshot de nube.
- **Se quitó el candado (emoji) de las cartas bloqueadas** en Colecciones: el estado
  se comunica solo con el blanco y negro + oscurecido, más limpio visualmente.

### 2026-07-20 (2ª iteración) — Efecto B/N → color refinado, comentarios y optimización
- El efecto "carta bloqueada" de Colecciones ahora se aplica también al
  `.placeholder` (cuando la imagen no carga) y tiene **transición animada**:
  al marcar la primera copia la carta pasa de blanco y negro a color suavemente
  (`transition: filter`). Con hover se asoma un poco el color como vista previa.
- **Pasada de comentarios**: mapa del archivo al inicio de `app.js`, y cada
  sección funcional (colecciones, filtros, grilla, cambio de cantidades)
  documenta qué hace y cómo se conecta con el CSS/store.
- **Optimización**: caché de cartas por edición (`editionCardsCache`) para que
  el progreso de una colección no recorra las ~20k cartas del catálogo en cada
  clic de +/−; se invalida en `rebuildCards()` cuando cambia el catálogo.

### 2026-07-20 — Colecciones por edición, orden por número de carta y mejoras de UI
- **Nuevo `conocimiento.md`** (este archivo).
- **Nueva vista "Colecciones"**: crear colecciones eligiendo una edición (selector agrupado
  por bloque). Muestra las cartas de esa edición ordenadas por número de carta, con barra de
  progreso, filtro Todas/Solo faltantes/Solo obtenidas, renombrar y eliminar. Las cartas no
  poseídas se ven bloqueadas (filtro CSS blanco y negro + oscurecido + candado 🔒).
- **Persistencia**: colecciones en `myl.collections.v1`, incluidas en el respaldo JSON,
  en la importación y en el snapshot de sincronización con Supabase.
- **Orden por número de carta**: nuevas opciones "Número de carta (ascendente/descendente)"
  en el selector Ordenar del Catálogo (usa `edid` numérico). El orden "Edición" ahora ordena
  por bloque/edición según `editions.json` y, dentro de cada edición, por número.
- **Mejoras de interfaz**:
  - Pestaña "Colección" renombrada a "Catálogo" (para distinguirla de las nuevas Colecciones).
  - Selector de edición de los filtros agrupado con `<optgroup>` por bloque/era y en el
    orden real de publicación (antes era alfabético plano).
  - Insignia con el número de carta (`#N`) en cada carta de las grillas.

### Historia previa (resumen de commits anteriores)
- Scraper de api.myl.cl con ids estables + migración de claves legacy.
- Aviso y gestor de cartas fuera de catálogo.
- Sincronización Supabase con historial y tiempo real; respaldo/restauración JSON.
- Cartas manuales del usuario con imagen; export Excel/PDF/CSV; estadísticas con gráficos.
