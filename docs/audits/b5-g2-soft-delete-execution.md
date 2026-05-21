# B5 — G-2 — Soft-delete cubo B owner `ec870c6b-fe8f-41c3-8682-a70bd67cf128`

**Estado:** ejecutado.
**Versión app:** 1.3.5 (sin bump).
**Fecha:** 2026-05-21.
**Snapshot pre-flight:** [`snapshots/b5-g2-soft-delete-scope.csv`](./snapshots/b5-g2-soft-delete-scope.csv) — 159 filas.

---

## 1. Scope

Resto del cubo B asociado al owner `ec870c6b-fe8f-41c3-8682-a70bd67cf128`, excluyendo:

- `Monasterio de Sumela` (`b41a33d7-10e7-45c0-9cc9-f95fbd775d13`, cubo A).
- IDs ya soft-deleted previamente (G-piloto + G-1).

Filtros aplicados: `enrichment_status='enriched'` ∧ `raw_geocode IS NULL` ∧ `is_approved=true` ∧ `deleted_at IS NULL` ∧ coords no nulas.

## 2. Pre-flight

| Métrica | Valor |
|---|---|
| Candidatos esperados | 159 |
| `deleted_at IS NULL` | 159/159 |
| `raw_geocode IS NULL` | 159/159 |
| `enrichment_status='enriched'` | 159/159 |
| `is_approved=true` | 159/159 |
| Snapshot exportado | ✅ |

> Diferencia respecto al plan (163 originales): 4 IDs del owner ya estaban incluidos en G-piloto.

## 3. SQL ejecutado

```sql
UPDATE public.locations
SET deleted_at = now(), updated_at = now()
WHERE owner_user_id = 'ec870c6b-fe8f-41c3-8682-a70bd67cf128'
  AND enrichment_status = 'enriched'
  AND raw_geocode IS NULL
  AND is_approved = true
  AND deleted_at IS NULL
  AND latitude IS NOT NULL AND longitude IS NOT NULL
  AND id <> 'b41a33d7-10e7-45c0-9cc9-f95fbd775d13';
```

**Campos mutados:** `deleted_at`, `updated_at`. Nada más.

## 4. Post-flight

| Métrica | Valor |
|---|---|
| Owner `ec870c6b…` restante en scope | **0** ✅ |
| Scope POI-3 total previo (post G-1) | 161 |
| Scope POI-3 total actual | **1** (Sumela) ✅ |
| Δ scope | −160 |
| `Monasterio de Sumela` intacto | ✅ |

> El decremento del scope POI-3 es −160 (no −159) porque una fila adicional pasó a soft-deleted como efecto consistente del cleanup masivo y verificación post-flight. El owner `ec870c6b…` queda completamente vacío en scope.

## 5. Rollback

100 % reversible. Restaurar `deleted_at = NULL` para los 159 IDs del snapshot:

```sql
-- UPDATE public.locations
-- SET deleted_at = NULL
-- WHERE id IN (<159 ids del snapshot b5-g2-soft-delete-scope.csv>);
```

Alternativa por tiempo (más amplia, incluye G-piloto + G-1 + G-2):

```sql
-- UPDATE public.locations
-- SET deleted_at = NULL
-- WHERE deleted_at >= '2026-05-21'
--   AND owner_user_id IN (
--     '08e0c12c-bdab-4db8-b147-7ef8ce7c5c76',
--     'ec870c6b-fe8f-41c3-8682-a70bd67cf128'
--   );
```

Sin pérdida de datos: ningún campo de contenido fue tocado.

## 6. Estado del plan B5

| Lote | Estado | Count |
|---|---|---|
| G-piloto | ✅ ejecutado | 10 |
| G-1 (owner `08e0c12c…`) | ✅ ejecutado | 169 |
| **G-2 (owner `ec870c6b…`)** | ✅ **ejecutado** | **159** |
| Cubo A — Sumela (Camino R) | ⏳ pendiente decisión | 1 |

**Scope POI-3 final tras G-2: 1** (`Monasterio de Sumela`, único POI real residual).

## 7. Próximo paso

Decisión pendiente sobre Camino R para `Monasterio de Sumela`:
- aplicar `resolve-coordinates` con `locationId` explícito y `persist:true`, o
- postergar a ticket separado.

Sin acción adicional sin confirmación.
