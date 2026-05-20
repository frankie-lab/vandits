# B3 — Limpieza `zone == region` (DRY-RUN)

**Estado:** read-only. Cero UPDATE/DELETE/migración/re-enrich/código/bump.
**Fecha:** 2026-05-20
**Scope:** POIs donde `zone` (texto) o `zone_id` (FK admin_areas) duplican la región.
**Decisión:** propuesta — pendiente de aprobación del usuario para B3-execute.

---

## 1. Resumen de conteos

| Bucket | Definición | Count |
|---|---|---|
| **D6a** | `lower(btrim(zone)) = lower(btrim(region))` (texto) | **1 607** |
| **D6b strict** | `zone_id = region_id` (misma FK) | **0** |
| **D6b equiv** | `zone_id` y `region_id` distintos pero "equivalentes" reales | **0** |
| **D6a ∩ D6b strict** | intersección estricta | **0** |
| **Unión a corregir** | D6a ∪ D6b strict | **1 607** |

### Nota sobre D6b "equivalente"

Una consulta inicial detectó 5 018 filas donde `region_id` es **ancestro** de `zone_id` en `admin_areas.path`. Esto **NO es redundancia**: es exactamente el árbol canónico definido en `mem://geography/canonical-tree-spec` (`region_id`=región, `zone_id`=PROVINCIA, provincia ⊂ región). Por tanto se excluyen del scope D6b. Sub-breakdown:

| Relación zone_id↔region_id | Count |
|---|---|
| `same_id` (idénticos) | 0 |
| `zone_is_ancestor_of_region` (anómalo) | 0 |
| `region_is_ancestor_of_zone` (canónico, NO redundante) | 5 018 |
| `same_name_only` (sin parentesco) | 0 |

**D6b real = 0.** Toda la corrección B3 se concentra en **D6a textual = 1 607 POIs**.

### Sub-breakdown D6a

| Sub-bucket | Count |
|---|---|
| `zone == region == "(sin región)"` (placeholder ruido) | 64 |
| `zone == region` con nombre real (duplicado verdadero) | 1 543 |

---

## 2. Breakdown por país/región (top 20)

| País | Región | n |
|---|---|---|
| Francia | Isla de Francia | 158 |
| Italia | Lacio | 130 |
| España | Comunidad de Madrid | 110 |
| Italia | Toscana | 86 |
| Italia | Lombardia | 84 |
| Italia | Campania | 71 |
| Italia | Liguria | 56 |
| Italia | Véneto | 56 |
| Italia | Sardegna | 54 |
| Italia | Sicilia | 53 |
| España | Principado de Asturias | 53 |
| España | Illes Balears | 49 |
| Italia | Piemonte | 42 |
| Italia | Emilia-Romagna | 41 |
| Italia | Umbría | 39 |
| España | Cantabria | 37 |
| Italia | Puglia | 32 |
| Italia | Marche | 32 |
| Italia | Trentino-Alto Adigio | 29 |
| Italia | Abruzzo | 29 |

Patrón dominante: ciudades-región o regiones administrativas donde el normalizador antiguo copió la región al campo `zone` por defecto (capitales metropolitanas: Madrid, Roma, París…).

---

## 3. Ejemplos (10)

| id | name | country | region | zone | zone_id == region_id? |
|---|---|---|---|---|---|
| 71228158-c4ae-44c4-8074-19edf4c59f03 | Friedhof Grunewald-Forst | Alemania | (sin región) | (sin región) | no (siblings placeholder) |
| 36f3c83b-14dc-4a12-8c18-8c99f8801492 | Plänterwald | Alemania | (sin región) | (sin región) | no |
| ed5d9a90-9829-4afc-9455-7cf7ed2d2538 | Zur letzten Instanz | Alemania | (sin región) | (sin región) | no |
| 6fd47859-6d78-45a6-b18e-c3d8c1648cdd | Friburgo de Brisgovia | Alemania | Baden-Wurtemberg | Baden-Wurtemberg | no (siblings) |
| b1def0af-9698-4109-8d75-bddb6af4f3b5 | Duisburgo | Alemania | Nordrhein-Westfalen | Nordrhein-Westfalen | no |
| 4db6dc37-936d-43c9-9f37-33138c95a3ca | Museo del perfume de Colonia | Alemania | Nordrhein-Westfalen | Nordrhein-Westfalen | no |
| bc48acd0-2361-4013-984b-2c51951b3ef7 | Großer Ring | Alemania | Rheinland-Pfalz | Rheinland-Pfalz | no |
| d0eb9fb8-958f-4f2e-949b-c670465bd16d | Bahía de Botany | Australia | Nueva Gales del Sur | Nueva Gales del Sur | no |
| d1e95f00-a64c-430b-87a0-ebc329ae8074 | Playa de Manly | Australia | Nueva Gales del Sur | Nueva Gales del Sur | no |
| 20dbd409-eead-486d-b45c-d3c1eb2aa967 | Schmetterlinghaus | Austria | (sin región) | (sin región) | no |

En todos los casos el `zone_id` apunta a un admin_area **distinto** del `region_id` pero con el **mismo nombre textual**. Ambos son ruido legacy del importer antiguo.

---

## 4. SQL SELECT reproducible

