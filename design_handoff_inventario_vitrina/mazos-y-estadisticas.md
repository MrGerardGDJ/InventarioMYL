# Implementación: vistas **Mazos** y **Estadísticas**

Especificación para implementar en el repo `MrGerardGDJ/InventarioMYL`
(rama `claude/myl-card-inventory-app-hx8z9d`). Stack actual: HTML estático +
`css/styles.css` + módulos ES en `js/`. No hace falta cambiar de framework.

Referencia visual: `Inventario MyL.dc.html`, pantallas **2e** (Mazos) y **2f** (Estadísticas).
Ese HTML es una **referencia de diseño**, no código para copiar: datos y arte son de ejemplo
(el arte real viene de `card.image`). Fidelidad **alta**: colores, tamaños, radios y estados
son finales.

Archivos a tocar: `index.html` (`#view-mazos`, `#view-stats`), `css/styles.css`,
`js/app.js` (render de mazo y ficha), `js/store.js` (carta seleccionada), `js/charts.js`
(opcional: los gráficos del diseño son SVG/CSS y pueden reemplazar Chart.js).

---

## 1. Tokens que usan estas dos vistas

Defínelos en `:root` y no uses hex sueltos fuera de esta lista.

| Token | Valor | Uso |
| --- | --- | --- |
| `--color-bg` | `#161826` | fondo de la vista |
| `--color-surface` | `#1c1e2c` | tarjetas de KPI, filas de carta, tarjetas de gráfico |
| `--color-surface-2` | `#232532` | campos, fila de stepper, metadatos de la ficha |
| `--color-rail` | `#191b2a` | barra de iconos y fondo del panel de ficha |
| `--color-text` | `#e9e9ed` | texto principal |
| `--color-text-70` | `rgba(233,233,237,.7)` | texto secundario |
| `--color-text-55` | `rgba(233,233,237,.55)` | etiquetas y metadatos |
| `--color-text-45` | `rgba(233,233,237,.45)` | atajos al pie |
| `--color-border` | `rgba(233,233,237,.07)` | borde de tarjeta |
| `--color-border-strong` | `rgba(233,233,237,.16)` | borde de control |
| `--color-accent` | `#9184d9` | contornos de acción, botón `+`, anillo de selección |
| `--color-accent-300` | `#d2cefd` | cifras y textos sobre tinte de acento |
| `--color-accent-400` | `#b5abfc` | iconos de acento, fin de degradados |
| `--color-accent-700` | `#5d5294` | inicio de degradados de progreso |
| `--color-accent-tint` | `rgba(145,132,217,.16)` | píldoras y estado activo |
| `--color-accent-tint-soft` | `rgba(145,132,217,.10)` | fondo del KPI destacado |
| `--color-section-a` / `-b` | `#262a60` / `#1d2040` | degradado del cintillo de progreso |

Tipografía: **Inter**, peso máximo **500** (nunca bold). Monoespaciada
(`ui-monospace, Menlo, monospace`) para kickers, conteos y valores de gráfico.
Números siempre con `font-variant-numeric: tabular-nums`.

Radios: 8px controles · 9px metadatos · 10–12px tarjetas y ficha · 4–5px miniaturas.
Relación de aspecto de toda carta: **63/88**.

Sombras (borde + oscuridad ambiental, nunca apiladas):

```css
--sh-surface:   inset 0 0 0 1px rgba(233,233,237,.07);
--sh-selected:  inset 0 0 0 2px #9184d9;                       /* fila de carta elegida */
--sh-missing:   inset 0 0 0 1px rgba(145,132,217,.32);         /* fila de copia que falta */
--sh-ficha-art: 0 0 0 1px rgba(181,171,252,.35), 0 12px 30px rgba(0,0,0,.5);
```

Estado de posesión, regla global de la app:

```css
/* la tienes */  filter: none;
/* te falta  */  filter: grayscale(1) brightness(.7);
```

