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

### 2026-09-20 (94ª iteración) — Segunda pasada de móvil: toolbar en íconos, filtros de Cambios, separación visual del menú inferior — y corrige una regresión real que metió la 93ª iteración (barra inferior tapando toda la pantalla)

El dueño marcó con capturas en rosa 4 zonas del sitio en vivo que seguían viéndose
"amontonadas" después de la 93ª iteración, preguntando si no había ya un patrón de UI
estándar para esto. Se aplicaron 3 patrones conocidos de diseño móvil:

- **Barra de acciones del catálogo** (Carta manual/Ediciones/Importar/Exportar):
  4 botones con texto completo se apilaban en 2 filas. Pasan a ser solo el ícono en
  móvil (`.btn-label{display:none}` bajo `max-width:760px`), con `title` para
  accesibilidad — el patrón estándar de toolbar compacto. Se agregaron íconos Phosphor
  a Ediciones (`ph-cards`) e Importar/Exportar (`ph-upload-simple`/`ph-download-simple`,
  verificados contra `assets/phosphor/regular.css` antes de usarlos — el selector real
  ahí es `.ph.ph-<nombre>:before`, no `.ph-<nombre>::before`, así que un grep ingenuo
  los daba por inexistentes cuando sí estaban).
- **Filtros de Cambios** (`.trade-toolbar`/`.trade-filter-select`): mismo bug que ya se
  había corregido en el catálogo (91ª/93ª) pero en un bloque distinto que no comparte
  clase — `<select>` nativos sin tope de ancho, apilados uno por fila. Mismo tratamiento:
  tira horizontal con scroll + `max-width` con elipsis.
- **Menú inferior sin jerarquía visual**: en la barra fija de 7 íconos (5 pestañas +
  sincronizar + tema) todos se veían como un solo grupo indistinguible — el dueño marcó
  justo esa zona pensando que "Estadísticas" era parte del cluster de utilidades. Se
  agregó un separador (`border-left` + espacio) entre `.rail-nav` y `.rail-bottom`, y los
  íconos de utilidad se redujeron un poco, para que se lea como "navegación | utilidades"
  en vez de 7 íconos sueltos.

**Regresión real encontrada verificando lo anterior** (antes de shippear, no llegó a
producción sin arreglo): al agregar `.rail-bottom{flex:none; border-left; padding-left}`
para el separador, Playwright detectó que `#btn-export` ya no se podía clickear en móvil
— `.rail` estaba interceptando el clic en TODA la pantalla (`elementFromPoint` devolvía
`aside.rail` en el punto del botón, con `rail.height = 844` = el alto completo del
viewport). La causa era un efecto secundario de la 93ª iteración: para resolver el
desborde de `width:100%` que `box-sizing:content-box` le agregaba a `.rail` en móvil (ver
entrada anterior), se cambió `height:58px` (fijo) por `min-height:58px`, pero la regla
base de `.rail` (fuera de cualquier media query, pensada para escritorio) fija
`height: 100vh` — quitar la propiedad `height` del bloque `@media(max-width:760px)` NO
anula esa regla base, `min-height` es una propiedad distinta. Sin un `height` explícito
que la pise, `.rail` heredaba `height:100vh` (844px) tapando toda la pantalla con un
elemento `position:fixed` invisible-pero-clicable por encima de todo (z-index:30) — el
contenido se veía bien porque el fondo de `.rail` es transparente fuera de sus hijos
visibles, pero cualquier toque en cualquier parte de la pantalla que no fuera exactamente
un botón del rail quedaba absorbido por él. Corregido agregando `height: auto` junto al
`min-height: 58px` en el mismo bloque, para que el alto vuelva a calcularse por
contenido (como el `height:auto` original antes de la 93ª iteración) en vez de heredar el
100vh de escritorio, conservando el `min-height` que sí hacía falta para el
`env(safe-area-inset-bottom)`.

Verificación: recorrido Playwright de las 5 vistas en 390×844 confirmando
`document.body.scrollWidth === innerWidth` en todas, `.rail` con `height` exacto de 58px
anclado al fondo (no 100vh), `elementFromPoint` sobre `#btn-export` devolviendo el botón
mismo (no `.rail`), el dropdown de Exportar abriendo con un clic real, y la tira de
filtros de Cambios con `overflow-x:auto` en vez de apilarse. 0 `pageerror`. `node --check`
sobre los `.js` (sin cambios este bloque, solo `index.html`/`css/styles.css`).

**Pendiente, decisión del dueño**: la vista Colecciones (y Mazos, misma estructura) usa
un layout de lista+detalle de dos columnas que en móvil se apilan una sobre otra (lista
completa arriba, detalle abajo) — el dueño marcó esa zona también. El patrón estándar para
listas+detalle en pantallas angostas es navegación tipo "empujar" (mostrar solo la lista
primero; al tocar un ítem, la lista se oculta y el detalle ocupa toda la pantalla con una
flecha "‹ Volver" arriba) — es un cambio de comportamiento (JS), no solo CSS, así que se
dejó para confirmar con el dueño antes de tocar `renderCollectionsView()`/`renderDeckList()`
en `js/app.js`.

### 2026-09-20 (93ª iteración) — Corrige 3 problemas de diseño móvil reportados con capturas del sitio en vivo: grilla del catálogo, filtros amontonados y menú inferior "invisible" en Estadísticas

El dueño reportó, con capturas de teléfono de `mrgerardgdj.github.io/InventarioMYL`, tres
problemas de la rama `claude/card-collections-filters-9tcflz` (la que de verdad está
publicada — ver nota abajo). Los tres se reprodujeron y corrigieron en `css/styles.css`:

- **Grilla del catálogo con muy pocas columnas**: `.cards-grid` usaba
  `grid-template-columns: repeat(auto-fill, minmax(122px, 1fr))` sin límite superior de
  columnas. En el ancho útil real de un teléfono (350px de contenido tras el padding de
  `.content`, en un viewport de 390px) eso daba solo 2 columnas — muy pocas y con tarjetas
  gigantes, como se veía en la captura. Se agregaron 3 franjas explícitas dentro de
  `@media (max-width: 760px)`: 3 columnas por defecto (`≤480px`), 4 columnas entre 481 y
  640px, 5 columnas entre 641 y 760px — cubre exactamente el rango "3 a 5" que pidió el
  dueño. Verificado con Playwright en 390/500/700px: 3/4/5 columnas respectivamente.
- **Filtros "aglutinados"**: `.filter-chip-row` (las píldoras de inventario +
  7 `<select>` tipo píldora de Formato/Edición/Raza/Tipo/Rareza/Coste/Ordenar) usaba
  `flex-wrap: wrap`, que en 350px de ancho apilaba las píldoras y selects en 5-6 filas
  completas — la "pared de píldoras" de la captura. Se cambió a una sola tira horizontal
  con scroll (`flex-wrap: nowrap; overflow-x: auto`, ítems `flex: none`), el patrón
  estándar de filtros en móvil — mismo contenido, mucho menos denso visualmente. De paso
  se encontró y corrigió un desborde horizontal real en el mismo bloque: `.toolbar .actions`
  (los botones Carta manual/Ediciones/Importar/Exportar) no tenía `flex-wrap`, así que en
  350px sus 4 botones (387px de ancho mínimo) desbordaban la página 17px hacia la derecha
  (`document.body.scrollWidth` 407 vs 390 de viewport) — agregado `flex-wrap: wrap` en el
  breakpoint móvil.
- **"El menú cambia de tamaño y en Estadísticas a veces ni se ve"**: el rail (`.rail`,
  convertido en barra inferior fija en móvil) resultó estar bien — mismo DOM, mismo CSS,
  mismo alto (`58px` de contenido) en las 5 vistas, confirmado con
  `getBoundingClientRect()` recorriendo Catálogo/Colecciones/Mazos/Cambios/Estadísticas por
  Playwright antes de tocar nada. La causa real, específica de Estadísticas: `.ep-row`
  (cada fila de "Progreso por edición") es un ítem de grilla (`.edition-progress`, 1
  columna en móvil) sin `min-width: 0`, y contiene `.ep-name` con
  `white-space: nowrap` — por la regla de CSS Grid de que el tamaño mínimo automático de un
  ítem es su `max-content` a menos que se declare `min-width: 0`, el nombre de edición más
  largo (p. ej. "Leyendas - Primera Era 4.0") fijaba el ancho mínimo de la fila en **637px**,
  muy por encima del contenido útil de 350px — la página entera se volvía más ancha que la
  pantalla. Es decir: no es que el menú desaparezca, es que el `<body>` se ensancha (se
  confirmó con `document.body.scrollWidth`, 637+ en vez de 390) y en un teléfono real eso
  puede desplazar el viewport visual o hacer que el usuario, al hacer scroll horizontal sin
  querer, pierda de vista la barra fija momentáneamente — y explica por qué el dueño lo vio
  justo en esta vista, la única con esa fila de ancho fijo colgando de un texto largo.
  Corregido agregando `min-width: 0` a `.ep-row` (el truncado ya lo hacía
  `.ep-name{overflow:hidden;text-overflow:ellipsis}`, solo le faltaba permiso para encoger).
  Verificado recorriendo las 5 vistas en 390px con Playwright: `document.body.scrollWidth`
  quedó en 390 (sin desborde) en las 5, antes solo Estadísticas fallaba (407-637).
- **Nota sobre qué rama es la que importa**: esta sesión venía de un rediseño "Vitrina"
  completo y ya terminado en `claude/myl-card-inventory-app-hx8z9d`, pero al revisar las
  capturas se confirmó que el sitio publicado en GitHub Pages corre en realidad el
  rediseño "Nocturne" de **esta** rama (`claude/card-collections-filters-9tcflz`),
  mergeada a `main` en un merge anterior de esta misma sesión por otro motivo (fix de
  PDF/imágenes) — dos rediseños paralelos e independientes de la misma app, hechos por
  sesiones distintas. Se decidió con el dueño arreglar el móvil acá, en la rama que de
  verdad está en producción, en vez de imponerle encima el trabajo de `hx8z9d` (que
  hubiera descartado iteración ya probada en vivo).

Verificación: `node --check` sobre los `.js` (sin cambios, solo se tocó CSS). Smoke test
Playwright cubriendo escritorio (recorrido de las 5 vistas por el rail, selección de carta
→ ficha lateral, apertura de modal) y móvil 390×844 (recorrido de las 5 vistas verificando
`document.body.scrollWidth === innerWidth` en cada una, grilla en 3/4/5 columnas según
ancho, fila de filtros con scroll horizontal en vez de wrap) — 0 `pageerror` en ambos.

### 2026-09-18 (92ª iteración) — Corrige 3 bugs del PDF de Colecciones detectados en un PDF real: orden alfabético en vez de numérico, texto superpuesto entre cartas y fondo blanco en vez de Nocturne

El dueño bajó un PDF real (edición Lootbox PE 2024, cartas
"PROMOCIONAL PE24 NN") y encontró tres problemas que la verificación de la
91ª iteración no había cubierto porque usó una colección sin cartas con
`specialId` largo:

- **Orden alfabético en vez de numérico ascendente**: las cartas
  "PROMOCIONAL PE24 NN" no tienen `edid` numérico, así que `cardNum(c)`
  devuelve `Infinity` para todas ellas por igual — el comparador de
  `exportCollectionAsPDF` (`js/app.js`) quedaba empatado en ese criterio y
  cerraba el desempate por `a.name.localeCompare(b.name)`, es decir,
  alfabético por nombre de carta en vez de por el número que sí traen en su
  `specialId`. Corregido agregando un desempate por `specialId` (mismo
  criterio `localeCompare(..., "es", { numeric: true, sensitivity: "base" })`
  que ya usa `compareEditionCards()` para el resto de la app) antes del
  desempate final por nombre.
- **Texto superpuesto ("transpuesto") entre cartas vecinas**: en
  `exportCollectionPDF()` (`js/exporters.js`) la etiqueta de identificación
  (`ident`, ej. "PROMOCIONAL PE24 08") se dibujaba sin pasar por
  `truncateText()` — solo el nombre de la carta se truncaba. Con
  identificadores largos como los de esta edición, el texto se salía del
  ancho de la celda e invadía visualmente la celda vecina. Corregido
  envolviendo también `ident` en `truncateText(doc, ident, cellW0)`. El
  dueño aclaró explícitamente que no le importa si esto deja menos cartas
  por fila con tal de que se vea bien — en la práctica no hizo falta
  reducir la grilla, truncar alcanzó.
- **Fondo blanco en vez del Nocturne de la app**: el PDF nunca había
  pintado el fondo de página — jsPDF por defecto es blanco, y solo la franja
  del encabezado (66pt) tenía color. Corregido reconstruyendo toda la
  paleta de `exportCollectionPDF()` a partir de los valores reales de
  `css/styles.css :root` (`--bg #161826`, `--bg-2 #1c1e2c`,
  `--bg-3 #232532`, `--text #e9e9ed`, `--muted`, `--accent-2 #b5abfc`,
  `--danger #e5484d`, etc.), y pintando el fondo de página completo
  (`doc.rect(0,0,W,H,"F")` con ese color) antes de dibujar el encabezado en
  cada página. Se actualizaron también los banners de edición/rareza, el
  color del texto de identificación/nombre (antes oscuro pensado para fondo
  blanco), la sombra de las miniaturas (antes gris `[15,17,23]` a 0.3 de
  opacidad, casi invisible sobre fondo oscuro — ahora negro puro a 0.45) y
  el relleno de respaldo del recorte de esquinas redondeadas en
  `renderCardThumb()` (antes blanco sólido, ahora `--bg-2`, para que no
  queden bordes blancos alrededor de las esquinas redondeadas sobre el
  nuevo fondo oscuro).

Verificado con Playwright (colección de prueba con la edición
`lootbox_pe_2024` completa —85 cartas—, elegida justamente porque tiene las
cartas "PROMOCIONAL PE24 NN" con `specialId` largo del reporte original;
imágenes de `api.myl.cl` y de `static.wikia.nocookie.net` interceptadas con
un fixture local) + PyMuPDF para extraer el texto de cada página y
renderizarlas a PNG: el orden dentro de cada grupo de `specialId` queda
ascendente ("PROMO CONMEM... 01" → "06", "LBPE24 - 01/21" → "21/21",
"PREMIUM PE 01" → "16"), todas las etiquetas largas salen truncadas con "…"
y sin invadir la celda vecina, y las 4 páginas del PDF muestran el fondo
Nocturne (`#161826`) con banners y barra de progreso en `--accent-2`,
insignias "FALTA" en rojo bien visibles, esquinas redondeadas con sombra
visible y sin artefactos blancos alrededor. 0 `pageerror`.

### 2026-09-18 (91ª iteración) — Rediseña el PDF visual de Colecciones: seccionado por Edición → Rareza → Número, corrige la ambigüedad del blanco y negro, esquinas redondeadas y sombra

El dueño reportó que usuarios expertos leían al revés el tratamiento
blanco y negro del PDF de Colecciones (creían que las cartas EN BLANCO Y
NEGRO eran las que SÍ tenían), pidió que el orden fuera Edición → Rareza/
Frecuencia → Número ascendente con secciones para cada nivel (relevante
ahora que una colección puede agrupar varias ediciones), y pidió esquinas
redondeadas + una sombra sutil en las miniaturas, que hoy se veían como
rectángulos planos a los bordes.

- **Ambigüedad del blanco y negro**: en vez de abandonar el tratamiento
  (ya es consistente con el resto de la app), se le suma una señal
  explícita que no depende de leer bien el color — una etiqueta roja
  "FALTA" superpuesta en la esquina de cada carta que no se tiene, SOLO
  cuando el PDF mezcla ambos estados. Si el filtro "Mostrar" de la pantalla
  de Colecciones ya deja un solo estado (Solo las que faltan / Solo las
  que tengo), el PDF sale directo a todo color — el blanco y negro no
  aporta nada cuando todas las cartas comparten el mismo estado, y antes
  el PDF ignoraba ese filtro por completo (`exportCollectionAsPDF` en
  `js/app.js` ahora sí lo aplica sobre `collectionCards(col)` antes de
  exportar, igual que ya hacía `renderCollectionGrid` en pantalla).
- **Orden Edición → Rareza → Número**: `exportCollectionAsPDF` ordena las
  cartas con `editionOrd(a)-editionOrd(b) || rarityRank(a)-rarityRank(b) ||
  cardNum(a)-cardNum(b) || nombre` (reusa las funciones que ya existían
  para el resto de los selectores de orden de la app, ver 87ª iteración) y
  se lo pasa ya ordenado a `exportCollectionPDF`. La función nueva
  `planCollectionLayout()` en `js/exporters.js` recorre ese orden y detecta
  los cambios de edición/rareza para intercalar un banner de edición
  (fondo oscuro, igual que el resto de la identidad visual) y uno de
  rareza (línea con texto en mayúscula) antes de cada grupo — calculando
  antes de dibujar nada en qué página cae cada elemento, así el "Página
  X/Y" del encabezado es exacto desde la primera página sin una pasada
  aparte.
  - **Bug real encontrado con la propia verificación** (Playwright + PyMuPDF
    para renderizar las páginas a imagen y revisarlas): cuando una sección
    de rareza terminaba con una fila incompleta (no llenaba todas las
    columnas) y la siguiente sección arrancaba, el encabezado nuevo se
    dibujaba ENCIMA de esa fila a medias en vez de debajo — nunca se
    avanzaba la coordenada Y para "cerrar" la fila abierta. Corregido:
    `planCollectionLayout()` ahora cierra cualquier fila a medias
    (`y += rowH`) antes de abrir la siguiente sección.
- **Esquinas redondeadas + sombra**: `renderCardThumb()` ahora recorta el
  canvas a un rectángulo con esquinas redondeadas (`ctx.clip()` con un path
  manual de `arcTo`, radio ~7% del ancho) antes de dibujar la carta, con
  fondo blanco de respaldo para poder seguir exportando JPEG liviano en
  vez de PNG con transparencia. La sombra se dibuja aparte, directo en el
  PDF (no en la miniatura): un rectángulo redondeado gris oscuro,
  levemente desplazado, con opacidad reducida vía `doc.GState` (con
  try/catch por si el navegador no lo soporta — se omite la sombra sin
  romper el resto del PDF).

**Nota operativa** (no afecta al dueño, documentado por si se repite): a
mitad de esta iteración el checkout local quedó desincronizado de `origin`
(`git log` mostraba un commit de mucho antes en esta misma sesión) después
de un reinicio del entorno — la primera versión de este cambio se escribió
sin darse cuenta encima de esa copia vieja, y `rarityRank is not defined`
en la consola del navegador durante la verificación fue la señal de que
algo no calzaba. Se comparó `git log` local contra `git log
origin/claude/card-collections-filters-9tcflz`, se confirmó que origin
tenía todo el trabajo real de la sesión y el local no, se guardó el diff
suelto en un patch por las dudas, y se hizo `git reset --hard` al commit
real de origin antes de rehacer el cambio ya sobre la base correcta.
Lección: si una función que se sabe que existe tira "not defined", lo
primero es comparar `git log` local contra `origin`, no asumir un typo
propio.

Verificado con Playwright (localStorage sembrado con una colección de 2
ediciones Mundos Perdidos, mitad de las cartas marcadas como propias, imágenes
interceptadas con un fixture local para no depender de la red) + PyMuPDF
para renderizar cada página a PNG y revisar el layout a simple vista: el
PDF con filtro "Todas" muestra banners de edición y rareza sin superposición,
en el orden correcto (Promocional antes que Real, Real antes que Cortesano/
Vasallo), con "FALTA" solo en las cartas sin poseer y esquinas/sombra
visibles; el PDF con filtro "Solo las que faltan" sale a todo color, sin
ninguna etiqueta "FALTA" (redundante ahí). 0 `pageerror` en ambos.

### 2026-09-17 (90ª iteración) — "Colección 20 años: La Cofradía"

