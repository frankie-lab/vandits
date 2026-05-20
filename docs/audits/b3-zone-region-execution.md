# B3 — `zone == region` cleanup (EXECUTED)

**Status:** ✅ Executed
**Date:** 2026-05-20
**Decision:** Opción A (B3 puro, sin tocar `enriched_data`)

## Snapshot pre-ejecución

- **Count:** 1607
- **Hash:** `49c5128de85b62fcc3cc15a23d0f5df3`
- **Predicado:** `deleted_at IS NULL AND zone IS NOT NULL AND region IS NOT NULL AND lower(btrim(zone)) = lower(btrim(region))`

## SQL ejecutado

```sql
WITH snap AS (
  SELECT id FROM locations
  WHERE deleted_at IS NULL AND zone IS NOT NULL AND region IS NOT NULL
    AND lower(btrim(zone)) = lower(btrim(region))
),
guard AS (
  SELECT count(*) AS n, md5(string_agg(id::text, ',' ORDER BY id)) AS hash FROM snap
),
abort AS (
  SELECT 1/CASE WHEN (SELECT n FROM guard)=1607
                 AND (SELECT hash FROM guard)='49c5128de85b62fcc3cc15a23d0f5df3'
            THEN 1 ELSE 0 END AS ok
)
UPDATE locations l
SET zone = NULL, updated_at = now()
FROM snap, abort
WHERE l.id = snap.id;
```

Guard CTE abortaría con `division_by_zero` si count o hash no coincidían exactamente con el snapshot.

## Campos modificados

- `zone` → `NULL`
- `updated_at` → `now()`

## Campos NO tocados

`region`, `region_id`, `zone_id`, `admin3_id`, `locality_id`, `country_id`, `country`, `continent`, `latitude`, `longitude`, `altitude`, `enriched_data`, `raw_geocode`, `enrichment_status`, `geo_health`, `geo_source`, `geo_confidence`.

## Post-flight

- **Remaining D6a:** 0 ✅
- **D6b strict (`zone_id = region_id`):** 0 (sin cambios, no se tocó `zone_id`)

## Impacto visual aceptado (Opción A)

- ~199 POIs ganan label correcto de provincia via fallback `enriched_data.datos_geograficos.admin_nivel_2`.
- ~1340 POIs pasan a `(sin provincia)` en el árbol Buscar y Filtrar (helper `getLocationHierarchy` → placeholder).
- ~68 POIs residuales siguen mostrando duplicado porque `enriched_data.admin_nivel_2` también duplica `admin_nivel_1` → scope de B3.5.

## Rollback

Predicado idempotente seguro (no requiere lista de IDs):

```sql
-- Rollback: imposible reconstruir el valor textual original sin snapshot externo.
-- B3 nulificó zone donde duplicaba region; el valor previo era exactamente region.
-- Si fuera necesario revertir UI sin re-enrich:
UPDATE locations
SET zone = region, updated_at = now()
WHERE deleted_at IS NULL
  AND zone IS NULL
  AND region IS NOT NULL
  AND updated_at >= '2026-05-20'::date  -- ventana de seguridad
  AND id IN (
    -- requeriría auditoría externa para acotar a los 1607 IDs originales
  );
```

PITR / backup recomendado si se necesita restauración exacta.

## B3.5 — DRY-RUN (NO EJECUTADO)

**Scope:** `enriched_data.datos_geograficos.admin_nivel_2` cuando duplica `admin_nivel_1`.

### Snapshot

- **Count:** 56
- **Hash:** `044efd50f85bcd4c3e5e9bf948a15e12`
- **Predicado:**

```sql
SELECT id FROM locations
WHERE deleted_at IS NULL
  AND enriched_data->'datos_geograficos'->>'admin_nivel_1' IS NOT NULL
  AND enriched_data->'datos_geograficos'->>'admin_nivel_2' IS NOT NULL
  AND lower(btrim(enriched_data->'datos_geograficos'->>'admin_nivel_2'))
    = lower(btrim(enriched_data->'datos_geograficos'->>'admin_nivel_1'));
```

Nota: dry-run anterior estimaba ~68. Real = 56 (algunos ya cubiertos por B3 al limpiar `zone`, otros se filtran fuera por placeholder `(sin región)` en ambos lados — ver ejemplo Eslovenia/Cuevas de Skocjan).

### Breakdown (top 10 ejemplos)

| País | admin_nivel_1 | admin_nivel_2 | Ejemplo |
|---|---|---|---|
| Eslovenia | (sin región) | (sin región) | Cuevas de Skocjan |
| España | Cantabria | Cantabria | Bárcena Mayor, San Vicente de la Barquera, Mogrovejo… |
| España | La Rioja | La Rioja | Sajazarra |
| España | Illes Balears | Illes Balears | Cueva de Can Marçà |

Casos `(sin región) == (sin región)`: salir del scope o tratar como caso especial (ambos nulificar). A decidir en aprobación B3.5.

### SQL UPDATE propuesto (COMENTADO, NO EJECUTAR)

```sql
-- B3.5: nulificar admin_nivel_2 cuando duplica admin_nivel_1
-- UPDATE locations
-- SET enriched_data = jsonb_set(
--       enriched_data,
--       '{datos_geograficos,admin_nivel_2}',
--       'null'::jsonb
--     ),
--     updated_at = now()
-- WHERE deleted_at IS NULL
--   AND enriched_data->'datos_geograficos'->>'admin_nivel_1' IS NOT NULL
--   AND enriched_data->'datos_geograficos'->>'admin_nivel_2' IS NOT NULL
--   AND lower(btrim(enriched_data->'datos_geograficos'->>'admin_nivel_2'))
--     = lower(btrim(enriched_data->'datos_geograficos'->>'admin_nivel_1'));
```

### Riesgos B3.5

- Tocar `enriched_data` — fuera de la zona segura habitual de geo-cleanup. Requiere aprobación explícita.
- Caso `(sin región) == (sin región)`: discutir si se nulifica o se deja.
- Sin rollback automático: `enriched_data` no tiene snapshot histórico (a diferencia de campos planos).

### Recomendación

Aprobación separada explícita antes de ejecutar B3.5. Considerar capturar snapshot `(id, admin_nivel_2_old)` en tabla `b35_enriched_snapshot` para rollback granular.

---

**Version impact:** none. **No migrations, no code, no re-enrich, no bump.**
