# Geo Resolution Flags — Application Execution (B5b/B5c)

**Status:** ✅ Ejecutado.
**Fecha:** 2026-05-20T15:35:36Z
**Predecesor:** `docs/audits/geo-resolution-flags-application-dry-run.md`
**Contrato:** `docs/contracts/geo-resolution-flags-contract.md`
**Version impact:** none. No bump. No código. No migraciones. No re-enrich.

---

## 1. Pre-flight

- **Scope esperado:** 70 POIs (id8 prefix exclusivo en el snapshot del dry-run §4).
- **Match en DB:** 70/70.
- **Filas con `custom_data.geo_resolution` previo:** 0 → ningún caso de sobrescritura silenciosa (riesgo #2 del dry-run mitigado).
- **Snapshot pre-UPDATE:** `docs/audits/snapshots/geo-resolution-flags-pre.csv` (71 líneas = 1 header + 70 filas; incluye `id`, `id8`, `name`, `custom_data`, `geo_health`, `has_raw`).

---

## 2. UPDATE ejecutado

Cuatro `UPDATE` sobre `public.locations`, una por bucket, escribiendo SOLO la clave `custom_data.geo_resolution` mediante merge no destructivo:

```sql
custom_data = COALESCE(custom_data,'{}'::jsonb) || jsonb_build_object('geo_resolution', jsonb_build_object(...))
```

Ninguna otra columna fue tocada. `at` se generó dinámicamente con `now() AT TIME ZONE 'UTC'` por bucket.

| Bucket | n | `status` | `reason` |
|---|---:|---|---|
| §1.1 generic ambiguos | 14 | `pending_review` | `generic_name` |
| §1.2 TAIL `Nuevo`/`Nueva`/`#N` | 37 | `needs_name_fix` | `tail_suffix_artifact` |
| §2 R4 fabricados | 15 | `geo_irrecoverable` | `synthetic_or_unverifiable_name` |
| §2 R5 Parque Municipal cosméticos | 4 | `pending_review` | `manual_review_required` |
| **Total** | **70** | | |

---

## 3. Post-flight verification

Consulta de verificación (agregada por `status` + `reason` sobre los 70 IDs):

| `status` | `reason` | n |
|---|---|---:|
| `geo_irrecoverable` | `synthetic_or_unverifiable_name` | 15 |
| `needs_name_fix` | `tail_suffix_artifact` | 37 |
| `pending_review` | `generic_name` | 14 |
| `pending_review` | `manual_review_required` | 4 |
| **Total** | | **70** |

**70/70 flag aplicado.** Distribución idéntica a la prevista en el dry-run §2/§3. 0 desviaciones.

---

## 4. Columnas NO modificadas (whitelist verificada)

`name`, `latitude`, `longitude`, `raw_geocode`, `geo_health`, `enrichment_status`, `enriched_data`, `country`, `region`, `zone`, `country_id`, `region_id`, `zone_id`, `admin3_id`, `locality_id`, `is_approved`, `tags`, `pioneer_user_id`, `owner_user_id` — **intactas**.

Los 4 Parque Municipal cosméticos conservan `geo_health='ok'` y `raw_geocode` poblado (riesgo #5 del dry-run respetado).

---

## 5. Rollback disponible

Por bucket o granular según `docs/audits/geo-resolution-flags-application-dry-run.md §8`. Reversible vía:

```sql
UPDATE locations SET custom_data = custom_data - 'geo_resolution'
WHERE substring(id::text,1,8) IN (...);
```

---

## 6. Próximos pasos (fuera de este lote)

- UI admin filtrable por `custom_data.geo_resolution.status` (contrato §7 "Futuro").
- Excluir `geo_irrecoverable` y `needs_name_fix` de futuros lotes B5/B5a (gate ya documentado).
- Resolver colisiones intra-bucket TAIL (Burdeos×3, Albacete×2, Málaga×2) en cola manual.

---

## 7. Restricciones cumplidas

- ✅ Solo `custom_data.geo_resolution` escrito.
- ✅ Sin cambios en código, migraciones, IA, re-enrich, versión ni `.lovable/plan.md`.
- ✅ Snapshot pre-UPDATE persistido para auditoría.
- ✅ 70/70 verificados post-UPDATE.
