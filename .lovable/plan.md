# Estándar de Enriquecimiento de Fichas (Card Schema Contract)

## Objetivo

Una **única fuente de verdad** (`app_settings.enrichment_card_config`) que defina la estructura, orden, contenido y extensión de las fichas, y que sea respetada de forma transversal por:

1. El panel **Configuración de fichas** (editor)
2. El **prompt y schema** de la IA en `enrich-location`
3. El **renderizado** del popup, vista de documento y miniaturas
4. La **vista previa** en el editor (sin divergencias)

Hoy el contrato está fragmentado: el editor define `field_order`, `disabled_fields`, `collapsible_sections`, longitud, tono, fuentes; el popup respeta parte; la IA usa solo tono/longitud/fuentes y devuelve un JSON con campos hardcodeados. Esto rompe la promesa de que "lo que defines en el panel es lo que sale en la ficha".

## 1. Schema canónico (en código, no hardcodeado en cada consumidor)

Crear `src/shared/enrichment/card-schema.ts` con el **catálogo maestro de campos**, la única lista que cualquier capa puede usar:

```ts
export type CardFieldKey =
  | 'nombre_lugar' | 'clasificacion' | 'localizacion'
  | 'descripcion' | 'punto_destacado' | 'observacion'
  | 'etiquetas' | 'datos_geograficos' | 'datos_clave'
  | 'fuentes' | 'indice_interes' | 'imagen';

export interface CardFieldDef {
  key: CardFieldKey;
  label: string;
  kind: 'text' | 'long_text' | 'list' | 'object' | 'number' | 'media';
  jsonShape: object;       // descripción JSON-schema-like para la IA
  promptHint: string;      // qué debe generar la IA
  collapsible: boolean;
  defaultLength?: { min?: number; max?: number }; // sólo long_text
}

export const CARD_FIELD_CATALOG: Record<CardFieldKey, CardFieldDef> = { ... };
```

Este catálogo se importa **tanto en frontend como en la edge function** (copia simétrica en `supabase/functions/enrich-location/_shared/card-schema.ts` con el mismo contenido — Deno no puede importar de `src/`).

## 2. Forma única de la configuración guardada

`app_settings.enrichment_card_config.value` queda con esta forma estable:

```jsonc
{
  "version": 2,
  "tone": "divulgativo",
  "min_length": 2000,
  "image_sources": ["wikimedia_commons", "wikipedia", "user_uploaded"],
  "show_sources": true,
  "correct_coordinates": false,
  "custom_prompt": "",
  "fields": [
    { "key": "nombre_lugar", "enabled": true,  "collapsed_default": false },
    { "key": "descripcion",  "enabled": true,  "collapsed_default": false, "min_length": 1500 },
    { "key": "observacion",  "enabled": false, "collapsed_default": true  },
    ...
  ]
}
```

`fields` reemplaza a `field_order` + `disabled_fields` + `collapsible_sections` (los tres se derivan de él). Migración con compatibilidad hacia atrás: si llega el formato viejo, se convierte al vuelo en la lectura.

## 3. Generador de prompt y schema dinámico (IA)

En `enrich-location/index.ts`, construir prompt y `response_format` a partir de la config:

- Filtrar `fields` por `enabled`.
- Construir el JSON schema de salida iterando en el orden definido y tomando `jsonShape` del catálogo.
- Inyectar en el system prompt: tono, longitud por campo, fuentes activas, custom_prompt y la lista exacta de campos a generar (con sus `promptHint`).
- Si `imagen` está deshabilitado, no se ejecuta la pipeline de imágenes (ahorro de tokens y latencia).
- Si `fuentes` está deshabilitado, no se pide bibliografía.

Resultado: la IA **nunca** genera campos que el panel ha desactivado, y los devuelve **en el orden** del panel.

## 4. Renderizado dirigido por el schema

`map-popups.ts`, la vista de documento y la `CardPreview` del editor usan el mismo helper:

```ts
renderCardSections(enrichedData, config, CARD_FIELD_CATALOG)
```

que recorre `config.fields` (filtrados por `enabled`, en orden) y delega cada uno a un renderer registrado por `key`. La vista previa del panel y el popup real producen markup equivalente.

## 5. Migración y limpieza

- Migración de datos en `app_settings`: leer valor actual, transformar a `version: 2`, guardar.
- Eliminar el código que asume orden fijo del JSON enriquecido.
- Las fichas ya enriquecidas siguen funcionando: el renderer ignora campos presentes pero deshabilitados, y muestra "—" para campos habilitados pero ausentes (con botón "Generar este campo" opcional, fuera de alcance aquí).

## Archivos afectados

- **Nuevos**: `src/shared/enrichment/card-schema.ts`, `supabase/functions/enrich-location/_shared/card-schema.ts`, `src/shared/enrichment/render-card.ts`.
- **Editados**: `supabase/functions/enrich-location/index.ts` (prompt + schema dinámicos), `src/components/map/map-popups.ts` (usa `renderCardSections`), `src/domains/content/components/EnrichmentCardConfig.tsx` (modelo `fields[]` unificado, preview vía `renderCardSections`), `src/lib/card-style-tokens.ts` (consumir catálogo).
- **Migración SQL**: actualizar `app_settings` clave `enrichment_card_config` al formato v2.

## Qué NO se hace

- No se tocan datos enriquecidos existentes en `locations.enriched_data`.
- No se introduce ningún campo nuevo: el catálogo refleja el estado actual del panel.
- No se cambia el modelo de fuentes de imagen ni el flujo de subida manual.

## Resultado

Tras aplicar el plan, el contrato es: **lo que esté activo y ordenado en "Configuración de fichas" será exactamente lo que la IA genere y lo que el popup muestre**, en cualquier punto del producto. Cambiar el orden, deshabilitar un campo o ajustar longitud mínima se propaga sin tocar código.