Acciones: **contorno, nunca relleno** — `box-shadow: inset 0 0 0 1px var(--color-accent)`,
texto en el acento, fondo transparente, hover `rgba(145,132,217,.12)`. El relleno de acento
se reserva al botón `+` y a los badges de cantidad. Foco:
`:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px }`.

Iconos: Phosphor (`@phosphor-icons/web@2.1.1`, hojas *regular* y *fill*; *fill* solo para el
destino activo del rail).

---

## 2. Chrome compartido

```
┌────┬─────────────────────────────────────────────┐
│rail│ contenido                                    │
│68px│                                              │
└────┴─────────────────────────────────────────────┘
```

**Rail (68px, `--color-rail`, `box-shadow: 1px 0 0 rgba(233,233,237,.07)`, padding `16px 0 18px`)**:
logo arriba (`58×46`, `object-fit:contain`; fuente elegida:
`https://blog.myl.cl/wp-content/uploads/2020/06/logo_online-1.png`, alternativa local
`assets/logo.jpg`), luego seis destinos de `44×42` en columna, icono 19px + etiqueta 8px:
Catálogo `ph-squares-four` · Álbum `ph-books` · **Mazos** `ph-stack` · Cambios
`ph-arrows-left-right` · **Datos** `ph-chart-bar` · Cartas `ph-plus-circle`.
Activo: fondo `--color-accent-tint`, texto `--color-accent-300`. Hover: `rgba(233,233,237,.06)`.

**Cabecera de contenido** (padding `22px 26px 0`): kicker mono 9.5px en acento
(`letter-spacing:.13em`, mayúsculas), título 26px/500 `letter-spacing:-.02em`, línea de
contexto 12.5px en `--color-text-55`; acciones a la derecha, alto 34px, padding `0 13px`.

---

## 3. Vista **Mazos** (`#view-mazos`, pantalla 2e)

**Propósito**: ver la composición de un mazo, saber qué copias faltan para armarlo y trabajar
carta por carta sin salir de la vista.

### Layout

```
rail 68 │ lista de mazos 224 │ composición (fluida) │ ficha 318
                             └── cabecera + fila de 4 KPI arriba ──┘
```

- Lista de mazos: `width:224px`, `box-shadow: 1px 0 0 var(--color-border)`, padding `20px 16px`.
- Columna derecha (composición + ficha): cabecera, fila de KPI (`padding:18px 26px 0`),
  y debajo una fila flex (`gap:20px`, `padding:18px 26px 24px`) con la composición
  (`flex:1`, scroll propio) y la ficha (`width:318px`, scroll propio).

### 3.1 Lista de mazos (izquierda)

- Título `Mis mazos` 15px/500 + conteo 11.5px; al pie **Nuevo mazo** (contorno de acento,
  `ph-plus`, alto 36px).
- Cada fila: padding `10px 11px`, radio 9px, hover `rgba(233,233,237,.05)`.
  - Línea 1: nombre 13px/500 (elipsis) + total de cartas en mono 10px `--color-text-55`.
  - Línea 2 (estado): completo → `ph-check-circle` + texto en `--color-accent-400`;
    incompleto → `ph-warning-circle` + texto en `--color-text-55`. Tamaño 10.5px, icono 12px.
  - Mazo activo: fondo `--color-accent-tint-soft` (`rgba(145,132,217,.12)`),
    borde `inset 0 0 0 1px rgba(145,132,217,.42)`.
- Contenido de ejemplo: `Sabios de Camelot 50 · faltan 6 copias` (activo),
  `Olimpo agresivo 50 · completo`, `Faraones de control 46 · faltan 14 copias`,
  `Bestias PB 50 · completo`, `Prueba Nueva Era 32 · en borrador`,
  `Mazo de jornada 50 · faltan 2 copias`.

### 3.2 Cabecera del mazo

