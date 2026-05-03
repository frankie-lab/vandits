
## Objetivo

Que las fichas (popups del mapa y vista de documento) reflejen exactamente lo definido en **Configuración de fichas**: orden, secciones habilitadas, colapsables y extensión. Sin parches: usar el contrato v2 (`CARD_FIELD_CATALOG` + `normalizeCardConfig` + `getActiveFields`) como única fuente de verdad.

## Diagnóstico (causa raíz)

1. `loadCardConfig()` en `src/components/map/map-popups.ts` lee aún el formato **v1 legacy** (`field_order` + `disabled_fields`) en vez de pasar por `normalizeCardConfig`. Cualquier divergencia entre los espejos legacy y `fields[]` rompe el orden/habilitados.
2. `getCardConfig()` es síncrono y, tras `invalidateCardConfig()`, devuelve `DEFAULT_POPUP_CONFIG` hasta que se reabre el popup → primer render con orden/campos por defecto.
3. La **extensión del texto** (`min_length`) sólo se aplica al **generar**: los puntos enriquecidos antes del cambio conservan el texto antiguo. No es un bug de render, pero el editor no lo advierte.
4. El render usa hardcodeado el orden `['nombre_lugar', ...]` en lugar de iterar el catálogo v2.

## Cambios

### 1. `src/components/map/map-popups.ts` — consumir contrato v2

- Importar `normalizeCardConfig`, `getActiveFields`, `CARD_FIELD_CATALOG` desde `@/shared/enrichment/card-schema`.
- Sustituir `PopupCardConfig` por la `EnrichmentCardConfigV2` ya normalizada + un derivado `enabledKeys: CardFieldKey[]` (orden) y mapa `collapsedDefault` por campo.
- `loadCardConfig()`:
  - Lee `app_settings.enrichment_card_config` y pasa **siempre** por `normalizeCardConfig(raw)`.
  - Cachea el v2.
  - Sub-flags `include_web` / `include_contact` se leen del v2 (ya existentes); `include_tags` y `show_sources` derivan de `etiquetas`/`fuentes` habilitados (legacy ya migrado en `normalizeCardConfig`).
- `invalidateCardConfig()`: limpiar cache **y disparar reload** (`loadCardConfig().catch(() => {})`) para que el siguiente `getCardConfig()` síncrono no devuelva defaults durante un parpadeo.
- En el bloque IIFE de render (línea ~666) sustituir el array hardcodeado por `getActiveFields(cfg).map(f => f.key)` para iterar exactamente en el orden persistido.
- Para cada campo `collapsible: true` del catálogo, leer `collapsed_default` del config v2 al envolver con `wrapCollapsibleSection`.

### 2. `src/domains/content/components/EnrichmentCardConfig.tsx` — aviso de re-enriquecimiento

- Junto al control de `min_length` y al toggle de campos `long_text`, añadir una nota informativa (texto `text-xs text-muted-foreground`):  
  *"Los cambios de longitud y campos sólo se aplican al volver a enriquecer cada punto. Los puntos ya enriquecidos conservan su contenido anterior hasta re-enriquecerlos."*
- Tras `handleSave` exitoso, además del toast actual, mantener `invalidateCardConfig()` (ya existe).

### 3. Ningún cambio en la edge function

`enrich-location` ya consume el v2 mediante `_shared/card-schema.ts` y `buildEnrichmentSchema`. No se toca.

## Resultado esperado

- Reordenar/desactivar/colapsar un campo en el editor y guardar → al reabrir cualquier popup el cambio es inmediato y respeta el orden exacto.
- Sub-flags `include_web` / `include_contact` siguen funcionando dentro de `datos_clave`.
- Cambiar `min_length` se refleja sólo al volver a enriquecer, y el editor lo deja claro.

## Archivos

- `src/components/map/map-popups.ts` (refactor de `loadCardConfig`, `getCardConfig`, `invalidateCardConfig` y bloque de render por campos)
- `src/domains/content/components/EnrichmentCardConfig.tsx` (aviso UI)