El dueño pidió sumar la novena edición "Colección 20 años" que faltaba:
La Cofradía. Mismo método que las 8 anteriores — el wiki ("La Cofradía
Colección Completa 20 Años", myl.fandom.com) confirma "Las 170 cartas de
la edición La Cofradía", que coincide exacto con las 170 cartas que ya
teníamos para el slug `cofradia` (`data/cards.json`, TOR). Se clonaron las
170 hacia `coleccion_20_anos_cofradia` en `data/custom-cards.json` (mismo
patrón de `id`/`image` que las demás) y se agregó la entrada en
`data/editions.json`, junto a la edición original.

Verificado con Playwright: "Colección 20 años: La Cofradía" aparece en el
filtro de Edición con 170 cartas; la primera carta ("Anchimallen") muestra
el `editionName` correcto en la ficha. 0 `pageerror`.

### 2026-09-17 (89ª iteración) — Corrige de nuevo la regla de aura/foil de los Oro: la condición es OR, no AND, y barre el resto del catálogo

La 88ª iteración (ayer) dejó la regla de "Oro liso" mal construida: usaba
`!habilidad && rarity==="Oro"` (un AND que exige AMBAS condiciones a la
vez) tanto para el aro dorado como para bloquear el foil. El dueño corrigió
esto hoy: la condición real es un OR — un Oro pierde el foil si le falta
la habilidad **o** si le falta una rareza real, no solo cuando le faltan
las dos a la vez. Además aclaró la excepción: Promocional, Secreta,
Premium, Juego Organizado, Torneo Premier, etc. siempre muestran su propio
color de rareza y sí son foil, aunque sean de tipo Oro.

- **`js/app.js`**: reescrita la lógica de Oro desde cero, con dos
  funciones nuevas:
  - `hasRealRarity(card)`: falso solo para el cajón de sastre real de
    TOR — `rarity` vacío, `"Oro"`, `"—"` o `"Sin Frecuencia"` (antes solo
    se reconocía `"Oro"` exacto, dejando pasar `"—"`/`"Sin Frecuencia"` sin
    tratamiento). Promocional y Secreta SÍ cuentan como rareza real acá:
    son marcas legítimas, no placeholders.
  - `isSpecialOro(card)`: verdadero si `hasRealRarity()`, o si
    `declaresFoil()` ya lo marca (Premium, Mundos Perdidos, foil
    explícito…), o si la edición matchea `juego_organizado`/`torneo`
    (no hay ningún Oro liso en esas ediciones hoy, pero queda cubierto
    si aparece uno).
  - `isPlainOro(card)` ahora es simplemente `type === "Oro" &&
    !isSpecialOro(card)` — ni la habilidad ni la rareza se miran por
    separado, solo si el Oro tiene ALGUNA señal de ser especial. Un Oro
    liso siempre tiene el aro dorado y nunca es foil, tenga o no tenga
    texto de habilidad — eso ya no decide nada. Un Oro con rareza real
    (Real, Mega Real, Vasallo…) sigue coloreado por esa rareza y sigue las
    reglas de foil normales, tenga o no tenga habilidad tampoco.
- **Barrido del resto del catálogo** (pedido explícito: "revisa si hay más
  cartas con rareza Oro mal coloradas"): se simuló la lógica nueva contra
  las 2262 cartas Oro de todo el catálogo (`data/cards.json` +
  `data/custom-cards.json`) y se comparó contra la lógica de ayer.
  Encontró bugs reales más allá de los ya corregidos:
  - **252 cartas cambian de aro**: 244 ya tenían una rareza real
    (Promocional×72, Vasallo×60, Real×49, Cortesano×8, Mega Real×7, Ultra
    Real×7, Secreta×4) pero el AND de ayer las forzaba a dorado igual por
    no tener habilidad — ahora muestran su color correcto. Las otras 8 son
    Oro **con** habilidad pero con rareza `"—"`/`"Sin Frecuencia"` (ej.
    "Grimorio Arcano", "Yasakani" de Leyendas PE 4.0, "Drakkar" de Promo 20
    Años) que antes caían al degradado genérico por no estar cubiertas por
    el chequeo `rarity==="Oro"` exacto de ayer — ahora correctamente
    doradas.
  - **158 cartas pierden el foil que no debían tener**: todas Oro sin
    rareza real (82 `"Oro"`, 56 `"—"`, 20 `"Sin Frecuencia"`), 86 de ellas
    CON habilidad — el caso que ayer se dejó pasar por el AND (ej.
    "Agave", "El Cráneo De Cristal", "Popol Voh", "Buda Dorado").
  - **0 cartas ganan foil que no tenían** — el barrido confirma que el
    cambio es estrictamente más preciso, no más permisivo: ninguna carta
    Promocional/Secreta/con rareza real pierde su foil.
- Verificado con Playwright: "Lira" (sin habilidad, sin rareza) sigue
  dorada y sin foil; "Yasakani" (con habilidad, sin rareza) ahora dorada Y
  sin foil (el bug de ayer); "El Dorado" (con habilidad, Mega Real) sigue
  con su aro plateado y su foil; "Oro Inicial Axis Mundi" (sin habilidad,
  Promocional) ahora muestra el aro morado de Promocional (antes dorado) y
  sigue con foil; "Grimorio Arcano" (con habilidad, rareza "—") ahora
  dorada y sin foil (bug nuevo encontrado en el barrido). 0 `pageerror`.

### 2026-09-16 (88ª iteración) — 2 ediciones "Colección 20 años" más (Mundo Gótico, Ragnarok) + corrige aura y foil de los Oro sin rareza real

El dueño pidió agregar 2 ediciones "Colección 20 años" que faltaban de la
85ª iteración (Mundo Gótico y Ragnarok, con enlace a casamyl.cl de cada
una) y, mientras cargaba sus cartas físicas de la Colección 20 años,
reportó dos incongruencias visuales en los Oro sin habilidad ni rareza
real asignada.

**Mundo Gótico y Ragnarok**: mismo método que las 6 anteriores — se
verificó en el wiki que "Mundo Gótico Colección Completa 20 Años" incluye
"las 174 cartas de la edición Mundo Gótico y Mundo Gótico X" (coincide
exacto con las 174 cartas que ya tenemos para `mundo_gotico`) y que
"Ragnarok Colección Completa 20 Años" incluye "la totalidad de las 126
cartas que compusieron la edición original de Ragnarok" (coincide con
nuestras 125 de TOR + 1 carta `custom` — "Trono de Odín", que TOR nunca
tuvo y ya estaba cargada a mano — = 126). Se clonaron las 300 cartas
(174+126) hacia las 2 ediciones nuevas en `data/custom-cards.json`, mismo
patrón de `id`/`image` que las 6 anteriores, y se agregaron a
`data/editions.json` junto a sus originales.

**Incongruencia del aura ("el tipo de cartas... no le corresponde por
frecuencia")**: TOR marca ~500 cartas Oro de todo el catálogo con
`rarity: "Oro"` — no es una rareza real (Real/Vasallo/etc.), es un cajón
de sastre para cuando TOR no tiene el dato. La 82ª iteración ya hacía que
un Oro SIN habilidad mostrara el aro dorado fijo en vez de intentar
colorear por esa "rareza" falsa — pero un Oro CON habilidad y esa misma
rareza placeholder (ej. "Yasakani", "Corona Faraónica") seguía cayendo al
degradado genérico de acento (pensado para rarezas especiales sin rampa
propia, como Legendaria), que no corresponde a ninguna frecuencia real y
se veía como un color arbitrario. `holoSlug()` ahora usa el aro dorado
también cuando `rarity === "Oro"`, tenga o no habilidad — solo un Oro con
una rareza real asignada (Real, Mega Real, etc.) sigue coloreado por esa
rareza.

**Oro "vainilla" sin foil**: nueva `isPlainOro(card)` (`type === "Oro" &&
!ability && rarity === "Oro"` — las tres condiciones a la vez, como lo
describió el dueño) usada como veto duro en `hasFoil()`, con la misma
prioridad que `isNonFoilPrint()` (SCLPE) — pisa incluso el "toda la
edición es foil" de Mundos Perdidos si algún día calzara ahí. Se verificó
contra el resto del catálogo antes de aplicarlo: hay 315 cartas Oro sin
habilidad que SÍ tienen una rareza real asignada (Real, Mega Real, Vasallo,
Promocional…) — esas siguen las reglas normales y no pierden su foil; la
regla nueva solo afecta a las ~511 que de verdad no tienen ni habilidad ni
rareza conocida.

Verificado con Playwright: "Colección 20 años: Mundo Gótico" (174) y
"...Ragnarok" (126) aparecen en el filtro de Edición con su conteo
correcto; "Trono de Odín" se clonó bien; "Lira" (Oro, sin habilidad,
rareza "Oro") ahora muestra aro dorado y SIN foil; "Yasakani" (Oro, CON
habilidad, rareza "Oro" igual) muestra aro dorado y SÍ mantiene el foil.
0 `pageerror`.

### 2026-09-16 (87ª iteración) — El orden por defecto en toda la app pasa a ser "Número (ascendente)"

El dueño pidió que el orden por defecto sea siempre por número de carta
ascendente, en cualquier parte de la app. Los 3 selectores de orden que
existen (Catálogo, Cambio y Ventas, Mazos) ya tenían cada uno su propia
lógica de comparación — Catálogo ya traía "Número (ascendente)" como
opción (`cardNum(a) - cardNum(b) || editionOrd(a) - editionOrd(b) || nombre`,
para que el empate entre ediciones distintas con el mismo número no quede
al azar), pero no era la opción por defecto en ninguno de los 3, y Cambio
y Ventas / Mazos ni siquiera tenían una opción de número.

- **Catálogo** (`index.html`, `#f-sort`): se reordenaron las `<option>`
  para que "Número (ascendente)" quede primera — el `<select>` sin
  `selected` explícito toma la primera opción por defecto, y el botón
  "Limpiar"/reseteo de filtros ya usaba `selectedIndex = 0`, así que
  bastó con el reorden (no hizo falta tocar JS acá).
- **Cambio y Ventas** (`index.html` + `js/app.js`): `#trade-sort` no tenía
  ninguna opción de número — se agregó "Número (ascendente/descendente)"
  como primeras opciones, y `tradeSortComparator()` suma el caso `number`
  con el mismo criterio que ya usa Catálogo (reusa `cardNum`/`editionOrd`).
- **Mazos** (`js/app.js`): `#deck-sort` tampoco tenía opción de número — se
  agregó igual que en Cambio y Ventas, y el switch de orden dentro de cada
  zona (Aliados/Talismanes y armas/Oros y monumentos/Otras) en
  `renderDeckContents()` suma los casos `number`/`number_desc`. El default
  ahí es un ajuste (`store.getSetting("deckSort") || "number"`, antes
  `|| "name"`) — solo cambia para quien nunca tocó el selector; si alguien
  ya lo dejó en otra opción a propósito, esa preferencia guardada se
  respeta igual que antes.
- La vista Colecciones (Álbum) no se tocó: ya ordenaba sus cartas por
  número de fábrica (`collectionCards()` → `compareEditionCards`), sin
  selector propio — ya cumplía lo pedido.

Verificado con Playwright: recién cargada la app (sin tocar ningún
selector), Catálogo/Cambio y Ventas/Mazos muestran "number" seleccionado
en sus 3 selectores; filtrando Catálogo por "El Reto" las cartas salen
#1, #2, #3… en orden; con dos cartas de esa edición sembradas fuera de
orden (edid 012 y 003) en inventario/ofrecidas/mazo, tanto la lista de
Cambio y Ventas como la composición del mazo las muestran #003 antes que
#012. 0 `pageerror`.

### 2026-09-16 (86ª iteración) — La ficha del Catálogo no recoloreaba al pasar de 0 a 1 copia desde su propio stepper

El dueño reportó (con captura) que al subir la cantidad de una carta desde
0 a 1 usando el botón "+" de la ficha fija (panel derecho del Catálogo),
el arte se quedaba en blanco y negro — no pasaba a color hasta seleccionar
otra carta y volver. Pidió que fuera instantáneo, con una transición sutil
(mismo efecto que ya existe en las tarjetas de la grilla).

- **`js/app.js`**: `updateFichaQty(qty)` solo actualizaba el número de
  copias (`#ficha-qty`), nunca tocaba la clase `.owned` de `#ficha-art`
  (la que determina blanco y negro vs. color) — esa clase solo se ponía
  en `renderFicha()`, el render completo que corre al *seleccionar* una
  carta, no al cambiar su cantidad. Como el stepper de la ficha
  (`fichaChangeQty`) y el input de cantidad de la grilla (cuando la carta
  está seleccionada) pasan por `reflectQtyOnCardEl()` → `updateFichaQty()`
  para refrescar la ficha sin un render completo, el color nunca se
  actualizaba por esa vía. Se agregó el toggle de `.owned` dentro de
  `updateFichaQty()`, mismo criterio que ya usa `reflectQtyOnCardEl()`
  para la tarjeta de la grilla.
- **`css/styles.css`**: `.ficha-art img` no tenía `transition` (la tarjeta
  de la grilla sí, `filter 0.45s ease`) — sin eso el cambio de blanco y
  negro a color habría sido un salto brusco en vez de la transición sutil
  pedida. Se agregó la misma transición.

Verificado con Playwright: seleccionar una carta en 0 copias → `#ficha-art`
sin `.owned`; click en el "+" de la ficha → `.owned` aparece al instante
(antes se quedaba sin cambios); click en "−" vuelve a quitarlo; editar la
cantidad desde el input de la grilla mientras esa carta sigue seleccionada
también actualiza la ficha. `transition-property: filter` confirmado en el
`<img>`. 0 `pageerror`.

### 2026-09-16 (85ª iteración) — Agrega las 6 ediciones "Colección 20 años" (reimpresiones 1:1 de El Reto, Ira del Nahual, Espíritu de Dragón, Espada Sagrada, Dominios de Ra y Helénica)

El dueño reportó que tiene físicamente 6 cajas "Colección Completa 20 Años"
de Salo — reimpresiones como Primera Edición del listado completo de 6
ediciones originales de Primera Era/Primer Bloque — y que la app no las
contaba porque no existían como edición propia. Dio como ejemplo la de
Ira del Nahual (tienda casamyl.cl + wiki) y pidió nombrarlas "Colección 20
años: <edición original>".

**Identificar cuáles 6 exactamente**: el dueño las acotó "desde El Reto a
Espíritu de Dragón". La plantilla `Plantilla:Colecciones Completas` del
wiki (myl.fandom.com) lista más de 25 productos "Colección Completa" en
total (siguieron saliendo hasta 2022), pero exactamente 6 comparten fecha
de lanzamiento "6 de julio de 2019" y coinciden con los dos nombres que
acotan el pedido: **El Reto, La Ira del Nahual, Espíritu de Dragón, Espada
Sagrada, Helénica y Dominios de Ra** — las 6 quedaron confirmadas con esa
señal (misma fecha + nombres extremo coincidentes), no por "se parece".
(El dueño también escribió "Colección 20 años: Mundo Gótico" como ejemplo
de formato de nombre en su mensaje — Mundo Gótico Colección Completa 20
Años existe en el wiki pero se lanzó el 28-05-2020, fuera de este grupo de
6, así que se interpretó como un ejemplo de estilo de nombre, no como una
7ª edición pedida; si el dueño la quiere igual, es la misma receta de esta
entrada aplicada a esa edición.)

**Confirmar que es reimpresión 1:1** (no cartas nuevas): se leyó la sección
"Cartas" de las 6 páginas wiki de cada "Colección Completa 20 Años" — las 6
dicen literalmente "Las N cartas de la edición [ORIGINAL] — Para una lista
completa ver Lista de cartas de [ORIGINAL]", es decir el wiki mismo remite
al listado de la edición original en vez de tener uno propio. Confirmado:
no hace falta re-extraer nada del wiki, alcanza con clonar los datos que
el catálogo ya tiene de cada edición original.

**Bug encontrado de paso (y corregido)**: `data/editions.json` tenía
`espada_sagrada` y `dominios_de_ra` (con guion bajo) como slugs, pero las
472 cartas reales de esas dos ediciones en `data/cards.json` (TOR) usan
`espada-sagrada` y `dominios-de-ra` (con guion) — un desajuste que dejaba
esas dos ediciones **sin ninguna carta** al filtrar por ellas en la app
(0 resultados). Se corrigieron los dos slugs en `editions.json` para que
apunten a los datos reales — no relacionado con el pedido original, pero
hacía falta arreglarlo para poder clonar sus cartas correctamente para la
Colección 20 años correspondiente, y de paso deja de estar roto para
cualquiera que ya use esas dos ediciones.

**Clonado**: por cada una de las 6 ediciones originales (174+126+236+236+
236+236 = **1244 cartas**), se generó una carta nueva en
`data/custom-cards.json` con `id` nuevo (`coleccion_20_anos_<original>__custom__<edid>_<nombre>`),
`edition`/`editionName` apuntando a la Colección 20 años correspondiente, y
el resto de los campos (nombre, tipo, raza, rareza, coste, fuerza,
habilidad, historia, **imagen**) copiados tal cual de la carta original —
incluida la URL de imagen `api.myl.cl` (CDN propio de TOR, que todo el
resto del catálogo ya hotlinkea directo sin problema de CORS, a diferencia
de las tiendas comerciales que sí se autohospedan). 6 entradas nuevas en
`data/editions.json`, cada una junto a su edición original para que se
ubiquen fácil en el selector.

**Fuera de alcance de esta pasada, dejado sin resolver a propósito**: cada
caja "Colección 20 años" también incluye 3 cartas bonus "SP" (Set
Paralelo) de regalo, pero esas mismas 3 cartas físicas se reparten
compartidas entre 3 productos distintos cada una (ej. Miyamoto Musashi-SP
viene en El Reto, Ira del Nahual Y Espíritu de Dragón a la vez) y además
son de cantidad limitada ("versiones posteriores del producto no las
incluyen") — representarlas bien requeriría resolver cómo una misma carta
física "pertenece" a 3 ediciones sin triplicar el conteo, un problema
aparte que no estaba pedido. No se agregaron.

Verificado con Playwright: las 6 ediciones nuevas aparecen en el filtro de
Edición del Catálogo con su conteo exacto (174/126/236/236/236/236);
"Odin" (Colección 20 años: El Reto, nº 001) muestra `editionName` e imagen
correctos; Espada Sagrada y Dominios de Ra (las originales, tras el fix
del slug) pasaron de 0 a 236 cartas cada una. 0 `pageerror`.

### 2026-09-16 (84ª iteración) — Todas las ediciones "Mundos Perdidos" son foil, y corrige 17 rarezas mal cargadas contra el wiki

El dueño pidió dos cosas relacionadas: (1) que todas las cartas de las 11
ediciones "Mundos Perdidos" tengan el efecto foil, sin importar su rareza,
y (2) revisar esas mismas ediciones porque hay cartas "Real" cargadas como
"Cortesano" o "Vasallo".

- **Foil por edición** (`js/app.js`, `declaresFoil()`): nuevo caso
  `card.edition.startsWith("mundos_perdidos")` → foil siempre, mismo lugar
  y prioridad que el caso "Premium" de Lootbox (75ª/76ª iteración) — pisa
  el default no-foil de Vasallo/Cortesano. No afecta el corte de SCLPE4
  (edición distinta, sin choque de prefijos).
- **Auditoría de rareza contra el wiki**: en vez de asumir "todo debería
  ser Real" (varias Mundos Perdidos SÍ tienen Cortesano/Vasallo legítimos
  por diseño — ej. Apu Illa, Sif, Hydra, 47 Ronin, Sko'yo, Kornos/Sedna —
  y convertirlas habría sido un error nuevo), se descargó la columna
  "Frecuencia" de la página wiki de cada una de las 11 ediciones
  ("Lista de cartas de Mundos Perdidos - <edición>", vía la API de
  MediaWiki, mismo mecanismo que usa la skill `importar-edicion-myl-wiki`)
  y se cruzó carta por carta contra nuestros datos (220 cartas, cruce por
  nombre normalizado — 0 filas del wiki quedaron sin encontrar su
  contraparte). Encontró **17 discrepancias reales** en 4 ediciones (las
  otras 7 ya estaban correctas):
  - **13 cartas "Cortesano"→"Real"** (dato mal cargado, el wiki las marca
    Real igual que a sus vecinas numeradas): Tituba, Rugaru, Sarah Good,
    Canción Coyote, Mosquete Puritano, Colina del Ahorcado (Horrores de
    Salem); Guirivilo, Guardián del Sol, Huáscar, Lanza Astral, Melimoyu
    (Ciudad de los Césares); Sacar la Espada, Barnstokk (La Saga de
    Volsung).
  - **3 cartas "Real"→"Promocional"**: Mary Bradbury (Horrores de Salem,
    MPS 19/18), Pájaro Inti (Ciudad de los Césares, MPC 19/18), Volsung
    (La Saga de Volsung, MPV 19/18) — el mismo bug de "la carta Promocional
    final numerada como si fuera una carta normal más" ya documentado el
    04-08-2026 para otras 8 ediciones Mundos Perdidos, que a estas 3 no les
    había llegado la corrección en su momento.
  - **1 carta "Ultra Real"→"Real"**: Expulsión (Horda Esteparia, MPAT
    19/18) — "Ultra Real" no es una rareza que el wiki registre para esta
    carta. (Sigue pendiente, sin tocar en esta pasada, la imagen de esta
    misma carta — ya señalada como posible mezcla con otro código el
    09-08-2026, "Pendiente encontrar la foto correcta".)
  - Las 3 primeras ediciones (Horrores de Salem, Ciudad de los Césares, La
    Saga de Volsung) vienen de TOR (`data/cards.json`): las 16 correcciones
    se agregaron a `RARITY_CORRECTIONS` en `scraper/corrections.js` (para
    que sobrevivan al próximo scrapeo semanal) y se aplicaron también al
    `data/cards.json` ya commiteado. Expulsión es `custom` (Horda
    Esteparia, `data/custom-cards.json`): edición directa.
  - Re-verificado tras el fix: 0 discrepancias restantes contra el wiki en
    las 220 cartas de las 11 ediciones.

Verificado con Playwright: Guirivilo (ahora Real) y Apu Illa (Cortesano
legítimo, sin tocar) ambas muestran el foil activo por ser de Mundos
Perdidos; Mary Bradbury, Volsung y Expulsión muestran su rareza corregida
en la ficha. 0 `pageerror`.

### 2026-09-16 (83ª iteración) — El filtro Tipo mostraba Talismán/Tótem duplicados (con y sin tilde) — dato legacy de cartas manuales viejas

El dueño reportó (con captura del sitio publicado) que el filtro "Tipo" del
Catálogo mostraba **4** opciones donde debería haber 2: "Talisman" y
"Talismán" por un lado, "Totem" y "Tótem" por otro. Primero descarté que
fuera un problema de `data/cards.json`/`data/custom-cards.json` (ambos
archivos, revisados exhaustivamente, solo tienen la forma con tilde en las
~22.000 cartas del catálogo) — le pedí al dueño una captura para confirmar
dónde lo veía exactamente, y con eso quedó claro: las variantes sin tilde
no están en el catálogo compartido, están en **datos propios del dueño**
guardados en su navegador (`localStorage`, cartas "manuales" que creó hace
tiempo) — de cuando el campo Tipo del formulario "Carta manual" era texto
libre, antes de convertirse en el `<select>` de opciones fijas que es hoy.
El filtro comparaba con `===` exacto, así que un dato viejo sin tilde nunca
calzaba con la opción "oficial" con tilde del resto del catálogo, y ambas
formas aparecían como opciones separadas.

- **`js/app.js`**: nueva `groupedUnique(values)` — como la `uniqueSorted()`
  que ya existía, pero agrupa variantes que solo difieren en tildes,
  mayúsculas o espacios bajo una sola etiqueta (la más frecuente entre las
  variantes encontradas), y `looseEq(a, b)` para comparar dos valores con
  el mismo criterio. Ambas reusan `normText()` (ya existía para el
  buscador). Se aplicó **solo al campo `type`** (no a raza/edición/rareza,
  donde nombres parecidos pueden ser categorías legítimamente distintas y
  fusionarlas a ciegas sería el error contrario):
  - `populateFilters()`: `#f-type` (Catálogo) usa `groupedUnique` en vez de
    `uniqueSorted`.
  - `baseFilteredCards()`: compara `looseEq(c.type, type)` en vez de
    `c.type !== type`, así que elegir la opción con tilde también incluye
    las cartas guardadas sin tilde.
  - `updateTradeFilterSelect()`/`renderTradeList()` (Cambio y Ventas,
    `#trade-type`, agregado en la 80ª iteración): mismo tratamiento, caso
    especial para `field === "type"`.
  - No se tocó ningún dato guardado del dueño (sus cartas manuales siguen
    con el campo `type` tal cual las escribió) — el fix es solo en cómo el
    filtro agrupa y compara, no reescribe nada.

Verificado con Playwright simulando el caso real: se sembró
`localStorage["myl.customcards.v1"]` con una carta "Talisman" y otra
"Totem" (ambas sin tilde, como quedarían guardadas de un formulario viejo)
antes de cargar la app. El filtro `#f-type` del Catálogo mostró
exactamente 1 opción "Talismán" y 1 "Tótem" (no 4), y filtrar por la
opción con tilde sí encontró la carta guardada sin tilde. Mismo resultado
en `#trade-type` de Cambio y Ventas. 0 `pageerror`.

### 2026-09-16 (82ª iteración) — Oros sin habilidad brillan dorado, arregla etiquetas `<br>` visibles, pestañas del mazo sin estilo, y filtro/orden por "Mi valor" en Cambio y Ventas

Cinco pedidos del dueño en un solo mensaje, con una captura de "Mazo
Guerrero v2" (vista Mazos) como evidencia de dos de ellos:

- **Oro sin habilidad → resplandor dorado**: el aro holográfico coloreaba
  por rareza incluso en un Oro "vainilla" (sin texto de habilidad), así que
  un Oro Vasallo salía azul, uno Cortesano rojo, etc. — pero un Oro básico
  es "solo un Oro", no debería depender de su rareza para el color. Nueva
  `holoSlug(card)` en `js/app.js`: si `card.type === "Oro"` y no tiene
  `ability`, devuelve el slug fijo `"oro"` en vez de `raritySlug(card.rarity)`;
  un Oro CON habilidad (El Dorado, Knarr, etc., ver 79ª iteración) sigue
  coloreado por rareza como cualquier otra carta. Nueva rampa
  `.holo[data-rarity="oro"]` en `css/styles.css` (dorado). Se actualizaron
  los 3 lugares que fijaban `data-rarity` a mano (ficha del Catálogo, ficha
  de Mazos, modal de detalle) para usar `holoSlug()` en vez de
  `raritySlug(card.rarity)` directo.
- **Etiquetas `<br>` visibles como texto literal** (se ve en la captura,
  ficha de Lautaro: "...entra en juego.<br>Cuando entra en juego..."): el
  dato de 219 cartas en `data/custom-cards.json` (+3 con el mismo problema
  en `flavour`) traía el salto de línea como el string literal `<br>` en
  vez de un salto de línea real (`\n`) — como el render (`nl2br()`) hace
  `escapeHtml()` antes de convertir SOLO los `\n` reales en `<br>`, ese
  `<br>` literal quedaba escapado a `&lt;br&gt;` y se veía tal cual en
  pantalla. Reemplazo global y verificado de `<br>` → `\n` en los campos
  `ability`/`flavour` de las 222 cartas afectadas (222 campos, 222 cartas —
  cada una tenía como máximo una ocurrencia), con un script que solo tocó
  esos dos campos (no arriesgó el resto del JSON) y preservó el formato de
  indentación del archivo (diff de 222 líneas exactas, sin reformateo).
- **Pestañas "Cartas / Estadística / Estrategia" del detalle de mazo
  (también en la captura)**: estos 3 botones usaban `class="tab"` a secas,
  pero esa clase SOLO tiene estilo definido como `.rail .tab` (el nav
  lateral) — fuera de ese contexto caían al botón blanco por defecto del
  navegador, un choque de nombre de clase entre dos componentes no
  relacionados. Se agregó `.deck-tabs .tab` en `css/styles.css` con su
  propio aspecto de pestañas segmentadas oscuras (activa resaltada con
  `--accent-tint`/`--accent-300`, igual paleta que ya usa `.rail .tab.active`).
- **Cambio y Ventas — nuevo filtro "Sin valor asignado" / "Con valor
  asignado"** (`#trade-value-filter` en `index.html`, junto a los otros 4
  filtros combinables): filtra por `store.getMyPrice(id) == null` (o
  `!= null`), AND con el resto de los filtros activos, igual que ya
  funcionan rareza/edición/raza/tipo.
- **Cambio y Ventas — nuevo orden "Mi valor (más caras/más baratas
  primero)"**: 2 opciones nuevas en `#trade-sort` (`value_desc`/`value_asc`).
  `tradeSortComparator()` gana un caso numérico para `field === "value"`
  que compara `store.getMyPrice(id)`, tratando "sin valor" como el valor
  más bajo (queda al final ordenando de más cara a más barata, y primero
  en el orden inverso) — mismo criterio que usan muchas planillas para
  celdas vacías en una columna numérica.

