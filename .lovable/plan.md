

# VANDITS V2 — Plan Definitivo (10 ajustes finales)

## Resumen

Se incorporan los 10 ajustes finales al modelo de datos, la gramatica visual y la estrategia de transicion. Tras esto, el plan se congela y se abren tres entregables operativos: DDL real, RFC frontend, y plan de transicion de datos.

---

## Ajuste 1: Enums de BD para `source_type` e `import_status`

Crear enums en vez de text libre, igual que `map_context_type`:

```sql
CREATE TYPE document_source_type AS ENUM ('kml', 'gpx', 'geojson', 'csv', 'manual');
CREATE TYPE document_import_status AS ENUM ('parsing', 'reviewing', 'confirmed', 'partial', 'failed');
```

Los campos de `documents` pasan de `text` a estos tipos. Elimina deriva semantica en campos nucleares.

---

## Ajuste 2: Canonicalizacion continua con `place_merge_history`

No solo migrar, sino mantener capacidad permanente de fusion:

```sql
CREATE TABLE place_merge_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_place_id uuid NOT NULL,
  target_place_id uuid NOT NULL,
  merged_at timestamptz NOT NULL DEFAULT now(),
  merged_by uuid,
  reason text
);
CREATE INDEX idx_merge_source ON place_merge_history(source_place_id);
CREATE INDEX idx_merge_target ON place_merge_history(target_place_id);
```

El servicio `place.service.ts` incluye un metodo `mergePlaces(sourceId, targetId)` que:
- Reasigna waypoints y user_places del source al target
- Registra en `place_merge_history`
- Soft-deletes el source place

---

## Ajuste 3: `document_tracks.coordinates` como deuda tecnica anotada

Se mantiene `jsonb` para V2. Se documenta explicitamente como deuda tecnica:

> **Deuda tecnica**: `document_tracks.coordinates` usa jsonb. Si se requiere analisis geoespacial real (intersecciones, buffers, proximidad de tracks), migrar a PostGIS `geometry(LineString, 4326)`. No bloquea V2.

---

## Ajuste 4: MapState no mutuamente excluyente

Reemplazar `state: MapState` por un objeto composable:

```typescript
interface MapFeatureState {
  isSelected: boolean;   // interaccion temporal
  isVisited: boolean;    // estado persistente
  isFavorite: boolean;   // estado persistente
  isConflict: boolean;   // condicion de waypoint (ajuste 5)
}
```

La gramatica visual aplica decoraciones en orden de prioridad:
1. `isSelected` -> halo dorado (domina visualmente)
2. `isConflict` -> borde rojo
3. `isFavorite` -> estrella
4. `isVisited` -> check

Multiples decoraciones pueden coexistir.

---

## Ajuste 5: `conflict` fuera de `MapEntityType`

```typescript
// Antes
type MapEntityType = 'place' | 'waypoint' | 'conflict' | 'track';

// Despues
type MapEntityType = 'place' | 'waypoint' | 'track';
// conflict vive en MapFeatureState.isConflict
```

---

## Ajuste 6: Separar `MapSource` en procedencia y contexto

```typescript
// Procedencia persistente (de donde viene la entidad)
type MapOwnershipSource = 'own' | 'followed' | 'curator' | 'druid';

// Contexto de presentacion (por que se muestra ahora)
type MapRenderContext = 'default' | 'document' | 'search';

interface MapFeature {
  // ...
  ownershipSource: MapOwnershipSource;
  renderContext: MapRenderContext;
  // en vez de source: MapSource
}
```

---

## Ajuste 7: Renombrar hook a `useResolvedMapFeatures`

El hook se renombra para reflejar que no es un mapping trivial sino una composicion de multiples fuentes:

```text
useResolvedMapFeatures(mapMode, filters, preferences)
  -> Lee places, waypoints, user_places segun modo
  -> Cruza con preferencias de visibilidad
  -> Aplica gramatica visual
  -> Emite MapFeature[]
```

Documentacion interna explicita de que este hook es el punto de composicion central.

---

## Ajuste 8: Matriz de feature flags

### Clasificacion

