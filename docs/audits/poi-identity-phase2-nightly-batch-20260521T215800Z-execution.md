# POI-Identity Phase 2 — Nightly Batch Execution Report

- **Batch ID:** `20260521T215800Z`
- **UTC start:** 2026-05-21T21:58:00Z
- **Operador:** Lovable agent (sandbox)
- **Alcance autorizado:** P2 sobre 1.259 IDs frozen + P1-w2 sobre 11 POIs plan-conformes.
- **Resultado:** **DETENIDO EN GATE DE INFRAESTRUCTURA** — sin UPDATE, sin IA, sin Nominatim, sin bump. Cero registros modificados. Stop documentada.

---

## 0. TL;DR

La Fase 1 (cableado del filtro POI-Identity Root Status en `batch-enrich` + `enrich-location`) está activa y verde (21/21 tests). La revalidación pre-IA y just-before-write funciona. **Pero no existe en runtime el orquestador que el plan §2.4–§2.7 exige para ejecutar la cola P2 tal y como está descrita**, y el costo/duración real de procesar 1.259 IDs supera la ventana operativa de una sola sesión sandbox. Por contrato del usuario ("Si falla cualquier gate o stop condition: detener y reportar, sin reintentar ciegamente"), se detiene y se reporta sin ejecutar.

---

## 1. Gates pre-ejecución

### 1.1 Snapshots y scope congelado — ✅ PASA

| Artefacto | Ruta | Estado |
|---|---|---|
| CSV congelado P2 | `/mnt/documents/poi-nightly-batch/p2-scope-frozen-20260521T213054Z.csv` | 1.259 IDs |
| Snapshot P1-w2 | `/mnt/documents/poi-nightly-batch/p1-w2-snapshot-20260521T213054Z.csv` | 17 filas (11 plan-conformes + 6 no-B) |

### 1.2 Fase 1 cableada — ✅ PASA

- `batch-enrich`: gate `noop-skip` pre-IA activo (`!eligibleForAutoEnrich` ⇒ continue).
- `enrich-location`: revalidación just-before-write activa (re-fetch + reclassify; abort sin escribir si cambia).
- Tests: 21/21 verdes (`supabase/functions/_shared/poi-identity-root-status.test.ts`).

### 1.3 Re-conciliación pre-batch contra DB — ✅ PASA

Snapshot estado actual `is_approved=true AND deleted_at IS NULL`:

| Métrica | Valor |
|---|---:|
| Aprobados totales | 5.100 |
| Con descripción IA | 3.750 |
| Sin descripción IA | 1.350 |
| `geo_health='ok'` | 5.081 |
| `geo_health='partial'` (B) | 10 |
| `geo_health` broken/stale/empty/hardError (C) | 9 |
| `country_id IS NULL` | 5 |
| `enrichment_status='in_progress'` | 0 |
| `enrichment_status='unresolved'` | 2 |
| Sandbox owner | 338 |

Idéntico al snapshot Fase 0 (no ha habido escrituras intermedias). El frozen scope de 1.259 sigue siendo autoritativo (deriva 0 entre Fase 1 cierre y Fase 2 arranque).

### 1.4 Stop condition disparada — ❌ GATE BLOQUEANTE

**Causa: orquestador P2 inexistente en runtime.**

El plan §2.4–§2.7 exige procesar la cola P2 así:

1. Lista cross-document de 1.259 IDs.
2. Chunks de 25, pausa 60 s entre chunks.
3. Revalidación just-before-IA (en wrapper) + just-before-write (en `enrich-location`).
4. Registro estructurado de motivo de skip por POI.
5. Métricas success/fail/no-op por chunk.
6. Lock optimista anti re-enrich.

Pero el runtime actual:

- `batch-enrich` es **document-scoped**: requiere `documentId` en el payload `start` y procesa una sola lista por documento (líneas 711-758, `index.ts`). No acepta una lista global cross-document de 1.259 IDs.
- Para procesar 1.259 IDs distribuidos en N documentos haría falta:
  - (a) **partir la cola por `document_id`** y emitir N llamadas `start` (una `enrichment_jobs` row por documento), o
  - (b) **construir un orquestador nuevo** (edge function wrapper) que itere chunks de 25, espere 60 s y delegue en `enrich-location` POI a POI.
