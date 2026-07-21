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
3. Si el usuario pide explícitamente que actualices el repositorio (por
   ejemplo agregando la edición como parte del catálogo base en
   `data/custom-cards.json`, no como carta manual del usuario), coordina con
   él antes: eso es una decisión de producto, no un paso automático de esta
   skill.

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
