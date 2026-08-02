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
| `scraper/` | Scraper Node (`scrape.js` + `editions.js`) que regenera `data/*.json`. Corre también por GitHub Actions (`.github/workflows/scrape-data.yml`). |
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
- **Colecciones** (`view-colecciones`): cada colección se crea eligiendo una **edición**;
  muestra solo las cartas de esa edición **ordenadas por número** (`edid`). Las cartas con
  cantidad 0 se ven en blanco y negro y oscurecidas (vía CSS
  `.collection-grid .card:not(.owned)`); recuperan el color con transición al marcar la
  primera copia. Barra de progreso `poseídas/total`.
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
  80 del "Set Clásico" (subconjunto paralelo con su propio código
  `SCLPE4-NN`, cargadas como especiales `SC-01`…`SC-80`, ver más abajo).
  **Solo 56/432 tienen imagen** — ver "Imágenes de ediciones remake" abajo:
  el resto se dejó sin imagen a propósito porque el wiki aún no tiene el
  escaneo genuino de esas cartas y traer el arte de una edición anterior
  puede corresponder a una versión distinta de la carta (habilidad
  diferente aunque el arte se vea igual). El dueño del inventario las va
  escaneando y cargando a mano por el gestor de Ediciones a medida que
  consigue los sobres físicos.

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
certeza que la edición es una reimpresión 1:1 estable de otra (ej.
Bruderschaft/La Cofradía, donde esto no causaba problemas porque casi todas
las cartas sí tenían página específica).

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