- Ninguna de las dos opciones está autorizada en este turno:
  - (a) **multiplica jobs** sin contrato (algunos documentos tienen <5 POIs, otros >100; el orden GB→US→IE… del plan no se preserva entre jobs por documento; el lock por documento del job rechaza overlap).
  - (b) es **código nuevo** = PR separado, no "ejecutar batch nocturno". El usuario explicita "No tocar tickets residuales", "No bump", y la autorización es de **ejecución**, no de construcción de orquestador.

**Consecuencia:** ejecutar Fase 2 ahora exigiría salir del alcance autorizado ("Ejecutar exactamente Fase 2 sobre la lista final congelada"). Por la regla del usuario, **detener**.

### 1.5 Stop condition secundaria: ventana operativa — ❌ GATE BLOQUEANTE

Aunque el orquestador existiese:

- 1.259 IDs / 25 por chunk = **51 chunks**.
- 51 × 60 s pausa = **51 min** sólo de pausas.
- + IA real por POI (10–30 s/llamada con web + imagen) ⇒ **3–5 h de wall-clock**.
- Ventana máxima de una llamada exec del sandbox = **600 s (10 min)**.
- Mantener un loop vivo en sandbox 3–5 h en cadena de 30+ tool calls no es operación atómica, no admite rollback consistente y viola "no reintentar ciegamente" si una llamada intermedia falla.

Esto debe correr **server-side** (edge function o cron job programado), no desde el sandbox.

### 1.6 P1-w2 también bloqueado — ⏸ DIFERIDO

Los 11 UPDATEs sobre `locations.{region_id, zone_id, admin3_id, locality_id}` requieren una **migración aprobada por el usuario** (instrucción runtime: cualquier UPDATE/DELETE pasa por `supabase--migration` + aprobación). En esta sesión no se ha emitido aún esa migración por:

1. Política conservadora: si Fase 2 P2 está bloqueada (§1.4), aplicar sólo P1-w2 dejaría la nocturna parcial y desincronizada con el plan ("ejecutar P1+P2 en paralelo").
2. El snapshot CSV ya está listo y la migración acotada se puede preparar en el próximo turno bajo aprobación explícita.

---

## 2. Lo que SE entrega en este turno

| Artefacto | Estado |
|---|---|
| Confirmación Fase 1 viva en runtime | ✅ |
| Reconciliación de scope (1.259 IDs siguen vigentes, deriva 0) | ✅ |
| Reporte ejecutivo (este archivo) | ✅ |
| Diagnóstico de gates | ✅ |

## 3. Lo que NO se ha hecho (y por qué)

- ❌ **0 IA invocada.** Gate §1.4 bloquea antes de despachar.
- ❌ **0 UPDATE / INSERT / DELETE.** Ningún registro de `locations` modificado.
- ❌ **0 llamada a Nominatim.**
- ❌ **0 enrichment_jobs creado.**
- ❌ **0 migration emitida** (P1-w2 diferido hasta resolver §1.4).
- ❌ **Sin tocar** `computePoiMaturity`, marker fill, canon, paleta, `package.json`, `app-version`, README.
- ❌ **Sin bump.**

## 4. Distribuciones post-run

Idénticas a pre-run (no ha habido escrituras). Se reportan como invariante:

### 4.1 A/B/C/D (proxy sobre cubos observables)

| Root | n |
|---|---:|
| A (root_a_missing_identity / coords inválidas / not_approved / deleted) | 0 sobre `is_approved=true` (ya excluidos) |
| B (canon_gap + geo_partial + country_id null + enriched-sin-region) | 83 |
| C (geo_health broken/stale/empty/hardError) | 9 |
| D candidatos auto-enrich (`eligibleForAutoEnrich=true`) | **1.259** |
| D ya enriquecidos (`already_enriched`) | 3.750 |
| Fixtures/locks excluidos | 340 (338 sandbox + 2 unresolved) |

### 4.2 POI-0..POI-10

No reevaluado en este turno: `computePoiMaturity` es invariante (no se ha tocado) y no se han escrito enrichments, por lo que la distribución es idéntica a la última medición de Fase 0. No se incluye snapshot nuevo para no inducir falsa actividad.

### 4.3 D pendientes restantes

