# Fase 3 — Name-coordinate identity gate (R9)

Cumple R9 del contrato `docs/contracts/enrichment-coord-coherence-contract.md`. Tras Fase 1 (coords WGS84) y Fase 2 (`resolve-coordinates` canónico), añadimos un gate de identidad nombre↔coords antes del LLM. Salidas canónicas: `ok` | `name_coordinate_mismatch` | `name_found_elsewhere` | `identity_lookup_unavailable`. **Ninguna salida distinta de `ok` llama al LLM**.

## Cambio aprobado vs plan original

`identity_lookup_unavailable` (ambos lookups caídos) **NO continúa como `ok`**. Es bloqueo duro:
- `enrich-location` devuelve `{ success:false, validation_required:true, reason:'identity_lookup_unavailable' }` y NO llama LLM.
- `batch-enrich` mapea a `errorMessages[id] = { kind:'identity_lookup_unavailable', ... }` — no reintento, no `no_credits`.

## Arquitectura

`enrich-location` sigue siendo el único entry-point del LLM, por tanto R9 vive ahí. `batch-enrich` solo mapea reasons. Helper isomorfo (mismo código en cliente y Deno, igual que Fase 1 `coord-validity`) — usa solo `fetch`, inyectable para tests.

```text
enrich-location
   ├── R1: isValidWgs84Coord                       (ya cableado, Fase 1)
   ├── R3: resolve-coordinates(lat,lng)            (ya cableado, Fase 2)
   ├── R9 (NUEVO): assertNameCoordinateIdentity
   │      ├── search-nearby-osm(lat,lng,1000m)     → C_coords
   │      ├── search-candidates(name, near)        → C_name  (skip si name genérico)
   │      ├── BOTH fail   → identity_lookup_unavailable (BLOQUEA)
   │      ├── match alto en C_coords → ok
   │      ├── C_name todos > 1km → name_found_elsewhere (+ candidatos)
   │      └── resto → name_coordinate_mismatch (+ nearby hints)
   └── LLM (solo si status==='ok')
```

## Cambios

### 1. `src/shared/geography/name-coord-identity.ts` (NUEVO)
Helper isomorfo:
- `normalizeName(raw)`: lowercase + NFD strip diacritics + drop articles (`el|la|los|las|o|a|os|as|the`) + drop prefijos genéricos (`hotel|restaurante|iglesia de|playa de|faro de|mirador de|plaza de|calle|avenida…`).
- `isGenericName(raw)`: stoplist (`hotel|restaurante|bar|parking|mirador|iglesia|playa|monte|sin nombre|unnamed|…`) + `len<3 ⇒ true`.
- `similarity(a,b)`: 1 si normalizados iguales; 0.95 si substring ≥ 6 chars; resto `1 - Levenshtein/maxLen`.
- `haversineMeters(...)`.
- `assertNameCoordinateIdentity({ name, lat, lng, supabaseUrl, serviceKey, nearbyRadiusMeters=1000, farThresholdMeters=1000, matchThreshold=0.82, fetcher=fetch })`:
  1. `Promise.all` de `search-nearby-osm` y `search-candidates` (`search-candidates` se salta cuando `isGenericName(name)`).
  2. Si **ambas** fallan (network/timeout/5xx) → `{ status:'identity_lookup_unavailable', reason }`.
  3. Calcula `best = argmax_{c∈C_coords} similarity(name, c.name)`. Si `best.score ≥ matchThreshold` → `{ status:'ok', matched:best.c }`.
  4. Si `name` genérico y `C_coords` vacío → `{ status:'ok' }` (sin señal en ningún sentido; no bloqueamos imports masivos legítimos sin anchor cercano).
  5. Si `C_name` no vacío y **todos** > `farThresholdMeters` → `{ status:'name_found_elsewhere', candidates: top5 }`.
  6. Resto → `{ status:'name_coordinate_mismatch', nearby: top5 }`.

### 2. `supabase/functions/_shared/name-coord-identity.ts` (NUEVO, espejo Deno)
Idéntico al cliente, verbatim. Patrón ya validado en Fase 1 (`coord-validity.ts`).

### 3. `supabase/functions/enrich-location/index.ts`
Tras el bloque R3 (~L1886) y antes de `getGlobalEnrichmentConfig()` (~L1889) insertar:

```ts
// R9 — Name ↔ coordinate identity gate (Fase 3).
// Contrato: docs/contracts/enrichment-coord-coherence-contract.md.
try {
  const identity = await assertNameCoordinateIdentity({
    name: location.name, lat, lng,
    supabaseUrl: SUPABASE_URL, serviceKey: SERVICE_KEY,
  });
  if (identity.status === 'identity_lookup_unavailable') {
    return new Response(JSON.stringify({
      success: false, validation_required: true,
      reason: 'identity_lookup_unavailable',
      message: 'Lookups de identidad nombre↔coords no disponibles. POI no se enriquece.',
      providedName: location.name, coords: { lat, lng },
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  if (identity.status === 'name_coordinate_mismatch') {
    return new Response(JSON.stringify({
      success: false, validation_required: true,
      reason: 'name_coordinate_mismatch',
      message: 'El nombre no coincide con ningún POI cercano a estas coordenadas.',
      providedName: location.name, coords: { lat, lng },
      nearby: identity.nearby ?? [],
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  if (identity.status === 'name_found_elsewhere') {
    return new Response(JSON.stringify({
      success: false, validation_required: true,
      reason: 'name_found_elsewhere',
      message: 'El nombre existe en ubicaciones distintas a las coordenadas aportadas.',
      providedName: location.name, coords: { lat, lng },
      candidates: identity.candidates ?? [],
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  console.log('[R9] identity gate ok', { matched: identity.matched?.name });
} catch (e) {
  // Excepción inesperada del helper (no de lookups individuales, que ya
  // están protegidos). Aplicar la misma política de bloqueo: NO LLM.
  console.error('[R9] identity gate threw', e);
  return new Response(JSON.stringify({
    success: false, validation_required: true,
    reason: 'identity_lookup_unavailable',
    message: 'Gate de identidad nombre↔coords falló de forma inesperada. POI no se enriquece.',
    providedName: location.name, coords: { lat, lng },
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
```

