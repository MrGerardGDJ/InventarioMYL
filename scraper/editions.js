// Catálogo de ediciones de Mitos y Leyendas (TOR / tor.myl.cl)
// Fuente de slugs: estructura pública de tor.myl.cl/cartas/{edicion}
// Cada formato agrupa sus ediciones. El "name" es legible; el scraper
// puede sobrescribirlo con el título real publicado en la página.

export const FORMATS = {
  PE: "Primera Era",
  PB: "Primer Bloque",
  SB: "Segundo Bloque",
  FX: "Furia Extendido",
  NE: "Nueva Era / Imperio",
};

// slug -> formato
export const EDITION_SLUGS = {
  PE: [
    "el_reto", "mundo_gotico", "ira_del_nahual", "ragnarok", "cofradia",
    "espiritu_del_dragon", "leyendas_primera_era", "promocionales_primera_era",
    "raciales_pe", "eXtension_pe", "leyendas_primera_era_2022", "toolkit_walkirias",
    "toolkit_odin", "leyendas_primera_era_2023", "mundo_medieval_el_reto", "xinnian",
    "toolkit_puertas_del_valhalla", "toolkit_justa", "mundos_perdidos_horrores_de_salem",
    "mundos_perdidos_ciudad_de_los_cesares", "mundos_perdidos_la_saga_de_volsung",
    "mundos_perdidos_leyendas_de_avalon", "mundos_perdidos_viaje_al_oeste",
    "mundos_perdidos_senores_del_trueno", "vigilantes_de_la_noche", "lootbox_pe_2024",
    "toolkit_honor_y_ferocidad", "toolkit_valentia_y_desolacion", "xinnian_año_serpiente_2025",
  ],
  PB: [
    "espada_sagrada", "cruzadas", "helenica", "imperio", "hijos_de_daana", "tierras_altas",
    "dominios_de_ra", "encrucijada", "leyendas_primer_bloque", "promocionales_primer_bloque",
    "raciales_pb", "shogun_1", "primer_bloque_2", "toolkit_dragon_dorado", "toolkit_fe_sin_limite",
    "extensiones_pb_2023", "espada_sagrada_aniversario", "relatos_espada_sagrada_aniversario",
    "colecciones_raciales_pb_2023", "helenica_aniversario", "shogun_ii", "dracula_pb",
    "pb_lootbox_2023", "leyendas_pb_3.0", "toolkit_pb_fuerza_y_destino", "toolkit_pb_magia_y_divinidad",
    "relatos_hel_mar_de_poseidon", "relatos_hel_camino_de_teseo", "relatos_hel_laberinto_del_minotauro",
    "daana_aniversario", "shogun_iii", "dante_pb",
  ],
  SB: [
    "guerrero_jaguar", "vendaval", "barbarie", "reino_de_acero", "hordas", "bestiario",
    "heroes", "leyendas_segundo_bloque", "promocionales_segundo_bloque",
  ],
  FX: [
    "furia", "leyendas_bloque_furia", "roma", "excalibur", "troya", "guerreros_del_sol",
    "guardianes_de_daana", "furiaext", "extension_excalibur", "extension_troya",
    "leyendas_de_metal", "mazos_fx", "la_cofradia", "kingdom_quest", "vigilantes",
    "producto_especial_furia_aniversario",
  ],
  NE: [
    "sumeria", "rebelion", "asgard", "midgard", "camelot", "templarios", "bushido",
    "sol-naciente", "dominio", "contraataque", "aguila-imperial", "steampunk", "axis-mundi",
    "hijos-del-sol", "legado-gotico", "kemet", "dharma", "olimpia", "calavera", "kilimanjaro",
    "arsenal", "tinta-inmortal", "terrores-nocturnos", "invasion-oscura", "dinastia-del-dragon",
    "hermanos-grimm", "keltoi", "cuentos-de-ultratumba", "tierra-austral", "conjuros",
    "angeles-demonios", "ajedrez", "escuelas-elementales", "acero", "tinta_inmortal_robin_hood",
    "tinta_inmortal_romeo_y_julieta", "hermanos_grimm_elsastrecillovaliente_y_musicosdebremen",
    "hermanos_grimm_elaguadelavida_y_johndeacero", "cuentos_de_terror_poe", "cuentos_de_terror_lovecraft",
    "cid", "coleccion_racial_2022", "master_toolkit_2022", "despertar_gotico", "explorandum",
    "mastertoolkit_2023", "guardianes_reino_uno", "guardianes_reino_dos", "valhalla", "neo_midgard",
    "relatos_del_despertar_gotico", "extension_valhalla", "la_venganza_de_horus", "visiones_de_kemet",
    "chile_oscuro", "napoleon", "raciales_imp_2024", "giger", "espiritu_samurai", "zodiaco",
    "amenazakaiju", "escuadronmecha", "bestiarium", "secretos_arcanos", "lootbox_2024",
    "toolkit_hielo_inmortal", "toolkit_cenizas_de_fuego",
    // Ediciones recientes (descubiertas vía la API)
    "onyria", "libertadores", "kvsm_titanes", "dia_de_muertos", "ritual_vudu", "chile_oculto",
  ],
};

// Convierte un slug en un nombre legible por defecto.
export function slugToName(slug) {
  return slug
    .replace(/[_-]+/g, " ")
    .replace(/\bpb\b/gi, "PB")
    .replace(/\bpe\b/gi, "PE")
    .replace(/\bfx\b/gi, "FX")
    .replace(/\bimp\b/gi, "IMP")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

// Devuelve un arreglo plano [{slug, format, formatName, name}]
export function allEditions() {
  const out = [];
  for (const [format, slugs] of Object.entries(EDITION_SLUGS)) {
    for (const slug of slugs) {
      out.push({ slug, format, formatName: FORMATS[format], name: slugToName(slug) });
    }
  }
  return out;
}
