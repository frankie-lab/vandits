/**
 * Card Schema Contract (v2)
 *
 * Catálogo maestro de campos para fichas enriquecidas.
 * ÚNICA fuente de verdad. Importado por:
 *   - Editor "Configuración de fichas" (frontend)
 *   - Renderizado de popups y vista de documento (frontend)
 *   - Generador de prompt y JSON schema en la edge function `enrich-location`
 *     (mediante una copia simétrica en `supabase/functions/_shared/card-schema.ts`)
 *
 * NUNCA hardcodear estructuras, orden o nombres de campos fuera de este archivo.
 */

export type CardFieldKey =
  | 'nombre_lugar'
  | 'clasificacion'
  | 'localizacion'
  | 'descripcion'
  | 'punto_destacado'
  | 'observacion'
  | 'etiquetas'
  | 'datos_geograficos'
  | 'datos_clave'
  | 'fuentes'
  | 'indice_interes';

export interface CardFieldDef {
  key: CardFieldKey;
  label: string;
  description: string;
  /** Forma del valor en `enriched_data` */
  kind: 'text' | 'long_text' | 'list' | 'object' | 'number';
  /** Si el campo es obligatorio: no puede deshabilitarse en el editor */
  alwaysOn?: boolean;
  /** Soporta colapsar en el popup */
  collapsible: boolean;
  /** Plantilla JSON que la IA debe devolver para este campo */
  jsonShape: unknown;
  /** Instrucción concreta inyectada en el prompt cuando el campo está habilitado */
  promptHint: (ctx: { minLength: number }) => string;
}

export const CARD_FIELD_CATALOG: Record<CardFieldKey, CardFieldDef> = {
  nombre_lugar: {
    key: 'nombre_lugar',
    label: 'Nombre del lugar',
    description: 'Nombre oficial verificado',
    kind: 'text',
    alwaysOn: true,
    collapsible: false,
    jsonShape: 'Nombre oficial verificado',
    promptHint: () => 'Nombre del lugar: usar el nombre oficial o el más común documentado, coherente con las coordenadas.',
  },
  clasificacion: {
    key: 'clasificacion',
    label: 'Clasificación',
    description: 'Categoría, subcategoría y código del árbol taxonómico',
    kind: 'object',
    alwaysOn: true,
    collapsible: false,
    jsonShape: {
      categoria_principal: '2. Entidades construidas (antropogénicas)',
      subcategoria: '2.1 Edificio',
      tipo_especifico: '2.1.3 Edificio religioso',
      codigo: '2.1.3',
    },
    promptHint: () =>
      'Clasificación (OBLIGATORIO): código más específico posible del árbol; rellenar categoria_principal, subcategoria, tipo_especifico y codigo.',
  },
  localizacion: {
    key: 'localizacion',
    label: 'Localización',
    description: 'Dirección estructurada en una línea',
    kind: 'text',
    collapsible: false,
    jsonShape: 'Dirección estructurada en una línea',
    promptHint: () =>
      'Localización: una sola línea con vía o núcleo, municipio, provincia, región/CCAA, país, continente.',
  },
  descripcion: {
    key: 'descripcion',
    label: 'Descripción',
    description: 'Texto principal con contexto histórico, geográfico y cultural',
    kind: 'long_text',
    alwaysOn: true,
    collapsible: true,
    jsonShape: 'Descripción evocadora según el tono y la longitud indicada',
    promptHint: ({ minLength }) =>
      `Descripción (~${minLength} caracteres mínimo, 5 frases mínimo): contenido según tono indicado, con contexto histórico, geográfico o cultural.`,
  },
  punto_destacado: {
    key: 'punto_destacado',
    label: 'Punto destacado',
    description: 'Frase impactante que captura la esencia del lugar',
    kind: 'text',
    collapsible: false,
    jsonShape: 'Frase destacada que capture la esencia del lugar',
    promptHint: () => 'Punto destacado: una frase impactante que capture la esencia única del lugar.',
  },
  observacion: {
    key: 'observacion',
    label: 'Observación',
    description: 'Información práctica para el visitante',
    kind: 'long_text',
    collapsible: true,
    jsonShape: 'Información práctica útil para el visitante',
    promptHint: () => 'Observación (opcional): información práctica útil para el visitante.',
  },
  etiquetas: {
    key: 'etiquetas',
    label: 'Etiquetas',
    description: 'Hashtags CamelCase sobre naturaleza, tipología y contexto',
    kind: 'list',
    collapsible: false,
    jsonShape: ['#Hashtag1', '#Hashtag2'],
    promptHint: () =>
      'Etiquetas: array de hashtags en CamelCase (5-10) describiendo naturaleza, tipología y contexto del lugar.',
  },
  datos_geograficos: {
    key: 'datos_geograficos',
    label: 'Datos geográficos',
    description: 'Continente, país, niveles administrativos, localidad, dirección',
    kind: 'object',
    collapsible: true,
    jsonShape: {
      continente: 'Europa',
      pais: 'España',
      admin_nivel_1: 'Comunidad Autónoma',
      admin_nivel_2: 'Provincia',
      admin_nivel_3: 'Comarca/Municipio',
      localidad: 'Ciudad/Pueblo',
      sublocalidad: 'Barrio',
      lugar_interes: 'Nombre del POI',
      direccion_postal: 'Dirección postal completa',
    },
    promptHint: () =>
      'Datos geográficos (OBLIGATORIO): continente, pais, admin_nivel_1, admin_nivel_2, admin_nivel_3, localidad, sublocalidad, lugar_interes, direccion_postal.',
  },
  datos_clave: {
    key: 'datos_clave',
    label: 'Datos clave',
    description: 'Tipo, dimensión, acceso, protección, coordenadas, web, contacto',
    kind: 'object',
    collapsible: true,
    jsonShape: {
      tipo: 'Tipo específico',
      dimension_principal: 'Si verificable',
      acceso: 'Si verificable',
      estado_proteccion: 'Si aplica',
      coordenadas: 'lat, lng',
    },
    promptHint: () =>
      'Datos clave: tipo, dimension_principal, acceso, estado_proteccion, coordenadas. Añadir web_referencia y datos_contacto solo si los sub-flags están activos.',
  },
  fuentes: {
    key: 'fuentes',
    label: 'Fuentes',
    description: 'Referencias institucionales, Wikipedia, portales oficiales',
    kind: 'list',
    collapsible: true,
    jsonShape: ['Fuente 1', 'Fuente 2'],
    promptHint: () =>
      'Fuentes: array con referencias institucionales, Wikipedia o portales oficiales de turismo.',
  },
  indice_interes: {
    key: 'indice_interes',
    label: 'Índice de interés',
    description: 'Puntuación 1-5 basada en relevancia turística',
    kind: 'number',
    collapsible: false,
    jsonShape: 4,
    promptHint: () =>
      'Índice de interés (1-5): 1=local, 2=regional, 3=nacional, 4=alto interés turístico, 5=icónico/patrimonio mundial. Devolver indice_interes (number) e indice_interes_notas (string).',
  },
};

