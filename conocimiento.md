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
| `.claude/skills/registrar-nueva-edicion/` | Skill de Claude Code: orquesta el flujo END-TO-END para agregar una edición nueva al catálogo compartido (API → wiki → imágenes de tiendas por código exacto → registro en `data/editions.json`/`data/custom-cards.json` → validación → documentación). Encadena la skill de arriba para el paso del wiki; trae su propio script para recorrer el sitemap de mylserena.cl (`scripts/match_mylserena_sitemap.py`). |
| `scraper/` | Scraper Node (`scrape.js` + `editions.js`) que regenera `data/*.json`. Corre también por GitHub Actions (`.github/workflows/scrape-data.yml`). `corrections.js` guarda correcciones manuales conocidas de numeración/id/edición que TOR trae mal (se aplican por `id`, nunca lo cambian; también soporta `drop: true` para descartar duplicados exactos que TOR lista dos veces bajo dos ediciones distintas). |
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
  - **Reordenar el panel lateral**: cada tarjeta de colección se puede arrastrar
    (drag & drop nativo, `draggable` + `dragstart/dragover/drop`) para reordenarla
    libremente, y también trae botones ▲▼ como alternativa (arrastrar con mouse no
    funciona igual en touch). El orden es simplemente el orden del array
    `collections` en `store.js` — `store.reorderCollections(orderedIds)` lo
    reescribe completo.
  - **Editar ediciones de una colección ya creada** (botón "✏️ Editar ediciones"
    en el detalle): reabre el mismo modal de creación en "modo edición"
    (`openCollectionModal(col)`), precarga el checklist con sus ediciones actuales
    y al guardar llama a `store.setCollectionEditions(id, eds)` — agrega o quita
    ediciones sin perder el nombre ni la posición en la lista. El campo Nombre se
    oculta en este modo (se edita aparte, con el input del encabezado del detalle).
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

### 2026-08-24 (41ª iteración) — Imagen real de "Ira del Nahual" #6 (con el logo de la reedición 2022)
- El dueño encontró en laguarida.store la foto exacta de su carta física
  de "Ira del Nahual" (la que el sábado confirmamos que es la #6, con el
  logo "LA IRA DEL NAHUAL" agregado entre el ícono de Talismán y el
  coste — la reedición "Colección Completa 20 Años" de mayo 2022):
  `https://laguarida.store/product/ira-del-nahual-ira-del-nahual/`
  (categoría del sitio: Promocionales PE+ → Cartas Cole Completa PE, SKU
  `CCPE-INA-001`). La imagen confirma código "6-126 / PRIMERA EDICIÓN"
  visible en la carta, mismo texto de habilidad — no es una carta
  distinta, es la misma #6 que ya estaba registrada, solo que el
  catálogo mostraba el arte original sin el logo (el que trae la API de
  TOR) y no esta reimpresión.
- **Nuevo tipo de corrección**: hasta ahora `corrections.js` solo pisaba
  `edid`/`specialId`/`edition`/`editionName` (y desde la iteración
  anterior, `name`). Se agregó soporte para pisar también `image` —
  nueva tabla `IMAGE_CORRECTIONS` en `corrections.js`, sumada a
  `ALL_CORRECTIONS` en `scrape.js` con
  `if (fix.image !== undefined) c.image = fix.image;`. Pensada para
  casos donde la imagen que trae TOR es el arte "de fábrica" pero la
  mayoría de copias físicas en circulación hoy son de una reedición con
  arte distinto (mismo patrón que el logo "20/25 Años") — siempre
  confirmando contra el código impreso visible en la foto, nunca por
  nombre solo.
- Imagen descargada y auto-hospedada en
  `data/custom-images/laguarida/ira_del_nahual_006_logo.png` (nunca se
  hotlinkea). `IMAGE_CORRECTIONS["59-006"]` apunta a esa ruta; aplicado
  también directo al `data/cards.json` ya commiteado para que se vea de
  inmediato.
- Validado: JSON válido, Playwright con la API real bloqueada —
  filtrando por "Ira Del Nahual" y buscando "Ira del Nahual", la carta
  #6 ahora carga la imagen de laguarida con el logo, 0 `pageerror`.

### 2026-08-24 (40ª iteración) — Corrige nombre roto de TOR: "Nima Negra" → "Ánima Negra"
- Pendiente de la iteración anterior: TOR entrega esta carta (Mundo
  Gótico #038) con el nombre **"Nima Negra"** en el listado — no es el
  caso normal de "falta el acento" que ya cubre el enriquecimiento
  perezoso de nombres del navegador (`nameCache`/`scheduleNameCorrection`
  en `js/app.js`), acá falta la letra "Á" completa. Verificado que el
  endpoint de perfil de la propia API (`/cards/profile/mundo_gotico/anima_negra`)
  sí trae el nombre correcto, y que el `slug`/`legacyId` de la carta ya
  usan "anima_negra" — solo el campo `name` del listado está roto.
- **Por qué no se autocorregía sola**: el enriquecimiento de nombres del
  scraper (`--names` en `scrape.js`) es incremental — reutiliza los
  nombres de la corrida anterior y solo consulta cartas NUEVAS, salvo que
  se pase `--reenrich`. Como esta carta ya tenía una "base" con acentos
  guardada de antes (por otras cartas corregidas), nunca se volvía a
  consultar su perfil — el nombre roto quedaba pegado para siempre.
- **Arreglo, mismo patrón que las tablas de corrección existentes**: se
  agregó `NAME_CORRECTIONS` en `scraper/corrections.js` (nueva tabla,
  documentada igual que las demás) con `"58-038": { name: "Ánima Negra" }`,
  y se sumó `NAME_CORRECTIONS` a `ALL_CORRECTIONS` en `scrape.js` más un
  nuevo `if (fix.name !== undefined) c.name = fix.name;` en el loop de
  aplicación — así sobrevive a que el scraper se vuelva a correr (antes
  solo pisaba `edid`/`specialId`/`edition`/`editionName`, nunca `name`).
  Se aplicó el mismo cambio directo al `data/cards.json` ya commiteado
  (reemplazo puntual por `id`, el archivo es JSON minificado en una sola
  línea) para que se vea corregido de inmediato, sin esperar a la próxima
  corrida semanal del scraper.
- Validado: JSON válido, Playwright con la API real bloqueada — buscar
  "Anima Negra" muestra "Ánima Negra" en las 2 ediciones donde aparece
  (Mundo Gótico y Kit de Juego Primera Era - Full Art), 0 `pageerror`.

### 2026-08-24 (39ª iteración) — Nueva edición "Kit de Juego Primera Era - Full Art", 30/30 cartas + laguarida.store como fuente nueva
- El dueño encontró en una tienda nueva, **laguarida.store**, varias cartas
  "full art" (Chac's, Huracán, etc.) de Primera Era que no lograba ubicar
  en el catálogo, y pidió: (1) que existan como cartas propias para poder
  inventariarlas, con imagen de esa tienda; (2) guardar laguarida.store
  como referente de búsqueda/precios; (3) revisar el resto del sitio
  buscando fotos de mejor calidad para el catálogo de Primera Era en
  general ("tal y como lo hicimos una vez" — mismo criterio que con
  mylserena.cl).
- **Origen real de las 30 cartas**: dos productos del wiki, `Kit de Juego:
  Leyendas - Primera Era` (nov 2020) y su sucesor `... II` (dic 2020) — 8
  sobres + 6 cartas full art al azar de un pool de 12, más 3 extra de
  regalo por reserva ("Buy-a-Box"), 15 cartas por kit = 30 en total. El
  wiki aclara textualmente: **"las cartas full art mantienen su
  numeración original"** — o sea, son la MISMA carta (mismo nombre,
  mismo número, misma habilidad) que ya vive en el catálogo bajo su
  edición de origen (El Reto, Mundo Gótico, Ira del Nahual, Ragnarok, La
  Cofradía, Espíritu de Dragón) — solo cambia el arte a página completa.
  No hubo que adivinar el dato de juego de ninguna: se copió tipo, raza,
  coste, fuerza, habilidad y leyenda directo de la carta de origen que el
  wiki mismo declara en la tabla (columna "Origen"), cruzada por
  nombre+edid exacto contra `data/cards.json` — no por nombre solo.
- **2 casos que casi generan un hueco falso, resueltos sin adivinar**:
  - "Ataque Suicida" full art viene de una edición que en verdad NO
    tenemos, **"Mundo Gótico X"** (edid 013 de un total de 174 — el
    "Mundo Gótico" que sí tenemos solo llega a 170). Se usó igual la
    versión de "Mundo Gótico" (edid 139, mismo nombre, mecánica de Oro
    idéntica en las reimpresiones simples de esta franquicia) como dato
    base — "Mundo Gótico X" en sí queda pendiente de registrar si el
    dueño lo pide más adelante (edición completa faltante, no solo esta
    carta).
  - "Ánima Negra" full art no aparecía en el catálogo buscando por ese
    nombre — resultó que SÍ está (Mundo Gótico, Arma, edid 038), pero la
    API de TOR la entrega con el nombre roto **"Nima Negra"** (falta la
    "Á" completa, no solo el acento — no es el bug ya conocido de tildes
    que corrige `nameCache`). No se tocó `data/cards.json` (lo regenera
    el scraper); queda pendiente si el dueño quiere una entrada en
    `scraper/corrections.js` para ese nombre.
- **Imágenes**: las 30 se bajaron de laguarida.store (fotos propias,
  buena resolución) y se auto-hospedaron en
  `data/custom-images/laguarida/` — nunca se hotlinkean, mismo criterio
  que mylserena/mesaredonda (sin cabecera CORS confiable + no usar el
  ancho de banda de una tienda competidora).
- **Registro**: `data/editions.json` — entrada nueva
  `kit_juego_pe_fullart` (`format: "PE"`), insertada después de
  `espiritu_del_dragon` (las cartas de origen terminan ahí
  cronológicamente, y el kit salió después, nov/dic 2020). Nombre visible
  **"Kit de Juego Primera Era - Full Art"**. `data/custom-cards.json` —
  30 cartas nuevas, `specialId` con el código impreso tal cual aparece en
  la carta física (ej. `"76-126"` para Huracán) — 2 colisiones reales de
  código entre cartas de distinto origen (Naglfar/Grootslang ambas
  "5-126"; Hidromiel/Chacs ambas "79-126") resueltas con sufijo `-b`,
  mismo patrón ya usado en Lootbox PE 2025.
- **laguarida.store documentada** en `docs/FUENTES-DATOS.md` §6b como
  fuente de imágenes (WooCommerce/WordPress, JSON-LD con `sku` exacto,
  sitemap de productos en 15 archivos). **Pendiente, no hecho todavía**:
  recorrer el resto del sitio buscando fotos de mejor calidad para el
  resto del catálogo de Primera Era — el dueño lo pidió explícitamente,
  pero es un cruce de escala mayor (15 sitemaps de productos, potencial-
  mente miles de URLs de TODOS los juegos que vende la tienda, no solo
  MyL) que necesita su propio script de recorrido y filtro antes de
  ejecutarse — se deja para una iteración separada.
- Validado: JSON válido, Playwright con la API real bloqueada — filtrar
  por "Kit de Juego Primera Era - Full Art" muestra "30 cartas", Huracán
  aparece con su imagen de laguarida cargando, 0 `pageerror`.

### 2026-08-24 (38ª iteración) — Completa "Juego Organizado - Primera Era" (JO): 2 cartas nuevas, Hrist y Comerciantes del Río
- El dueño está agregando cartas a su colección de "Juego Organizado -
  Primera Era" (125 cartas ya en el catálogo, numeradas JO-01 a JO-125
  sin huecos) y notó que le faltaba **Hrist**, que tiene físicamente
  (confirmó con `https://mylserena.cl/hrist-promocional-jo` y
  `https://myl.fandom.com/es/wiki/Hrist_(J.O.)`). Pidió revisar TODAS las
  páginas del wiki que terminan en "(J.O.)" que sean de Primera Era, y
  cruzar también con mylserena.cl buscando slugs "-promocional-jo".
- **Wiki**: `action=query&list=search&srsearch=(J.O.)` (paginado, ~990
  resultados de texto libre) dio **95 páginas** cuyo título termina
  literalmente en " (J.O.)". Comparando contra el catálogo (125 cartas
  ya cargadas) solo 3 nombres no calzaban: Beleth, Comerciantes del Río,
  Hrist. **Beleth se descartó**: su página dice `edición = J.O. Primer
  Bloque 2025` — no es Primera Era, es de otro formato/bloque (fuera de
  lo pedido explícitamente por el dueño).
- **mylserena.cl**: se corrió `match_mylserena_sitemap.py --code-filter
  "promocional-jo"` (recorre el sitemap completo, no la categoría, que
  suele estar incompleta) → 63 páginas de producto. Cruzadas contra el
  catálogo, todas correspondían a cartas que ya estaban cargadas
  (algunas con nombre ligeramente distinto al de la URL — ej. "Mù Shé"
  ya estaba como JO-85, "Mordida" como JO-52, "Origami" como JO-80,
  "Maelstrom" como JO-36 pese a que el sitemap trae también el slug
  duplicado "malestrom-2025") — sin cartas nuevas que esta fuente no
  hubiera ya señalado. Confirma que las 2 fuentes coinciden: solo faltan
  **Hrist** y **Comerciantes del Río**.
- **Dato de ambas, extraído de su propia página del wiki** (fuente de
  máxima confianza, página específica J.O., no una base compartida):
  - **Hrist**: Aliado Dios, coste 2, fuerza 2, Promocional. "En tu Fase
    de Vigilia, puedes jugar este Aliado de tu Cementerio pagando su
    Coste. Una vez por turno, puedes descartar una carta de tu Mano para
    robar 1 carta o para que este Aliado gane 2 a la Fuerza hasta la
    Fase Final." Reprint full art de Hrist, entregada en los Torneos
    Relámpago del Torneo Premier Primera Era de agosto de 2026 a cambio
    de 3 Dracma Relámpago.
  - **Comerciantes del Río**: Oro Promocional. "Cuando entra en juego,
    tu oponente bota una carta de su Mazo Castillo. Puedes destruir este
    Oro para que tu oponente bote 1 carta de su Mazo Castillo." Mismo
    origen (Torneo Premier PE agosto 2026, Dracma Relámpago).
  - Ninguna trae texto de sabor (`historia`) documentado en su página ni
    en una plantilla base transcluida — se dejó `flavour` vacío, no se
    adivinó.
