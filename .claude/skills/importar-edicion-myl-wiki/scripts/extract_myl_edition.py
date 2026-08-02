#!/usr/bin/env python3
"""
Extrae el listado de cartas de una edición desde myl.fandom.com (wiki de
Mitos y Leyendas) y genera un CSV UTF-8 listo para importar en Inventario MyL
(Ediciones -> [edición] -> Elegir archivo CSV).

Uso:
  python3 extract_myl_edition.py "Bruderschaft" [--promo-page "Lista de cartas Promo de Bruderschaft"]

El primer argumento es el nombre de la edición tal como aparece en la URL del
wiki: https://myl.fandom.com/es/wiki/Lista_de_cartas_de_<NOMBRE>
(usa espacios o guiones bajos, cualquiera funciona).

Salida (en el directorio actual):
  <edicion>.csv           listo para importar en la app
  <edicion>_reporte.json  huecos y advertencias para revisar antes de importar
"""
import sys
import re
import json
import csv
import io
import time
import argparse
import subprocess
import urllib.parse

API = "https://myl.fandom.com/es/api.php"


# ===================== HTTP =====================
# curl (no requests) porque el entorno enruta todo por un proxy HTTPS que
# curl respeta de forma nativa vía la env var HTTPS_PROXY; algunos clientes
# HTTP de Python no la leen igual. Si migras esto a otra máquina sin ese
# proxy, curl simple sigue funcionando.
def api_get(params):
    url = API + "?" + urllib.parse.urlencode(params)
    out = subprocess.run(
        ["curl", "-sS", "-H", "User-Agent: Mozilla/5.0", url],
        capture_output=True, text=True, timeout=30,
    )
    if out.returncode != 0 or not out.stdout:
        raise RuntimeError(f"curl falló para {url}: {out.stderr[:300]}")
    return json.loads(out.stdout)


def fetch_wikitext(page_title):
    d = api_get({
        "action": "parse", "page": page_title, "prop": "wikitext",
        "format": "json",
    })
    if "error" in d:
        return None
    return d["parse"]["wikitext"]["*"]


def fetch_contents(titles, redirects=True):
    """Trae el wikitext de varias páginas a la vez (lotes de 40)."""
    out = {}
    titles = list(titles)
    for i in range(0, len(titles), 40):
        chunk = titles[i:i + 40]
        params = {
            "action": "query", "prop": "revisions", "rvprop": "content",
            "titles": "|".join(chunk), "format": "json", "formatversion": "2",
        }
        if redirects:
            params["redirects"] = "1"
        d = api_get(params)
        for p in d.get("query", {}).get("pages", []):
            if p.get("missing") or "revisions" not in p:
                continue
            out[p["title"]] = p["revisions"][0]["content"]
        time.sleep(0.2)
    return out


def search_titles(query, limit=6):
    d = api_get({
        "action": "query", "list": "search", "srsearch": query,
        "format": "json", "formatversion": "2", "srlimit": limit,
    })
    return [r["title"] for r in d.get("query", {}).get("search", [])
            if "Lista de cartas" not in r["title"]]


def resolve_image_urls(files):
    """File/Archivo -> URL real. Prueba variantes de mayúscula/extensión si
    la primera búsqueda falla (huecos reales de subida en el wiki)."""
    files = sorted(set(f for f in files if f))
    url_by_file = {}

    def query_batch(names):
        found = {}
        titles = ["File:" + n for n in names]
        for i in range(0, len(titles), 40):
            d = api_get({
                "action": "query", "titles": "|".join(titles[i:i + 40]),
                "prop": "imageinfo", "iiprop": "url",
                "format": "json", "formatversion": "2",
            })
            for p in d.get("query", {}).get("pages", []):
                title = p.get("title", "")
                # OJO: la API devuelve el namespace LOCALIZADO ("Archivo:" en
                # es.fandom, no "File:"), así que no asumas el prefijo — corta
                # por el primer ":" en vez de hacer title.replace("File:","").
                clean = title.split(":", 1)[1] if ":" in title else title
                if not p.get("missing") and "imageinfo" in p:
                    found[clean] = p["imageinfo"][0]["url"]
            time.sleep(0.15)
        return found

    url_by_file.update(query_batch(files))
    missing = [f for f in files if f not in url_by_file]
    if missing:
        variants = {}
        for f in missing:
            opts = {f[0].upper() + f[1:]}
            base = re.sub(r"\s*\([^)]*\)\.", ".", f)  # quita "(Edición)" antes de la extensión
            base = re.sub(r"\s+[A-ZÀ-ÿ][\wÀ-ÿ]*\.(jpg|png)$", r".\1", f)  # quita " Edicion.ext"
            opts.add(base[0].upper() + base[1:])
            opts.add(f.replace(".jpg", ".png"))
            opts.add(f.replace(".png", ".jpg"))
            variants[f] = opts
        all_opts = sorted(set().union(*variants.values())) if variants else []
        found = query_batch(all_opts)
        for f, opts in variants.items():
            for o in opts:
                if o in found:
                    url_by_file[f] = found[o]
                    break
    return url_by_file


