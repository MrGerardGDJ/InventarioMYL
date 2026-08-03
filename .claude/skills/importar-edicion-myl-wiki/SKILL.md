---
name: importar-edicion-myl-wiki
description: >
  Extrae el listado completo de cartas de una edición de Mitos y Leyendas
  desde myl.fandom.com (nombre, tipo, raza, rareza, coste, fuerza, habilidad,
  historia e imagen de cada carta) y genera el CSV UTF-8 que Inventario MyL
  importa en su gestor de Ediciones. Úsala SIEMPRE que el usuario pegue una
  URL de myl.fandom.com (o solo el nombre de una edición) y diga que la
  cargues, la importes o la agregues al inventario/colección — aunque no use
  la palabra "CSV" ni "skill" explícitamente. También aplica si pide "sacar
  las cartas de tal edición del wiki" o "copiar todas las cartas de X".
---

# Importar una edición de MyL desde el wiki

## Qué hace esto y por qué en dos pasos

Extraer una edición completa (habilidad, historia, imagen de cada carta) a
mano tomaría horas. Este flujo lo automatiza en un script determinista, pero
dividido en dos responsabilidades distintas a propósito:

1. **El script (`scripts/extract_myl_edition.py`)** hace todo lo que se
   puede resolver con certeza: baja el listado, resuelve cada carta por su
   página exacta o su página base compartida, arma el CSV y un reporte de lo
   que no pudo resolver con confianza.
2. **Vos (el agente) hacés el juicio** sobre los casos ambiguos que el
   script deja en el reporte. El script **nunca** adivina — se comprobó en
   la práctica (edición Bruderschaft) que aceptar automáticamente el primer
   resultado de búsqueda del mismo tipo/rareza puede asignarle a una carta
   los datos de OTRA carta distinta (pasó con "Daphne und Gregor", que por
   error habría quedado con la imagen y el texto de "Niamh" — ambas son
   Aliado/Vasallo pero son cartas completamente distintas). Una fila vacía
   se nota y se corrige; una fila con datos de otra carta se cuela sin que
   nadie lo note. Por eso el script prefiere dejar la fila incompleta y
   avisar, en vez de arriesgarse.

## Paso 1 — Ubica la edición

Pide (o infiere de la URL que te pasó el usuario) el **nombre exacto de la
edición tal como aparece en la URL del wiki**:
`https://myl.fandom.com/es/wiki/Lista_de_cartas_de_<NOMBRE>` → el nombre es
`<NOMBRE>` con guiones bajos cambiados por espacios.

Si el usuario solo dice "carga la edición Brotherhood" sin URL, arma tú la
URL de listado con ese patrón y verifica que exista antes de seguir (ver
"Cómo consultar el wiki" abajo).

Pregunta o revisa si la edición tiene una **lista de cartas Promo separada**
(patrón `Lista de cartas Promo de <NOMBRE>`, a veces con otro nombre — hay
que revisarlo caso a caso, hazlo con una consulta a la API antes de asumir
que no existe). Si existe, pásala con `--promo-page`.

## Paso 2 — Corre el script

```bash
python3 .claude/skills/importar-edicion-myl-wiki/scripts/extract_myl_edition.py "Bruderschaft" \
  --promo-page "Lista de cartas Promo de Bruderschaft"   # solo si existe
```

Esto genera `bruderschaft.csv` y `bruderschaft_reporte.json` en el directorio
donde lo ejecutes (usa un directorio temporal de scratch, no el repo, hasta
que el CSV esté validado). El script imprime un resumen: cuántas cartas se
resolvieron por completo, cuántas quedaron sin imagen, cuántas sin resolver.

**No necesitas leer el código del script para usarlo** — solo ejecutarlo y
leer su salida. Si falla con un error de "no existe la página", revisa el
nombre exacto de la edición en la URL (a veces el wiki usa una grafía
distinta, con o sin tilde).

### Cómo consultar el wiki directamente (para el Paso 1 y para resolver el reporte)

