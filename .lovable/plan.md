# Roadmap: Curated sharing boundary (3 PRs secuenciales)

Dirección aprobada: **Sharing = contenido curado · Health/tint = dominio privado del owner · Followed = pennant + owner stroke (PR-2) · Tags = compartible · Colecciones = privadas**.

Se divide en 3 PRs independientes. Solo se implementa **PR-1** ahora; PR-2 y PR-3 quedan documentados como tickets diferidos.

---

## PR-1 — Curated sharing boundary

Objetivo único: que un seguidor solo vea POIs publicables del usuario seguido y que health/tint dejen de aplicarse a contenido ajeno. **Sin cambios visuales de marker.**

### Definición canónica (helpers únicos)

```ts
// src/domains/content/lib/geo-health.ts (nuevo)
export function isHealthyShareableGeo(loc: GeoLocation): boolean {
  return loc.geoHealth === 'ok';
}

// src/domains/content/lib/is-shareable-poi.ts (nuevo)
export function isShareablePoi(loc: GeoLocation): boolean {
  return (
    isPointEnriched(loc)                                  // descripcion no vacía
    && isHealthyShareableGeo(loc)                         // helper único, evolutivo
    && (loc.visibility === 'followers' || loc.visibility === 'public')
    && !loc.deletedAt
  );
}
```

`is_approved` queda **fuera** de PR-1. Se incorporará si llega a ser campo canónico estable. `isHealthyShareableGeo` se usa también en cualquier futura check (export/share/admin), no solo aquí.

### Cambios técnicos

#### Helpers nuevos
- `src/domains/content/lib/geo-health.ts` → `isHealthyShareableGeo(loc)`. Doc: "criterio actual = `geo_health='ok'`; evolutivo si aparecen nuevos buckets".
- `src/domains/content/lib/is-shareable-poi.ts` → `isShareablePoi(loc)`. Compone `isPointEnriched` + `isHealthyShareableGeo` + visibility + deleted.

#### Helpers existentes — guard por ownership (sin singleton)
- `getPointHealthRings(loc, currentUserId)` → early return `[]` si `loc.ownerUserId !== currentUserId`. Argumento explícito.
- `getTintForLocation(locId, currentUserId)` → return `null` si el POI no es del caller.

Call-sites: `LocationMap.tsx`, `MiniMarker`, `PoiPreview`, V2 renderer. Todos ya tienen acceso a `currentUserId` vía `useAuth`/contexto.

#### Filtro client-side — orden crítico
**`isShareablePoi` se aplica ANTES de cualquier paso de viewport culling, clustering o markerLocations.** Esto evita clusters con conteos inflados o entradas vacías.

Pipeline canónico (documentado en código y memoria):

```
rawLocations
  → universeFilter (visibility/ownership básica + isShareablePoi para followed)
  → filteredLocations          ← verdad lógica (UI counts, listas, exports)
  → applyViewportCulling
  → markerLocations            ← solo render
  → clustering
```

- `useFilteredLocations` (o helper equivalente): aplica el filtro shareable a followed antes de exponerlos como `filteredLocations`.
- `getBucketStats`: `followedCatalog` + (renombrado, ver más abajo) cuentan solo shareable.

#### Naming — bucket de followed
- Renombrar **`followedWorkspace` → `followedShared`** en `getBucketStats`, `getLocationBucket` y consumidores. Si los seguidos solo muestran contenido publicable, "workspace" es semánticamente incorrecto. `followedCatalog` se mantiene (ya implica catálogo aprobado).
- Actualizar `mem://logic/content/location-bucket-matrix` con el nuevo nombre.
- Buscar/sustituir global. Sin cambios de comportamiento — solo naming + memoria.

#### Eje Salud — simplificación
- `health-filter-scope.ts`: eliminar `repairableIds`/`repairableCount`. Universo del eje = solo POIs propios.
- `HealthFilterActionCTA.tsx`: label "Reparar (N)".
- `HealthRepairPreviewDialog.tsx`: borrar columna "Solo lectura · seguido" y subline "De usuarios seguidos: X".
- RPC `enqueue_health_repair`: sin cambios (el cliente nunca le pasará followed; coincidencia 1:1).

#### Realtime — pérdida de estado curado
**Decisión de producto explícita**: si un POI seguido pierde `shareable` (owner rompe geo, retira visibility, etc.), **desaparece inmediatamente** del mapa del seguidor. Si tiene popup abierto, se cierra junto con el rebuild. Cluster recalcula.

- Documentar en `mem://logic/sharing/curated-only-rule` y en JSDoc de `isShareablePoi`.
- `useRealtimeLocations` ya emite UPDATE → `filteredLocations` se recomputa → marker se va. No se requiere código nuevo, solo verificar que el path no preserva el marker desaparecido (excepción `popup-persist-on-rebuild` aplica solo a acciones del propio caller, no a cambios remotos).

