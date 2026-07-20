# 🃏 Inventario MyL — Mitos y Leyendas

Aplicación web para **gestionar tu colección de cartas de Mitos y Leyendas (MyL)**:
buscar, filtrar, ordenar, llevar el inventario de las que tienes y las que te
faltan, construir mazos y exportar tu colección. Es 100% estática y se publica
en **GitHub Pages**.

Los datos de las cartas provienen de [tor.myl.cl](https://tor.myl.cl/cartas/todas).

---

## ✨ Características

- 🔎 **Búsqueda** por nombre o texto de habilidad.
- 🧰 **Filtros**: formato, edición, raza, tipo, rareza y coste máximo.
- ↕️ **Ordenar** por nombre, **número de carta**, coste, fuerza, edición
  (en orden de publicación por bloque) o cantidad que posees.
- 📚 **Colecciones**: elige una edición y síguela carta por carta, ordenada por
  número; las cartas que aún no tienes se ven en **blanco y negro** y recuperan
  el color al marcarlas. Una barra muestra tu progreso.
- 🧩 **Ediciones propias**: crea tus ediciones (nombre, descripción, bloque y
  listado de cartas numerado), carga las cartas una a una o importándolas desde
  un **CSV UTF-8** (plantilla descargable, imágenes por URL) y coleccionalas
  como cualquier edición oficial.
- 🔄 **Cambios**: marca copias repetidas como disponibles para intercambio y
  registra cada cambio: la carta entregada se descuenta, la recibida se suma y
  entra sola a la colección de su edición (se crea si no existe). Con historial.
- 📦 **Inventario**: marca cuántas copias tienes de cada carta (+/−). Filtra por
  *las que tengo*, *las que me faltan* o *duplicadas*.
- 🗂️ **Mazos**: crea mazos, añade cartas desde la colección y comprueba qué
  copias te faltan para armarlos.
- 📊 **Estadísticas con gráficos** (Chart.js): progreso, por formato, razas,
  curva de coste, tipo y rareza; con filtros de alcance (todas / poseídas /
  faltantes) y por formato.
- ⬇️ **Exportar** a **Excel (.xlsx)** y **PDF** con diseño cuidado (resumen +
  tabla), además de **CSV**, lista de **faltantes** y **respaldo JSON**.
  Las exportaciones respetan los filtros activos. **Importar** desde JSON.
- 💾 **Guardado automático** en el navegador al tocar +/− y **sincronización
  opcional en la nube** (Supabase) para tener el mismo inventario en el celular
  y el PC. Botón ☁️ en la barra superior.
- 🌙 Tema claro/oscuro.

### Sincronizar entre dispositivos (opcional)
El inventario se guarda solo en tu navegador. Para compartirlo entre el celular
y el PC, abre **☁️ → Sincronizar**, sigue los 4 pasos (crear proyecto gratis en
Supabase, ejecutar un SQL que la app te da, y pegar *Project URL* + *anon key* +
una *clave de colección* tuya). A partir de ahí, cada +/− se sube solo.

> El inventario y los mazos viven en tu navegador. Usa **Exportar** para
> respaldarlos o pasarlos a otro dispositivo.

---

## 🚀 Publicar en GitHub Pages

Está configurado con **Deploy from a branch** (sin paso de compilación: es
HTML/CSS/JS puro):

1. En **Settings → Pages → Build and deployment**:
   - *Source*: **Deploy from a branch**
   - *Branch*: la rama de trabajo, carpeta **`/ (root)`** → **Save**
2. En 1–2 minutos el sitio queda publicado en:
   **https://knomoio.github.io/InventarioMYL/**
   (¡ojo con las mayúsculas! La URL distingue may/min: `InventarioMYL`).

Todas las rutas de la app son relativas (`./css`, `./js`, `./data`), así que
funciona correctamente bajo el subdirectorio del proyecto.

---

## 🔄 Cargar los datos reales de las cartas

El repo incluye un **dataset de demostración** en [`data/cards.json`](data/cards.json)
para que la app funcione de inmediato. Para cargar el **catálogo completo** desde
tor.myl.cl tienes dos opciones:

### Opción A — GitHub Actions (recomendado)
Ve a la pestaña **Actions → «Actualizar datos de cartas» → Run workflow**.
El scraper se ejecuta en los servidores de GitHub (con acceso a internet),
genera `data/cards.json` y hace *commit* del resultado. También corre
automáticamente cada lunes.

Puedes acotar la ejecución con los parámetros `format` (PE/PB/SB/FX/NE) y
`limit` (número de ediciones, útil para una prueba rápida).

### Opción B — En tu computador
```bash
cd scraper
npm install            # instala Playwright + Chromium
npm run scrape         # todas las ediciones
# o solo algunas:
node scrape.js --edition espada_sagrada helenica
node scrape.js --format PB --limit 3   # prueba rápida
```
Esto sobrescribe `data/cards.json`. Haz *commit* y *push* para publicarlo.

---

## 🗂️ Estructura del proyecto

```
.
├── index.html              # App (una sola página)
├── css/styles.css
├── js/
│   ├── app.js              # Lógica principal (filtros, grilla, mazos, stats)
│   └── store.js            # Inventario / mazos / preferencias (localStorage)
├── data/
│   ├── cards.json          # Catálogo de cartas (demo → reemplazado por el scraper)
│   └── editions.json       # Catálogo de ediciones y formatos
├── scraper/
│   ├── scrape.js           # Scraper Playwright de tor.myl.cl
│   ├── editions.js         # Lista de ediciones por formato
│   └── package.json
└── .github/workflows/
    └── scrape-data.yml     # Actualiza data/cards.json (scraper en GitHub Actions)
```

## 📐 Formato de los datos

Cada carta en `data/cards.json`:

```json
{
  "id": "espada_sagrada__merlin",
  "name": "Merlín",
  "edition": "espada_sagrada",
  "editionName": "Espada Sagrada",
  "format": "PB",
  "type": "Aliado",
  "race": "Sabio",
  "rarity": "Real",
  "cost": 5,
  "strength": 4,
  "ability": "…",
  "image": "https://…"
}
```

---

## 🧪 Desarrollo local

Al usar módulos ES, ábrelo con un servidor (no con `file://`):

```bash
python3 -m http.server 8000
# luego visita http://localhost:8000
```

---

Datos de cartas © sus respectivos autores / Salo MyL. Este proyecto es una
herramienta de inventario hecha por fans, sin fines comerciales.