- Kicker: `PRIMER BLOQUE · 50 CARTAS`.
- Título: nombre del mazo, 26px.
- Contexto: `Creado en marzo · última vez jugado hace 5 días`.
- Acciones: **Exportar** (contorno neutro, `ph-export`) y **Añadir cartas**
  (contorno de acento, `ph-magnifying-glass`).

### 3.3 Fila de KPI (el detalle del mazo, arriba — como en Cambios)

`display:grid; grid-template-columns:repeat(4,1fr); gap:11px`. Cada tarjeta: padding `13px 15px`,
radio 11px, `--color-surface` + `--sh-surface`; dentro, etiqueta 11px `--color-text-55`,
cifra **22px/500** `letter-spacing:-.02em`, subtexto 11px `rgba(233,233,237,.5)`.

| Etiqueta | Cifra | Subtexto | Nota |
| --- | --- | --- | --- |
| Cartas del mazo | `50` | `24 aliados · 16 talismanes · 10 oros` | — |
| Armado | `44 de 50` | `88% con lo que tienes` | — |
| Te faltan | `6 copias` | `de 4 cartas · 2 en tus repetidas` | **destacada**: fondo `--color-accent-tint-soft`, borde `inset 0 0 0 1px rgba(145,132,217,.32)`, cifra en `--color-accent-300` |
| Coste medio | `3,4` | `legal en Primer Bloque` | — |

Todas las cifras se calculan del mazo y del inventario; «2 en tus repetidas» cruza las copias
que faltan con las cartas marcadas para cambio.

### 3.4 Composición (centro, scroll)

Grupos por tipo, `gap:18px` entre grupos:

- Encabezado de grupo: nombre 14px/500 + conteo mono 10px + regla
  `linear-gradient(to right, rgba(233,233,237,.12), transparent)` de 1px.
- Cartas del grupo: `grid-template-columns:repeat(2,1fr); gap:8px`. Cada fila: padding `8px 10px`,
  radio 9px, fondo `--color-surface`, `gap:10px`:
  - miniatura `26×36` radio 4px con el arte (`0 0 0 1px rgba(233,233,237,.1)`),
  - nombre 12.5px/500 (elipsis) y metadato 10.5px `×N · tienes N`,
  - cantidad en el mazo a la derecha, 13px/500 tabular.
  - **Copia que falta**: miniatura en gris (regla de posesión), borde `--sh-missing`,
    metadato y cantidad en `--color-accent-300`.
  - **Carta elegida**: borde `--sh-selected` (2px de acento). Un clic la selecciona y
    actualiza la ficha; no abre modal.
- Grupos y contenido de ejemplo: `Aliados` (24 cartas), `Talismanes y armas` (16),
  `Oros y monumentos` (10).

### 3.5 Ficha de la carta elegida (derecha, 318px) — **sustituye al panel «te faltan»**

Es la misma ficha del catálogo (pantalla 3a) con dos diferencias: el contador cuenta
**copias en el mazo** y las acciones son de mazo. Contenedor: radio 12px, fondo `--color-rail`,
`--sh-surface`, padding 16px, `gap:13px`, scroll propio.

1. **Barra superior**: kicker `CARTA ELEGIDA` + tres botones de 28px:
   `ph-caret-left`, `ph-caret-right`, `ph-arrows-out` (este abre el modal de detalle).
2. **Arte** `63/88`, radio 10px, con **marco holográfico giratorio** (ver §3.7); encima: trama
   `repeating-linear-gradient(48deg, rgba(233,233,237,.06) 0 7px, transparent 7px 15px)`,
   velo `linear-gradient(transparent 52%, rgba(12,13,24,.92))`, píldoras de **coste**
   (`ph-coin`) y **fuerza** (`ph-sword`) arriba a la izquierda (alto 22px, fondo
   `rgba(12,13,24,.72)`, icono en `--color-accent-400`), y al pie nombre 20px/500 +
   `edición · nº · rareza` 11.5px.
