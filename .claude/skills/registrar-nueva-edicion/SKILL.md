---
name: registrar-nueva-edicion
description: >
  Orquesta el flujo completo para agregar una edición nueva de Mitos y
  Leyendas al catálogo COMPARTIDO de Inventario MyL (data/editions.json +
  data/custom-cards.json), dado solo su nombre: revisa si TOR/la API ya la
  tiene, si no la extrae del wiki, completa las imágenes que falten
  cruzando tiendas por código exacto de carta, registra todo en el
  catálogo, valida y documenta. Úsala SIEMPRE que el usuario pida
  "registrar", "agregar" o "cargar" una edición nueva al inventario/
  catálogo/colección (aunque no mencione "skill"), pida "buscar si existe
  la edición X", o describa cualquier parte de este flujo (cargar del
  wiki, completar imágenes faltantes, faltan cartas de una edición). Si
  solo pide una parte puntual (por ejemplo "complétame las imágenes que
  faltan de tal edición", o "trae las cartas de tal edición del wiki para
  mi colección personal") igual conviene abrir esta skill: te ubica en qué
  paso del flujo estás y qué principio de confianza aplica ahí.
---

# Registrar una edición nueva en el catálogo compartido

## Por qué existe esta skill

Este flujo se hizo a mano, paso a paso, más de una decena de veces durante
el desarrollo de este proyecto (CRPE2, Vigilantes de la Noche, Juego
Organizado, Lootbox PE 2024/2025, 8 ediciones "Mundos Perdidos", Leyendas -
Primera Era 4.0…). Cada vez son las mismas cuatro preguntas en el mismo
orden — ¿ya está en la API? ¿está en el wiki? ¿de dónde saco las imágenes
que falten? ¿cómo lo registro sin romper nada? — así que vale la pena
tenerlo escrito una vez. Lee primero `docs/FUENTES-DATOS.md` (qué fuentes
de datos existen y por qué) y `conocimiento.md` (histórico completo de cada
edición agregada así, con sus decisiones y sus errores reales) antes de
empezar: no repitas investigación que ya está hecha ahí.

## El principio que gobierna todo el flujo: nunca adivinar

Cada paso de abajo tiene un "cómo confiar en esto" explícito. La razón es
que este proyecto tuvo varios casi-errores reales por confiar en una
coincidencia razonable pero no verificada:

- **Nombre solo, sin más señal**: a "Daphne und Gregor" casi se le asignan
  la imagen y el texto de "Niamh" (ambas Aliado/Vasallo, cartas distintas).
  "Silencio" aparece con 3 SKU distintos en mesaredondatcg.cl, de 3
  ediciones distintas. Leyendas - Primera Era 4.0 tiene ~24 nombres
  duplicados entre variantes de rareza de la misma carta.
- **Primer resultado de una búsqueda por tipo/rareza**: mismo riesgo que el
  de arriba, solo que automatizado — nunca aceptes el primer candidato solo
  porque el tipo coincide.
- **Numeración corrida sin revisar el campo declarado**: varias ediciones
  "Mundos Perdidos" quedaron con una carta Promocional numerada como si
  fuera una carta normal más, porque el extractor no cruzó el campo
  `Frecuencia` del wiki contra la posición — bug real, corregido
  2026-08-04 (ver `conocimiento.md`).

La regla concreta: todo match se basa en una **señal verificable** — código
exacto de carta (SKU, número de producto), campo que la propia fuente
declara explícitamente (`edición=`, `Frecuencia=`), o página específica de
la edición que se está cargando. Nunca en "el nombre se parece" ni "es del
mismo tipo". Cuando no hay señal confiable, la carta se deja sin imagen (o
sin resolver) y se informa — no se rellena por rellenar. Una fila vacía se
nota y se corrige después; una fila con el dato de OTRA carta se cuela sin
que nadie lo note.

## Paso 1 — ¿Ya está en la API de TOR?

Antes de tocar nada a mano, confirma que de verdad hace falta. `conocimiento.md`
tiene la sección **"¿Cómo saber si TOR/la API ya tiene una edición nueva?"**
con el comando exacto (`curl` a `/cards/edition/todas` filtrando por texto).
Ábrela y sigue ese chequeo tal cual — no lo reinventes acá.

