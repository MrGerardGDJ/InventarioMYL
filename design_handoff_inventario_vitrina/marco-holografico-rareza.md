# Implementación: marco holográfico de rareza en la ficha de carta

Instrucción autosuficiente para Claude Code. Repo `MrGerardGDJ/InventarioMYL`, rama
`claude/myl-card-inventory-app-hx8z9d`. Stack actual: HTML estático + `css/styles.css` +
módulos ES en `js/`. No se introduce ninguna librería.

Referencia visual: `Inventario MyL.dc.html`, pantallas **3b** (las siete auras lado a lado),
**3a** (ficha del catálogo) y **2e** (ficha de la vista Mazos).

## Qué hay que lograr

El arte de la carta que se muestra en el panel de detalle (la ficha de la derecha, en el catálogo
y en Mazos, y también el arte grande del modal de detalle) va envuelto en un **aro de 1px que
gira**, cuyo color **sale de la rareza de la carta**, con un halo que se difumina hacia fuera:
nítido en el borde interior, desvanecido al alejarse.

- Giro: **12s**, lineal, infinito.
- Aro: `padding: 1px`, radio 11px (el arte por dentro, radio 10px).
- Halo: `inset: -5px`, radio 16px, `blur(9px)`, `opacity: .3`, misma rampa y mismo ángulo.

## 1. Tokens y CSS (en `css/styles.css`)

Añade al final del archivo. Las rampas van como variables para que la rareza solo tenga que
cambiar cuatro valores.

```css
@property --holo-a {
  syntax: "<angle>";
  inherits: true;      /* debe heredarse: el ::before lee el mismo ángulo animado */
  initial-value: 0deg;
}

@keyframes holo-spin { to { --holo-a: 360deg } }

/* Envoltorio del arte de la carta */
.holo {
  position: relative;
  padding: 1px;
  border-radius: 11px;
  background: conic-gradient(from var(--holo-a),
    var(--holo-1)   0%,
    var(--holo-2)  14%,
    var(--holo-3)  28%,
    var(--holo-4)  42%,
    var(--holo-3)  56%,
    var(--holo-2)  72%,
    var(--holo-1) 100%);
  animation: holo-spin 12s linear infinite;
  box-shadow: 0 12px 30px rgba(0, 0, 0, .5);
}

/* El halo que se desvanece hacia fuera */
.holo::before {
  content: "";
  position: absolute;
  inset: -5px;
  border-radius: 16px;
  background: inherit;   /* misma rampa, mismo ángulo */
  filter: blur(9px);
  opacity: .3;
}

/* El arte tapa el halo por dentro; deja el aro visible */
.holo > .holo-art {
  position: relative;
  z-index: 1;
  aspect-ratio: 63 / 88;
  border-radius: 10px;
  overflow: hidden;
}

/* Rampas por rareza: 4 paradas usadas en orden 1·2·3·4·3·2·1 (giro sin costura) */
.holo[data-rarity="vasallo"]     { --holo-1:#0f2d63; --holo-2:#1f4fa3; --holo-3:#4ea3ff; --holo-4:#7ef0ff }
.holo[data-rarity="cortesano"]   { --holo-1:#5c1019; --holo-2:#8d1b24; --holo-3:#c0392b; --holo-4:#ef8b7f }
.holo[data-rarity="real"]        { --holo-1:#8a5f18; --holo-2:#f2c14e; --holo-3:#ffe98f; --holo-4:#d9f26a }
.holo[data-rarity="mega-real"]   { --holo-1:#8d90a8; --holo-2:#d7d9e6; --holo-3:#ffffff; --holo-4:#f2f3fa }
.holo[data-rarity="ultra-real"]  { --holo-1:#20242c; --holo-2:#4a4f5a; --holo-3:#7d838f; --holo-4:#a8adb8 }
.holo[data-rarity="secreta"]     { --holo-1:#2a1454; --holo-2:#5b2bb0; --holo-3:#8a5cf0; --holo-4:#2f6dd8 }
.holo[data-rarity="secreta-jade"]{ --holo-1:#08321f; --holo-2:#126b45; --holo-3:#1ea87a; --holo-4:#6ff0bd }

/* Fallback: rareza desconocida o ausente → acento del sistema, sin color de rareza */
.holo { --holo-1:#3f3a5c; --holo-2:#5d5294; --holo-3:#9184d9; --holo-4:#b5abfc }

@media (prefers-reduced-motion: reduce) {
  .holo { animation: none }
}
```

