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

---

# CONSOLIDACIÓN PILOT-25 (cierre forzado por hallazgos)

UTC consolidación: 2026-05-22T10:00:00Z (≈30 min después del start).
Run: `4f3e91ee-45ed-4d47-959c-937efe10235a`.
Modo: SOLO lectura. No se mutó estado del run, no se reinició ningún ítem,
no se procesó ningún POI adicional. No se invocó IA. No se invocó
Nominatim. No se hizo bump.

## 1. Estado final del run

| campo            | valor               |
|------------------|---------------------|
| `status`         | `running` (wedged — worker muerto) |
| `ai_calls_used`  | `0` en `enrichment_batch_runs` (NUNCA flusheado) |
| `pause_reason`   | `null`              |
| `abort_reason`   | `null`              |
| `started_at`     | 2026-05-22T09:30:55Z |
| `finished_at`    | `null`              |
| `metrics`        | `{}` (NUNCA flusheado) |

Distribución real (de `enrichment_batch_items`):

| status     | n  |
|------------|----|
| success    | 5  |
| fail       | 1  |
| in_flight  | 19 |
| skip       | 0  |
| noop       | 0  |
| pending    | 0  |
| **total**  | 25 |

`pause_reason` y `abort_reason` no se materializaron porque el worker
murió antes de evaluar `evaluateBudget` post-chunk. La row del run quedó
huérfana en `status='running'`.

## 2. In-flight — NO es 0

19 ítems siguen en `in_flight`, todos `claimed_at = 09:30:55Z`
(~29 min). Umbral de huérfano = 5 min → **TODOS son huérfanos**.

IDs huérfanos (19):

