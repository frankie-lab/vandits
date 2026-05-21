# T2.3-P2-residual-data — Ticket spec

**Estado:** Abierto. Datos residuales tras P2 + L1-PT-pre.  
**Origen:** `docs/audits/t-catalog-pt-ra-concelhos-p2-visual-regression-audit.md` §5.  
**Tipo:** Data fix (migración pura, sin código UI).  
**Bump:** ninguno (solo migración).

---

## 1. Alcance

Tres POIs residuales sin reasignación correcta tras P2:

| id (corto) | name                            | clasificación deuda                                   |
| ---------- | ------------------------------- | ----------------------------------------------------- |
| `44da2def` | Santa Cruz da Graciosa Bullring | **P2-addendum** — Açores PT-20, concelho fuera del lote |
| `07980212` | A Pérola do Bolhão              | **L1-PT-pre-addendum** — PT continental (Norte/Oporto)  |
| `1a5bd7b3` | Parque Municipal de Braga       | **L1-PT-pre-addendum** — PT continental (Norte/Braga)   |

---

## 2. Sub-lote A — Santa Cruz da Graciosa (P2-addendum)

### 2.1 Auditoría requerida

- Confirmar por qué el concelho `86796379-ecbb-4500-8db4-5670b2b0ee08` (Santa Cruz da Graciosa) NO entró en el lote P2 de concelhos insulares.
- Revisar `_catalog_pt_ra_concelhos_snapshot_2026_05_21` y `docs/audits/t-catalog-pt-ra-concelhos-dry-run.md` § listado de concelhos isla.
- Hipótesis: el dry-run identificó 16 concelhos, pero el snapshot capturó 17 y la ejecución sólo movió 15 (14 directos + Vila Franca normalizado). Graciosa puede haber quedado en `is_placeholder=true` por error de filtro.

### 2.2 Cambio propuesto (si se confirma elegibilidad)

```sql
-- Catálogo: promover Santa Cruz da Graciosa a d=3 bajo PT-20
UPDATE public.admin_areas
SET parent_id = 'ee871f7d-978f-4a6c-a314-92356fca7d93',  -- PT-20 Açores
    depth = 3,
    path = ARRAY[
      'a988689f-a36d-43e4-90b0-79d6647a8b2e',  -- Earth
      'cb47a8fd-fe71-48b3-81fd-7b1047260149',  -- Portugal
      'ee871f7d-978f-4a6c-a314-92356fca7d93',  -- PT-20
      '86796379-ecbb-4500-8db4-5670b2b0ee08'   -- Santa Cruz da Graciosa
    ]::uuid[],
    is_placeholder = false
WHERE id = '86796379-ecbb-4500-8db4-5670b2b0ee08';

-- Location: aplicar excepción insular
UPDATE public.locations
SET region_id = 'ee871f7d-978f-4a6c-a314-92356fca7d93',
    region = NULL,
    zone_id = NULL,
    zone = NULL,
    admin3_id = '86796379-ecbb-4500-8db4-5670b2b0ee08',
    locality_id = NULL
WHERE id = '44da2def-bbe3-4ad4-9760-7cb4c7f6c7aa';

-- Provenance
INSERT INTO public.location_geo_provenance (
  location_id, field_type, source, area_id, resolved_at
) VALUES (
  '44da2def-bbe3-4ad4-9760-7cb4c7f6c7aa',
  'region',
  't23_p2_addendum_graciosa',
  'ee871f7d-978f-4a6c-a314-92356fca7d93',
  now()
);
```

### 2.3 Snapshot/rollback

- Reutilizar `_catalog_pt_ra_concelhos_snapshot_2026_05_21` y `_locations_ra_concelhos_snapshot_2026_05_21`. Si Graciosa NO está en el snapshot, crear addendum `_catalog_pt_graciosa_snapshot_2026_05_22` con baseline previa.
- Rollback documentado en postflight.

---

## 3. Sub-lote B — Bolhão + Braga Parque (L1-PT-pre-addendum)

### 3.1 Estado actual

| id (corto) | name                      | region_id          | zone_id                          | admin3_id                       | derivable por parent-chain |
| ---------- | ------------------------- | ------------------ | -------------------------------- | ------------------------------- | -------------------------- |
| `07980212` | A Pérola do Bolhão        | `cbeeecd6` (sin región) | `da6059a5` (Oporto / Porto distrito d=3?) | `cd8cc23b` (sin comarca placeholder) | sí — zone_id ⇒ región      |
| `1a5bd7b3` | Parque Municipal de Braga | `cbeeecd6` (sin región) | `55b38c31` (Braga distrito)          | `acd00460` (sin comarca placeholder) | sí — zone_id ⇒ región      |

### 3.2 Cambio propuesto

Resolver `region_id` por parent-chain del `zone_id` existente:

- Bolhão: `zone_id=da6059a5` → parent → debe ser `PT-01 Norte` (`0e0cd77d-36ee-4caf-a022-708ed2d109ef`). Verificar antes de UPDATE.
- Braga Parque: `zone_id=55b38c31` → parent → debe ser `PT-01 Norte`. Verificar.

```sql
-- Patrón (verificar IDs reales antes):
UPDATE public.locations l
SET region_id = aa.parent_id,
    region = NULL  -- limpiar texto legacy
FROM public.admin_areas aa
WHERE l.id IN ('07980212-2a54-4dc5-9058-b25607e126d3',
               '1a5bd7b3-67af-4ecd-8190-30078ef48a50')
  AND aa.id = l.zone_id
  AND aa.parent_id = '0e0cd77d-36ee-4caf-a022-708ed2d109ef'  -- guard PT-01
  AND l.region_id = 'cbeeecd6-a4b8-4b06-ac15-c40532da63d7';  -- guard sin-región
```

### 3.3 Guard rails

- NO usar Nominatim.
- NO re-enrich.
- Preflight COUNT debe devolver exactamente 2.
- Si parent_id de zone_id NO es PT-01 ⇒ abortar y reclasificar como L1-PT-coords.

---

## 4. Restricciones globales

- Migración pura, sin código UI ni helpers nuevos.
- Snapshot previo por sub-lote.
- Postflight separado por sub-lote:
  - `docs/audits/t2-3-p2-addendum-graciosa-postflight.md`
  - `docs/audits/t2-3-l1-pt-pre-addendum-postflight.md`
- Sin Nominatim. Sin re-enrich. Sin bump (solo datos).
- No mezclar este ticket con `T2A-wire-regional-exceptions` — son ortogonales y deben ejecutarse en cualquier orden sin dependencia.

---

## 5. Verificación post-ejecución

```sql
-- Sin POIs PT en (sin región)
SELECT count(*) FROM locations
WHERE country_code='PT'
  AND region_id='cbeeecd6-a4b8-4b06-ac15-c40532da63d7';
-- esperado: 0

-- Açores con Graciosa incluida
SELECT admin3_id, count(*) FROM locations
WHERE region_id='ee871f7d-978f-4a6c-a314-92356fca7d93'
GROUP BY 1 ORDER BY 1;
-- esperado: admin3 86796379 con count=1
```

---

## 6. Fuera de alcance

- Cambios de canon/UI — ver `T2A-wire-regional-exceptions`.
- Limpieza `enriched_data.admin_nivel_2='Lisboa'` legacy (los 14 Madalena) — sub-lote independiente opcional, ya neutralizado por el wire ticket.
- 10 POIs bbox-only de P2 — siguen diferidos a `T2.3-L1-PT-coords`.
