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
| `js/exporters.js` | Exportar a Excel (SheetJS), PDF (jsPDF), imagen de mazo y resumen de mazo. |
| `js/charts.js` | Gráficos de estadísticas (Chart.js, carga perezosa desde CDN). |
| `js/cdn.js` | Carga perezosa de librerías externas (SheetJS, jsPDF, Chart.js, Supabase). |
| `js/icons.js` | Iconos por tipo/raza y tipos sin fuerza (`NO_STRENGTH_TYPES`). |
| `data/cards.json` | Catálogo scrapeado de `api.myl.cl` (~19.800 cartas, 133 ediciones). |
| `data/editions.json` | Lista de ediciones **en orden por bloque/formato** (`slug`, `format`, `formatName`, `name`). Este orden se usa en la UI. |
| `data/custom-cards.json` | Cartas empaquetadas que TOR/api no tiene (p. ej. promos). |
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

## Registro de cambios

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
