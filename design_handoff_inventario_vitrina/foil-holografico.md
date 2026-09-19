# Implementación: foil holográfico sutil en cartas premium

Instrucción autosuficiente para Claude Code. Repo `MrGerardGDJ/InventarioMYL`, rama
`claude/myl-card-inventory-app-hx8z9d`. Stack actual: HTML estático + `css/styles.css` +
módulos ES en `js/`. Sin librerías.

Complementa a `marco-holografico-rareza.md` (el aro giratorio del borde). Este documento cubre
solo la **superficie** de la carta. Referencia visual: `Inventario MyL.dc.html`, pantalla **3b**
(las premium llevan foil, vasallo y cortesano no) y las fichas de **3a** y **2e**.

## Qué hay que lograr

Sobre el arte de las cartas premium, una **retícula diagonal a 45°** — líneas cruzadas que
forman una malla de rombos, como el foil de las cartas físicas — teñida por un velo tornasol
que **se desplaza en diagonal de ida y vuelta**, en un ciclo lento de 9s. Se mezcla en
`overlay`, así que reacciona a los valores del arte: se insinúa al moverse y no compite con la
ilustración ni con el texto de la carta.

- Trama: dos retículas de 18px cruzadas (45° y −45°) más una fina de 9px que crea el punteado
  interior de los rombos.
- Movimiento: `background-position` de la capa de color, de esquina a esquina,
  `9s ease-in-out infinite alternate` (va y vuelve, no salta).
- Mezcla: `mix-blend-mode: overlay`, opacidad 0.72 (ajustable, ver §4).

## 1. CSS (en `css/styles.css`)

```css
@keyframes foil-slide {
  from { background-position: 0 0, 0 0, 0 0,   0% 100% }
  to   { background-position: 0 0, 0 0, 0 0, 100%   0% }
}

/* Superficie foil: va DENTRO del contenedor del arte, como última capa */
.foil {
  position: absolute;
  inset: 0;
  pointer-events: none;
  mix-blend-mode: overlay;
  opacity: .72;
  background-image:
    repeating-linear-gradient( 45deg, rgba(255,255,255,.75) 0 1px, transparent 1px 9px),
    repeating-linear-gradient(-45deg, rgba(255,255,255,.55) 0 1px, transparent 1px 9px),
    repeating-linear-gradient( 45deg, rgba(255,255,255,.28) 0 2px, transparent 2px 4.5px),
    linear-gradient(45deg,
      #8ad9ff, #c9a6ff 18%, #ffd1a8 34%, #fff3a8 50%,
      #a8ffd0 66%, #a8d8ff 82%, #d9b3ff);
  background-size: 18px 18px, 18px 18px, 9px 9px, 260% 260%;
  animation: foil-slide 9s ease-in-out infinite alternate;
}

@media (prefers-reduced-motion: reduce) {
  .foil { animation: none; background-position: 0 0, 0 0, 0 0, 50% 50% }
}
```

Notas:

- El orden de las cuatro capas importa: las tres retículas van **encima** del degradado de
  color; si se invierte, el foil se ve como una mancha de color plana.
- `background-size` de la capa de color es `260% 260%`: más grande que la carta, para que el
  recorrido diagonal sea un barrido suave y no un bucle visible.
- `pointer-events: none` es obligatorio: la capa cubre el arte y taparía los clics.

## 2. Markup

Se añade como último hijo del contenedor del arte, después de la trama y del velo inferior,
pero **antes** de los textos y las píldoras (número, coste, fuerza, nombre) para que el foil no
les pase por encima:

```html
<div class="holo" data-rarity="ultra-real">
  <div class="holo-art">
    <img src="..." alt="">
    <div class="art-veil"></div>     <!-- velo inferior existente -->
    <div class="foil"></div>         <!-- ← nuevo -->
    <div class="art-badges">…</div>  <!-- coste, fuerza, nº -->
    <div class="art-title">…</div>   <!-- nombre y metadatos -->
  </div>
</div>
```

El contenedor del arte ya tiene `overflow: hidden` y radio, así que la trama se recorta sola.

## 3. Cuándo se aplica (JS, `js/app.js`)