#### Tests
- `src/test/geo-health.test.ts` (nuevo): `isHealthyShareableGeo` true solo para `'ok'`.
- `src/test/is-shareable-poi.test.ts` (nuevo): 4 ramas de exclusión + positivos + interacción con `isPointEnriched`.
- `src/test/health-rings.test.ts`: caso "followed → []".
- `src/test/collection-visibility.test.ts`: caso "tint=null para followed".
- `src/test/health-filter-scope.test.ts`: limpiar split repairable.
- `src/test/locations-store.test.ts`: `getBucketStats` excluye followed no-shareable; `followedShared` reemplaza `followedWorkspace`.
- Test nuevo de pipeline order: shareable filter aplicado **antes** de markerLocations.
- Test realtime: UPDATE que rompe `geo_health` de un seguido → desaparece de `filteredLocations`.

#### Memoria
- Nueva `mem://logic/sharing/curated-only-rule` — `isShareablePoi` (4 condiciones). Health/tint = privado del owner. **Pipeline order**: shareable antes de culling/clustering. **Realtime**: pérdida de curado elimina visibilidad inmediatamente. PR-1 client-side; servidor en PR-3.
- Nueva `mem://logic/content/healthy-shareable-geo` — Helper `isHealthyShareableGeo` para todo lo que necesite "salud apta para compartir/exportar".
- Actualizar `mem://style/map/health-rings-rule` — rings SOLO en POIs propios.
- Actualizar `mem://logic/collections/visibility-and-styling` — tint SOLO en POIs propios.
- Actualizar `mem://logic/discovery/health-filter-axis` y `mem://logic/health/workflow-split` — universo solo propios; split repairable eliminado.
- Actualizar `mem://logic/content/location-bucket-matrix` — buckets `myCatalog`/`myWorkspace`/`followedCatalog`/**`followedShared`**; followed solo cuenta shareable.
- `mem://index.md` Core: añadir "Sharing curado: followed visible solo si enriched + geo_health=ok + visibility≠private. Health/tint = privado del owner. Pipeline: shareable antes de culling."

### Validación

1. Followed con `geo_health='partial'` → invisible en mapa, listas, contadores y clusters.
2. Followed enriched + ok → visible (sin cambio visual).
3. Eje Salud chip "partial" → universo y CTA solo propios.
4. Top-bar azul `catalogTotal` → solo suma followed shareable.
5. UPDATE realtime que rompe geo de un seguido → desaparece del mapa sin reload.
6. `enqueue_health_repair` nunca recibe ids followed.
7. Tests cubren helpers, pipeline order, realtime y bucket rename.

### Fuera de alcance de PR-1

- Forma pennant, owner color, zoom gate, carnival guard → **PR-2**.
- Migración RLS server-side → **PR-3**.
- `is_approved` como condición de sharing.

---

## PR-2 — Followed pennant + owner color (futuro)

- Pennant suavizado en `createCustomIcon` para `!isOwn && currentZoom >= followedShapeMinZoom`.
- Paleta cerrada de 12 owner colors (azul/cyan/teal/violeta/índigo/verde frío). Hash FNV-1a determinista.
- Stroke proporcional: compact 1.5px · standard 2px · rich 2.5px.
- Toggle UX `LayersManagementPanel`: **Cerca / Medio / Siempre** (z≥12 / z≥9 / z≥6, default Medio).
- Carnival guard: >8 owners visibles → saturación 60%; >12 → stroke neutro.
- Stories `FollowedPoi` actualizadas (sin variantes con rings/tint, eliminadas en PR-1).
- Memoria: `mem://style/map/followed-shape-pennant`.

---

## PR-3 — RLS hardening server-side (futuro, no debe esperar mucho)

- Modificar `can_view_location(loc_row)` añadiendo, cuando el caller no es owner ni dueño del documento:
  ```sql
  AND loc_row.geo_health = 'ok'
  AND loc_row.enriched_data ? 'descripcion'
  AND length(trim(loc_row.enriched_data->>'descripcion')) > 0
  ```
- Migración + tests RLS (sandbox-agent ve solo shareable de frankie).
- El filtro client-side de PR-1 puede mantenerse como red de seguridad o eliminarse cuando se confirme paridad.
- Memoria: extender `mem://logic/sharing/curated-only-rule` con sección "RLS hardening".

---

## Veredicto operativo

PR-1 implementa la frontera completa client-side (helpers, filtro pre-clustering, rename `followedShared`, eje Salud simplificado, realtime documentado). PR-2 y PR-3 quedan como tickets aparte. Bug visual posterior a PR-1 será claramente atribuible a visibilidad — sin mezclar con render de pennant ni con RLS.
