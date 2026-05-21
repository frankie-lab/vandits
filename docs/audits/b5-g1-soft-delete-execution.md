# B5 · G-1 — Soft-delete execution log (owner `08e0c12c…`)

**Fecha:** 2026-05-21
**Plan de origen:** [`docs/audits/b5-raw-geocode-backfill-poi3-plan.md`](./b5-raw-geocode-backfill-poi3-plan.md)
**Lote previo:** [`b5-g-pilot-soft-delete-execution.md`](./b5-g-pilot-soft-delete-execution.md)
**Lote:** G-1 (cubo B, resto fixtures owner `08e0c12c-bdab-4db8-b147-7ef8ce7c5c76`)
**Operación:** soft-delete reversible (`deleted_at = now()`, `updated_at = now()`)
**Camino:** G (governance). Camino R sobre cubo A NO ejecutado.
**Version impact:** none (sin bump).

---

## 1. Scope

Predicate (igual al del audit B5, con dos exclusiones):

```
owner_user_id = '08e0c12c-bdab-4db8-b147-7ef8ce7c5c76'
AND enrichment_status = 'enriched'
AND raw_geocode IS NULL
AND is_approved = true
AND deleted_at IS NULL
AND latitude IS NOT NULL AND longitude IS NOT NULL
AND id <> 'b41a33d7-10e7-45c0-9cc9-f95fbd775d13'  -- exclusión Sumela
```

Los 6/10 IDs de G-piloto que pertenecían a este owner ya estaban excluidos por `deleted_at IS NULL`.

- **Count esperado pre-flight:** **169**
- **Snapshot completo de IDs:** [`snapshots/b5-g1-soft-delete-scope.csv`](./snapshots/b5-g1-soft-delete-scope.csv) (169 filas + header).

---

## 2. Pre-flight (verificación)

- `deleted_at IS NULL` ✅ (169/169)
- `raw_geocode IS NULL` ✅ (169/169)
- `enrichment_status = 'enriched'` ✅ (169/169)
- `is_approved = true`, coords válidas ✅ (169/169)
- `Monasterio de Sumela` excluido del scope ✅
- Owner único ✅ (`08e0c12c-bdab-4db8-b147-7ef8ce7c5c76`)

Scope total previo (todos los owners, mismo predicate menos `owner_user_id`): **330** (resultado verificado al cierre de G-piloto).

---

## 3. SQL ejecutado

Vía herramienta `insert` con descripción humana. Reproducido para auditoría:

```sql
UPDATE public.locations
SET deleted_at = now(), updated_at = now()
WHERE owner_user_id = '08e0c12c-bdab-4db8-b147-7ef8ce7c5c76'
  AND enrichment_status = 'enriched'
  AND raw_geocode IS NULL
  AND is_approved = true
  AND deleted_at IS NULL
  AND latitude IS NOT NULL
  AND longitude IS NOT NULL
  AND id <> 'b41a33d7-10e7-45c0-9cc9-f95fbd775d13';
```

**Campos modificados:** `deleted_at`, `updated_at`. Solo eso.

**NO modificados (regla DURA):** `name`, `latitude`, `longitude`, `raw_geocode`, `enriched_data`, `geo_health`, `enrichment_status`, FKs geográficas, colecciones, tags, media, `is_approved`, `owner_user_id`, `visibility`.

---

## 4. Post-flight

| Check | Resultado |
|---|---|
| Scope total POI-3 (todos owners) | **161** (Δ = −169 vs. pre-flight 330) |
| Scope owner `08e0c12c…` restante | **0** ✅ (owner agotado) |
| `Monasterio de Sumela` (cubo A) | intacto, `deleted_at IS NULL` ✅ |

Consecuencia UI esperada (no validada visualmente en este log):

- 169 markers desaparecen del mapa global vía `isLocationVisibleInGlobalMap`.
- Leyenda compacta de Madurez POI: bucket POI-3 decrementa 169.
- Ningún POI fuera del scope cambia de estado.

Restante en el cubo B (otro owner): **161** (corresponde íntegramente al owner `ec870c6b-fe8f-41c3-8682-a70bd67cf128` — objetivo de G-2).

---

## 5. Rollback

Reversible 100%, sin pérdida de datos:

```sql
-- Restaurar los 169 IDs del snapshot CSV
UPDATE public.locations
SET deleted_at = NULL, updated_at = now()
WHERE id IN (
  -- IDs en docs/audits/snapshots/b5-g1-soft-delete-scope.csv
);
```

Alternativa más segura (idempotente al lote G-1, sin necesidad de listar IDs):

```sql
UPDATE public.locations
SET deleted_at = NULL, updated_at = now()
WHERE owner_user_id = '08e0c12c-bdab-4db8-b147-7ef8ce7c5c76'
  AND enrichment_status = 'enriched'
  AND raw_geocode IS NULL
  AND deleted_at >= '2026-05-21'::timestamptz
  AND deleted_at <  '2026-05-22'::timestamptz
  AND id <> 'b41a33d7-10e7-45c0-9cc9-f95fbd775d13';
```

> Si se ejecuta G-2 el mismo día, usar el snapshot CSV para acotar el rollback al lote correcto.

---

## 6. Siguientes pasos (no ejecutados aquí)

- **Validación visual** en preview por parte del usuario.
- Lote **G-2** (resto cubo B owner `ec870c6b…`, ~161 restantes).
- **Camino R** sobre `Monasterio de Sumela`: pendiente, ticket separado.

Sin hard-delete. Sin `resolve-coordinates`. Sin re-enrich. Sin bump.
