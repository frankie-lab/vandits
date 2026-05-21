# Fase 1 — PR de cableado del filtro POI-Identity Root Status

**Timestamp UTC:** 2026-05-21T21:46:35Z
**Estado:** ✅ CERRADA — cableado activo, tests verdes
**Batch P2:** 🛑 DETENIDO hasta nueva aprobación

## 1. Objetivo cumplido

Activar el filtro POI-Identity Root Status (clasificación A/B/C/D) en `batch-enrich` y `enrich-location` como gate obligatorio **antes** de cualquier llamada IA o escritura de enrichment.

## 2. Archivos modificados / creados

| Archivo | Tipo | Propósito |
|---|---|---|
| `supabase/functions/_shared/poi-identity-root-status.ts` | **nuevo** | Clasificador SoT compartido A/B/C/D + `eligibleForAutoEnrich` |
| `supabase/functions/_shared/poi-identity-root-status.test.ts` | **nuevo** | Suite Deno con 21 casos de exclusión |
| `supabase/functions/batch-enrich/index.ts` | editado | Gate de inclusión pre-IA (`noop-skip` silencioso si !D) + propaga `locationId` |
| `supabase/functions/enrich-location/index.ts` | editado | Revalidación just-before-write con re-fetch + reclassify |

No se ha tocado: `computePoiMaturity`, marker fill, canon, RLS, ni datos.

## 3. Tests ejecutados

```
deno test _shared/poi-identity-root-status.test.ts
ok | 21 passed | 0 failed (6ms)
```

Cobertura de exclusión confirmada:

- **A** — nombre vacío, null island (0,0), coords fuera de rango.
- **B** — `geo_health=partial`, `country_id` null, `canon_gap` (país fuera de `TERRITORIAL_CANON`).
- **C** — `geo_health` broken, `stale_name`, `hardError`.
- **Fixtures** — `sandbox-agent@vandits.test` (uid `f04b3b95-…`), `metadata.synthetic=true`, nombre `beta-chain-*`.
- **Locks** — `enrichment_status=in_progress` (optimistic lock).
- **Estado** — `already_enriched` (`enriched_data.descripcion` presente), `enrichment_status=unresolved`, `under_review`, `deleted`, `is_approved=false`.
- **Race conditions** — enqueue→write con cambio de estado intermedio (in_progress / enriched por otra ruta).

**Happy path D** verificado: POI plan-conforme pasa el filtro.

## 4. Confirmaciones obligatorias

- ✅ `batch-enrich` revalida **antes** de despachar a IA: si `!eligibleForAutoEnrich` emite `noop-skip` con `reason` y NO invoca `enrich-location`.
- ✅ `enrich-location` revalida **antes de escribir**: re-fetch del registro fresco + `classifyPoiIdentityRootStatus(fresh)`; si el estado cambió entre enqueue y ejecución (ej. ya enriquecido por otra ruta, lock tomado, marcado under_review), aborta sin IA ni UPDATE.
- ✅ Ninguna IA invocada esta noche.
- ✅ Ningún UPDATE de datos esta noche.
- ✅ Ninguna llamada a Nominatim.
- ✅ P1-w2 NO ejecutado.
- ✅ P2 batch NO ejecutado — **sigue detenido hasta nueva aprobación explícita**.
- ✅ `computePoiMaturity`, marker fill y canon intactos.

## 5. Versión / bump

No se aplica bump de versión en esta entrega (cambios server-side en edge functions; el versionado de cliente no se ve afectado). Si la política de release exige patch bump por cambio de comportamiento server, se ejecutará en PR separado bajo aprobación.

## 6. Cableado — snippet canónico

```ts
// batch-enrich (pre-IA gate)
const identity = classifyPoiIdentityRootStatus(location);
if (!identity.eligibleForAutoEnrich) {
  // noop-skip: log reason (root_a | root_b_canon_gap | root_c_hard_error |
  //            already_enriched | in_progress | fixture | under_review …)
  continue;
}

// enrich-location (revalidación just-before-write)
const { data: fresh } = await supabase.from("locations").select("*").eq("id", locationId).single();
const verdict = classifyPoiIdentityRootStatus(fresh);
if (!verdict.eligibleForAutoEnrich) {
  return abortNoWrite(verdict.reason);
}
```

## 7. Próximo paso (NO ejecutado)

**Fase 2 — Relanzar batch nocturno** queda pendiente de aprobación explícita:

- Usar `/mnt/documents/poi-nightly-batch/p2-scope-frozen-20260521T213054Z.csv` (1.259 IDs, revalidados al inicio).
- Chunks 25 × 60s, orden GB→US→IE→…
- P1-w2: 11 POIs plan-conformes con snapshot/rollback (los 6 extra del snapshot NO se tocan).
- Mantener stop conditions definidas en `docs/audits/poi-identity-p1-p2-parallel-execution-plan.md` §6.

**No relanzar sin aprobación.**

## 8. Rollback Fase 1

Si se detecta regresión en `batch-enrich` / `enrich-location`:

1. Revert de los 2 edits sobre `index.ts` (gate + revalidación).
2. Mantener `_shared/poi-identity-root-status.ts` y su test (puro, sin side effects).
3. Re-deploy ambas funciones.

El revert no afecta datos porque Fase 1 no escribió ningún registro.
