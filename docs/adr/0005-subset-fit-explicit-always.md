# ADR-0005 — `subset-fit` explícito `mode: 'always'`

## Problema
El listener de `subset-fit` aplicaba un cooldown global de 4s tras cualquier gesto manual del usuario (pan/zoom/drag). Esto silenciaba también los fits explícitos solicitados por el usuario (popover Mis POI, filtro por usuario), produciendo la sensación de que "el filtro no encuadra".

Adicionalmente, bajo viewport culling (z≥7 solo monta markers en viewport), resolver coords desde `markersRef` producía bounds parciales para subsets dispersos.

## Decisión
1. **Semántica de mode**:
   - `mode: 'always'` = acción explícita del usuario. **No respeta** cooldown manual.
   - `mode: 'if-outside'` = encuadre oportunista. Respeta cooldown manual y umbral 40%.
2. **Coords pre-resueltas**: el caller puede pasar `coords` con TODAS las coordenadas válidas del subset; el listener las prioriza sobre `markersRef`/`locationsRef`.
3. **Sin minZoom por defecto** en `mode: 'always'` para que subsets dispersos puedan zoomear por debajo de z7 si lo requieren.

## Consecuencias
- Click "Enriquecidos" / "Vacíos" / "Ver todos" en popover Mis POI encuadra TODOS los puntos del subset, sin depender del viewport actual ni de markers montados.
- Filtros pasivos (Geo/Tipo/búsqueda) siguen sin mover cámara (no llaman a `requestSubsetFit`).
- Calleres ya existentes con `if-outside` siguen igual.

## Tradeoffs
- Más responsabilidad del caller: debe declarar correctamente `mode`.
- Riesgo de "fit sorpresa" si un caller usa `always` para una acción no explícita. Mitigado por revisión: hoy solo `UsersSidebar` y popover Mis POI.

## Archivos afectados
- `src/components/map/subset-fit.ts`
- `src/components/LocationMap.tsx` (listener ~2350)
- `src/components/toolbar/use-my-catalog-popover-fit.ts`
- `src/components/UsersSidebar.tsx`
