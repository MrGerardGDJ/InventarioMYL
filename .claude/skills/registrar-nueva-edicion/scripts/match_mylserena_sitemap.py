#!/usr/bin/env python3
"""
Recorre el sitemap.xml de mylserena.cl (o cualquier tienda Jumpseller con la
misma estructura de página de producto) para encontrar TODAS las páginas de
producto que coincidan con un filtro de texto en su slug — no solo las que
aparecen en la grilla de una categoría, que en la práctica suele estar
incompleta (una carta puede tener página propia sin figurar en la vitrina).

Por cada página de producto encontrada, extrae del bloque JSON-LD:
  - el "description", que en esta tienda trae el CÓDIGO EXACTO de la carta
    (ej. "LPE4 33-320 - Dios - Imagen referencial",
         "SCLPE4 - 67/80 - Campeón - Imagen referencial",
         "LPE4 - 324 / 320 P - Oro - Imagen referencial",
         "MPA 00/18 - ... ") — se separa en (prefijo, número).
  - la URL de imagen original (no la miniatura /resize/), con su extensión
    real tal como la sirve el servidor.

IMPORTANTE — por qué este es el método preferido sobre la categoría de la
tienda: en un caso real (Leyendas - Primera Era 4.0) la categoría listaba 64
productos "en vitrina" pero el sitemap tenía 401 páginas de producto para esa
edición; cruzando por este código exacto se resolvieron 252 de 265 imágenes
faltantes, con CERO ambigüedad (a diferencia de cruzar por nombre, que en
esta misma edición tiene ~24 nombres duplicados entre variantes de rareza).

Este script SOLO hace la parte mecánica y verificable (bajar páginas, extraer
el código y la imagen). NO decide a qué carta de nuestro catálogo corresponde
cada resultado — eso lo hace quien use este script, cruzando el (prefijo,
número) contra el edid/specialId de las cartas del catálogo, código exacto
contra código exacto, nunca por nombre solo. Ver SKILL.md, sección
"Paso 3 — imágenes faltantes" para el patrón de cruce.

Uso:
  python3 match_mylserena_sitemap.py --code-filter lpe4 \
      --out /tmp/matches.json [--download-dir /tmp/img] [--domain mylserena.cl]

  --code-filter   Subcadena que debe aparecer en el slug de la URL del
                   producto (ej. "lpe4", "mpa", "crpe2"). Case-insensitive.
                   Prueba con el prefijo del código de la edición.
  --out           Dónde guardar el JSON con los resultados.
  --download-dir  Si se pasa, descarga cada imagen encontrada ahí, nombrada
                   "<prefijo>_<numero>.<ext-real>" (ext real detectada del
                   Content-Type real de la respuesta, no de la URL — esta
                   tienda a veces sirve JPEG en una URL que termina en
                   ".png"). Quien use el script luego la copia/renombra al
                   nombre definitivo del proyecto al aplicar los cambios.
  --domain        Dominio de la tienda (default: mylserena.cl). Sirve para
                   reusar el script si aparece otra tienda Jumpseller con la
                   misma estructura.
"""
import argparse
import json
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

DESC_RE = re.compile(
    # Prefijo alfanumérico (el código de la edición puede traer un dígito
    # pegado, ej. "LPE4", "SCLPE4"): [A-Z0-9]+ y no [A-Z]+ — con [A-Z]+ el
    # "4" de "LPE4" queda fuera del prefijo y rompe el match siguiente.
    r'"description":\s*"([A-Z0-9]+)\s+-?\s*(\d+)\s*[-/]\s*\d+\s*P?[^"]*"'
)
TITLE_RE = re.compile(r"<title>([^<]*)</title>")
IMG_RE = re.compile(
    r'"image":\s*"(https://cdnx\.jumpseller\.com/[a-zA-Z0-9_-]+/image/\d+/'
    r'[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp))\?(\d+)"'
)


def fetch(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (InventarioMYL research script)"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", errors="replace")


