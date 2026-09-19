# Handoff: Inventario MyL — rediseño "Vitrina"

## Overview

Rediseño completo de la app **Inventario MyL** (repo `MrGerardGDJ/InventarioMYL`, rama
`claude/myl-card-inventory-app-hx8z9d`): una app estática de un solo usuario para llevar la
colección de cartas de Mitos y Leyendas. El rediseño mantiene la funcionalidad actual —
catálogo con filtros, colecciones por edición, mazos, cambio y ventas, estadísticas — y cambia
la piel y la jerarquía: el arte de las cartas pasa a ser el protagonista, lo que no tienes se ve
sin color, y marcar cuántas copias tienes queda siempre a un toque.

Además introduce dos cosas nuevas:

1. **Modo inventariar** — pantalla con foco completo para recorrer una edición marcando rápido, con teclado.
2. **Ficha fija** — panel lateral derecho con la carta elegida, en lugar de depender solo del modal.

## About the Design Files

El archivo de este bundle (`Inventario MyL.dc.html`) es una **referencia de diseño hecha en
HTML**: un prototipo que muestra el aspecto y el comportamiento buscados, **no código de
producción para copiar tal cual**. No tiene lógica real, los datos son de ejemplo y el arte de
las cartas son placeholders (degradados + trama diagonal) que en la app real se reemplazan por
`card.image`.

La tarea es **recrear estas pantallas en el entorno del repo actual**: HTML estático +
`css/styles.css` + módulos ES en `js/`. No hace falta introducir un framework: el rediseño es
compatible con la estructura existente (`index.html` con secciones `.view`, `js/app.js`
renderizando la grilla, `js/store.js` guardando en localStorage). Concretamente:

- Reescribir el bloque de tokens al inicio de `css/styles.css` con los valores de más abajo.
- Reemplazar la `.topbar` + `.tabs` por la barra vertical de iconos (`rail`).
- Cambiar el markup de la tarjeta en la grilla (`#cards-grid`) por la tarjeta-arte de este diseño.
- Añadir el panel de ficha a la derecha de la vista catálogo y el modo inventariar como vista nueva.

El prototipo se abre en el navegador; para leer valores exactos, inspecciona los elementos (todo
el estilo es inline) o busca en el archivo por el nombre de la pantalla (`2a`, `3a`, etc.).

## Fidelity

**Alta fidelidad.** Colores, tipografía, tamaños, radios, sombras y estados hover son finales y
deben reproducirse tal cual. Las únicas partes deliberadamente abstractas son:

- El arte de las cartas (placeholder → `card.image`).
- Los textos de cartas, precios y fechas (datos de ejemplo).

## Design Tokens

Del design system **Nocturne**. Defínelos como variables CSS en `:root` y no uses hex sueltos
fuera de esta lista.

### Color

| Token | Valor | Uso |
| --- | --- | --- |
| `--color-bg` | `#161826` | fondo de la app |
| `--color-bg-deep` | `#101220` | fondo del lienzo / fuera del marco |
| `--color-surface` | `#1c1e2c` | tarjetas, filas de lista |
| `--color-surface-2` | `#232532` | campos, píldoras, tarjetas sobre superficie |
| `--color-rail` | `#191b2a` | barra de iconos, panel de ficha, barra inferior móvil |
| `--color-text` | `#e9e9ed` | texto principal |
| `--color-text-70` | `rgba(233,233,237,.7)` | texto secundario |
| `--color-text-55` | `rgba(233,233,237,.55)` | texto terciario / metadatos |
| `--color-text-45` | `rgba(233,233,237,.45)` | texto mínimo |
| `--color-border` | `rgba(233,233,237,.10)` | borde de superficie |
| `--color-border-strong` | `rgba(233,233,237,.14)` | borde de control |
| `--color-accent` | `#9184d9` | acento: bordes de acción, badges de cantidad |
| `--color-accent-300` | `#d2cefd` | texto sobre tinte de acento |
| `--color-accent-400` | `#b5abfc` | iconos y cifras de acento |
| `--color-accent-700` | `#5d5294` | inicio de las barras de progreso |
| `--color-accent-tint` | `rgba(145,132,217,.16)` | relleno de estado activo |
| `--color-accent-tint-soft` | `rgba(145,132,217,.12)` | hover de acción de acento |
| `--color-section-a` | `#262a60` | inicio del degradado de los cintillos |
| `--color-section-b` | `#1d2040` | fin del degradado de los cintillos |

