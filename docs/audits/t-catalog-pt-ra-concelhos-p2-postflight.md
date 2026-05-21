# T-CATALOG-PT-RA-CONCELHOS — P2 postflight (Açores / Madeira)

**Estado:** ejecutado 2026-05-21. Excepción insular PT aplicada en modo conservador (universo ancestría d=5).

Referencias: `docs/audits/t-catalog-pt-ra-concelhos-dry-run.md`, `docs/contracts/territorial-equivalence-canon.md` §0/§1#6, `mem://geography/canonical-tree-spec`.

---

## 1. Resultado

| métrica | esperado | aplicado |
|---|---:|---:|
| Concelhos isla reparentados a d=3 bajo PT-20/PT-30 | 14 | 14 |
| Nodo Vila Franca Do Campo (`3b505034…`) normalizado a d=3 bajo PT-20 | 1 | 1 |
| Concelhos isla d=3 bajo CCDR canónicas (totales `is_placeholder=false`) | 15 | **15** |
| Duplicados marcados `is_placeholder=true` | 2 | **2** (Angra dup `20a4b502…`, Vila Franca d=5 `ff077b8a…`) |
| POIs re-FK a PT-20 con `zone_id` NULL | 29 | **29** |
| POIs re-FK a PT-30 con `zone_id` NULL | 11 | **11** |
| POIs totales tocados | 40 | **40** |
| Filas provenance `source='t23_p2_snapshot'` | 40 | **40** |
| Filas en `_catalog_pt_ra_concelhos_snapshot_2026_05_21` | 17 | **17** |
| Filas en `_locations_ra_concelhos_snapshot_2026_05_21` | 40 | **40** |

Salvaguarda activa: `RAISE EXCEPTION 'P2 abort'` si el snapshot de locations ≠ 40 (no se disparó).

---

## 2. Mapping concelho → CCDR aplicado

### PT-20 Açores (`ee871f7d…`)
Reparentados a `depth=3`, `path=[Europa, PT, PT-20, self]`:

| concelho | id | n_POIs |
|---|---|---:|
| Angra do Heroísmo | `9ff3cfca-d9b0-4513-a651-3dc2988802f7` | 3 |
| Lajes do Pico | `3c3dd862-7211-4663-879f-f4533cea997d` | 1 |
| Madalena | `c18ffee8-8dc3-4ee8-9565-3911816fbeb3` | 14 |
| Ponta Delgada | `3aaa13b7-cf51-4d6d-a3fb-2022f3c8f557` | 5 |
| Povoação | `e28d5fef-2f8e-49f0-8854-0447104eb896` | 2 |
| Ribeira Grande | `572c2b43-cabb-41d5-b3a2-06e152303d1d` | 1 |
| Velas | `54cea6f2-d96b-40cb-9dd5-a7d44168be0d` | 1 |
| Vila do Porto | `2ccad713-4ef4-4288-8f53-f23a8203abcb` | 1 (vía `admin3_id`) |
| Vila Franca Do Campo (normalizado) | `3b505034-3901-438a-9f53-37c6bc063de8` | 1 (redirigido desde `ff077b8a…`) |

### PT-30 Madeira (`a0553c22…`)
Reparentados a `depth=3`, `path=[Europa, PT, PT-30, self]`:

| concelho | id | n_POIs |
|---|---|---:|
| Calheta | `596b8e70-4ea2-44bc-a678-dd1ea0119b02` | 2 |
| Câmara de Lobos | `0e6bab65-734b-43a2-a6d0-3ce16ff129bb` | 1 |
| Funchal | `6438b2c0-2505-4a07-add0-459cd16d2a9a` | 4 |
| Machico | `50db5861-b99d-4297-90ef-47cf949933f0` | 1 |
| Porto Moniz | `49df8bf0-2099-42f4-bcbb-9e013226b584` | 2 |
| Santana | `849c8814-8d84-4b98-80ac-97db2a31daf4` | 1 |

Total POIs = 29 (PT-20) + 11 (PT-30) = **40**.

---

## 3. Resolución de duplicados de catálogo

El plan original requería reparentar 16 nodos. Durante la ejecución surgieron dos colisiones contra la unicidad `(parent_id, lower(name), type_id)` en `admin_areas`:

| caso | conflicto | resolución (R7) |
|---|---|---|
| Angra do Heroísmo | `9ff3cfca` (3 POIs) y `20a4b502` (0 POIs) ambos iban a PT-20 con mismo `type_id` | Reparentado `9ff3cfca` (más poblado). `20a4b502` marcado `is_placeholder=true`, **no reparentado** (queda colgando de su parent original) |
| Vila Franca do Campo | `ff077b8a` (d=5, 1 POI) iba a PT-20, pero existía `3b505034` ya bajo PT-20 con mismo nombre y tipo | Conservado el nodo canónico existente `3b505034`, normalizado a `depth=3` + path correcto. `ff077b8a` marcado `is_placeholder=true`. El POI único redirigido a `3b505034` |

Resultado funcional idéntico al dry-run: 1 POI Vila Franca queda bajo el id canónico activo.