**La capa se implementa para todas las cartas**: el mismo render, el mismo markup, sin caminos
especiales por rareza. Lo único que decide si se despliega o no es una comprobación al leer la
carta: **vasallo y cortesano solo muestran foil si la carta lo declara en sus propiedades**;
cualquier otra rareza lo muestra siempre.

Reutiliza el `raritySlug()` de `marco-holografico-rareza.md`:

```js
/* Rarezas que NO llevan foil por sí mismas: necesitan que la carta lo declare */
const FOIL_OPT_IN = new Set(['vasallo', 'cortesano']);

/* La carta declara foil en sus propiedades (acepta los alias que traiga el dato) */
function declaresFoil(card) {
  if (card.foil === true) return true;
  const fields = [card.foil, card.finish, card.variant, card.acabado, card.version];
  return fields.some(v =>
    typeof v === 'string' &&
    v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes('foil')
  );
}

export function hasFoil(card) {
  if (declaresFoil(card)) return true;                 // lo declarado manda siempre
  return !FOIL_OPT_IN.has(raritySlug(card.rarity));    // el resto, foil por defecto
}
```

Al pintar la ficha, la capa siempre existe en el markup y solo se conmuta su visibilidad:

```js
artEl.querySelector('.foil').hidden = !hasFoil(card);
```

(usa `hidden`, o `display:none` vía una clase, en vez de crear y destruir el nodo: evita
reiniciar la animación al cambiar de carta.)

| Rareza | Foil |
| --- | --- |
| Vasallo | solo si la carta declara foil |
| Cortesano | solo si la carta declara foil |
| Real | sí |
| Mega Real | sí |
| Ultra Real | sí |
| Secreta | sí |
| Secreta jade | sí |
| Rareza desconocida o ausente | sí |

Si el modelo de datos llega a tener un campo de foil por copia (una misma carta puede existir en
versión normal y foil), ese campo manda: `declaresFoil()` ya lo contempla.

## 4. Dónde aplicarlo y con qué intensidad

| Lugar | Opacidad | Nota |
| --- | --- | --- |
| Ficha del catálogo (3a) y de Mazos (2e) | `.72` | el caso principal |
| Arte del modal de detalle (2b) | `.72` | igual |
| Carta grande del modo inventariar (2a) | `.6` | a esa escala la trama se lee más, conviene bajarla |
| Miniaturas (grilla, estantes, filas de mazo, tira de inventariar) | — | **no aplicar**: a 26–104px la trama se convierte en ruido y en muaré |

Si el foil resulta demasiado presente, baja `opacity` a `.5` antes de tocar cualquier otro valor;
si resulta invisible sobre artes muy oscuros, sube las tres retículas (`.75/.55/.28`) en lugar de
la opacidad global, que también reforzaría el color.

## 5. Variantes por edición (opcional)

En las cartas físicas el patrón del foil cambia según la edición. Si más adelante se quiere
reflejar, basta con cambiar el paso de las retículas manteniendo todo lo demás:

```css
.foil[data-foil="rombo"]  { background-size: 18px 18px, 18px 18px,  9px 9px, 260% 260% } /* por defecto */
.foil[data-foil="fino"]   { background-size: 11px 11px, 11px 11px,  6px 6px, 260% 260% }
.foil[data-foil="amplio"] { background-size: 26px 26px, 26px 26px, 13px 13px, 260% 260% }
```

`data-foil` saldría de la edición de la carta (`card.editionId` → patrón), no de la rareza.

## 6. Verificación

1. Sobre una carta premium se ve la malla diagonal de rombos, y el brillo recorre la carta en
   diagonal de una esquina a la otra, volviendo suavemente (sin salto al reiniciar).
2. Una vuelta completa (ida o vuelta) toma 9s.
3. Real y superiores llevan foil siempre. Un vasallo o cortesano **sin** propiedad de foil no lo
   muestra; el mismo vasallo con `foil: true` (o `finish: "foil"`) sí lo muestra.
4. El nombre, el número y las píldoras de coste/fuerza siguen legibles: la capa queda por debajo
   de ellos.
5. Los clics sobre la carta siguen funcionando (`pointer-events: none`).
6. Con `prefers-reduced-motion: reduce` la trama queda quieta y centrada, sin animación.
7. Las miniaturas de la grilla no muestran trama.