Reglas del sistema que hay que respetar:

- **Las acciones primarias son contorno, nunca relleno**: `box-shadow: inset 0 0 0 1px var(--color-accent)`, texto en `--color-accent`, fondo transparente; hover `--color-accent-tint-soft`.
- El acento se rellena solo en piezas pequeñas: badge de cantidad, botón `+`.
- Nada de negro ni blanco puros; nada de sombras apiladas.
- Foco de teclado: `:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px }`.

### Tipografía

- Familia única: **Inter** (`--font-heading` = `--font-body`). Peso máximo **500** — la jerarquía es tamaño y espacio, nunca bold.
- Monoespaciada para códigos, números de carta, porcentajes y etiquetas de sección: `ui-monospace, Menlo, monospace`.

| Rol | Tamaño / peso | Detalle |
| --- | --- | --- |
| Título de pantalla | 26px / 500 | `letter-spacing:-.02em` |
| Cifra grande (progreso) | 38–44px / 500 | `letter-spacing:-.03em`, `line-height:1` |
| Título de carta en ficha | 20–30px / 500 | `letter-spacing:-.02em` |
| Título de sección | 14–15px / 500 | — |
| Cuerpo | 12.5–13.5px / 400 | `line-height:1.6`, `text-wrap:pretty` |
| Metadato | 11–12px / 400 | color `--color-text-55` |
| Etiqueta de sección (kicker) | 9.5px mono | `letter-spacing:.12em`, `text-transform:uppercase`, color `--color-accent` |
| Números en tablas y contadores | `font-variant-numeric: tabular-nums` | obligatorio |

### Espacio, radio y sombra

- Escala compacta (densidad 0.7×): 4 / 6 / 7 / 9 / 11 / 14 / 18 / 22 / 26 px.
- Radios: **5px** miniatura de carta · **7–8px** carta en grilla, controles, píldoras · **9–11px** tarjetas y campos grandes · **12–14px** contenedores y modal · **99px** chips de filtro.
- Relación de aspecto de toda carta: **63/88**.
- Sombras: borde + oscuridad ambiental, nunca apiladas.
  - superficie: `inset 0 0 0 1px var(--color-border)`
  - carta que tienes: `0 0 0 1px rgba(181,171,252,.32)`
  - carta que falta: `0 0 0 1px rgba(233,233,237,.09)`
  - carta elegida: `0 0 0 2px var(--color-accent), 0 10px 26px rgba(0,0,0,.5)`
  - hover de carta: `0 0 0 1px var(--color-accent-400), 0 10px 24px rgba(0,0,0,.5)`
  - modal: `0 0 0 1px var(--color-border), 0 28px 70px rgba(0,0,0,.7)`
  - ficha/carta destacada: `0 0 0 1px rgba(181,171,252,.35), 0 12px 30px rgba(0,0,0,.5)`

### Estado de posesión (la regla central del rediseño)

```css
/* la tienes */      filter: none;                              /* + borde de acento suave */
/* te falta */       filter: grayscale(1) brightness(.68);      /* + borde neutro tenue */
```

Toda carta (grilla, miniatura de tabla, tira de inventariar, estante de álbum, mazo) usa esta
misma regla. El badge de cantidad solo aparece si `qty > 0`.

## Layout base (compartido por todas las pantallas de escritorio)

```
┌────┬──────────────────────────────────────────┬──────────┐
│rail│ contenido                                 │ ficha    │
│68px│ padding 20-26px                           │ 318px    │
└────┴──────────────────────────────────────────┴──────────┘
```

- **Rail** (`68px`, `--color-rail`, `box-shadow: 1px 0 0 var(--color-border)`): logo arriba
  (`58×46`, `object-fit:contain`, desde `https://blog.myl.cl/wp-content/uploads/2020/06/logo_online-1.png`;
  la alternativa local es `assets/logo.jpg`), luego 6 destinos de `44×42` con icono 19px + etiqueta
  8px en columna: **Catálogo** (`ph-squares-four`), **Álbum** (`ph-books`), **Mazos** (`ph-stack`),
  **Cambios** (`ph-arrows-left-right`), **Datos** (`ph-chart-bar`), **Cartas** (`ph-plus-circle`).
  Activo: fondo `--color-accent-tint`, texto `--color-accent-300`. Hover: `rgba(233,233,237,.06)`.
  Al pie: estado de nube (`ph-cloud-check`) y avatar de 30px.