`myl.fandom.com` tiene protección Cloudflare que **bloquea WebFetch y
navegadores automatizados** en sus páginas normales (vas a ver "Just a
moment..." o un reset de conexión). La API de MediaWiki que corre por debajo
**no tiene ese bloqueo** y da el wikitext limpio — úsala siempre en vez de
intentar renderizar la página:

```bash
# Wikitext de una página cualquiera (listado o carta individual)
curl -sS "https://myl.fandom.com/es/api.php?action=parse&page=Lista_de_cartas_de_Bruderschaft&prop=wikitext&format=json"

# Buscar el título exacto de una página cuando no se sabe cómo se llama
curl -sS "https://myl.fandom.com/es/api.php?action=query&list=search&srsearch=Hadas+Guerreras&format=json"
```

Esto es lo que usa el script por dentro; lo necesitas aparte para resolver a
mano las entradas del reporte.

### Formatos de tabla que el script ya reconoce

No todas las páginas de listado usan la misma tabla. El script soporta:

- **Encabezado "N°"** con número plano en la primera celda (la mayoría de
  las ediciones, ej. Bruderschaft: `|1`, `|2`…).
- **Encabezado "Código"** (con o sin negrita: `!Código` o `!'''Código'''`,
  varía por edición) con un código compuesto en la primera celda, ej.
  `LPE4 - 01/320 S` (ediciones "Leyendas X.0") o `MPAT 01/18` sin guion
  entre el prefijo y el número (ediciones "Mundos Perdidos"). Se extrae el
  número real de ahí con una regex — no hace falta tocar nada para este
  caso.
- **Más de una tabla en la misma página**: algunas ediciones compilatorias
  traen una segunda tabla en su propia subsección (ej. "Set Clásico" en
  Leyendas - Primera Era 4.0, con su propio código `SCLPE4 - NN/80`). El
  script recorre TODAS las tablas de la página, no solo la primera — si
  algún día una edición tiene una tercera sub-tabla con otra convención de
  código, es el lugar (`parse_list_table`) donde extenderlo.
- **Subconjuntos paralelos con numeración propia** (código con prefijo
  "SC", visto en "Set Clásico"): se cargan como cartas **especiales** con
  identificador `<prefijo>-NN` completo (ej. `SCLPE4-01`, no `SC-01` — el
  prefijo real varía por edición), no como si fueran la carta número NN del
  set principal — chocarían dos cartas distintas en el mismo `edid` si no.
- **Carta "00"** (código como `MPA 00/18`, visto en varias ediciones
  "Mundos Perdidos" — suele ser el tótem/carta firma del producto): la app
  no acepta edid menor a 1, así que se carga como **especial** con
  identificador `<prefijo>-00` en vez de forzarla a edid `000`.
- **Columna "Nota"** (6ª columna, cuando existe): documenta de qué carta y
  edición proviene un reprint (ej. "Xing Yi Quan (LPE23)"). El script la
  usa como candidato adicional ANTES de rendirse — no es una conjetura, es
  lo que el propio wiki declara como el origen exacto de esa carta.

Si te encuentras con una edición cuya tabla no calza con ninguno de estos
patrones, el script fallará con un error claro ("no se encontró la tabla de
cartas") — ahí sí hay que extender `parse_list_table` a mano.

### Imágenes: por defecto solo se confía en la página específica de la edición

El script (y el botón "Cargar desde wiki" del navegador, `js/wiki-import.js`)
**solo usan la imagen cuando viene de una página específica de la edición
que se está extrayendo** — nunca de la página base compartida ni de la
fuente citada en la Nota, aunque el resto de los datos (nombre, tipo,
habilidad…) sí se completen desde ahí. Se comprobó en más de una edición
(reportado por el usuario en Leyendas - Primera Era 4.0, y antes en otras
sin que quedara registrado) que el arte de la página base puede corresponder
a una impresión ANTERIOR de la carta, distinta de la que trae esta edición
—mismo nombre, arte parecido, pero otra habilidad, ej. Bjorn Ragnarsson
entre Leyendas 3.0 y 4.0— y mostrar esa imagen como si fuera la de esta
edición es peor que no mostrar ninguna: mejor una carta sin imagen (el
usuario la escanea después) que con la de otra carta.

Si estás seguro de que la edición que estás extrayendo es una reimpresión
1:1 **estable** de otra (mismo arte y misma habilidad en todas las cartas,
sin remakes — ej. Bruderschaft, reimpresión alemana literal de La Cofradía)
y quieres recuperar más imágenes a costa de ese riesgo, pasa
`--trust-fallback-images`. Es la excepción, no la regla — ante la duda,
deja el comportamiento por defecto y que el usuario decida si completa
alguna imagen puntual a mano.

**Mismo riesgo, sin resolver todavía, para habilidad/historia**: el texto
de una carta resuelta por página base o Nota puede corresponder también a
la versión ANTERIOR, no solo la imagen — no hay una señal tan clara para
detectarlo automáticamente como con la imagen (que se puede rastrear por su
página de origen). Si el usuario reporta una habilidad incorrecta, corrígela
a mano contra la página específica de la edición (o pídele que confirme el
texto de su carta física).

## Paso 3 — Resuelve el reporte (`sin_resolver`)

Cada entrada trae `nombre`, `pagina_intentada` y, si los hubo,
`candidatos_a_verificar_a_mano` (páginas del mismo tipo que encontró la
búsqueda, pero que el script se negó a aplicar solo). Para cada una:

1. Si no hay candidatos: probablemente el wiki en español no tiene artículo
   propio para esa carta (pasa con nombres en otro idioma cuya traducción al
   español no es literal). Puedes dejar esa fila con los datos mínimos que
   ya trae el CSV (número, nombre, tipo, rareza — vienen de la tabla del
   listado, son 100% confiables) y el resto vacío, o preguntarle al usuario
   si conoce el nombre en español.
2. Si hay candidatos: **no aceptes el primero porque el tipo coincide**. Pide
   el wikitext completo del candidato y busca una prueba independiente de
   que es la carta correcta:
   - Su ilustrador coincide con el de la carta original (si el listado no
     trae ilustrador, compáralo con el de cartas vecinas de la misma
     edición base).
   - Su campo `anterior=`/`siguiente=` menciona, o es mencionado por, otra
     carta que YA confirmaste como correcta para esta misma edición — las
     cartas de una reimpresión suelen venir en bloque de la misma edición
     base, así que si ya resolviste 5 cartas de "El Reto" para esta
     edición, es buena señal que la 6ª candidata también sea de "El Reto".
   - Cuando de verdad no hay forma de estar seguro, dilo explícitamente y
     deja la fila incompleta — no rellenes por rellenar.
3. Edita el CSV a mano (o usa el script `csv` de Python) para completar las
   filas que sí verificaste, manteniendo el resto del archivo intacto.

Sé transparente con el usuario sobre cuántas filas quedaron sin resolver y
por qué — es información real sobre el estado del wiki, no un defecto tuyo.

## Paso 4 — Entrega el resultado

El destino final es el navegador del usuario (el inventario vive en
`localStorage`, no en este entorno), así que no puedes "cargarlo" tú
directamente salvo que el usuario te esté pidiendo probarlo en un entorno de
verificación propio. Lo que sí puedes y debes hacer:

1. **Validar el CSV** contra el importador real de la app antes de
   entregarlo: sirve `index.html` con un servidor estático local, crea la
   edición en el gestor (Ediciones → + Nueva edición), sube el CSV con
   Playwright y confirma "N cartas listas para importar · sin errores" (o
   revisa a qué se deben los errores si los hay — normalmente algún dato no
   numérico en coste/fuerza, como cartas con coste "X" variable: en ese caso
   el script ya deja el número vacío y antepone "(Coste X)"/"(Fuerza X)" a
   la habilidad, pero si aparece en otra columna revísalo a mano).
2. **Entregar el archivo CSV al usuario** (herramienta de envío de archivos
   si está disponible) con instrucciones: abrir Inventario MyL → Catálogo →
   Ediciones → crear o abrir la edición → "Elegir archivo CSV".
3. Si el usuario pide explícitamente que la edición quede en el catálogo
   **compartido** del sitio (para todo el que entre, no solo su propio
   navegador — reconócelo en frases como "que aparezca en las ediciones de
   [bloque]"), en vez de una edición personal creada con el botón "Cargar
   desde wiki"/el gestor de Ediciones:
   - **Primero verifica que TOR/api.myl.cl no la tenga ya** (ver
     `conocimiento.md`, sección "¿Cómo saber si TOR/la API ya tiene una
     edición nueva?" — un `curl` a `/todas` filtrando por slugs candidatos).
     Si ya está ahí, no hace falta nada de esto: alcanza con correr el
     scraper (`node scraper/scrape.js`) o esperar la corrida semanal
     automática de GitHub Actions.
   - Si de verdad no está: agrega una entrada en `data/editions.json` (slug
     nuevo, formato/bloque correcto, nombre) en la posición cronológica que
     corresponda dentro de su bloque.
   - Convierte el CSV a objetos de carta y agrégalos a
     `data/custom-cards.json` (`cards` es un array plano; conserva lo que ya
     había). Cada carta necesita al menos `id` (único, ej.
     `{slug}__custom__{numero_o_especial}_{nombre_slug}`), `name`,
     `edition` (el slug nuevo), `editionName`, `format`, `edid` (o
     `specialId` si es una carta especial — no ambos), `type`, `race`,
     `rarity`, `cost`, `strength`, `ability`, `flavour`, `image`, y
     `"custom": true`. No hace falta `slug`/`legacyId`/`keyword` (se
     completan solos como vacíos).
   - Dejá una nota clara en `custom-cards.json` → `meta.note` y en
     `conocimiento.md` avisando que esta edición se agregó a mano porque
     TOR no la tenía a esa fecha, y que si TOR la agrega después hay que
     **quitar** este bloque para no duplicar las cartas (no hay
     reconciliación automática entre el catálogo scrapeado y el bundled).
   - Valida en la app corriendo de verdad (servidor estático + Playwright):
     que la edición aparezca en el selector agrupada en el bloque correcto,
     que las cartas se ordenen por número, y que una Colección de esa
     edición muestre las especiales (si las hay) en su propia sección.
   - Esto sí toca archivos del repo (`data/editions.json`,
     `data/custom-cards.json`): commitea y sincroniza con la rama por
     defecto y `main` igual que cualquier otro cambio que deba quedar en
     GitHub Pages.

## Notas para editar `extract_myl_edition.py` a futuro

- La plantilla `{{Carta|...}}` (y sus variantes `Cartasintexto`,
  `Cartasinhabilidad`) no tiene un orden fijo de campos ni siempre los mismos
  campos — el parser separa por `|` de nivel superior respetando `[[ ]]` y
  bloques `<tabber>`. Si agregas un campo nuevo a extraer, solo hace falta
  leer `d.get("nombre_del_campo")` del diccionario que ya arma
  `parse_card_template`.
- La API de MediaWiki de este wiki devuelve el namespace de archivo
  **localizado** ("Archivo:", no "File:") en sus respuestas aunque hayas
  preguntado con "File:" — no asumas el prefijo al limpiar el título,
  corta por el primer `:`.
- Los nombres de archivo de imagen son sensibles a mayúscula/minúscula y a
  veces la edición-específica no fue subida pero sí la genérica (o
  viceversa, o con otra extensión) — `resolve_image_urls` ya prueba esas
  variantes; si sigue faltando la imagen de alguna carta, es un hueco real
  del wiki (no hay scan subido), no un bug.
- La API normaliza "_" a " " en el título de archivo que devuelve, aunque
  se haya preguntado con "_" (ej. `Promo_Conmemorativa_01.png`) —
  `resolve_image_urls` guarda un alias con "_" además del que devuelve la
  API, o un archivo con guion bajo en el wikitext queda con imagen
  resuelta pero invisible porque la clave nunca calza con la que se buscó
  originalmente (bug real encontrado el 03-08-2026 al cargar Lootbox
  Primera Era 2024).
