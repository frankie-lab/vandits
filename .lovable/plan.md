# PR-4A.2 — Contadores de POIs en chips de salud

## Problema

Los chips de salud (Sin filtro / Rellenar huecos / Reparar cadena / Revisar / Reintentar) no informan de cuántos POIs caen en cada bucket. El usuario tiene que hacer click en cada chip para descubrirlo, y el panel se siente "ciego" comparado con el resto de la consola.

## Solución (mínima, sin reestructurar)

Mostrar un contador junto al label de cada chip, derivado del **mismo universo que el resto de filtros** (Explorar) pero **ignorando el propio `healthFilter`** (para no auto-colapsar a 0 los demás buckets cuando uno está activo).

```
[ · Sin filtro 4 779 ]  [ · Rellenar huecos 14 ]  [ · Reparar cadena 7 ]  [ · Revisar 2 ]  [ · Reintentar 0 ]
```

## Helper único

`src/domains/content/lib/location-health-counts.ts` (nuevo):

```ts
export interface HealthBucketCounts {
  total: number;
  partial: number;
  chain: number;
  review: number;
  hardError: number;
}
export function getHealthBucketCounts(
  locations: GeoLocation[],
): HealthBucketCounts
```

- Una sola pasada O(n) sobre el array.
- Reutiliza `hasPartialGeo`, `hasBrokenGeoChain`, `hasReviewFailure`, `hasHardError` de `point-health-rings.ts` (ya canónicos).
- No filtra; solo cuenta. El caller decide qué universo pasarle.

## Cableado en `FilterBar.tsx`

Sustituir el array literal `buckets` (líneas 372-379) por uno con `count`:

1. Calcular el universo "filtrado por todo MENOS healthFilter":
   ```ts
   const filteredIgnoringHealth = useMemo(() => {
     const { healthFilter: _omit, ...rest } = filters;
     return getAllLocations().filter((loc) =>
       matchesLocationFilters(loc, rest, /* same opts as store */ ...),
     );
   }, [filters, getAllLocations]);
   ```
   Para evitar re-implementar las opts del matcher (visibility/document/etc.) y mantener paridad transversal, **opción preferida**: reutilizar `filteredLocations` cuando `filters.healthFilter == null` y, cuando hay healthFilter activo, recomputar el universo neutro vía un selector pequeño en el store (`getFilteredIgnoringHealth()`). Decisión final tras leer `locations-store.ts`: si las opts internas son triviales, hacerlo inline; si no, exponer selector. (Implementación: empezar inline; si requiere copiar >5 líneas del store, mover al store.)
2. `const counts = useMemo(() => getHealthBucketCounts(filteredIgnoringHealth), [filteredIgnoringHealth])`.
3. Inyectar `count` en cada bucket:
   - `Sin filtro` → `counts.total`
   - `Rellenar huecos` → `counts.partial`
   - `Reparar cadena` → `counts.chain`
   - `Revisar` → `counts.review`
   - `Reintentar` → `counts.hardError`

## Render del chip

Misma fila, mismo `Button` `size="sm"`, mismo gap. El número va como un `<span>` después del label, con tipografía tabular para que no baile:

```tsx
{b.label}
<span className="ml-0.5 tabular-nums text-muted-foreground/80 text-[11px]">
  {formatCount(b.count)}
</span>
```

Estilo cuando el chip está `active`: el contador hereda el color del label (no aplicar `text-muted-foreground`). Para puntos miles, usar `Intl.NumberFormat(locale).format(n)` o helper existente si lo hay.

## Reglas / no-regresiones

- **No tocar** la lógica del CTA (`HealthFilterActionCTA`) ni el RPC `enqueue_health_repair` — siguen calculando su scope server-side.
- **No mover** `healthFilter` a otro lugar; sigue siendo single-select dentro del modo Mantener.
- **No cambiar** label `Sin filtro` (acordado en PR-4A).
- Los counts **respetan los demás filtros activos** (Geo/Tipo/Tags/búsqueda). Si el usuario filtra "Galicia", los chips muestran salud SOLO de Galicia. Esto es coherente con la consola operativa: "filtros describen universo".
- Counts derivados client-side. No afectan al server-side filter del RPC (que opera sobre el mismo universo via `_scope_mode`).
- Bucket `hardError`/`review` con count 0 sigue siendo clickable (UX consistente; el preview ya maneja "no_eligible").

## Archivos

**Nuevo**
- `src/domains/content/lib/location-health-counts.ts` — helper + tipo.

**Editado**
- `src/components/FilterBar.tsx` — `buckets` con count + render del span.

**Memoria**
- Update `mem://logic/discovery/health-filter-axis`: añadir línea "Chips muestran count del bucket en universo ignorando healthFilter, vía `getHealthBucketCounts`".
- Sin cambios en Core del index.

## QA

1. Sin filtros → cada chip muestra el count correcto del universo total.
2. Filtro Geo "Galicia" activo → counts bajan al subset Galicia. `Sin filtro = total Galicia`.
3. Activar `Rellenar huecos` → el count de los demás chips NO se colapsa a 0; siguen reflejando su bucket en el universo.
4. Filtro que deja 0 puntos → todos los chips muestran 0 (incluido `Sin filtro`). Sin error.
5. Tipografía tabular: contador de 4 779 no salta al pasar a 4 780.
6. Recompute solo cuando cambian filtros o llega realtime (memoizado).

## Fuera de alcance

- Iconos / mini-anillos junto al count.
- Counts en el resto de la app (catálogo, gallery).
- PR-4B (CatalogSummary, ContextBar, conteos clicables del summary).