- **Cabecera de contenido**: título 26px + línea de contexto 12.5px a la izquierda; a la derecha,
  buscador (34–36px de alto, `--color-surface-2`, icono `ph-magnifying-glass`), conmutador
  grilla/tabla (dos celdas de 36px en una caja con borde; la activa con tinte de acento) y
  la acción **Inventariar** (contorno de acento, icono `ph-check-square-offset`).
- **Chips de filtro**: alto 29–30px, radio 99px. Activo = tinte de acento + borde
  `rgba(145,132,217,.45)` + icono `ph-x`. Inactivo = transparente + borde
  `--color-border-strong` + icono `ph-caret-down`.
- **Cintillo de edición**: `linear-gradient(120deg,#262a60,#1c1e3a 62%,#1d1f33)` con un
  `radial-gradient` difuso arriba a la derecha; dentro: nombre, barra de progreso de 5px
  (`linear-gradient(90deg,#5d5294,#b5abfc)`), conteo y porcentaje en 22–30px `--color-accent-300`.
- **Iconografía**: Phosphor Icons (`@phosphor-icons/web`, pesos *regular* y *fill*). El peso
  *fill* solo para el destino activo.

Móvil (390×844): misma piel, barra inferior de 5 destinos (`--color-rail`, borde superior
`rgba(233,233,237,.08)`), altura de toque mínima 44px en toda acción principal.
La especificación completa del móvil está en `movil.md` (turno `4` del prototipo).

## Screens / Views

Las pantallas están agrupadas por turnos en el prototipo. Implementa la línea **Vitrina**:
`3a` es la vista de catálogo definitiva; `2a`–`2f` el resto de la app. (`1b` y `1c` son
direcciones descartadas; `1a` es el catálogo sin panel de ficha — quedó superado por `3a`.)

### 1. Catálogo con ficha fija — `3a` (vista principal)

Mapea a `#view-coleccion`.

- **Propósito**: buscar, filtrar y marcar cuántas copias tienes; ver la carta elegida sin abrir nada.
- **Layout**: rail 68 · contenido fluido · ficha 318. Grilla de **5 columnas**, `gap:13px`.
- **Tarjeta de la grilla**: contenedor `aspect-ratio:63/88`, radio 8px, arte de fondo, encima:
  trama `repeating-linear-gradient(48deg, rgba(233,233,237,.06) 0 6px, transparent 6px 13px)`,
  velo inferior `linear-gradient(transparent 46%, rgba(12,13,24,.9))`, número de carta arriba a
  la izquierda (píldora `rgba(12,13,24,.7)`, mono 9.5px), badge de cantidad arriba a la derecha
  (min 20px, radio 6px, fondo `--color-accent`, texto `#161826`, 11px/600), y al pie nombre
  13px/500 + `tipo · rareza` 10.5px.
  - **Hover**: se superpone un velo `rgba(12,13,24,.55)` con dos botones de 34px, `−` (fondo
    `rgba(12,13,24,.8)` + borde) y `+` (fondo `--color-accent`, icono `#161826`). Transición
    `opacity .14s`. En móvil no hay hover: el stepper va siempre visible bajo la carta.
- **Ficha (318px, `--color-rail`)**, de arriba abajo:
  1. Fila «Carta elegida» + `‹`, `›` y `ph-arrows-out` (este último abre el modal de `2b`).
  2. Arte grande `63/88` radio 10px con píldoras de **coste** (`ph-coin`) y **fuerza** (`ph-sword`), nombre 20px y `edición · nº · rareza`.
  3. **Copias que tienes**: fila `--color-surface-2` con borde de acento suave; stepper `−` 30px contorno / cifra 19px tabular / `+` 30px relleno de acento.
  4. **Habilidad**: kicker mono + párrafo 12.5px/1.6.
  5. Rejilla 2×2 de metadatos (`En tus mazos`, `Repetidas`, `Precio ref.`, `Banlist`) en `--color-surface-2`, radio 9px.
  6. Acciones: **Añadir al mazo activo** (contorno de acento, `ph-stack-plus`), y debajo **Ofrecer** (`ph-arrows-left-right`) y **Vender** (`ph-tag`) al 50%.
  7. Al pie, atajos: `← → recorrer` · `0–9 copias`.