Verificado con Playwright: la ficha de "Lautaro" (Lootbox PE 2025) ya no
muestra `<br>` literal, solo saltos de línea reales; un Oro sin habilidad
muestra `data-rarity="oro"` en el aro; las pestañas del mazo tienen fondo
`rgba(145,132,217,.16)` (tinte de acento) en la activa, no blanco; el
filtro "Sin valor asignado" aísla la carta recién ofrecida sin precio, y
tras asignarle un valor el filtro "Con valor asignado" la vuelve a
mostrar; el selector de orden acepta `value_desc` sin error. 0 `pageerror`
en toda la prueba.

### 2026-09-16 (81ª iteración) — Corrige de vuelta la rareza de Sotz' Na: es Mega Real, no Real

En la 75ª iteración el dueño había pedido corregir Sotz' Na (Leyendas -
Primera Era 4.0, #085) de "Mega Real" a "Real" además del coste (3→2). El
dueño ahora confirmó, mirando el código impreso en la carta física ("MR"),
que la rareza original SÍ era la correcta — el error estuvo en el pedido
de corrección de rareza, no en el dato. Se revirtió solo el campo
`rarity` a "Mega Real" en `data/custom-cards.json`; el coste queda en 2
(esa corrección seguía siendo válida, no estaba en duda).

Verificado con Playwright: la ficha de "Sotz' Na" muestra
`Leyendas - Primera Era 4.0 · nº 085 · Mega Real` y el aro holográfico
`data-rarity="mega-real"`. 0 `pageerror`.

### 2026-09-16 (80ª iteración) — Cierra el plan pendiente: "Mi valor" se edita en línea, sin modal (y cantidades ofrecidas/en detalle también)

Un plan de rediseño anterior (sidebar colapsable + edición en línea sin
modales + filtros/orden combinables en Cambio y Ventas) había quedado casi
completo en el "Rediseño Nocturne" de esta misma sesión — el rail lateral
colapsable (`96a7169`), la cantidad editable por teclado en la grilla del
Catálogo (`03b81ab`) y los filtros/orden combinables de Cambio y Ventas
(`37a823a`) ya estaban shippeados — pero el último punto quedó a medio
hacer: "Mi valor" seguía abriendo `#value-modal` para escribir el precio.
Se terminó ese punto y se extendió el mismo patrón a los dos lugares que
también habían quedado con solo botones +/−:

- **`js/app.js` `myValueSectionHtml()`**: en vez de un botón "Asignar
  valor"/lápiz que abría el modal, ahora emite directo
  `<input type="number" data-role="myvalue">` con el valor actual (o vacío
  con placeholder "Sin valorar") — mismo patrón que ya usa `#deck-name` y
  el input de cantidad de la grilla: el dato se edita ahí mismo, sin
  ventana flotante. `tradeCardEl()` escucha `change` y llama
  `store.setMyPrice(id, raw ? Number(raw) : null)` (vaciar el campo quita
  el valor, igual que antes hacía el botón "Quitar valor" del modal) +
  `renderTradeList()`.
- Se eliminaron `openValueModal`, `closeValueModal`, `saveValue`,
  `removeValueFromModal` y sus bindings en `bindTradeEvents()`, y el bloque
  `#value-modal` completo de `index.html`. `openSellModal()` no dependía de
  esas funciones (ya llamaba `store.getMyPrice` directo), así que no
  necesitó cambios.
- **Cantidad ofrecida** (`tradeCardEl`, `data-role="tqty"`): el plan
  original también pedía este campo como input editable, no solo +/−. Se
  convirtió a `<input type="number" min="0" max="${owned}">`, con `change`
  → `store.setTradeQty(card.id, valor)` (la función ya clampeaba a lo que
  el dueño realmente tiene, así que no hizo falta lógica nueva).
- **Cantidad total en el modal de detalle** (`openModal`, `data-role="mqty"`):
  mismo tratamiento — ahora es un input; se factorizó la sincronización
  compartida (grilla + disponible + ficha del mazo) en una función
  `applyModalQty()` para no duplicarla entre los botones +/− y el nuevo
  listener `change`. El control "Disponible" del mismo modal (`data-role="tqty"`
  ahí, un valor derivado — disponible = ofrecido − reservado en mazos, no
  invertible 1 a 1) se dejó como estaba (stepper +/−, sin input directo):
  convertirlo habría requerido inventar una traducción "disponible deseado
  → delta de ofrecido" que el propio dato no define de forma única.
- **Bug real encontrado de paso**: al convertir la cantidad de la grilla a
  `<input>` en la 2/N del Rediseño Nocturne, el handler de +/− del modal
  de detalle (`openModal`) seguía haciendo `gridCard.querySelector('[data-role="qty"]').textContent = newQty`
  — no tiene efecto en un `<input>` (se lee/escribe con `.value`, no
  `.textContent`), así que la grilla no reflejaba los cambios de cantidad
  hechos desde el modal hasta el próximo re-render completo. Corregido
  dentro de `applyModalQty()` (usa `.value` y también sincroniza la clase
  `.dup`, que tampoco se estaba tocando).
- **CSS**: `.my-value-input`/`.my-value-prefix` (mismo tamaño/peso que el
  `.my-value-amount` que reemplazan, con foco vía `:focus-within` en el
  contenedor en vez de borde fijo). Se agregó `.trade-row .qty-num-input { flex: none; width: 26px }`
  porque el `.qty-num-input` genérico (`flex:1; width:0`, pensado para la
  fila ancha de la grilla del Catálogo) colapsaba a 0px de ancho dentro de
  `.tr-qty` (un contenedor `flex: none`, sin ancho propio que repartir) —
  se detectó recién en la verificación con Playwright (`boundingBox()`
  devolvía `width: 0`), no a simple vista.
- Verificado con Playwright: cantidad de grilla editada por teclado (3) →
  se abre el modal y muestra 3 → se edita a 5 en el modal → al cerrar, la
  grilla muestra 5 (confirma el fix del bug de sincronización); se navega
  a Cambio y Ventas por el rail lateral; `#value-modal` no existe en el
  DOM; se edita "Mi valor" a $4200 sin abrir ningún modal y persiste tras
  re-renderizar la lista; se edita la cantidad ofrecida a 2 en línea; el
  selector de orden (`#trade-sort`) funciona. 0 `pageerror` en toda la
  prueba.

### 2026-09-16 (79ª iteración) — Auditoría de imágenes mal emparejadas en Leyendas PE 4.0 (por el bug de nombres duplicados)

El dueño reportó con captura que "Ocelote del Templo" (edid 086) y "El
Dorado" (edid 087) no mostraban el arte correcto para ese número impreso.
Leyendas - Primera Era 4.0 es justo la edición que la skill
`registrar-nueva-edicion` marca como el caso de mayor riesgo del proyecto:
tiene ~24 nombres duplicados entre variantes de rareza de la misma carta
(ej. "Ocelote del Templo" existe como carta normal Y como una de las 3
"Secreta Exclusiva" de LPE23), así que un emparejamiento de imagen hecho
por nombre en vez de por código exacto puede cruzar el arte de una
variante con los datos de otra.

**Método**: se corrió de nuevo `scripts/match_mylserena_sitemap.py
--code-filter lpe4` (401 páginas de producto, 0 sin código detectado) y se
cruzó cada resultado por `(prefijo, número)` exacto contra `edid`/
`specialId` — nunca por nombre — contra las ~305 cartas de la edición que
usan imagen de mylserena.cl. Como filtro barato antes de mirar cada carta
una por una, se comparó primero el tamaño de archivo entre la imagen
guardada y la recién descargada; toda diferencia grande se verificó
visualmente leyendo el código impreso en la fotografía antes de tocar
nada (una diferencia de tamaño sola NO es prueba de error — "Dragón
Blanco", edid 044, tiene una diferencia grande de puro cambio de calidad
de escaneo, y se dejó intacta tras confirmar visualmente que el arte era
el correcto).

**5 cartas confirmadas con arte incorrecto y corregidas** (`data/custom-cards.json`
+ `data/custom-images/mylserena/`, extensión `.webp`→`.jpg` real según
`Content-Type`, no según la URL):

- **Ocelote del Templo** (086, Oro): `rarity` "Real"→"Mega Real" (el
  código impreso "LPE4-86/320 MR" no coincidía con la rareza guardada,
  señal de que también los datos —no solo la imagen— venían de la carta
  equivocada) + imagen nueva.
- **El Dorado** (087, Oro, Mega Real): tenía `image: ""` (vacío) y
  `ability: ""` (vacío) — ambos completados desde la foto verificada
  ("LPE4-87/320 MR"); la rareza ya estaba correcta.
- **Horóscopo Chino** (071, Oro): `rarity` "Real"→"Mega Real" + imagen
  nueva ("LPE4-71/320 MR").
- **Knarr** (091, Oro): `rarity` "Sin Frecuencia" (valor anómalo, no es
  una rareza válida del juego) →"Mega Real", `ability` vacío→texto
  verificado, + imagen nueva ("LPE4-91/320 MR").
- **Los Cinco Anillos** (096, Oro): `rarity` "Real"→"Mega Real" + imagen
  nueva ("LPE4-96/320 MR"). Ojo: existe una carta homónima distinta de la
  edición LPE 2023 (`112-325`, corregida en la 74ª iteración) — son dos
  cartas separadas, cada una con su propio `id` e `image`, no se tocaron
  entre sí.

Las 5 se verificaron con Playwright leyendo `.ficha-card-sub` de cada una
en el Catálogo tras seleccionarlas por búsqueda — las 5 muestran
`Leyendas - Primera Era 4.0 · nº 0XX · Mega Real`, coincidiendo con el
código impreso en la imagen nueva. 0 `pageerror`.

**Falsa alarma autodetectada y revertida (sc_20/sc_21/sc_22)**: el
resultado crudo del sitemap sugería que "Titán Licántropo" (SC-20),
"Hombre Lobo" (SC-21) y "Guevadan" (SC-22) tenían sus imágenes cruzadas
entre sí (el título de la página de mylserena.cl para cada SKU no
coincidía con el nombre esperado). Se llegó a descargar, renombrar y
sobrescribir los 3 archivos, y a editar la imagen de `sc_22` en
`custom-cards.json`, **sin verificar primero qué contenía realmente el
archivo ya commiteado** — un incumplimiento directo de la regla "nunca
adivinar" de la skill, porque se actuó sobre una señal indirecta (el
título de la tienda) sin confirmar el estado real de nuestros propios
datos antes. `git status`/`git diff --stat` tras el reemplazo mostró
**cero cambios reales** para `sc_20` y `sc_21` (el archivo "nuevo" era
byte-idéntico al ya commiteado), lo que disparó la revisión con `git show
HEAD:<ruta>` — las 3 imágenes originales ya eran correctas; el desorden
estaba únicamente en los metadatos de la propia página de mylserena.cl
para ese SKU (su `description` JSON-LD no coincidía con la foto subida en
esa página), un error del lado de la tienda, no de este repo. Se revirtió
`sc_22` con `git checkout HEAD --` sobre el `.webp`, se borró el `.jpg`
creado por error, y se restauró la extensión `.webp` en
`custom-cards.json`. Lección para la próxima auditoría de este tipo:
confirmar primero el contenido real del archivo propio (`git show
HEAD:<ruta>` o inspección directa) antes de tratar una discrepancia de
título de tienda como prueba de un error propio.

