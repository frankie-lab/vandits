# B5 · G-piloto — Soft-delete execution log

**Fecha:** 2026-05-21
**Plan de origen:** [`docs/audits/b5-raw-geocode-backfill-poi3-plan.md`](./b5-raw-geocode-backfill-poi3-plan.md)
**Lote:** G-piloto (cubo B, 10 fixtures sintéticos ES)
**Operación:** soft-delete reversible (`deleted_at = now()`, `updated_at = now()`)
**Camino:** G (governance). NO se ejecutó Camino R sobre el cubo A en esta operación.
**Version impact:** none (sin bump).

---

## 1. Scope ejecutado (10 IDs)

Selección: cubo B, todos `country='España'`, owners equilibrados (6 × `08e0c12c…`, 4 × `ec870c6b…`), nombres claramente sintéticos (prefijo `Bodega Artesanal` + `Café Histórico`).

| # | id | name | owner |
|---|---|---|---|
| 1 | `4e1c7955-542a-485d-9b55-ba25a50da039` | Bodega Artesanal de Albacete de la Sierra | `08e0c12c…` |
| 2 | `8cc02c20-3964-47b6-8bad-804dc04ae1a3` | Bodega Artesanal de Ávila | `ec870c6b…` |
| 3 | `43285e14-cf72-4ef8-9cb9-57f449dccb12` | Bodega Artesanal de Ávila #2 | `ec870c6b…` |
| 4 | `3715fd65-093d-420c-812b-5887b792051c` | Bodega Artesanal de Barcelona (Norte) | `ec870c6b…` |
| 5 | `31869808-cdc6-4050-b270-389893b0c430` | Bodega Artesanal de Madrid | `08e0c12c…` |
| 6 | `75a01dda-3c66-43de-a113-99cd7cab9bd4` | Bodega Artesanal de Murcia Antiguo | `08e0c12c…` |
| 7 | `4ebd1e53-ddf4-4791-a5aa-f62e99ac99a8` | Bodega Artesanal de Oviedo | `ec870c6b…` |
| 8 | `e7d2d01f-cd27-4f76-8705-9a89c80a5004` | Bodega Artesanal de Sevilla | `08e0c12c…` |
| 9 | `d3748235-7bab-4e00-b5ad-e06a71d90ba9` | Bodega Artesanal de Tenerife de la Sierra | `08e0c12c…` |
| 10 | `f85747ae-c1a8-45dd-a703-86c7f9e1b19d` | Café Histórico de Bilbao (Norte) | `08e0c12c…` |

`Monasterio de Sumela` (`b41a33d7-10e7-45c0-9cc9-f95fbd775d13`, cubo A) **NO** fue tocado.

---

## 2. Pre-flight (snapshot)

Para los 10 IDs, antes del `UPDATE`:

- `deleted_at IS NULL` ✅ (10/10)
- `raw_geocode IS NULL` ✅ (10/10)
- `enrichment_status = 'enriched'` ✅ (10/10)
- `is_approved = true`, `latitude`/`longitude` válidas ✅ (10/10)

Scope total previo (`enriched + raw_geocode IS NULL + is_approved + deleted_at IS NULL + coords válidas`): **340**.

> Nota: el plan B5 (`b5-raw-geocode-backfill-poi3-plan.md`) registró 339 en el momento del audit. El delta `+1` se atribuye a una entrada equivalente añadida entre audit y ejecución; no afecta a la selección piloto.

---

## 3. SQL ejecutado

Vía herramienta `insert` (descripción humana incluida). Reproducido aquí para auditoría:

```sql
UPDATE public.locations
SET deleted_at = now(), updated_at = now()
WHERE id IN (
  '4e1c7955-542a-485d-9b55-ba25a50da039',
  '8cc02c20-3964-47b6-8bad-804dc04ae1a3',
  '43285e14-cf72-4ef8-9cb9-57f449dccb12',
  '3715fd65-093d-420c-812b-5887b792051c',
  '31869808-cdc6-4050-b270-389893b0c430',
  '75a01dda-3c66-43de-a113-99cd7cab9bd4',
  '4ebd1e53-ddf4-4791-a5aa-f62e99ac99a8',
  'e7d2d01f-cd27-4f76-8705-9a89c80a5004',
  'd3748235-7bab-4e00-b5ad-e06a71d90ba9',
  'f85747ae-c1a8-45dd-a703-86c7f9e1b19d'
)
AND deleted_at IS NULL
AND raw_geocode IS NULL
AND enrichment_status = 'enriched';
```

**Campos modificados:** `deleted_at`, `updated_at`. Sólo eso.

**NO modificados (regla DURA):** `name`, `latitude`, `longitude`, `raw_geocode`, `enriched_data`, `geo_health`, `enrichment_status`, `country`/`country_id`/`region_id`/`zone_id`/`admin3_id`/`locality_id`, colecciones, tags, media, `is_approved`, `owner_user_id`, `visibility`.

---

## 4. Post-flight (verificación)

Inmediatamente después del `UPDATE`:

| Check | Resultado |
|---|---|
| 10/10 con `deleted_at IS NOT NULL` | ✅ |
| 10/10 con `raw_geocode IS NULL` (intacto) | ✅ |
| 10/10 con `enrichment_status='enriched'` (intacto) | ✅ |
| Scope visible POI-3 (mismo predicate, `deleted_at IS NULL`) | **330** (Δ = −10 vs. pre-flight 340) |
| `Monasterio de Sumela` tocado | ❌ (intacto, como debe) |

**Consecuencia UI esperada** (no validada visualmente en este log; pendiente de inspección por el usuario en el preview):

- Los 10 markers desaparecen del mapa global vía `isLocationVisibleInGlobalMap` (exige `deleted_at IS NULL`).
- La leyenda compacta de Madurez POI debe mostrar el bucket POI-3 decrementado en 10.
- Ningún otro POI cambia de nivel ni de color.

---

## 5. Rollback

Reversión 100% reversible, sin pérdida de datos ni transformación de campos:

```sql
UPDATE public.locations
SET deleted_at = NULL, updated_at = now()
WHERE id IN (
  '4e1c7955-542a-485d-9b55-ba25a50da039',
  '8cc02c20-3964-47b6-8bad-804dc04ae1a3',
  '43285e14-cf72-4ef8-9cb9-57f449dccb12',
  '3715fd65-093d-420c-812b-5887b792051c',
  '31869808-cdc6-4050-b270-389893b0c430',
  '75a01dda-3c66-43de-a113-99cd7cab9bd4',
  '4ebd1e53-ddf4-4791-a5aa-f62e99ac99a8',
  'e7d2d01f-cd27-4f76-8705-9a89c80a5004',
  'd3748235-7bab-4e00-b5ad-e06a71d90ba9',
  'f85747ae-c1a8-45dd-a703-86c7f9e1b19d'
);
```

---

## 6. Siguientes pasos (no ejecutados aquí)

- **Validación visual** en preview por parte del usuario: confirmar desaparición de 10 markers + decremento de POI-3.
- Si OK → lotes **G-1** (resto cubo B owner `08e0c12c…`, ~155 restantes) y **G-2** (resto cubo B owner `ec870c6b…`, ~163), siguiendo el mismo patrón.
- **Camino R** sobre `Monasterio de Sumela`: pendiente, ticket separado.

Sin hard-delete. Sin `resolve-coordinates`. Sin re-enrich. Sin bump de versión.
