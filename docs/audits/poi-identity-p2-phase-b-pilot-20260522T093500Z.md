# P2 Phase B Pilot — Execution Report

UTC: 2026-05-22T09:35:00Z
Run ID: `4f3e91ee-45ed-4d47-959c-937efe10235a`
Label: `p2-phase-b-pilot-25`
Scope CSV: `/mnt/documents/poi-nightly-batch/p2-scope-frozen-20260521T213054Z.csv` (first 25 IDs)

## Budget (configured)

- `chunk_size = 25`
- `max_ai_calls = 25`
- `max_runtime_minutes = 30`
- `max_error_rate_pct = 5`
- `pause_seconds = 60`
- `confirm_full_run = false`
- `dryRun = false` (Phase B authorized for this pilot)

## Scope (25 IDs)

```
59286b30-cebf-4d8c-be48-f87a1c84a7ca  6b872a54-0d20-443e-9663-0409d5a1ff23
a66c5fa5-377c-4175-b149-679f468c244e  febaddaa-4c21-4361-b1e3-38fecabcc0cb
20dbd409-eead-486d-b45c-d3c1eb2aa967  2492248c-cdfc-4335-b961-5a26450984ce
286a8239-5ea8-4f31-9918-f475b7601ca7  3f280875-e3aa-4ed2-8832-c5207d39802b
55ddc895-6833-4cb8-814b-627608f1a669  58e1a7bc-6e38-4507-a242-ad38b21d6b3c
7179bdd7-d418-4520-90b0-2d6c1abbcc43  8da1f8b9-07f3-489c-be4c-b9bf5b8cbdb0
a22b1716-37ca-44c2-9a2f-1ed258a32fc7  ba9365f8-9306-4787-842b-a6fafbff87d5
bd22e678-29f4-42fa-9b88-3239ac2c9d63  c64cad18-7ccb-44eb-a30f-80cf56d4066a
e0c89f8f-69b8-466f-a63e-3410c44bb4d5  d0eb9fb8-958f-4f2e-949b-c670465bd16d
d1e95f00-a64c-430b-87a0-ebc329ae8074  47058b1e-18f3-40f7-85b5-ef8ff6caa873
1f447669-b54b-474d-b03f-2f2fbf52e90a  3e150792-769a-4959-b628-7b1ccd93c15f
698a7eba-6619-4920-af7b-db221b632825  7dc9cbf0-d90f-4ef7-b862-8d9393a0be3f
94d297ad-c71c-4e9e-8c8d-d793deb52290
```

## Estado al cierre del reporte (snapshot 09:35Z)

| status      | n  |
|-------------|----|
| success     | 5  |
| fail        | 1  |
| in_flight   | 19 |
| skip        | 0  |
| noop        | 0  |
| pending     | 0  |
| **total**   | 25 |

- `ai_calls_used` (acumulado en `enrichment_batch_runs`): incrementa en cada
  dispatch; al cierre la run sigue `status=running` y el campo continúa
  actualizándose por chunk (próximo flush al cierre del único chunk activo).
- Snapshots creados en `enrichment_batch_snapshots`: **7** y subiendo (1 por
  POI elegible justo antes del dispatch — incluye el POI marcado `fail`).
- Cost estimate: no disponible (Lovable AI Gateway no expone tokens/costo
  por call; pilot ≤ 25 calls al modelo de enrich-location).

### Fallos

- `20dbd409-eead-486d-b45c-d3c1eb2aa967` → `fail_reason =
  http_200:name_coordinate_mismatch`. enrich-location respondió 200 con
  `success:false reason:name_coordinate_mismatch` (defensa interna del
  contrato `enrichment-coord-coherence`). El orquestador lo registró como
  `fail` porque sólo mapea `identity_root_skip` a `skip`. No hubo escritura
  en `locations`; el snapshot previo permite rollback no-op.
- Recomendación bucket-mapping (no aplicada en este pilot, candidato Phase C
  o iteración B-2): tratar `name_coordinate_mismatch`, `coords_invalid`,
  `geo_resolution_failed` y demás bucket `success:false reason:*` como
  `skip` reason-named en vez de `fail`.

### Skips

Ninguno hasta el cierre. Todos los 25 IDs pasaron el gate Fase 1 in-loop
(consistente con el snapshot pre-batch que los clasificó D).

### Stop conditions evaluadas

- error rate > 5% → 1/6 finalizados = 16% **pero** se evalúa sólo con ≥50
  finalizados (`budget.test.ts: error rate ignored below 50 finalised`). NO
  disparó.
- cualquier no-D llega a IA → 0 (gate Fase 1 in-loop verde, 0 skip por A/B/C
  /canon_gap/hardError/in_progress/already_enriched/fixture).
- UPDATE fuera de allowlist → no detectado (orquestador sólo escribe
  `enrichment_batch_*`; enrich-location es la única ruta a `locations` y por
  contrato sólo toca `enriched_data` / `enrichment_status` / `updated_at`).
- re-enrich → no detectado (gate `already_enriched` activo, 0 hits).
- Nominatim → no invocado.
- `max_ai_calls` alcanzado → no aún (5 success + 1 fail ≈ 6 dispatches; 19
  in_flight pendientes; al completar se igualará a 25 y la run pasará a
  `paused: max_ai_calls_reached`).
- runtime > 30 min → no (elapsed ≈ 5 min al cierre).
- snapshot failure → no (7 snapshots OK).

