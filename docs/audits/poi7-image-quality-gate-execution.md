# POI-7 Image Quality Gate — Execution (v1.3.6)

Status: EJECUTADO. No L2.
Version: `1.3.5 → 1.3.6` (patch).

## Resumen
- Clasificador determinista `classifyImageCandidate` añadido (shared edge + mirror cliente).
- `recover-missing-images` integra el clasificador: rechazados no escriben `imagen`, van a `enriched_data.media_rejected[]`. Aceptados persisten con `image_status='accepted'` + `image_kind='representative'`. `pending_review` persiste `imagen` pero no promociona POI-8.
- `computePoiMaturity.hasValidatedMedia`: `imagen` con `image_status ∈ {rejected, pending_review}` deja de contar. Legacy sin `image_status` sigue contando. Fotos de usuario siempre cuentan.
- 20 falsos positivos L1 corregidos en DB (snapshot íntegro reversible).

## Reglas del clasificador
1. Filename con tokens heráldicos (`bandera|escudo|flag|coat_of_arms|wappen|blason|coa|seal|emblem|shield|crest|logo|herb|gerb|gonfalone`) → `rejected/symbolic`.
2. `.svg` puro (incluido `thumb/.../X.svg/1280px-X.svg.png`) → `rejected/symbolic`.
3. `sourceField` infobox heráldico → `rejected/symbolic`.
4. Title con token heráldico → `rejected/symbolic`.
5. URL vacía → `pending_review/unknown`.
6. Resto → `accepted/representative`.

## Archivos modificados
- `supabase/functions/_shared/image-quality.ts` (NUEVO)
- `src/domains/content/lib/image-quality.ts` (NUEVO, mirror)
- `supabase/functions/recover-missing-images/index.ts` (clasifica antes de persistir; `ItemLog` extendido)
- `src/domains/content/lib/poi-maturity.ts` (`PoiEnrichedShape` + `hasValidatedMedia`)
- `src/test/image-quality-classifier.test.ts` (NUEVO)
- `src/test/poi-maturity.test.ts` (5 tests nuevos)
- `package.json`, `src/lib/app-version.ts`, `README.md` (bump 1.3.6)

## Corrección 20 L1 (data)
- Scope: 20 POIs en `docs/audits/snapshots/poi7-l1-non-representative.csv`.
- Snapshot íntegro pre-update: `docs/audits/snapshots/poi7-l1-non-representative-full.csv`.
- UPDATE aplicado:
  - `enriched_data` ← `(- 'imagen' - 'imagen_fuente') || {image_status:'rejected', image_kind:'symbolic', image_rejection_reason:'flag_or_coat_of_arms_regex_l1_backfill', image_classified_at:now(), media_rejected += {url,source,reason,kind,detected_at}, media -= cover_url/images + image_recovery_attempted_at + image_recovery{recovered:false,rejected:true,...}}`
  - `updated_at = now()`
- Verificación: `SELECT count(*) WHERE image_status='rejected' AND image_rejection_reason='flag_or_coat_of_arms_regex_l1_backfill'` ⇒ **20**.
- Impacto POI-N: los 20 vuelven de POI-9 → POI-7 (sin media validada).

## Garantías negativas
- No L2 ejecutado.
- No re-enrich.
- No se tocó `name`, `latitude`, `longitude`, `raw_geocode`, geografía, `enrichment_status`, colecciones, `is_approved`, `owner_user_id`.
- No hard-delete.
- No migraciones.
- No descargas nuevas de imágenes.

## Rollback

### A — Datos (20 POIs)
Restaurar el `enriched_data` original desde la columna `full_enriched` del snapshot CSV:
```bash
# Para cada fila del snapshot:
psql -c "UPDATE locations SET enriched_data = '<full_enriched_json>'::jsonb, updated_at = now() WHERE id = '<id>'"
```
O simplificado (sin recuperar todo el blob, sólo el campo):
```sql
UPDATE locations l
SET enriched_data =
  ((l.enriched_data - 'image_status' - 'image_kind' - 'image_rejection_reason' - 'image_classified_at')
    || jsonb_build_object(
      'imagen', l.enriched_data->'media_rejected'->-1->>'url',
      'imagen_fuente', l.enriched_data->'media_rejected'->-1->>'source'
    )),
    updated_at = now()
WHERE l.id IN ( /* los 20 UUIDs */ )
  AND l.enriched_data->>'image_rejection_reason' = 'flag_or_coat_of_arms_regex_l1_backfill';
```

### B — Código
Revertir los commits del bump 1.3.6 (clasificador + integración + guardrail maturity + tests). El edge function vuelve a aceptar cualquier `hit` sin validar.

## Próximos pasos
- L2 (sandbox France/Italy ~80 POIs) puede proceder con el guardrail activo. Métrica de éxito: `accepted/scanned ≥ 80%`.
- Considerar persistir `image_status='accepted'` en backfill para los 21 L1 correctos (opcional; legacy sin flag ya cuenta como aceptado por backward-compat).