---

## 4. Forma final de los 40 POIs

Cada POI quedó con:

```
country_id      = PT (sin cambios)
region_id       = PT-20 o PT-30 (CCDR canónica)
region          = NULL (denormalización limpiada, se resuelve por FK)
zone_id         = NULL  (excepción insular)
zone            = NULL  (excepción insular)
admin3_id       = concelho canónico (3aaa13b7…, 6438b2c0…, etc.)
locality_id     = NULL en 39 casos; preservado (Santa Bárbara) en 1 caso (Vila do Porto)
sublocality_id  = preservado
name, lat/lng, raw_geocode, enriched_data, tags, colecciones, media = INTACTOS
```

Provenance: 40 filas en `location_geo_provenance` con `field_type='region'`, `source='t23_p2_snapshot'`, `area_id` = CCDR nueva, `original_value` = `region_id` previo (texto).

---

## 5. Validación GeographyTree (post-P2)

- **PT-20 Açores** ahora muestra 9 concelhos canónicos hijos directos (8 reparentados + Vila Franca Do Campo ya normalizado) más São Miguel y placeholder Açores como ruido pendiente.
- **PT-30 Madeira** muestra 6 concelhos canónicos hijos directos.
- **`(sin región)` d=2** queda drenado en ~40 POIs respecto al pre-P2; sigue capturando los 10 bbox-only diferidos y los POIs continentales en deuda.
- **Sin distrito inventado**: ningún POI insular tiene `zone_id` no-nulo.
- **Sin "(sin región)" para los 40**: todos apuntan a CCDR canónica.

---

## 6. Lo que NO se tocó (regla dura)

- 10 POIs "solo bbox" con `region_id` NULL → diferidos a `T2.3-L1-PT-coords`.
- 14 POIs "solo ancestría sin bbox" → diferidos a auditoría de coords.
- Continente PT entero (5 CCDR continentales + sus hijos).
- Espejo muerto P1 (34 nodos `is_placeholder=true`) → intactos.
- `enriched_data`, tags, colecciones, media, `name`, lat/lng, `raw_geocode`, `country_id`, `country_code`, `enrichment_status`, `geo_health`, código, edge functions, app version, `package.json` — todo invariante.

---

## 7. Rollback

```sql
-- 1. Restaurar 40 ubicaciones
UPDATE public.locations l
SET region_id=s.region_id, region=s.region, zone_id=s.zone_id, zone=s.zone,
    admin3_id=s.admin3_id, locality_id=s.locality_id,
    sublocality_id=s.sublocality_id, updated_at=s.updated_at
FROM public._locations_ra_concelhos_snapshot_2026_05_21 s WHERE l.id=s.id;

-- 2. Restaurar 17 nodos de admin_areas
UPDATE public.admin_areas a
SET parent_id=s.parent_id, depth=s.depth, path=s.path,
    is_placeholder=s.is_placeholder, updated_at=s.updated_at
FROM public._catalog_pt_ra_concelhos_snapshot_2026_05_21 s WHERE a.id=s.id;

-- 3. Limpiar procedencia
DELETE FROM public.location_geo_provenance
WHERE source='t23_p2_snapshot'
  AND location_id IN (SELECT id FROM public._locations_ra_concelhos_snapshot_2026_05_21);
```

Snapshots persistidos (RLS: lectura solo `master`):
- `public._catalog_pt_ra_concelhos_snapshot_2026_05_21` (17 filas)
- `public._locations_ra_concelhos_snapshot_2026_05_21` (40 filas)

---

## 8. Impacto en POI-N / health

- 27 POIs que apuntaban a `(sin región)` d=2 ph como `region_id` ahora apuntan a CCDR canónica → `geo_health` esperable migra `partial → ok` en próximo recompute (sin re-enrich, sin trigger forzado en P2).
- `isPointEnriched`, `shareability`, `getPointVisualState` invariantes.
- Health rings dependientes de "región placeholder" se vacían en el próximo recompute natural.

---

## 9. Pendientes (NO ejecutados en P2)

| ID | Alcance | Estado |
|---|---|---|
| `T2.3-L1-PT-coords` | 10 POIs insulares NULL bbox + 65 POIs continente placeholder | bloqueado: tabla alias L1-PT + Nominatim |
| `T-CATALOG-PT-DISTRICTS-CLEANUP` (P3) | DELETE de los 34 nodos P1 + 2 nuevos duplicados isla `is_placeholder` | ventana de validación 30 días |
| `T-CATALOG-PT-FREGUESIAS` | Recálculo de `path` en freguesias d=6 bajo concelhos reparentados (R1) | aceptado como deuda hasta auditoría |
| `T-CATALOG-PT-FOREIGN-LEAK` (P4) | Fuga FR en subárbol PT | sin tocar |
| `T2.3-IE` | Irlanda Lote 1 | bloqueado como prerequisito separado |
| `T-CATALOG-CANON-EXCEPCION-INSULAR` | Actualizar `territorial-equivalence-canon.md` §3 + espejo Deno | propuesto, no ejecutado en P2 |

**Sin bump de app version.**