3. **En este mazo**: fila `--color-surface-2`, radio 10px, borde
   `inset 0 0 0 1px rgba(145,132,217,.28)`; stepper `−` 30px contorno · cifra 19px tabular ·
   `+` 30px relleno de acento (icono `#161826`, hover `--color-accent-400`).
   Modifica la cantidad en el mazo, no el inventario.
4. **Habilidad**: kicker mono + párrafo 12.5px/1.6 `text-wrap:pretty`.
5. **Metadatos** `grid-template-columns:1fr 1fr; gap:8px`, cada uno padding `9px 11px`, radio 9px,
   `--color-surface-2`: `Copias que tienes 4` · `En otros mazos 2 mazos` ·
   `Repetidas libres 1` (en `--color-accent-300`) · `Precio ref. $2.600`.
6. **Acciones**: **Quitar del mazo** (contorno neutro, `ph-minus-circle`, alto 36px) y debajo,
   al 50%, **En catálogo** (`ph-squares-four`, salta a la carta en el catálogo con sus filtros)
   y **Ofrecer** (`ph-arrows-left-right`).
7. **Pie**: atajos `← → recorrer` · `0–9 copias`, 11px `--color-text-45`.

La lista de faltantes ya no ocupa el panel: vive en el KPI «Te faltan» (clic → filtra la
composición a las cartas incompletas) y en la acción **Lista de faltantes**, que pasa al
menú de **Exportar**.

### 3.6 Marco holográfico del arte de la ficha

El arte de la ficha (aquí y en el catálogo) va envuelto en un marco de 2px que gira, con el
color **derivado de la rareza de la carta** (`card.rarity`):

| Rareza | Rampa (inicio → medio → claro) |
| --- | --- |
| Vasallo | `#0f2d63` → `#1f4fa3` → `#4ea3ff` → `#7ef0ff` (azul, celeste, cian) |
| Cortesano | `#5c1019` → `#8d1b24` → `#c0392b` → `#ef8b7f` (vino, rojo, rojo suave) |
| Real | `#8a5f18` → `#f2c14e` → `#ffe98f` → `#d9f26a` (dorado, amarillo, limón) |
| Mega Real | `#8d90a8` → `#d7d9e6` → `#ffffff` → `#f2f3fa` (aura blanca) |
| Ultra Real | `#20242c` → `#4a4f5a` → `#7d838f` → `#a8adb8` (grafeno, gris, gris claro) |
| Secreta | `#2a1454` → `#5b2bb0` → `#8a5cf0` → `#2f6dd8` (morado, zafiro) |
| Secreta jade | `#08321f` → `#126b45` → `#1ea87a` → `#6ff0bd` (verde, jade, esmeralda) |

Las cuatro paradas se usan en el orden `1 · 2 · 3 · 4 · 3 · 2 · 1` para que el giro no tenga
costura. El aro es de **1px** (`padding:1px`, radio 11px) y el halo exterior `inset:-5px`,
`blur(9px)`, `opacity:.3`.

```css
@property --holo-a { syntax: "<angle>"; inherits: true; initial-value: 0deg }
@keyframes holo-spin { to { --holo-a: 360deg } }

.holo {                       /* envoltorio del arte */
  position: relative;
  padding: 2px;
  border-radius: 12px;
  background: conic-gradient(from var(--holo-a),
    var(--holo-1) 0%, var(--holo-2) 14%, var(--holo-3) 28%, var(--holo-4) 42%,
    var(--holo-3) 56%, var(--holo-2) 72%, var(--holo-1) 100%);
  animation: holo-spin 12s linear infinite;
  box-shadow: 0 12px 30px rgba(0,0,0,.5);
}
.holo::before {               /* el halo que se desvanece hacia fuera */
  content: "";
  position: absolute;
  inset: -7px;
  border-radius: 18px;
  background: inherit;        /* misma rampa, mismo ángulo animado */
  filter: blur(11px);
  opacity: .34;
}
.holo > .art { position: relative; z-index: 1 }   /* el arte tapa el halo por dentro */
```

