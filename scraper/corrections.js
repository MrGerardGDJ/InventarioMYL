// Correcciones manuales conocidas de numeración/identificador de carta.
// -----------------------------------------------------------------------------
// TOR (api.myl.cl) numera "leyendas_primera_era_2023" de forma corrida 1..326,
// pero el wiki (myl.fandom.com, que refleja el código impreso en la carta
// física) numera distinto: la carta #1 de TOR ("Monedas De Oro") es en
// realidad el código "000" del set — una carta "firma", mismo patrón ya visto
// en varias ediciones "Mundos Perdidos" — y a partir de ahí TOR = wiki + 1
// para el resto del rango normal (TOR #2..#301 = wiki 001..300). Verificado
// carta por carta contra https://myl.fandom.com/es/wiki/Lista_de_cartas_de_Leyendas_-_Primera_Era_3.0
// el 02-08-2026 (esa página es "Leyendas - Primera Era 2023" en TOR — el wiki
// las unificó bajo el nombre "3.0").
//
// Además, TOR sigue numerando correlativamente 25 cartas MÁS (302-326) que en
// realidad son tres categorías separadas de coleccionista/promo, cada una con
// su propio código impreso, no cartas "normales" del set principal:
//   - 10 cartas con código "LPE23 - NNN/300" que continúa MÁS ALLÁ del tope de
//     300 (301-310), de rareza Promocional.
//   - 12 cartas con código "COLECCIONISTA LPE23 NN" (reimpresiones de cartas
//     de OTRAS ediciones — El Reto, Mundo Gótico, Ragnarok, La Cofradía...).
//   - 3 cartas con código "SECRETA EXCLUSIVA PE NN", de rareza Secreta.
//
// Reportado por el dueño del inventario (02-08-2026): "la primera carta está
// bien pero el numerador de la segunda carta pasa a 3 directamente" — pidió
// restar 1 hasta llegar a 300 y tratar el resto como Promo con la numeración
// de cada carta. Al hacer el cálculo, dejar la carta #1 sin tocar chocaba con
// la #2 corregida (ambas habrían quedado en edid 1) — la solución consistente
// con el resto de este archivo es que la #1 ("000" en el wiki) también pase a
// ser especial (`LPE23-000`), igual que las cartas "00" de Mundos Perdidos.
// Se afinó el resto a las 3 categorías reales de arriba en vez de un genérico
// "Promo N" porque es lo que dice el código impreso en cada carta física.
//
// Se corrige acá (no en data/custom-cards.json) porque el `id` de cada carta
// es estable ("<ed_edid>-<edid_original_de_TOR>", ver scrape.js) y NO cambia
// con esta corrección — solo se le pisan los campos `edid`/`specialId` de
// SALIDA. Así sigue funcionando el catálogo compartido para todos los
// visitantes y sobrevive a que el scraper se vuelva a correr (todos los
// lunes, ver .github/workflows/scrape-data.yml); si esto viviera como
// entradas de data/custom-cards.json en vez de acá, habría que además
// excluir esos ids del array "scraped" para no duplicar la carta, y
// mantenerlo sincronizado a mano — más frágil que esta tabla.
//
// clave: id estable de la carta ("<ed_edid>-<edid>") → { edid, specialId }
// (mismo esquema que usa el resto de la app: edid con 3 dígitos y "" cuando
// la carta es especial, specialId "" cuando es numerada normal).
export const LEYENDAS_2023_CORRECTIONS = {
  "112-113": { edid: "112", specialId: "" },
  "112-253": { edid: "252", specialId: "" },
  "112-211": { edid: "210", specialId: "" },
  "112-249": { edid: "248", specialId: "" },
  "112-143": { edid: "142", specialId: "" },
  "112-030": { edid: "029", specialId: "" },
  "112-133": { edid: "132", specialId: "" },
  "112-168": { edid: "167", specialId: "" },
  "112-257": { edid: "256", specialId: "" },
  "112-220": { edid: "219", specialId: "" },
  "112-210": { edid: "209", specialId: "" },
  "112-203": { edid: "202", specialId: "" },
  "112-048": { edid: "047", specialId: "" },
  "112-260": { edid: "259", specialId: "" },
  "112-007": { edid: "006", specialId: "" },
  "112-225": { edid: "224", specialId: "" },
  "112-147": { edid: "146", specialId: "" },
  "112-306": { edid: "", specialId: "Coleccionista 05" },
  "112-316": { edid: "", specialId: "LPE23-303" },
  "112-124": { edid: "123", specialId: "" },
  "112-039": { edid: "038", specialId: "" },
  "112-286": { edid: "285", specialId: "" },
  "112-217": { edid: "216", specialId: "" },
  "112-056": { edid: "055", specialId: "" },
  "112-127": { edid: "126", specialId: "" },
  "112-004": { edid: "003", specialId: "" },
  "112-155": { edid: "154", specialId: "" },
  "112-034": { edid: "033", specialId: "" },
  "112-089": { edid: "088", specialId: "" },
  "112-077": { edid: "076", specialId: "" },
  "112-183": { edid: "182", specialId: "" },
  "112-074": { edid: "073", specialId: "" },
  "112-264": { edid: "263", specialId: "" },
  "112-060": { edid: "059", specialId: "" },
  "112-002": { edid: "001", specialId: "" },
  "112-069": { edid: "068", specialId: "" },
  "112-323": { edid: "", specialId: "LPE23-310" },
  "112-208": { edid: "207", specialId: "" },
  "112-246": { edid: "245", specialId: "" },
  "112-013": { edid: "012", specialId: "" },
  "112-282": { edid: "281", specialId: "" },
  "112-165": { edid: "164", specialId: "" },
  "112-038": { edid: "037", specialId: "" },
  "112-244": { edid: "243", specialId: "" },
  "112-139": { edid: "138", specialId: "" },
  "112-150": { edid: "149", specialId: "" },
  "112-317": { edid: "", specialId: "LPE23-304" },
  "112-204": { edid: "203", specialId: "" },
  "112-027": { edid: "026", specialId: "" },
  "112-279": { edid: "278", specialId: "" },
  "112-149": { edid: "148", specialId: "" },
  "112-087": { edid: "086", specialId: "" },
  "112-140": { edid: "139", specialId: "" },
  "112-197": { edid: "196", specialId: "" },
  "112-290": { edid: "289", specialId: "" },
  "112-109": { edid: "108", specialId: "" },
  "112-158": { edid: "157", specialId: "" },
  "112-032": { edid: "031", specialId: "" },
  "112-194": { edid: "193", specialId: "" },
  "112-035": { edid: "034", specialId: "" },
  "112-059": { edid: "058", specialId: "" },
  "112-138": { edid: "137", specialId: "" },
  "112-309": { edid: "", specialId: "Coleccionista 08" },
  "112-223": { edid: "222", specialId: "" },
  "112-052": { edid: "051", specialId: "" },
  "112-011": { edid: "010", specialId: "" },
  "112-201": { edid: "200", specialId: "" },
  "112-018": { edid: "017", specialId: "" },
  "112-291": { edid: "290", specialId: "" },
  "112-091": { edid: "090", specialId: "" },
  "112-154": { edid: "153", specialId: "" },
  "112-216": { edid: "215", specialId: "" },
  "112-016": { edid: "015", specialId: "" },
  "112-191": { edid: "190", specialId: "" },
  "112-033": { edid: "032", specialId: "" },
  "112-226": { edid: "225", specialId: "" },
  "112-063": { edid: "062", specialId: "" },
  "112-097": { edid: "096", specialId: "" },
  "112-119": { edid: "118", specialId: "" },
  "112-242": { edid: "241", specialId: "" },
  "112-171": { edid: "170", specialId: "" },
  "112-071": { edid: "070", specialId: "" },
  "112-222": { edid: "221", specialId: "" },
  "112-123": { edid: "122", specialId: "" },
  "112-206": { edid: "205", specialId: "" },
  "112-042": { edid: "041", specialId: "" },
  "112-276": { edid: "275", specialId: "" },
  "112-274": { edid: "273", specialId: "" },
  "112-122": { edid: "121", specialId: "" },
  "112-250": { edid: "249", specialId: "" },
  "112-054": { edid: "053", specialId: "" },
  "112-280": { edid: "279", specialId: "" },
  "112-164": { edid: "163", specialId: "" },
  "112-294": { edid: "293", specialId: "" },
  "112-278": { edid: "277", specialId: "" },
  "112-005": { edid: "004", specialId: "" },
  "112-096": { edid: "095", specialId: "" },
  "112-050": { edid: "049", specialId: "" },
  "112-090": { edid: "089", specialId: "" },
  "112-070": { edid: "069", specialId: "" },
  "112-238": { edid: "237", specialId: "" },
  "112-118": { edid: "117", specialId: "" },
  "112-107": { edid: "106", specialId: "" },
  "112-104": { edid: "103", specialId: "" },
  "112-099": { edid: "098", specialId: "" },
  "112-189": { edid: "188", specialId: "" },
  "112-252": { edid: "251", specialId: "" },
  "112-310": { edid: "", specialId: "Coleccionista 09" },
  "112-230": { edid: "229", specialId: "" },
  "112-010": { edid: "009", specialId: "" },
  "112-015": { edid: "014", specialId: "" },
  "112-062": { edid: "061", specialId: "" },
  "112-315": { edid: "", specialId: "LPE23-302" },
  "112-061": { edid: "060", specialId: "" },
  "112-006": { edid: "005", specialId: "" },
  "112-045": { edid: "044", specialId: "" },
  "112-234": { edid: "233", specialId: "" },
  "112-103": { edid: "102", specialId: "" },
  "112-012": { edid: "011", specialId: "" },
  "112-187": { edid: "186", specialId: "" },
  "112-088": { edid: "087", specialId: "" },
  "112-227": { edid: "226", specialId: "" },
  "112-098": { edid: "097", specialId: "" },
  "112-195": { edid: "194", specialId: "" },
  "112-017": { edid: "016", specialId: "" },
  "112-229": { edid: "228", specialId: "" },
  "112-163": { edid: "162", specialId: "" },
  "112-014": { edid: "013", specialId: "" },
  "112-086": { edid: "085", specialId: "" },
  "112-079": { edid: "078", specialId: "" },
  "112-115": { edid: "114", specialId: "" },
  "112-083": { edid: "082", specialId: "" },
  "112-270": { edid: "269", specialId: "" },
  "112-307": { edid: "", specialId: "Coleccionista 06" },
  "112-184": { edid: "183", specialId: "" },
  "112-131": { edid: "130", specialId: "" },
  "112-142": { edid: "141", specialId: "" },
  "112-043": { edid: "042", specialId: "" },
  "112-268": { edid: "267", specialId: "" },
  "112-293": { edid: "292", specialId: "" },
  "112-105": { edid: "104", specialId: "" },
  "112-251": { edid: "250", specialId: "" },
  "112-205": { edid: "204", specialId: "" },
  "112-188": { edid: "187", specialId: "" },
  "112-186": { edid: "185", specialId: "" },
  "112-075": { edid: "074", specialId: "" },
  "112-320": { edid: "", specialId: "LPE23-307" },
  "112-261": { edid: "260", specialId: "" },
  "112-114": { edid: "113", specialId: "" },
  "112-106": { edid: "105", specialId: "" },
  "112-130": { edid: "129", specialId: "" },
  "112-144": { edid: "143", specialId: "" },
  "112-055": { edid: "054", specialId: "" },
  "112-240": { edid: "239", specialId: "" },
  "112-175": { edid: "174", specialId: "" },
  "112-313": { edid: "", specialId: "Coleccionista 12" },
  "112-176": { edid: "175", specialId: "" },
  "112-021": { edid: "020", specialId: "" },
  "112-116": { edid: "115", specialId: "" },
  "112-243": { edid: "242", specialId: "" },
  "112-095": { edid: "094", specialId: "" },
  "112-232": { edid: "231", specialId: "" },
  "112-239": { edid: "238", specialId: "" },
  "112-053": { edid: "052", specialId: "" },
  "112-236": { edid: "235", specialId: "" },
  "112-117": { edid: "116", specialId: "" },
  "112-100": { edid: "099", specialId: "" },
  "112-022": { edid: "021", specialId: "" },
  "112-287": { edid: "286", specialId: "" },
  "112-233": { edid: "232", specialId: "" },
  "112-285": { edid: "284", specialId: "" },
  "112-321": { edid: "", specialId: "LPE23-308" },
  "112-258": { edid: "257", specialId: "" },
  "112-228": { edid: "227", specialId: "" },
  "112-255": { edid: "254", specialId: "" },
  "112-102": { edid: "101", specialId: "" },
  "112-047": { edid: "046", specialId: "" },
  "112-128": { edid: "127", specialId: "" },
  "112-325": { edid: "", specialId: "Secreta Exclusiva 2" },
  "112-181": { edid: "180", specialId: "" },
  "112-192": { edid: "191", specialId: "" },
  "112-111": { edid: "110", specialId: "" },
  "112-153": { edid: "152", specialId: "" },
  "112-085": { edid: "084", specialId: "" },
  "112-049": { edid: "048", specialId: "" },
  "112-179": { edid: "178", specialId: "" },
  "112-137": { edid: "136", specialId: "" },
  "112-262": { edid: "261", specialId: "" },
  "112-318": { edid: "", specialId: "LPE23-305" },
  "112-166": { edid: "165", specialId: "" },
  "112-263": { edid: "262", specialId: "" },
  "112-209": { edid: "208", specialId: "" },
  "112-019": { edid: "018", specialId: "" },
  "112-269": { edid: "268", specialId: "" },
  "112-120": { edid: "119", specialId: "" },
  "112-066": { edid: "065", specialId: "" },
  "112-161": { edid: "160", specialId: "" },
  "112-259": { edid: "258", specialId: "" },
  "112-001": { edid: "", specialId: "LPE23-000" },
  "112-125": { edid: "124", specialId: "" },
  "112-135": { edid: "134", specialId: "" },
  "112-180": { edid: "179", specialId: "" },
  "112-036": { edid: "035", specialId: "" },
  "112-190": { edid: "189", specialId: "" },
  "112-283": { edid: "282", specialId: "" },
  "112-167": { edid: "166", specialId: "" },
  "112-245": { edid: "244", specialId: "" },
  "112-078": { edid: "077", specialId: "" },
  "112-301": { edid: "300", specialId: "" },
  "112-094": { edid: "093", specialId: "" },
  "112-067": { edid: "066", specialId: "" },
  "112-044": { edid: "043", specialId: "" },
  "112-037": { edid: "036", specialId: "" },
  "112-041": { edid: "040", specialId: "" },
  "112-254": { edid: "253", specialId: "" },
  "112-162": { edid: "161", specialId: "" },
  "112-218": { edid: "217", specialId: "" },
  "112-241": { edid: "240", specialId: "" },
  "112-296": { edid: "295", specialId: "" },
  "112-319": { edid: "", specialId: "LPE23-306" },
  "112-326": { edid: "", specialId: "Secreta Exclusiva 3" },
  "112-303": { edid: "", specialId: "Coleccionista 02" },
  "112-169": { edid: "168", specialId: "" },
  "112-302": { edid: "", specialId: "Coleccionista 01" },
  "112-185": { edid: "184", specialId: "" },
  "112-146": { edid: "145", specialId: "" },
  "112-058": { edid: "057", specialId: "" },
  "112-298": { edid: "297", specialId: "" },
  "112-248": { edid: "247", specialId: "" },
  "112-247": { edid: "246", specialId: "" },
  "112-196": { edid: "195", specialId: "" },
  "112-126": { edid: "125", specialId: "" },
  "112-093": { edid: "092", specialId: "" },
  "112-072": { edid: "071", specialId: "" },
  "112-256": { edid: "255", specialId: "" },
  "112-267": { edid: "266", specialId: "" },
  "112-178": { edid: "177", specialId: "" },
  "112-177": { edid: "176", specialId: "" },
  "112-084": { edid: "083", specialId: "" },
  "112-156": { edid: "155", specialId: "" },
  "112-212": { edid: "211", specialId: "" },
  "112-141": { edid: "140", specialId: "" },
  "112-160": { edid: "159", specialId: "" },
  "112-068": { edid: "067", specialId: "" },
  "112-219": { edid: "218", specialId: "" },
  "112-082": { edid: "081", specialId: "" },
  "112-173": { edid: "172", specialId: "" },
  "112-324": { edid: "", specialId: "Secreta Exclusiva 1" },
  "112-314": { edid: "", specialId: "LPE23-301" },
  "112-231": { edid: "230", specialId: "" },
  "112-151": { edid: "150", specialId: "" },
  "112-108": { edid: "107", specialId: "" },
  "112-288": { edid: "287", specialId: "" },
  "112-322": { edid: "", specialId: "LPE23-309" },
  "112-023": { edid: "022", specialId: "" },
  "112-277": { edid: "276", specialId: "" },
  "112-026": { edid: "025", specialId: "" },
  "112-224": { edid: "223", specialId: "" },
  "112-214": { edid: "213", specialId: "" },
  "112-157": { edid: "156", specialId: "" },
  "112-008": { edid: "007", specialId: "" },
  "112-073": { edid: "072", specialId: "" },
  "112-272": { edid: "271", specialId: "" },
  "112-101": { edid: "100", specialId: "" },
  "112-112": { edid: "111", specialId: "" },
  "112-170": { edid: "169", specialId: "" },
  "112-172": { edid: "171", specialId: "" },
  "112-009": { edid: "008", specialId: "" },
  "112-297": { edid: "296", specialId: "" },
  "112-174": { edid: "173", specialId: "" },
  "112-024": { edid: "023", specialId: "" },
  "112-029": { edid: "028", specialId: "" },
  "112-271": { edid: "270", specialId: "" },
  "112-080": { edid: "079", specialId: "" },
  "112-145": { edid: "144", specialId: "" },
  "112-148": { edid: "147", specialId: "" },
  "112-308": { edid: "", specialId: "Coleccionista 07" },
  "112-028": { edid: "027", specialId: "" },
  "112-202": { edid: "201", specialId: "" },
  "112-198": { edid: "197", specialId: "" },
  "112-199": { edid: "198", specialId: "" },
  "112-200": { edid: "199", specialId: "" },
  "112-110": { edid: "109", specialId: "" },
  "112-025": { edid: "024", specialId: "" },
  "112-273": { edid: "272", specialId: "" },
  "112-152": { edid: "151", specialId: "" },
  "112-020": { edid: "019", specialId: "" },
  "112-235": { edid: "234", specialId: "" },
  "112-132": { edid: "131", specialId: "" },
  "112-215": { edid: "214", specialId: "" },
  "112-275": { edid: "274", specialId: "" },
  "112-292": { edid: "291", specialId: "" },
  "112-284": { edid: "283", specialId: "" },
  "112-159": { edid: "158", specialId: "" },
  "112-129": { edid: "128", specialId: "" },
  "112-121": { edid: "120", specialId: "" },
  "112-136": { edid: "135", specialId: "" },
  "112-065": { edid: "064", specialId: "" },
  "112-299": { edid: "298", specialId: "" },
  "112-134": { edid: "133", specialId: "" },
  "112-311": { edid: "", specialId: "Coleccionista 10" },
  "112-193": { edid: "192", specialId: "" },
  "112-092": { edid: "091", specialId: "" },
  "112-221": { edid: "220", specialId: "" },
  "112-304": { edid: "", specialId: "Coleccionista 03" },
  "112-040": { edid: "039", specialId: "" },
  "112-289": { edid: "288", specialId: "" },
  "112-046": { edid: "045", specialId: "" },
  "112-057": { edid: "056", specialId: "" },
  "112-081": { edid: "080", specialId: "" },
  "112-266": { edid: "265", specialId: "" },
  "112-182": { edid: "181", specialId: "" },
  "112-207": { edid: "206", specialId: "" },
  "112-312": { edid: "", specialId: "Coleccionista 11" },
  "112-265": { edid: "264", specialId: "" },
  "112-076": { edid: "075", specialId: "" },
  "112-281": { edid: "280", specialId: "" },
  "112-031": { edid: "030", specialId: "" },
  "112-051": { edid: "050", specialId: "" },
  "112-213": { edid: "212", specialId: "" },
  "112-295": { edid: "294", specialId: "" },
  "112-003": { edid: "002", specialId: "" },
  "112-064": { edid: "063", specialId: "" },
  "112-305": { edid: "", specialId: "Coleccionista 04" },
  "112-237": { edid: "236", specialId: "" },
  "112-300": { edid: "299", specialId: "" },
};