# ===================== Parseo de la tabla de listado =====================
# El wiki usa (al menos) dos convenciones de encabezado para la tabla de
# cartas:
#   1) "!'''N°'''" con la primera celda de cada fila como un número plano
#      (la mayoría de las ediciones, ej. Bruderschaft: "1", "2", "3"…).
#   2) "!Código" con un código compuesto en la primera celda, ej.
#      "LPE4 - 01/320 S" (ediciones "Leyendas X.0"). Además, estas tablas
#      compilatorias suelen mezclar en la MISMA tabla un segundo subconjunto
#      con su propia numeración — ej. "Set Clásico" con prefijo "SC" y
#      códigos como "SCLPE4 - 77/80" — que no es la carta #77 de la edición,
#      sino la #77 de OTRO subconjunto paralelo de 80 cartas. Tratar esas
#      filas como si fueran del mismo número llevaría a que dos cartas
#      distintas (ej. LPE4 #77 y SCLPE4 #77) choquen en el mismo edid. Por
#      eso las filas con prefijo "SC" se devuelven como "especiales" (con un
#      identificador propio "SC-NN"), reusando el mismo mecanismo de cartas
#      promocionales/especiales que ya soporta la app — no es forzado: es
#      exactamente lo que son, un subconjunto paralelo con su numeración.
_CODE_RE = re.compile(r"^(SC)?[A-ZÀ-ÿ0-9]+\s*-\s*(\d+)\s*/\s*\d+")


def parse_list_table(wikitext):
    """Devuelve (numbered, specials): cartas numeradas normalmente, y las
    que resultaron ser de un subconjunto paralelo con su propio código
    (ver _CODE_RE arriba) como especiales.

    Algunas páginas traen MÁS DE UNA tabla de cartas (ej. "Leyendas - Primera
    Era 4.0": la tabla principal bajo "==Cartas==" y una segunda tabla del
    "Set Clásico" bajo su propio subtítulo "===Set Clásico===", cada una con
    su propio "|}" de cierre) — hay que recorrer TODAS las tablas de la
    página, no solo la primera, o se pierde en silencio todo lo que viene
    después del primer "|}"."""
    markers = list(re.finditer(r"!'''N°'''|!Código", wikitext))
    if not markers:
        raise RuntimeError(
            "No se encontró ninguna tabla de cartas (ni columna N° ni Código). "
            "Puede que esta edición liste las cartas de otra forma; revisa "
            "el wikitext a mano."
        )

    numbered, specials = [], []
    for m in markers:
        header_kind = "codigo" if m.group(0) == "!Código" else "numero"
        start = m.start()
        end = wikitext.find("|}", start)
        table = wikitext[start:end if end != -1 else len(wikitext)]

        for raw in re.split(r"\n\|-\n", table):
            raw = raw.strip()
            if not raw or raw.startswith("!") or raw.startswith("class="):
                continue
            cells = [ln.strip()[1:].strip() for ln in raw.split("\n")
                     if ln.strip().startswith("|")]
            if len(cells) < 4:
                continue

            if header_kind == "numero":
                if not re.match(r"^\d+$", cells[0]):
                    continue
                num, special_id = int(cells[0]), None
            else:
                code_m = _CODE_RE.match(cells[0])
                if not code_m:
                    continue
                if code_m.group(1):  # prefijo "SC": subconjunto paralelo
                    num, special_id = None, f"SC-{int(code_m.group(2)):02d}"
                else:
                    num, special_id = int(code_m.group(2)), None

            name_link = re.match(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]", cells[1])
            if not name_link:
                continue
            # La columna "Nota" (6ª, cuando existe) suele documentar de qué
            # carta/edición proviene un reprint, ej. "Xing Yi Quan (LPE23)".
            # Cuando no es un enlace (texto libre tipo "Nueva - Fulano de
            # Tal" para cartas inéditas) no hay página fuente que probar.
            note_title = None
            if len(cells) > 5:
                note_m = re.match(r"\[\[([^\]|]+)", cells[5])
                if note_m:
                    note_title = note_m.group(1)
            card = {
                "num": num, "special_id": special_id,
                "page_title": name_link.group(1),
                "note_title": note_title,
                "name": name_link.group(2) or name_link.group(1),
                "type": strip_wiki(cells[2]),
                "rarity": strip_wiki(cells[3]) if len(cells) > 3 else "",
            }
            (specials if special_id else numbered).append(card)

    numbered.sort(key=lambda c: c["num"])
    return numbered, specials


