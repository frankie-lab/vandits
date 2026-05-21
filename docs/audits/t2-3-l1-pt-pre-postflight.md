# T2.3-L1-PT-pre — Postflight (parent-chain puro, sin Nominatim)

**Estado:** ejecutado SELECT-only. **0 UPDATE realizados.** No Nominatim. No código. No migraciones. No bump.

**Fecha:** 2026-05-21
**Alcance autorizado:** los 29 POIs PT con `country_code='PT'` + región vacía/placeholder + algún `admin3_id`/`zone_id`/`locality_id` poblado.
**Regla dura aplicada:** destino válido `region_id` ∈ exclusivamente los 7 UUIDs CCDR de §1.A (`docs/audits/t2-3-l1-pt-catalog-dedup-dry-run.md`).

---

## Resultado

| bucket | conteo |
|---|---|
| **applied** | **0** |
| **preserved (catalog_gap)** | **29** |
| **rejected_destination** | 0 |
| total scope | 29 |

### Query de validación (idempotente, sin escritura)

```sql
WITH src AS (
  SELECT l.id, l.name,
         COALESCE(l.locality_id, l.admin3_id, l.zone_id) AS anchor_id
  FROM locations l
  WHERE l.country_code = 'PT'
    AND (l.region_id IS NULL
         OR l.region_id IN (SELECT id FROM admin_areas WHERE is_placeholder=true))
    AND (l.admin3_id IS NOT NULL OR l.zone_id IS NOT NULL OR l.locality_id IS NOT NULL)
),
anchors AS (
  SELECT s.id, s.anchor_id, a.path
  FROM src s JOIN admin_areas a ON a.id = s.anchor_id
),
resolved AS (
  SELECT r.id,
         (SELECT ar.id FROM admin_areas ar
           WHERE ar.id = ANY(r.path)
             AND ar.depth = 2
             AND ar.iso_code IN ('PT-01','PT-02','PT-03','PT-04','PT-05','PT-20','PT-30')
           LIMIT 1) AS dest_region_id
  FROM anchors r
)
SELECT
  count(*) FILTER (WHERE dest_region_id IS NOT NULL) AS applicable,
  count(*) FILTER (WHERE dest_region_id IS NULL)     AS preserved,
  count(*)                                           AS total
FROM resolved;
-- applicable=0  preserved=29  total=29
```

---

## Por qué 0 applied

La auditoría del catálogo (`t2-3-l1-pt-catalog-dedup-dry-run.md` §1) ya advertía de la deuda estructural T-CATALOG-PT-DISTRICTS. La inspección de los `path[]` de los 29 POIs confirma que **ningún ancestro a depth=2 en su parent-chain pertenece a §1.A**. En todos los casos el camino pasa por placeholders en depth=2 y/o depth=3:

| zona del POI | path típico (resumido) |
|---|---|
| Madeira (Funchal, Calheta, Santana, Câmara de Lobos, Machico, Porto Moniz, etc.) | `…→PT→(sin región d=2 cbeeecd6)→(sin región d=3 b50666f4)→(sin comarca d=4)→<concelho>` |
| Açores (Angra do Heroísmo, Ponta Delgada, Calheta SJ, Velas, Lajes do Pico, Vila Franca do Campo, Ribeira Grande, Povoação, Vila do Porto, Santa Bárbara) | `…→PT→(sin región d=2)→(sin región d=3)→(sin comarca d=4)→<concelho>` |
| Continente (Parque Municipal de Braga, A Pérola do Bolhão = Porto/Oporto) | `…→PT→(sin región d=2)→<distrito sin iso a d=3>→(sin comarca d=4)→<concelho>` |

Conclusión catalográfica: la cadena PT no tiene CCDR enganchada como ancestro real de los concelhos sembrados; los CCDR §1.A existen como hojas independientes a depth=2 pero **no son padres de nada**. Por tanto, el resolver puro de SQL "buscar §1.A en `path[]`" devuelve siempre `NULL`.

---

## Verificación de los compromisos

- [x] Solo se han ejecutado SELECT. **Ningún UPDATE/INSERT/DELETE.**
- [x] **Ninguna escritura en `location_geo_provenance`** (no había nada que snapshot-ear porque no hay cambios).
- [x] **No se ha asignado ningún `region_id` fuera de §1.A.** (No se ha asignado ningún `region_id` en absoluto.)
- [x] Filtro `country_code='PT'` aplicado. No se ha tocado IE ni ningún otro país.
- [x] No se ha llamado a Nominatim.
- [x] No se han tocado: `country_id`, `zone_id`, `admin3_id`, `locality_id`, `sublocality_id`, `name`, `lat/lng`, `raw_geocode`, `enriched_data`, `geo_health`, `enrichment_status`, tags, colecciones, media.
- [x] No se ha tocado el catálogo `admin_areas`.
- [x] No se ha modificado código, migraciones, package.json ni `app-version`.

---

## Rollback

**No aplica.** Ningún cambio realizado, ninguna acción de reversión necesaria. El snapshot `t23_snapshot` existente (de Lote 0) permanece intacto y sigue siendo el rollback válido para esos 11 POIs.

---

## Implicaciones

1. **L1-PT-pre queda cerrado con 0 cambios.** La hipótesis del dry-run ("29 POIs resolubles por parent-chain") se revisa a la baja: parent-chain puro requiere que el ancestro depth=2 sea un CCDR §1.A, y eso no se cumple en ningún caso por la deuda T-CATALOG-PT-DISTRICTS.
2. **Para los 29 POIs hay dos rutas posibles**, ambas FUERA del alcance de L1-PT-pre:
   - **Ruta A — catálogo:** crear/reasignar las relaciones `parent_id` de los 18 distritos + 9 concelhos depth=2 para que cuelguen del CCDR correcto. Es una migración estructural del catálogo, no de datos de POIs. Sigue siendo dato (no schema) pero toca `admin_areas` que el alcance T2.3 prohíbe.
   - **Ruta B — Nominatim:** unificar el tratamiento de los 29 + los 65 coords-only en el sub-lote L1-PT (Nominatim reverse + tabla de alias §2). Esto sigue siendo el plan canónico ya documentado.
3. **Recomendación:** absorber los 29 en el lote L1-PT-coords (Nominatim) cuando se ejecute, dado que el resolver puro no aporta valor sobre ellos. El motivo se documenta aquí y en el dry-run.

---

## Impacto en GeographyTree / POI-N / geo_health

- **GeographyTree:** ninguno (no se ha movido ningún POI de un nodo a otro).
- **POI-N / geo_health:** ninguno (no se ha modificado ningún campo de salud geo).
- **`(sin región)` PT:** sigue mostrando los mismos 94 POIs (29 + 65) que antes de esta ejecución.

---

## Cierre

Sub-lote **L1-PT-pre cerrado con 0 cambios**. Los 29 POIs quedan reasignados a la cola del sub-lote **L1-PT-coords** (Nominatim) para tratamiento conjunto con los 65 coords-only. IE sigue bloqueada por prerequisito T2.3-IE. Países ∉ TERRITORIAL_CANON siguen excluidos por §0bis.

No se ha tocado nada. Documento generado para trazabilidad.