- **Si ya está**: no hace falta nada manual. El scraper semanal (o uno
  manual, `node scraper/scrape.js` desde `scraper/`) la trae sola. Si el
  `data/cards.json` commiteado está desactualizado (pasó una vez: 3 semanas
  de antigüedad sin recoger una edición que TOR ya tenía), correr el
  scraper completo y listo — no es un caso de "edición faltante en la API",
  es un caso de "catálogo local viejo". Verifica también que el `format`
  asignado (PE/PB/SB/FX/NE) sea el correcto en `scraper/editions.js` →
  `EDITION_SLUGS`; una edición recién descubierta por el scraper que no
  está en esa lista estática cae en "NE" por defecto.
- **Si no está**: seguí al paso 2.

## Paso 2 — Extraerla del wiki (myl.fandom.com)

Esto ya está resuelto en profundidad por la skill
**`importar-edicion-myl-wiki`** — ábrela y seguí su flujo completo (cómo
ubicar el nombre exacto de la edición, cómo consultar la API de MediaWiki
sin que te bloquee Cloudflare, qué formatos de tabla reconoce el script,
cómo tratar cartas especiales "00"/subsets con prefijo propio/columna
"Nota", y sobre todo su regla de imágenes: **solo se confía en la imagen de
la página específica de la edición**, nunca en la de una página base
compartida, aunque el resto de los datos sí se complete desde ahí — el arte
de una reimpresión puede ser el de una versión ANTERIOR de la carta.

No dupliques ese conocimiento acá. El resultado que te interesa de ese paso
es el CSV/reporte con nombre, tipo, raza, rareza, coste, fuerza, habilidad,
historia, y la imagen de las cartas donde el wiki sí la tenía en la página
específica — más una lista de cuáles quedaron sin imagen.

**Antes de seguir al paso 3**: revisa si alguna carta quedó con una
frecuencia/rareza distinta de las demás (típicamente "Promocional" en una
edición donde el resto es "Real") — eso es señal de que es una carta
especial aunque el wiki la haya numerado corrida junto con las normales
(ver el bug de Mundos Perdidos arriba). Si la ves, trátala como especial
(`specialId`) desde ahora, no la dejes como numerada para "arreglarlo
después".

## Paso 3 — Completar imágenes faltantes desde tiendas

Para las cartas que sigan sin imagen después del wiki, hay dos tiendas ya
investigadas y con técnica de match verificada (ver `conocimiento.md` para
el detalle histórico de cada una). Probá primero **mylserena.cl vía
sitemap** — es la que más cobertura dio en la práctica (252 de 265 imágenes
faltantes en un caso real, contra ~112 de un primer intento por categoría) —
y si no alcanza, **mesaredondatcg.cl por SKU**.

### 3a — mylserena.cl, recorriendo el sitemap (método preferido)

La categoría de la tienda (`/primera-era/singles-pe/<slug>`) casi siempre
está **incompleta** — no todas las páginas de producto figuran en su propia
grilla. El sitemap (`https://mylserena.cl/sitemap.xml`) sí las tiene todas.
Cada página de producto trae en su `description` (bloque JSON-LD) el número
EXACTO de la carta dentro de la edición — el mismo dato que nuestro
`edid`/`specialId`, sin depender del nombre para nada.

Usa el script ya armado para esto, `scripts/match_mylserena_sitemap.py`:

```bash
python3 .claude/skills/registrar-nueva-edicion/scripts/match_mylserena_sitemap.py \
  --code-filter <prefijo-del-slug-de-la-edicion> \
  --out /tmp/matches.json \
  --download-dir /tmp/img_descargadas   # opcional: baja las imágenes ya con extensión real
```

`--code-filter` es una subcadena que debe aparecer en el slug de la URL del
producto (mirá un producto conocido de esa edición para deducirlo — ej.
para Leyendas 4.0 los productos son `<nombre>-lpe4-<rareza>`, así que el
filtro es `lpe4`). El script hace solo la parte mecánica: baja el sitemap,
filtra, visita cada página, extrae `(prefijo, número)` y la URL de imagen
real. **No decide a qué carta de nuestro catálogo corresponde cada
resultado** — eso lo hacés vos, cruzando `(prefijo, número)` contra el
`edid`/`specialId` exacto de las cartas de la edición (nunca contra el
nombre). Un ejemplo del patrón de cruce, ya probado en la práctica:

```python
# num == int(card["edid"]) para las numeradas normales
# o prefix-num == card["specialId"] para las especiales (ej. "SCLPE4-67")
```

Si `--code-filter` no encuentra nada, es señal real de que esa tienda no
tiene la edición — no sigas insistiendo con variantes del filtro esperando
que aparezca algo.

**Verificá el tipo de archivo real antes de nombrarlo**: esta tienda a
veces sirve JPEG en una URL que termina en `.png` (o viceversa). El script
ya resuelve esto con `--download-dir` (mira el `Content-Type` real de la
respuesta, no la extensión de la URL) — si bajás las imágenes vos a mano
por otro motivo, hacé lo mismo (`file <archivo>` alcanza para confirmarlo).

### 3b — mesaredondatcg.cl, por SKU exacto

Tienda WooCommerce; cada producto trae un bloque `gtm4wp_productdata` en su
HTML con el SKU exacto (ej. `"LPE4 - 19/320 UR"`). La categoría
`https://mesaredondatcg.cl/categoria-producto/carta/` sí suele estar
completa acá (a diferencia de mylserena.cl), así que alcanza con recorrer
sus páginas de categoría/paginación y extraer ese bloque JSON por producto
— no hace falta un script dedicado, es una pasada simple:

```bash
curl -s "https://mesaredondatcg.cl/categoria-producto/carta/page/1/" \
  | grep -oP "(?<=gtm4wp_productdata\.push\().*?(?=\);)"
```

Cruza el SKU (`"LPE4 - 19/320 UR"`) exacto contra el `edid`/`specialId` de
la carta, mismo criterio que 3a. Recorré todas las páginas de paginación de
la categoría (no solo la primera).

### 3c — Otras fuentes

Antes de dar por agotadas las imágenes, revisá `docs/FUENTES-DATOS.md` (la
sección 6 lista otras páginas MyL evaluadas, con su veredicto) y buscá en
`conocimiento.md` si en alguna iteración anterior ya se investigó otra
tienda o fuente para esa misma edición o una parecida. Si encontrás una
fuente nueva no documentada, agregala a `docs/FUENTES-DATOS.md` después de
usarla (aunque sea solo para imágenes, no catálogo completo) para que la
próxima vez no haya que redescubrirla.

### Auto-hospedaje de imágenes (siempre, sin excepción)

Las imágenes que vienen de una tienda comercial **nunca se hotlinkean**
directo en `data/custom-cards.json` — se descargan y se guardan en
`data/custom-images/<fuente>/` (ej. `data/custom-images/mylserena/`,
`data/custom-images/mesaredonda/`), igual que ya se hace con
`data/custom-images/ismael.webp`. Dos motivos, ambos ya verificados en la
práctica: el CDN de estas tiendas no manda cabecera CORS (rompe el export
PDF, que dibuja las imágenes en un `<canvas>` para el efecto blanco y
negro), y no tiene sentido usar el ancho de banda ni la fotografía de
producto de un competidor comercial sin necesidad. Nombrá el archivo con la
convención ya usada en el proyecto: `<edicion_slug>_<edid_o_identificador>_<nombre_slugificado>.<ext>`.

## Paso 4 — Registrar en el catálogo compartido

Dos archivos:

- **`data/editions.json`**: agrega `{ "slug", "format", "formatName",
  "name" }` en la posición cronológica correcta dentro de su bloque (el
  archivo está ordenado por bloque/era, ese orden es el que usa la UI — no
  lo pongas al final sin más).
- **`data/custom-cards.json`**: agrega las cartas al array `cards`
  (conservá lo que ya había, no reescribas el archivo entero — inserción
  quirúrgica, ver técnica más abajo). Cada carta necesita al menos: `id`
  (**estable, único, nunca se reusa ni se muta después** — patrón
  `{slug}__custom__{numero_o_identificador}_{nombre_slugificado}`), `name`,
  `edition` (el slug nuevo), `editionName`, `format`, `edid` **o**
  `specialId` (nunca ambos a la vez), `type`, `race`, `rarity`, `cost`,
  `strength`, `ability`, `flavour`, `image`, `custom: true`.

**Numeradas vs especiales**: si la carta tiene un número secuencial normal
dentro de la edición, va con `edid` (string de 3 dígitos, ej. `"019"`) y
`specialId` vacío/ausente. Si es una carta "00" (tótem/firma del producto,
la app no acepta `edid < 1`), un subconjunto paralelo con prefijo propio
(ej. "Set Clásico" → `SCLPE4-NN`), o una carta que el wiki mismo distingue
como distinta (típicamente `Frecuencia: Promocional` entre un mar de
`Real`) aunque el listado la haya numerado corrida, va con `specialId`
(string libre, ej. `"MPA-19"`) y `edid` vacío. Mezclar esto mal ya causó
bugs reales de numeración (ver Mundos Perdidos, 2026-08-04).

**Contrato de estabilidad del `id`**: una vez asignado, un `id` nunca
cambia — inventario, mazos y colecciones de cualquiera que ya tenga
cantidades cargadas quedan keyeados por ese `id`. Si más adelante hay que
corregir un `edid`/`specialId` mal puesto (pasa — ver Paso 2, el aviso
sobre frecuencia Promocional), se corrige el campo directo si la carta es
`custom` (vive acá, en `custom-cards.json`), o se agrega una entrada a
`scraper/corrections.js` si la carta viene de la API de TOR — nunca se
toca el `id` en ninguno de los dos casos.

**Técnica de inserción quirúrgica** (para no reformatear el archivo entero
en el diff): arma cada carta nueva como un bloque JSON con
`json.dumps(carta, indent=1, ensure_ascii=False)`, reindentalo dos espacios
más, y empalmalo antes del cierre `\n ]\n}` del archivo. Para editar el
campo `image` de una carta que ya existe (por el Paso 3), ubicá el
`"id": "<id>",` exacto como marcador de texto, encontrá el cierre de ese
objeto (`\n  }`), y hacé un reemplazo acotado a esa porción — nunca un
reemplazo global de `"image": ""` en todo el archivo (pisaría la imagen de
otra carta con el mismo campo vacío).

## Paso 5 — Validar y documentar

1. `node --check` a cualquier `.js` que hayas tocado.
2. Validar los JSON: `python3 -c "import json; json.load(open('data/custom-cards.json')); json.load(open('data/editions.json'))"`.
3. Smoke test con Playwright: servidor estático local (`python3 -m http.server`)
   con `page.route('**/api.myl.cl/**', route => route.abort())` para no
   pegarle a la API real, cargar `index.html`, confirmar 0 `pageerror`, y
   verificar la edición nueva (aparece en el selector, cuenta de cartas
   correcta, una colección de esa edición muestra las especiales en su
   propia sección si las hay).
4. Agregar una entrada nueva en `conocimiento.md` → **"Registro de
   cambios"** (va ARRIBA de las demás, es orden cronológico inverso — no al
   final). Seguí el nivel de detalle de las entradas ya existentes: qué se
   buscó y dónde, qué método de match se usó para las imágenes y por qué se
   confía en él (el "cómo sé que es la carta correcta" de cada fuente),
   cuántas cartas/imágenes se resolvieron y cuántas quedaron pendientes y
   por qué (no todo tiene que resolverse — una edición con 13 cartas sin
   imagen porque ninguna tienda las tiene es un resultado válido y hay que
   decirlo tal cual).

## Paso 6 — Shippear

Este repo tiene un flujo de ramas propio de cada entorno de trabajo (no
está fijado en el código del repo). Si estás en una sesión con
instrucciones explícitas de a qué rama development/push, seguilas tal
cual. Si no tenés esa instrucción, **preguntale al usuario** antes de tocar
`main` — es una rama compartida (GitHub Pages sirve desde ahí) y pushear
sin confirmar no es una decisión que te corresponda tomar sola/o.