Tabla de rampas (para referencia y para el mapa de rarezas):

| `data-rarity` | Rareza | Rampa |
| --- | --- | --- |
| `vasallo` | Vasallo | azul · celeste · cian |
| `cortesano` | Cortesano | vino · rojo · rojo suave |
| `real` | Real | dorado · amarillo · limón |
| `mega-real` | Mega Real | aura blanca |
| `ultra-real` | Ultra Real | grafeno · gris · gris claro |
| `secreta` | Secreta | morado · zafiro |
| `secreta-jade` | Secreta jade *(nombre provisional, confirmar)* | verde · jade · esmeralda |

## 2. Markup

Donde hoy se pinta el arte de la ficha, envuélvelo:

```html
<div class="holo" data-rarity="real">
  <div class="holo-art">
    <img src="..." alt="">
    <!-- las capas existentes: trama, velo inferior, píldoras de coste/fuerza, nombre -->
  </div>
</div>
```

Reglas:

- El `box-shadow` de borde que tenía el arte (`0 0 0 1px rgba(181,171,252,.35)`) **se elimina**:
  el aro lo reemplaza.
- El contenedor padre no necesita `z-index` ni `isolation`. **No** uses `z-index: -1` en el
  `::before`: el panel de la ficha es opaco y lo taparía; el orden de pintado con
  `z-index: 1` en `.holo-art` es suficiente.
- El halo sobresale 5px: deja al menos 6px de aire alrededor del arte dentro del panel.

## 3. JS (en `js/app.js`)

Un normalizador de rareza a slug y su aplicación al renderizar la ficha:

```js
const RARITY_SLUG = {
  'vasallo': 'vasallo',
  'cortesano': 'cortesano',
  'real': 'real',
  'mega real': 'mega-real',
  'ultra real': 'ultra-real',
  'secreta': 'secreta',
  'secreta jade': 'secreta-jade',
};

export function raritySlug(rarity) {
  if (!rarity) return '';
  const key = String(rarity)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // quita acentos
    .replace(/\s+/g, ' ')
    .trim();
  return RARITY_SLUG[key] || '';
}
```

Al pintar la ficha:

```js
holoEl.dataset.rarity = raritySlug(card.rarity);   // '' → cae al fallback de acento
```

Si `data/custom-cards.json` usa otros nombres para las rarezas, amplía `RARITY_SLUG` con esos
alias en vez de tocar el CSS.

## 4. Dónde aplicarlo

| Lugar | Archivo / selector | Nota |
| --- | --- | --- |
| Ficha del catálogo (3a) | `#view-coleccion`, panel de detalle de 318px | el caso principal |
| Ficha de Mazos (2e) | `#view-mazos`, panel de detalle de 318px | idéntico; el contador es «En este mazo» |
| Modal de detalle (2b) | `#modal-box`, columna izquierda | mismo envoltorio, radio del arte 11px → aro 12px |
| Carta grande del modo inventariar (2a) | vista de inventariar | opcional; si lo aplicas, sube el halo a `inset:-7px` y `blur(11px)` por la escala |

**No** lo apliques a las miniaturas de la grilla, de los estantes del álbum, de las filas de mazo
ni de la tira de inventariar: ahí la rareza ya se comunica con el texto y el aro sería ruido.

## 5. Verificación

1. El aro se ve de 1px, nítido, y el halo se desvanece hacia fuera sin borde duro.
2. Una vuelta completa toma 12s y no se nota la costura del degradado.
3. Cambiar de carta cambia el color del aro según su rareza; una carta sin rareza conocida
   muestra el aro de acento.
4. Con `prefers-reduced-motion: reduce` el aro queda estático y conserva el color.
5. El halo no queda tapado por el fondo del panel (si desaparece, revisa que no haya vuelto a
   aparecer un `z-index: -1` en el `::before`).
