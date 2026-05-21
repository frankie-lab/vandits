# T2.2 Lote 1.2 — Postflight NO (Noruega)

**Versión:** 1.3.14 (sin bump)
**Fecha:** 2026-05-21
**Estado:** ✅ EJECUTADO — datos conformes al canon, con 17 POIs marcados para revisión humana

---

## 1. Canon aplicado

`TERRITORIAL_CANON['NO']`:
- `hasProvincia=false` → `zone_id` y `zone` (texto) son residuales → siempre se limpian
- `municipioField='locality'` → `admin3_id` es residual **sólo si** `locality_id` cubre municipio

---

## 2. Datos NO — antes / después

| Campo | Antes | Después | Δ | Esperado |
|---|---|---|---|---|
| total POIs | 41 | 41 | 0 | sin cambio |
| `zone_id` NOT NULL | 38 | **0** | −38 | 0 ✅ |
| `zone` (texto) NOT NULL | 38 | **0** | −38 | 0 ✅ |
| `admin3_id` NOT NULL | 38 | **15** | −23 | 17 (POIs sin locality) — ver nota |
| `region_id` NOT NULL | 34 | 34 | 0 | preservado ✅ |
| `locality_id` NOT NULL | 24 | 24 | 0 | preservado ✅ |
| `sublocality_id` NOT NULL | 10 | 10 | 0 | preservado ✅ |
| `geo_resolved_at >= 2026-05-21` | 0 | 0 | — | 0 (cutoff respetado) ✅ |

**Nota Δ admin3:** se limpiaron 23 (no 24 = locality_nn). El delta real `38 → 15` = −23 confirma que de los 24 POIs con `locality_id`, 23 tenían `admin3_id` poblado (uno ya lo tenía null). Los 15 restantes con `admin3_id` corresponden a los 17 sin `locality_id` menos 2 que ya tenían `admin3_id` nulo (`no_municipio` preflight). Coherente.

---

## 3. POIs para revisión humana — 17 sin `locality_id`

Estos POIs **conservan `admin3_id`** como fallback municipio. No se limpiaron porque hacerlo dejaría el POI sin nivel municipal y rompería la jerarquía.

```sql
SELECT id, name, region_id, admin3_id
FROM locations
WHERE country_code='NO' AND locality_id IS NULL;
-- 17 filas
```

**Acción recomendada (fuera de T2.2):** geocoding pass para resolver `locality_id` desde coordenadas; luego re-aplicar limpieza admin3 sobre estos 17.

---

## 4. Aislamiento — otros países no mutados

| País | total | zone_id | zone | admin3 | region | locality |
|---|---|---|---|---|---|---|
| **FI** | 49 | 0 | 0 | 0 | 49 | 49 | ← intacto vs postflight 1.1
| **NL** | 13 | 9 | 0 | 13 | 13 | 13 |
| **SE** | 8 | 8 | 8 | 8 | 7 | 7 |
| **BR** | 3 | 3 | 3 | 3 | 3 | 3 |
| **AU** | 2 | 2 | 0 | 2 | 2 | 2 |
| **JP** | 1 | 1 | 1 | 1 | 1 | 1 |

✅ NL/SE/BR/AU/JP **sin mutaciones** desde snapshot. FI estable.

---

## 5. GeographyTree (visual)

Por confirmar visualmente:
- Noruega → Región → Localidad (sin Provincia, sin "(sin provincia)")
- Wire fix `collapseZoneForCountriesWithoutProvincia` ya aplicado (P-1.1) → debe operar igual sobre NO.

### Observación independiente (NO scope T2.2)
- **31 POIs NO** con `region_id` no resuelven nombre vía `admin_areas` (join devuelve NULL). 7 POIs sin `region_id`. Sólo 3 (Svalbard) resuelven limpiamente.
- **Causa probable preexistente**: `region_id` apunta a `admin_areas` con `depth` distinto al esperado (fylker noruegos no canonizados), o area eliminada/sin name.
- **No introducido por T2.2.** Documentar como deuda separada (T2.3 admin_areas NO).

---

## 6. Tests

| Test | Estado |
|---|---|
| `territorial-canon-wire-geography-tree-fi-collapse.test.ts` | ✅ verde (sin cambios) |
| Wire `territorial-canon-*` general | ✅ verde |

Sin cambios de código en este lote.

---

## 7. Rollback NO (one-shot)

Snapshot `location_geo_provenance` con `source='t22_snapshot'` ya contiene los 105 `zone` + 114 `admin3` previos de FI/NO/NL/SE/BR/AU/JP.

```sql
UPDATE locations l SET
  zone_id   = (SELECT area_id        FROM location_geo_provenance p
               WHERE p.location_id=l.id AND p.source='t22_snapshot'
                 AND p.field_type='zone'   LIMIT 1),
  zone      = (SELECT original_value FROM location_geo_provenance p
               WHERE p.location_id=l.id AND p.source='t22_snapshot'
                 AND p.field_type='zone'   AND p.area_id IS NULL LIMIT 1),
  admin3_id = (SELECT area_id        FROM location_geo_provenance p
               WHERE p.location_id=l.id AND p.source='t22_snapshot'
                 AND p.field_type='admin3' LIMIT 1)
WHERE l.country_code='NO';
```

Idempotente. No requiere schema migration.

---

## 8. Pendiente

- Validación visual GeographyTree NO en preview.
- Decisión sobre los **17 POIs sin `locality_id`** (re-geocoding o aceptar admin3 como municipio).
- Decisión sobre los **31 POIs con `region_id` no resoluble** (deuda admin_areas NO, fuera de T2.2).
- T2.2 Lote 1.3 NL aún no ejecutado.

**No bump.** Sin cambios de código, migraciones o re-enrich.