def parse_promo_table(wikitext):
    """Listas 'Promo' suelen usar Código/Identificador en vez de número.
    Se acepta cualquier columna no-numérica como identificador especial."""
    cards = []
    # Reusa el mismo separador de filas; primera celda es el identificador
    # (puede ser texto: "Promo", "P-001"...), la segunda el nombre enlazado.
    rows = re.split(r"\n\|-\n", wikitext)
    for raw in rows:
        raw = raw.strip()
        if not raw or raw.startswith("!") or raw.startswith("class="):
            continue
        cells = [ln.strip()[1:].strip() for ln in raw.split("\n")
                 if ln.strip().startswith("|")]
        if len(cells) < 2:
            continue
        name_link = re.match(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]", cells[1])
        if not name_link:
            continue
        ident = strip_wiki(cells[0])
        if not ident or re.match(r"^\d+$", ident):
            continue  # esto ya es una carta numerada normal, no especial
        cards.append({
            "special_id": ident,
            "page_title": name_link.group(1),
            "name": name_link.group(2) or name_link.group(1),
            "type": strip_wiki(cells[2]) if len(cells) > 2 else "",
            "rarity": strip_wiki(cells[3]) if len(cells) > 3 else "",
        })
    return cards


# ===================== Parseo de la plantilla {{Carta...}} =====================
def extract_template(text):
    m = re.search(r"\{\{Carta\w*", text)
    if not m:
        return None
    i, depth, j = m.start(), 0, m.start()
    while j < len(text):
        if text[j:j + 2] == "{{":
            depth += 1
            j += 2
            continue
        if text[j:j + 2] == "}}":
            depth -= 1
            j += 2
        if depth == 0:
            break
        j += 1
    return text[i + len(m.group(0)):j - 2] if depth == 0 else None


def split_fields(body):
    """Separa por '|' de nivel superior, respetando [[ ]] anidados y
    bloques <tabber>...</tabber> (usados para variantes Digital/Scan de la
    imagen). OJO: '<tabber>' son 8 caracteres y '</tabber>' son 9 — un
    desfase de índice aquí hace que las imágenes con tabber se pierdan
    silenciosamente (bug real encontrado la primera vez que se escribió
    este parser)."""
    fields, cur, depth_br, in_tabber, i = [], "", 0, False, 0
    while i < len(body):
        if body[i:i + 8] == "<tabber>":
            in_tabber = True
        if body[i:i + 9] == "</tabber>":
            in_tabber = False
        if body[i:i + 2] == "[[":
            depth_br += 1
            cur += body[i:i + 2]
            i += 2
            continue
        if body[i:i + 2] == "]]":
            depth_br -= 1
            cur += body[i:i + 2]
            i += 2
            continue
        ch = body[i]
        if ch == "|" and depth_br == 0 and not in_tabber:
            fields.append(cur)
            cur = ""
            i += 1
            continue
        cur += ch
        i += 1
    fields.append(cur)
    return fields