Notas de implementación: el aro interior queda nítido y la difusión va hacia fuera; **no** uses
`z-index:-1` en el `::before` (el panel opaco lo taparía), el orden de pintado con
`z-index:1` en el arte es suficiente. Respeta `@media (prefers-reduced-motion: reduce)`
deteniendo la animación (`animation: none`) y dejando el marco estático.

### 3.7 Comportamiento

- Clic en una fila de carta → selecciona y actualiza la ficha (estado `selectedCardId`).
- `← →` recorre las cartas del mazo en orden de grupo; `0–9` fija la cantidad en el mazo;
  `Espacio` abre el modal; `Esc` deselecciona.
- Cambiar cantidades recalcula los cuatro KPI y el estado de la lista de mazos al instante
  (optimista) y persiste vía `store`.
- Sin animaciones de entrada; solo hover y transiciones ≤160ms.

---

## 4. Vista **Estadísticas** (`#view-stats`, pantalla 2f)

**Propósito**: leer el avance de la colección de un golpe, con filtros de alcance.

### Layout

Rail 68 + una sola columna con scroll, `padding:22px 26px 26px`, `gap:20px` entre bloques.

### 4.1 Cabecera y filtros

- Título `Estadísticas`, contexto `Todo el catálogo · 12 ediciones seguidas`.
- A la derecha: tres selectores de 34px con `ph-caret-down` —
  `Todo el catálogo` (activo: tinte de acento `rgba(145,132,217,.14)`, borde
  `rgba(145,132,217,.42)`, texto `--color-accent-300`), `Formato: todos`, `Edición: todas` —
  y **Exportar PDF** (contorno neutro, `ph-file-pdf`).
- Los filtros corresponden a los `#stats-scope` / `#stats-format` actuales.

### 4.2 Fila superior: anillo + seis KPI

- **Tarjeta de progreso** (`width:340px`, padding 20px, radio 12px): fondo
  `linear-gradient(130deg,#262a60,#1c1e3a 65%,#1d1f33)` con un
  `radial-gradient(circle, rgba(110,116,196,.4), transparent 70%)` de 230px desplazado arriba
  a la derecha (`overflow:hidden`).
  - **Anillo SVG** 112×112: `<circle r="46" stroke-width="11">` de pista en
    `rgba(233,233,237,.14)` y otro igual de avance en `--color-accent-400`,
    `stroke-linecap:round`, `transform="rotate(-90 56 56)"`,
    `stroke-dasharray="<avance> <resto>"` sobre una circunferencia de `2π·46 ≈ 289`
    (43,5% → `126 289`).
  - Al lado: kicker `PROGRESO TOTAL` en `--color-accent-400`, cifra **38px/500**
    `letter-spacing:-.03em`, y `1.876 de 4.312 cartas` 12px.
- **Seis KPI** en `grid-template-columns:repeat(3,1fr); gap:11px`, tarjetas `--color-surface` +
  `--sh-surface`, etiqueta 11px, cifra 21px/500, subtexto 10.5px:
  `Cartas distintas 1.876 / de 4.312 del catálogo` · `Copias totales 2.418 / 214 repetidas` ·
  `Ediciones completas 3 / de 12 seguidas` (cifra en `--color-accent-300`) ·
  `Cartas propias 48 / 1 edición creada por ti` ·
  `Marcadas este mes 132 / +18% que el mes pasado` ·
  `Valor estimado $1,84M / según precios de referencia`.

### 4.3 Gráficos (`grid-template-columns:1.3fr 1fr; gap:14px`)

Ambas tarjetas: padding 18px, radio 12px, `--color-surface` + `--sh-surface`.

