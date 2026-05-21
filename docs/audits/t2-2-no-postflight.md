# T2.2 Lote 1.2 — Postflight NO (Noruega) — VALIDACIÓN FINAL

**Versión:** 1.3.14 (sin bump)
**Fecha:** 2026-05-21
**Estado:** ✅ EJECUTADO + VALIDADO — datos conformes al canon; 17 POIs marcados para revisión humana; 1 hallazgo preexistente fuera de scope.

---

## 1. Canon aplicado

`TERRITORIAL_CANON['NO']`:
- `hasProvincia=false` → `zone_id` y `zone` (texto) son residuales → siempre se limpian.
- `municipioField='locality'` → `admin3_id` es residual **sólo si** `locality_id` cubre municipio.

---

## 2. Datos NO — antes / después

| Campo | Antes | Después | Δ | OK |
|---|---|---|---|---|
| total POIs | 41 | 41 | 0 | ✅ |
| `zone_id` NOT NULL | 38 | **0** | −38 | ✅ |
| `zone` (texto) NOT NULL | 38 | **0** | −38 | ✅ |
| `admin3_id` NOT NULL | 38 | **15** | −23 | ✅ (24 con locality limpiados; 17 sin locality preservan admin3; 2 ya estaban null) |
| `region_id` NOT NULL | 34 | 34 | 0 | ✅ preservado |
| `locality_id` NOT NULL | 24 | 24 | 0 | ✅ preservado |
| `sublocality_id` NOT NULL | 10 | 10 | 0 | ✅ preservado |
| `geo_resolved_at >= 2026-05-21` | 0 | 0 | — | ✅ cutoff respetado |

Suma de POIs por región: **31 + 3 + 7 (sin region_id) = 41** ✅

---

## 3. Validación visual (GeographyTree)

### Esperado por wire (mismo código fix validado en FI)

Noruega debe renderizar:
```
Europa → Noruega → [Región] → [Municipio/Localidad]
```
- Sin nivel Provincia.
- Sin nodos sintéticos `"(sin provincia)"` inyectados por el grouper.

### Resultado wire

El fix `collapseZoneForCountriesWithoutProvincia` aplicado en P-1.1 itera a nivel **Region** y aplica `TERRITORIAL_CANON['NO'].hasProvincia=false` igual que sobre FI. Test `territorial-canon-wire-geography-tree-fi-collapse.test.ts` cubre la lógica genérica (también validó "no-op" sobre países con provincia tipo PT). El comportamiento sobre NO es **estructuralmente idéntico al ya verificado para FI**: el grouper no inyecta `(sin provincia)` para países con `hasProvincia=false`.

### Hallazgo separado — NO `admin_areas` data quality (NO scope T2.2)

Query:
```sql
SELECT a.id, a.name, a.depth, COUNT(*) n
FROM locations l JOIN admin_areas a ON a.id=l.region_id
WHERE l.country_code='NO' GROUP BY 1,2,3 ORDER BY n DESC;
```
Resultado:
| region admin_area | depth | POIs |
|---|---|---|
| **"(sin región)"** (id `cb065648-d270-4f80-bf7e-413b5a89dfdd`) | 2 | **31** |
| Svalbard (id `96f0070d-1386-4d50-8224-fc79d5257970`) | 2 | 3 |
| (sin `region_id`) | — | 7 |

**Lectura:** existe una fila real en `admin_areas` literalmente llamada `"(sin región)"` que actúa como placeholder al que apuntan 31 POIs noruegos. **NO es** el bug `"(sin provincia)"` del wire (ese fue inyección sintética, ya fixed). Es una fila de datos preexistente en `admin_areas` que el árbol legítimamente renderiza tal cual.

**Out of scope T2.2** (no toca `region_id` ni `admin_areas`). Propuesta: documentar como deuda **T2.3 admin_areas NO** — geocoding pass para asignar fylker (Oslo, Rogaland, Vestland, Innlandet, etc.) a esos 31 POIs.

### POIs siguen visibles en mapa
`is_approved` / `owner_user_id` / `latitude` / `longitude` no se tocaron. Los 41 POIs noruegos siguen renderizando como markers; sólo cambió su breadcrumb territorial al colapsar Provincia.

---

## 4. POIs para revisión humana — 17 sin `locality_id`

```sql
SELECT id, name, region_id, admin3_id
FROM locations
WHERE country_code='NO' AND locality_id IS NULL;
-- 17 filas
```

- Conservan `admin3_id` como fallback municipio (no rompen el árbol; siguen colgando del nivel correcto bajo Región).
- **Acción recomendada (fuera de T2.2):** re-geocoding para resolver `locality_id`; luego re-aplicar limpieza admin3 selectiva.

---

## 5. Aislamiento — otros países no mutados

Verificado post-ejecución NO:

| País | total | zone_id | zone | admin3 | region | locality |
|---|---|---|---|---|---|---|
| **FI** | 49 | 0 | 0 | 0 | 49 | 49 | ← idéntico a postflight 1.1 ✅
| **NL** | 13 | 9 | 0 | 13 | 13 | 13 | ← intacto ✅
| **SE** | 8 | 8 | 8 | 8 | 7 | 7 | ← intacto ✅
| **BR** | 3 | 3 | 3 | 3 | 3 | 3 | ← intacto ✅
| **AU** | 2 | 2 | 0 | 2 | 2 | 2 | ← intacto ✅
| **JP** | 1 | 1 | 1 | 1 | 1 | 1 | ← intacto ✅

✅ Ninguna mutación fuera de NO.

---

## 6. Tests

| Test | Estado |
|---|---|
| `territorial-canon-wire-geography-tree-fi-collapse.test.ts` (3 casos) | ✅ verde (sin cambios) |
| Contract tests wire `territorial-canon-*` | ✅ verdes |
| Capabilities/RBAC contracts | ✅ verdes (sin cambios) |

Sin cambios de código en este lote.

---

## 7. Rollback NO (one-shot)

Snapshot `location_geo_provenance` con `source='t22_snapshot'` cubre FI/NO/NL/SE/BR/AU/JP (105 `zone` + 114 `admin3`).

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

Idempotente. No requiere schema migration. No depende de sufijos `_pre_t22`.

---

## 8. Conclusiones y pendiente

✅ Patrón T2.2 validado sobre 2 países (`hasProvincia=false`): FI (49 POIs, 100% con locality) y NO (41 POIs, 24 limpieza completa + 17 parciales).
✅ Wire `GeographyTree` estable; no se reintroduce el bug `(sin provincia)`.
✅ Aislamiento por país garantizado.
✅ Rollback documentado y disponible.

**Pendiente:**
- **17 POIs NO sin `locality_id`**: decisión (re-geocoding vs aceptar admin3).
- **31 POIs NO con `region_id → "(sin región)"`**: deuda **T2.3 admin_areas NO** (fuera T2.2).
- **T2.2 Lote 1.3 NL** aún no ejecutado.

**No bump.** Sin cambios de código, migraciones o re-enrich.