def get_sitemap_slugs(domain, code_filter):
    text = fetch(f"https://{domain}/sitemap.xml")
    # Se extraen TODOS los slugs de primer nivel y se filtra en Python (no
    # dentro de la regex): meter el filtro directo en el patrón de captura
    # falla cuando el filtro aparece pegado al inicio del slug (ej. filtro
    # "rheda-lpe4" contra el slug "rheda-lpe4-ur" — un carácter obligatorio
    # antes del filtro en la regex consume la "r" inicial y el match nunca
    # ocurre; bug real encontrado al probar este script contra el sitio).
    all_slugs = re.findall(rf"<loc>https://{re.escape(domain)}/([a-z0-9][a-z0-9-]*)</loc>", text, re.IGNORECASE)
    cf = code_filter.lower()
    return sorted(set(s for s in all_slugs if cf in s.lower()))


def parse_product_page(domain, slug):
    url = f"https://{domain}/{slug}"
    try:
        html = fetch(url)
    except Exception as e:
        return {"slug": slug, "error": str(e)}
    t = TITLE_RE.search(html)
    title = t.group(1) if t else None
    im = IMG_RE.search(html)
    image = f"{im.group(1)}?{im.group(3)}" if im else None
    image_ext = im.group(2) if im else None
    m = DESC_RE.search(html)
    if not m:
        return {"slug": slug, "error": "no description match", "title": title}
    prefix, num = m.group(1), int(m.group(2))
    return {
        "slug": slug,
        "prefix": prefix,
        "num": num,
        "title": title,
        "image": image,
        "image_ext": image_ext,
    }


def real_extension(url):
    """Verifica el Content-Type real (algunas URLs .png en realidad sirven JPEG)."""
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            ct = r.headers.get("Content-Type", "")
    except Exception:
        return None
    if "jpeg" in ct or "jpg" in ct:
        return "jpg"
    if "png" in ct:
        return "png"
    if "webp" in ct:
        return "webp"
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--code-filter", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--download-dir", default=None)
    ap.add_argument("--domain", default="mylserena.cl")
    ap.add_argument("--workers", type=int, default=8)
    args = ap.parse_args()

    print(f"Buscando slugs en https://{args.domain}/sitemap.xml que contengan '{args.code_filter}'...", file=sys.stderr)
    slugs = get_sitemap_slugs(args.domain, args.code_filter)
    print(f"{len(slugs)} páginas de producto encontradas.", file=sys.stderr)
    if not slugs:
        print("Nada que hacer — revisa el filtro o si esta tienda tiene la edición.", file=sys.stderr)
        json.dump({"results": [], "errors": []}, open(args.out, "w"))
        return

    results, errors = [], []
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = {ex.submit(parse_product_page, args.domain, s): s for s in slugs}
        done = 0
        for fut in as_completed(futs):
            r = fut.result()
            done += 1
            (errors if "error" in r else results).append(r)
            if done % 50 == 0 or done == len(slugs):
                print(f"  {done}/{len(slugs)}", file=sys.stderr)

    print(f"OK: {len(results)}  |  sin match de código: {len(errors)}", file=sys.stderr)

    if args.download_dir:
        import os
        os.makedirs(args.download_dir, exist_ok=True)
        for r in results:
            if not r.get("image"):
                continue
            ext = real_extension(r["image"]) or r.get("image_ext") or "jpg"
            fname = f"{r['prefix']}_{r['num']:02d}.{ext}"
            dest = os.path.join(args.download_dir, fname)
            try:
                data = urllib.request.urlopen(
                    urllib.request.Request(r["image"], headers={"User-Agent": "Mozilla/5.0"}), timeout=20
                ).read()
                open(dest, "wb").write(data)
                r["downloaded_as"] = fname
            except Exception as e:
                r["download_error"] = str(e)
        print(f"Imágenes descargadas en {args.download_dir}/", file=sys.stderr)

    json.dump({"results": results, "errors": errors}, open(args.out, "w"), indent=1, ensure_ascii=False)
    print(f"Resultados en {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