**Fuera de alcance de esta pasada, dejado sin resolver a propósito**: 13
cartas de la sub-serie "Promocional" (edid 330–342 y 352) no tuvieron
ningún resultado en el cruce `--code-filter lpe4` del sitemap — esa tienda
aparentemente no vende esos números de impresión promocional bajo ese
esquema. Ya tenían alguna imagen asignada (no vacía) y no se tocaron ni se
verificaron de forma independiente en esta pasada. Del resto de la
edición (~267 cartas de mylserena.cl que no forman parte de un grupo de
nombre duplicado y no salieron marcadas por el filtro de diferencia de
tamaño), tampoco se revisaron una por una — quedan como posible trabajo
futuro si aparece un reporte puntual, siguiendo el mismo método de esta
entrada.

### 2026-09-16 (78ª iteración) — El set "SCLPE4" nunca es foil, tenga la rareza que tenga

El dueño precisó la regla de foil: las cartas con código "SCLPE" (el set
Leyendas - Primera Era 4.0 en `data/custom-cards.json`, `specialId`
"SCLPE4-NN") tienen relieve pero no brillan como el foil real — así que
nunca deberían mostrar la capa de foil, sin importar su rareza. Son 80
cartas y varias son Real/Mega Real/Ultra Real (rarezas que por defecto
siempre son foil), así que esto pisa esa regla general.

- **`js/app.js`**: nueva `isNonFoilPrint(card)` — `true` si
  `card.specialId` empieza con "SCLPE" (case-insensitive). `hasFoil()` la
  consulta primero, antes que `declaresFoil()` y que la rareza: si es un
  print SCLPE, nunca es foil, ni por Premium ni por rareza alta.
- Verificado con Playwright: "Lautaro" (Real, `SCLPE4-41`, corregido en la
  77ª) ya no muestra la capa de foil pese a ser Real; una carta Real
  cualquiera sin ese código la sigue mostrando. 0 `pageerror`.

### 2026-09-16 (77ª iteración) — Corrige la rareza de Shuar y Lautaro (Leyendas PE 4.0, set SCLPE4)

El dueño mandó capturas del modal de detalle mostrando el aro holográfico
mal coloreado en dos cartas del set "SCLPE4" (custom, Leyendas - Primera
Era 4.0):

- **Shuar** (`leyendas_primera_era_4_0__custom__sc_40_shuar`,
  `specialId: "SCLPE4-40"`): tenía `rarity: "Vasallo"` (aro azul) y debería
  ser **Cortesano** (aro rojo/vino).
- **Lautaro** (`leyendas_primera_era_4_0__custom__sc_41_lautaro`,
  `specialId: "SCLPE4-41"`): tenía `rarity: "Cortesano"` (aro rojo) y
  debería ser **Real** (aro dorado).

Ambas son entradas de `data/custom-cards.json` (no pasan por el scraper),
así que se editaron directo ahí, igual que Sotz' Na en la 75ª. Verificado
con Playwright: la ficha de Shuar ahora muestra `data-rarity="cortesano"`
y la de Lautaro `data-rarity="real"`, coincidiendo con la línea de
metadatos (`... · Cortesano` / `... · Real`). 0 `pageerror`.

### 2026-09-16 (76ª iteración) — Las cartas "Premium" de Lootbox llevan foil aunque su rareza normalmente no lo tenga

