# B2b — Ejecución: `geo_health` stale → `hardError`

**Fecha ejecución:** 2026-05-20 ~12:59 UTC
**Operador:** Lovable agent (sesión master)
**Plan origen:** `docs/audits/b2-geo-health-stale-dry-run.md`
**Aprobación:** Usuario, mensaje "Re-apruebo B2b con target 388".
**Version impact:** none. Sin bump. Sin código. Sin migraciones.

---

## §1. Snapshot pre-flight

| Métrica | Valor |
|---|---|
| Count del scope | **388** |
| Snapshot hash (md5 de IDs ordenados ASC) | `4457ee6da1b3d7e1f7a44fba04347183` |
| Cumplen 6 invariantes (R2 + coords válidas) | **388 / 388 (100%)** |

### Predicado snapshot
```sql
geo_health = 'ok'
AND enrichment_status = 'enriched'
AND raw_geocode IS NULL
AND latitude IS NOT NULL
AND longitude IS NOT NULL
AND NOT (latitude = 0 AND longitude = 0)
AND ABS(latitude) <= 90
AND ABS(longitude) <= 180
```

### Drift vs dry-run (-1)
El dry-run registró 389 a las 12:47 UTC; el pre-flight registró 388 a las 12:58 UTC. Investigación read-only (ver chat) descartó exit vía `raw_geocode` populated, `geo_health` change, `enrichment_status` change y soft-delete dentro de la ventana. Causa probable: hard-delete sin traza o ruido de conteo durante el dry-run. Aceptado como drift de 0.26%.

### Muestras representativas (20)
Tomadas vía SELECT sobre el predicado snapshot, todas italianas/españolas, enriched, sin raw_geocode. Ver `b2-geo-health-stale-dry-run.md` §3 para el listado completo de 10 ejemplos publicado en el dry-run; subset suficiente para auditoría.

---

## §2. SQL ejecutado

```sql
UPDATE public.locations
SET geo_health = 'hardError', updated_at = now()
WHERE geo_health = 'ok'
  AND enrichment_status = 'enriched'
  AND raw_geocode IS NULL
  AND latitude IS NOT NULL
  AND longitude IS NOT NULL
  AND NOT (latitude = 0 AND longitude = 0)
  AND ABS(latitude) <= 90
  AND ABS(longitude) <= 180;
```

Sin parámetros. Sin transacción explícita (auto-commit). Tool: `supabase--insert` (data change).

### Columnas tocadas
- `geo_health`: `'ok'` → `'hardError'`
- `updated_at`: → `now()`

### Columnas NO tocadas (confirmado por construcción del UPDATE)
- `latitude`, `longitude`, `altitude`
- `enriched_data`, `raw_geocode`
- `enrichment_status`
- `country`, `region`, `zone`, `country_code`, `admin1_iso`
- `country_id`, `region_id`, `zone_id`, `admin3_id`, `locality_id`, `sublocality_id`
- `geo_source`, `geo_confidence`, `geo_resolved_at`
- `name`, `description`, `place_type`, `type_id`
- `owner_user_id`, `document_id`, `visibility`, `is_approved`

---

## §3. Verificación post-flight

| Métrica | Esperado | Real | Status |
|---|---|---|---|
| POIs con `geo_health='hardError'` que cumplen scope original | 388 | **388** | OK |
| POIs con `geo_health='ok'` que aún cumplen scope original | 0 | **0** | OK |

Query verificación:
```sql
SELECT
  COUNT(*) FILTER (WHERE geo_health='hardError' AND enrichment_status='enriched' AND raw_geocode IS NULL
    AND latitude IS NOT NULL AND longitude IS NOT NULL
    AND NOT (latitude=0 AND longitude=0)
    AND ABS(latitude)<=90 AND ABS(longitude)<=180) AS now_hard_error,
  COUNT(*) FILTER (WHERE geo_health='ok' AND enrichment_status='enriched' AND raw_geocode IS NULL
    AND latitude IS NOT NULL AND longitude IS NOT NULL
    AND NOT (latitude=0 AND longitude=0)
    AND ABS(latitude)<=90 AND ABS(longitude)<=180) AS remaining_scope_ok
FROM public.locations;
```
Resultado: `now_hard_error=388`, `remaining_scope_ok=0`.

Ambos KPIs cuadran → UPDATE 100% efectivo, idempotente, sin scope-creep.

---

## §4. Rollback

Predicado seguro (mismo perfil, dirección inversa). Solo correr si se detecta regresión inaceptable y dentro de una ventana corta antes de que B5 / geocoding-job toque la población.

```sql
-- ROLLBACK B2b (no ejecutar salvo emergencia)
UPDATE public.locations
SET geo_health = 'ok', updated_at = now()
WHERE geo_health = 'hardError'
  AND enrichment_status = 'enriched'
  AND raw_geocode IS NULL
  AND latitude IS NOT NULL
  AND longitude IS NOT NULL
  AND NOT (latitude = 0 AND longitude = 0)
  AND ABS(latitude) <= 90
  AND ABS(longitude) <= 180;
```

### Limitación del rollback
El predicado por sí solo no distingue entre los 388 marcados por B2b y POIs que pudieran haber sido marcados `hardError` por otra vía con las mismas características (improbable: estos POIs nacieron `'ok'` precisamente porque B2 nunca los había tocado). Si se requiere rollback dirigido por ID, reconstruir el snapshot desde un PITR de pre-ejecución.

---

## §5. Constraints cumplidos

- [x] Sólo `geo_health` + `updated_at` modificados
- [x] Coords intactas
- [x] `enriched_data` intacto
- [x] `raw_geocode` intacto
- [x] `enrichment_status` intacto
- [x] `country/region/zone` intactos
- [x] Cero migraciones
- [x] Cero re-enrich
- [x] Cero código tocado
- [x] Cero bump (version impact: none)
- [x] Único archivo creado: este

---

## §6. Próximos pasos previstos

1. **Observabilidad**: ~388 anillos rojos aparecerán progresivamente en el mapa global y sidebars en los próximos minutos según re-render. Esperado.
2. **B5 — `geocoding-job` re-resolve**: encolar batch sobre los 388 IDs para repoblar `raw_geocode`/`geo_source`/`geo_confidence` y devolverlos a `geo_health='ok'`. Debe correr con `page_size ≤ 25` y cooldown para no saturar Nominatim.
3. **D6 — `zone==region` cleanup**: B3 dependiente, pendiente.