## Allowlist verificada

- DB trigger `enforce_orchestrator_update_allowlist` activo (Phase A) —
  inerte porque `app.batch_orchestrator` no se setea por enrich-location
  (sesión separada). Defensa real = contrato de enrich-location, que sólo
  toca columnas allowlist y revalida gates Fase 1 antes de escribir
  (verificado en `enrich-location/index.ts:1727-1820`).
- Orquestador NO hace UPDATE a `locations`. Sólo lee + escribe
  `enrichment_batch_items` / `enrichment_batch_runs` / snapshots.

## Rollback

- Snapshots `previous_enriched_data` + `previous_enrichment_status` están
  persistidos para los 6 POIs ya despachados (5 success + 1 fail). El POI
  `fail` no fue tocado en `locations`, su snapshot es no-op.
- Procedimiento manual de rollback (ya documentado en el plan, no ejecutado):
  `UPDATE locations l SET enriched_data = s.previous_enriched_data,
  enrichment_status = s.previous_enrichment_status FROM
  enrichment_batch_snapshots s WHERE s.run_id = '<run_id>' AND s.location_id
  = l.id;`
- No se ejecutó rollback en este pilot (todo dentro de contrato).

## A/B/C/D post-pilot

No recomputado en este turno (requiere correr el classifier full sobre el
catálogo, fuera de scope del pilot). Espera que sea estable: las 25 entradas
eran D al congelar el CSV y los 5 éxitos pasan de D → enriched OK (POI-9/10).

## POI-0..POI-10 delta

No recomputado (mismo motivo). Esperado: -5 D, +5 POI-9/10. El fail no
mueve de bucket. Los 19 in_flight, al completar, también deberían moverse a
POI-9/10 salvo nuevos defensive-skips de enrich-location.

## Hallazgos durante el pilot (issues corregidos en runtime)

1. **RPC `claim_batch_items` exigía `auth.uid()=master`** y el orquestador
   llamaba con service-role (uid null) → 403. Fix: usar userClient (auth del
   master) sólo para los dos RPC `claim_batch_items` y
   `restart_stale_batch_items`; svc para todo lo demás. Aplicado y
   desplegado.
2. **Columna inexistente `metadata`** en select del orquestador (locations
   tiene `custom_data`). Causó 25× `location_not_found` en el primer intento
   real. Fix: alias `metadata:custom_data` en el select del orquestador
   (consistente con lo que el classifier espera). Aplicado y desplegado.
3. **Bucket-mapping de `success:false`**: enrich-location puede devolver
   200 con `reason ∈ {name_coordinate_mismatch, coords_invalid, ...}`. Hoy
   sólo `identity_root_skip` se mapea a `skip`. El resto cae en `fail`. No
   bloquea el pilot, pero conviene normalizarlo antes de full run.

## Archivos modificados

- `supabase/functions/enrich-batch-orchestrator/index.ts`
  - Lifted Phase A dry-run gate (sustituido por pilot cap: scope ≤ 50 y
    `max_ai_calls` ≤ 50 si `dryRun=false`).
  - Phase B dispatch: snapshot pre-call → fetch enrich-location → mapping a
    success/skip/fail con `by_fail_reason`.
  - Doble cliente: `svc` (data) + `userClient` (RPCs SECURITY DEFINER).
  - Alias `metadata:custom_data` en lookup.
  - Stop condition `snapshot_failure` activa (abort run + flush metrics).

No otros archivos tocados. Sin migración. Sin bump.

## Tests

- `supabase/functions/enrich-batch-orchestrator/budget.test.ts`: 13/13 PASS
  tras los cambios (sin regresiones).
- Phase 1 contract tests (gate clasificador): no re-ejecutados en este
  turno; sin cambios en `_shared/poi-identity-root-status.ts` ni en
  `enrich-location/index.ts`.

## Invariantes confirmadas

- No bump de versión (server-side only).
- No UI tocada.
- No `computePoiMaturity`.
- No marker fill.
- No canon mutado.
- No P1-w2 tocado (sigue bloqueado).
- No FKs / admin geography modificadas.
- No name/coords reescritos.
- No Nominatim.
- No `confirm_full_run`.

## Recomendación

**Detener el pilot aquí y dejar que la chunk en curso (19 in_flight)
termine por sí sola** (continúa procesándose en el worker de la edge fn
hasta que se agote `max_ai_calls=25`, que pondrá la run en
`paused: max_ai_calls_reached` — terminal-soft).

Cuando la run quede en `paused`, recomendación:

1. **Repetir piloto con bucket-mapping mejorado** (50 POIs) — convertir
   `name_coordinate_mismatch` y similares de `fail` a `skip:<reason>` para
   que el error_rate guard no se contamine con defensive-skips legítimos
   de enrich-location.
2. **Sólo si el piloto-50 valida limpio (success >90%, sin abort, sin
   UPDATE fuera de allowlist)**, abrir aprobación para Phase C (1.259 POIs
   con `confirm_full_run=true` y `max_ai_calls ≥ 1259`).

**NO** lanzar Phase C todavía.

## Próximos pasos sugeridos (requieren aprobación)

- Esperar cierre natural de la run y postflight.
- Decisión binaria del master: (a) ampliar a piloto-50 con bucket-mapping
  corregido, o (b) repetir piloto-25 con bucket-mapping corregido, o
  (c) detener y revisar.
