# PR-A.2 — `healthFilter` filtra de verdad el mapa

## Problema

Hoy `healthFilter` se trata como un "ámbito server-side" para el CTA de reparación, pero NO recorta `filteredLocations`. Resultado:

- Chip "Rellenar huecos 14" activo.
- El mapa sigue mostrando los 4777 puntos.
- La cámara hace fit (PR-A), pero el usuario ve un mar de markers sin saber cuáles son los 14.

Esto rompe el modelo mental del usuario: filtro = subconjunto, también visualmente.

## Cambio

`healthFilter` pasa a aplicarse en el matcher de `getFilteredLocations` como un eje más (junto a Geo/Tipo/Tags/búsqueda). Predicado canónico ya existe: `getPointHealthRings(loc).includes(healthFilter)`.

Comportamiento esperado:

1. Usuario activa "Rellenar huecos 14" → `filteredLocations` ⇒ 14.
2. Mapa muestra solo esos 14 markers (clustering normal aplicado).
3. Listas, contadores y CTA del eje Salud heredan el mismo subconjunto sin código nuevo (todos leen `filteredLocations`).
4. Toolbar superior (4777 / 5073) NO cambia — sigue siendo bucket-based, no afectada por filtros.
5. Quitar el chip → vuelve al universo previo.
6. Auto-fit del PR-A se mantiene; ahora encuadra el subconjunto que ya está visualmente filtrado.

## Implementación

**1. Helper único** — añadir el matcher en el pipeline existente (`src/domains/content/lib/location-filtering.ts`, donde ya viven los matchers de Geo/Tipo/Tags). Una función `matchesHealthFilter(loc, hf)` que delega en `getPointHealthRings`. Aplicada en el mismo bucle del resto de ejes.

**2. Limpiar la excepción** — eliminar el comentario "healthFilter NO se aplica en el pipeline cliente" en `FilterBar.tsx`. Los counts del eje Salud (`getHealthBucketCounts`) deben seguir calculándose sobre el universo SIN `healthFilter` aplicado, para que cada chip muestre su tamaño real (no se canibalicen entre sí). Eso requiere pasar a los chips el conteo derivado de `filteredLocations` antes del filtro de salud — usando el resto de ejes ya aplicados pero ignorando `healthFilter`. Helper nuevo `getFilteredLocationsIgnoringHealth()` o equivalente, derivado del mismo pipeline.

**3. Server-side RPC sin cambios** — `enqueue_health_repair` sigue recibiendo `location_ids` desde `health-filter-scope`, que ya opera sobre `filteredLocations`. El subset es ahora más estricto pero el contrato no cambia.

**4. PR-A intacto** — `useHealthFilterFit` sigue calculando ids vía `getPointHealthRings` sobre `filteredLocations`. Coincide con lo que el mapa pinta. Ningún cambio en `subset-fit`.

## Out of scope

- Multi-select de chips de salud (sigue siendo single-select).
- Cambios en el RPC de reparación.
- Cambios en visibilidad por colección / aprobación.
- Outcomes post-reparación (PR-B1/B2 ya planificados).
- Revisar el modal de confirmación de reparación (no cambia).

## Criterio de cierre

- Activar "Rellenar huecos 14" → mapa muestra exactamente esos 14 markers, fit suave, contador inferior izquierdo refleja 14.
- Cambiar a "Reparar cadena N" → mapa muestra esos N.
- Volver a "Sin filtro 4777" → mapa vuelve al universo previo.
- Los chips siguen mostrando su conteo individual correcto (no se reducen a 0/14).
- CTA "Reparar" sigue actuando sobre el mismo subset.

## Memoria a actualizar

- `mem://logic/discovery/health-filter-axis`: `healthFilter` ahora SÍ filtra el pipeline cliente, no solo define ámbito server-side.
- `mem://ui/filter-axes-norm`: añadir Salud como eje activo del pipeline (junto a Geo/Tipo/Tags/búsqueda).