- **Estado de la carta elegida en la grilla**: borde `0 0 0 2px var(--color-accent)` + sombra.

### 2. Modo inventariar — `2a`

Vista nueva (sugerencia: `#view-inventariar`, o un modo a pantalla completa sobre el catálogo).

- **Propósito**: recorrer una edición carta por carta marcando cantidades a máxima velocidad.
- **Fondo**: `radial-gradient(circle at 50% 34%, rgba(90,80,150,.30), transparent 62%)` sobre `--color-bg`.
- **Cabecera (60px)**: botón **Salir del modo** (`ph-x`, contorno neutro) · kicker «Inventariando»
  + nombre de la edición · barra de progreso de 4px con `carta 42 de 180` y `19 marcadas en esta
  sesión` · conmutador «Solo sin marcar» (`ph-toggle-right`) · estado de guardado.
- **Centro**: carta actual de **326px** de ancho (radio 13px, sombra `0 0 0 1px rgba(181,171,252,.4), 0 24px 60px rgba(0,0,0,.6)`),
  con las cartas anterior y siguiente a los costados a 150px, `opacity:.32` y `blur(1px)`.
  A la derecha, columna de 268px: «¿Cuántas tienes?» con `−` 46px, caja de cifra 74×60
  (tinte de acento, borde de acento, 32px `--color-accent-300`) y `+` 46px relleno; lista de
  atajos (`0–9`, `↑↓`, `→←`, `Esc`) con las teclas en píldoras mono; y **Siguiente** (contorno de acento).
- **Pie**: tira horizontal de la edición, miniaturas de 44px con badge de cantidad; la que falta,
  en gris.
- **Móvil**: misma estructura en vertical; carta 240px, stepper 52/86×66/52, «Desliza para pasar
  a la siguiente», tira de 38px y botón **Siguiente** de 46px.

### 3. Detalle de carta — `2b`

Mapea a `#modal` / `#modal-box`.

- Fondo del catálogo tapado con `rgba(10,11,20,.72)`; caja de **928px**, radio 14px, dos columnas:
  - Izquierda 356px (`--color-rail`, padding 24): arte `63/88` radio 11px + fila de copias con stepper.
  - Derecha: kicker `edición · nº`, nombre 30px, fila de etiquetas (`Aliado` con tinte de acento; `Sabio`, `Real`, `Primer Bloque` con contorno), cuatro tarjetas de stat (`Coste`, `Fuerza`, `Repetidas`, `Precio ref.`) con icono 17px y cifra 19px, **Habilidad** 13.5px/1.65, **Historia** 12.5px en cursiva al 62%, rejilla de 3 metadatos con contorno, y al pie las tres acciones.
  - Navegación `‹ › ×` de 32px arriba a la derecha (atajos ← → y Esc).
- **Móvil**: pantalla completa; el arte ocupa el ancho con el botón de volver superpuesto
  (`ph-arrow-left` sobre `rgba(12,13,24,.7)`), y debajo copias, stats, habilidad y acciones.

### 4. Colecciones / Álbum — `2c`

Mapea a `#view-colecciones`.

- **Layout**: rail 68 · lista de colecciones 230 · detalle fluido.
- **Lista**: título «Mis colecciones» + conteo; bajo él la nota `ph-dots-six-vertical` +
  «Arrastra para cambiar el orden». Cada fila: manilla de 16px (`ph-dots-six-vertical`, color
  `rgba(233,233,237,.32)`), nombre 13px/500, porcentaje mono, barra de 3px y línea de metadato 10.5px.
  - **Activa**: fondo `--color-accent-tint-soft`, borde `rgba(145,132,217,.42)`, porcentaje en `--color-accent-300`.
  - **Reordenable** (requisito explícito del usuario): `cursor:grab`; al arrastrar, la fila se
    eleva (`translateY(-2px) rotate(-.6deg)`, fondo `--color-surface-2`, sombra
    `inset 0 0 0 1px rgba(145,132,217,.5), 0 10px 24px rgba(0,0,0,.55)`, manilla en
    `--color-accent-400`) y el destino se marca con una línea de 2px `--color-accent` con
    `box-shadow: 0 0 8px rgba(145,132,217,.7)`. Persistir el orden en `store` (un campo
    `order` por colección, o el índice del array).
  - Al pie: **Nueva colección** (contorno de acento).