def parse_card_template(text):
    body = extract_template(text)
    if body is None:
        return {}
    data = {}
    for f in split_fields(body):
        if "=" not in f:
            continue
        k, v = f.split("=", 1)
        data[k.strip().lower()] = v.strip()
    return data


def strip_wiki(s):
    if not s:
        return ""
    s = re.sub(r"\[\[:?Categoría:([^|\]]+)\|?([^\]]*)\]\]", lambda m: m.group(2) or m.group(1), s)
    s = re.sub(r"\[\[([^|\]]+)\|([^\]]+)\]\]", r"\2", s)
    s = re.sub(r"\[\[([^\]]+)\]\]", r"\1", s)
    return s.replace("'''", "").replace("''", "").strip()


def first_image_file(imagen_field):
    if not imagen_field:
        return None
    m = re.search(r"\[\[(?:File|Archivo):([^|\]]+)", imagen_field)
    return m.group(1).strip() if m else None


def norm(s):
    s = (s or "").lower()
    for a, b in zip("áéíóúñ", "aeioun"):
        s = s.replace(a, b)
    return re.sub(r"[^a-z]", "", s)


# ===================== Resolución de la página de cada carta =====================
def resolve_card_content(card, edition_name, contents, report):
    """Intenta, en orden de confianza decreciente:
    1) '{nombre} ({edición})' — página específica de esta edición.
    2) '{nombre}' — página base/genérica (frecuente en cartas Oro y
       reimpresiones que comparten arte/texto con la edición original).
    3) La página que el propio wiki cita como fuente en la columna "Nota"
       de la tabla de listado (cuando existe), ej. "Xing Yi Quan (LPE23)"
       para una carta reimpresa. No es una conjetura: es lo que el wiki
       mismo documenta como el origen exacto de esa carta.
    4) Búsqueda por texto: NUNCA se aplica automáticamente, aunque el tipo
       coincida. Se probó (con la edición Bruderschaft) que dos cartas
       distintas del mismo tipo/rareza pueden aparecer como candidato de
       búsqueda una de la otra — se llegó a asignar por error la imagen y el
       texto de "Niamh" a la carta "Daphne und Gregor" solo porque ambas son
       Aliado/Vasallo. El tipo coincidiendo NO basta como prueba de que es
       la misma carta. Por eso los candidatos de búsqueda solo se anotan en
       el reporte para que se verifiquen a mano (por ejemplo revisando si el
       candidato u otras cartas cercanas de esa MISMA edición base
       mencionan el nombre buscado en sus campos 'anterior'/'siguiente')
       antes de aceptarlos — nunca se rellenan solos en el CSV.
    """
    title = card["page_title"]
    base = re.sub(r"\s*\([^)]*\)\s*$", "", title).strip()
    # OJO: cuando el enlace del wiki no trae ningún paréntesis de
    # desambiguación (ej. "[[Carta Dos]]"), "title" y "base" son literalmente
    # el mismo string — comprobar "title in contents" en ese caso encuentra
    # exactamente la misma página compartida que "base in contents", así que
    # NO es prueba de que sea específica de esta edición. Solo cuenta como
    # "específica" cuando title trae su propio paréntesis (title != base):
    # ahí sí el wiki está distinguiendo esta versión de otras (ej. "(LPE4)",
    # "(Secreta)", "(Bruderschaft)").
    specific = f"{title} ({edition_name})" if f"({edition_name})" not in title else title
    if specific in contents:
        return contents[specific], specific, "específica"
    if title != base and title in contents:
        return contents[title], title, "específica"
    if base in contents:
        return contents[base], base, "página base (compartida con otra edición)"
    note_title = card.get("note_title")
    if note_title and note_title in contents:
        return contents[note_title], note_title, "fuente citada en la Nota del listado"

    candidates = search_titles(base or card["name"])
    time.sleep(0.15)
    plausible = []
    if candidates:
        cd = fetch_contents(candidates, redirects=False)
        for cand_title, txt in cd.items():
            d = parse_card_template(txt)
            if norm(d.get("tipo", "")) == norm(card["type"]) and card["type"]:
                plausible.append(cand_title)
    report["sin_resolver"].append({
        "nombre": card["name"], "pagina_intentada": title,
        "candidatos_a_verificar_a_mano": plausible,
        "motivo": (
            "sin página específica ni base; hay candidatos del mismo tipo pero "
            "NO se aplicaron automáticamente (alto riesgo de asignar la carta "
            "equivocada) — verifícalos a mano antes de completar esta fila"
            if plausible else
            "sin página específica, base, ni candidatos de búsqueda del mismo tipo"
        ),
    })
    return None, None, None


