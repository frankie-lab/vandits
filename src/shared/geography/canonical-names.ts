// Domain: Shared — Canonicalización transversal de nombres geográficos.
//
// Problema raíz: la edge function `enrich-location` guarda `country`/`continent`
// en el idioma que devuelve la IA (p.ej. "Francia", "España", "Marruecos"),
// mientras que los importados y `admin_areas` usan inglés ("France", "Spain",
// "Morocco"). Esto provocaba que filtros geográficos por "France" excluyeran
// a los puntos enriquecidos guardados como "Francia".
//
// Solución transversal: TODO acceso al cache geográfico (continent/country/
// region/zone) pasa por `getLocationHierarchy` en `hierarchy.ts`, que delega
// aquí para canonicalizar a una forma única (la inglesa de `admin_areas`).
//
// IMPORTANTE: nunca canonicalizar inline en componentes — siempre vía este
// helper. Si aparece un nuevo alias, añadirlo aquí y todos los consumidores
// (árbol Geo, matcher, breadcrumbs, agrupaciones) se benefician.

const COUNTRY_ALIASES: Record<string, string> = {
  // Español → inglés (forma canónica de admin_areas)
  'Francia': 'France',
  'España': 'Spain',
  'Italia': 'Italy',
  'Alemania': 'Germany',
  'Marruecos': 'Morocco',
  'Reino Unido': 'United Kingdom',
  'Estados Unidos': 'United States',
  'Países Bajos': 'Netherlands',
  'Irlanda': 'Ireland',
  'Suiza': 'Switzerland',
  'Bélgica': 'Belgium',
  'Polonia': 'Poland',
  'Turquía': 'Turkey',
  'Croacia': 'Croatia',
  'Dinamarca': 'Denmark',
  'Suecia': 'Sweden',
  'Noruega': 'Norway',
  'Finlandia': 'Finland',
  'Islandia': 'Iceland',
  'Rumanía': 'Romania',
  'Rumania': 'Romania',
  'Hungría': 'Hungary',
  'Chequia': 'Czechia',
  'Eslovaquia': 'Slovakia',
  'Eslovenia': 'Slovenia',
  'Ucrania': 'Ukraine',
  'Grecia': 'Greece',
  'Austria': 'Austria',
  'Bulgaria': 'Bulgaria',
  'Serbia': 'Serbia',
  'Montenegro': 'Montenegro',
  'Albania': 'Albania',
  'Portugal': 'Portugal',
};

const CONTINENT_ALIASES: Record<string, string> = {
  'Europa': 'Europe',
  'África': 'Africa',
  'Africa': 'Africa',
  'América': 'Americas',
  'América del Norte': 'Americas',
  'América del Sur': 'Americas',
  'Norteamérica': 'Americas',
  'Sudamérica': 'Americas',
  'North America': 'Americas',
  'South America': 'Americas',
  'Asia': 'Asia',
  'Oceanía': 'Oceania',
  'Oceania': 'Oceania',
  'Antártida': 'Antarctica',
  'Antarctica': 'Antarctica',
};

export function canonicalCountry(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const t = name.trim();
  if (!t) return undefined;
  return COUNTRY_ALIASES[t] ?? t;
}

export function canonicalContinent(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const t = name.trim();
  if (!t) return undefined;
  return CONTINENT_ALIASES[t] ?? t;
}
