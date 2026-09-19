# Móvil — implementar las seis vistas en pantalla de teléfono

Referencia de diseño: turno `4` de `Inventario MyL.dc.html` (`4a` catálogo + ficha, `4b`
colecciones + edición, `4c` mazos + mazo abierto, `4d` estadísticas). El móvil de inventariar
(`2a`), detalle (`2b`) y cambios (`2d`) ya está descrito en el README; este documento cubre el
resto y fija las reglas comunes.

Archivos del repo a modificar: `index.html`, `css/styles.css`, `js/app.js`.
Todos los tokens (`--color-*`, tipografía, radios, sombras, la regla de posesión
`grayscale(1) brightness(.68)`) son los del README — no se introduce ninguno nuevo.

## Punto de corte

Un solo breakpoint: `@media (max-width: 760px)`. Por debajo de él se aplican las reglas de
abajo; por encima queda el escritorio tal cual. El diseño se dibujó a 390×844, pero todo es
fluido: nada de anchos fijos en píxeles salvo los indicados.

```css
@media (max-width: 760px) {
  .app { grid-template-columns: 1fr; }   /* desaparecen las columnas rail + ficha */
  .rail { display: none; }
  .tabbar { display: grid; }
}
```

## 1. El rail se convierte en barra inferior de pestañas

- Contenedor fijo al fondo: `position: sticky; bottom: 0`, altura **70px** + `padding-bottom:14px`
  (área segura), fondo `--color-rail`, borde superior `0 -1px 0 rgba(233,233,237,.08)`.
- `display:grid; grid-template-columns: repeat(5,1fr)`. Cinco destinos:
  **Catálogo** `ph-squares-four` · **Álbum** `ph-books` · **Mazos** `ph-stack` ·
  **Cambios** `ph-arrows-left-right` · **Datos** `ph-chart-bar`.
  El sexto del escritorio (**Cartas**, `ph-plus-circle`) no va en la barra: pasa al menú
  `ph-dots-three` de la cabecera de catálogo.
- Cada destino: icono **21px** sobre etiqueta **9,5px**, `gap:4px`, en columna, centrado.
  Activo: icono en peso *fill* y color `--color-accent-300`. Inactivo: `rgba(233,233,237,.5)`.
- La barra solo aparece en las vistas de primer nivel. En una vista de detalle (edición abierta,
  mazo abierto) se reemplaza por la barra de acciones (punto 3).

## 2. Cabecera de pantalla

- `padding: 2px 20px 12px`, sin barra de estado propia (eso es el chrome del prototipo).
- Título **23px/500** `letter-spacing:-.02em`; debajo, línea de contexto **11,5px**
  `--color-text-55`.
- A la derecha del título, botones cuadrados de **34px**, radio 9px, `gap:7px`: contorno
  `inset 0 0 0 1px var(--color-border-strong)` para los neutros, tinte de acento
  (`--color-accent-tint`, icono `--color-accent-300`) para el activo. Icono 16px.
  El buscador de escritorio se colapsa en el botón `ph-magnifying-glass`; al pulsarlo, el campo
  sustituye a la fila del título.
- En vistas de detalle la cabecera empieza con un botón de volver de 34px (`ph-arrow-left`) y el
  título baja a **20px** con un kicker mono de 9px encima.
- **Chips de filtro**: misma píldora del escritorio a **30px** de alto, en una fila
  `overflow-x:auto` con `gap:7px`, sin barra de scroll visible y con los 20px de padding lateral
  conservados en ambos extremos.

## 3. Barra de acciones inferior (vistas de detalle)

Reemplaza la barra de pestañas. Fondo `--color-rail`, borde superior igual,
`padding: 10px 20px 12px`, `display:flex; gap:8px`.

- Acción principal: contorno de acento, **alto 46px**, radio 9px, texto 14px/500, icono 17px,
  `flex:1`.
- Acción secundaria: caja de **52×46** con contorno neutro, solo icono 18px.
- Por vista: edición abierta → **Inventariar** + `ph-file-pdf`; mazo abierto → **Añadir cartas** +
  `ph-export`; colecciones y mazos (primer nivel) → **Nueva colección** / **Nuevo mazo** a ancho
  completo, *encima* de la barra de pestañas.

Ninguna acción táctil baja de 44px de alto.

## 4. Grillas de cartas

| Vista | Columnas | `gap` | Radio | Detalle dentro de la carta |
| --- | --- | --- | --- | --- |
| Catálogo (`4a`) | 3 | 9px | 8px | nombre 11px, `tipo · rareza` 9px, badge 18px/10,5px |
| Edición abierta (`4b`) | 4 | 8px | 6px | número mono 8px, nombre 8,5px, badge 15px/9px, sin línea de rareza |

- La relación **63/88**, la trama diagonal y el velo inferior son los mismos; en la grilla de 4
  columnas la trama se estrecha a `0 5px / 5px 11px` y el velo arranca en 62%.
- **No hay hover en móvil.** El stepper `+`/`−` de la tarjeta desaparece: marcar copias se hace
  en la hoja inferior (punto 5). El badge de cantidad sigue siendo la única señal en la grilla.
- Un toque en una carta abre la hoja inferior; no abre el modal.

## 5. La ficha lateral se convierte en hoja inferior (`4a`, segunda pantalla)

El panel de 318px del escritorio pasa a ser una hoja que sube desde abajo sobre el catálogo.