- **Detalle**: kicker de formato, nombre 26px, `149 de 180 · te faltan 31 · 22 repetidas`,
  acciones **Inventariar** (acento) y **Exportar PDF** (neutro); barra de 6px con el porcentaje
  en 24px; chips (`Todas`, `Las que me faltan`, `Repetidas`, `Por número`) y leyenda
  «la tienes / te falta» con cuadrados de 9px; grilla de **9 columnas**, `gap:11px`, tarjeta
  igual a la del catálogo pero compacta (número 8.5px, nombre 9.5px, badge 16px).

### 5. Cambio y ventas — `2d`

Mapea a `#view-cambios`.

- Cabecera: título + `214 repetidas · 38 ofrecidas · valor de referencia $186.400`; buscador
  «Ofrecer una carta que tengas…» y **Registrar movimiento** (contorno de acento).
- Cuatro KPI en rejilla: `Repetidas`, `Ofrecidas` (destacado con tinte y borde de acento, cifra en `--color-accent-300`), `Cambios hechos`, `Vendido este año`. Cifra 22px, etiqueta 11px, subtexto 11px.
- Dos columnas: **Ofrecidas** (filas `--color-surface` radio 11px: miniatura 42px, nombre + etiqueta `cambio` (tinte de acento) o `venta` (tinte neutro), metadato, precio 15px + referencia, y tres acciones de 30px) y **Historial** (352px; filas con icono en caja de 28px — `ph-arrows-left-right` con tinte de acento para cambios, `ph-tag` neutro para ventas —, texto 13px, fecha 11px y valor a la derecha; separador `inset 0 -1px 0 rgba(233,233,237,.06)`).
- **Móvil**: segmentado `Ofrecidas / Cambios / Ventas`, lista de ofrecidas y botón fijo **Registrar movimiento**.

### 6. Mazos — `2e`

Mapea a `#view-mazos`.

- **Layout**: rail 68 · lista de mazos 224 · composición fluida · panel «para completarlo» 300.
- Lista: nombre + total mono; segunda línea con estado — `ph-check-circle` en `--color-accent-400` si está completo, `ph-warning-circle` neutro si faltan copias.
- Composición: grupos (`Aliados`, `Talismanes y armas`, `Oros y monumentos`) con título 14px, conteo mono y regla degradada; dentro, rejilla de 2 columnas con filas de 8px: miniatura 26×36, nombre 12.5px, `×N · tienes N` y cantidad a la derecha. Si falta la copia: miniatura en gris, borde `inset 0 0 0 1px rgba(145,132,217,.32)` y metadato + cantidad en `--color-accent-300`.
- Panel derecho: tarjeta de cintillo con «Para completarlo», `6 copias` 28px, barra de 4px y nota; luego la lista **Te faltan** (miniatura gris + nombre + `N copias` en píldora de acento) y al pie **Lista de faltantes** (contorno neutro, `ph-list-checks`).

### 7. Estadísticas — `2f`

Mapea a `#view-stats`. Reemplaza los `canvas` de Chart.js por gráficos SVG/CSS propios (el
diseño no necesita la librería; si la conservas, iguala los colores).

- Filtros: `Todo el catálogo` (activo, tinte de acento), `Formato: todos`, `Edición: todas`, y **Exportar PDF**.
- Fila superior: tarjeta de cintillo de 340px con **anillo** SVG de 112px (`r=46`, `stroke-width=11`,
  pista `rgba(233,233,237,.14)`, avance `--color-accent-400`, `stroke-linecap:round`,
  `transform: rotate(-90 56 56)`, `stroke-dasharray: 126 289` para 43,5%) y la cifra en 38px;
  al lado, rejilla 3×2 de seis KPI en `--color-surface`.
- **Curva de coste**: barras CSS de 150px de alto, `gap:10px`, radio `5px 5px 2px 2px`; la barra
  máxima en `linear-gradient(180deg,#b5abfc,#5d5294)`, el resto en
  `linear-gradient(180deg,#4a4176,#2c2c46)`; valor arriba en mono 10px y etiqueta abajo 11px.
- **Por tipo**: filas con nombre, valor tabular y barra de 4px; la primera en degradado de acento.
- **Progreso por edición**: rejilla de 2 columnas; nombre + metadato, barra de 120px y porcentaje
  de 13px; `≥70%` se pinta con el degradado de acento y el porcentaje en `--color-accent-300`.