| Flag | Tipo | Controla |
|------|------|----------|
| `v2_data_read_places` | Lectura | Lee de places+waypoints |
| `v2_data_read_user_places` | Lectura | Lee status/favoritos de user_places |
| `v2_data_write_imports` | Escritura | Importaciones escriben en waypoints+documents |
| `v2_data_write_user_places` | Escritura | Favoritos/visited escriben en user_places |
| `v2_map_features` | Render | Mapa consume MapFeature[] |
| `v2_collections` | Render | Seccion Mis Sitios con colecciones |

### Combinaciones validas (orden de activacion)

```text
Fase A: v2_data_read_places + v2_data_read_user_places
  (lectura nueva, escritura legacy, render legacy)

Fase B: + v2_data_write_imports
  (importaciones ya escriben V2, resto legacy)

Fase C: + v2_data_write_user_places
  (toda escritura V2)

Fase D: + v2_map_features
  (render nuevo, datos V2 completos)

Fase E: + v2_collections
  (UI completa V2)
```

### Combinaciones prohibidas

- `v2_map_features` sin `v2_data_read_places` (render V2 sin datos V2)
- `v2_data_write_imports` sin `v2_data_read_places` (escribe V2, lee V1)
- `v2_collections` sin `v2_data_read_user_places` (UI V2 sin modelo relacional)

---

## Ajuste 9: Repositories faltantes

Anadir al esquema:

```text
src/repositories/
  document-track.repository.ts
  map-preferences.repository.ts
  place-merge.repository.ts  (para canonicalizacion continua)
```

---

## Ajuste 10: Estrategia de escrituras en transicion

### Decision: dual-write progresivo por superficie

| Superficie | Fase A-B | Fase C-D | Post-migracion |
|-----------|----------|----------|----------------|
| Importaciones | Solo legacy | Dual-write (locations + waypoints) | Solo V2 |
| Favoritos/visited | Solo legacy (user_location_status) | Dual-write (+ user_places) | Solo V2 |
| Edicion de rutas | Sin cambios | Sin cambios | Referencia places |
| Resolucion waypoints | N/A | Escribe en waypoints | Solo V2 |
| Merge/canonicalizacion | N/A | Escribe en place_merge_history | Solo V2 |

### Principio: nunca leer V1 y escribir V2 simultaneamente en la misma superficie.

Los servicios encapsulan la logica dual:
```typescript
// import.service.ts
async importDocument(file, options) {
  const doc = await this.writeDocument(file);
  const waypoints = await this.parseWaypoints(doc);
  
  if (flags.v2_data_write_imports) {
    await waypointRepo.insertBatch(waypoints);  // V2
  }
  // Siempre escribe legacy hasta desactivacion
  await locationRepo.insertBatch(waypoints);     // V1
}
```

### Rollback

Cada fase de flag se puede revertir independientemente. Los datos legacy permanecen intactos hasta confirmacion de migracion exitosa. `place_merge_history` permite deshacer merges si se detectan errores.

---

## Resumen de los 10 ajustes

| # | Ajuste | Resolucion |
|---|--------|-----------|
| 1 | source_type/import_status como text | Enums de BD |
| 2 | Canonicalizacion solo en migracion | Tabla `place_merge_history` + servicio continuo |
| 3 | document_tracks.coordinates jsonb | Deuda tecnica anotada, PostGIS futuro |
| 4 | MapState mutuamente excluyente | Objeto composable `MapFeatureState` |
| 5 | conflict como entityType | Movido a `isConflict` en state |
| 6 | MapSource mezcla procedencia/contexto | Separado en `ownershipSource` + `renderContext` |
| 7 | useMapFeatures nombre trivial | Renombrado a `useResolvedMapFeatures` |
| 8 | Feature flags sin matriz | Clasificacion lectura/escritura/render + orden |
| 9 | Repositories incompletos | Anadidos document-track, map-preferences, place-merge |
| 10 | Estrategia de escrituras indefinida | Dual-write progresivo por superficie |

---

## Proximos pasos: 3 entregables operativos

Con el plan congelado, se abren:

1. **DDL real**: SQL con enums, tablas, indices, constraints, RLS — ejecutable directamente como migracion
2. **RFC frontend**: Arbol de rutas, contratos TS de MapFeature/LocationMap/ContextPanel, estrategia de flags, estructura de carpetas
3. **Plan de transicion**: Migracion de datos con canonicalizacion, dual-write, metricas de validacion, rollback

Cada entregable se implementa como paso independiente y verificable.