- Velo sobre el contenido: `linear-gradient(rgba(10,11,20,.55), rgba(10,11,20,.88))`.
- Hoja: `border-radius: 26px 26px 0 0`, fondo `--color-surface`, sombra
  `0 -1px 0 rgba(233,233,237,.12), 0 -22px 60px rgba(0,0,0,.65)`,
  `padding: 10px 20px 22px`, contenido en columna con `gap:14px`.
  Arriba, la manilla: 38×4, radio 2px, `rgba(233,233,237,.22)`, centrada.
- Orden del contenido (el mismo de la ficha de escritorio, recompuesto):
  1. Fila superior: arte de **132px** de ancho a la izquierda (con marco holográfico y foil si
     corresponde, ver `marco-holografico-rareza.md` y `foil-holografico.md`) y a la derecha el
     kicker mono `nº 042 · Real`, nombre **24px**, línea `edición · tipo · raza`, y la fila de
     **Copias** con stepper (`−` contorno 32px · cifra 19px tabular · `+` relleno de acento 32px).
  2. Habilidad: 12,5px `line-height:1.6`, `text-wrap:pretty`.
  3. Rejilla 2×2 de metadatos en `--color-surface-2`, radio 9px, etiqueta 10,5px + valor 13px.
  4. Acciones: **Añadir al mazo activo** a ancho completo (46px, contorno de acento) y debajo
     **Ofrecer** / **Vender** al 50% (42px, contorno neutro).
- Gestos: arrastrar la manilla hacia abajo o tocar el velo la cierra; deslizar horizontalmente
  sobre el arte pasa a la carta anterior/siguiente (equivale a `← →`). El botón `ph-arrows-out`
  del escritorio se elimina: la pantalla completa de detalle (`2b`) se abre tocando el arte.
- Los atajos de teclado del pie de la ficha no se muestran en móvil.

## 6. Listas (colecciones `4b`, mazos `4c`)

- Una sola columna, `gap: 7–8px`, fila de radio 11px sobre `--color-surface`.
- **Colecciones**: manilla `ph-dots-six-vertical` de 16px a la izquierda (padding izquierdo de la
  fila reducido a 6px), nombre 14,5px + porcentaje 13px mono en la misma línea, barra de 4px,
  metadato 11px, y `ph-caret-right` de 15px al final. La nota de la cabecera cambia a
  «mantén pulsado para reordenar»: el arrastre se activa con *long press* (~350ms), no al
  primer toque, para no pelear con el scroll. La fila elevada y la línea de destino de 2px con
  `box-shadow: 0 0 8px rgba(145,132,217,.7)` son idénticas al escritorio.
- **Mazos**: nombre 15px, estado con icono 14px (`ph-check-circle` acento / `ph-warning-circle`
  neutro) + texto 11,5px, total mono 15px y `ph-caret-right`.
- La fila activa/seleccionada usa el mismo tinte de acento del escritorio.

## 7. Mazo abierto (`4c`, segunda pantalla)

- Los cuatro indicadores del panel derecho suben a una rejilla **2×2** bajo la cabecera
  (`gap:8px`, radio 11px, etiqueta 10,5px + cifra 18px); el que destaca lleva tinte y borde de
  acento con la cifra en `--color-accent-300`.
- La composición pierde la rejilla de 2 columnas: grupos en una sola columna, `gap:16px` entre
  grupos y 7px entre filas. Fila: miniatura **30×42** radio 5px, nombre 13,5px, metadato 11px,
  cantidad 15px tabular a la derecha. La carta que falta mantiene el gris, el borde
  `inset 0 0 0 1px rgba(145,132,217,.32)` y el metadato en `--color-accent-300`.
- La lista «Te faltan» del panel derecho se convierte en un grupo más al final de la
  composición, con su título y regla degradada.

## 8. Estadísticas (`4d`)

Todo en una columna desplazable, `padding: 0 20px 18px`, `gap:14px`.

- Cintillo de progreso: anillo SVG a **98px** de lado (mismo `viewBox="0 0 112 112"`, `r=46`,
  `stroke-width=11`, `stroke-dasharray:126 289`) a la izquierda y la cifra **32px** con su
  kicker y conteo a la derecha.
- Seis KPI en rejilla **2×2×2** (`repeat(2,1fr)`, `gap:8px`): etiqueta 10,5px, cifra 18px,
  subtexto 10px.
- Curva de coste: alto **120px**, `gap:6px`, radio `4px 4px 2px 2px`, etiqueta 10px bajo cada
  barra; el valor mono sobre la barra se omite por falta de ancho.
- Por tipo: filas de nombre + valor tabular en la misma línea (11,5px) y barra de 4px debajo.
- Progreso por edición: una columna; nombre 12,5px + metadato 10px a la izquierda, barra de
  **64px** y porcentaje 12,5px a la derecha.

## 9. Efectos holográficos en móvil

El marco holográfico por rareza y el foil se aplican igual que en escritorio, con dos salvedades:

- Solo en piezas grandes: el arte de la hoja inferior, la pantalla de detalle y la carta central
  del modo inventariar. **No** en las grillas de 3 o 4 columnas ni en las miniaturas de 30px —
  a ese tamaño la retícula se convierte en ruido y el coste de composición se multiplica.
- Respetar `@media (prefers-reduced-motion: reduce)`: congelar ambas animaciones
  (`animation: none`) manteniendo el degradado estático.

## Orden de implementación sugerido

1. Barra inferior de pestañas + el breakpoint que oculta rail y ficha.
2. Cabecera compacta y chips desplazables (sirven a las seis vistas).
3. Grilla de 3 columnas y hoja inferior de ficha — es la vista que más se usa.
4. Colecciones y edición abierta (incluido el *long press*).
5. Mazos y mazo abierto.
6. Estadísticas.