def build_row(card, txt, special_id="", trust_image=True):
    d = parse_card_template(txt) if txt else {}
    coste = d.get("coste de oro", "").strip()
    fuerza = d.get("ataque", "").strip()
    habilidad = strip_wiki(d.get("habilidad", ""))
    # Cartas con coste o fuerza "X" (variable): el esquema CSV exige números,
    # así que el valor se deja vacío y la aclaración se antepone a la
    # habilidad para no perder la información.
    if fuerza.upper() == "X":
        fuerza = ""
        habilidad = "(Fuerza X) " + habilidad
    if coste.upper() == "X":
        coste = ""
        habilidad = "(Coste X) " + habilidad
    # trust_image=False: la página de donde salió el dato NO es específica de
    # esta edición (se llegó por página base o por la Nota). Para ediciones
    # "remake"/aniversario esa imagen puede ser la de OTRA impresión distinta
    # de la carta (arte reciclado pero con habilidad/tratamiento distintos —
    # comprobado en la práctica con Leyendas - Primera Era 4.0, donde el wiki
    # aún no tenía escaneadas muchas cartas nuevas y el fallback traía el
    # arte de Leyendas 3.0 u otra edición). En ese caso mejor sin imagen que
    # con una que puede no ser la carta real — el usuario la escanea después.
    img_file = first_image_file(d.get("imagen", "")) if trust_image else None
    return {
        "numero": "" if special_id else card.get("num", ""),
        "especial": special_id,
        "nombre": card["name"],
        "tipo": strip_wiki(d.get("tipo", "")) or card.get("type", ""),
        "raza": strip_wiki(d.get("raza", "")),
        "rareza": strip_wiki(d.get("frecuencia", "")) or card.get("rarity", ""),
        "coste": coste,
        "fuerza": fuerza,
        "habilidad": habilidad,
        "historia": strip_wiki(d.get("texto", "")),
        "_image_file": img_file,
    }