// TOR trae "Toolkit Primera Era 2024" partido en dos ediciones separadas
// (`toolkit_puertas_del_valhalla` id 128, `toolkit_justa` id 129, 18 cartas
// c/u) que en realidad son un solo producto — el propio wiki lo confirma:
// una única página "Lista de cartas de Toolkit Primera Era 2024" con un
// código corrido TKPE24-01..40, donde la tabla principal (28 cartas) trae
// una columna "Kit" que dice a cuál de los dos kits pertenece cada una
// (Justa = 01-14, Puertas del Valhalla = 15-28) — coincide 1 a 1 en orden Y
// nombre con las posiciones 001-014 de cada edición de TOR, así que la
// correspondencia está verificada, no es una suposición.
// Las posiciones 015-018 de ambas ediciones son en realidad las 5 cartas
// "Oro foil" compartidas del producto (TKPE24-31..35, no exclusivas de
// ningún kit) que TOR volcó de forma inconsistente: 3 quedaron duplicadas
// en las dos ediciones (Corona Triunfal, Trarilonco, Campana Dedahmmazedi)
// y las otras 2 solo en una de las dos (Rosa De Muerte solo en Puertas,
// Corona Ducal solo en Justa) — verificado por nombre exacto contra las 5
// filas de la sección "===Oros foil===" del wiki. Reportado por el dueño
// del inventario (09-08-2026): "se crearon duplicadas" y "me toma mucho
// tiempo corregir la edición en la colección" — pidió unificar.
// TOR tampoco tiene las 7 cartas restantes del producto (2 "Buy a Box" +
// 5 "Promocionales", TKPE24-29/30 y 36-40) — esas se cargaron directo en
// data/custom-cards.json bajo el mismo slug nuevo `toolkit_primera_era_2024`
// (mismo criterio que cualquier carta que TOR no tenga).
//
// clave: id estable de la carta → { edition, editionName, specialId } para
// reasignarla al slug unificado, o { drop: true } para las 3 copias
// duplicadas (se deja la de `toolkit_puertas_del_valhalla` como canónica
// arbitrariamente, ninguna de las dos es "más correcta" que la otra — son
// el mismo Oro, TOR simplemente la listó dos veces).
export const TOOLKIT_PE_2024_CORRECTIONS = {
  // toolkit_justa (129) → TKPE24-01..14
  "129-001": { edition: "toolkit_primera_era_2024", editionName: "Toolkit Primera Era 2024", edid: "", specialId: "TKPE24-01" },
  "129-002": { edition: "toolkit_primera_era_2024", editionName: "Toolkit Primera Era 2024", edid: "", specialId: "TKPE24-02" },
  "129-003": { edition: "toolkit_primera_era_2024", editionName: "Toolkit Primera Era 2024", edid: "", specialId: "TKPE24-03" },
  "129-004": { edition: "toolkit_primera_era_2024", editionName: "Toolkit Primera Era 2024", edid: "", specialId: "TKPE24-04" },
  "129-005": { edition: "toolkit_primera_era_2024", editionName: "Toolkit Primera Era 2024", edid: "", specialId: "TKPE24-05" },
  "129-006": { edition: "toolkit_primera_era_2024", editionName: "Toolkit Primera Era 2024", edid: "", specialId: "TKPE24-06" },
  "129-007": { edition: "toolkit_primera_era_2024", editionName: "Toolkit Primera Era 2024", edid: "", specialId: "TKPE24-07" },
  "129-008": { edition: "toolkit_primera_era_2024", editionName: "Toolkit Primera Era 2024", edid: "", specialId: "TKPE24-08" },
  "129-009": { edition: "toolkit_primera_era_2024", editionName: "Toolkit Primera Era 2024", edid: "", specialId: "TKPE24-09" },
  "129-010": { edition: "toolkit_primera_era_2024", editionName: "Toolkit Primera Era 2024", edid: "", specialId: "TKPE24-10" },
  "129-011": { edition: "toolkit_primera_era_2024", editionName: "Toolkit Primera Era 2024", edid: "", specialId: "TKPE24-11" },
  "129-012": { edition: "toolkit_primera_era_2024", editionName: "Toolkit Primera Era 2024", edid: "", specialId: "TKPE24-12" },
  "129-013": { edition: "toolkit_primera_era_2024", editionName: "Toolkit Primera Era 2024", edid: "", specialId: "TKPE24-13" },
  "129-014": { edition: "toolkit_primera_era_2024", editionName: "Toolkit Primera Era 2024", edid: "", specialId: "TKPE24-14" },
  // toolkit_puertas_del_valhalla (128) → TKPE24-15..28
  "128-001": { edition: "toolkit_primera_era_2024", editionName: "Toolkit Primera Era 2024", edid: "", specialId: "TKPE24-15" },
  "128-002": { edition: "toolkit_primera_era_2024", editionName: "Toolkit Primera Era 2024", edid: "", specialId: "TKPE24-16" },
  "128-003": { edition: "toolkit_primera_era_2024", editionName: "Toolkit Primera Era 2024", edid: "", specialId: "TKPE24-17" },
  "128-004": { edition: "toolkit_primera_era_2024", editionName: "Toolkit Primera Era 2024", edid: "", specialId: "TKPE24-18" },
  "128-005": { edition: "toolkit_primera_era_2024", editionName: "Toolkit Primera Era 2024", edid: "", specialId: "TKPE24-19" },
  "128-006": { edition: "toolkit_primera_era_2024", editionName: "Toolkit Primera Era 2024", edid: "", specialId: "TKPE24-20" },
  "128-007": { edition: "toolkit_primera_era_2024", editionName: "Toolkit Primera Era 2024", edid: "", specialId: "TKPE24-21" },
  "128-008": { edition: "toolkit_primera_era_2024", editionName: "Toolkit Primera Era 2024", edid: "", specialId: "TKPE24-22" },
  "128-009": { edition: "toolkit_primera_era_2024", editionName: "Toolkit Primera Era 2024", edid: "", specialId: "TKPE24-23" },
  "128-010": { edition: "toolkit_primera_era_2024", editionName: "Toolkit Primera Era 2024", edid: "", specialId: "TKPE24-24" },
  "128-011": { edition: "toolkit_primera_era_2024", editionName: "Toolkit Primera Era 2024", edid: "", specialId: "TKPE24-25" },
  "128-012": { edition: "toolkit_primera_era_2024", editionName: "Toolkit Primera Era 2024", edid: "", specialId: "TKPE24-26" },
  "128-013": { edition: "toolkit_primera_era_2024", editionName: "Toolkit Primera Era 2024", edid: "", specialId: "TKPE24-27" },
  "128-014": { edition: "toolkit_primera_era_2024", editionName: "Toolkit Primera Era 2024", edid: "", specialId: "TKPE24-28" },
  // "Oro foil" compartidas (TKPE24-31..35) — 4 quedan en la copia de Puertas
  // del Valhalla (incluye la única copia de "Rosa De Muerte"); la 5ª
  // ("Corona Ducal") solo la tenía Justa.
  "128-015": { edition: "toolkit_primera_era_2024", editionName: "Toolkit Primera Era 2024", edid: "", specialId: "TKPE24-31" }, // Corona Triunfal
  "128-016": { edition: "toolkit_primera_era_2024", editionName: "Toolkit Primera Era 2024", edid: "", specialId: "TKPE24-32" }, // Rosa De Muerte
  "128-017": { edition: "toolkit_primera_era_2024", editionName: "Toolkit Primera Era 2024", edid: "", specialId: "TKPE24-33" }, // Trarilonco
  "128-018": { edition: "toolkit_primera_era_2024", editionName: "Toolkit Primera Era 2024", edid: "", specialId: "TKPE24-35" }, // Campana Dedahmmazedi
  "129-018": { edition: "toolkit_primera_era_2024", editionName: "Toolkit Primera Era 2024", edid: "", specialId: "TKPE24-34" }, // Corona Ducal
  // duplicados exactos de las 3 de arriba, se descartan
  "129-015": { drop: true }, // Corona Triunfal (== 128-015)
  "129-016": { drop: true }, // Trarilonco (== 128-017)
  "129-017": { drop: true }, // Campana Dedahmmazedi (== 128-018)
};