Más import en cabecera:
```ts
import { assertNameCoordinateIdentity } from "../_shared/name-coord-identity.ts";
```

### 4. `supabase/functions/batch-enrich/index.ts`
Insertar ramas específicas **antes** del `else if (enrichData.validation_required)` genérico (~L372) para que las nuevas reasons no se mapeen a `kind:'no_match'`:

```ts
} else if (enrichData.validation_required && enrichData.reason === 'name_coordinate_mismatch') {
  throw Object.assign(new Error(enrichData.message || 'Nombre↔coords no coinciden'), {
    __structured: {
      kind: 'name_coordinate_mismatch',
      reason: 'name_coordinate_mismatch',
      providedName: enrichData.providedName ?? location.name,
      coords: enrichData.coords ?? { lat: location.latitude, lng: location.longitude },
      nearby: Array.isArray(enrichData.nearby) ? enrichData.nearby : [],
    },
  });
} else if (enrichData.validation_required && enrichData.reason === 'name_found_elsewhere') {
  throw Object.assign(new Error(enrichData.message || 'Nombre encontrado en otra ubicación'), {
    __structured: {
      kind: 'name_found_elsewhere',
      reason: 'name_found_elsewhere',
      providedName: enrichData.providedName ?? location.name,
      coords: enrichData.coords ?? { lat: location.latitude, lng: location.longitude },
      candidates: Array.isArray(enrichData.candidates) ? enrichData.candidates : [],
    },
  });
} else if (enrichData.validation_required && enrichData.reason === 'identity_lookup_unavailable') {
  throw Object.assign(new Error(enrichData.message || 'Lookups de identidad no disponibles'), {
    __structured: {
      kind: 'identity_lookup_unavailable',
      reason: 'identity_lookup_unavailable',
      providedName: enrichData.providedName ?? location.name,
      coords: enrichData.coords ?? { lat: location.latitude, lng: location.longitude },
    },
  });
```

Sin reintento, sin contar como `no_credits`. La rama legacy `enrichData.success === false && enrichData.reason === 'name_coordinate_mismatch'` (línea ~380) queda como compat y nunca se alcanza con el nuevo flujo (ya es `validation_required:true`).

### 5. Tests
- `src/test/name-coord-identity.test.ts` (NUEVO, vitest con `fetcher` inyectado):
  1. Fase 1 sentinel sigue rechazando `(0,0)` → garantiza que helper NO se llama con coords inválidas.
  2. Nombre + coords coinciden → `ok` + `matched`.
  3. Nombre no aparece cerca, sin candidatos remotos → `name_coordinate_mismatch` + `nearby` poblado.
  4. Nombre encontrado lejos (`distanceKm:1050`) → `name_found_elsewhere` + `candidates`.
  5. Nombre genérico (`"Hotel"`) + nearby vacío → `ok` + `isGenericName('Hotel')===true`.
  6. **Ambos lookups throw → `identity_lookup_unavailable`** (hard-block, cambio aprobado).
  7. `similarity()` tolera acentos y artículos.
- Fase 1 (`src/test/coord-validity.test.ts`) y Fase 2 (`supabase/functions/enrich-location/index.test.ts`) intactos.

### 6. Documentación + versión (patch 1.2.11 → 1.2.12)
- `package.json`: `"version": "1.2.12"`.
- `src/lib/app-version.ts`: `APP_VERSION = '1.2.12'`.
- `README.md`: título `v1.2.12`, badge `v1.2.12`, nuevo entry changelog `### v1.2.12 (2026-05-20)`.
- `docs/releases/version-history.md`: anchor `v1.2.12` actualizado como versión actual, marcar `v1.2.11` como `stable` (no `current`), añadir `- [ ] v1.2.12` a tags pendientes, fila tabla `1.x` con scope y archivos, "versión oficial actual: **1.2.12**".
- `docs/tech-debt.md` ítem 7: estado → `"en progreso — Fase 3 aplicada (2026-05-20)"`; bullet `3. Name-coordinate identity gate (R9)` → `✅ Aplicada en v1.2.12 (assertNameCoordinateIdentity en enrich-location + espejo Deno; identity_lookup_unavailable bloquea por contrato; batch-enrich propaga 3 kinds nuevos).`

## Fuera de scope (explícito)
- Migraciones SQL, datos históricos, re-enrich, mover coords automáticamente.
- `LocationMap.tsx`, RLS/RBAC, `places_trunk`, UI panels (panel de validación deferred).
- Escritura de `enrichment_status='pending_validation'` (extensión de enum deferred; reason solo en respuesta).
- Fases 4–7.

## Validación
- `bunx vitest run src/test/coord-validity.test.ts src/test/name-coord-identity.test.ts` → todo verde.
- Deno tests `enrich-location/index.test.ts` → siguen verdes.
- Lectura manual `batch-enrich` para confirmar nuevas ramas antes del catch-all `validation_required`.

## Version impact
patch — 1.2.11 → 1.2.12.