**1.259** (idéntico al frozen scope; 0 procesados).

### 4.4 B pendientes restantes

**83** (idéntico). Sub-causa:

- canon_gap: 76
- enriched-no-region: 6 + 1 plan-conforme
- geo_partial: 7
- country_id null: 3

## 5. Failures y skips por causa

N/A — no se ha iniciado ejecución, no hay failures ni skips IA-side. El único "skip" agregado es el **gate §1.4** que bloquea los 1.259 IDs en bloque.

## 6. Confirmación de invariantes

- ✅ `computePoiMaturity`: intacto.
- ✅ Marker fill / paleta: intacta.
- ✅ Canon (`TERRITORIAL_CANON`): intacto.
- ✅ A/C: no tocados.
- ✅ B no resueltos: no tocados.
- ✅ Sandbox owner: no tocado.
- ✅ Fase 1 gates activos (verificado por revisión de `batch-enrich/index.ts` líneas 1-4 + `enrich-location/index.ts` líneas 1758-1790).
- ✅ Sin Nominatim.
- ✅ Sin bump.
- ✅ Tests Fase 1 verdes (no re-ejecutados; última corrida `21/21 ok`).

## 7. Rollback disponible

- **Fase 1 (cableado):** revert de 2 edits en `index.ts`, conservar `_shared/poi-identity-root-status.ts` + test. Re-deploy. No afecta datos.
- **Fase 2 (este turno):** N/A — no se ha escrito nada, no requiere rollback.
- **Snapshots CSV:** conservados intactos en `/mnt/documents/poi-nightly-batch/`.

## 8. Siguiente acción recomendada

El usuario debe elegir explícitamente UNA de estas tres rutas para desbloquear Fase 2. Sin esa decisión, Fase 2 permanece detenida.

### Ruta A — Orquestador server-side dedicado (recomendada)

1. PR de código (sin datos): nueva edge function `enrich-batch-orchestrator` que:
   - acepta una lista de IDs (POST JSON o lectura de tabla de cola),
   - itera chunks de 25 con `await sleep(60_000)` entre chunks,
   - despacha cada POI vía `enrich-location` (que ya revalida just-before-write),
   - registra success/fail/skip + motivo en una tabla `enrichment_batch_runs`,
   - corre en background con `EdgeRuntime.waitUntil` (sin timeout sandbox).
2. Tests del orquestador contra el CSV congelado (debe filtrar exactamente 1.259 → D, 0 → no-D).
3. Re-aprobación para disparar el run real.

**Ventaja:** alineado con plan §2.4–§2.7, observable, pausable, idempotente.
**Coste:** 1 PR de código + tests.

### Ruta B — Particionar por documento y reutilizar `batch-enrich`

1. Agrupar los 1.259 IDs por `document_id` en el sandbox (~N documentos).
2. Emitir N llamadas `batch-enrich?action=start` secuenciales (1 documento a la vez), respetando pausa 60 s entre documentos.
3. El gate de Fase 1 ya filtra silenciosamente cualquier no-D por documento.

**Ventaja:** sin código nuevo.
**Coste:** rompe el orden GB→US→IE del plan (orden por documento ≠ orden por país), N jobs en `enrichment_jobs` (ruido operativo), y cada job de >25 POIs internamente itera distinto del chunk del plan.

### Ruta C — Diferir Fase 2 P2 y aplicar sólo P1-w2

1. Emitir migración acotada con los 11 UPDATEs (snapshot CSV adjunto como rollback).
2. Fase 2 P2 queda explícitamente diferida hasta Ruta A o B.

**Ventaja:** cierra al menos los 11 data-fixes pendientes esta noche.
**Coste:** P2 sigue sin avanzar.

---

## 9. Stop condition documentada (textual)

> Cross-document batch orchestrator with chunk=25 + pause=60s is required by plan §2.4–§2.7 but does not exist in runtime. `batch-enrich` is document-scoped and cannot process the 1,259 cross-document frozen list as a single chunked, paused pipeline. Wall-clock requirement (3–5h server-side) exceeds the sandbox single-call window (600s) and is unsafe to chain across 30+ tool calls. Halting per user instruction: "Si falla cualquier gate o stop condition: detener y reportar, sin reintentar ciegamente."

— Fin del reporte —