- **Curva de coste**: título 14px/500 + nota 11px `cartas que tienes`. Barras CSS, contenedor
  de 150px de alto, `display:flex; align-items:flex-end; gap:10px`; cada columna con valor
  arriba (mono 10px `--color-text-70`... usa `rgba(233,233,237,.6)`), barra de ancho completo,
  radio `5px 5px 2px 2px`, y etiqueta abajo 11px. La barra máxima en
  `linear-gradient(180deg,#b5abfc,#5d5294)`; el resto en
  `linear-gradient(180deg,#4a4176,#2c2c46)`.
  Datos de ejemplo (coste → cartas → alto): 0→86 38% · 1→142 62% · 2→198 86% · 3→231 100% ·
  4→186 80% · 5→148 64% · 6→96 42% · 7→54 24% · 8+→31 14%. El alto es el valor relativo al máximo.
- **Por tipo**: título 14px/500 y filas de `gap:13px`; cada fila con nombre 12px
  `rgba(233,233,237,.8)`, valor tabular `--color-text-55`, y barra de 4px radio 2px sobre
  pista `rgba(233,233,237,.09)`. La primera (mayor) en
  `linear-gradient(90deg,#5d5294,#b5abfc)`, el resto en
  `linear-gradient(90deg,#3f3a5c,#6c62a8)`.
  Datos: Aliado 812 (100%) · Talismán 401 (49%) · Oro 246 (30%) · Arma 189 (23%) ·
  Tótem 141 (17%) · Monumento 87 (11%).

Los seis `canvas` de Chart.js actuales se pueden reducir a estos dos gráficos + el anillo; si
mantienes Chart.js, iguala colores, quita rejillas y leyendas, y usa las mismas familias y
tamaños de texto.

### 4.4 Progreso por edición

- Encabezado: `Progreso por edición` 15px/500 + regla degradada.
- `grid-template-columns:repeat(2,1fr); gap:9px`. Cada fila: padding `11px 13px`, radio 10px,
  `--color-surface`, borde `inset 0 0 0 1px rgba(233,233,237,.06)`, `gap:13px`:
  nombre 13px/500 + metadato 10.5px `N de M`; barra de **120px** y 4px de alto;
  porcentaje 13px/500 tabular, ancho mínimo 38px, alineado a la derecha.
- Umbral: `≥70%` → barra en degradado de acento y porcentaje en `--color-accent-300`;
  por debajo → `linear-gradient(90deg,#3f3a5c,#6c62a8)` y porcentaje en
  `rgba(233,233,237,.75)`.
- Ejemplo: Espada Sagrada 83% · Cruzadas 64% · Helénica 53% · Imperio 38% ·
  Mundos Perdidos 47% · Dominios de Ra 17% · Onyria (tuya) 71% · Leyendas 12%.
- Clic en una fila lleva a esa colección en la vista Álbum.

### 4.5 Comportamiento

- Los tres filtros recalculan todo el bloque; el alcance (`Todo el catálogo` / `Solo las que
  tengo` / `Solo las que me faltan`) afecta a los KPI y a los dos gráficos.
- **Exportar PDF** mantiene el comportamiento actual (`#stats-export-pdf`, `js/exporters.js`),
  con la tipografía y los colores nuevos.
- Sin animación de entrada en barras ni anillo.

---

## 5. Estado

| Estado | Dónde | Notas |
| --- | --- | --- |
| `activeDeckId` | store (ya existe) | mazo abierto y destino de «Añadir al mazo activo» |
| `selectedCardId` | memoria | nuevo: alimenta la ficha de la vista Mazos y del catálogo |
| cantidades del mazo | store (ya existe) | el stepper de la ficha escribe aquí |
| `qty` del inventario | store (ya existe) | fuente de `tienes N`, del gris/color y de «Repetidas libres» |
| `statsScope`, `statsFormat`, `statsEdition` | memoria o store | filtros de Estadísticas |

Todo se guarda en `localStorage` vía `js/store.js` y se sube a Supabase si la sincronización
está activa (`js/cloud.js`); el chip «Guardado» del rail refleja el estado.