# ===================== Programa principal =====================
def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("edition", help='Nombre de la edición, ej. "Bruderschaft"')
    ap.add_argument("--list-page", help="Título exacto de la página de listado, si difiere del patrón estándar")
    ap.add_argument("--promo-page", help='Página de cartas Promo, ej. "Lista de cartas Promo de Brotherhood"')
    ap.add_argument("--out", help="Ruta del CSV de salida (por defecto <edicion>.csv)")
    ap.add_argument(
        "--trust-fallback-images", action="store_true",
        help=(
            "Por defecto SOLO se usa la imagen cuando viene de una página "
            "específica de la edición que se está extrayendo (nunca de la "
            "página base ni de la fuente citada en la Nota): se comprobó en "
            "más de una edición que el arte de la página base puede "
            "corresponder a una impresión ANTERIOR distinta de la carta "
            "(mismo nombre, arte parecido, pero otra habilidad — ej. Bjorn "
            "Ragnarsson entre Leyendas 3.0 y 4.0). Pasa este flag SOLO si "
            "estás seguro de que esta edición es una reimpresión 1:1 estable "
            "de otra (mismo arte y misma habilidad en todas las cartas, sin "
            "remakes) y quieres recuperar más imágenes a costa de ese riesgo."
        ),
    )
    args = ap.parse_args()

    edition_name = args.edition.strip()
    list_page = args.list_page or f"Lista de cartas de {edition_name.replace('_', ' ')}"
    out_csv = args.out or re.sub(r"\s+", "_", edition_name.lower()) + ".csv"
    report = {"edicion": edition_name, "sin_resolver": [], "sin_imagen": [], "imagen_descartada_por_confianza": []}

    print(f"Descargando listado: {list_page}")
    wikitext = fetch_wikitext(list_page)
    if wikitext is None:
        print(f"ERROR: no existe la página '{list_page}'. Revisa el nombre exacto en la URL del wiki.")
        sys.exit(1)

    cards, specials = parse_list_table(wikitext)
    print(f"{len(cards)} cartas numeradas encontradas (rango {cards[0]['num']}-{cards[-1]['num']})")
    if specials:
        print(f"{len(specials)} cartas de un subconjunto paralelo (mismo listado, código propio) — se tratan como especiales")

    if args.promo_page:
        print(f"Descargando promocionales: {args.promo_page}")
        promo_wt = fetch_wikitext(args.promo_page)
        if promo_wt:
            promo_specials = parse_promo_table(promo_wt)
            specials += promo_specials
            print(f"{len(promo_specials)} cartas especiales/promocionales encontradas")
        else:
            print(f"Aviso: no se encontró '{args.promo_page}'; se omiten promocionales.")

    all_items = cards + specials
    titles_needed = set()
    for c in all_items:
        titles_needed.add(c["page_title"])
        titles_needed.add(f"{c['page_title']} ({edition_name})")
        titles_needed.add(re.sub(r"\s*\([^)]*\)\s*$", "", c["page_title"]).strip())
        if c.get("note_title"):
            titles_needed.add(c["note_title"])
    print(f"Descargando el contenido de {len(titles_needed)} páginas candidatas...")
    contents = fetch_contents(titles_needed)

    def image_trusted(confidence):
        return args.trust_fallback_images or confidence == "específica"

    rows = []
    for c in cards:
        txt, _, confidence = resolve_card_content(c, edition_name, contents, report)
        trust_image = image_trusted(confidence)
        row = build_row(c, txt, trust_image=trust_image)
        rows.append(row)
        if not row["_image_file"]:
            report["sin_imagen"].append(c["name"])
            if txt and not trust_image:
                report["imagen_descartada_por_confianza"].append(c["name"])
    for c in specials:
        txt, _, confidence = resolve_card_content(
            {"page_title": c["page_title"], "name": c["name"], "type": c["type"],
             "note_title": c.get("note_title")},
            edition_name, contents, report,
        )
        trust_image = image_trusted(confidence)
        row = build_row(c, txt, special_id=c["special_id"], trust_image=trust_image)
        rows.append(row)
        if not row["_image_file"]:
            report["sin_imagen"].append(c["name"])
            if txt and not trust_image:
                report["imagen_descartada_por_confianza"].append(c["name"])

    print("Resolviendo URLs de imagen...")
    files = {r["_image_file"] for r in rows if r["_image_file"]}
    url_by_file = resolve_image_urls(files)

    headers = ["numero", "especial", "nombre", "tipo", "raza", "rareza",
               "coste", "fuerza", "habilidad", "historia", "imagen"]
    buf = io.StringIO()
    w = csv.writer(buf, quoting=csv.QUOTE_MINIMAL)
    w.writerow(headers)
    for r in rows:
        img = url_by_file.get(r["_image_file"], "") if r["_image_file"] else ""
        w.writerow([r[h] if h != "imagen" else img for h in headers])
    with open(out_csv, "w", encoding="utf-8", newline="") as f:
        f.write("﻿" + buf.getvalue())  # BOM: Excel/Sheets lo abren directo como UTF-8

    report_path = re.sub(r"\.csv$", "", out_csv) + "_reporte.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)

    print(f"\n{len(rows)} cartas escritas en {out_csv}")
    print(f"  con imagen: {sum(1 for r in rows if url_by_file.get(r['_image_file']))}")
    print(f"  sin resolver: {len(report['sin_resolver'])}  |  sin imagen: {len(report['sin_imagen'])}")
    if not args.trust_fallback_images and report["imagen_descartada_por_confianza"]:
        print(f"  imagen descartada por venir de página no específica de esta edición: {len(report['imagen_descartada_por_confianza'])} (usa --trust-fallback-images para recuperarlas si estás seguro de que aplica)")
    print(f"Reporte de huecos: {report_path}")


if __name__ == "__main__":
    main()
