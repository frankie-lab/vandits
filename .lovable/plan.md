## Fase 3.1 — Mapping fix: `raw_geocode` llega al frontend

Restaura las señales geo en `GeoLocation` para que `computePoiMaturity` pueda graduar enriched más allá de POI-3. Sin tocar datos, renderer, colores ni migrations.

### 1. `src/types/location.ts` (~L271)

Añadir al interface `GeoLocation`, junto a `geoHealth`:

```ts
/** Raw geocoder payload (cache de `locations.raw_geocode`). Señal para POI-4+. */
rawGeocode?: unknown;
/** Timestamp ISO de resolución geo (cache de `locations.geo_resolved_at`). */
geoResolvedAt?: string | null;
/** Confianza 0..1 del geocoder (cache de `locations.geo_confidence`). */
geoConfidence?: number | null;
/** Fuente del geocoder (cache de `locations.geo_source`). */
geoSource?: string | null;
```

### 2. `src/domains/content/lib/db-transformers.ts`

En `dbLocationToGeoLocation`, añadir antes de `createdAt`:

```ts
rawGeocode: loc.raw_geocode ?? null,
geoResolvedAt: loc.geo_resolved_at ?? null,
geoConfidence: loc.geo_confidence ?? null,
geoSource: loc.geo_source ?? null,
```

`v_locations_resolved` ya expone esas columnas (verificado en auditoría previa); el `select('*')` actual las trae.

### 3. Tests (nuevo archivo `src/test/db-transformers-raw-geocode.test.ts`)

- `dbLocationToGeoLocation` preserva `raw_geocode → rawGeocode` (objeto, no perdido).
- `dbLocationToGeoLocation` preserva `geo_resolved_at`, `geo_confidence`, `geo_source`.
- Row sin `raw_geocode` → `rawGeocode === null`.
- **Integración con `computePoiMaturity`**:
  - Row enriched + `raw_geocode` poblado + `geo_health='ok'` + `descripcion` → `computePoiMaturity(dbLocationToGeoLocation(row)) > 3`.
  - Row enriched sin `raw_geocode` → `computePoiMaturity(...) <= 3` (regresión: deuda residual sigue capada).

### 4. Bump v1.3.2 → v1.3.3

- `package.json`
- `src/lib/app-version.ts`
- `README.md` (entrada changelog v1.3.3 — fix mapping geo signals)
- `docs/releases/version-history.md` (entrada v1.3.3)

### 5. `docs/tech-debt.md`

- Marcar Fase 3.1 aplicada en el roadmap del canon cromático v3.
- Anotar deuda residual separada: **~340 POIs enriched sin `raw_geocode` en DB** (backfill server-side pendiente, fuera del alcance de Fase 3.1).

### Invariantes

- No se tocan: `computePoiMaturity`, `resolvePoiVisualGrammar`, `createCustomIcon`, tokens, RLS, edge functions, migrations, datos.
- Cambio aditivo: campos opcionales nuevos; ningún consumidor existente afectado.
- Impacto visual: POIs enriched con `raw_geocode` en DB pasarán de POI-3 a POI-4+ según señales adicionales (esperado y deseado).

### Reporte final (post-ejecución)

- Archivos modificados (5) + 1 test nuevo.
- Resultados de los tests añadidos.
- Versión final `1.3.3`.
- Confirmación: 0 cambios en datos / renderer / tokens.
