# T2.2 — Postflight FI (final)

**Versión:** 1.3.14 (sin bump)
**Fecha:** 2026-05-21
**Estado:** ✅ VALIDADO — listo para proceder con Lote 1.2 NO

---

## 1. Datos (FI)

Query: `SELECT country_code, COUNT(*), COUNT(zone_id), COUNT(zone), COUNT(admin3_id), COUNT(region_id), COUNT(locality_id), COUNT(sublocality_id) FROM locations WHERE country_code='FI'`

| Campo | Valor | Esperado | OK |
|---|---|---|---|
| total POIs | 49 | 49 | ✅ |
| zone_id NOT NULL | 0 | 0 | ✅ |
| zone (texto) NOT NULL | 0 | 0 | ✅ |
| admin3_id NOT NULL | 0 | 0 | ✅ |
| region_id NOT NULL | 49 | 49 | ✅ |
| locality_id NOT NULL | 49 | 49 | ✅ |
| sublocality_id NOT NULL | 32 | 32 (preservado) | ✅ |

**Canon aplicado:** `TERRITORIAL_CANON['FI']` → `hasProvincia=false`, `municipioField='locality'`. zone_id/zone/admin3_id correctamente vaciados; region_id y locality_id preservados.

### Aislamiento — otros países no mutados

Snapshot global cubre FI/NO/NL/SE/BR/AU/JP (219 filas en `location_geo_provenance` con `source='t22_snapshot'`: 114 `admin3` + 105 `zone`). Sólo FI fue mutado en Lote 1.1. NO/NL/SE/BR/AU/JP intactos.

---

## 2. GeographyTree (validación visual)

Tras fix del grouper (`collapseZoneForCountriesWithoutProvincia` iterando a nivel Region en `src/components/filters/GeographyTree.tsx`):

- ✅ `Finland` muestra **regiones reales** directamente como hijos.
- ✅ **No** aparecen nodos `(sin provincia)`.
- ✅ **No** existe nivel Provincia bajo Finland.
- ✅ Estructura final: `Continent → Finland → Region → Locality`.
- ✅ Counts de regiones suman **49**:

| Región | POIs |
|---|---|
| Lapland | 9 |
| Satakunta | 8 |
| Uusimaa | 7 |
| North Ostrobothnia | 4 |
| Finlandia Propia | 3 |
| Kanta-Häme | 2 |
| Kymenlaakso | 2 |
| Islas Åland | 2 |
| Central Ostrobothnia | 2 |
| Ostrobothnia | 2 |
| South Savo | 2 |
| Kainuu | 2 |
| South Karelia | 1 |
| North Savo | 1 |
| South Ostrobothnia | 1 |
| Central Finland | 1 |
| **Total** | **49** |

- ✅ POIs FI siguen visibles en el mapa global (sin pérdida de markers).

---

## 3. Tests

| Test | Estado |
|---|---|
| `src/test/territorial-canon-wire-geography-tree-fi-collapse.test.ts` (3 casos: Lapland→Kemijärvi, multi-region, no-op PT) | ✅ verde |
| Contract tests wire `territorial-canon-*` previos | ✅ verdes |
| `capabilities-sot-parity`, `has-permission-master-bypass`, `capabilities-hygiene-2-contract` | ✅ verdes (sin cambios) |

---

## 4. Rollback

### Snapshot disponible
- Tabla: `location_geo_provenance`
- Filtro: `source='t22_snapshot'`
- Cobertura: 219 filas (FI/NO/NL/SE/BR/AU/JP, `geo_resolved_at < 2026-05-21`)
- Campos preservados por fila: `location_id`, `field_type ∈ {zone, admin3}`, `area_id` (FK previa), `original_value` (texto previo de `zone`)

### Rollback FI (one-shot)

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
WHERE l.country_code='FI';
```

No depende de sufijos `_pre_t22`. No requiere schema migration. Idempotente (re-aplicable mientras exista provenance).

---

## 5. Conclusión

Patrón T2.2 validado end-to-end en Finlandia:
1. Snapshot Opción B (`location_geo_provenance` + `source='t22_snapshot'`) funciona sin tocar constraints ni crear tablas.
2. Remap canon (zone/admin3 → NULL para `hasProvincia=false`) produce datos correctos.
3. Bug visual GeographyTree corregido; árbol respeta `TERRITORIAL_CANON`.
4. Aislamiento por país garantizado; rollback documentado y testeado lógicamente.

**Siguiente paso autorizable:** T2.2 Lote 1.2 NO (41 POIs, mismo patrón).

**No tocado:** datos no-FI, código (salvo fix wire previo), `package.json`, migraciones, re-enrich.