## Interactions & Behavior

- **Marcar copias**: `+` / `−` en la tarjeta (hover en escritorio, siempre visible en móvil), en
  la fila de la ficha y en el modal. Cada cambio escribe en `store` y en la nube si está activa;
  el chip de estado pasa a «Guardado». Optimista, sin recargar la grilla.
- **Teclado** (catálogo y modo inventariar): `← →` cambia de carta, `↑ ↓` suma/resta una copia,
  `0–9` fija la cantidad, `Espacio` abre la ficha grande, `Esc` cierra o sale del modo.
- **Elegir carta**: un clic en la grilla actualiza el panel de ficha (no abre el modal). El modal
  se abre con el botón de expandir, doble clic o `Espacio`.
- **Conmutador grilla/tabla**: persistir la preferencia en `store`.
- **Filtros**: los chips activos se pueden quitar con su `ph-x`; el conteo de resultados se
  actualiza en la línea de contexto.
- **Reordenar colecciones**: arrastre con manilla, línea de destino de 2px, orden persistido.
- **Modo inventariar**: al marcar, avanza solo a la siguiente carta si «Solo sin marcar» está
  activo; la tira del pie se desplaza para mantener la carta actual centrada.
- **Transiciones**: solo `opacity .14s` en el velo de acciones de la tarjeta y transformaciones
  cortas (≤160ms) en el arrastre. Sin animaciones de entrada.
- **Vacío**: la grilla vacía muestra el mensaje actual («No hay cartas que coincidan con los
  filtros») centrado, en `--color-text-55`.

## State Management

Todo vive en `localStorage` vía `js/store.js`, con sincronización opcional a Supabase
(`js/cloud.js`). Lo que el rediseño añade o toca:

| Estado | Dónde | Notas |
| --- | --- | --- |
| `qty` por carta | ya existe | fuente del gris/color y del badge |
| `selectedCardId` | memoria | alimenta el panel de ficha |
| `viewMode` (`grid` \| `table`) | store | preferencia persistente |
| `collectionsOrder` | store | nuevo: orden manual de las colecciones |
| `inventoryMode` (`editionId`, `index`, `onlyUnmarked`, `sessionCount`) | memoria | nuevo: modo inventariar |
| `activeDeckId` | ya existe | usado por «Añadir al mazo activo» |
| filtros (`ownership`, `format`, `edition`, `race`, `type`, `rarity`, `maxCost`, `sort`) | ya existe | ahora se muestran como chips |
| `syncState` | ya existe | chip «Guardado» del rail y de la cabecera |

## Assets

- **Logo**: `https://blog.myl.cl/wp-content/uploads/2020/06/logo_online-1.png` (elección del
  usuario). Para que funcione sin conexión, descárgalo al repo y sírvelo en local; el repo ya
  trae `assets/logo.jpg` (dorso de carta) como alternativa.
- **Iconos**: Phosphor Icons, hojas *regular* y *fill* (`@phosphor-icons/web@2.1.1`). Conviene
  vendorizar solo los glifos usados.
- **Arte de las cartas**: en el prototipo son placeholders. En la app real vienen de
  `card.image` (`data/custom-cards.json` y las imágenes de `data/custom-images/`).
- **Tipografía**: Inter (la del sistema de diseño).

## Files

- `Inventario MyL.dc.html` — el prototipo completo. Contiene, de arriba abajo:
  `3a` catálogo con ficha · `2a`–`2f` inventariar, detalle, colecciones, cambios, mazos,
  estadísticas · `1a`/`1b`/`1c` las tres direcciones iniciales del catálogo.
- `movil.md` — el móvil de las seis vistas: breakpoint, barra de pestañas, hoja inferior de ficha.
- `marco-holografico-rareza.md`, `foil-holografico.md` — los dos efectos de carta.
- `mazos-y-estadisticas.md` — detalle de esas dos vistas.
- `github.md` — asociación con el repo y mapa de pantalla → archivos del repo.

Archivos del repo a modificar: `index.html`, `css/styles.css`, `js/app.js` (render de la grilla,
la ficha y el modo inventariar), `js/store.js` (orden de colecciones y `viewMode`),
`js/charts.js` (opcional: reemplazable por los gráficos SVG del diseño).