```
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

### Restart policy (explicada, NO ejecutada)

`restart_stale_batch_items(run_id, threshold_minutes:=5)` resetearía esos
19 a `pending` (claimed_at=null, attempts intactos). Antes de invocar el
worker de nuevo, el orquestador debería:

1. Recargar `enrichment_batch_runs` y validar `ai_calls_used < max_ai_calls`.
2. `ai_calls_used` real = 6 (5 success + 1 fail dispatch). Capacidad
   restante = 25 - 6 = 19. Encaja exactamente.
3. Re-clamar y re-despachar. **No se hace ahora** (instrucción explícita:
   "No ejecutar ningún nuevo batch hasta entregar esta consolidación y
   recibir aprobación").

### Causa raíz del orfanato (hipótesis fuerte)

Worker de la edge function shutdown CPU/wall-time entre 09:34Z y
09:35Z, después de procesar 6 ítems del chunk de 25. El loop in-fn no
manejó el cierre con flush parcial: ni actualizó `ai_calls_used` en
`enrichment_batch_runs` ni transicionó la run a `paused`. Los 19 ítems
restantes quedaron `in_flight` sin watchdog.

**Bug confirmado del orquestador (no-piloto-blocker pero sí
Phase-C-blocker):** falta watchdog/heartbeat que mueva la run a
`paused: worker_died` cuando hay ítems `in_flight` > N min y la edge
function no está sirviendo el run.

## 3. Fallos

### 3.1 Fail registrado (1)

- `20dbd409-eead-486d-b45c-d3c1eb2aa967` (Schmetterlinghaus): enrich-
  location respondió 200 con `success:false reason:name_coordinate_mismatch`
  (defense-in-depth de `enrichment-coord-coherence`). El orquestador lo
  registró `fail` con `fail_reason='http_200:name_coordinate_mismatch'`.
- ¿Escribió datos? **NO**. `locations.updated_at = 2026-05-11`,
  `enriched_data` sigue sin `descripcion`.
- Clasificación: **expected skip mal mapeado**. Es defensa válida del
  contrato (el POI no superó la coherencia name↔coords interna del
  enriquecedor); no es bug de filtro Fase 1 ni cambio de estado. Debe
  caer en `skip:coord_coherence_failed`, no en `fail` (no contamina
  error_rate). Fix abajo (§4.3).

### 3.2 "Successes" sospechosos (5) — HALLAZGO CRÍTICO

Los 5 ítems marcados `success` por el orquestador **NO tienen datos
escritos en `locations`**:

| id                                        | name                       | updated_at        | has descripcion |
|-------------------------------------------|----------------------------|-------------------|-----------------|
| 59286b30-cebf-4d8c-be48-f87a1c84a7ca      | Cementerio de la Recoleta  | 2026-05-11 15:01Z | NO              |
| 6b872a54-0d20-443e-9663-0409d5a1ff23      | Funes                      | 2026-05-11 15:01Z | NO              |
| a66c5fa5-377c-4175-b149-679f468c244e      | Tolar Grande               | 2026-05-11 15:01Z | NO              |
| febaddaa-4c21-4361-b1e3-38fecabcc0cb      | Catamarca                  | 2026-05-11 15:01Z | NO              |
| 2492248c-cdfc-4335-b961-5a26450984ce      | Riegersburg                | 2026-05-11 15:01Z | NO              |

`enriched_data` sólo contiene `etiquetas_personales`. `enrichment_status`
sigue `null`. `updated_at` no se movió (sigue 11-may).

**Interpretación:** el orquestador interpretó como `success` respuestas
de `enrich-location` que NO persistieron a `locations`. Dos posibilidades
a discriminar antes de cualquier piloto-50:

a) `enrich-location` devolvió `{ success: true }` por una ruta que no
   escribe (ej. dry-run interno, o early-return tras validación pero
   antes del UPDATE).
b) `enrich-location` escribió pero contra columnas/POI distintos
   (improbable: id es el mismo y no hay traza).

En cualquier caso, **el mapping del orquestador (`success:true` →
`status='success'`) es incorrecto sin verificar persistencia**. Esto es
peor que un bucket-mapping mal hecho: invalida toda la métrica de éxito
del pilot-25.

**Clasificación final del fail real:** los 6 dispatches consumieron 6
créditos de `max_ai_calls` pero 0 POIs quedaron enriquecidos. Tasa real
de enriquecimiento del pilot = 0/6 = 0%.

## 4. Hallazgos técnicos

### 4.1 RPC `auth.uid()` (Phase B issue ya documentado)

- Impacto: bloqueante en runtime; resuelto con doble cliente
  (svc + userClient). Sin regresión.
- ¿Bloquea piloto-50? NO.
- Fix requerido: ya aplicado.

### 4.2 Alias `metadata:custom_data` (Phase B issue ya documentado)

- Impacto: 25× `location_not_found` en el primer intento; resuelto.
- ¿Bloquea piloto-50? NO.
- Fix requerido: ya aplicado.

### 4.3 Bucket-mapping de `success:false` (enrich-location)

- Impacto: `name_coordinate_mismatch`, `coords_invalid`,
  `geo_resolution_failed`, etc. caen como `fail` y contaminan
  `error_rate`. En 25 finalizados con 5% threshold, 2+ fails de este
  tipo abortarían el run sin justificación real.
- ¿Bloquea piloto-50? **SÍ.** A 50 finalizados con 5%, basta con 3
  defense-in-depth para abortar.
- Fix requerido: añadir mapping en `index.ts` del orquestador:
  `if (!success && reason in COORD_DEFENSE_SET) → status='skip',
  skip_reason='defense_'+reason`. Sin tocar enrich-location.

### 4.4 [NUEVO] Worker muerto sin flush → in_flight huérfanos sin pausa

- Impacto: la run queda wedged en `status='running'` con
  `ai_calls_used=0` aunque hubo 6 dispatches. Sin watchdog no hay
  pausa automática.
- ¿Bloquea piloto-50? **SÍ.** A más volumen, más probabilidad de
  cold-shutdown del worker durante el run.
- Fix requerido:
  - Persistir `ai_calls_used` y `metrics` **por ítem finalizado**
    (no sólo al final del chunk).
  - Añadir watchdog opcional (tick periódico que llame a
    `restart_stale_batch_items` + reevaluación de
    `evaluateBudget`).
  - Endpoint `/status` debería detectar `running` + 0 actividad >5min
    y proponer transición a `paused: worker_died`.

### 4.5 [NUEVO] `success` sin verificar persistencia (CRÍTICO)

- Impacto: contabilizamos 5 éxitos sin enriquecimiento real. Métrica
  inservible; auditoría falsamente positiva.
- ¿Bloquea piloto-50? **SÍ — DEFCON.**
- Fix requerido:
  - Post-dispatch, releer `locations.{enriched_data->>'descripcion',
    enrichment_status, updated_at}` para el `location_id` y exigir
    `descripcion` no-vacía + `updated_at >= claimed_at`. Si no →
    `status='fail', fail_reason='success_without_persist'`.
  - Investigar por qué enrich-location devolvió `success:true` sin
    persistir (revisión separada, no incluida aquí).

## 5. Invariantes (verificación)

| invariante                                | estado | nota |
|-------------------------------------------|--------|------|
| Sin Nominatim                              | OK     | no invocado por el orquestador ni por enrich-location en este run |
| Sin re-enrich                              | OK     | los 5 "success" no tenían descripcion previa; gate `already_enriched` no fue eludido |
| Sin UPDATE fuera de allowlist              | OK     | de hecho, **0 UPDATEs a `locations` observados** (`updated_at` intacto en los 6 POIs) |
| Snapshots disponibles                       | OK     | 7 snapshots persistidos en `enrichment_batch_snapshots` |
| Rollback disponible                         | OK (no-op) | snapshots cubren los 6 POIs despachados; rollback sería no-op porque no hubo writes |
| Marker fill intacto                         | OK     | sin tocar |
| `computePoiMaturity` intacto                | OK     | sin tocar |
| Canon territorial intacto                   | OK     | sin tocar |
| Sin bump                                    | OK     | versión sin cambios |
| P1-w2 intacto                               | OK     | sin tocar |

## 6. Recomendación

**REPETIR PILOTO-25 TRAS FIXES** — bloqueado para piloto-50 / Phase C
hasta resolver §4.3, §4.4 y §4.5.

Checklist mínimo antes de re-disparar piloto-25:

1. [§4.5 — CRÍTICO] Verificación de persistencia post-dispatch en el
   orquestador.
2. [§4.4] Flush incremental de `ai_calls_used`/`metrics` por ítem +
   detección de worker-died.
3. [§4.3] Bucket-mapping de `success:false reason:*` → `skip`.
4. Investigación separada (fuera de este reporte): ¿por qué
   `enrich-location` devolvió `success:true` sin persistir para los 5
   POIs? Posible early-return o falta de await en el path activo.
5. Reset higiénico del run actual: marcar `4f3e91ee...` como
   `aborted: superseded_by_postmortem` y abrir run nuevo con mismo
   scope_count=25, max_ai_calls=25.

Sin estos fixes:
- Piloto-50 amplificaría la falsa contabilidad (50 "success" sin
  persistir) → datos auditables corruptos.
- Phase C (1.259) consumiría todos los créditos sin escribir nada.

**NO** ampliar a piloto-50. **NO** Phase C. **NO** re-disparar piloto-25
sin aprobación explícita de los 4 fixes anteriores.

## Anexo — comandos de verificación usados (read-only)

```sql
-- estado del run
SELECT * FROM enrichment_batch_runs WHERE id='4f3e91ee-...';

-- distribución de ítems
SELECT status, fail_reason, count(*) FROM enrichment_batch_items
  WHERE run_id='4f3e91ee-...' GROUP BY status, fail_reason;

-- huérfanos
SELECT location_id, claimed_at,
  EXTRACT(EPOCH FROM (now()-claimed_at))/60 AS mins
FROM enrichment_batch_items
WHERE run_id='4f3e91ee-...' AND status='in_flight';

-- persistencia real de "successes"
SELECT id, name, enrichment_status, updated_at,
  (enriched_data->>'descripcion') IS NOT NULL
    AND length(enriched_data->>'descripcion')>0 AS has_desc
FROM locations WHERE id IN (<5 success ids>);

-- snapshots
SELECT count(*) FROM enrichment_batch_snapshots
  WHERE run_id='4f3e91ee-...';
```

Sin mutaciones. Sin IA. Sin Nominatim. Sin bump.