El dueño confirmó la regla que había quedado pendiente en la 75ª: las
cartas Premium deben tener foil sin importar su rareza. Al buscar "premium"
en todo el catálogo apareció la señal exacta: 42 cartas de las ediciones
Lootbox (`data/custom-cards.json`, Lootbox Primera Era 2024 y 2025) ya
traen `specialId` con el prefijo "PREMIUM " (ej. "PREMIUM PE 01", "PREMIUM
LPE25 03") — 37 son Real, pero **5 son Vasallo o Cortesano**
("Sátiro", "Forseti", "Pahuahtun", "Janaqueo", "Kuei Xing"), justo el caso
"algunos Vasallo/Cortesano sí son foil" que el dueño había descrito antes
de pedir el md de foil.

- **`js/app.js`**: `declaresFoil()` ahora también reconoce
  `/premium/i.test(card.specialId)` como declaración de foil, antes de
  caer a `FOIL_CORRECTIONS` (que sigue vacía, para casos sin ninguna marca
  en los datos). No hizo falta tocar `FOIL_OPT_IN` ni `hasFoil()` — el
  camino de "la carta lo declara" que ya traía la 75ª solo necesitaba una
  fuente de datos real en vez de la tabla manual.
- Verificado con Playwright: "Sátiro" (Vasallo, `specialId: "PREMIUM
  LPE25 03"`) muestra el foil visible; un Vasallo cualquiera sin esa marca
  lo sigue mostrando oculto. 0 `pageerror`.

### 2026-09-16 (75ª iteración) — Foil sutil sobre cartas premium + corrige numeración "Secreta Exclusiva" de LPE 2023

El dueño pidió el foil (complemento del marco holográfico de la 73ª/74ª)
pero antes preguntó algo clave: ¿la app tiene alguna propiedad para saber
si UNA carta puntual es foil, más allá de su rareza? Porque en ediciones
nuevas/reediciones hay Vasallo y Cortesano (rarezas que normalmente no
llevan foil) que sí lo son, pero no todas.

- **Investigación antes de tocar código**: se revisaron todas las claves
  presentes en `data/cards.json`/`data/custom-cards.json` (ninguna
  menciona foil/finish/variant/acabado/versión) y además se hizo un
  `fetch` en vivo contra la API cruda de TOR
  (`api.myl.cl/cards/edition/...`) para inspeccionar el objeto de una
  carta tal cual lo entrega el servidor: `id, edid, slug, name, rarity,
  race, type, keywords, cost, damage, ability, flavour, ed_edid,
  ed_slug`. **No existe ningún campo de acabado en la fuente de datos.**
  Conclusión: hoy no se puede distinguir foil por dato, solo por rareza
  (con la excepción manual que se deje declarada).
- **`js/app.js`**: `hasFoil(card)`/`declaresFoil(card)` — Real, Mega Real,
  Ultra Real, Secreta (y rareza desconocida) son foil siempre; Vasallo y
  Cortesano NO son foil por defecto, solo si la carta lo declara.
  `declaresFoil()` revisa `card.foil === true`, y también
  `card.foil/finish/variant/acabado/version` como texto que contenga
  "foil" (por si algún día el dato trae eso), más una tabla nueva
  `FOIL_CORRECTIONS` (cardId → true) — **vacía por ahora**, lista para
  que el dueño vaya marcando a mano los Vasallo/Cortesano puntuales que
  identifique como foil, mismo mecanismo que `RARITY_CORRECTIONS`.
- **`css/styles.css`**: `.foil` — retícula diagonal de 3 capas (18px ×2
  cruzadas + 9px de punteado) teñida por un degradado tornasol de 260%
  que se desliza en diagonal (`background-position`, 9s
  `ease-in-out infinite alternate`), mezclada con `mix-blend-mode:
  overlay` y opacidad `.72` para que reaccione al arte sin taparlo.
  `pointer-events:none` (no interfiere con los clics) y respeta
  `prefers-reduced-motion`.
- El `<div class="foil">` se agrega como hijo de `.holo-art`, entre el
  arte/velo y las píldoras/nombre, en los tres lugares del marco
  holográfico (ficha del Catálogo, ficha de Mazos, modal de detalle) —
  siempre presente en el DOM, se oculta con el atributo `hidden` en vez
  de crearse/destruirse, para no reiniciar la animación al cambiar de
  carta. **No** se agrega a la grilla, el Álbum ni las filas de mazo
  (mismo criterio que el marco: a esos tamaños sería ruido).
- **Bug de datos encontrado de rebote**: al revisar el set "Secreta
  Exclusiva" de LPE 2023 (donde vive Ocelote Del Templo, corregido en la
  74ª), se encontró que sus compañeras de numeración —**Sakura**
  ("Secreta Exclusiva 1") y **Los Cinco Anillos** ("Secreta Exclusiva
  2")— tenían exactamente el mismo problema: `specialId` correcto pero
  `rarity` sin actualizar a Secreta. Se corrigieron las tres juntas en
  `RARITY_CORRECTIONS` + parche directo a `data/cards.json`. De paso se
  corrigió un comentario impreciso del commit anterior: ese `specialId`
  no lo trae TOR, sale de nuestra propia `LEYENDAS_2023_CORRECTIONS`
  (numeración ya corregida en una sesión previa).
- **Otra corrección reportada en la misma iteración**: "Sotz' Na" de
  Leyendas - Primera Era 4.0
  (`leyendas_primera_era_4_0__custom__85_sotz_na`, entrada de
  `data/custom-cards.json` — no pasa por el scraper, así que se edita
  directo ahí, no en `RARITY_CORRECTIONS`) tenía coste 3 y rareza "Mega
  Real"; la carta física del dueño tiene coste 2 y es "Real". Corregidos
  ambos campos.
- Verificado con Playwright: una carta Vasallo sin declarar foil lo
  muestra oculto (`hidden`), una Real lo muestra visible con la trama y
  el degradado corriendo; con `reducedMotion:'reduce'` el
  `animationName` computado es `none`; el modal también lo muestra; la
  grilla no tiene ningún `.foil` en el DOM. 0 `pageerror`.

### 2026-09-16 (74ª iteración) — Corrige los colores del marco holográfico (morado es Promocional, verde jade es Secreta) y la rareza de «Ocelote Del Templo» LPE 2023

El dueño corrigió la 73ª iteración: el aro morado que se había asignado a
`data-rarity="secreta"` en realidad corresponde a **Promocional**, y el aro
verde jade (que antes vivía en un slug provisional `secreta-jade` sin usar)
es el que corresponde a **Secreta**. De paso reportó que su carta física
«Templo del Ocelote» debería verse con el aro verde y no lo hacía.

- **`css/styles.css`**: `.holo[data-rarity="secreta"]` pasa a la rampa
  verde jade (`#08321f·#126b45·#1ea87a·#6ff0bd`); se reemplaza el slug sin
  usar `secreta-jade` por `.holo[data-rarity="promocional"]` con la rampa
  morada que antes tenía "secreta" (`#2a1454·#5b2bb0·#8a5cf0·#2f6dd8`).
- **`js/app.js`**: `RARITY_SLUG` se actualiza igual — quita `"secreta
  jade"` (nunca fue un nombre de rareza real en los datos, era una
  suposición) y agrega `"promocional": "promocional"`.
- **Bug de datos encontrado al investigar**: ninguna carta "Ocelote Del
  Templo" en el catálogo tenía rareza Secreta — hay versiones Real,
  Vasallo y una Legendaria en Leyendas PE 4.0, pero ninguna Secreta. El
  dueño identificó la física exacta: **LPE 2023, id `112-326`**, que ya
  traía `specialId: "Secreta Exclusiva 3"` (TOR la reconoce como una
  Secreta numerada) pero se había quedado con `rarity: "Real"` sin
  actualizar — una contradicción dentro de los propios datos de TOR, no
  un problema de esta app. Corrección agregada a
  `RARITY_CORRECTIONS` en `scraper/corrections.js` (mismo patrón que Mary
  Bradbury/Sacrificio Humano/Pachamama) y parche directo en
  `data/cards.json` para que se vea de inmediato en el sitio.
- Verificado con Playwright: `data/cards.json` ya sirve `rarity:"Secreta"`
  para `112-326`, y su ficha muestra el aro verde jade
  (`#ficha-holo[data-rarity="secreta"]`). 0 `pageerror`.

### 2026-09-16 (73ª iteración) — Marco holográfico de rareza en el arte de la ficha y el modal

El dueño mandó una spec detallada (pantallas 3b/3a/2e del handoff) para
envolver el arte de la carta en un aro de 1px que gira, coloreado según la
rareza, con un halo difuminado hacia fuera.

- **CSS nuevo (`css/styles.css`, al final del archivo)**: clase `.holo`
  (contorno + halo) usando `@property --holo-a` (ángulo animable con
  `@keyframes holo-spin`, 12s lineal infinito) sobre un `conic-gradient` de
  4 colores por rareza (`--holo-1..4`, en orden 1·2·3·4·3·2·1 para que el
  giro no muestre costura). Siete rampas: Vasallo (azul/celeste/cian),
  Cortesano (vino/rojo), Real (dorado/amarillo/limón), Mega Real (aura
  blanca), Ultra Real (grafito/gris), Secreta (morado/zafiro), Secreta
  Jade (verde/esmeralda, nombre provisional). Rareza sin rampa propia
  (Milenaria, Set Paralelo, Promocional, Ficha, Legendaria) cae al
  degradado de acento del sistema por defecto — no se inventó un color
  para esas. `.holo-lg` es la variante del modal (radio 12/11px en vez de
  11/10, ya que ahí el arte ya usaba un radio distinto). Respeta
  `prefers-reduced-motion: reduce` (aro estático, mismo color).
- **`js/app.js`**: `raritySlug(rarity)` normaliza el nombre de rareza
  (minúsculas, sin tildes) contra un mapa fijo a los 7 slugs del CSS;
  cualquier rareza no mapeada devuelve `""` y cae al fallback de acento a
  propósito. Se aplica en `renderFicha()` (Catálogo), `renderDeckFicha()`
  (Mazos) y `openModal()` (modal de detalle) — las tres seguían un patrón
  encontrado durante la exploración: el div del arte reasignaba
  `className` completo en cada render (`"ficha-art" + (owned ? " owned" :
  "")`), así que había que sumarle `holo-art` ahí también o se perdía en
  cada actualización.
- **`index.html`**: `#ficha-art` y `#deck-ficha-art` (que ya existían)
  ahora viven adentro de un `<div class="holo">` nuevo (`#ficha-holo` /
  `#deck-ficha-holo`) — mismo id de siempre para el contenido interior, así
  que no hubo que tocar el resto de `renderFicha`/`renderDeckFicha`. El
  modal arma su propio `.cd-image.holo.holo-lg` con `.holo-art` adentro en
  cada `openModal()`, ya que ahí el HTML se reconstruye entero de todas
  formas.
- El viejo `box-shadow` de borde fijo del arte (`0 0 0 1px rgba(181,171,
  252,.35)`) se quitó de `.ficha-art` y de `.cd-image img` en los tres
  lugares — el aro holográfico lo reemplaza. La sombra ambiental
  (`0 12px 30px rgba(0,0,0,.5)`) se conserva, ahora en `.holo`.
- **No** se aplicó a las miniaturas de la grilla del Catálogo, los
  estantes del Álbum ni las filas de la composición de Mazos — ahí la
  rareza ya se lee en el texto y el aro giratorio habría sido ruido
  visual a ese tamaño (mismo criterio que ya traía la spec).
- **Modo inventariar** (pantalla 2a) no existe todavía en la app — la
  spec lo menciona como aplicación opcional a futuro si esa vista llega a
  construirse; no había nada que tocar ahí en esta iteración.
- Verificado con Playwright: aro visible y coloreado distinto para
  Vasallo (azul), Real (dorado) y Secreta (morado) en la ficha del
  Catálogo, la ficha de Mazos y el modal de detalle; con
  `reducedMotion:'reduce'` el `animationName` computado pasa a `none`; 0
  `pageerror` ni warnings de `@property` en consola.

### 2026-09-16 (72ª iteración) — Rediseño completo de Mazos y Estadísticas según spec del handoff (pantallas 2e/2f)

El dueño mandó dos capturas del canvas de diseño original (Mazos y
Estadísticas, ya con datos de ejemplo) pidiendo que esas dos vistas se vieran
así, y a mitad de la implementación adjuntó además un documento de
especificación muy detallado (tokens, layout exacto, fórmulas de cada KPI,
comportamiento) para las dos pantallas. Se implementó siguiendo ese
documento, adaptando las cifras que no existían en el modelo de datos actual
a datos reales de la app (ver notas al final).

- **Mazos — «Mis mazos» (lista izquierda, 224px)**: cada fila pasa de una
  línea con badge Principal/Secundario a dos líneas: nombre + conteo total
  arriba, estado abajo con ícono — **en borrador** (menos de 50 cartas en
  total), **faltan N copias** (50 cartas pero no todas las copias en tu
  colección), o **completo**. El botón eliminar ahora solo aparece al pasar
  el mouse. "+ Nuevo mazo" pasa a contorno de acento (`.btn.primary`).
- **Mazos — cabecera**: kicker `FORMATO · N CARTAS` (formato inferido de las
  cartas del mazo, ya que un mazo no guarda uno propio), título grande con
  el nombre editable (ahora se ve como texto plano, con fondo solo al
  pasar el mouse o enfocar — no como un campo de formulario), línea de
  contexto con `Creado en {mes}` (nuevo `deck.createdAt`, con migración
  silenciosa: los mazos viejos sin esa fecha simplemente no muestran esa
  parte) y `última vez editado hace N días`. Los tres botones de exportar
  (Excel/Imagen/Texto) se agrupan en un dropdown "Exportar"; se suma
  "Añadir cartas" que enfoca el buscador de la pestaña Cartas.
- **Mazos — fila de 4 KPI** (arriba, visible sin importar la pestaña activa):
  Cartas del mazo (con el desglose aliados/talismanes/oros), Armado (copias
  que ya tienes de las que pide el mazo, %), Te faltan (destacada con fondo
  de acento cuando hay faltantes; el subtexto "N en tus repetidas" cruza las
  copias que faltan con lo que ya marcaste para cambio de esa misma carta,
  `Math.min(faltante, store.getTradeQty)`), Coste medio (de los Aliados,
  ya existía en `computeDeckStrategy`).
- **Mazos — composición**: las tarjetas de imagen (`deckCardTileHtml`) se
  reemplazan por filas tipo lista (`deckCardRowHtml`): miniatura 26×36,
  nombre + "×N · tienes M", cantidad a la derecha. Ya no tienen +/- propio
  — la cantidad se edita desde la ficha (ver abajo). Fila en gris/acento si
  falta esa copia. Los grupos se renombran: "Apoyo" → **Talismanes y
  armas**, y Monumento se pasa del grupo "Otro" al de Oro → **Oros y
  monumentos** (`deckZoneOf`).
- **Mazos — ficha fija nueva** (columna derecha, 318px): hasta ahora Mazos
  solo tenía el modal de detalle; se construyó una ficha fija paralela a la
  del Catálogo (mismo componente CSS `.ficha-panel`, HTML e ids propios
  `#deck-ficha-*`, estado `state.deckSelectedCardId`/`deckFichaNavList`
  independiente de `state.selectedCardId` del Catálogo). Clic en una fila
  la selecciona; el stepper "En este mazo" edita la cantidad EN EL MAZO
  (`store.deckSetQty`, función nueva) en vez del inventario; los metadatos
  muestran Copias que tienes / En otros mazos / Repetidas libres
  (`store.getAvailableQty`) / Precio ref.; las acciones son Quitar del mazo,
  En catálogo (cambia a la vista Catálogo, limpia filtros, busca la carta
  por nombre y la deja seleccionada en su propia ficha — `jumpToCatalogCard`)
  y Ofrecer. `← → ↑ ↓ 0-9 Espacio Esc` funcionan igual que en el Catálogo,
  pero solo cuando `state.view === "mazos"`.
- **Estadísticas — cabecera**: pasa de "Mostrar"/"Formato" con etiquetas a
  tres selects sin etiqueta (`Todo el catálogo` con tinte de acento fijo,
  `Formato: todos`, `Edición: todas` — filtro nuevo, reutiliza
  `fillEditionSelect` que ya usaba el Catálogo) + Exportar PDF.
- **Estadísticas — anillo de progreso + 6 KPI**: la tarjeta de progreso
  ahora es un anillo SVG (`stroke-dasharray` calculado sobre una
  circunferencia de r=46) con degradado de fondo, junto a 6 tarjetas:
  Cartas distintas, Copias totales, Ediciones completas (destacada),
  Cartas propias (`card.userCustom` + `store.getCustomEditions().length`,
  dato real que antes no se mostraba en ningún lado), Repetidas, y Valor
  estimado (mismo cálculo que "Valor potencial" de Cambio y Ventas, pero
  sobre toda la colección poseída, no solo lo ofrecido).
- **Estadísticas — gráficos**: los 6 `<canvas>` de Chart.js (Progreso,
  Por formato, Por tipo, Top razas, Curva de coste, Por rareza) se
  reemplazan por 2 gráficos de barras CSS puras (sin librería externa):
  Curva de coste y Por tipo, ambos siempre sobre **lo que tienes**
  (independiente del selector "Alcance" — mostrar miles de cartas del
  catálogo bajo el título "cartas que tienes" habría sido confuso; se
  probó así y se corrigió antes de este commit). `js/charts.js` sigue
  existiendo tal cual para los 3 gráficos propios de la pestaña
  Estadística de cada mazo (no tocados, el handoff no los menciona).
- **Estadísticas — Progreso por edición**: pasa de una lista de una
  columna a una grilla de 2 columnas con barras más finas; ≥70% se ve en
  degradado de acento. Clic en una fila lleva a esa edición en Álbum
  (`jumpToAlbumEdition`: busca una colección que ya la siga, o crea una de
  un clic si no existe ninguna).
- **Bug real corregido de paso**: `.ficha-nav-btn`/`.ficha-step-btn` ya se
  habían arreglado en la 71ª — esta vez el mismo componente se reutilizó
  íntegro para la ficha de Mazos, así que hereda el arreglo automáticamente.
- **`.stat-card` se unifica en toda la app**: pasa de número en acento-300
  a 28px, a número en color de texto normal a 22px (con `.highlight` para
  la tarjeta destacada) — mismo look en Cambios, Estadísticas y las dos
  filas de KPI de Mazos. Nueva variante `statCard3()` (etiqueta arriba,
  cifra, subtexto abajo) para las tarjetas de 3 líneas de estas dos vistas,
  sin tocar `statCard()` (2 líneas) que siguen usando Cambios y la pestaña
  Estadística del mazo.
- **Adaptaciones honestas** (el mockup traía datos de ejemplo, no todos con
  equivalente real en la app): "legal en Primer Bloque" del KPI Coste medio
  se cambió por "de tus Aliados" (la app no valida legalidad de mazo por
  formato); "Marcadas este mes +18%" se reemplazó por "Repetidas" (no hay
  historial de cambios de cantidad con fecha para calcular una tendencia
  mensual); "de 12 ediciones seguidas" se cambió por el conteo real de
  ediciones dentro del filtro activo (no existe un concepto de "edición
  seguida" separado de las colecciones de Álbum).
- Verificado con Playwright de punta a punta: creación/eliminación de
  mazos, cambio entre las 3 pestañas del mazo, selección de carta en la
  ficha nueva, quitar carta del mazo desde la ficha, salto a Álbum desde
  Estadísticas, vista móvil (390px, todo se apila y las tarjetas de KPI
  pasan a 2 columnas). 0 `pageerror` en todas las pruebas. Se revisó
  también Catálogo y Cambio y Ventas para confirmar que los cambios
  compartidos (`.stat-card`, `FMT_NAMES`, quitar `renderCharts` del import)
  no rompieron nada.

### 2026-09-16 (71ª iteración) — Rediseña Estadísticas al estilo Nocturne, reemplaza el panel lateral de Cambio y Ventas por una barra de estadísticas arriba de la lista, corrige botones de la ficha sin estilo

El dueño mandó 3 capturas anotadas: el panel lateral de Cambio y Ventas
(descripción + resumen en prosa) circulado para eliminar, los botones
de navegación y +/− de la ficha fija circulados porque se ven como
cajas blancas sin ningún estilo, y una captura de referencia del
handoff de diseño original (pantalla "Cambio y ventas" del mockup) que
muestra 4 tarjetas de estadística (Repetidas/Ofrecidas/Cambios
hechos/Vendido este año) en una barra arriba del listado, no en un
panel lateral.

- **Bug real encontrado**: `.ficha-nav-btn` y `.ficha-step-btn` (los
  botones ← → ⤢ de "Carta elegida" y −/+ de "Copias que tienes") nunca
  tuvieron `background: transparent` en su regla base — a diferencia
  de todos los demás botones "contorno" de la app (`.qty-btn`,
  `.chip-select`, `.btn`, etc.), que sí lo declaran explícitamente. Sin
  eso, el navegador les aplica su estilo nativo de `<button>` (caja
  gris/blanca con relieve), que es exactamente lo que se veía en la
  captura. Se agregó `background: transparent` a ambas reglas.
- **Cambio y Ventas — quita el `<aside class="filters">` de siempre**
  (título + párrafo explicativo + resumen en prosa "Valor potencial de
  venta…") y lo reemplaza por `#trade-stats`, una fila de 4
  `.stat-card` (el mismo componente que ya usa Estadísticas, reutilizado
  para que ambas vistas se vean como parte del mismo sistema) **arriba**
  de "Ofrecer una carta" y de la lista, como en la referencia:
  - **Ofrecidas**: copias totales ofrecidas, con cuántas cartas
    distintas son.
  - **Valor potencial**: suma de `Mi valor` (o precio de referencia
    como respaldo) de las copias ofrecidas, con cuántas están sin
    valorar.
  - **Cambios hechos**: tamaño del historial de intercambios
    (`store.getTradeLog()`), con la fecha del último.
  - **Vendido este año**: suma de precios del historial de ventas
    (`store.getSaleLog()`) filtrado al año en curso, con cuántas ventas.
  Las funciones viejas `renderTradeValue()` + el `textContent` de
  `#trade-summary` se reemplazan por una sola `renderTradeStats()`. La
  vista pasa a ser una sola columna a ancho completo (como ya pasó con
  el Catálogo en la 68ª iteración), sin el aside de 260px.
- **Estadísticas al estilo Nocturne**: `.stat-card`/`.chart-card`
  tenían `border: 1px solid var(--border)` (caja dura, centrada) desde
  antes del rediseño — se cambiaron a `box-shadow: inset 0 0 0 1px
  var(--border)` (mismo patrón "contorno" del resto de componentes) con
  texto alineado a la izquierda y números en `--accent-300`. Los
  `<select>` de "Mostrar"/"Formato" (`.stats-toolbar`) pasan del
  `<select>` con borde sólido genérico al mismo tratamiento que
  `.trade-filter-select` (sin borde, `box-shadow` inset, fondo
  `--bg-3`). La disposición ya tenía las tarjetas de estadísticas
  arriba de los gráficos (no se tocó el orden, ya cumplía "arriba de
  las cartas").
- Se eliminó el CSS ya sin uso `.trade-value`/`.tv-note`.
- Verificado con Playwright: se sembraron datos de prueba (cantidades,
  intercambios y ventas) vía `store.js` para confirmar que las 4
  tarjetas nuevas calculan bien con datos reales, en desktop y en
  380px de ancho (las tarjetas se apilan 2×2). 0 `pageerror`.
- **Sigue pendiente**: las tarjetas de carta dentro de un mazo
  (`deckCardTileHtml()`), Colecciones/Álbum y Modo Inventariar. Los
  gráficos de Chart.js en sí (colores/rejilla) no se tocaron — solo los
  contenedores; no hubo queja puntual sobre los gráficos mismos.

### 2026-09-16 (70ª iteración) — Pulido del rediseño Nocturne: botones "contorno", quita todos los emojis, corrige chips y sync-chip desbordados

El dueño mandó 4 capturas anotadas señalando que el rediseño Nocturne
todavía no estaba terminado: botones sin el estilo "contorno" del resto
de la app, uso de emojis en vez de iconos, el chip "Edición" del
Catálogo desproporcionadamente ancho, y el texto de estado de
sincronización desbordándose fuera del rail colapsado.

- **`.btn` ahora es "contorno, nunca relleno"** (`css/styles.css`):
  antes tenía fondo sólido (`--bg-3`) y borde de 1px — se cambió a
  fondo transparente + `box-shadow: inset 0 0 0 1px var(--border-strong)`,
  igual que `.chip-select`/`.ficha-btn`/`.tag`. `.btn.primary` pasa de
  relleno de acento a contorno de acento (texto y borde `--accent`,
  fondo `--accent-tint-soft` al hover) — mismo tratamiento que
  `.ficha-btn.outline`. Afecta todos los botones de la app (Ediciones,
  Importar, Exportar, Carta manual, Guardar/Conectar/Sincronizar del
  modal de nube, Excel/Imagen/Texto de Mazos, etc.) sin tocar el HTML.
- **Barrida completa de emojis** en `index.html` y `js/app.js`:
  reemplazados por iconos Phosphor (`<i class="ph ph-...">`) donde el
  botón necesitaba una señal visual (➕→`ph-plus`, 📊→`ph-file-xls`,
  📄→`ph-file-pdf`, 🗑→`ph-trash`, ✏️→`ph-pencil-simple`, ☁️→`ph-cloud`,
  💾→`ph-cloud-arrow-up`, ⬇️→`ph-cloud-arrow-down`, 🔗→`ph-link`,
  📜→`ph-clock-counter-clockwise`, ⛔→`ph-prohibit`, 🃏→`ph-stack`,
  🛡️/✨/🪙→`ph-shield`/`ph-sparkle`/`ph-coin`, etc.) y quitados sin
  reemplazo donde eran puramente decorativos dentro de texto plano
  (toasts, notas, placeholders). Se dejaron intactos los glifos
  tipográficos que no son emoji y ya se usaban como iconografía
  funcional propia del diseño (✓/✗ de validación, ←/→/‹/›/↑/↓ de
  navegación y atajos de teclado, ×  de cerrar modal): no son "emotes",
  son parte del lenguaje visual que el propio handoff ya define. El
  emoji del texto del chip de sincronización (`☁ Sincronizado`, etc. en
  `setChip()`) también se quitó — el rail ya muestra el icono de nube
  por separado en `#open-sync`, era una señal duplicada.
- **`.chip-select` desproporcionado**: no tenía `max-width` ni
  `text-overflow`, así que un `<select>` con una opción larga (nombre
  de edición) estiraba la píldora entera. Se le agregó
  `max-width: 150px; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap` (+ `padding-right` para la flecha nativa),
  mismo criterio que ya usa `#f-sort`.
- **`.sync-chip` desbordado en el rail colapsado**: había **dos**
  reglas `.sync-chip` en `css/styles.css` — una del rail nuevo (con
  `max-width:60px`) y otra vieja, sin usar desde que el topbar se
  reemplazó por el rail, que pisaba `font-size`/`white-space` sin
  `overflow:hidden` ni `text-overflow`. El texto (p. ej.
  "Sincronizado") se salía del rail de 68px porque nada lo recortaba.
  Se eliminó la regla vieja duplicada y se le agregó
  `overflow:hidden; text-overflow:ellipsis` a la única regla que queda.
- Verificado con Playwright (desktop, rail colapsado/expandido, modal
  de sincronización, formulario de carta manual, vista móvil 390px):
  0 `pageerror`, sin emojis visibles, chips y sync-chip contenidos
  dentro de sus cajas.
- **Sigue pendiente** (ya reconocido, no es parte de esta iteración):
  rediseño de Estadísticas (sigue con Chart.js y tarjetas planas),
  las tarjetas de carta dentro de un mazo (`deckCardTileHtml()`, todavía
  con el estilo antiguo, no el "arte primero" de `cardEl()`), el
  `<aside class="filters">` de Cambio y Ventas (todavía con el estilo
  pre-Nocturne), Colecciones/Álbum y Modo Inventariar.

### 2026-09-16 (69ª iteración) — Reemplaza el logo por el oficial de Mitos y Leyendas

- El dueño pidió cambiar el logo por
  https://static.wikia.nocookie.net/myl-tcg/images/f/f4/Myl-logo1-sf.png
  (el logo oficial del juego, dragón verde + wordmark). Se descargó
  (el archivo real es WebP pese al nombre ".png" en la URL) y se
  guardó local como `assets/myl-logo.png`, sin hotlinkear — mismo
  criterio que ya usa el resto de la app para imágenes externas.
- Reemplaza al `assets/logo.jpg` anterior (que en realidad era el
  dorso genérico de una carta, no el logo del juego) en las tres
  partes donde aparecía: el ícono de la barra del navegador (`<link
  rel="icon">`), el logo del rail de navegación, y el que se incrusta
  en los PDF/Excel exportados (`js/exporters.js`).
- El logo nuevo tiene fondo transparente; como la exportación lo
  incrusta como JPEG (que no soporta transparencia), se agregó un
  relleno blanco de fondo antes de convertirlo — si no, la
  transparencia se habría visto negra en los documentos exportados
  (que son blancos).
- Verificado con Playwright: se ve bien tanto en el rail colapsado
  como expandido, sin errores de consola.

### 2026-09-16 (68ª iteración) — Rediseño Nocturne: corrige tipografía inconsistente, tarjetas más chicas, filtros del Catálogo como chips horizontales

- El dueño mandó capturas comparando el Catálogo ya desplegado contra
  la pantalla `1a` (Vitrina) del handoff de diseño y marcó tres cosas:
  la tipografía no es la misma en todos los elementos, las tarjetas de
  la grilla deberían ser más chicas para que se vea armónica, y la
  barra de filtros lateral no funciona — debería ser una fila de chips
  horizontales como en `1a`, no un panel vertical que come 260px de
  ancho todo el tiempo.
- **Tipografía**: `<select>`, `<input>`, `<textarea>` y `<button>` no
  heredan `font-family` del body por defecto en la mayoría de los
  navegadores (usan la fuente del sistema aunque `--font: Inter` esté
  bien definido en `:root`) — se agregó `font-family: inherit` a esos
  elementos globalmente. Esto es lo que hacía que los `<select>` de
  filtros, formularios y modales se vieran con una tipografía
  distinta al resto de la app.
- **Tarjetas más chicas**: `.cards-grid` bajó de `minmax(148px,1fr)` a
  `minmax(122px,1fr)` (gap 13→11px) — caben más columnas y la grilla
  se ve más densa, más parecida a la referencia.
- **Filtros del Catálogo como chips**: se sacó el `<aside class="filters">`
  vertical de `#view-coleccion` (index.html) — Formato/Edición/Raza/
  Tipo/Rareza pasan a `<select class="chip-select">` compactos (alto
  29px, radio 99px) en una fila horizontal (`.filter-chip-row`) arriba
  de la grilla, junto a las píldoras de inventario que ya existían y
  el filtro de Coste máximo (ahora un chip con el slider adentro).
  Los placeholders de cada `<select>` pasaron de "Todas"/"Todos" al
  nombre de la categoría ("Formato", "Edición"...) para que el chip
  sin seleccionar muestre de qué filtro se trata. Solo se cambió el
  Catálogo — Colecciones/Cambio y Ventas/Mazos siguen con su panel
  lateral de siempre hasta que les toque su propia pasada de rediseño.
  Al quitar los 260px del panel, la grilla y la Ficha fija ganaron
  todo ese espacio.
- Verificado con Playwright: filtro aplicado y "Limpiar" funcionan
  igual que antes, selección de carta actualiza la ficha, chips se
  acomodan en varias líneas en móvil (390px) sin romperse. 0
  `pageerror`.

### 2026-09-16 (67ª iteración) — Cambio y Ventas: filtros combinables por edición/raza/tipo + orden ascendente/descendente

- Este es el pedido FUNCIONAL original del dueño (de antes del handoff
  de diseño Nocturne): poder filtrar lo ofrecido en Cambio y Ventas
  por varias características a la vez, y ordenar ascendente/
  descendente, alfabético, por tipo, por raza, por edición.
- Se sumaron tres selectores nuevos (`#trade-edition`, `#trade-race`,
  `#trade-type`) junto al de rareza que ya existía (iteración 58),
  todos combinables entre sí (AND) — mismo patrón que ya usa el
  Catálogo (`baseFilteredCards()`): cada selector calcula sus opciones
  desde lo ofrecido ANTES de aplicar los demás filtros, así ninguno se
  autorrestringe.
- Nuevo selector de orden `#trade-sort` (10 opciones, etiquetas con la
  dirección ya incluida — mismo patrón que `#f-sort` del Catálogo y
  `#deck-sort` de Mazos): "Rareza (más pro/básica primero)" mantiene
  el agrupado en secciones de siempre; el resto (nombre/edición/raza/
  tipo, A→Z o Z→A) muestra una lista plana sin encabezados.
- `updateTradeRarityFilter()` se generalizó en `updateTradeFilterSelect()`
  para no duplicar la lógica cuatro veces; `renderTradeList()` aplica
  los filtros en cadena y elige agrupado o plano según el modo de orden.
- Verificado con Playwright: 10 cartas ofrecidas, filtro por tipo deja
  solo las que corresponden, orden por nombre quita los encabezados de
  rareza, combinaciones de filtros se intersectan correctamente. 0
  `pageerror`.

### 2026-09-16 (66ª iteración) — Rediseño "Nocturne" (parte 3/N): modal de detalle de carta

- Tercera etapa del rediseño (ver 64ª/65ª). Solo retoque visual — el
  modal de detalle (`openModal()` en `js/app.js`) conserva toda su
  lógica (stepper de cantidad, disponible para cambio, editar/
  eliminar carta manual, detalle ampliado desde `api.myl.cl`) tal
  cual; solo cambió `css/styles.css`: fondo del backdrop más oscuro
  (`rgba(10,11,20,.72)`), la caja del modal con la paleta y sombra
  Nocturne, las etiquetas (`.tag`) pasan a contorno con la primera
  (edición) destacada con tinte de acento, y los botones de navegación/
  cerrar con el mismo lenguaje visual que el resto de la app. Como
  `.qty-btn` ya se había actualizado en la 65ª iteración, los steppers
  del modal heredaron el estilo nuevo automáticamente sin tocarlos.
- Verificado con Playwright (doble clic en una carta de la grilla abre
  el modal): sin errores de consola.

### 2026-09-16 (65ª iteración) — Rediseño "Nocturne" (parte 2/N): tarjeta "arte primero" + Ficha fija + cantidad editable sin modal

- Segunda etapa del rediseño (ver 64ª). Cubre el Catálogo, la pantalla
  principal del handoff (`3a`), y de paso resuelve el pedido original
  del dueño de poder editar la cantidad directamente sobre el dato, sin
  ventana flotante.
- **Tarjeta "arte primero"** (`cardEl()` en `js/app.js`, CSS en
  `css/styles.css`): el nombre, tipo y rareza ahora se leen superpuestos
  sobre la imagen de la carta (velo de degradado abajo para legibilidad),
  con píldoras de coste/fuerza y número de carta en las esquinas
  superiores y un badge de cantidad (acento) arriba a la derecha cuando
  `qty>0`. Se corrigió en el camino un choque real: el badge de coste y
  el de cantidad compartían la misma esquina y se superponían cuando
  ambos existían a la vez — el de cantidad ahora baja una fila si ya
  hay un badge de coste ahí.
- **Regla de posesión global**: lo que no tienes se ve sin color
  (`grayscale(1) brightness(.68)`) en toda la grilla, no solo en
  Colecciones como antes — se generalizó la regla que ya existía ahí
  (antes escondida detrás de `.collection-grid`) para que aplique a
  cualquier `.card`, tal como pide el sistema de diseño.
- **Cantidad editable sin modal**: el número de copias en la tarjeta
  pasa de `<span>` a `<input type="number">` — se puede escribir
  directamente (ej. "12") además de usar los botones +/−, sin abrir
  nada. Mismo criterio pedido para "Mi valor" en Cambio y Ventas, que
  ya no usa modal desde una iteración anterior; esto lo extiende a la
  cantidad en Catálogo/Colecciones/Mazos.
- **Ficha fija** (`#ficha-panel`, nuevo, solo en Catálogo/`#view-coleccion`):
  panel de 318px a la derecha con la carta elegida — un click en la
  grilla la selecciona y actualiza la ficha (ya no abre el modal de
  detalle directo; eso queda para doble clic, el botón de expandir, o
  la tecla Espacio). Muestra el arte grande, stepper de cantidad,
  habilidad completa, y una rejilla de metadatos (en tus mazos,
  repetidas, precio de referencia, estado en la ban list). Se oculta
  en pantallas angostas (`≤1100px`) — no hay ficha en móvil, solo el
  modal de siempre.
- **Atajos de teclado** (Catálogo, con una carta elegida y sin escribir
  en ningún campo): `← →` recorre la grilla, `↑ ↓` suma/resta una
  copia, `0–9` fija la cantidad exacta, `Espacio` abre el detalle a
  pantalla completa.
- La cantidad se mantiene sincronizada en los tres lugares donde puede
  aparecer a la vez (tarjeta de la grilla, badge de cantidad, ficha)
  sin necesidad de recargar ni re-renderizar toda la grilla.
- Verificado con Playwright: selección por click, navegación por
  teclado, edición directa del input de cantidad, sincronización
  grilla↔ficha, badges sin superponerse, ficha oculta bajo 1100px,
  Colecciones/Mazos/Cambio y Ventas/Estadísticas siguen funcionando
  (comparten `cardEl()` sin romperse). 0 `pageerror`.
- **Pendiente**: modal de detalle, Colecciones con reordenar por
  arrastre, Cambio y Ventas (KPIs + filtros/orden combinables), Mazos,
  Estadísticas con SVG propio, Modo Inventariar.

### 2026-09-16 (64ª iteración) — Rediseño "Nocturne" (parte 1/N): tokens de diseño + rail de navegación

- El dueño pidió reestructurar completamente el diseño del sitio: menú
  lateral izquierdo colapsable, edición en línea sin ventanas
  flotantes y filtros/orden combinables en Cambio y Ventas. A mitad de
  planificarlo con el patrón visual ya existente de la app, adjuntó un
  handoff de diseño real (`Inventario MyL.dc.html` + `README.md`, del
  sistema de diseño **Nocturne**) y pidió implementar ESE en vez del
  plan propio — un rediseño completo de las 7 vistas más dos pantallas
  nuevas (Modo Inventariar, Ficha fija). Es un trabajo grande; se
  aborda en iteraciones sucesivas, empezando por la base que usan
  todas las pantallas.
- **Tokens de diseño** (`css/styles.css`, bloque `:root`): reemplazados
  por la paleta Nocturne exacta del handoff (`--bg: #161826`,
  `--bg-2`/`--bg-3`/`--rail`, `--border`/`--border-strong`,
  `--text`/`--text-70`/`--muted`/`--text-45`, tokens de acento con tinte
  — `--accent-tint`, `--accent-300`, `--accent-700` —, degradados de
  cintillo `--section-a`/`--section-b`). El acento (`#9184d9`/`#b5abfc`)
  ya era el mismo que se eligió en una iteración anterior (violeta), así
  que no cambia. **Se mantuvieron los NOMBRES de variable existentes**
  (`--bg`, `--accent`, etc.) en vez de introducir nombres nuevos — así
  todo el CSS que todavía no se ha re-diseñado (Colecciones, Mazos,
  Estadísticas, modales) hereda la paleta nueva automáticamente sin
  tocar cada regla una por una.
- Tipografía: Inter (Google Fonts) reemplaza la fuente del sistema,
  peso máximo 500 en toda la UI (nunca bold), según especifica el
  sistema Nocturne.
- **Rail de navegación** (`index.html`, `css/styles.css`, `js/app.js`):
  la barra horizontal de pestañas del header se reemplaza por una
  barra vertical de iconos a la izquierda (68px, Phosphor Icons),
  colapsable/expandible con un botón propio — el estado se persiste en
  `store.getSetting("railExpanded")`/`setSetting`, mismo mecanismo que
  ya usa el tema oscuro/claro (`applyTheme`). Los botones siguen
  siendo los mismos `<button class="tab" data-view="...">` de antes
  (`switchView()` no cambió nada), así que no se tocó la lógica de
  navegación, solo dónde y cómo se ven. En pantallas angostas (≤760px)
  el rail se convierte en una barra inferior fija de 5 destinos.
- **Iconos Phosphor**: se autohospedan en `assets/phosphor/` (CSS +
  woff2, ~430KB) en vez de cargarlos desde un CDN — así el sitio no
  depende de un tercero para algo tan visible como la navegación, y
  sigue funcionando si `unpkg`/`jsdelivr` están caídos o bloqueados
  (recomendación explícita del propio handoff de diseño).
- Verificado con Playwright: navegación entre las 5 vistas, colapsar/
  expandir + persistencia tras recargar, barra inferior en viewport
  móvil (390px), 0 `pageerror`. Colecciones/Mazos/Estadísticas siguen
  funcionando igual (su contenido interno todavía no se rediseñó, eso
  viene en las siguientes iteraciones).
- **Pendiente** (próximas iteraciones): tarjeta de carta "arte
  primero" + panel de Ficha fija en Catálogo, modal de detalle,
  Colecciones con reordenar por arrastre, Cambio y Ventas con sus
  filtros/orden combinables, Mazos, Estadísticas con gráficos SVG
  propios, y el Modo Inventariar nuevo.

### 2026-09-16 (63ª iteración) — Corrige "Pachamama" (Leyendas PE #070): también Mega Real → Real

- Mismo patrón que "Sacrificio Humano" (edid 071, iteración 62): el
  dueño reportó que su carta física tampoco es Mega Real. Se preguntó
  la rareza real (no hay foto propia de esta carta para leerla
  directo) — confirmó **Real**. Se intentó cruzar contra el wiki antes
  de preguntar, pero "Leyendas PE" (`leyendas_primera_era` en TOR) no
  tiene una página de listado identificable con certeza en
  myl.fandom.com (las páginas "Leyendas - Primera Era" y "... 2.0" que
  existen no traen estas cartas), así que se confía en el reporte
  directo del dueño, igual que con Sacrificio Humano.
- Sumada a `RARITY_CORRECTIONS` en `scraper/corrections.js` (id
  "154-070") y parcheada en `data/cards.json`.
- **Dos de dos cartas revisadas de esta edición han salido con la
  misma rareza mal cargada** (Mega Real cuando no correspondía) — vale
  la pena que el dueño avise si encuentra más en "Leyendas PE"
  específicamente, puede ser un problema más extendido en esta
  edición y no solo estas dos cartas sueltas.

### 2026-09-16 (62ª iteración) — Corrige "Mary Bradbury" (LPE4 #118) y "Sacrificio Humano" (Leyendas PE #071)

- **"Mary Bradbury"** (Leyendas - Primera Era 4.0 #118, `custom-cards.json`):
  el dueño aclaró que su carta física es la versión NORMAL, no la
  Promocional (que también existe para esta edición, pero es una carta
  distinta). El catálogo tenía esta entrada marcada como "Promocional".
  Se re-examinó la foto guardada — el código estaba tapado por un
  adorno del borde, por eso quedó sin verificar en la auditoría de la
  60ª iteración — con más contraste se alcanza a leer la "R" final del
  código ("LPE4 - .../320 R"), y la tabla de listado del wiki también
  dice "Real" para el edid 118. Tres fuentes coincidiendo: rareza
  Promocional→**Real**.
- **"Sacrificio Humano"** (edición "Leyendas PE", no la versión Full
  Art de Kit de Juego, que es una edición aparte y ya está correcta):
  el dueño reportó que su carta física es Real, no Mega Real. Esta
  carta viene de la API oficial (`data/cards.json`, id "154-071"), no
  de una carga manual, así que no hay foto propia para contrastar —
  se aplicó directo el reporte del dueño sobre su carta física.
  **Primera corrección de rareza sobre datos de la API** en este
  proyecto: se agregó `RARITY_CORRECTIONS` a `scraper/corrections.js`
  (mismo mecanismo ya usado para nombres/imágenes/numeración mal
  traídos de TOR — sobrevive a que el scraper se vuelva a correr cada
  semana) y se parchó `data/cards.json` directo para que el sitio ya
  publicado refleje el cambio sin esperar la próxima corrida.

### 2026-09-16 (61ª iteración) — Corrige "Teepee" (Leyendas PE 4.0 #248): rareza, habilidad y sabor faltantes

- El dueño reportó que "Teepee" es un Oro pero su rareza (Real) no es
  la de su carta física.
- Confirmado contra la foto guardada
  (`data/custom-images/mylserena/leyendas_primera_era_4_0_248_teepee.jpg`,
  código impreso "LPE4-248/320 C"): rareza Real→**Cortesano**. La foto
  también reveló que `ability` y `flavour` estaban vacíos en el
  catálogo pese a que la carta sí tiene texto de habilidad ("Si este
  Oro está en tu Reserva de Oros, puedes barajarlo en tu Mazo Castillo
  para desterrar la primera carta del Mazo Castillo oponente. Luego,
  puedes robar 1 carta.") y de sabor — se completaron ambos.
- **Punto ciego real de la auditoría automática de la 60ª iteración**:
  esta carta NO apareció en el reporte de discrepancias porque la
  tabla de listado del wiki también dice "Real" para el edid 248 — el
  wiki y el catálogo coincidían, ambos mal, así que no había nada que
  diferenciar automáticamente. Un diff contra el wiki solo encuentra
  desacuerdos ENTRE dos fuentes; cuando las dos fuentes comparten el
  mismo error, solo se detecta revisando la carta física directamente,
  como hizo el dueño acá. Vale la pena que siga reportando casos así
  aunque la auditoría automática los haya dado por buenos.

### 2026-09-16 (60ª iteración) — Corrige 72 rarezas más de Leyendas PE 4.0, confirmadas contra foto física

- Continuación directa de la 59ª: el dueño pidió corregir todo lo que
  se pudiera confirmar de la auditoría de rareza contra el wiki (ver
  el artefacto "Auditoría de Rareza" generado en esa iteración —
  169 ediciones revisadas, 65 verificables, 5.800 cartas cotejadas).
- De las 97 discrepancias en cartas cargadas a mano (principalmente
  Leyendas - Primera Era 4.0), **las 96 cartas distintas involucradas
  ya tenían foto física guardada** en `data/custom-images/`, así que
  se revisó el código impreso de cada una una por una (ej.
  "LPE4-17/320 UR") en vez de confiar ciegamente en el wiki — el
  mismo criterio que ya se usó con Tzitzimime/Ciudad de los Césares:
  la foto manda, no la fuente externa.
- **72 corregidas**: el código impreso confirmó el valor del wiki y no
  el que tenía el catálogo. Todas dentro de Leyendas - Primera Era 4.0
  (rango edid 017-351), un solo campo (`rarity`) por carta, sin tocar
  coste/fuerza/habilidad en esta pasada.
- **2 casos donde el wiki estaba mal, no el catálogo**: "Serpiente
  Emplumada" (edid 236) y "Peri Pillán" (edid 242) — el wiki decía
  Real, pero el código impreso en la foto dice claramente "C"
  (Cortesano), que es justo lo que ya tenía el catálogo. No se tocaron.
- **6 cartas con la imagen equivocada en disco** (no es un error de
  rareza — la foto guardada es literalmente de OTRA carta, mismo
  patrón que el caso Rapto de Idunn/Asaltar Santuario de la 49ª
  iteración, que sigue resuelto): "Horóscopo Chino" (071, la foto es
  de la carta #015 del mismo nombre), "Ocelote del Templo" (086, foto
  de la #011 del mismo nombre), "Knarr" (091, foto de un código fuera
  de rango 325/320), "Los Cinco Anillos" (096, foto de un código
  326/320), "Kuyén" (186, foto con código "CRPE4" de otro producto), y
  "Expulsión" de Mundos Perdidos - Horda Esteparia (foto con código
  "MPAT" — Mundos Perdidos Tombstone, edición distinta). Pendiente
  encontrar la foto correcta de cada una.
- **11 cartas del "Set Clásico" (SCLPE4-*) sin poder verificar**: esas
  fotos no imprimen la letra de rareza en el código (solo
  "SCLPE4-8/80", sin sufijo), a diferencia de la numeración principal
  — no hay cómo confirmar por esta vía. Quedan con el dato que ya
  tenían.
- **2 cartas con código ilegible en la foto** ("Mary Bradbury" #118,
  tapado por un adorno del borde; "Hamsa" #151, zona muy oscura):
  tampoco se tocaron.
- Aplicado directo en `data/custom-cards.json`, verificado que el
  cambio es exactamente 72 líneas de `rarity` (`git diff --stat`), sin
  tocar ningún otro campo.

### 2026-09-16 (59ª iteración) — Corrige "Dragón Rojo" (Leyendas PE 4.0 #109): rareza, coste, fuerza, raza, habilidad y sabor

- El dueño reportó que "Dragón Rojo" de Leyendas - Primera Era 4.0
  figuraba como Cortesano cuando su carta física es Real, y pidió
  revisar el resto del catálogo contra el wiki por si hay más
  inconsistencias.
- Se confirmó directo contra la foto física ya guardada
  (`data/custom-images/mylserena/leyendas_primera_era_4_0_109_dragon_rojo.jpg`,
  código impreso "LPE4 · 109/320 R"): no era solo la rareza. Coste 3→4,
  fuerza 2→4, raza Bestia→Dragón, y tanto la habilidad como el texto de
  sabor registrados correspondían a una carta completamente distinta
  (la habilidad tenía restos de plantilla de ícono del wiki sin
  limpiar, "...30px..." — señal de que se había copiado mal desde otra
  fuente). Único caso encontrado con ese patrón de "30px" corrupto en
  todo `custom-cards.json`, así que no es un problema sistemático de
  scraping, solo esta fila.
- A partir de este caso se armó una comparación automática de
  rareza/tipo contra el wiki para el resto del catálogo (ver iteración
  60) usando la API de MediaWiki en vez de renderizar las páginas
  (myl.fandom.com tiene protección Cloudflare que bloquea WebFetch y
  curl normal, pero `api.php?action=parse&prop=wikitext` no tiene ese
  bloqueo — mismo mecanismo que ya usa el skill
  `importar-edicion-myl-wiki`).

### 2026-09-15 (58ª iteración) — Filtro de rareza y secciones por rareza en Cambio y Ventas

- El dueño pidió poder filtrar lo ofrecido en Cambio y Ventas por
  rareza, que las cartas se ordenen de la rareza más alta a la más
  baja, y que se agrupen en secciones por rareza (pudiendo dejar
  visible solo una).
- Nuevo selector "Todas las rarezas" arriba de "Ofrecidas para cambio o
  venta" (`#trade-rarity`), con solo las rarezas que efectivamente hay
  entre lo ofrecido (no todo el catálogo) — igual que ya hacían las
  píldoras de inventario del Catálogo, las opciones se calculan ANTES
  de aplicar el propio filtro de rareza, para que no se autorrestrinjan
  al elegir una.
- `renderTradeList()` agrupa las cartas ofrecidas (ya filtradas por
  búsqueda y por el selector de rareza) en secciones con encabezado por
  rareza, ordenadas con el mismo `RARITY_ORDER` que ya se usaba para
  ordenar la Distribución de un mazo (acordado con el dueño el
  24-08-2026: rarezas especiales arriba, luego la escalera normal de
  Secreta a Vasallo). Dentro de cada sección, las cartas van por nombre.
  Se factorizó `rarityRank(card)` en un `rarityRankByName(nombre)` +
  `rarityCompare(a, b)` reusable para no duplicar la lógica de orden.
- Verificado con Playwright: las secciones aparecen en el orden
  correcto (Promocional → Secreta → Mega Real → Real → Vasallo en los
  datos de prueba), el selector solo lista rarezas presentes, y elegir
  una deja visible solo esa sección; sin `pageerror` en consola.

### 2026-09-15 (57ª iteración) — "Ofrecidas para cambio o venta" en formato lista

- El dueño mandó otra captura (vista "Mercado" de la misma plataforma de
  referencia, ahora la de escritorio) y pidió puntualmente que las
  cartas ofrecidas en Cambio y Ventas se vean en formato lista en vez
  de grilla de tarjetas, inspirado en esa captura.
- Se cambió solo la sección "Ofrecidas para cambio o venta" (no el
  Catálogo/Colecciones/Mazos, que siguen en grilla de tarjetas como
  siempre): cada carta ahora es una fila (`.trade-row`) con miniatura
  chica a la izquierda, nombre/edición/disponibilidad al centro, los
  controles de cantidad ofrecida, "Mi valor" + indicador de mercado y
  los botones Intercambiar/Vender alineados a la derecha — mismo
  patrón visual de una fila de mercado (nombre, precio, acción), con
  los tokens de color de siempre.
- `tradeCardEl()` (`js/app.js`) genera el nuevo marcado de fila en vez
  del `.card` de tarjeta; la lógica de cantidades, valor propio y
  botones no cambió, solo cómo se ve. En pantallas angostas la fila se
  acomoda en dos líneas (miniatura+nombre+cantidad arriba, valor y
  acciones abajo a ancho completo) en vez de recortarse.
- Verificado con Playwright en escritorio y en un viewport de celular
  (390px): las filas se arman bien, el indicador sobre/bajo mercado se
  ve correcto, y el acomodo en dos líneas en mobile no rompe el layout;
  sin `pageerror` en consola.

### 2026-09-15 (56ª iteración) — Retoque visual violeta + filtros como píldoras + link mágico para conectar el celular

- El dueño mandó 2 capturas de un mockup ("Plataforma TCG", sistema de
  diseño "Nocturne") hecho con Claude Design, más un bloque de
  instrucciones de exportación que hacía referencia a archivos
  (`Plataforma TCG.dc.html`, `_ds/nocturne-.../`, `support.js`,
  `chats/`) que **no existen** en este repositorio — se verificó con
  búsquedas en el filesystem antes de asumir nada. Se avisó al dueño y
  se trabajó solo a partir de las 2 capturas como referencia visual,
  sin inventar contenido de archivos que no estaban adjuntos.
- **Alcance acordado con el dueño** (vía preguntas): cambiar el color
  de acento a violeta como en las capturas, y resolver aparte el pedido
  de "que el inventario esté siempre conectado a Supabase, sin tener
  que loguearme o cargar el JSON cada vez que lo abro desde el
  celular" con un mecanismo de "link mágico por dispositivo".

**Parte A — Retoque visual (violeta + filtro de inventario como píldoras + indicador de repetidas)**

- `--accent` pasa de dorado (`#c9a13b`) a violeta (`#9184d9`);
  `--accent-2` de `#d9b85a` a `#b5abfc`. Se agregó `--on-accent:
  #16121f` (texto oscuro sobre fondo de acento) — **se verificó
  contraste WCAG con cálculo real de luminancia/ratio antes de
  decidir**: texto oscuro da 5.7:1 sobre el violeta (pasa AA), texto
  blanco solo 2.9:1 (no pasa). Reemplaza el `#1b1300` que estaba
  hardcodeado en 3 lugares (`.tab.active`, `.btn.primary`,
  `.badge-num.special`).
- El filtro "Inventario" del Catálogo (antes un `<select>` con
  "Todas/Que tengo/Me faltan/Duplicadas/Para cambio") ahora se ve como
  fila de píldoras clicables con el conteo de cartas al lado de cada
  una (ej. "Repetidas 12"). El `<select>` original sigue existiendo
  (oculto) como única fuente de verdad para `applyFilters()` y
  "Limpiar filtros" — las píldoras solo lo leen/escriben y disparan su
  evento `change`, sin duplicar lógica de filtrado. Los conteos salen
  de una función nueva `baseFilteredCards()` (los mismos filtros de
  siempre, menos el de inventario) para que cada píldora muestre cuántas
  cartas tendría si se selecciona, no solo la que está activa.
- Las cartas con 2+ copias ahora muestran el número de cantidad en
  violeta (`.qty-num.dup`) en vez del color neutro de siempre, para
  distinguir repetidas de un vistazo sin tener que aplicar el filtro.
- Catálogo, Colecciones, Cambio y Ventas y Mazos comparten los mismos
  tokens, así que el cambio de acento se ve en toda la app sin tocar
  `cardEl()`/`tradeCardEl()` ni el layout de las tarjetas.

**Parte B — Link mágico para autoconectar un dispositivo a Supabase**

- El dueño quiere entrar desde el celular y que ya esté todo
  sincronizado, sin escribir a mano la URL del proyecto, la clave
  anon y el código de colección cada vez. Se descartó "dejar las
  credenciales fijas en el código" porque la política de seguridad de
  la tabla (`inventario_myl`) es `for all using (true) with check
  (true)` — cualquiera con la clave anon pública Y el código de
  colección tiene lectura/escritura total; hornear la clave anon en un
  archivo público (GitHub Pages) sigue siendo razonable porque es la
  clave "anon" pensada para el cliente, pero el código de colección
  (`clave`) es lo que en la práctica protege los datos, así que no
  conviene dejarlo fijo para todo el mundo que visite el sitio.
- En vez de eso: nuevo botón **"🔗 Copiar link para este dispositivo"**
  en el panel de sincronización (solo visible/útil una vez que el
  dispositivo actual ya está conectado). Arma un link con la URL,
  clave anon y código de colección codificados en base64 dentro del
  fragmento `#sync=...` (el nombre del dispositivo queda fuera a
  propósito — cada aparato debe tener su propio nombre).
- Al abrir ese link en otro dispositivo (el celular), `js/app.js`
  detecta `#sync=` al iniciar, decodifica, llama a `cloud.setConfig()`
  y conecta automáticamente — mismo camino que el botón "Conectar y
  sincronizar" de siempre, ahora extraído a una función reusable
  `connectCloud()`. El fragmento se borra de la URL con
  `history.replaceState()` apenas se lee, antes de intentar conectar,
  para no dejar la clave más tiempo del necesario en el historial del
  navegador.
- Verificado con Playwright: el link generado decodifica correctamente
  a `{url, key, clave}`, al abrirlo en un contexto limpio el estado
  pasa de "Conectando…" a "Conexión lista" y el hash desaparece de la
  barra de direcciones; sin `pageerror` en consola.

### 2026-09-15 (55ª iteración) — "Mi valor" en Cambio y Ventas: precio propio + indicador sobre/bajo mercado

- El dueño pidió invertir el enfoque de precios: hasta ahora "Cambio y
  Ventas" mostraba como dato principal los precios scrapeados de
  mylserena/mesaredonda (`data/prices.json`). Ahora quiere ser él
  quien le ponga precio a cada carta que tiene, y que la app le
  indique si ese precio queda sobre o bajo el precio de referencia —
  en vez de solo mostrarle el scrapeado.
- El dueño también pegó un documento "Mercado — especificación alfa"
  como inspiración, pero aclaró explícitamente que es para una versión
  futura mucho más grande (multiusuario, trueques, pujas, sistema de
  diseño "Nocturne" con Inter/Phosphor) que **no aplica** a este
  inventario personal estático — solo se tomó la idea de fondo (dejar
  que el usuario asigne valor y verlo distinguido visualmente),
  adaptada a la arquitectura real de la app (mismo look and feel de
  siempre, sin backend multiusuario).
- **Alcance acordado con el dueño** (vía preguntas antes de programar):
  rediseño "retoque" (mismos tokens de color/tipografía, sin sistema
  nuevo) y el precio propio + indicador de mercado vive **solo en
  Cambio y Ventas** — Catálogo y Colecciones (que comparten `cardEl()`)
  quedan exactamente iguales, sin precio.
- Punto del pedido original sobre "buscar cartas repetidas": ya existe
  (filtro "Duplicadas (2+)" en `#f-ownership` del Catálogo) — no
  necesitó cambios, solo se le confirmó al dueño dónde está.
- **Dato nuevo** `myPrices: {cardId: CLP}` en `js/store.js`, mismo
  patrón mecánico que `trade` (mapa plano, getter/setter que llama
  `notify()`, `replaceMyPrices(obj, origin)` para sync entrante).
  Sumado a `getSnapshot()`/`applySnapshot()` → sincroniza solo con
  agregar el campo, sin tocar nada de Supabase (`cloud.js` sube/baja
  el snapshot completo como un blob JSONB). `migrateKeys()` también
  remapea `myPrices` cuando cambia el id estable de una carta, pero
  SIN sumar como hace con las cantidades (un precio no se "suma" al
  migrar; se conserva el que ya hubiera en el id nuevo si existía).
- **Lógica de comparación** (`myPriceInfo()` en `js/app.js`): compara
  `store.getMyPrice(id)` contra el precio de referencia (mylserena ??
  mesaredonda, mismo criterio que ya usaba el resto de la vista), con
  un margen de ±5% para "en línea con el mercado" (evita marcar como
  "distinto" una diferencia de un par de pesos).
- **`tradeCardEl()`**: la sección de precio cruda (`.trade-price`, dos
  números scrapeados) se reemplaza por "Mi valor" protagonista + botón
  editar (lápiz) o "Asignar valor" si no tiene, y debajo una píldora:
  "▲ Sobre mercado (+N%)" (rojo), "▼ Bajo mercado (−N%)" (verde), "≈ En
  línea con el mercado" (muted), o si no hay referencia scrapeada para
  esa carta, "Sin referencia de mercado"; si todavía no le puso valor
  pero sí hay referencia, se la muestra como pista ("Referencia: $X").
- **Modal nuevo** `#value-modal` (en `index.html`, mismo patrón que
  `#sell-modal`): input de precio, Guardar, Quitar valor (solo visible
  si ya tenía uno). Funciones `openValueModal`/`closeValueModal`/
  `saveValue`/`removeValueFromModal` en `js/app.js`, wireadas en
  `bindTradeEvents()`.
- **`renderTradeValue()`** (total de "valor potencial de venta"): ahora
  prefiere `store.getMyPrice()` por copia y solo cae al precio
  scrapeado si el dueño no valoró esa carta — la nota distingue
  "copias valoradas por ti" de "con precio de referencia" de "sin
  valor (no incluidas)".
- **`openSellModal()`**: el precio sugerido al vender ahora prioriza el
  valor propio sobre el scrapeado.
- **`exportPricesExcel()`** (`js/exporters.js`): nueva columna "Mi
  valor"; el listado ahora incluye cartas con valor propio Y/O precio
  de referencia (antes solo las que tenían precio scrapeado).
- CSS nuevo (`.my-value-row`, `.my-value-amount`, `.my-value-edit-btn`,
  `.market-pill` + variantes `.over`/`.under`/`.even`/`.none`) dentro
  de los tokens ya existentes — nada de paleta/tipografía nueva.
- Validado con Playwright: asignar/editar/quitar valor persiste y se
  refleja en la tarjeta; las 4 variantes de la píldora (sin valor con
  referencia, sobre, bajo, en línea) renderizan correctamente contra
  una carta real de `data/prices.json` ("47 Ronin", crpe2, referencia
  $500); el total de "Cambio y Ventas" se actualiza; el modal de venta
  prellena con el valor propio; Catálogo/Colecciones confirmados sin
  cambios visuales (sin `.my-value-row`); 0 `pageerror`.

### 2026-09-14 (54ª iteración) — Corrige la imagen de Vali (Raciales, `70-046`)

- El dueño avisó que su carta física de "Vali" (edición "Raciales",
  `raciales_pe`) no coincide con la imagen que trae la app, y que
  corresponde a la versión del wiki
  `https://myl.fandom.com/es/wiki/Vali_(PE)`.
- Confirmado: TOR ya clasifica correctamente esta carta como
  `"rarity": "Promocional"` (coste/fuerza/habilidad también
  coinciden con la carta promo), pero la `image` que trae es la de la
  carta BASE "Vali" del Kit Dios (Colecciones Raciales Primera Era,
  código impreso `CRPE-46-72`) — mismo arte pero marco/borde
  distinto (ícono de fuerza en escudo, no en llama de "Promocional").
  La imagen real de esta versión promo es `CARTA PROMO PE 04`
  (entregada al comprar los 6 kits raciales en CasaMyL a fines de
  2021), confirmada contra la página propia del wiki.
- Corregido con el mecanismo `IMAGE_CORRECTIONS` de
  `scraper/corrections.js` (nueva entrada `"70-046"`, ya no vacío) +
  parche directo al mismo campo en `data/cards.json` para verse de
  inmediato sin esperar la próxima corrida del scraper — mismo patrón
  que la corrección de nombre de Ánima Negra (iteración 39).
- Validado: JSON válido.

### 2026-09-13 (53ª iteración) — Corrige posición de los badges de coste/fuerza en las miniaturas de carta

- El dueño notó que en las tarjetas del Catálogo/Colecciones, el
  círculo de coste y el rombo de fuerza aparecen en el lado contrario
  al de las cartas físicas reales — algo que esta misma sesión
  confirmó carta por carta durante la auditoría de Leyendas PE 4.0:
  en el impreso real, el ícono de fuerza (coloreado por raza) va a la
  IZQUIERDA y el sol dorado de coste va a la DERECHA.
- Arreglo puramente visual en `css/styles.css`: se intercambió
  `left`/`right` entre `.badge-cost` y `.badge-str` (antes coste a la
  izquierda, fuerza a la derecha — ahora al revés). No se tocó
  `js/app.js`: los badges siguen mostrando el mismo dato de siempre
  (`card.cost` en `.badge-cost`, `card.strength` en `.badge-str`),
  solo cambia dónde se dibujan.
- Validado con Playwright: badge de fuerza queda a la izquierda del
  badge de coste en la miniatura, 0 `pageerror`.

### 2026-09-12 (52ª iteración) — Nueva edición "Set Coleccionista Primera Era" (12 cartas)

- El dueño avisó que su confusión con Flechero (iteración 51) venía de
  un TERCER producto full art distinto: `Set Coleccionista Primera
  Era` (wiki), que no estaba registrado (confirmado: no existe ningún
  slug/nombre con "coleccionista" en `editions.json`).
- Es un producto propio, ni el Kit de Juego Full Art (nov/dic 2020) ni
  "20 Años" (línea transversal 2021): 1 carta full art al azar por
  display de Leyendas Primera Era, noviembre de 2021, código impreso
  **"PROMO COLECCIONISTA PE NN"**. 12 cartas, todas reimpresiones full
  art de cartas base ya en el catálogo (El Reto, El Reto X, Mundo
  Gótico, La Ira del Nahual, Ragnarok, La Cofradía, Espíritu de
  Dragón, Misión Santiago) — mismo patrón que el Kit de Juego Full
  Art: se verificó cada una contra su propia página `(Coleccionista)`
  del wiki (plantilla `{{Cartasintexto}}`), 2 confirmadas además
  visualmente contra el escaneo real (Flechero, Hattori Hanzo) —
  coincidencia exacta en coste/fuerza/raza/habilidad, diseño full art
  confirmado (sin bordes, caja de texto semitransparente).
- Registrada como `coleccionista_pe` / "Set Coleccionista Primera
  Era", insertada antes de `leyendas_primera_era_2022` en
  `editions.json`. `specialId` = código impreso tal cual
  (`"PROMO COLECCIONISTA PE 01"`..`"12"`). Imágenes autohospedadas
  desde el wiki (hotlink directo a static.wikia, mismo criterio que
  Xinnián/CRPE3/Torneo Aniversario 25 Años). Sin duplicados: el
  Flechero de esta colección es una carta y una entrada propias, sin
  relación con el Flechero de "20 Años" (`promo_20_anos_pe`) ni con
  ningún otro registrado — cada full art de un mismo nombre base es su
  propia impresión real, con su propio código impreso.
- Validado: JSON válido, sin ids duplicados.

### 2026-09-12 (51ª iteración) — Reordena "Cartas Promo 20 Años" y registra sus 3 bloques faltantes (Primer Bloque completo, Bloque Furia e Imperio nuevos)

- El dueño pidió sacar Flechero e Hidromiel de "promocionales" porque
  son full art. Al investigar: **sí son full art** (el wiki lo dice
  textualmente para esas 2 + Drakkar), pero NO pertenecen al "Kit de
  Juego Primera Era - Full Art" (producto de nov/dic 2020, pool
  cerrado de 30 cartas ya verificado 30/30 en la 39ª iteración) — son
  parte de un producto totalmente distinto, **"20 Años"** (línea
  transversal anunciada marzo 2021, buy-a-box por tiempo limitado en
  CasaMyL, con presencia en los 4 formatos vigentes a la fecha).
  Moverlas al Kit de Juego habría mezclado dos productos reales sin
  relación. El dueño confirmó no separarlas en una edición aparte y en
  cambio pidió abordar "20 Años" completo usando
  `https://myl.fandom.com/es/wiki/20_Años` (la página maestra) como
  fuente de la verdad, ya que el orden que teníamos en Primera Era
  estaba mal.
- **Primera Era (`promo_20_anos_pe`, ya existía con 9 cartas)**:
  reordenado + renumerado `20A-01`..`09` a la secuencia real de la
  página maestra: Flechero, Tesoro de Guayacán, Tótem de Guerra, Golpe
  Vampiro, Guardián, Resplandor Dorado, Hidromiel, Drakkar, Espada
  Real (antes Tótem de Guerra/Golpe Vampiro estaban pegados al final
  por decisión de la 13ª iteración de no reordenar ids ya usados — el
  dueño esta vez pidió explícitamente renumerar). **El `id` interno de
  cada carta NO cambió**, solo el `specialId` visible y su posición en
  el array — así no se pierde ninguna copia ya marcada por el dueño,
  que usa `id` como clave, no `specialId`.
- **Primer Bloque (`promo_20_anos_pb`, tenía 9 de 11)**: la página
  maestra reveló que faltaban **Takelot** y **Biblioteca Eterna**
  (ambas al final de la secuencia real, así que se agregaron como
  `20A-PB-10` y `11` sin reordenar las 9 ya existentes, que sí
  coinciden con el orden real). Takelot no tiene página propia
  `(20 Años)` en el wiki — se usó su carta base de **Dominios de Ra**
  (edid 034, la que la propia tabla maestra declara como origen), dato
  real, no inventado. Biblioteca Eterna sí tiene página propia; sin
  imagen confirmada en ninguna de las dos (archivo de Takelot no
  existe, el de Biblioteca Eterna está enlazado en la página pero el
  archivo nunca se subió al wiki — mismo criterio que Cruz Templaria:
  queda sin imagen en vez de adivinar).
- **Bloque Furia (`promo_20_anos_fx`, edición nueva, 31 cartas)** e
  **Imperio (`promo_20_anos_imperio`, edición nueva, 6 cartas)**: no
  existían en el catálogo. Se registraron completas desde cero,
  cruzando la página maestra con las ~37 páginas individuales
  `Nombre (20 Años)` del wiki (fetch en lote vía API de MediaWiki,
  hasta 10-15 títulos por consulta). Formato asignado: Furia Extendido
  → `FX`; "Imperio" (nombre coloquial del wiki para la temporada
  Ángeles & Demonios) → `NE`, igual que sus ediciones base (Olimpia,
  Tierra Austral, etc., todas ya catalogadas como `NE`).
  - **5 filas de la tabla maestra de Bloque Furia excluidas
    deliberadamente**: Ánima Negra, Sumo Sacerdote, Ziusudra, Anzu y
    Eastre. Las 5 no tienen página propia en el wiki, y su columna
    "Origen" en la tabla resulta ser una copia exacta de la fila
    inmediatamente anterior (ej. "Ziusudra" y "Anzu" ambas apuntan a
    "Dub-Sar - Rebelión", el mismo origen que la fila de Dub-Sar justo
    después) — patrón de error de copiado en la tabla, no dato real.
    Mismo principio que ya se aplicó antes con la tabla "Klu" de 20
    Años (13ª iteración): no confiar en una tabla resumen sin
    verificación propia. Quedan pendientes si el dueño confirma tener
    alguna físicamente y puede fotografiarla.
  - Cada una de las 31+6 cartas se verificó contra su propia página
    `(20 Años)` (plantilla `{{Cartasintexto}}`, parseada por campos:
    tipo/raza/coste de oro/ataque/habilidad/imagen), nunca contra la
    tabla resumen. 2 cartas (Devastador y Horus Vengativo) se
    verificaron además visualmente contra el escaneo real —
    coincidencia exacta en coste/fuerza/raza/habilidad.
  - **Chequeo de duplicados contra todo el catálogo** (oficial +
    custom) antes de registrar: la mayoría de las 37 coincide
    EXACTAMENTE en coste+habilidad con su carta de origen en alguna
    edición base — esperado y correcto (son reimpresiones full art,
    mismo patrón que "Kit de Juego Primera Era - Full Art"), no un
    indicio de duplicado. Se descartó puntualmente confundir esto con
    la edición oficial ya existente `producto_especial_furia_aniversario`
    ("Furia Aniversario FX", 15 cartas, edid 236-250): comparte nombre
    con solo 3 de las 37 (Fe sin Límite, Guillatún, Llamar a la
    Manada) — son productos distintos donde esas 3 cartas simples
    resultan tener el mismo texto por coincidencia (pasa seguido con
    reimpresiones cortas), no la misma promoción.
- **Total agregado esta iteración**: 39 cartas nuevas (2 en Primer
  Bloque + 31 en Bloque Furia + 6 en Imperio), más el reordenamiento
  de las 9 de Primera Era. 2 ediciones nuevas en `editions.json`.
- Validado: `data/custom-cards.json` y `data/editions.json` JSON
  válidos, sin ids duplicados (1425 cartas custom en total).

### 2026-08-30 (50ª iteración) — Registra el set promocional "Torneo Aniversario 25 Años - Primera Era"

- El dueño encontró "Monedas de Oro - Aniversario 25 Años" en
  gorilatcg.cl y no estaba en el catálogo. **Importante**: ya existía
  una edición registrada con el slug `aniversario_lpe25` y el nombre
  "Aniversario 25 años" (26 cartas: Gilgamesh, Ogro, Solomon, etc.) —
  pero al comparar contra el wiki, esas 26 cartas **no tienen nada que
  ver** con el evento real "Aniversario 25 Años" de Fénix
  Entertainment. Esa edición existente quedó tal cual (no se tocó,
  puede tener copias ya marcadas), pero para evitar mezclar dos cosas
  distintas bajo el mismo nombre, este set nuevo se registró con un
  slug y nombre propios: `torneo_aniversario_25_pe` / "Torneo
  Aniversario 25 Años - Primera Era". Queda pendiente para una futura
  sesión averiguar qué es realmente `aniversario_lpe25` y si su nombre
  hay que corregirlo.
- El set real (wiki: `Aniversario 25 Años`) son los torneos
  organizados por Fénix a fines de 2025/inicios de 2026 por los 25
  años del juego (desde *El Reto*), con 25 cartas repartidas en los 4
  formatos vigentes (Primera Era, Primer Bloque, Furia Extendido,
  Imperio), arte estilo boceto a blanco y negro. Se registraron solo
  las **6 de Primera Era** (`25 ANIVERSARIO 01/25` a `06/25`), que es
  lo que pidió el dueño — quedan 19 más en otros formatos si algún día
  se quiere completar el set entero.
- Cartas registradas (specialId `25ANIV-01` a `25ANIV-06`, sin edid
  propio ya que el código impreso es correlativo del evento, no de una
  edición base): Odín (Talismán, 1, única, busca+destierra),
  Kordrag (Aliado Caballero 4/4, reprint con arte nuevo de Mundo
  Medieval), Knochen (Aliado Dragón 5/5, reprint de Mundo Medieval),
  Titania (Aliado Faerie 3/3, remake de la de CRPE3), Ser Abominable
  (Aliado Faerie 3/0, rework de El Reto), Monedas de Oro (Oro con
  habilidad, reprint de Mundo Medieval).
- Todos los datos (coste/fuerza/habilidad/imagen) se sacaron
  directamente de las 6 páginas individuales del wiki
  (`Nombre (25 Aniversario)`), que traen los datos ya extraídos de la
  plantilla oficial de la carta, y se verificaron visualmente contra
  el escaneo de cada carta antes de registrar — todo coincidió
  exactamente, sin necesidad de corregir nada de la plantilla base.

### 2026-08-29 (49ª iteración) — Auditoría de triage + corrección masiva de Leyendas PE 4.0

- El caso de Tzitzimime (iteración 48) planteó una pregunta de fondo: al
  registrar reimpresiones (cartas custom que reciclan el nombre/arte de
  una edición base), ¿cuántas más copiaron datos incorrectos sin
  verificar? Con 1380 cartas custom en 28 ediciones, revisar las 1380 a
  mano contra foto no era razonable de una sola vez.
- **Triage automático** (sin fotos): para cada carta custom, se comparó
  su tupla (coste, fuerza, habilidad) contra la de cualquier otra carta
  del mismo nombre en el catálogo completo (`cards.json` + resto de
  `custom-cards.json`). "Idéntica" = coincide exactamente con otra
  impresión → nunca verificada por separado, candidata a revisar.
  "Distinta" = ya tiene datos propios → probablemente ya corregida.
  Resultado: 459 idénticas / 600 distintas / 321 únicas (sin otra
  versión). Publicado como artefacto HTML ("Triage de Reimpresiones")
  con desglose por edición y buscador.
- El dueño eligió empezar por **Leyendas - Primera Era 4.0** (167 de
  432 cartas de esta edición cayeron en "idéntica", la edición más
  grande y más reciente). Se revisaron las 167 una por una contra su
  foto física (`data/custom-images/mylserena/` y `mesaredonda/`,
  descargando también las que solo tenían URL de wikia).
- **Resultado: 71 de 167 tenían datos mal copiados** (43%) — coste,
  fuerza y/o habilidad. El patrón más común: la habilidad registrada
  describía una carta completamente distinta a la impresa (se había
  copiado la habilidad de otra reimpresión del mismo Aliado/Talismán
  por error), no solo un problema de redacción.
- Además, un hallazgo distinto al de coste/fuerza/habilidad: las
  imágenes de **Rapto de Idunn (edid 088)** y **Asaltar Santuario
  (edid 089)** estaban físicamente intercambiadas en disco — el
  archivo con nombre de una carta mostraba la otra. Se detectó porque
  el código impreso "LPE4-NN/320" en la esquina de la foto no
  coincidía con el edid del archivo. Corregido intercambiando los
  archivos en `data/custom-images/mylserena/` (sin tocar los campos
  `image` en el JSON, que ya apuntaban al nombre de archivo correcto).
- Todo corregido directamente en `data/custom-cards.json` en 7 tandas
  (commits `parte 1/N` a `parte 7/7, final`) para no perder progreso
  si se interrumpía la sesión.
- **Pendiente para el dueño**: quedan 292 cartas "idénticas" sin
  revisar en las otras 27 ediciones (ver el artefacto de triage para
  el desglose completo por edición — las de mayor riesgo relativo son
  Cartas Colección Completa PE 100%, Kit de Juego PE Full Art 93%,
  CRPE2 32%, Juego Organizado PE 46%).

### 2026-08-29 (48ª iteración) — Corrige coste y habilidad de Tzitzimime (Leyendas - Primera Era 4.0)

- El dueño avisó que su carta física de "Tzitzimime" en la edición
  "Leyendas - Primera Era 4.0" tiene coste 2 y fuerza 2, pero la app
  tenía coste 4 (fuerza 2 ya estaba bien).
- Al registrar esta carta se había copiado el coste/habilidad de la
  página base del wiki ("Tzitzimime", edición original La Ira del
  Nahual #075: coste 4), porque no existe página propia
  "Tzitzimime (LPE4)" en el wiki (enlace en rojo en la lista de
  cartas). Otro caso del patrón ya documentado: un reprint puede tener
  datos de juego distintos al original aunque comparta nombre e
  imagen base.
- Verificado directamente contra la foto física de la carta (ya
  guardada en `data/custom-images/mylserena/leyendas_primera_era_4_0_239_tzitzimime.jpg`):
  coste **2**, fuerza 2, y la habilidad es más larga que la
  registrada — "Puede atacar cuando entra en juego. Cuando entra en
  juego, puedes elegir un Aliado que controles para que sea
  Imbloqueable hasta la Fase Final." (la original solo decía "Puede
  atacar cuando entra en juego. (Imbloqueable)").
- Corregido en `data/custom-cards.json`
  (`leyendas_primera_era_4_0__custom__239_tzitzimime`): `cost` 4→2,
  `ability` actualizada al texto completo.

### 2026-08-26 (47ª iteración) — Orden por rareza en la vista de Mazo

- Nueva opción en la ficha de mazo (junto al buscador de cartas para
  añadir): selector "Ordenar cartas por", con 4 modos — Nombre (A→Z),
  Nombre (Z→A), Rareza (más pro primero) y Rareza (más básica primero).
  Se guarda por dispositivo en `store.getSetting("deckSort")` y aplica a
  cada zona del mazo (Aliado/Apoyo/Oro/Otro) por separado, igual que el
  orden alfabético anterior.
- **Orden de rareza acordado con el dueño**: las rarezas especiales (no
  se obtienen de sobres) van todas arriba de la escalera normal, en este
  orden fijo entre ellas — Milenaria, Set Paralelo, Promocional, Ficha.
  Luego la escalera de sobre normal, de más alta a más baja: Secreta,
  Legendaria, Ultra Real, Mega Real, Real, Cortesano, Vasallo (la más
  baja de todas). Cualquier rareza no listada (vacía, "Sin Frecuencia",
  error de datos) cae al final.
  - El dueño planteó inicialmente ordenar las 4 especiales por acabado
    de impresión (full art > foil > normal), pero la app no guarda ese
    dato por carta — solo la rareza. Se le preguntó cómo resolverlo y
    eligió mantener un orden fijo por categoría entre las 4 especiales
    en vez de intentar inferir el acabado.
  - Con empate de rareza, desempata alfabéticamente (`localeCompare`
    con locale `es`), igual en ambas direcciones de rareza.
- Implementado en `js/app.js`: tabla `RARITY_ORDER` + función
  `rarityRank(card)`, usado en el `.sort()` de `renderDeckContents()`.
  CSS del nuevo `<select>` en `css/styles.css` (`.deck-sort-field`).
- Verificado con Playwright: alternar entre `rarity_desc` y
  `rarity_asc` produce órdenes exactamente espejadas (por `id` de
  carta), confirmando que la lógica de comparación es correcta.

### 2026-08-24 (46ª iteración) — Cierra el reporte de auditoría: Xinnián Año de la Serpiente 2025 (32) y Colecciones Raciales Primera Era 2023/CRPE3 (40)
- Últimos 2 gaps grandes del reporte de la 43ª iteración, ambas
  ediciones completas que faltaban por entero.
- **Xinnián Año de la Serpiente 2025**: el slug `xinnian_año_serpiente_2025`
  ya existía en `editions.json` de una iteración anterior pero sin
  cartas detrás. Extraídas las 32 (`Lista de cartas de Xinnián 2025 -
  Año de la Serpiente`), cada una con página propia — 31/32 con
  habilidad y leyenda directo en su plantilla, solo la carta "00" (Shé
  Nián, Talismán firma Buy-a-Box) sin leyenda documentada. Numeración:
  "00" (Shé Nián) y "31" (Horóscopo Chino, reprint Promocional) van con
  `specialId` (la app no acepta `edid < 1`, y el "31" es un extra fuera
  del rango 00-30 del set base); "01" a "30" con `edid` normal.
- **Colecciones Raciales Primera Era 2023 (CRPE3)**: no existía ninguna
  entrada. Extraídas las 40 (`Lista de cartas de Colecciones Raciales
  Primera Era 2023`, 3 Kits: Caballero/Dragón/Faerie, cartas 01-36 +
  Buy-a-Box 37-39 + "Diamante Turquesa" "EDICIÓN LIMITADA" sin número
  propio) — 36/40 con leyenda directa, 4 recuperadas de su plantilla
  base transcluida (Nibelungos, Morgana, Dragón de Magma, Diamante
  Turquesa), solo "Reina Guinivere" quedó sin leyenda documentada.
  "Diamante Turquesa" con `specialId: "CRPE3-EL"` (sin número impreso,
  el resto 001-039 con `edid` normal, coincide con la numeración de la
  tienda).
- Con esto quedan cerrados los 9 hallazgos del reporte de auditoría del
  24-08-2026: 3 resultaron ser falsos gaps (ya cargados con otro
  nombre o reimpresiones idénticas de cartas existentes), 2 eran
  errores de numeración sin carta nueva que agregar (Ragnarok #126 fue
  el único que sí faltaba de verdad ahí; Mundo Medieval solo necesitaba
  corrección de `edid`→`specialId`), y 4 eran ediciones/líneas
  genuinamente nuevas (Tecpatl suelto, Cartas Zombies, Cartas Colección
  Completa PE, Xinnián 2025, CRPE3 — 148 cartas nuevas en total entre
  todas).
- Validado: JSON válido, Playwright con la API real bloqueada — ambas
  ediciones muestran su conteo completo (32 y 40), 0 `pageerror`.

### 2026-08-24 (45ª iteración) — 3 líneas promocionales del reporte: 2 resultaron ya cubiertas, 2 se registraron nuevas (35 cartas)
- Siguiendo con "todos" los gaps del reporte:
- **"Misión Santiago" no era un gap**: sus 4 cartas (Golpe Vampiro,
  Guardián, Resplandor Dorado, Tótem de Guerra) ya estaban cargadas
  bajo la edición "Cartas Promo 20 Años" (`promo_20_anos_pe`,
  specialId `20A-01`..`20A-09`) — mismo nombre de evento, mismo
  producto, categoría de tienda distinta nomás.
- **"Cartas Coleccionistas" (PCPE) y "Cartas Colecciones Legendarias"
  (CLER/CLRG) tampoco eran gaps**: se verificó carta por carta (leyendo
  el código y la habilidad impresos en la foto de cada una, ej. "Odín"
  PCPE/CLRE código "1-126", ability idéntica a la de El Reto #001 ya
  cargada) — son reimpresiones con arte alternativo de cartas que ya
  existen en Leyendas Primera Era / El Reto / Ragnarok, mismo dato de
  juego exacto. No se creó ninguna entrada nueva para estas dos.
- **"Cartas Zombies" (ZPE) sí era un gap real** — 5 cartas, entregadas
  como Buy-a-Box de "Extensión Primera Era": Falsa Cautiva (Mundo
  Gótico #78), Miyamoto Musashi (Espíritu de Dragón #84), Odín (El
  Reto #1), Thor (La Cofradía #95), Walkirias (El Reto #162) — todas
  reimpresiones con arte "zombie" pero habilidad idéntica a su carta de
  origen (verificado leyendo cada foto, no adivinado). Registradas
  como edición nueva `cartas_zombies_pe`.
- **"Cartas Colección Completa PE" (CCPE) sí era un gap real** — 30
  cartas, el mismo tipo de producto "logo" que la carta física de Ira
  del Nahual de la 42ª iteración, pero para 6 ediciones base (Cofradía,
  Mundo Gótico, El Reto, Espíritu del Dragón, Ragnarok, Ira del Nahual,
  5 cartas c/u). Las 30 se cruzaron por nombre contra su edición de
  origen citada en el propio nombre del producto ("X (Mundo Gótico)"
  etc.) y se verificaron 2 al azar contra su foto (Odín, Naglfar) —
  ability y código impreso ("5-126" para Naglfar) coinciden exacto con
  la carta ya cargada. 2 nombres con typo de la tienda corregidos antes
  de cruzar ("Oraculo de Zingaro" → "Oraculo Zingaro", "Walkiris" →
  "Walkirias"). Registradas como edición nueva
  `cartas_coleccion_completa_pe`, rareza Promocional, `specialId` con
  el código impreso de la carta de origen (ej. `"6-126"` para Ira del
  Nahual) — 2 colisiones reales resueltas con sufijo `-b`, mismo patrón
  de siempre.
- Imágenes de ambas líneas nuevas auto-hospedadas en
  `data/custom-images/laguarida/`, nunca hotlinkeadas.
- Validado: JSON válido, Playwright con la API real bloqueada — ambas
  ediciones muestran su conteo completo (5 y 30), 0 `pageerror`.

### 2026-08-24 (44ª iteración) — Cierra los 2 gaps puntuales del reporte: Tecpatl y Madre de Dragones
- El dueño pidió seguir con "todos" los gaps del reporte de la 43ª
  iteración. Empezando por los 2 más chicos:
- **"Madre de Dragones" (Mundo Medieval El Reto) no era un gap real**:
  al comparar la foto de laguarida.store (código impreso "REX - 00/12")
  contra la carta ya cargada como edid "013", la habilidad coincide
  EXACTA ("Destierra una carta oponente en juego que no sea Oro...").
  Es el mismo bug de numeración ya documentado en
  `MUNDOS_PERDIDOS_TOR_CORRECTIONS` — TOR trae la carta "00"
  (firma/especial de un set de 12) como si fuera la #13 corrida, en vez
  de tratarla como especial. A diferencia de Mundos Perdidos, acá NO hay
  corrimiento en cascada (001-012 sí son su número real) — solo esa una
  carta necesitaba pasar de `edid` a `specialId`. Se agregó
  `MUNDO_MEDIEVAL_TOR_CORRECTIONS` en `corrections.js` (mismo patrón que
  las otras tablas) con `"113-013": { edid: "", specialId: "REX-00" }`,
  sumada a `ALL_CORRECTIONS` en `scrape.js`, y aplicada también directo
  al `data/cards.json` ya commiteado.
- **"Tecpatl" (Toolkit Primera Era 2024 #41) sí era un gap real, y con
  una trampa**: la página base del wiki ("Tecpatl", sin sufijo de
  edición) describe la carta ORIGINAL de "La Ira del Nahual" —
  coste 2, "El Aliado portador de esta Arma es imbloqueable." — pero la
  foto real de la reimpresión en el Toolkit 2024 (verificada en
  laguarida.store, código "TKPE24 - 41/28") muestra una carta
  REDISEÑADA: coste 4, "El portador gana 1 a la Fuerza y es
  Imbloqueable. Cuando entra en juego, gana el control de un Aliado
  oponente hasta que esta Arma salga del juego." — exactamente el caso
  que la skill `registrar-nueva-edicion` advierte de no copiar de una
  página base sin verificar cada dato contra la foto real de ESA
  impresión. Agregada a `data/custom-cards.json` con los datos leídos
  directo de la foto (no de la página base), rareza Promocional por
  patrón de posición (las 3 cartas inmediatamente anteriores del mismo
  lote, edid 038-040, ya cargadas como Promocional).
- Validado: JSON válido en ambos archivos, Playwright con la API real
  bloqueada — ambas cartas aparecen por búsqueda, 0 `pageerror`.

### 2026-08-24 (43ª iteración) — Auditoría completa de Primera Era contra laguarida.store; agrega "Trono de Odín" (Ragnarok #126)
- A pedido del dueño ("revisa toda la estructura y compárala con la
  fuente de conocimiento, hagamos un análisis exhaustivo"), se recorrió
  la categoría Primera Era completa de laguarida.store: 2.227 fichas de
  producto en 23 categorías/sub-líneas (11 ediciones base bajo "Primera
  Era Reedit+", 12 líneas promocionales bajo "Promocionales PE+"). Cada
  código de producto (SKU, ej. `RGK-126`) se cruzó contra el `edid`/
  `specialId` exacto del catálogo — nunca por nombre solo, mismo criterio
  que ya costó un error real hoy mismo con "Ira del Nahual (Ira del
  Nahual)" (ver 42ª iteración).
- **Resultado resumido** (detalle completo en el artefacto publicado,
  enlazado en el chat): 25 ediciones/sub-líneas con cobertura completa o
  casi completa (1.706+ cartas verificadas sin diferencias), 3 gaps
  puntuales de 1 carta cada uno, 2 ediciones enteras sin registrar
  (Xinnián Año de la Serpiente 2025 — el slug existe en
  `editions.json` pero sin cartas — y Colecciones Raciales Primera Era
  2023/CRPE3, 39 cartas), y 5 líneas promocionales aparte sin registrar
  (Cartas Colección Completa PE, Cartas Colecciones Legendarias, Cartas
  Coleccionistas, Cartas Zombies, Misión Santiago — 71 cartas en total).
- **Corregido en el momento**: "Trono de Odín" (Ragnarok #126, Oro básico
  sin habilidad) faltaba por completo del catálogo scrapeado — TOR solo
  trae 125/126 cartas de Ragnarok. Verificado contra el wiki (código
  "126 - 126 / Primera Edición") y contra la foto de laguarida.store
  (mismo código visible, mismo texto de leyenda). Agregado a
  `data/custom-cards.json`, imagen auto-hospedada en
  `data/custom-images/laguarida/ragnarok_126_trono_de_odin.png`.
- **Pendiente, no corregido todavía** (queda para cuando el dueño
  priorice): "Tecpatl" (Toolkit Primera Era 2024 #41) y "Madre de
  Dragones (FullArt)" (Mundo Medieval El Reto, código especial "000") —
  las 2 ediciones completas faltantes — y las 5 líneas promocionales,
  cada una necesita su propia investigación antes de registrarse (en
  particular "Cartas Colecciones Legendarias" comparte nombres con el
  "Kit de Juego PE - Full Art" ya cargado pero es un producto y código
  distinto, sin confirmar todavía si el arte es el mismo).
- Validado: JSON válido, `data/custom-cards.json` con 1272 cartas.

### 2026-08-24 (42ª iteración) — Revierte la 41ª: "Ira del Nahual (Ira del Nahual)" de laguarida NO es la misma carta que la base #6
- La 41ª iteración de abajo fue un error: asumió que el producto de
  laguarida.store `Ira del Nahual (Ira del Nahual)` (SKU `CCPE-INA-001`)
  era solo una foto distinta de la carta base #6 de "Ira del Nahual"
  porque comparte el mismo número impreso ("6-126"). El dueño corrigió:
  **son dos cosas distintas** — ese producto vive en la categoría
  **"Promocionales PE+" → "Cartas Cole Completa PE"** del sitio, una
  línea de producto separada de "Primera Era Reedit+" → "La Ira del
  Nahual" (la categoría de la edición base). Que el número impreso
  coincida no basta como señal — el sitio mismo las tiene clasificadas
  aparte, señal más confiable que "se ve parecido".
- Se revirtió el `image` de la carta `59-006` (Ira del Nahual base) a la
  URL original de la API de TOR, y se vació `IMAGE_CORRECTIONS` en
  `corrections.js` (se deja el mecanismo — sigue siendo útil para casos
  reales futuros — pero con una advertencia nueva en el comentario:
  revisar SIEMPRE la categoría/breadcrumb del producto de la tienda
  antes de asumir que es la misma carta con otra foto, no solo el
  número impreso).
- La imagen ya descargada (`data/custom-images/laguarida/ira_del_nahual_006_logo.png`)
  se deja en el repo sin usar por ahora — es candidata a convertirse en
  la imagen de una futura carta separada "Ira del Nahual (Cartas Cole
  Completa PE)" si se decide registrar esa línea promocional completa
  (ver pedido del dueño de auditar toda la estructura de laguarida.store
  contra el catálogo, en curso).
- Validado: JSON válido, `data/cards.json` con la imagen original de TOR
  de nuevo en `59-006`.

### 2026-08-24 (41ª iteración) — Imagen real de "Ira del Nahual" #6 (con el logo de la reedición 2022) — REVERTIDO, ver 42ª iteración arriba
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