export const DEFAULT_FIELD_ORDER: CardFieldKey[] = [
  'nombre_lugar',
  'clasificacion',
  'localizacion',
  'descripcion',
  'punto_destacado',
  'observacion',
  'etiquetas',
  'datos_geograficos',
  'datos_clave',
  'fuentes',
  'indice_interes',
];

/* ── Configuración persistida (v2) ── */

export interface CardFieldConfig {
  key: CardFieldKey;
  enabled: boolean;
  collapsed_default?: boolean;
  /** Sólo aplica a `long_text`. Override de `min_length` global */
  min_length?: number;
}

export interface EnrichmentCardConfigV2 {
  version: 2;
  tone: string;
  min_length: number;
  include_image: boolean;
  image_sources: string[];
  custom_prompt: string;
  correct_coordinates: boolean;
  /** Sub-flags de `datos_clave` */
  include_web: boolean;
  include_contact: boolean;
  fields: CardFieldConfig[];
}

export const DEFAULT_CARD_CONFIG_V2: EnrichmentCardConfigV2 = {
  version: 2,
  tone: 'divulgativo',
  min_length: 2000,
  include_image: true,
  image_sources: ['wikimedia_commons', 'wikipedia', 'user_uploaded'],
  custom_prompt: '',
  correct_coordinates: false,
  include_web: true,
  include_contact: true,
  fields: DEFAULT_FIELD_ORDER.map((key) => ({
    key,
    enabled: true,
    collapsed_default: CARD_FIELD_CATALOG[key].collapsible,
  })),
};

/**
 * Lee cualquier formato guardado (v1 con `field_order`+`disabled_fields`,
 * o v2 con `fields[]`) y devuelve siempre v2.
 */
export function normalizeCardConfig(raw: unknown): EnrichmentCardConfigV2 {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_CARD_CONFIG_V2 };
  const input = raw as Record<string, unknown>;

  // v2 ya normalizado
  if (input.version === 2 && Array.isArray(input.fields)) {
    return {
      ...DEFAULT_CARD_CONFIG_V2,
      ...input,
      fields: (input.fields as CardFieldConfig[]).filter((f) =>
        DEFAULT_FIELD_ORDER.includes(f.key),
      ),
    } as EnrichmentCardConfigV2;
  }

  // v1 legacy → migrar al vuelo
  const fieldOrder = (input.field_order as CardFieldKey[] | undefined) ?? DEFAULT_FIELD_ORDER;
  const disabled = new Set((input.disabled_fields as string[] | undefined) ?? []);
  // include_tags / include_interest_index actuaban como "disable" en v1
  if (input.include_tags === false) disabled.add('etiquetas');
  if (input.include_interest_index === false) disabled.add('indice_interes');
  if (input.show_sources === false) disabled.add('fuentes');

  const orderedKeys: CardFieldKey[] = [
    ...fieldOrder.filter((k) => DEFAULT_FIELD_ORDER.includes(k)),
    ...DEFAULT_FIELD_ORDER.filter((k) => !fieldOrder.includes(k)),
  ];

  const collapsibleSections = (input.collapsible_sections ?? {}) as Record<
    string,
    { default_collapsed?: boolean }
  >;

  return {
    version: 2,
    tone: (input.tone as string) ?? DEFAULT_CARD_CONFIG_V2.tone,
    min_length: (input.min_length as number) ?? DEFAULT_CARD_CONFIG_V2.min_length,
    include_image: (input.include_image as boolean) ?? true,
    image_sources:
      (input.image_sources as string[]) ?? DEFAULT_CARD_CONFIG_V2.image_sources,
    custom_prompt: (input.custom_prompt as string) ?? '',
    correct_coordinates: (input.correct_coordinates as boolean) ?? false,
    include_web: (input.include_web as boolean) ?? true,
    include_contact: (input.include_contact as boolean) ?? true,
    fields: orderedKeys.map((key) => ({
      key,
      enabled: !disabled.has(key),
      collapsed_default:
        collapsibleSections[key]?.default_collapsed ??
        CARD_FIELD_CATALOG[key].collapsible,
    })),
  };
}

/** Devuelve sólo los campos habilitados en orden. */
export function getActiveFields(cfg: EnrichmentCardConfigV2): CardFieldConfig[] {
  return cfg.fields.filter((f) => f.enabled || CARD_FIELD_CATALOG[f.key].alwaysOn);
}
