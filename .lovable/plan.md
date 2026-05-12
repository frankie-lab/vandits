## PR-B0 — Fix bloqueante: el job de salud realmente procesa los IDs

Único PR a ejecutar ahora. PR-A / B1 / B2 quedan en cola pero **no se tocan** hasta que la verificación de B0 sea verde con un caso real.

---

### Diagnóstico

- `enqueue_health_repair` inserta el job con `mode='repair'` + `location_ids=[…elegibles]`.
- En `backfill-admin-fks`, cuando `mode='repair'`:
  - Se calcula `repairIds` vía `locations_with_broken_geo_chain` (solo `health='broken'`).
  - Se aplica `q.in('id', idsSlice)` (los `location_ids` del job) y luego `q.in('id', repairIds)`.
  - PostgREST colapsa los dos `.in()` sobre la misma columna → gana el último → los IDs explícitos del job se ignoran.
- Para acción `partial`, `repairIds` suele ser vacío (broken ≠ partial) → 0 procesados → job se cierra "completado" sin tocar nada → `geo_health` no cambia → puntos siguen en el bucket → bucle visible para el usuario.

### Cambio (una sola migración SQL)

Modificar `enqueue_health_repair` para que el INSERT en `geocoding_jobs` use el modo correcto según la acción:

- `partial` → `mode = 'fill'`
- `chain`   → `mode = 'reconcile'`

Razonamiento:
- `fill` ya respeta `location_ids` sin colisión `.in()` y filtra a "FKs altos vacíos" (alineado con `partial`).
- `reconcile` ya respeta `location_ids`, recorre la ruta canónica y sobrescribe FKs cuando difieren (lo que necesitan `broken` y `stale_name`).
- Ambos modos están probados en producción por el geocoder normal.
- El piggyback (paso 4 de la RPC, que reusa un job `running` existente) **no se toca**: si el job en curso es `fill`/`reconcile` ya funciona; si es `repair`, mantiene su comportamiento actual (limitación documentada, fuera de scope).

### Fuera de scope (explícito)

- `backfill-admin-fks` (no se quita la rama `repair`, no se cambia el orden de `.in()`).
- `health_repair_outcomes` y cualquier escritura server-side de outcomes.
- `point-health-rings.ts`, `enrichmentFailureStore`, realtime, rings nuevos.
- `useHealthFilterFit`, auto-fit de mapa.
- UI del diálogo, store, lanes.

### Archivos tocados

- 1 migración SQL: `CREATE OR REPLACE FUNCTION public.enqueue_health_repair(...)` con el `CASE _action WHEN 'partial' THEN 'fill' ELSE 'reconcile' END` en el INSERT a `geocoding_jobs`. El resto del cuerpo idéntico.

### Verificación obligatoria antes de avanzar

Caso real `Rellenar huecos`:

1. Activar chip `Rellenar huecos` con N puntos visibles (ej. 14).
2. Confirmar reparación → toast `Reparados M / N` con M > 0 (en el ejemplo 10/14).
3. `BottomProgressBar` muestra el carril Geo, progresa de 0/M a M/M, desaparece.
4. Tras el tick: el trigger `zzz_locations_set_geo_health` recomputa → al menos algunos POIs procesados salen del bucket `partial`.
5. Reactivar chip `Rellenar huecos` → la cuenta ha bajado en M (o queda lo que no se pudo reparar — esos siguen en el bucket pero ya **fueron tocados**, lo audita PR-B1 después).

Caso real `Reparar cadena` (mode=`reconcile`):

1. Activar chip con M puntos `broken`/`stale_name`.
2. Confirmar → job procesa, recompute baja la cuenta del chip.

### Criterio de cierre

- Job procesa IDs reales (>0 procesados cuando hay elegibles).
- `geo_health` cambia para al menos los que se reparan correctamente.
- Si la verificación falla (sigue en 0 procesados, o `geo_health` no cambia): **no se mergea**, se reabre diagnóstico.

### Cola posterior (no ejecutar todavía)

```text
PR-A   → useHealthFilterFit (hook desde FilterBar, no store)
PR-B1  → tabla health_repair_outcomes + escritura server-side
PR-B2  → cliente lee latest outcome con anti-stale + verde matizado
```

Cada uno se planificará con detalle al cerrar el anterior.
