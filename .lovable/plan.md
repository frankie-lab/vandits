# Plan: batch-enrich usa places_trunk

Replicar la lógica de tronco que ya existe en `triggerEnrichLocation` (cliente, punto a punto) dentro de `supabase/functions/batch-enrich/index.ts` (servidor, lote masivo) para que TODA importación reuse el catálogo troncal.

## Cambios

### `supabase/functions/batch-enrich/index.ts`

Dentro del bucle `for (const locationId of remainingIds)`, antes del actual fallback "catalog twin" (linea ~172) y antes de la llamada a `enrich-location`:

1. **Lookup en tronco** vía `supabase.rpc('lookup_trunk_place', { _latitude, _longitude, _place_type, _max_distance_meters: 250 })`.
2. Si `trunk.is_fresh === true` y `trunk.enriched_data`:
   - Update local: `locations.enriched_data = trunk.enriched_data`, `enrichment_status = 'enriched'`, recalcular `place_type` con `getPlaceTypeFromTipo(trunk.enriched_data?.datos_clave?.tipo)` si procede.
   - Marcar `processedIds.push(locationId)` y `continue` (sin coste IA, sin delay 1500ms — bajar a 50ms para mantener fluidez).
3. Si NO hay match fresco: seguir el flujo actual (catalog twin → enrich-location).
4. Tras un enrich-location exitoso: añadir `supabase.rpc('upsert_trunk_place', {...})` con el `enriched_data` recién generado (con try/catch silencioso para no romper el job si falla).

### Mantener intacto
- La rama "catalog twin" se conserva como segunda red de seguridad para puntos del mismo usuario sin tronco aún (raro tras backfill, pero defensivo).
- TTL y umbral 250m vienen del helper SQL — no se duplica lógica en TS.
- El delay de 1500ms se mantiene sólo cuando hay llamada real a IA.

## Resultado esperado

Re-importar `FullTrips_Map.kml` (o cualquier KML con puntos ya enriquecidos por cualquier usuario):
- Coste IA: 0 tokens para los puntos que ya estén en tronco frescos.
- Tiempo: segundos en vez de minutos.
- Toast/log: "Heredado de tronco" diferenciado de "Enriquecido (IA)".

## Notas técnicas
- `batch-enrich` corre con `SUPABASE_SERVICE_ROLE_KEY` → bypass RLS, puede leer/escribir `places_trunk` sin restricciones.
- `upsert_trunk_place` ya cuenta con `SECURITY DEFINER`; pasar `_enriched_by = location.owner_user_id` cuando esté disponible para mantener trazabilidad del primer enriquecedor.
