## B3 dry-run — resultados read-only

Ya ejecuté las consultas. Para escribir `docs/audits/b3-zone-region-dry-run.md` necesito **build mode** (plan mode no permite crear archivos).

### Conteos

| Bucket | Count |
|---|---|
| **D6a** `lower(btrim(zone)) = lower(btrim(region))` | **1 607** |
| **D6b strict** `zone_id = region_id` | **0** |
| **D6a ∩ D6b** | 0 |
| **Unión a corregir** | **1 607** |

**D6b "equivalente":** una consulta extendida detectó 5 018 filas donde `region_id` es **ancestro** de `zone_id`. Esto **NO es redundancia** — es el árbol canónico `region → provincia (zone)` definido en `mem://geography/canonical-tree-spec`. Descartado del scope. **D6b real = 0.**

### Sub-breakdown D6a

- 64 placeholders `zone == region == "(sin región)"`
- 1 543 duplicados reales (Madrid, Roma, París, ciudades-región alemanas, etc.)

### Top 5 por país/región

| País | Región | n |
|---|---|---|
| Francia | Isla de Francia | 158 |
| Italia | Lacio | 130 |
| España | Comunidad de Madrid | 110 |
| Italia | Toscana | 86 |
| Italia | Lombardia | 84 |

Patrón: capitales metropolitanas + importer legacy que copió `region` a `zone` por defecto.

### Ejemplos (3 de 10)

- `6fd47859…` Friburgo de Brisgovia — Alemania / Baden-Wurtemberg / **Baden-Wurtemberg** (zone_id ≠ region_id, mismo nombre)
- `b1def0af…` Duisburgo — Alemania / Nordrhein-Westfalen / **Nordrhein-Westfalen**
- `d0eb9fb8…` Bahía de Botany — Australia / Nueva Gales del Sur / **Nueva Gales del Sur**

### UPDATE propuesto (no ejecutar)

```sql
-- B3a (1 607 filas)
UPDATE locations
SET zone = NULL, updated_at = now()
WHERE deleted_at IS NULL
  AND zone IS NOT NULL AND region IS NOT NULL
  AND lower(btrim(zone)) = lower(btrim(region));

-- B3b (0 filas hoy, idempotente)
UPDATE locations
SET zone_id = NULL, updated_at = now()
WHERE deleted_at IS NULL AND zone_id = region_id;
```

**No tocados:** `region`, `region_id`, coords, `enriched_data`, `raw_geocode`, `enrichment_status`, `geo_health`, `country_id`, `admin3_id`, `locality_id`, etc.

### Riesgos

- Falsos positivos en ciudades-región (Berlín-land/ciudad). Mitigación: `zone_id` y `region_id` permanecen; el resolver (`v_locations_resolved`) re-deriva label desde FK.
- Drift snapshot→execute (precedente B2 −1). Mitigación en B3-execute: hash + abort si delta >0.5 %.
- 64 placeholders `"(sin región)"` quedan en `region` (fuera de scope B3).

### Rollback

Predicado idempotente + snapshot `(id, zone_old)` capturado en B3-execute. Sin snapshot, solo PITR.

### Recomendación

Proceder con B3-execute en una sola pasada (D6a 1 607). B3b safe no-op (0 filas).

---

## Siguiente paso

Cambia a **build mode** y escribiré `docs/audits/b3-zone-region-dry-run.md` con el contenido completo (conteos, 10 ejemplos, SQL reproducible, UPDATE comentado, riesgos, rollback, recomendación). Cero UPDATE/DELETE/migración/código/bump.