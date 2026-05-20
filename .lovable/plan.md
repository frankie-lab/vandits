## Objetivo

Crear un contrato **docs-only** que defina cómo marcar POIs para excluirlos de reprocesos automáticos de geocoding/enrichment, sin tocar código, datos, migraciones ni versión.

## Entregables

### 1. Nuevo archivo: `docs/contracts/geo-resolution-flags-contract.md`

Secciones según briefing:

1. **Propósito** — el flag es metadato operativo, NO corrige el POI; previene reprocesos, gasto y falsos positivos.
2. **Ubicación canónica** — `custom_data.geo_resolution` (objeto con `status`, `reason`, `source`, `at`, `notes`). Elegida porque `custom_data jsonb` ya existe en `locations` y no requiere migración.
3. **Estados permitidos (6)** — `pending_review`, `needs_name_fix`, `needs_coord_fix`, `geo_irrecoverable`, `approved_for_geocode`, `resolved`. Con definición y semántica de cada uno.
4. **Reasons permitidos (10)** — enum cerrado: `synthetic_or_unverifiable_name`, `name_coordinate_mismatch`, `generic_name`, `tail_suffix_artifact`, `invalid_coordinates`, `null_island`, `missing_raw_geocode`, `manual_review_required`, `admin_alias_mismatch`, `other`.
5. **Reglas duras**:
   - Flags NO modifican `name`/`latitude`/`longitude`/`raw_geocode`/`enriched_data`/`geo_health`.
   - `geo_irrecoverable` ⇒ excluido de B5 automático.
   - `needs_name_fix` ⇒ excluido de B5 hasta corregir nombre.
   - `approved_for_geocode` ⇒ elegible para B5a.
   - `resolved` ⇒ solo cuando `raw_geocode`/`geo_health` quedan correctos o humano cierra el caso.
   - Todo cambio debe poblar `source`, `at` y opcionalmente `notes`.
6. **Aplicación al estado actual B5**:
   - 51 `human_review` de B5b → mapean a `pending_review` o `needs_name_fix` (según subbucket §1.1 GENERIC vs §1.2 TAIL del `b5b-human-review-queue.md`).
   - 19 `reject_geo_irrecoverable` de B5b → mapean a `geo_irrecoverable`.
   - 4 `Parque Municipal de <ciudad>` procesados en B5a.3 con `geo_health='ok'` cosmético → `pending_review`/`needs_name_fix` SIN tocar el `raw_geocode` ya resuelto (resuelve riesgo #5 del dry-run B5b).
7. **Futuro (no en scope)**:
   - UI admin filtrará por flags.
   - Batches futuros excluyen `geo_irrecoverable` y `needs_name_fix`.
   - Cola de revisión manual basada en este contrato.

Incluye tabla resumen estados × efecto sobre B5/B5a y ejemplo JSON canónico.

### 2. Actualizar `docs/tech-debt.md`

Añadir nota bajo ítem 7 (línea ~131, sección "Coherencia coordenadas-enriquecimiento"):

> **Pendiente:** aplicar flags de resolución geográfica a B5b/B5c según contrato `docs/contracts/geo-resolution-flags-contract.md`.

## Fuera de scope (confirmado por briefing)

- Sin código (sin helpers `setGeoResolutionFlag`, sin tipos TS, sin hooks).
- Sin datos (sin UPDATE a `custom_data`).
- Sin migración (no se añade columna ni constraint).
- Sin bump de versión.
- Sin tests ni lint (docs-only).

## Validación final

- `docs/contracts/geo-resolution-flags-contract.md` creado.
- `docs/tech-debt.md` actualizado bajo ítem 7.
- Confirmar: sin código, sin datos, sin bump.
- "tests/lint not run: docs-only geo-resolution flags contract."