- **Numeración distinta al resto de la edición**: a diferencia de las
  125 cartas `JO-NN`, ambas traen el mismo código genérico impreso
  "EDICIÓN LIMITADA JO" (confirmado también en la descripción del
  producto de mylserena, idéntico texto) — no tienen número individual
  propio, es el nombre de esta sub-tanda 2026 completa. Se registraron
  primero con ese código literal como `specialId` (nunca `edid`, la
  carta no trae numeración propia); a pedido explícito del dueño ("que
  sean la JO-126 y JO-127 para que exista un orden") se renumeraron
  después a `specialId: "JO-126"` (Hrist) y `"JO-127"` (Comerciantes del
  Río), continuando la secuencia — es una numeración asignada por el
  dueño para orden interno del inventario, no el código real impreso en
  la carta (que sigue siendo "EDICIÓN LIMITADA JO" en ambas).
- Imágenes resueltas por `action=query&prop=imageinfo` contra los
  archivos `Hrist_JO.png` / `Comerciantes_del_Río_JO.png`, subidos a la
  página específica de cada carta — mismo criterio que el resto del
  archivo.
- Validado: JSON válido, Playwright con la API real bloqueada — ambas
  cartas aparecen por búsqueda en el catálogo, 0 `pageerror`.

### 2026-08-23 (37ª iteración) — Bugfix real: "Ciudad de los Césares" y "Uxmal" en Leyendas - Primera Era 4.0 estaban como Oro en vez de Tótem
- El dueño reportó que en su Mazo Principal, "Ciudad de los Césares"
  contaba como Oro en vez de Tótem. Investigando se confirmó que **no es
  un error en general**: en la edición "Ira del Nahual" esa carta
  genuinamente es un Oro Básico (confirmado en la API de TOR y en el
  wiki, código 126-126/Primera Edición) — el nombre se reimprimió varias
  veces y en ediciones posteriores (Mundos Perdidos - Ciudad de los
  Césares, Tierra Austral, Libertadores, Mazo Eterno, AyD Vigilantes,
  Kaiju vs Mecha - Titanes) sí es Tótem, un cambio real de diseño entre
  ediciones, no un dato mal cargado.
- El problema real estaba específicamente en la copia de **Leyendas -
  Primera Era 4.0** (edid 030): tipo "Oro", rareza "Sin Frecuencia",
  habilidad vacía — heredado por error de la página del wiki de "Ira del
  Nahual" (la fuente de fallback usada cuando LPE4 no tenía página
  propia, ver iteración de El Dorado #87), que trae el Oro básico, NO el
  Tótem real de esta edición. La imagen sí estaba bien (se había resuelto
  aparte, cruzando mylserena.cl por código exacto) — el problema era solo
  en los campos de texto, que quedaron desincronizados de su propia
  imagen. Se leyó la carta directo del scan ya guardado en
  `data/custom-images/mylserena/`: Tótem, coste 2, rareza Ultra Real
  (código "LPE4 - 30/320 UR"), habilidad "Sólo puedes tener una Ciudad de
  los Césares en juego. En tu Fase Final, si jugaste uno o más Aliados
  este turno, puedes robar una carta." La leyenda impresa anteriormente
  (heredada de Ira del Nahual) se quitó por no poder confirmarse para
  esta impresión distinta — mismo criterio de "no adivinar" que con las
  imágenes.
- Se revisó si el mismo patrón (imagen correcta ya resuelta + tipo/rareza
  heredados mal de una página base) se repetía en otras cartas de LPE4:
  se filtraron las cartas con imagen propia ya resuelta pero rareza
  "Sin Frecuencia" (21 candidatas) y se leyó cada scan directamente.
  Encontrado un segundo caso real: **"Uxmal"** (edid 338) también estaba
  como Oro cuando la carta impresa es Tótem, coste 2, rareza Promocional
  (código "LPE4 - 338/320 P"), con habilidad "Cuando entra en juego,
  puedes buscar un Tótem en tu Mazo Castillo que no sea Uxmal y ponerlo
  en tu Mano. Cada vez que otro Tótem entre en juego bajo tu control, tu
  oponente bota 1 carta." — mismo patrón: el nombre también existe en
  otra edición con tipo distinto (Tótem), señal que ya había servido para
  detectar el caso de Ciudad de los Césares.
- Las otras 17 candidatas revisadas (Monedas de Oro, Diamante Turquesa,
  Bafometh, Armadura de Valkyria, Sakura, Tzolkin, Codex Runicus ×2,
  Calabaza del Inmortal ×2, Fruto Sagrado, Raza Nocturna, Rosa de los
  Vientos, Lámpara Mágica, Ataúd de Marfil, Halatafl, Yasakani, Teatro
  Kabuki) sí eran genuinamente Oro — el tipo estaba bien, solo les
  faltaba completar habilidad/rareza/coste, que estaban visibles en su
  propio scan y no se habían transcrito. Se completaron las 17
  directamente desde la imagen ya guardada de cada una (fuente de máxima
  confianza: es la carta física exacta, no una página base ni una
  búsqueda). 4 de ellas (las "Set Clásico", prefijo `SCLPE4-`) no
  mostraban letra de rareza en el scan, así que su rareza se dejó como
  estaba (no se adivinó).
- **Pendiente sin resolver, no se tocó**: revisando este mismo lote
  apareció una inconsistencia distinta en **"Knarr"** (edid 091): la
  imagen ya guardada (`leyendas_primera_era_4_0_91_knarr.webp`) muestra
  el código impreso "LPE4 - 325/320 P" — una posición fuera del rango
  base de 320 cartas, no la 091 con la que está registrada. Puede ser
  una carta promocional/extra mal numerada (similar al bug real de
  numeración de Mundos Perdidos) o una imagen cruzada con el nombre
  equivocado (similar al caso de El Dorado #87/#324) — no se pudo
  determinar cuál sin una fuente adicional que confirme qué carta va
  realmente en la posición 091, así que se dejó intacta a la espera de
  esa confirmación en vez de adivinar.
- Validado: JSON válido, Playwright con la API real bloqueada — "Uxmal"
  y "Ciudad de los Césares" filtrados por nombre muestran la copia de
  Leyendas - Primera Era 4.0 como Tótem, 0 `pageerror`.

### 2026-08-23 (36ª iteración) — Nueva edición "Colecciones Raciales Primera Era 2025" (CRPE4), 117/117 cartas + bugfix real de texto con `<br>`
- El dueño preguntó si la API hablaba de "Colecciones raciales" porque
  tenía una carta física, **Pájaro Trueno (CRPE4)**, sin poder
  clasificarla. Se confirmó que ni `data/cards.json` (API de TOR) ni
  `data/custom-cards.json` tenían nada de "Colecciones Raciales Primera
  Era 2025" — solo estaban cargadas la de 2022 (`raciales_pe`) y la
  "Segunda Parte" (`crpe2`). El dueño pidió registrarla completa.
- **Extracción del wiki**: `Lista de cartas de Colecciones Raciales
  Primera Era 2025` lista 117 cartas en 9 "Kits" (uno por raza:
  Cazador, Licántropo, Vampiro, Bestia, Chamán, Guerrero, Abominación,
  Bárbaro, Dios), código `CRPE4 NN - 117`, cada una con su propia página
  de wiki (algunas con sufijo `(CRPE4)` cuando son reprint/remake de una
  carta anterior, otras sin sufijo cuando son cartas nuevas exclusivas de
  este producto — el título de página ya venía resuelto en el enlace de
  la tabla, no hubo que adivinar ninguno). Las 117 páginas se bajaron sin
  huecos; a diferencia de "Aniversario 25 años", la mayoría trae el campo
  `texto` (leyenda) directo en su propia plantilla `{{Carta}}` — 112/117
  con leyenda propia, más 3 recuperadas de una plantilla base transcluida
  (`Pájaro de Trueno`, `Karib`, `Hodur`), solo 5 sin leyenda documentada
  en ningún lado (Abramelin el Mago, Cerdo Calavera, Las Lilim, Brujo de
  Salamanca, Volsung — las 5 restantes de las 9 "Buy a Box").
- **Rareza mixta real, no numeración corrida**: la edición usa 4 rarezas
  (`Real` 88, `Vasallo` 14, `Cortesano` 6, `Promocional` 9) — a
  diferencia del bug de Mundos Perdidos, acá la mezcla es el diseño
  real del producto (tiers de rareza del juego) y la numeración
  `CRPE4 01..117` es correlativa sin saltos ni repeticiones, así que las
  117 llevan `edid` normal (no `specialId`). Los 9 `Promocional`
  correlativos al final (109-117) son las cartas "Buy a Box" de cada kit
  (una por raza), documentado explícitamente en su propia página, no una
  suposición.
- **Imágenes**: 117/117 resueltas por `action=query&prop=imageinfo`
  contra `Archivo:CRPE4-NNN-117.png`, subidas a la página específica de
  cada carta — mismo criterio de confianza que ya se usa para el resto
  de cartas de este archivo hospedadas en `static.wikia.nocookie.net`.
- **Bugfix real encontrado de paso**: varias habilidades de dos líneas en
  el wiki vienen con el HTML literal `<br>` en el texto (ej. Pájaro
  Trueno: `"...prevenirlo.<br>Una vez por turno..."`). `nl2br()` en
  `js/app.js` (usada para pintar la Habilidad en el detalle de carta)
  hace `escapeHtml(s).replace(/\n/g, "<br>")` — es decir, espera saltos
  de línea reales (`\n`), no la etiqueta `<br>` ya escrita: si el texto
  trae `<br>` literal, `escapeHtml` lo escapa a `&lt;br&gt;` y se ve roto
  en pantalla en vez de cortar la línea. Se corrigieron las 34
  habilidades/leyendas de esta edición (`<br>` → `\n` en el momento de
  extraer del wiki) y también 2 que habían quedado así en la edición
  "Aniversario 25 años" de la iteración anterior (Guerreros Indomables,
  Ullr) — corrección quirúrgica sobre esas 2 cartas puntuales en
  `data/custom-cards.json`, sin tocar nada más. **Nota para el futuro**:
  quedan ~249 ocurrencias de `<br>` literal en habilidad/leyenda en el
  resto del archivo (ediciones cargadas en iteraciones anteriores, antes
  de que se notara este patrón) — no se tocaron por quedar fuera del
  alcance de lo pedido acá, pero es un bug real pendiente si se quiere
  arreglar en otra pasada.
- **Registro**: `data/editions.json` — entrada nueva `crpe4`
  (`format: "PE"`), insertada según su fecha de lanzamiento real (11 de
  julio de 2025, confirmada en la página del producto del wiki) — antes
  de `leyendas_primera_era_4_0` (que salió después, ~septiembre 2025).
  `data/custom-cards.json` — 117 cartas nuevas, `id` con el patrón
  `crpe4__custom__{edid}_{nombre_slug}`.
- Validado: JSON válido en ambos archivos, Playwright con la API real
  bloqueada — filtrar por "Colecciones Raciales Primera Era 2025"
  muestra "117 cartas" en el contador (60 visibles de entrada por la
  paginación normal de la grilla, el resto tras "Cargar más", no es un
  bug), Pájaro Trueno aparece por búsqueda y su detalle ya renderiza el
  salto de línea como `<br>` real en el DOM en vez de texto escapado,
  0 `pageerror`.

### 2026-08-23 (35ª iteración) — Nueva edición "Aniversario 25 años" (Aniversario LPE25), 26/26 cartas
- El dueño tiene una carta física de **Maui** que dice "25 aniversario" y
  no aparecía en el inventario. La investigación pasó por tres
  correcciones sucesivas (documentadas en la conversación, no repetidas
  acá): un primer intento con un blog encontró solo 6 cartas y era
  incompleto; un segundo intento encontró el evento "25 Aniversario Años"
  (25 cartas en 4 formatos, PE 01-06/PB 07-12/FX 13-18/Imperio 19-25) pero
  su carta #13 (Caballero Negro) no calzaba; el enlace directo que pasó el
  dueño (`Maui_(Aniversario_LPE25)` en el fandom) reveló el set correcto:
  **"Aniversario LPE25"**, 26 cartas Primera Era, premio del **Torneo
  Nacional Primera Era 2025** (jugado 14-15 de marzo de 2026) a los 128
  mejores lugares + 2 mejores de cada Torneo Relámpago — ahí sí, carta #13
  = Maui, coincide con la física del dueño.
- **Confirmado que NO está en la API de TOR**: `curl
  https://api.myl.cl/cards/edition/todas` no trae ningún `ed_slug` que
  contenga "lpe25" ni "aniversario" salvo `espada_sagrada_aniversario`,
  `helenica_aniversario`, `producto_especial_furia_aniversario` (aniversarios
  de OTROS bloques, sin relación). Corresponde extraerla del wiki
  (Paso 2 de la skill `registrar-nueva-edicion`).
- **Extracción del wiki**: la tabla de premios de
  `Torneo Nacional Primera Era 2025` (sección "Cartas promocionales
  Aniversario Primera Era") lista los 26 códigos `ANIVERSARIO LPE25
  01`..`26` con su página específica `<Nombre> (Aniversario LPE25)`. Se
  bajaron las 26 páginas — cada una es una plantilla `{{Cartasintexto}}`
  completa (tipo, raza, coste de oro, ataque, habilidad, código, imagen)
  en la página específica de la edición, la fuente de máxima confianza
  según la skill. Ninguna hubo que resolverla por fallback ni por
  búsqueda — las 26 tenían su propia página.
- **Frecuencia**: las 26 cartas son `Promocional` de forma pareja (no hay
  mezcla con "Real" dentro de la edición), así que van numeradas
  correlativas por `edid` ("001".."026"), no como `specialId` — no aplica
  el caso de numeración corrida que sí aplicó en Mundos Perdidos.
- **Imágenes**: las 26 vienen de `Archivo:ANIVERSARIO LPE25 NN.png`,
  subidas a la propia página de la edición (no a una página base
  compartida) — se resolvieron las 26 URLs reales vía
  `action=query&prop=imageinfo` y se enlazan directo a
  `static.wikia.nocookie.net`, igual que ya se hace con el resto de
  cartas traídas del wiki en este archivo (ej. Leyendas - Primera Era
  4.0, ~588 URLs de ese mismo host ya en uso) — no se trata de una tienda
  comercial, así que no aplica la regla de auto-hospedaje en
  `data/custom-images/`.
- **Leyenda (flavour)**: cada página de la edición transcluye `{{Maui}}`,
  `{{Gilgamesh}}`, etc. — la plantilla base de la carta original de la
  que esta es reprint/remake — cuando esa página base existe. Se bajaron
  las 11 plantillas base referenciadas y se extrajo su campo `texto`
  (10 con éxito: Gilgamesh, Dragón Oriental, Ogro, Solomon→Puritano,
  Beerwolf, Enjambre, Maui, Lu Junyi, Daikoku, Sha Heshang→Sha Wujing;
  `Yokai`, la única que trascluye Criaturas Siniestras, no existe como
  página propia). Las 16 cartas restantes (mayoría Oro/Tótem/Talismán sin
  plantilla base transcluida) quedan con `flavour: ""` — no se inventó
  texto para ellas, es un hueco real de documentación del wiki, no un
  error de extracción.
- **Registro**: `data/editions.json` — entrada nueva `aniversario_lpe25`
  (`format: "PE"`), insertada al final del bloque PE (después de
  `toolkit_primera_era_2026`, ya que el torneo se jugó en marzo de 2026).
  Nombre visible **"Aniversario 25 años"**, tal como lo pidió el dueño.
  `data/custom-cards.json` — 26 cartas nuevas, `id` con el patrón
  `aniversario_lpe25__custom__{edid}_{nombre_slug}`.
- **Aviso de nombre parecido, no resuelto todavía**: el nombre pedido
  "Aniversario 25 años" es muy similar al del OTRO set de 25 cartas (el
  de las 4 mesas regionales, "25 Aniversario Años"/PE-PB-FX-Imperio)
  investigado en la misma conversación — ese otro set sigue sin estar en
  el catálogo. Quedan como dos ediciones con nombre casi idéntico si
  algún día se carga el otro también (`aniversario_lpe25` vs. un futuro
  slug distinto para el otro) — el dueño fue avisado para que decida si
  renombrar alguna cuando llegue ese caso.
- Validado: `python3 -c "import json; json.load(...)"` en ambos JSON,
  Playwright con la API real bloqueada — filtrar por "Aniversario 25
  años" en el selector de edición muestra las 26 cartas, Maui con su
  imagen cargando desde la URL del wiki, 0 `pageerror`.

### 2026-08-18 (34ª iteración) — El buscador global ahora también filtra Cambio y Ventas
- El dueño notó que el buscador de la barra superior ya filtraba
  Catálogo, Colecciones y el mazo abierto, pero no hacía nada en
  Cambio y Ventas — tenía que desplazarse a mano entre todas las
  cartas ofrecidas para encontrar una.
- `renderTradeList()` ahora respeta `#search` con el mismo criterio
  que ya usan Mazos/Colecciones (`card.searchText.includes(query)`):
  filtra qué tarjetas se muestran, pero el resumen ("N cartas
  distintas · M copias ofrecidas") y el valor potencial de venta
  siguen calculándose sobre TODO lo ofrecido, no solo lo que calza con
  la búsqueda — igual que "te faltan X copias" en un mazo filtrado.
  Mensaje aparte si la búsqueda no encuentra ninguna coincidencia.
  El listener del buscador global (`bindEvents`) suma la vista
  `"cambios"` a los `else if` que ya tenía para refrescar la vista
  activa sin recargar toda la página.
- Validado con Playwright: 2 cartas ofrecidas, buscar por el nombre de
  una las deja solo a ella, buscar algo que no existe muestra el
  mensaje de "sin coincidencias", limpiar la búsqueda restaura las 2.
  0 `pageerror`.

### 2026-08-18 (33ª iteración) — Bugfix real: no se podía dejar una carta manual sin imagen
- El dueño insistió en que no lograba quitar las imágenes equivocadas
  de sus cartas de Brotherhood/Brotherhood V2/Bruderschaft (las mismas
  ediciones personales de la iteración anterior, que siguen sin poder
  verse desde este lado). Como no puedo ver esas cartas, en vez de
  seguir pidiéndole que exporte su colección se revisó el formulario
  "Editar carta" en busca de una explicación — y apareció un bug real
  que probablemente sea la causa de fondo, no un error del dueño.
- **El bug**: en `openCardForm()`, al abrir una carta con imagen se
  precargan DOS lugares con el mismo valor: el campo de texto
  `#cf-image-url` (solo si la imagen es una URL/ruta) y la variable
  `cfImageData` (siempre, sin importar el formato — también cubre
  imágenes subidas como archivo, guardadas como `data:` base64). Al
  guardar, `saveCardForm()` arma la imagen final con
  `$("#cf-image-url").value.trim() || cfImageData || ""` — el
  problema es que **borrar el texto del campo URL a mano nunca borra
  `cfImageData`** (no hay ningún listener que lo haga), así que el
  `||` revive la imagen vieja igual, aunque el campo se vea vacío.
  Confirmado con un test que reproduce el bug intencionalmente
  (`test_confirm_bug.js`): crear una carta con imagen, borrar el
  campo URL a mano, guardar → la imagen sigue ahí. No existía ninguna
  forma de dejar una carta manual genuinamente sin imagen.
- **Arreglo**: botón nuevo "🗑 Quitar imagen" (`#cf-image-remove` en
  `index.html`, junto a la vista previa) que limpia los dos lugares a
  la vez (`cf-image-url`, `cf-image-file` y `cfImageData`) y refresca
  la vista previa — la única forma real de vaciarla. No se tocó el
  comportamiento de los campos existentes (subir archivo / pegar URL
  siguen igual) para no arriesgar romper nada que ya funcionaba.
- Validado con Playwright: crear carta con imagen → editarla → click
  en "Quitar imagen" → Guardar → el campo `image` queda `""` en
  `myl.customcards.v1` (antes, sin el botón, seguía con la imagen
  vieja pese a vaciar el campo de texto a mano — se dejó ese caso como
  test de control para probar que el bug era real). 0 `pageerror`.
- Sigue pendiente: revisar de verdad Brotherhood/Brotherhood V2/
  Bruderschaft necesita que el dueño exporte su colección (Exportar →
  JSON) y la comparta, porque esos datos siguen sin existir en este
  repositorio — este fix soluciona la HERRAMIENTA para que él mismo
  pueda corregirlas, no corrige esas cartas puntuales (que no puedo
  ver desde acá).

### 2026-08-18 (32ª iteración) — Bugfix real: imagen equivocada en El Dorado (LPE4 #87) + completar 20 cartas sin habilidad con datos verificados del wiki
- El dueño pidió tres cosas: (1) corregir imágenes equivocadas en sus
  colecciones personales "Brotherhood"/"Brotherhood V2"/"Bruderschaft";
  (2) auditar coste/fuerza en todo el catálogo, con "Lautaro" como
  ejemplo de carta que cambia de stats según la edición/rediseño; (3)
  completar habilidad y leyenda de las 83 cartas personalizadas
  detectadas sin habilidad en la iteración anterior, "sin que queden
  como personalizadas". De paso reportó un bug puntual: "El Dorado" de
  Leyendas - Primera Era 4.0 tiene la imagen de la carta #324 en vez de
  la #87.
- **(1) Brotherhood/Bruderschaft — fuera de alcance desde acá**: se
  buscó en todo el repo (editions.json, custom-cards.json) y no
  aparecen en ningún lado — son ediciones que el propio dueño creó con
  "Ediciones personalizadas", así que viven solo en su navegador (o su
  nube personal de Supabase). No hay forma de leerlas ni editarlas
  desde esta sesión sin que el dueño exporte su colección (botón
  Exportar → JSON) y la comparta.
- **(2) Lautaro — no era un bug**: se verificó contra los datos reales
  y cada edición YA tiene su propio coste/fuerza independiente
  (Ira del Nahual: coste 4/fuerza X: Leyendas PE 2022, LPE 2023,
  Lootbox PE 2025, CRPE2: coste 3/fuerza 3, la versión "rediseñada").
  El modelo de datos actual ya trata cada carta como única por edición
  — no hace falta ningún cambio estructural. Auditar las ~20.400
  cartas oficiales + ~1.100 personalizadas a ciegas no es viable sin
  arriesgar inventar datos, así que se acotó el trabajo real a lo
  verificable: los 83 huecos concretos ya detectados.
- **(3) El Dorado (LPE4 #87) — bug real confirmado y corregido**: se
  comparó a simple vista la imagen usada para la #87
  (`leyendas_primera_era_4_0_87_el_dorado.webp`) contra la imagen de la
  #324 (URL de wikia) — son literalmente la misma pieza de arte (dice
  "LPE4 - 324/320 P" en la esquina de AMBAS). Se corrigió: `image: ""`
  para la #87 (archivo `.webp` eliminado del repo, sin ninguna otra
  carta que lo referenciara) y `rarity: "Mega Real"` (verificado
  directo en la fila de la tabla de listado del wiki: "LPE4 - 87/320
  MR"). No se rellenó una imagen nueva porque no hay ninguna fuente
  confiable todavía: la página específica "El Dorado (LPE4)" no existe
  en el wiki (redlink), TOR no tiene esta edición scrapeada, y mylserena
  solo vende la versión promocional (#324), no la base (#87).
- **(3) Las 83 sin habilidad — se completaron 20, 63 quedan
  pendientes por falta de fuente confiable**: se corrió el script de la
  skill `importar-edicion-myl-wiki`
  (`extract_myl_edition.py`) contra las 4 ediciones involucradas:
  - **Mundos Perdidos - Horda Esteparia / Aliento de Fuego / Locura de
    Dragón** (20 cartas objetivo): las 3 ediciones resolvieron 100% con
    páginas específicas del wiki (0 sin resolver, 0 sin imagen) — muy
    recientes (páginas creadas días antes de esta sesión, agosto 2026).
    Se completó `ability`, `flavour`, `cost`, `strength` y `race`
    (cuando aplica) para las 20, todo verificado, sin adivinar nada
    (las imágenes YA existían correctamente en estas 20, no se
    tocaron).
  - **Leyendas - Primera Era 4.0** (61 cartas objetivo, de 432 en la
    edición): se corrió el script completo — resultado real: **0**
    resueltas con confianza alta, 24 solo con página base de OTRA
    edición (y esa página tampoco traía habilidad), 37 sin ninguna
    página en absoluto. Conclusión honesta: el wiki todavía no
    documenta esta edición (lanzada recién en septiembre 2025) a nivel
    de carta individual — no es un problema de búsqueda, es que el
    dato no existe públicamente todavía. No se rellenó nada a la
    fuerza.
  - **Juego Organizado - Primera Era** (2 cartas: Rapto de Idunn JO-62,
    Ave Fénix JO-116): no se encontró página del wiki que calce con
    esa serie promocional específica (sí existen páginas de "Rapto de
    Idunn"/"Ave Fénix" de OTRAS ediciones/años, pero asignarlas sería
    adivinar). Quedan pendientes.
  - Sobre "que no queden como personalizadas": estructuralmente van a
    seguir en `data/custom-cards.json` mientras TOR/api.myl.cl no
    scrapee estas ediciones (es justamente para eso que existe ese
    archivo aparte, para no perderlas en cada actualización semanal del
    catálogo) — pero las 20 completadas ahora tienen el mismo nivel de
    verificación/calidad de dato que cualquier carta oficial, no quedan
    "a medias" solo por ser personalizadas.
- Cambio puramente de datos (`data/custom-cards.json` +
  `data/custom-images/`), sin tocar `js/`ni `css/` — validado cargando
  la app y confirmando los valores nuevos en vivo. 0 `pageerror`.

### 2026-08-18 (31ª iteración) — Mazos Principal/Secundario: varios mazos pueden compartir cartas sin generar falsos conflictos de disponibilidad
- Conversación filosófica con el dueño a partir de la 29ª-30ª: notó que
  el modelo "toda carta se resta de TODOS los mazos por igual" (lo
  implementado en la 29ª) no calza con cómo realmente arma sus mazos —
  tiene cartas caras de las que solo posee 1 copia y las mueve a mano
  entre mazos según qué estrategia va a jugar, sin "registrar" ese
  movimiento en la app porque hacerlo generaba una alerta de escasez
  que no reflejaba su realidad física. Se llegó en conjunto (varias
  rondas de preguntas, ver el hilo) a un modelo híbrido: cada mazo
  tiene un **estado**, y ese estado —no la carta— es lo que decide si
  compite por disponibilidad.
- **Los dos estados**: 🧩 **Principal** (mazo que podría estar armado de
  verdad; compite por cartas con TODOS los demás mazos Principal que
  compartan una carta — igual que el modelo aditivo de la 29ª, pero
  ahora acotado a este subconjunto) y 📝 **Secundario** (plan/idea/
  experimento; no reserva ninguna carta, puede repetir cualquier
  cantidad de cualquier carta sin afectar a nada más). Puede haber
  cualquier cantidad de mazos en cada estado — no es "solo un mazo
  activo a la vez", el dueño puede tener 2+ mazos Principal compitiendo
  de verdad por una carta compartida (eso SÍ debe avisar) y a la vez
  varios Secundario sueltos para experimentar.
- **`js/store.js`**: cada mazo guarda `status: "principal"|"secundario"`
  (mazos nuevos nacen "principal"). `deckUsageForCard()` ahora solo
  suma mazos con `status !== "secundario"`. `setDeckStatus(id, status)`
  nuevo. Migración (mazos guardados antes de este campo, o restaurados
  desde un backup/dispositivo viejo sin él) quedan "principal" por
  defecto — se preguntó explícitamente al dueño y prefirió no cambiar
  en silencio los números que ya conocía, dejando que él baje a mano
  los que en realidad son solo planes.
- **Bug real encontrado al escribir el test, no relacionado con esta
  feature**: `createDeck()` generaba el id solo con
  `"d" + Date.now().toString(36)` — si se crean dos mazos en el mismo
  milisegundo (pasó al crear 2 mazos seguidos en un script de prueba),
  chocan y el segundo mazo termina mutando al primero en vez de crear
  uno nuevo. Se corrigió con el mismo sufijo aleatorio que ya usa
  `addCustomCard` para el mismo problema (`Date.now().toString(36) +
  "_" + Math.random()...`). En el uso normal por clics (con el diálogo
  `prompt()` de por medio) es extremadamente improbable que choque,
  pero quedó corregido para cualquier flujo futuro que cree mazos por
  código (import masivo, etc.).
- **`js/app.js`**: `deckStatusBadgeHtml(deck)` — pastilla clickeable
  ("🧩 Principal" / "📝 Secundario") que alterna el estado, usada en la
  fila de cada mazo en la lista lateral y en el encabezado del detalle
  del mazo (con una nota debajo explicando qué implica cada estado).
- Validado con Playwright: dos mazos Principal usando la misma carta
  (2+2, con solo 3 copias en inventario) → disponible 0 (compiten de
  verdad); bajar uno de los dos a Secundario con un clic en su pastilla
  → el mazo que queda Principal sigue reclamando sus copias
  normalmente, el Secundario deja de contar aunque tenga la misma carta
  repetida. Antes de este fix, el test de este mismo escenario falló
  por el choque de ids de `createDeck` — quedó como regresión cubierta.
  0 `pageerror`.

### 2026-08-15 (30ª iteración) — Ajuste de la 29ª: etiqueta "Disponible" en el control del modal + desglose siempre visible (Colección/Para cambio/En mazo)
- Tras la 29ª iteración, el dueño probó la app y notó dos cosas: el
  control del modal de detalle seguía diciendo "Para cambio" (el
  número mostrado era lo ofrecido en bruto, no lo disponible en vivo),
  y quería ver explícitamente DÓNDE están las copias que no aparecen
  como disponibles, no solo un aviso cuando hay un problema.
- `js/app.js`: la etiqueta del control pasó a **"Disponible:"** y el
  número que muestra (y el que se actualiza al usar +/-) ahora es
  `store.getAvailableQty()` (en vivo) en vez de `getTradeQty()` (bruto)
  — el +/- del control sigue editando el total ofrecido por debajo
  (`trade[id]`), pero lo que se ve siempre es lo realmente disponible.
  Se agregó `tradeBreakdown(cardId)`, que reparte el total que tienes
  de una carta en 3 baldes que **siempre suman el total que posees**
  (para que ninguna copia quede "perdida" en la cuenta): `coleccion`
  (= tenidas − ofrecidas), `paraCambio` (= disponible en vivo) y
  `enMazo` (= ofrecidas − disponible). Si algún mazo llegara a usar más
  copias de las que están ofrecidas, `enMazo` se recorta al total
  ofrecido en vez de mostrar un número que no cuadre.
  `renderDeckHint(el, cardId)` pinta esa leyenda ("Colección: X · Para
  cambio: Y · En mazo: Z") bajo el control, siempre visible (antes solo
  aparecía si había copias en algún mazo) y solo la pinta en rojo si
  `enMazo > 0` — si no hay nada comprometido es información neutra, no
  una advertencia.
- Mismo desglose en la tarjeta de la vista Cambio y Ventas (antes solo
  avisaba cuando había copias en mazos; ahora siempre muestra
  "Colección: X · Disponible: Y · En mazo: Z").
- `css/styles.css`: `.deck-hint` dejó de ser rojo fijo (ahora usa
  `.deck-hint.warn` para el caso con copias comprometidas, y color
  neutro el resto del tiempo).
- Validado con Playwright: con 4 copias sin usar en ningún mazo, el
  modal mostró "Disponible: 4" y el desglose "Colección: 1 · Para
  cambio: 4 · En mazo: 0" sin la clase de aviso; tras usar 3 en un
  mazo, mostró "Disponible: 1" y "Colección: 1 · Para cambio: 1 · En
  mazo: 3" con la clase de aviso activa; la vista Cambio y Ventas
  mostró la misma cuenta. 0 `pageerror`.

### 2026-08-15 (29ª iteración) — "Disponible" reemplaza el concepto de "Cambio": se ajusta solo al sumar copias y se descuenta por uso en mazos
- El dueño planteaba una molestia real de uso diario: cuando sumaba
  copias al inventario, "para cambio" no subía solo — tenía que
  corregirlo a mano cada vez (ej. sumar 7 copias y ajustar manualmente
  a 6 disponibles). Además notó que el concepto real que necesita no es
  "cambio" sino "disponibilidad": una copia sirve para colección,
  cambiar, vender O usar en un mazo, y quería que sumar una carta a un
  mazo restara automáticamente de lo disponible.
- Antes de tocar código se resolvieron dos decisiones de diseño con el
  dueño: (1) si una misma carta se usa en más de un mazo, ¿la
  disponibilidad se comparte entre todos o es independiente por mazo?
  Eligió **compartida** (un mazo B no puede "ignorar" que un mazo A ya
  está usando esas copias). (2) La pestaña se sigue llamando "Cambio y
  Ventas" (ahí también se vende, no solo se cambia) — sólo cambia la
  etiqueta por carta ("En cambio" → "Disponible") y el comportamiento
  interno, no el nombre de la pestaña.
- **Diseño elegido, y por qué**: en vez de mantener un número
  "disponible" guardado aparte que hubiera que ir sincronizando cada
  vez que se edita un mazo (con riesgo real de desincronizarse), el
  descuento por mazos se calcula **en vivo, solo al mostrarlo**
  (`store.getAvailableQty`) sumando cuántas copias usan TODOS los
  mazos ahora mismo y restándolo de lo que el dueño marcó como
  ofrecido (`trade[id]`, que sigue existiendo y sigue siendo editable
  a mano). Nada se persiste doble, no hay forma de que quede
  "pegado" un número viejo.
- **`js/store.js`**:
  - `setQty()` ahora ajusta `trade[id]` por delta cada vez que cambia
    la cantidad (`autoAdjustTradeOnQtyChange`): la PRIMERA vez que una
    carta entra al inventario (0→N) reserva 1 copia de colección y el
    resto queda disponible por defecto; sumar copias después de eso
    las suma íntegras a disponible (no se vuelve a reservar); restar
    copias se descuenta primero de lo disponible, protegiendo la copia
    de colección mientras quede al menos 1 en el inventario. Sigue
    siendo editable a mano después (`setTradeQty`/`addTradeQty`) — el
    auto-ajuste solo fija el valor por defecto al cambiar la cantidad.
  - `getAvailableQty(id)` nuevo: `trade[id]` menos la suma de copias
    de esa carta en TODOS los mazos (`deckUsageForCard`, compartido
    entre mazos según lo acordado), con piso 0.
- **Bug real evitado, no solo una mejora**: `executeTrade`/
  `executeSale` en `js/app.js` ya llamaban a `store.addQty(id, -N)`
  seguido de `store.addTradeQty(id, -N)` como dos pasos separados —
  con el nuevo `setQty` que ya descuenta `trade[id]` automáticamente
  por el mismo delta, esas dos llamadas hubieran restado DOBLE
  (comprobado con el test: sin sacar las llamadas redundantes, vender
  2 copias con oferta en 9 la dejaba en 5 en vez de 7). Se sacaron las
  llamadas a `addTradeQty` ahora redundantes en ambas funciones.
  También se endureció la validación: `executeTrade` ahora exige
  `getAvailableQty(given.id) >= 1` (antes solo miraba que quedara al
  menos 1 copia en el inventario general, sin mirar si estaba
  comprometida en un mazo) y `openSellModal`/`executeSale` capan la
  cantidad vendible al disponible en vivo, no a lo ofrecido en bruto.
- **UI**: tarjetas del Catálogo/Colecciones muestran "Disponible ×N"
  (antes "En cambio ×N") con `store.getAvailableQty`, actualizado en
  vivo al usar los botones +/− sin recargar. El modal de detalle
  muestra un aviso bajo el control "Para cambio" cuando hay copias
  comprometidas en mazos ("⚠️ N copias en uso en tus mazos —
  disponible ahora: M"). La grilla de "Cambio y Ventas" muestra lo
  ofrecido en bruto (editable) más esa misma nota, y deshabilita
  Intercambiar/Vender cuando lo disponible en vivo es 0 aunque lo
  ofrecido en bruto sea mayor. El filtro "Ofrecidas para cambio" del
  Catálogo ahora también usa el disponible en vivo, no lo ofrecido en
  bruto.
- Validado con Playwright de punta a punta: sumar 10 copias → disponible
  9; usar 4 en un mazo y 3 en OTRO mazo de la misma carta → disponible
  compartido baja a 2 (9-7); la vista Cambio y Ventas muestra la nota
  correcta y capa el modal de venta en 2; vender esas 2 copias deja
  owned=8, ofrecido=7 (NO 5, confirmando que no hay doble descuento) y
  disponible en 0. 0 `pageerror`.

### 2026-08-15 (28ª iteración) — Mazos en 3 tabs: Cartas fusionada con Distribución + espacios de carta faltante + Estadística con KPIs y gráficos
- El dueño pidió tres ajustes sobre lo agregado en la 26ª iteración: (1)
  las cartas se ven mucho mejor en la pestaña Distribución que en la
  lista de texto de Cartas, así que pidió fusionarlas; (2) como el
  formato Racial Edición exige mínimo 16 Aliados, si el mazo tiene
  menos debía haber "un espacio de carta" indicando cuántos faltan; lo
  mismo para completar las 50 cartas del Mazo Castillo, sin perder la
  función de buscar/añadir cartas; (3) la pestaña Estadística le
  pareció "muy simplona", pidió mejorarla en aspecto y en datos.
- **Fusión Cartas + Distribución**: la pestaña Distribución dejó de
  existir por separado — el mazo pasó de 4 a 3 tabs (Cartas/
  Estadística/Estrategia). `renderDeckContents()` ahora arma las
  mismas zonas por imagen que tenía Distribución (Aliados / Talismanes-
  Armas-Tótems / Oro / Otras, con `deckZoneOf()`), pero cada carta
  (`deckCardTileHtml()`) conserva toda la función que tenía la lista de
  texto: stepper +/- de cantidad (`.qty-row`, mismo patrón que ya usan
  las cartas de Colección), aviso de copias faltantes en la colección,
  y el aviso de ban list — ahora como una insignia roja "⛔" en la
  esquina de la carta (con el detalle en `title` al pasar el mouse) más
  el texto completo debajo del nombre, y el borde de la carta se pone
  rojo. El buscador para añadir cartas se mantuvo igual.
- **Espacios de carta faltante** (`deckGapTileHtml()`): una carta
  fantasma de borde punteado, del mismo tamaño que las demás, con un
  "+" y el texto de qué falta. Aparece dentro de la zona Aliados si el
  mazo tiene menos de `RACIAL_MIN_ALLIES` (16) Aliados ("Faltan N
  Aliados — Mínimo 16 en el formato Racial Edición"), y como una zona
  aparte "➕ Por completar" si el total del mazo es menor a
  `MYL_DECK_SIZE` (50) ("Faltan N cartas — El Mazo Castillo estándar
  usa 50 — busca arriba para completarlo"). Ambas constantes quedaron
  compartidas con el texto de la pestaña Estrategia (que ya mencionaba
  esas mismas reglas) para no repetir los números a mano en dos
  lugares. El espacio de Aliados no desaparece aunque el buscador
  superior esté filtrando esa zona a cero resultados — si no, el aviso
  "parpadearía" con cada letra que se escribe en el buscador.
- **Estadística mejorada**: antes eran solo unos chips ("Distribución
  por tipo": nombre + % ) y la matriz tipo×coste. Ahora:
  - 6 tarjetas KPI (mismo componente `.stat-card`/`statCard()` que ya
    usa la Estadísticas general de toda la colección): cartas del mazo
    (vs. 50), Aliados (vs. 16), coste promedio, razas distintas,
    copias faltantes y avisos de ban list.
  - 3 gráficos con Chart.js (`renderDeckCharts()` nuevo en
    `js/charts.js`) reutilizando el `PALETTE` y los mismos colores por
    tipo de gráfico que ya usa la Estadísticas general (curva de coste
    en azul `#5b8def`, tipo en el `PALETTE` categórico, razas en
    dorado `#c9a13b`) — se decidió así en vez de inventar una paleta
    nueva, para que se vea como parte de la misma app y no un widget
    aparte (revisada la skill `dataviz` antes de escribir esto: un eje,
    color por la función del dato, nada de arcoíris).
  - Se mantuvo la matriz "Detalle por tipo y coste" (los chips viejos
    se sacaron porque el gráfico de tipo ya cubre esa misma info de
    forma más visual; la matriz queda como la vista de datos exactos
    que pide la skill junto a todo gráfico).
- Se limpió CSS muerto que quedó de la lista de texto vieja (`.deck-
  row`/`.dr-*`) y de los chips (`.ds-chip*`).
- Validado con Playwright: mazo con 8 Aliados (bajo el mínimo) y 12-13
  cartas totales (bajo las 50) — apareció el espacio "Faltan 8
  Aliados" dentro de la zona Aliados y la zona "Por completar (37/38)"
  aparte; el +/- de una carta real funcionó (2→3, la carta no
  "desapareció" del grid); los 6 KPI mostraron los números correctos
  tras el cambio; los 3 `<canvas>` de los gráficos se crean (Chart.js
  no carga en este sandbox por la restricción de red ya documentada,
  pero la URL del CDN se probó accesible por fuera de Playwright — en
  el sitio publicado si carga, igual que ya lo hace la Estadísticas
  general). Revisado también en tema claro. 0 `pageerror`.

### 2026-08-15 (27ª iteración) — Bugfix: tipos de carta no canónicos ("Oro Con Habilidad", "Talisman" sin tilde…) rotos en filtros/íconos/agrupaciones
- El dueño preguntó por qué el Oro "Teepee" parecía tratarse distinto a
  "Puchao" siendo ambos Oro con habilidad. La causa: la carta Teepee de
  la edición "Leyendas - Primera Era 4.0" tenía `type: "Oro Con
  Habilidad"` en vez de `"Oro"` en `data/custom-cards.json` — el wiki
  (myl.fandom.com) a veces lista el tipo "detallado" en la plantilla
  `{{Carta...}}` en vez del genérico que usa el resto de la app, y el
  importador lo copiaba tal cual sin normalizar. Como todo en la app
  (filtros, íconos, `NO_STRENGTH_TYPES`, agrupaciones de Estadística/
  Distribución del mazo, etc.) compara el tipo por igualdad exacta de
  string contra "Oro"/"Aliado"/"Talismán"/"Arma"/"Tótem"/"Monumento",
  cualquier variante quedaba fuera de todo eso sin ningún error visible
  — no es un caso aislado de una carta, es un bug de datos que afectaba
  cualquier parte de la app que agrupe/filtre por tipo.
- Alcance real: 31 cartas en `data/custom-cards.json` (0 en
  `data/cards.json`, que viene limpio de la API) — 7 "Oro Con
  Habilidad", 1 "Oro Sin Habilidad", 18 "Talisman" y 5 "Totem" (las
  últimas dos, sin tilde), repartidas en 3 ediciones cargadas a mano:
  `leyendas_primera_era_4_0` (29), `mundos_perdidos_horda_esteparia`
  (1) y `juego_organizado_pe` (1).
- **Arreglado en 3 lugares** para que no vuelva a pasar:
  1. `data/custom-cards.json` — las 31 cartas corregidas con un
     reemplazo de texto quirúrgico (no un `json.dump` completo, que
     hubiera reformateado el archivo entero por una diferencia de
     indentación y generado un diff gigante para un cambio de 31
     líneas).
  2. `js/wiki-import.js` — nuevo `normalizeType()`/`TYPE_ALIASES`
     (mapea "oro con/sin habilidad"→Oro, "talisman"→Talismán,
     "totem"→Tótem) aplicado al importador desde el navegador (botón
     de Ediciones personalizadas).
  3. `.claude/skills/importar-edicion-myl-wiki/scripts/
     extract_myl_edition.py` — mismo `normalize_type()` aplicado al
     script que usa la skill de terminal, que tiene su propia
     implementación en Python independiente del JS.
- Sin este fix, cualquier edición nueva importada del wiki donde la
  tabla de esa edición liste el tipo "detallado" iba a volver a colar
  cartas rotas — quedó cubierto tanto el camino del botón en la app
  como el de la skill.

### 2026-08-15 (26ª iteración) — Mazos en 4 pestañas (Cartas/Estadística/Estrategia/Distribución) + ban list automática del formato Racial Edición
- El dueño pidió mejorar la construcción de mazos con varias cosas a la
  vez: (1) que la app avise en rojo cuando una carta del mazo está en
  la ban list oficial de Fénix (`blog.myl.cl/ban-list-primera-era-
  formato-racial-edicion`, se actualiza mes a mes) o cuando se pasa de
  copias permitidas; (2) un botón de "revisión de estrategia" con
  diagnóstico/fortalezas/debilidades/recomendaciones; (3) una vista de
  distribución por imagen agrupada en Oro/Aliados/Armas/Talismanes/
  Tótems; (4) reorganizar el detalle de un mazo en 4 tabs bajo su
  nombre: Cartas, Estadística (lo que ya existía), Estrategia y
  Distribución.
- Antes de implementar se preguntó explícitamente por dos decisiones
  de diseño: **IA de estrategia** — el sitio es estático (GitHub
  Pages, sin servidor propio), así que una IA real necesitaría una API
  key, y exponerla en el navegador dejaría que cualquier visitante la
  use a costa del dueño. Se acordó una **primera fase sin IA externa**
  (análisis 100% por reglas, gratis, corre al instante en el
  navegador), dejando la arquitectura lista para enchufar una IA real
  más adelante (posiblemente Ollama u otra opción gratuita) sin tener
  que rehacer el análisis. **Tab Distribución** — se acordó que fuera
  una foto fija agrupada por tipo (no un simulador de partida jugable
  como mazos.cl, que es un proyecto mucho más grande).
- **Scraper nuevo — `scraper/scrape-banlist.js`**: parsea las 3 tablas
  HTML del artículo de blog.myl.cl (prohibidas / límite 1 copia /
  límite 2 copias × 5 ediciones: El Reto, Mundo Gótico, La Ira del
  Nahual, Ragnarok, Espíritu de Dragón), resuelve el slug de edición
  contra `data/editions.json` (con normalización que ignora tildes y
  palabras de enlace "de/del/la", ej. "Espíritu de Dragón" ↔ "Espiritu
  Del Dragon") y escribe `data/banlist.json` (108 entradas: 43
  prohibidas, 33 a 1 copia, 32 a 2 copias, más metadatos de la
  actualización). Se agregó como paso nuevo en
  `.github/workflows/scrape-data.yml`, corre junto al scraper de
  cartas cada semana y solo commitea si el contenido cambió; si
  blog.myl.cl cambia de formato y el parser falla, el workflow sigue
  (no tumba la actualización del catálogo) y se queda con el
  `banlist.json` anterior.
- **Hallazgo al validar el matching**: cruzar por (edición, nombre)
  tal como las agrupa la propia página solo resolvía ~65% de las 108
  cartas contra el catálogo — la página agrupa por "edición que da
  soporte a esa raza", que no siempre es la edición real en la que TOR
  tiene catalogada la carta (ej. "Grifo"/"Trauko"/"Kanillu" figuran
  bajo la columna "La Ira del Nahual" pero el catálogo los tiene como
  "El Reto", su edición de impresión original). Matchear solo por
  **nombre** (sin exigir la edición) resuelve 104/108 (~96%); las 4
  restantes son erratas de tipeo del propio blog ("Niahm" en vez de
  "Niamh", "Anima Negra" en vez de "Nima Negra", "Zhang Guo La" en vez
  de "Zhang Guo Lao") — se corrigieron con un alias chico
  (`BANLIST_NAME_ALIASES` en `js/app.js`) para llegar a 108/108. Es un
  aviso informativo pensado para UN formato específico, no una
  validación de legalidad general — un mazo para otro formato puede
  mostrar el aviso igual y no aplicarle.
- **`js/app.js`**:
  - `loadData()` ahora también trae `data/banlist.json` (mismo patrón
    de cache-busting que los otros 4 archivos).
  - `getBanlistEntry(card)`/`banlistWarning(card, qty)`: lookup por
    nombre normalizado (tildes fuera + alias de erratas), devuelve
    texto de aviso ("Prohibida en Racial Edición…" o "Máx. N copias
    en Racial Edición, tienes M…") o `""` si no aplica.
  - `renderDeckContents()`: cada fila del mazo muestra el aviso en
    rojo (`.dr-ban`) bajo la carta si corresponde, y el banner de
    arriba (ya usado para "te faltan copias") suma un segundo aviso
    rojo con el total de cartas con problemas.
  - `renderDeckDetail()` ahora arma 4 tabs (`.deck-tabs`/
    `.deck-tab-panel`, reutiliza `.tabs`/`.tab` del nav principal) —
    Cartas (lo que ya había: buscador + listado + banner), Estadística
    (el `renderDeckSummary` que ya existía, sin cambios), Estrategia y
    Distribución nuevas. La tab activa es una sola variable global
    (`deckTab`), no por mazo — cambiar de mazo mantiene la pestaña que
    se estaba mirando.
  - **Estrategia** (`computeDeckStrategy`/`deckStrategyText`/
    `renderDeckStrategy`): cálculo separado del texto a propósito (si
    más adelante se conecta una IA real, esa función de cálculo le
    sirve de entrada tal cual). Revisa: tamaño del mazo contra las 50
    cartas de la construcción estándar (confirmado por fuente externa,
    ver Fuentes), copias por sobre el límite general de 3 (Oro
    incluido — la regla no distingue por tipo), proporción de Aliados,
    curva de coste (promedio + ausencia de jugadas tempranas/tardías),
    concentración racial de los Aliados (identidad fuerte vs. muy
    repartida, ya que casi todas las sinergias en MyL son por raza),
    cumplimiento de la ban list, y copias que faltan en la colección
    física. Arma diagnóstico + listas de fortalezas/debilidades/
    recomendaciones.
  - **Distribución** (`renderDeckDistribution`/`distCardHtml`): agrupa
    las cartas del mazo en 3-4 zonas visuales (Aliados / Talismanes-
    Armas-Tótems / Oro / Otras) con la imagen de cada carta y su
    cantidad, estilo "foto de mesa" pero estática — sin turnos, mano
    ni simulación de partida.
- **`index.html`**: sin cambios estructurales grandes — los 4 paneles
  se generan desde `js/app.js` dentro de `#deck-detail`.
- **`css/styles.css`**: `.deck-tabs`/`.deck-tab-panel`, `.dr-ban`
  (aviso rojo por fila), `.ban-banner` (banner rojo de arriba),
  `.strat-*` (secciones de Estrategia), `.dist-*` (zonas de
  Distribución, reutiliza `.cards-grid`/`.card`/`.card-img` del
  Catálogo para las miniaturas).
- Validado con Playwright: mazo de prueba sembrado con una carta
  prohibida (Orejona), una en el límite de 1 copia (Grootslang, dentro
  del límite), una en el límite de 2 copias con 3 puestas (Knochen,
  fuera del límite), y un Oro repetido 5 veces (fuera del límite
  general de 3) — el banner y las 2 filas correspondientes mostraron
  el aviso en rojo esperado (Knochen sí, Grootslang no por estar
  dentro del límite), la tab Estrategia mencionó ambos problemas
  (ban list + copias de más) con fortalezas/debilidades acertadas
  para la composición armada a propósito, la tab Distribución agrupó
  correctamente en 3 zonas, y el cambio entre las 4 tabs mostró
  siempre un solo panel visible a la vez. 0 `pageerror` en todos los
  escenarios.
- **Fuentes externas usadas para las reglas generales** (no inventadas):
  tamaño estándar de 50 cartas y límite de 3 copias por nombre desde
  [Reglas de Mitos y Leyendas — cartasmitosyleyendasoficial](https://cartasmitosyleyendasoficial.wordpress.com/reglas-de-mitos-y-leyendas/);
  reglas específicas del formato Racial Edición y su ban list desde
  [blog.myl.cl](https://blog.myl.cl/ban-list-primera-era-formato-racial-edicion/).
- **Pendiente para una fase futura** (ya conversado con el dueño, no
  implementado todavía): conectar una IA real (posiblemente gratuita
  vía Ollama) para que la Estrategia lea habilidades y combos en
  lenguaje natural en vez de solo reglas numéricas.

### 2026-08-10 (25ª iteración) — Modal de detalle: navegar anterior/siguiente sin cerrar (botones ‹ › + flechas del teclado)
- El dueño pidió poder avanzar/retroceder entre cartas del listado
  actual sin tener que cerrar el detalle y volver a hacer clic en la
  grilla — con botones a los lados y también con las flechas ←/→ del
  teclado.
- **`js/app.js`**: `openModal(card, navList, navIndex)` ahora recibe
  opcionalmente la lista ordenada desde la que se abrió la carta (y su
  índice ya calculado, para no tener que volver a buscarlo al navegar).
  Nuevo estado de módulo `modalNavList`/`modalNavIndex` +
  `updateModalNavButtons()` (oculta los botones si la lista tiene 0-1
  cartas, deshabilita el que corresponda en los extremos) +
  `modalNavStep(delta)` (no da la vuelta al llegar al final, se queda
  ahí con el botón deshabilitado). Los tres lugares que abren el modal
  ahora arman y pasan su propia lista de navegación, en el mismo orden
  en que se ve en pantalla:
  - **Catálogo** (`renderGrid`): `state.filtered` completo (no solo la
    página ya cargada — "siguiente" en la última carta cargada sigue
    avanzando sin que haga falta pulsar antes "Cargar más").
  - **Colecciones** (`renderCollectionGrid`): arma un `navList` propio
    mientras genera las secciones (especiales primero, luego numeradas,
    por edición si la colección agrupa varias) — sigue exactamente el
    orden visual, no el orden crudo de datos.
  - **Cambio y Ventas** (`renderTradeList`): solo las cartas
    efectivamente ofrecidas y renderizadas (las huérfanas que ya no
    están en el catálogo quedan afuera, como ya pasaba).
  - `cardEl`/`tradeCardEl` ahora reciben ese `navList` y se lo pasan a
    `openModal` en el clic de "detalle".
  - Atajo de teclado: el listener de `keydown` ya existente (el que
    maneja Escape) ahora también captura ArrowLeft/ArrowRight
    mientras el modal está abierto, ignorándolas si el foco está en un
    `input`/`textarea`/`select` (para no interferir con otros campos).
- **`index.html`**: dos botones nuevos (`#modal-prev`/`#modal-next`,
  ‹ / ›) como hermanos de `#modal-box` dentro de `#modal` — al no ir
  dentro de la caja, no se pierden si el detalle scrollea.
- **`css/styles.css`**: `.modal-nav` — círculo flotante fijo a los
  bordes del viewport, centrado verticalmente, atenuado (`opacity:0.3`)
  y sin click cuando `disabled`; achicado en móvil (`@media
  max-width:640px`).
- Validado con Playwright en las tres vistas: botón anterior
  deshabilitado en la primera carta de cada listado, siguiente
  deshabilitado en la última, clic en "siguiente" y en ArrowRight/
  ArrowLeft cambian la carta mostrada correctamente y navegan solo
  dentro de la lista de origen (probado que Cambio y Ventas con 3
  cartas ofrecidas no se sale de esas 3, aunque el catálogo completo
  tenga miles), botones ocultos por completo con una sola carta en la
  lista. Capturas de pantalla en escritorio y móvil para revisar
  la posición de los botones — confirmado con muestreo de píxeles que
  el fondo oscurecido (backdrop) sigue funcionando igual que siempre
  (se nota poco porque el tema ya es oscuro de por sí). 0 `pageerror`
  en todos los escenarios.

### 2026-08-10 (24ª iteración) — "Cambio y Ventas": sumatoria del valor potencial de venta de todas las copias ofrecidas
- El dueño pidió agregar un dato que sume el valor referencial (en
  pesos) de todas las cartas ofrecidas para cambio/venta, como
  estimativo del total que podría sacar por sus repetidas.
- **`js/app.js`**: nueva `renderTradeValue(entries)`, llamada desde
  `renderTradeList()` con las mismas `entries` (`store.getTradeList()`)
  que ya se usaban para el resumen de arriba. Por cada carta ofrecida
  toma `cardPriceInfo(id)` (mismo `data/prices.json`, cobertura
  parcial) y usa `mylserena ?? mesaredonda` como precio unitario —
  igual criterio que ya usaba `openSellModal` para prellenar el precio
  sugerido — multiplicado por la cantidad ofrecida, sumado entre todas
  las cartas. Las copias sin precio de referencia NO se inventan un
  valor: se cuentan aparte y se muestran en una nota
  ("N copias con precio · M sin precio de referencia, no incluidas en
  el total"). Si ninguna carta ofrecida tiene precio, muestra un
  aviso en vez de "$0" (evita dar una cifra falsa). Vista vacía (sin
  cartas ofrecidas) no muestra nada.
- **`index.html`**: nuevo `#trade-value` bajo `#trade-summary`, dentro
  del panel lateral de la pestaña Cambio y Ventas.
- **`css/styles.css`**: `.trade-value`/`.tv-note` (mismo estilo que
  `.trade-price`, nota secundaria en `--muted`).
- Validado con Playwright: sembrando 3 cartas con precio conocido en
  `data/prices.json` (×2 copias c/u) + 1 carta sin precio (×1 copia),
  el total calculado en pantalla coincidió exactamente con la suma
  esperada calculada manualmente ($3.100), la nota de copias
  con/sin precio salió correcta, y la vista vacía no deja HTML
  residual. 0 `pageerror` en ambos escenarios.

### 2026-08-10 (23ª iteración) — Titán Licántropo y Hombre Lobo (Leyendas 4.0, Set Clásico): imágenes cruzadas ENTRE ELLAS, mismo bug de siempre
- El dueño reportó que Titán Licántropo (SCLPE4-20) y Hombre Lobo
  (SCLPE4-21) tenían mal las imágenes, con dos URLs de referencia de
  mylserena.cl (`titan-licantropo-lpe4-scl`, `hombre-lobo-lpe4-scl`).
- Se abrió cada imagen ya guardada para comparar el código impreso
  contra el `specialId` del catálogo (misma técnica de siempre):
  - `sc_20_titan_licantropo.jpg` mostraba en realidad **"GUEVADAN"**,
    código impreso "SCLPE4 - 22/80".
  - `sc_21_hombre_lobo.jpg` mostraba en realidad **"TITÁN LICÁNTROPO"**,
    código impreso "SCLPE4 - 20/80".
  - Es decir, las imágenes de Titán Licántropo y Hombre Lobo estaban
    cruzadas ENTRE SÍ (no con Guevadan): el archivo con nombre de
    Hombre Lobo tenía la imagen real de Titán Licántropo.
  - Guevadan (SCLPE4-22) ya tenía su propia imagen correcta y separada
    (`sc_22_guevadan.webp`, código impreso "SCLPE4 - 22/80" confirmado),
    así que no hacía falta rescatar nada de ahí — el archivo viejo de
    `sc_20_titan_licantropo.jpg` (con la imagen de Guevadan) era un
    duplicado sobrante, se sobrescribió sin pérdida.
  - Se descargaron las imágenes de las dos URLs de referencia
    entregadas y se verificaron visualmente: la página
    `titan-licantropo-lpe4-scl` trae la foto con código impreso
    "SCLPE4 - 20/80" (Titán Licántropo, coincide con la que ya estaba
    mal ubicada en el archivo de Hombre Lobo — misma imagen); la página
    `hombre-lobo-lpe4-scl` trae la foto con código impreso
    "SCLPE4 - 21/80" (Hombre Lobo). Nota: el campo `"description"` de
    mylserena venía desfasado en ambas páginas (decía 21/80 y 22/80
    respectivamente) — no coincide con el código realmente impreso en
    la foto, así que se confió en el código impreso, no en el texto de
    la ficha de la tienda.
- **Fix**: se sobrescribió `sc_20_titan_licantropo.jpg` con la imagen
  correcta de Titán Licántropo y `sc_21_hombre_lobo.jpg` con la imagen
  correcta de Hombre Lobo (mismos nombres de archivo, `data/custom-cards.json`
  no necesitó cambios porque las rutas ya apuntaban a esos nombres).
- Validado sirviendo el repo por HTTP local y confirmando `200 OK` +
  `Content-Type` de imagen en ambas rutas; sin cambios de código no
  hacía falta prueba con Playwright.

### 2026-08-09 (22ª iteración) — Rediseño de la vista Cambios → "Cambio y Ventas": grilla con precio referencial + botón Vender nuevo
- El dueño pidió rediseñar el módulo de Cambios: mostrar las cartas
  ofrecidas como tarjetas con imagen (no la lista de texto que había),
  cantidad disponible y precio referencial debajo, más un botón
  "Vender" nuevo (aparte de "Intercambiar" que ya existía) para
  descontar del inventario con su propio registro.
- **`js/store.js`**: nuevo `saleLog` (`myl.salelog.v1`), mismo patrón
  que `tradeLog` — `getSaleLog`/`addSaleLogEntry`/`replaceSaleLog`,
  incluido en `getSnapshot`/`applySnapshot` (respaldo JSON y
  sincronización en la nube). Vender NO usa una tabla nueva de
  inventario — descuenta `inventory` y `trade` con las mismas funciones
  que ya existían, el log es solo el registro histórico (carta,
  cantidad, precio si se ingresó, fecha).
- **`js/app.js`**: `loadData()` ahora también trae `data/prices.json`
  (mismo patrón de cache-busting que los otros 3 archivos) a
  `state.prices`. `renderTradeList()` pasó de filas de texto a una
  grilla `tradeCardEl()` que reutiliza el `.card`/`.card-img` del
  Catálogo (imagen, badges de coste/fuerza/número, click abre el mismo
  modal de detalle) — agrega precio referencial (ambas tiendas si hay,
  "Sin precio de referencia" si no) y dos botones, Intercambiar (flujo
  ya existente) y Vender (nuevo `openSellModal`/`executeSale`, con
  cantidad y precio total prellenado desde `data/prices.json`,
  editable). Nuevo `renderSaleLog()` para el historial de ventas.
- **Bug real encontrado en la propia implementación, corregido en la
  misma iteración**: `executeSale()` llamaba `closeSellModal()` (que
  pone `sellCard = null`) ANTES del `showToast` final, que todavía
  usaba `displayName(sellCard)` — tiraba `TypeError` después de una
  venta exitosa (el registro sí quedaba bien guardado, pero la
  confirmación visual fallaba). Corregido capturando el nombre en una
  variable local antes de cerrar el modal. Encontrado con Playwright
  (`pageerrors`), no a simple vista.
- **`index.html`**: pestaña renombrada "Cambio y Ventas"; agrega el
  modal `#sell-modal` (cantidad + precio opcional) y la sección
  "Historial de ventas" junto a la de intercambios ya existente.
- **`css/styles.css`**: reemplaza `.trade-row`/`.tr-*` (listado de
  texto, ya no se usa) por `.trade-price`/`.trade-actions` sobre la
  grilla compartida `.cards-grid`; de paso se agregó
  `input[type="number"]`/`input[type="text"]` a la regla `.field` (los
  inputs del modal de venta quedaban sin estilo, la regla solo cubría
  `select`/`range`).
- Validado con Playwright: grilla muestra precio y cantidad
  correctamente, Vender descuenta inventario Y "en cambio" a la vez y
  deja el registro con precio, Intercambiar sigue funcionando igual que
  antes (inventario/colección automática/historial), vista vacía sin
  romperse, 0 `pageerror` en todos los flujos probados.
- **Cobertura de precios**: como ya se documentó en la 15ª iteración,
  `data/prices.json` solo cubre ~1.610 de ~21.500 cartas — las que no
  tienen precio muestran "Sin precio de referencia" en vez de
  inventarse un número.

### 2026-08-09 (21ª iteración) — Huanglong tenía todos sus datos de OTRA carta (misma raíz que el bug de imágenes); + fix estructural: ~9.346 cartas con Fuerza "0" espuria en Talismán/Arma/Tótem/Oro
- El dueño reportó que Huanglong (LPE4-208, Leyendas 4.0) tenía
  Fuerza 7 / Coste 4 cuando la carta física real es Fuerza 3 / Coste 3,
  y pidió revisar en general costos/fuerzas de todo el catálogo — de
  paso señaló que Talismán/Arma/Tótem/Oro no deberían tener NINGÚN
  valor de Fuerza (esas cartas no tienen ese stat en el juego), no un
  "0".
- **Huanglong resultó ser el mismo bug de raíz que las imágenes
  cruzadas de la iteración 20ª, pero en TODOS los campos, no solo la
  imagen**: no existe página `Huanglong (LPE4)` en el wiki, y la página
  base `Huanglong` (sin desambiguador) declara explícitamente
  `edición=[[Dinastía del Dragón]]` — una edición completamente
  distinta. En algún proceso anterior (probablemente una carga manual
  vieja, antes de que existiera la regla de "solo página específica" de
  este proyecto) se tomaron cost/strength/ability/flavour/raza de esa
  página base sin verificar que la edición coincidiera. Se encontró la
  fuente correcta (`Huanglong (MPO)`, de Mundos Perdidos - Viaje al
  Oeste — LPE4 la reimprime tal cual con nuevo arte) y coincide casi
  palabra por palabra con lo que muestra la foto real de la carta que
  ya teníamos cargada: Coste 3, Fuerza 3, Raza **Criaturas** (no
  Dragón), habilidad y textura completamente distintas a lo que había.
- **Revisión estructural pedida por el dueño** (Talismán/Arma/Tótem/Oro
  con Fuerza espuria): se encontraron **9.346 cartas** en total con
  `strength` puesto en un tipo que no debería tenerlo — 9.345 en
  `data/cards.json` (TOR manda `damage: 0` en vez de omitir el campo
  para esos tipos) y 1 en `data/custom-cards.json` (Balmung, Arma,
  Fuerza 2 — dato suelto, no relacionado al bug de TOR). De esas,
  9.334 eran exactamente "0" (el caso sistemático) y 12 tenían otros
  valores pequeños no-cero (posibles errores puntuales, no
  investigados uno por uno — quedan para otra pasada si el dueño los
  reporta). **Ojo con "Monumento"**: ese tipo SÍ trae un número real en
  ese campo (verificado contra su propio texto de habilidad, que
  referencia mecánicas de "Progreso") — no se tocó, sería un error
  distinto tratarlo igual que Talismán/Arma/Tótem/Oro.
- Corregido en dos capas: (1) `scraper/scrape.js` ahora fuerza
  `strength: null` para Talismán/Arma/Tótem/Oro en cada corrida futura
  (la causa de fondo, para que no vuelva a aparecer cuando TOR agregue
  cartas nuevas); (2) parche directo y mecánico sobre `data/cards.json`
  y el único caso de `custom-cards.json` para no tener que esperar una
  corrida completa del scraper (~15-20 min) para ver el resultado ya —
  es exactamente la misma transformación que aplicaría el scraper, solo
  que aplicada directo.
- Validado: 0 cartas con Fuerza espuria en esos 4 tipos en todo el
  catálogo (21.519 cartas revisadas), Huanglong con los datos
  correctos.
- **Nota para el dueño sobre el alcance**: no se hizo (ni es viable a
  mano) una revisión visual carta por carta de las 21.519 cartas contra
  su imagen real — eso solo se puede hacer cuando alguien reporta un
  caso puntual como este, comparando contra la foto de la carta física
  o la página específica del wiki. Lo que sí se hizo fue la parte
  **verificable mecánicamente sin ambigüedad** (la regla de "estos 4
  tipos no tienen Fuerza"), que cubre el patrón más común de error. Si
  encuentras otra carta con datos mal (como Huanglong), repórtala igual
  que esta vez — es el método que realmente funciona.

### 2026-08-09 (20ª iteración) — Bug real encontrado por el dueño: 3 cartas de Leyendas 4.0 tenían la imagen de OTRA carta con el mismo nombre
- El dueño reportó que "Fruto Sagrado" #169, "Dhampir" #171 y "Grimorio
  Sacro" #181 de Leyendas 4.0 tenían la imagen equivocada, y mandó los
  links de mylserena.cl con la imagen real de cada una.
- **Causa confirmada visualmente**: Leyendas 4.0 tiene varias cartas
  con el MISMO nombre en dos posiciones distintas (reimpresión
  Promocional más adelante en el mismo set — ej. "Fruto Sagrado" existe
  como #169 Real Y como #322 Promocional). Las 3 cartas reportadas
  tenían puesta la imagen de su contraparte #322/#323/#008 en vez de la
  propia — quedó la prueba abriendo el archivo: la imagen de la carta
  "169" decía literalmente "LPE4 - 322/320 P" impreso en la esquina.
  Es un resabio de un cruce automático de imágenes de una sesión
  anterior (probablemente matching por nombre sin verificar el número
  impreso en la carta).
- Se corrigieron esas 3 **y de paso las 13 cartas de Leyendas 4.0 que
  seguían sin imagen** (edid 330-352, el "Kit Pagano"/"Kit Vinland" y
  el aniversario 25 — el dueño avisó "de la rosa de los vientos en
  adelante también tiene imágenes"). Las 16 se resolvieron con el mismo
  método ya probado (sitemap de mylserena, cruce por código exacto
  `LPE4 NNN` impreso en cada producto, verificado uno por uno contra el
  `edid` antes de aceptar — nunca por nombre solo, justo la lección de
  este mismo bug). Se reusaron los datos ya crawleados de la iteración
  del módulo de precios (15ª) en vez de recorrer el sitemap de nuevo.
- Se borraron los 3 archivos `.webp` viejos con la imagen incorrecta
  (huérfanos, ninguna carta los necesita — sus contrapartes #322/#323/#8
  ya tenían su propia imagen correcta del wiki, sin relación con este
  cruce).
- Validado: 0 cartas sin imagen en Leyendas 4.0, las 16 cargan
  correctamente en Playwright.

### 2026-08-09 (19ª iteración) — Confirmado: las 6 imágenes de Mundos Perdidos seguían fallando en el PDF por overrides personales, no por el catálogo
- Después de la iteración 18ª (completadas las 6 imágenes en el
  catálogo compartido), el dueño volvió a generar el PDF y las mismas
  6 cartas (Xí Yóu Jí, Zhu Baie, Monte del Buitre, Poder del Relámpago)
  seguían sin imagen — verifiqué con `curl` que las URLs en
  `data/custom-cards.json` publicado eran correctas y accesibles, así
  que en un primer momento se atribuyó a una ventana de propagación de
  GitHub Pages (el PDF se generó ~2.5 min después del commit). El dueño
  probó de nuevo pasado ese margen y **seguía fallando** — descartada
  la teoría de propagación.
- **Causa real, confirmada por el dueño**: mismo mecanismo que la saga
  de TKPE24/25 al inicio de la sesión (iteración 9ª) — el dueño tenía
  **overrides personales** (`userCustom`) en esas cartas específicas
  (probablemente de cuando las agregó/editó él mismo mientras no tenían
  imagen), y esos overrides tapan cualquier corrección del catálogo
  compartido sin importar cuántas veces se arregle del lado del
  servidor. Confirmado revisando el botón de detalle de la carta
  ("↩ Revertir a la original" en vez de "✏️ Editar"). Al revertirlas
  desde la app, el PDF generó las imágenes correctamente.
- **Lección para futuras veces**: cuando una corrección de catálogo
  "no toma" para un usuario en particular, y las herramientas de
  verificación server-side (curl, JSON del repo) confirman que el dato
  está bien, la causa casi siempre es un override personal del usuario,
  no un bug de código — preguntar primero por el botón "Editar" vs
  "Revertir a la original" de la carta puntual antes de seguir
  ajustando el exportador u otro código. Esta sesión ya lo confirmó
  cuatro veces distintas (TKPE24, TKPE25, y ahora estas 6 de Mundos
  Perdidos) — es el sospechoso #1, no el último recurso.

### 2026-08-09 (18ª iteración) — El "PDF sin imágenes" en Mundos Perdidos NO era el bug del canvas: eran 6 cartas sin imagen real en el catálogo
- El dueño mandó capturas del PDF de "Mundos Perdidos" (220 cartas, 6
  páginas): varias cartas seguían sin imagen (Xí Yóu Jí, Zhu Baie,
  Monte del Buitre, Poder del Relámpago, Johnny Ringo — todas con
  marcador oscuro en vez de foto) y pidió que el PDF "se quede pensando
  todo lo que sea necesario" con tal de traer las imágenes.
- **Investigado antes de tocar el exportador de nuevo**: se revisó el
  campo `image` de esas cartas en `data/custom-cards.json` directo —
  **estaba vacío (`""`)**, no roto ni con URL mala. No era un problema
  de timeout/CORS del PDF (las dos iteraciones anteriores) — esas
  cartas nunca tuvieron imagen cargada en el catálogo, así que salen en
  blanco en CUALQUIER vista de la app, no solo en el PDF. Se encontraron
  6 en total: Zhu Baie, Monte del Buitre y Xí Yóu Jí (Viaje al Oeste),
  Poder del Relámpago (Señores del Trueno), Johnny Ringo (Tombstone) y
  Brunhild (Locura de Dragón, no salió en las capturas pero tenía el
  mismo hueco).
- Las 6 SÍ tienen imagen específica en el wiki (páginas sin
  desambiguador porque son impresión única) — resueltas y cargadas:
  `MPO-03-18`, `MPO-14-18`, `MPO-00-18`, `MPT-19-18`, `MPTO-20-18`,
  `MPSG-20-18`, todas confirmadas por el campo `edición=` propio de
  cada página coincidiendo con el catálogo. Reemplazo quirúrgico del
  campo `image` acotado al bloque de cada carta (nunca un reemplazo
  global de `"image": ""`, que pisaría la de otra carta con el mismo
  hueco).
- **Aparte, se atendió el pedido explícito** de priorizar completitud
  sobre velocidad en el exportador: `loadImageEl` en `js/exporters.js`
  pasó de 1 reintento (2 intentos × 12s) a **5 intentos con timeout
  creciente** (8s/12s/16s/20s/24s, ~80s de margen total por carta en el
  peor caso), y `CONCURRENCY` bajó de 6 a 4 para generar menos
  congestión propia. Esto ayuda con timeouts genuinos, pero no
  reemplaza revisar primero si la imagen existe en el catálogo — son
  dos causas distintas del mismo síntoma visual.
- Validado: JSON íntegro, las 6 ediciones de Mundos Perdidos quedan con
  0 cartas sin imagen.

### 2026-08-09 (17ª iteración) — Mismo bug de numeración "Mundos Perdidos" (2026-08-04) seguía sin corregir en 3 ediciones que vienen de TOR
- El dueño reportó que en su colección de Mundos Perdidos todavía había
  cartas con el número 2 cuando eran la carta número 1, y pidió correr
  la numeración (sin tocar las promo).
- **Causa**: el fix del 2026-08-04 corrigió las ediciones "Mundos
  Perdidos" que son 100% custom (`data/custom-cards.json`), pero
  **Ciudad de los Césares, Horrores de Salem y La Saga de Volsung** son
  las 3 únicas de esa familia que TOR sí tiene en su propia API
  (`131-xxx`, `130-xxx`, `132-xxx`) — el fix de esa vez nunca las tocó
  porque vive en `custom-cards.json`, no en `scraper/corrections.js`.
  TOR numera corrido 1..20 empezando por la carta "00" del wiki (el
  Tótem/Oro firma del producto, sin número real impreso), así que cada
  carta normal queda con +1 respecto a su número real. Verificado carta
  por carta contra las 3 páginas de listado del wiki (`MPC/MPS/MPV
  00/18` en adelante).
- Nueva tabla `MUNDOS_PERDIDOS_TOR_CORRECTIONS` en
  `scraper/corrections.js` (60 entradas, mismo criterio que
  `LEYENDAS_2023_CORRECTIONS`: la carta "00" pasa a especial
  `<prefijo>-00`, el resto se corre -1) + wireada en
  `scraper/scrape.js` → `ALL_CORRECTIONS`. Corrida completa del
  scraper: "Corregidas 419 cartas" (359 de antes + 60 nuevas).
- Validado: `131-001`/`130-001`/`132-001` ahora son especiales
  (`MPC-00`/`MPS-00`/`MPV-00`), el resto corrido -1 sin huecos (001-019
  en cada una). Playwright con las 3 ediciones en una colección → 60/60
  cartas, especiales primero, numeración correcta, 0 `pageerror`.
- **Nota para el dueño**: si alguna de estas cartas específicas la
  habías editado manualmente en algún momento, esa edición personal
  sigue viva en tu navegador y va a tapar este arreglo del catálogo —
  mismo mecanismo que pasó con TKPE24/25 (ver iteraciones 9-13). Si
  después de este deploy alguna sigue mal, revisa el botón de esa carta
  ("↩ Revertir a la original" vs "✏️ Editar") o usa `fix-toolkit.html`
  como referencia de cómo se resolvió antes (aunque esa herramienta es
  específica de Toolkit, no de Mundos Perdidos).

### 2026-08-09 (16ª iteración) — El fix del PDF sin imágenes era incompleto: faltaba un reintento por timeout en colecciones grandes
- El dueño mandó captura del PDF de "Leyendas 4.0" (432 cartas): la
  mayoría de las cartas cargó bien, pero alguna suelta (ej. "Kordrag")
  salió sin imagen — y esa carta usa una imagen **propia** (mismo
  origen que la app, `data/custom-images/...`), no una externa. Eso
  descarta el "canvas tainted" de la iteración anterior como causa de
  ESTE caso puntual (un origen igual nunca deja el canvas tainted, sin
  importar la caché) — es un problema distinto que coincidía en el
  síntoma (carta sin imagen) pero no en la causa.
- **Causa real de este caso**: con cientos de imágenes pidiéndose en
  paralelo (`CONCURRENCY = 6` en `exportCollectionPDF`), alguna puede
  tardar más que el timeout de 12s por congestión de red pasajera, no
  porque la imagen esté rota — se confirmó que el archivo en el sitio
  publicado es idéntico byte a byte al del repo y responde 200 sin
  problema por separado.
- Corregido en `js/exporters.js`: `loadImageEl` ahora reintenta una vez
  (dos intentos de 12s cada uno) antes de rendirse y dejar el marcador
  "sin imagen". De paso, el cache-busting `?_pdfcors=1` de la iteración
  anterior (necesario solo para el problema de canvas tainted con
  imágenes externas) se acotó a URLs externas (`http(s)://`) — las
  imágenes propias no lo necesitan y así no pierden el beneficio de la
  caché del navegador en colecciones grandes, que es justo el escenario
  donde más ayuda a evitar los timeouts.
- Mismo aviso que la iteración anterior: no se pudo reproducir un
  timeout real en este entorno de desarrollo (sin salida a redes
  externas desde el navegador de pruebas) — el fix se valida por
  código, pedirle al dueño que confirme con una colección grande tras
  el próximo deploy.

### 2026-08-09 (15ª iteración) — Módulo de precios referenciales: crawl de 2 tiendas + botón "Excel de precios"
- El dueño pidió poder estimar el valor de mercado de sus cartas
  (poseídas y faltantes) y descargar un listado con nombre, código,
  edición y precio referencial.
- **Recolección**: se armaron dos crawlers (`scripts` en el scratchpad
  de la sesión, no en el repo — son de un solo uso, no forman parte del
  flujo normal de la app): `mylserena.cl` (sitemap completo, ~9.567
  páginas de producto, 2.463 con código+precio) y `mesaredondatcg.cl`
  (categoría paginada, ~2.025 páginas, 2.007 con SKU+precio — esta
  tienda devuelve 403 sin un User-Agent/Accept de navegador completo,
  no es bloqueo del proxy).
- **Cruce contra el catálogo, sin adivinar**: cada tienda usa un
  prefijo de código propio (`TKPE24`, `LPE4`, `MPO`, etc., ~49-60
  distintos por tienda) que no coincide 1:1 con nuestros slugs de
  edición. En vez de mapear a mano/a ojo, se verificó cada prefijo
  automáticamente: para varias filas de code+número de esa tienda, se
  cruza el NOMBRE de la carta (que ambas tiendas sí entregan limpio,
  vía `<title>` en mylserena o el campo `name` del JSON-LD en
  mesaredonda) contra el nombre real de nuestro catálogo en esa misma
  posición numerada — solo se acepta un prefijo si el mismo edition
  gana consistentemente en varias muestras. De ~49-60 prefijos por
  tienda, quedaron **25 mapeos verificados con evidencia real**
  (TKPE24/25/26, LPE4, LPE23, ONY, EXPE, CRPE2, varias "Mundos
  Perdidos", LPB4, DRA, PBX, etc.) — los que no alcanzaron confianza
  alta se dejaron fuera en vez de forzarlos.
- **`data/prices.json`** (nuevo, generado una vez a partir del crawl —
  no se regenera automáticamente todavía, sería trabajo aparte
  automatizarlo vía GitHub Actions si se quiere mantener al día): mapa
  `id de carta → {mylserena, mesaredonda}` con el precio más barato
  encontrado en cada tienda para esa carta (puede haber varias filas
  por rareza/reimpresión en la tienda; se usa la más barata). **1.610
  cartas con al menos un precio**, 260 con precio de ambas tiendas.
- **Decisión de diseño sobre discrepancias de precio** (a pedido
  explícito, se descartó usar la moda): con solo 1-2 tiendas la moda no
  tiene sentido estadístico (necesitas bastantes muestras repetidas
  para que "el valor más frecuente" signifique algo). Se muestran
  **ambas columnas de precio por separado** en vez de fabricar un único
  "valor de mercado" — más honesto que promediar 2 puntos de datos.
- **Nuevo botón "💰 Precios (.xlsx)"** en el menú Exportar del Catálogo
  (respeta los filtros activos, igual que los demás exports de esa
  lista): `exportPricesExcel()` en `js/exporters.js`, hoja "Precios"
  con Nombre/Código/Edición/Formato/Tengo/Precio mylserena/Precio
  mesaredonda, más una hoja "Info" con la fecha de generación y una
  nota explícita de que la cobertura es parcial. El "Código" mostrado
  es el identificador interno de la app (`#NNN` o el `specialId`), no
  el código impreso real de la tienda — no se intentó reconstruir ese
  formato por carta.
- Documentadas ambas tiendas como fuente de precios (no de catálogo) en
  `docs/FUENTES-DATOS.md` sección 6b, junto a la nota de que sirven
  también para imágenes.
- Validado: el merge cartas↔precios se probó con Playwright contra los
  archivos reales servidos localmente (1.610 cartas cruzadas
  correctamente, nombres y ediciones coinciden) — la escritura del
  .xlsx en sí no se pudo probar end-to-end en este entorno (el CDN de
  la librería XLSX no es alcanzable desde el navegador headless de
  pruebas), pero reusa exactamente el mismo patrón que `exportExcel()`
  (ya en producción desde antes).

### 2026-08-09 (14ª iteración) — Bug real: el PDF de Colección no incluía imágenes (canvas "tainted" por reuso de caché sin CORS)
- El dueño reportó que al exportar el PDF de una colección, las cartas
  salían sin imagen (marcador oscuro) pese a que en pantalla sí se ven.
- **Causa real**: cada carta ya se muestra en algún momento como `<img>`
  normal en la grilla de la app (Catálogo/Colecciones), sin
  `crossOrigin` — eso deja en la caché HTTP del navegador una respuesta
  "no validada por CORS" para esa misma URL. Cuando el exportador de PDF
  pide la MISMA url con `crossOrigin="anonymous"` (necesario para poder
  leer los píxeles del canvas y aplicar el efecto blanco y negro a las
  que faltan), el navegador puede reusar esa entrada de caché en vez de
  volver a pedirla — el `<canvas>` queda "tainted" aunque el servidor sí
  mande `Access-Control-Allow-Origin` (confirmado que `api.myl.cl` y el
  CDN del wiki lo mandan, así que no era un problema de esas fuentes
  específicamente). `ctx.getImageData()`/`canvas.toDataURL()` tiran
  `SecurityError` en un canvas así — sin try/catch, **una sola** carta
  con este problema abortaba `Promise.all` y con eso toda la
  exportación quedaba sin imágenes.
- Corregido en `js/exporters.js`: (1) `loadImageEl` agrega un parámetro
  `?_pdfcors=1` a la URL antes de pedirla, forzando una petición nueva
  que si pase por validación CORS real en vez de reusar la caché
  "opaca"; (2) `renderCardThumb` ahora envuelve el
  `getImageData`/`toDataURL` en try/catch — si de todos modos queda
  tainted (caso raro), esa carta puntual cae a su marcador en vez de
  tirar abajo el PDF completo.
- No se pudo reproducir el "tainted canvas" en este entorno de
  desarrollo (el navegador headless de las pruebas no tiene salida a
  redes externas, solo a `localhost`), así que el fix se validó por
  código + por el mecanismo documentado del navegador, no con una
  reproducción end-to-end — pedirle al dueño que confirme tras el
  próximo deploy.

### 2026-08-09 (13ª iteración) — Descubre que la tabla curada "Klu" de 20 Años (Primera Era) estaba incompleta; agrega Tótem de Guerra y Golpe Vampiro
- El dueño reportó tener físicamente un "Tótem de Guerra" con el logo
  "20 Años" que no estaba en las 7 cartas cargadas en la iteración
  10ª/11ª. Al re-seguir la cadena real `anterior`/`siguiente` del wiki
  desde "Flechero (20 Años)" (en vez de confiar en la tabla resumen de
  la página "Cartas Promo Primera Era Klu"), se descubrió que esa tabla
  **no era exhaustiva**: entre "Tesoro de Guayacán" y "Guardián" la
  cadena real pasa por "Tótem de Guerra" y "Golpe Vampiro", ninguna de
  las dos listada en la tabla curada.
- **Ninguna de las dos tiene página propia `(20 Años)` en el wiki
  todavía** (confirmado, no existen) — pero sí hay evidencia sólida de
  que son reales: (1) el dueño confirma tener la física, y (2) las
  páginas base sin promo ("Tótem de Guerra" y "Golpe Vampiro", ambas del
  set Misión Santiago) se encadenan entre sí en el MISMO orden
  (Tótem de Guerra → Golpe Vampiro → Guardián) que la cadena "20 Años"
  ya confirmada (Guardián declara "anterior = Golpe Vampiro (20 Años)").
  Como el texto de reglas no cambia entre el original y su reimpresión
  "20 Años" (solo cambia el arte/logo, confirmado en la intro de la
  página Klu), se cargaron tipo/coste/habilidad/rareza desde la página
  base de Misión Santiago — dato real, no inventado. La imagen se dejó
  vacía en ambas (no hay scan confirmado de la versión 20 Años
  específica, mismo criterio que Cruz Templaria).
- Agregadas como `20A-08` (Tótem de Guerra) y `20A-09` (Golpe Vampiro)
  en `promo_20_anos_pe` — se numeran al final de la secuencia ya
  existente en vez de insertarse en su posición cronológica real, para
  no reasignar los ids `20A-01`..`07` ya shippeados (contrato de
  estabilidad de `id`).
- **Aviso para el dueño**: dado que la tabla curada del wiki demostró
  tener huecos, es probable que existan más cartas "20 Años" (en
  cualquier bloque) que tampoco aparezcan en ninguna tabla resumen —
  solo se encuentran re-siguiendo la cadena real página por página. Si
  el dueño identifica más cartas físicas "20 Años" que no aparezcan en
  el catálogo, avisar para repetir este mismo proceso.
- Validado con Playwright: colección con `promo_20_anos_pe` → 9/9
  cartas, orden y nombres correctos, 0 `pageerror`.

### 2026-08-09 (12ª iteración) — Continúa la cadena "20 Años" al bloque Primer Bloque (9 cartas, edición nueva separada por bloque)
- Tras cargar las 7 cartas "20 Años" de Primera Era (iteración anterior),
  el dueño pidió completar el resto de la serie, aclarando que **no hay
  que mezclar bloques distintos en la misma edición** — cada bloque
  (Primer Bloque, Segundo Bloque, etc.) debe tener su propia edición
  "Cartas Promo 20 Años - <Bloque>", ya que no comparten una raíz común.
- Se siguió la cadena `anterior`/`siguiente` del wiki desde "Espada Real
  (20 Años)" (última carta de Primera Era) hacia adelante: 9 cartas más,
  todas del bloque **Primer Bloque** (origen Espada Sagrada ×4, Cruzadas
  ×1, Tierras Altas ×2, y "Promo Primer Bloque" genérico ×1 para
  Helénica) — Fe sin Límite, Capa de Invisibilidad, Hacha de Batalla,
  Códex Arturicus, Cruz Templaria, Helénica, Ogham, Gaitas, Carmix.
  Confirmado con `edición=` propio de cada página + su categoría de wiki
  (`Categoría:Cartas Promo Primer Bloque` en el caso de Helénica) — nunca
  por suposición.
- **La cadena se corta después de "Carmix"**: su campo `siguiente` apunta
  a "Takelot (20 Años)", pero esa página **no existe** en el wiki
  (confirmado con `action=query&titles=File:...` y búsqueda de título) —
  es un hueco real de documentación del wiki, no se inventó nada para
  rellenarlo. Si el wiki la crea más adelante, ahí se retoma la cadena
  (probablemente sigue en Primer Bloque un poco más antes de saltar a
  Segundo Bloque).
- Nueva edición `promo_20_anos_pb` ("Cartas Promo 20 Años - Primer
  Bloque"), numeración propia `20A-PB-01`..`09` (mismo criterio que
  `20A-01..07` de Primera Era: el código real del wiki no sirve para
  diferenciar cartas, casi todas dicen "EDICIÓN LIMITADA 20 AÑOS" sin
  número). **8/9 con imagen**; "Cruz Templaria (20 Años)" se dejó sin
  imagen a propósito — el archivo `Cruz Templaria 20 Años.png` no existe
  en el wiki (`imageinfo` devuelve `"missing": ""`), hueco real, no un
  bug del script.
- Validado con Playwright: colección con `promo_20_anos_pb` → 9/9
  cartas, orden correcto, 0 `pageerror`, "Cruz Templaria" cae en
  placeholder de "sin imagen" (esperado) en vez de imagen rota.

### 2026-08-09 (11ª iteración) — Completa cartas promocionales faltantes: Juego Organizado (4 nuevas) + set Cartas Promo 20 Años (7 cartas, edición nueva)
- El dueño del inventario reportó tener una carta física "Espada Real" con
  el logo "20 Años" que no aparecía en el catálogo, y pidió revisar
  https://myl.fandom.com/es/wiki/Cartas_Promo_Primera_Era_Klu completo.
  Esa página trae dos tablas: "Juego Organizado" (cartas de torneo,
  ~125 filas) y "Cartas Promo 20 Años" (7 cartas). Se confirmó con el
  dueño el alcance completo antes de cargar (la tabla J.O. es grande y
  varias filas recientes no tienen imagen documentada).
- **Juego Organizado** (`juego_organizado_pe`) ya estaba cargada de una
  sesión anterior con 121/125 cartas (numeración propia `JO-01`.."JO-121",
  no el código real de torneo del wiki que no es útil como identificador
  estable). Se agregaron las 4 filas nuevas que el wiki sumó después
  (`JO-122` Erchitu, `JO-123` Mullo, `JO-124` Torreón Negro, `JO-125`
  Calmet — todas "Adelanto Producto PE", sin edición de origen asignada
  porque el propio wiki tampoco la tiene todavía), las 4 con imagen
  propia encontrada.
- **Cartas Promo 20 Años** (`promo_20_anos_pe`, edición nueva): 7 cartas
  full-art/con logo "20 Años" de reimpresiones de cartas de La Ira del
  Nahual, Misión Santiago, Ragnarok y La Cofradía, repartidas 2021 por
  compras/colección completa en CasaMyL — numeración propia `20A-01`
  a `20A-07` (el código real del wiki es genérico, "EDICIÓN LIMITADA
  20 AÑOS", no sirve para diferenciar cartas). Las 7 con imagen de su
  página específica. **Nota importante encontrada y descartada a
  propósito**: la página de "Espada Real (20 Años)" enlaza a
  "siguiente" a "Fe sin Límite (20 Años)" (del set Espada Sagrada,
  bloque Primer Bloque) — hay una serie "20 Años" bastante más grande
  que abarca todo el juego, no solo Primera Era. Se dejó fuera de esta
  carga porque el usuario pidió específicamente lo que trae la página
  "Cartas Promo Primera Era Klu", y esa cadena sale de ese alcance — si
  se pide completar el resto del set "20 Años" (otros bloques) es
  trabajo aparte.
- Validado con Playwright: colección con ambas ediciones →
  132/132 cartas (125 + 7), 0 imágenes rotas, 0 `pageerror`.

### 2026-08-09 (10ª iteración) — Nueva edición: Toolkit Primera Era 2026 (37 cartas, agregada al catálogo compartido)
- El dueño del inventario pidió agregar la edición que trae las cartas
  código "TKPE26". Paso 1 (`curl` a `/cards/edition/todas` filtrando
  `ed_slug`): TOR/api.myl.cl **no la tiene**. Paso 2 (wiki): existe
  "Lista de cartas de Toolkit Primera Era 2026", una sola tabla
  Código/Kit/Nombre/Tipo/Nota (mismo formato que TKPE24/25, sin
  sub-tablas separadas esta vez) — se reusó `extract_myl_edition.py` como
  librería compartida (fetch_wikitext, fetch_contents, resolve_image_urls,
  resolve_card_content, build_row) con un driver a medida para esa forma
  de tabla, igual que se hizo con TKPE24/25.
- **37 cartas, todas con imagen y confianza "específica"** (0 sin
  resolver): 32 numeradas (códigos `TKPE26 01/32`…`32/32`, dos kits
  temáticos "Toolkit Ancestral"/"Toolkit Espíritu" de 16 c/u — la columna
  "Kit" es solo metadata de empaque, igual que en TKPE24/25 no se usa
  para separar en ediciones distintas), 4 cartas "Buy a Box" con código
  que SÍ trae número real (`TKPE26 33/32`…`36/32`, incluso pasándose del
  "/32" declarado) — mismo patrón que TKPE24 (`TKPE24 - 29/28`…`40/28`),
  así que van con `edid` 033-036 igual que esas, no `specialId`. La carta
  final, "Dragón Esmeralda", trae un código totalmente aparte
  (`PROMO CXC PE 02`, serie "Promo Cartón x Cartón" que no es exclusiva
  de este producto — el mismo patrón ya existía como `PROMO CXC PE 01`
  ("Ñuke Napu") dentro de Lootbox Primera Era 2024) — se cargó como
  `specialId` con ese código tal cual, mismo criterio que esa carta.
- Registrada en `data/editions.json` (slug `toolkit_primera_era_2026`,
  bloque PE, después de "Leyendas - Primera Era 4.0" — la más reciente
  del bloque hasta ahora) y `data/custom-cards.json` (37 cartas,
  `id` con patrón `toolkit_primera_era_2026__custom__tkpe26_<N>_<nombre>`
  para las numeradas y `..._promo_cxc_pe_02_dragon_esmeralda` para la
  especial). Imágenes hotlinkeadas directo a `static.wikia.nocookie.net`
  (igual que TKPE24/25 — no son de una tienda comercial, no aplica la
  regla de auto-hospedaje).
- Validado con Playwright: servidor estático local, colección de una sola
  edición (`toolkit_primera_era_2026`) → 37/37 cartas, 0 imágenes rotas,
  0 `pageerror`, orden correcto (la especial primero, luego #1-36).

### 2026-08-09 (9ª iteración) — Causa real de "sigue viendo huecos pese a que los datos ya están bien": overrides personales olvidados, no caché
- Después del cache-busting de la iteración anterior, el dueño del
  inventario seguía viendo el mismo hueco en TKPE24 (30 salta a 33) pese a
  cerrar el navegador completo y probar en incógnito (ahí sí se veía
  bien). Terminó recordando él mismo que había **editado manualmente**
  las cartas #31-35 de TKPE24 en algún momento anterior con "✏️ Editar".
- **Causa real, no relacionada con caché**: `rebuildCards()` arma
  `state.cards` reemplazando por `id` cualquier carta del catálogo
  compartido por la versión personal (`userCustom`) del usuario, si
  existe una con el mismo `id` — así sobrevive el inventario a
  correcciones del catálogo, pero también significa que una edición
  manual vieja (hecha cuando esa carta todavía tenía otro `edid`/edición
  asignados, antes de esta ronda de correcciones) queda **congelada para
  siempre**, sin importar cuántas veces se corrija el catálogo compartido
  ni cuánto se limpie el caché del navegador — son mecanismos totalmente
  distintos (uno vive en HTTP/CDN, el otro en `localStorage`/Supabase).
- El dueño preguntó por qué esto no explicaba también TKPE25 (solo 4 de
  32 numeradas visibles) ya que "no edité ninguna" — se le pidió abrir el
  detalle de la carta #1 de TKPE25 ("Rapto de Idunn") y confirmó que
  también decía "↩ Revertir a la original": **mismo mecanismo, solo que
  no lo recordaba** (probablemente de cuando cargó esas cartas él mismo
  antes de que quedaran en el catálogo compartido).
- Se construyó `fix-toolkit.html` (página temporal en la raíz del repo,
  se puede borrar una vez resuelto): cruza `myl.customcards.v1` del
  navegador contra los `id` reales de TKPE24/TKPE25 en el catálogo
  (`data/cards.json` + `data/custom-cards.json`) y quita de un solo golpe
  los que coincidan — conserva intacto el inventario (queda indexado por
  el mismo `id`) y cualquier otra carta personal no relacionada.
- **Bug real encontrado en la propia herramienta, corregido en la misma
  iteración**: la primera versión solo cruzaba contra
  `data/custom-cards.json`, así que detectaba bien los overrides de
  TKPE25 (100% catálogo manual) pero **no los de TKPE24 #31-35**, porque
  esas 5 cartas vienen del catálogo scrapeado (`data/cards.json`, ids
  estilo `128-015`, corregidas vía `scraper/corrections.js` sin cambiar
  su `id`) — el dueño reportó "solo falta rectificar las TKPE24" y se
  corrigió la herramienta para cruzar contra ambos archivos. Verificado
  con Playwright simulando exactamente ese `id` (`128-015` con datos
  viejos) antes y después del fix.

### 2026-08-09 (8ª iteración) — Cache-busting real para data/*.json (GitHub Pages sirve por CDN)
- Después de la corrección anterior, el dueño del inventario seguía viendo
  huecos imposibles con los datos ya verificados en el repo (Toolkit 2024:
  salta de la #30 a la #33 saltándose 31/32/34/35; Toolkit 2025: solo 4
  cartas numeradas en vez de 32) — se re-verificó `data/cards.json` y
  `data/custom-cards.json` directo en el repo y **están completos y
  correctos** (40/40 y 34/34, sin huecos). El problema no era de datos:
  era que el sitio publicado seguía sirviendo una copia vieja.
- **Por qué el fix de la iteración anterior (`cache: "no-cache"`) no
  alcanzó**: ese header le pide al NAVEGADOR que revalide en vez de usar
  su copia local, pero GitHub Pages sirve estos archivos detrás de un CDN
  (Fastly) — esa revalidación puede seguir recibiendo una respuesta vieja
  directo del borde del CDN si su propio caché todavía no venció, sin
  siquiera llegar a comprobar contra el origen.
- Corregido con cache-busting real: los tres `fetch()` de
  `data/*.json` en `loadData()` ahora llevan un parámetro `?v=<timestamp>`
  distinto en cada carga de la página. Al ser una URL distinta en cada
  visita, ni el navegador ni el CDN tienen una entrada de caché que
  devolver — fuerza a ambos a ir siempre hasta el origen por la versión
  real y más reciente.
- **Importante para el dueño del inventario**: este fix vive en `js/app.js`,
  que también pasa por el mismo CDN — hace falta **una recarga fuerte**
  (Ctrl+Shift+R o vaciar caché del sitio) para bajar esta versión nueva del
  script una vez. Después de esa única recarga, la app va a pedir los datos
  frescos en cada carga de ahí en adelante, sin que vuelva a hacer falta.

### 2026-08-09 (7ª iteración) — Bug real: agregar una edición a una colección ya vista no se reflejaba sin recargar
- El dueño del inventario reportó dos síntomas relacionados: (1) al
  agregar una edición a una colección con "✏️ Editar ediciones", el
  cambio se guardaba pero la grilla no lo mostraba hasta recargar la
  página, y (2) al agregar Toolkit Primera Era 2024 a una colección le
  aparecieron 29 cartas en vez de 40. Se verificó primero que el catálogo
  compartido tenga las 40 cartas completas (sí, edid 1-40 sin huecos) —
  el "29" no era un problema de datos, era el síntoma del mismo bug que
  el punto (1).
- **Causa real**: `collectionCards()` cachea el resultado por `col.id`
  (`editionCardsCache`, para no recorrer el catálogo completo en cada
  clic de +/−) — esa caché solo se invalida en `rebuildCards()`, que
  corre cuando cambia el CATÁLOGO (una carta nueva, una edición), no
  cuando cambia el array `editions` de una colección YA vista. Al guardar
  el editor de ediciones sobre una colección con la grilla ya cacheada,
  la vista seguía mostrando la lista de cartas vieja hasta que algo más
  (como una recarga completa, que reinicia el módulo JS entero) forzara
  a recalcularla — la carta "29" era un número de la colección a medio
  camino de una corrida anterior, no un límite real de la edición.
- Corregido en `js/app.js`: `createCollectionFromModal()` invalida
  explícitamente `editionCardsCache` para la colección editada
  (`editionCardsCache.delete(colModalEditingId)`) justo después de
  guardar los cambios de edición.
- Validado con Playwright reproduciendo el escenario exacto: colección
  con Toolkit Walkirias ya vista (13 cartas cacheadas), se agrega Toolkit
  Primera Era 2024 sin recargar la página — antes del fix la grilla se
  quedaba en 13; después del fix pasa a 53 (13+40) al instante, sin
  necesidad de recargar. 0 `pageerror`.

### 2026-08-09 (6ª iteración) — Bug real: "Editar ediciones" no podía quitar una edición ya retirada del catálogo
- El dueño del inventario reportó que, al intentar sacar las ediciones
  Toolkit viejas de su colección "Toolkits" con "✏️ Editar ediciones", el
  cambio no se guardaba — las ediciones fantasma seguían apareciendo
  después de guardar. Reproducido: **bug real**, no percepción — cuando
  una edición que una colección tenía listada deja de existir en el
  catálogo (fusionada o renombrada, como pasó con
  `toolkit_puertas_del_valhalla`/`toolkit_justa`/
  `toolkit_valentia_y_desolacion`/`toolkit_honor_y_ferocidad` en las
  iteraciones anteriores), el checklist del editor (`editionOptionGroups()`)
  nunca le muestra una casilla — no existe en `data/editions.json` ni tiene
  cartas — así que el usuario no tiene forma de desmarcarla. Pero
  `openCollectionModal()` precargaba `colModalSelected` directo desde
  `existingCol.editions` sin filtrar, así que esa edición fantasma quedaba
  seleccionada para siempre sin que nada en la UI pudiera tocarla — cada
  "Guardar cambios" la volvía a guardar intacta.
- Corregido en `js/app.js`: al abrir el editor, se filtran del selector
  inicial las ediciones que ya no existen (`state.editionName[slug] ===
  undefined`) y se avisa con un toast cuántas se quitaron — el usuario solo
  tiene que abrir "Editar ediciones" y guardar (sin tocar nada más) para
  limpiar una colección con ediciones fantasma.
- De paso: se agregó `{ cache: "no-cache" }` a los tres `fetch()` de
  `data/*.json` en `loadData()` — sin esto, un navegador puede seguir
  sirviendo una copia cacheada vieja del catálogo después de una
  corrección, generando la misma sensación de "no se guardó nada" aunque
  el dato en el repo ya esté bien.
- Validado con Playwright reproduciendo el escenario exacto reportado
  (colección con 8 ediciones, 4 de ellas ya retiradas del catálogo): el
  editor detecta y quita las 4 automáticamente, deja la colección con las
  4 válidas, y la grilla muestra las secciones correctas después de
  recargar. 0 `pageerror`.

### 2026-08-09 (5ª iteración) — Toolkit 2024/2025: las cartas numeradas dejan de tratarse como especiales
- El dueño del inventario aclaró el criterio real después de dos rondas de
  arreglos que no bastaron: el hecho de que una carta tenga `Frecuencia:
  Promocional` en el wiki **no la convierte en carta especial** dentro del
  modelo de esta app — sigue siendo una carta numerada más, la rareza es
  solo metadata (mismo criterio que ya se usaba en Leyendas - Primera Era
  4.0, donde las cartas 321-326 son "Promocional" pero llevan `edid`
  normal, no `specialId`). El `specialId` es solo para cartas que **no
  tienen un número real** en su código (la "00" tótem, un subconjunto con
  prefijo propio tipo `SCLPE4-NN`, o —como acá— un código literal sin
  dígito como "EDICIÓN LIMITADA"). Al cargar Toolkit 2024/2025 se aplicó
  mal ese criterio: se le puso `specialId` a las 40/34 cartas completas
  para preservar el código impreso `TKPE2X-NN`, cuando en realidad esas
  cartas SÍ tienen un número real y debían ir con `edid` normal — el
  código se preserva igual, solo que como número en vez de como texto.
  Efecto visible que esto causaba: absolutamente todas las cartas quedaban
  bajo el título literal "Cartas promocionales / especiales" de la grilla
  de Colección (el título viene de agrupar por `specialId` truthy, sin
  mirar la rareza real) — el dueño lo describió como "se siguen viendo
  mal" en dos reportes seguidos porque el síntoma no era duplicados ni
  huecos (ya arreglados), era esto.
  - **Toolkit Primera Era 2024**: las 40 cartas pasan de `specialId
    TKPE24-NN` a `edid` "001".."040" — **ninguna** queda como especial,
    tal como pidió el dueño ("no son promo... solo haz que el Toolkit sea
    de 40 cartas"). Se actualizó `TOOLKIT_PE_2024_CORRECTIONS` (33 cartas
    de TOR) y las 7 cartas custom del wiki.
  - **Toolkit Primera Era 2025**: las 32 cartas numeradas (Kit Valentía y
    Desolación + Kit Honor y Ferocidad + los 4 Oro foil) pasan a `edid`
    "001".."032". Las **2** cartas "Buy a Box" (Templo de Tenochtitlán,
    Torre del Olvido) se dejan como especiales (`TKPE25-EL`/`-EL-b`) — el
    dueño confirmó que esas SÍ son promocionales de verdad, y además su
    código en el wiki (`EDICIÓN LIMITADA`, sin número) no tiene un
    número real que ponerles como `edid`.
- Validado con una corrida real del scraper (para el caso de 2024, que
  toca `data/cards.json`) y con Playwright contra ambas colecciones
  renderizadas: Toolkit 2024 ahora es una sola grilla `#1`..`#40` sin
  ninguna sección de especiales; Toolkit 2025 muestra 2 especiales +
  `#1`..`#32` numeradas, 0 `pageerror`.

### 2026-08-09 (4ª iteración) — Dos bugs reales en Toolkit 2024/2025 encontrados al auditar a fondo tras el reporte "se siguen viendo mal"
- El dueño del inventario reportó que, después de unificarlas, ambas
  ediciones Toolkit "se siguen viendo mal" en su colección. Como los
  cambios que él hace en su navegador no se pueden inspeccionar desde acá,
  se re-auditó todo el catálogo compartido de las dos ediciones desde cero
  (duplicados, huecos de numeración, orden de renderizado real vía
  Playwright) en vez de asumir que ya estaba bien. Aparecieron dos bugs
  reales, uno por edición:
  - **Toolkit Primera Era 2024**: las 33 cartas reasignadas por
    `TOOLKIT_PE_2024_CORRECTIONS` quedaron con **`edid` Y `specialId` seteados
    a la vez** (ej. `edid: "001"` y `specialId: "TKPE24-15"` en la misma
    carta) — el esquema del proyecto exige uno u otro, nunca ambos. Causa:
    las entradas de la tabla de corrección no traían el campo `edid`, y el
    loop de aplicación en `scrape.js` solo pisa un campo si viene presente
    en la corrección (`if (fix.edid !== undefined)`) — al no estar, el
    `edid` original de TOR nunca se limpiaba. Se corrigió agregando
    `edid: ""` explícito a las 33 entradas de `TOOLKIT_PE_2024_CORRECTIONS`
    y se re-corrió el scraper para confirmarlo contra datos reales (antes:
    33/33 cartas con el bug; después: 0/33).
  - **Toolkit Primera Era 2025**: sin bug de datos (esas cartas siempre
    fueron 100% custom con `edid` vacío desde que se cargaron), pero sí un
    problema de **orden visible**: las 2 cartas "Buy a Box" usan el código
    `EDICIÓN LIMITADA` tal cual lo trae el wiki para esta edición (a
    diferencia de 2024, donde esas mismas 2 cartas sí tienen número propio
    `TKPE24-29/30`), así que su `specialId` literal
    (`"EDICIÓN LIMITADA TKPE25"`) empezaba con "E", que alfabéticamente
    ordena ANTES que "TKPE25-01" — las 2 cartas bonus aparecían primero en
    la colección, antes de la carta #1, en vez de al final como cabría
    esperar (y como sí se ve en 2024, donde por coincidencia sus
    equivalentes tienen número real). Se renombró su `specialId` a
    `TKPE25-EL`/`TKPE25-EL-b` (mismo prefijo que el resto de la edición,
    "EL" ordena después de los dos dígitos numéricos) para que ordenen al
    final — se tocó solo el `specialId`, nunca el `id`.
- Verificado con Playwright contra ambas colecciones: 0 `pageerror`, sin
  duplicados de identificador, orden `TKPE24-01..40` y `TKPE25-01..32` +
  `TKPE25-EL`/`-EL-b` al final, tal como se ve en pantalla.

### 2026-08-09 (3ª iteración) — Unifica también Toolkit Primera Era 2025 (mismo problema, esta vez en datos propios)
- El dueño del inventario notó que la misma partición innecesaria de la
  iteración anterior (Toolkit 2024) también la habíamos cometido nosotros
  mismos con **Toolkit Primera Era 2025**: al cargarla (09-08-2026, sesión
  anterior) se repartieron sus 34 cartas en `toolkit_valentia_y_desolacion`
  (14), `toolkit_honor_y_ferocidad` (14) y `toolkit_primera_era_2025` (6,
  las que no pertenecen a ningún kit) — usando las dos ediciones "fantasma"
  que ya existían en `editions.json` en vez de una sola. El dueño aclaró
  el criterio correcto: toda la serie (menos las Promo) usa el mismo
  código impreso `TKPE25`, así que es **una sola edición**, igual que
  Toolkit 2024.
- A diferencia de la iteración anterior, acá NO hizo falta tocar
  `scraper/corrections.js` — las 34 cartas de Toolkit 2025 son 100%
  `custom` (TOR nunca tuvo esta edición), así que alcanzó con reasignar
  `edition`/`editionName` de las 28 cartas de `toolkit_valentia_y_desolacion`/
  `toolkit_honor_y_ferocidad` directo en `data/custom-cards.json` (mismo
  `id`, se preserva el `specialId` `TKPE25-NN` que ya tenían) y quitar esas
  dos entradas fantasma de `data/editions.json` — la edición
  `toolkit_primera_era_2025` ya existía con las otras 6 cartas.
- Validado con Playwright: la edición unificada aparece con 34 cartas, 34
  identificadores únicos (sin duplicados), las dos ediciones viejas ya no
  aparecen en el selector, 0 `pageerror`.

### 2026-08-09 (2ª iteración) — Unifica Toolkit Primera Era 2024 (TOR la traía partida en 2 ediciones, con duplicados)
- El dueño del inventario reportó que "Toolkit Primera Era 2024" aparecía
  partida en dos ediciones (`toolkit_puertas_del_valhalla`,
  `toolkit_justa`, 18 cartas c/u, ambas de la API de TOR) que en realidad
  son un solo producto — tenía que corregir la edición a mano en su
  colección cada vez, y la partición generó cartas duplicadas.
- Confirmado contra la página del wiki "Lista de cartas de Toolkit Primera
  Era 2024" (código `TKPE24`, 40 cartas): la tabla principal (28) trae una
  columna "Kit" que dice a cuál de los dos kits pertenece cada carta
  (Justa = TKPE24-01..14, Puertas del Valhalla = TKPE24-15..28) — coincide
  1 a 1 **en orden y en nombre** con las posiciones 001-014 de cada
  edición de TOR, así que la correspondencia está verificada, no es una
  suposición. Las posiciones 015-018 de ambas ediciones de TOR resultaron
  ser las 5 cartas "Oro foil" compartidas del producto (no exclusivas de
  ningún kit): TOR las volcó de forma inconsistente — 3 duplicadas en
  ambas ediciones (Corona Triunfal, Trarilonco, Campana Dedahmmazedi) y 2
  solo en una de las dos (Rosa De Muerte solo en Puertas, Corona Ducal
  solo en Justa) — verificado por nombre exacto contra la sección
  "===Oros foil===" del wiki. TOR tampoco tenía las 7 cartas restantes del
  producto (2 "Buy a Box" + 5 "Promocionales", TKPE24-29/30 y 36-40).
- **Se generalizó el mecanismo de `scraper/corrections.js`**: antes solo
  soportaba pisar `edid`/`specialId` por `id` (usado para
  `LEYENDAS_2023_CORRECTIONS`); ahora también soporta `edition`/
  `editionName` (para reasignar una carta a otro slug de edición sin
  tocar su `id`) y `drop: true` (para descartar una carta por completo —
  usado en las 3 copias duplicadas). Nueva tabla
  `TOOLKIT_PE_2024_CORRECTIONS` con las 36 cartas de TOR: 33 se
  reasignan al slug unificado `toolkit_primera_era_2024` con su
  `specialId` real (`TKPE24-NN`), 3 se descartan (duplicados exactos).
  `scrape.js` aplica ambas tablas en el mismo paso.
- **Bug real encontrado al verificar el fix contra una corrida completa
  del scraper**: el paso 3.9 ("merge no destructivo con el catálogo
  previo", pensado para no perder cartas si una edición falla
  transitoriamente en la API) volvía a traer las 3 cartas recién
  descartadas desde el `data/cards.json` anterior — su `id` ya no estaba
  en la corrida nueva (porque las descarté a propósito), y ese paso no
  distingue "la descarté yo" de "la API falló esta vez". Se corrigió
  pasándole al paso 3.9 el set de ids descartados a propósito
  (`droppedIds`) para que los ignore en vez de revivirlos.
- Las 7 cartas que TOR nunca tuvo (`toolkit_primera_era_2024__custom__*`)
  se cargaron en `data/custom-cards.json` desde el wiki, mismo criterio
  que cualquier carta ausente de la API — 7/7 con imagen, confianza
  "específica".
- `data/editions.json`: se quitaron las entradas `toolkit_puertas_del_valhalla`
  y `toolkit_justa` (después de la corrección quedan con 0 cartas — dejarlas
  habría mostrado dos ediciones fantasma vacías en el selector) y se agregó
  `toolkit_primera_era_2024`.
- Validado con una corrida completa real del scraper (no un mock): 33
  cartas de TOR quedan correctamente unificadas y sin duplicados, 0
  cartas remanentes en las dos ediciones viejas, y el resultado
  **sobrevive una segunda corrida** (confirma que el fix del paso 3.9 fue
  necesario, no cosmético). Smoke test con Playwright: 40/40 cartas en
  la colección, 40 badges de identificador únicos, 0 imágenes rotas, 0
  `pageerror`.
- **Nota para el dueño del inventario**: si ya habías agregado "Chien" o
  "Tótem del Pájaro de Trueno" a mano en tu navegador (los "dos Promo que
  ya están apartadas" que mencionaste), puede que ahora te aparezcan
  duplicados con la versión nueva del catálogo compartido — usa
  "🗑 Eliminar/↩ Revertir a la original" sobre tu copia manual para que
  desaparezca y quede solo la del catálogo.

### 2026-08-09 — Toolkit Primera Era 2025 (primer uso real de la skill "registrar-nueva-edicion")
- Primera vez que se corre el flujo completo de la nueva skill de punta a
  punta, con un caso real: `/registrar-nueva-edicion Toolkit Primera Era
  2025`.
  - **Paso 1 (API)**: `curl` a `/cards/edition/todas` no encontró ningún
    slug con "toolkit" que corresponda — TOR no la tiene.
  - **Paso 2 (wiki)**: la página "Lista de cartas de Toolkit Primera Era
    2025" (código `TKPE25`) existe y trae **34 cartas** en 3 sub-tablas:
    la principal (28, con una columna "Kit" que declara a cuál de dos
    "kits" temáticos pertenece cada una — "Toolkit Valentía y Desolación"
    ×14, "Toolkit Honor y Ferocidad" ×14), "Oros foil" (4, sin Kit) y
    "Buy a Box" (2, código "EDICIÓN LIMITADA" sin número, ambas con
    `Frecuencia: Promocional`). El extractor genérico no soporta esta
    tabla (columna "Kit" adicional + 3 sub-tablas), así que se escribió un
    driver a medida reusando las funciones compartidas de
    `extract_myl_edition.py` — mismo patrón que CRPE2/Vigilantes/Juego
    Organizado. **34/34 con imagen, las 34 con confianza "específica"**
    (todas tenían página propia `(TKPE25)` o `edición=` declarado) — cero
    casos ambiguos.
  - **Decisión de estructura** (la única parte no puramente mecánica de
    este caso): el catálogo YA tenía dos ediciones "fantasma" con 0 cartas
    — `toolkit_valentia_y_desolacion` y `toolkit_honor_y_ferocidad` —
    creadas de antemano previendo exactamente esta carga. Se usaron esas
    dos para las 28 cartas de la tabla principal (14 cada una, según la
    columna "Kit"), y se creó una tercera edición nueva,
    `toolkit_primera_era_2025`, para las 6 cartas que no pertenecen a
    ningún Kit específico (los 4 Oro foil + las 2 Buy a Box). Se
    aprovechó para corregir la capitalización/tildes de los nombres de
    las dos ediciones fantasma (`Toolkit Honor Y Ferocidad` →
    `Toolkit Honor y Ferocidad`, `Toolkit Valentia Y Desolacion` →
    `Toolkit Valentía y Desolación`).
  - **Numeración**: las 34 cartas comparten un único código impreso
    corrido `TKPE25 01/28` … `32/28` (el denominador "28" se mantiene fijo
    incluso para las cartas 29-32, igual que el patrón de overflow
    promocional ya visto en LPE4 `LPE4 - 324/320`) repartido entre 3
    ediciones distintas — renumerar cada edición desde 1 habría
    desconectado el número mostrado del código real impreso en la carta
    física/escaneada (el mismo tipo de bug de numeración ya corregido dos
    veces esta sesión). Se optó por preservar el código completo como
    `specialId` (`TKPE25-01` … `TKPE25-32`, sin `edid`) en las tres
    ediciones — ninguna carta de Toolkit PE 2025 es "numerada" en el
    sentido de la app, las 34 son especiales, igual que ya pasa con
    Lootbox y Juego Organizado. Las 2 cartas "Buy a Box" sin número propio
    usan `EDICIÓN LIMITADA TKPE25`/`EDICIÓN LIMITADA TKPE25-b`, mismo
    patrón de sufijo de letra ya usado en Lootbox PE 2025.
  - **Paso 3 (imágenes de tiendas)**: no hizo falta — las 34 imágenes ya
    vinieron resueltas del wiki con confianza "específica" en el Paso 2.
    Como son URLs de `static.wikia.nocookie.net` (CDN del wiki, con CORS
    abierto, no una tienda comercial) se dejaron **hotlinkeadas
    directamente**, igual que las demás ~519 cartas del proyecto que ya
    vienen del wiki — la regla de "nunca hotlink" es específica de las
    tiendas comerciales (mesaredondatcg.cl, mylserena.cl), no del wiki.
  - **Paso 5 (validación)**: `node --check` a los `.js` sin tocar (no hizo
    falta modificar código, solo datos), JSON válidos, smoke test con
    Playwright: las 3 ediciones aparecen en el selector, una colección que
    agrupa las 3 muestra 34/34 cartas en 3 secciones separadas con el
    identificador correcto en cada insignia, 0 imágenes rotas
    (`naturalWidth 0`), 0 `pageerror`.

### 2026-08-08 (2ª iteración) — Nueva skill "registrar-nueva-edicion"
- Este flujo (¿ya está en la API de TOR? → si no, extraerla del wiki → si
  faltan imágenes, cruzar tiendas por código exacto de carta → registrar en
  `data/editions.json`/`data/custom-cards.json` → validar → documentar →
  shippear) se hizo a mano, paso a paso, más de una decena de veces esta
  sesión (CRPE2, Vigilantes de la Noche, Juego Organizado, Lootbox PE
  2024/2025, 8 ediciones "Mundos Perdidos", Leyendas - Primera Era 4.0…) —
  se escribió como skill (`.claude/skills/registrar-nueva-edicion/
  SKILL.md`) para no tener que reconstruir el criterio cada vez. Encadena
  (no duplica) la skill `importar-edicion-myl-wiki` ya existente para el
  paso del wiki, y referencia `docs/FUENTES-DATOS.md`/`conocimiento.md` en
  vez de repetir su contenido.
- **Nuevo script reusable** `scripts/match_mylserena_sitemap.py`: la
  técnica que más cobertura dio en la práctica (recorrer el sitemap de
  mylserena.cl en vez de solo la categoría de la tienda, cruzando por el
  número exacto de carta que trae el `description` JSON-LD de cada página
  de producto — 252 de 265 imágenes faltantes de Leyendas 4.0 en el caso
  real que la originó) hasta ahora solo existía como script suelto en el
  scratchpad de la sesión. Al escribirla como script reusable del repo se
  encontró y corrigió un bug real que el script suelto original no tenía
  cubierto por casualidad: filtrar los slugs del sitemap metiendo el texto
  de búsqueda directo dentro de una regex que exige un carácter antes
  (`[a-z0-9][a-z0-9-]*<filtro>`) falla en silencio cuando el filtro
  coincide con el **inicio** del slug (ej. filtrar "rheda-lpe4" contra el
  slug "rheda-lpe4-ur" nunca matcheaba, porque la "r" inicial quedaba
  consumida por el carácter obligatorio antes del filtro) — se corrigió
  extrayendo todos los slugs primero y filtrando después en Python, no
  dentro de la regex. También se corrigió el regex de extracción del
  código de carta (`[A-Z]+` no capturaba el dígito de "LPE4", solo "LPE" —
  se cambió a `[A-Z0-9]+`). Verificado contra el sitio real: 401 páginas de
  producto de Leyendas 4.0 encontradas, 401/401 con código extraído
  correctamente (0 errores), incluyendo las variantes numerada normal,
  "Set Clásico" (prefijo propio) y promocional (numeración > 320).

### 2026-08-08 — Reordenar colecciones (drag & drop) y editar ediciones de una colección ya creada
- **Reordenar el panel lateral de Colecciones**: cada tarjeta ahora es
  `draggable` — se puede arrastrar y soltar sobre otra para reordenar
  libremente (`reorderCollectionsByDrop` en `js/app.js`, persiste con
  `store.reorderCollections`). Como el drag & drop nativo de HTML5 no
  funciona bien con touch en varios navegadores móviles, se agregaron
  también botones ▲▼ en cada tarjeta como alternativa accesible
  (`moveCollection`). El "orden" de una colección es simplemente su
  posición en el array `collections` de `store.js`; no se agregó ningún
  campo `order` nuevo.
- **Botón "✏️ Editar ediciones"** en el detalle de una colección: ahora que
  una colección puede agrupar varias ediciones, hacía falta poder agregar o
  quitar ediciones después de creada sin tener que borrar la colección y
  rehacerla (perdiendo el nombre y la posición). Reutiliza el mismo modal
  de "Nueva colección" en un "modo edición" — `openCollectionModal(col)`
  precarga el checklist con las ediciones actuales de `col`, cambia el
  título/botón y oculta el campo Nombre (ese se sigue editando aparte, con
  el input del encabezado). Al guardar llama a
  `store.setCollectionEditions(id, eds)`, que reemplaza `col.editions`
  conservando nombre y posición.
- Al agregar el parámetro a `openCollectionModal`, se encontró y corrigió
  de paso un bug latente: el botón "+ Nueva colección" pasaba directo la
  función como handler de `click` (`addEventListener("click",
  openCollectionModal)`), así que el `MouseEvent` del clic se habría colado
  como si fuera "la colección a editar" en cuanto la función aceptara un
  argumento — se cambió a `() => openCollectionModal()` para cortar esa
  filtración.

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
