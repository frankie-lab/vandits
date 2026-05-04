Voy a arreglarlo de forma transversal, no con parches locales.

## Objetivo
Eliminar la deriva de lógica que hoy hace que distintas pantallas cuenten cosas distintas según:
- `is_approved`
- `documents.status`
- `enrichment_status`
- `enriched_data != null`
- `enriched_data.descripcion`

## Qué está roto ahora mismo

### 1. Visibilidad global en conflicto con decisiones anteriores
- `src/domains/content/lib/document-visibility.ts` hoy devuelve siempre `true`.
- `src/domains/content/store/locations-store.ts` hereda esa norma y deja visibles en mapa general todos los puntos accesibles.
- Eso contradice una norma aprobada antes donde los puntos de documento en workspace no debían contaminar el mapa general.

### 2. Enriquecimiento real no tiene una única fuente de verdad
Hoy conviven varias definiciones:
- correcta visualmente: `enriched_data.descripcion`
- incorrecta en store: `loc.enrichedData`
- incorrecta en algunos paneles: `enrichment_status === 'enriched'`
- incorrecta en backend/stats: `enriched_data IS NOT NULL`

Eso rompe contadores y clasificaciones.

### 3. Contadores correctos en unas vistas e incorrectos en otras
- `getBucketStats()` sí centraliza Catálogo/Workspace por `isApproved`.
- Pero `DocumentsPanel`, `DocumentContentManager`, función SQL `refresh_user_stats()` y otras piezas siguen usando reglas distintas.

## Arreglo transversal propuesto

### Fase 1 — Congelar helpers canónicos
Crear o consolidar helpers únicos para que todo el proyecto hable el mismo idioma:

1. **Visibilidad global**
   - Un helper único en Content que decida si un punto aparece en mapa general.
   - Debe contemplar explícitamente:
     - punto manual sin documento
     - punto de documento en workspace
     - punto aprobado a catálogo
     - punto enlazado a ruta
     - vista de documento activa

2. **Enriquecimiento real**
   - Crear helper canónico tipo `hasRealEnrichment(loc)` basado en:
     - `enriched_data.descripcion` / `enrichedData.descripcion`
   - Crear helper complementario para clasificación completa:
     - `current`
     - `previous`
     - `unknown`
     - `new`
   - Todo lo demás deja de mirar `enriched_data != null` y `enrichment_status === 'enriched'` como verdad final.

3. **Inventario del punto**
   - Crear helper/selector transversal para responder siempre:
     - pertenece a catálogo o workspace
     - es propio o seguido
     - viene de documento o manual
     - está enlazado a ruta
     - tiene enriquecimiento real o no

### Fase 2 — Reemplazar duplicaciones en toda la UI
Reapuntar los consumidores al helper canónico, sin fixes locales:

Archivos a alinear:
- `src/domains/content/store/locations-store.ts`
- `src/domains/content/lib/document-visibility.ts`
- `src/domains/content/store/enrichment-helpers.ts`
- `src/domains/content/components/DocumentsPanel.tsx`
- `src/domains/content/components/DocumentContentManager.tsx`
- `src/domains/content/components/DocumentWaypointsTabs.tsx`
- `src/domains/content/components/DocumentFocusView.tsx`
- `src/domains/content/components/PointContextActions.tsx`
- `src/components/FloatingToolbar.tsx`
- `src/components/FilterBar.tsx`
- `src/components/LocationList.tsx`
- `src/components/LocationMap.tsx`

### Fase 3 — Alinear backend/stats con la misma semántica
Ahora mismo la función SQL `refresh_user_stats()` cuenta enriquecidos con `enriched_data IS NOT NULL`, que no equivale a enriquecimiento real.

Haré una migración para corregir esa función y pasar a semántica canónica de enriquecimiento real.

También revisaré cualquier otra consulta que use:
- `enriched_data IS NOT NULL`
- `enrichment_status = 'enriched'`
como sustituto de “enriquecido real”.

### Fase 4 — Validación de regresión obligatoria
Voy a verificar, con tus datos reales, esta matriz mínima:

```text
Caso A: punto manual sin documento
Caso B: punto importado en documento workspace
Caso C: punto aprobado a catálogo
Caso D: punto con description importada pero sin IA
Caso E: punto con IA real (descripcion)
Caso F: punto enlazado a ruta
Caso G: punto en documento abierto
Caso H: punto en documento cerrado
```

Y validaré que todos estos números salgan coherentes a la vez:
- importados míos totales
- mi catálogo
- mi workspace
- enriquecidos reales
- visibles en mapa general
- conflictos

## Resultado esperado
Después del arreglo, el sistema volverá a ser coherente:
- un mismo punto contará igual en mapa, paneles, tabs y estadísticas
- no habrá una pantalla contando “enriquecido” por stub y otra por descripción real
- no habrá contadores basados en una lógica y visibilidad basada en otra
- cualquier cambio futuro tendrá que tocar el helper central, no 6 componentes distintos

## Detalle técnico

### Helpers canónicos a dejar como SoT
- `isLocationVisibleInGlobalMap(...)`
- `getLocationBucket(...)` / `getBucketStats(...)`
- nuevo helper `hasRealEnrichment(...)`
- `getLocationEnrichmentStatus(...)` apoyado en ese helper
- nuevo selector de inventario/estado transversal del punto

### Cambios de base de datos
Sí, aquí hace falta al menos una migración pequeña:
- actualizar la función `public.refresh_user_stats()` para que “enriched” signifique enriquecimiento real, no simplemente JSON no nulo.

## Orden de ejecución
1. fijar helper de enriquecimiento real
2. fijar helper de visibilidad global
3. sustituir duplicaciones en store/componentes
4. corregir función SQL de estadísticas
5. validar con tu caso real

En cuanto lo apruebes, lo implemento así: transversal, sin hardcodes y sin fixes sobre el ejemplo.