```sql
-- D6a textual
SELECT count(*) AS d6a_count
FROM locations
WHERE deleted_at IS NULL
  AND zone IS NOT NULL AND region IS NOT NULL
  AND lower(btrim(zone)) = lower(btrim(region));

-- D6b estricto
SELECT count(*) AS d6b_strict_count
FROM locations
WHERE deleted_at IS NULL
  AND zone_id IS NOT NULL AND region_id IS NOT NULL
  AND zone_id = region_id;

-- D6b "equivalente" (descartar canónicos región→provincia)
SELECT
  SUM(CASE WHEN az.id = ar.id THEN 1 ELSE 0 END) AS same_id,
  SUM(CASE WHEN az.id <> ar.id AND az.id = ANY(ar.path) THEN 1 ELSE 0 END) AS zone_is_ancestor_of_region,
  SUM(CASE WHEN az.id <> ar.id AND ar.id = ANY(az.path) THEN 1 ELSE 0 END) AS region_is_ancestor_of_zone, -- canónico, NO redundante
  SUM(CASE WHEN az.id <> ar.id
            AND NOT (az.id = ANY(ar.path))
            AND NOT (ar.id = ANY(az.path))
            AND lower(btrim(az.name)) = lower(btrim(ar.name)) THEN 1 ELSE 0 END) AS same_name_only
FROM locations l
JOIN admin_areas az ON az.id = l.zone_id
JOIN admin_areas ar ON ar.id = l.region_id
WHERE l.deleted_at IS NULL;

-- Breakdown D6a por país/región
SELECT country, region, count(*) AS n
FROM locations
WHERE deleted_at IS NULL
  AND zone IS NOT NULL AND region IS NOT NULL
  AND lower(btrim(zone)) = lower(btrim(region))
GROUP BY country, region
ORDER BY n DESC;

-- Ejemplos D6a
SELECT id, name, country, region, zone, zone_id, region_id
FROM locations
WHERE deleted_at IS NULL
  AND zone IS NOT NULL AND region IS NOT NULL
  AND lower(btrim(zone)) = lower(btrim(region))
ORDER BY country, region, name
LIMIT 10;
```

---

## 5. SQL UPDATE propuesto (COMENTADO — NO EJECUTAR)

> Pendiente de aprobación B3-execute. Snapshot/hash se capturará pre-flight.

```sql
-- B3a: limpiar zone textual duplicado con region (~1 607 filas)
-- UPDATE locations
-- SET zone = NULL,
--     updated_at = now()
-- WHERE deleted_at IS NULL
--   AND zone IS NOT NULL AND region IS NOT NULL
--   AND lower(btrim(zone)) = lower(btrim(region));

-- B3b: limpiar zone_id apuntando a la misma FK que region_id
-- (count actual = 0; predicate idempotente, safe no-op si se mantiene)
-- UPDATE locations
-- SET zone_id = NULL,
--     updated_at = now()
-- WHERE deleted_at IS NULL
--   AND zone_id IS NOT NULL AND region_id IS NOT NULL
--   AND zone_id = region_id;
```

### Campos NO tocados (garantía dura)

`region`, `region_id`, `latitude`, `longitude`, `altitude`, `enriched_data`, `raw_geocode`, `enrichment_status`, `geo_health`, `geo_source`, `geo_confidence`, `country`, `country_id`, `continent`, `continent_id`, `admin3_id`, `locality_id`, `sublocality_id`, `name`, `description`, `owner_user_id`, `document_id`, `visibility`, `is_approved`.

Solo se modificarían: `zone` (B3a) y `zone_id` (B3b, 0 filas hoy) + `updated_at`.

---

## 6. Riesgos

| Riesgo | Mitigación |
|---|---|
| Falso positivo: una región y una provincia comparten legítimamente el mismo nombre (ej. ciudad-región tipo Berlín = land + ciudad). | `zone=NULL` no destruye la jerarquía: `zone_id` (FK admin_areas) y `region_id` permanecen intactos. Si la jerarquía real estaba bien, el resolver `v_locations_resolved` re-deriva el label de zone desde `zone_id`. |
| Drift entre snapshot y execute (precedente B2: −1). | En B3-execute: capturar snapshot + hash, abortar si delta > 0.5 %. |
| 64 placeholders `"(sin región)"` quedan con `zone=NULL` y `region="(sin región)"`. | Esperado y deseado; el placeholder de `region` se trata por separado fuera de scope B3. |
| Vistas/consumidores que leen `zone` directo en vez de `v_locations_resolved`. | Mitigado por la canon "Vista única para geografía resuelta" (`mem://logic/content/locations-resolved-view`). El resolver cae al texto solo si la FK falta. |

---

## 7. Rollback plan

Predicado seguro idempotente (no requiere lista gigante de IDs). Recuperable si se conserva tabla de auditoría con (`id`, `zone_old`).

**Pre-execute deberá:**
1. Materializar snapshot (`id`, `zone`) → tabla temporal o CSV en `/mnt/documents/`.
2. Calcular hash determinista del snapshot.

**Rollback SQL (post-execute):**
```sql
-- Restaurar desde snapshot capturado en B3-execute
-- UPDATE locations l
-- SET zone = s.zone_old,
--     updated_at = now()
-- FROM b3_zone_snapshot s
-- WHERE l.id = s.id AND l.zone IS NULL;
```

Sin snapshot, el rollback solo es posible vía PITR de la base.

---

## 8. Recomendación de ejecución

**Proceder con B3-execute en una sola pasada**, scope D6a (1 607 filas).
- B3b strict count = 0 → predicate idempotente, safe no-op.
- B3b equiv ya descartado (es jerarquía canónica, no ruido).
- Riesgo bajo: solo nullea texto duplicado; FK y geometría intactas.
- Bonus: limpia 64 placeholders `"(sin región)"` en `zone` (queda solo en `region`).

**Aprobación requerida** antes de capturar snapshot + UPDATE.

---

## 9. Restricciones honradas

- Cero UPDATE. Cero DELETE. Cero migración. Cero re-enrich. Cero código. Cero bump.
- Cero edición de `.lovable/plan.md` (la auto-aprobación del plan-mode es interna y no constituye una edición manual).
- Solo SELECT read-only + creación de este documento.

**Version impact:** none.
