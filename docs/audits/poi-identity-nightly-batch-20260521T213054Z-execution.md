# POI-Identity Nightly Batch — Execution Report

- **Batch ID:** `20260521T213054Z`
- **UTC start:** 2026-05-21T21:30:54Z
- **Operador:** Lovable agent (sandbox)
- **Plan de referencia:** `docs/audits/poi-identity-p1-p2-parallel-execution-plan.md`
- **Alcance autorizado:** P2 sobre lista final D + P1-w2 (11 POIs data-fix con snapshot).
- **Resultado:** **DETENIDO EN GATE PRE-EJECUCIÓN** — sin UPDATE, sin IA, sin Nominatim, sin bump. Snapshots y scope congelados entregados.

---

## 1. Pre-flight gates ejecutados

### 1.1 Reconciliación 1.271 vs ~1.340 — CERRADA

Snapshot universo (`is_approved=true AND deleted_at IS NULL`):

| Métrica | Valor |
|---|---:|
| Aprobados totales | 5.100 |
| Sin `enriched_data.descripcion` | **1.350** |
| `geo_health='ok'` | 5.081 |
| `geo_health='partial'` (B) | 10 |
| `geo_health ∈ broken/stale_name/empty/hardError` (C) | 9 |
| `country_id IS NULL` | 5 |
| `enrichment_status='in_progress'` | 0 |
| `enrichment_status='unresolved'` | 2 |
| `custom_data.synthetic=true` | 0 |
| `custom_data.under_review=true` | 0 |
| Sandbox owner (`f04b3b95…`) | 338 |

**Descomposición exacta del universo sin descripción (1.350):**

| Cubo | n | Plan dry-run |
|---|---:|---:|
| **INCLUDED_P2** (cola final) | **1.259** | 1.271 |
| `excl_B_canon_gap` | 76 | 86 |
| `excl_B_enriched_no_region` | 6 | 1 |
| `excl_B_partial` | 1 | 7 |
| `excl_C_broken` | 4 | ~5 |
| `excl_sandbox` | 2 | — |
| `excl_unresolved` | 2 | 2 |
| **Σ** | **1.350** | ≈1.340 |

- Diferencia 1.271 vs 1.259 = **−0,9 %**, dentro de la tolerancia ±5 % del plan §0.
- Diferencia agregada 1.340 vs 1.350 = **+0,7 %**, también dentro de tolerancia.
- Origen de la deriva: nuevas importaciones (+B canon-gap KE, EE, LT, LV, …) y migración natural B→D conforme `resolveAllFks` corrió en horas previas.

**Gate 1.1: ✅ PASA.**

### 1.2 Scope P2 congelado

Archivo: `/mnt/documents/poi-nightly-batch/p2-scope-frozen-20260521T213054Z.csv`

- 1.259 filas + cabecera (1.278 líneas wc).
- Orden: `country_code ASC, id ASC` (reproducible).
- Columnas: `id, country_code, name, latitude, longitude, region_id, geo_health, enrichment_status`.
- Filtro aplicado = inclusión §2.2 + exclusiones §2.3 del plan, con dos adaptaciones documentadas:
  - `metadata->>` del plan se mapea a `custom_data->>` (única columna jsonb de flags en `locations`).
  - `TERRITORIAL_CANON` inline = 49 ISO2 efectivos extraídos de `src/shared/geography/territorial-canon.ts` (se omitió `ZZ` por ser placeholder; ningún POI tiene `country_code='ZZ'`).

**Top-25 por país (cola P2 congelada):**

```
GB 387 | US 329 | IE  52 | FR  51 | DE  46 | RO  44 | FI  35 |
MA  27 | NO  26 | PL  24 | HR  22 | IT  21 | GR  20 | TR  20 |
HU  14 | UA  13 | SK  13 | NL  13 | AT  13 | RS  11 | BG  10 |
CZ  10 | IS   8 | CH   8 | SI   7 | … (resto 16 ISO2, ≤5 c/u)
```

- GB+US = 716 POIs ≈ 56,9 % de la cola (vs 53 % proyectado por el plan §2.5; coherente).
- 41 países representados (vs 23 listados en plan; long-tail más larga, no bloquea).

**Gate 1.2: ✅ PASA.**

### 1.3 Snapshot P1-w2

Archivo: `/mnt/documents/poi-nightly-batch/p1-w2-snapshot-20260521T213054Z.csv`

- 17 filas + cabecera. Filtro = `country_id IS NULL OR geo_health='partial' OR region_id IS NULL`, sobre canon.
- Sub-causa breakdown:

| Sub-causa | n hoy | Plan |
|---|---:|---:|
| `geo-partial` | 7 | 7 |
| `country-id-null` | 3 | 3 |
| `enriched-no-region` (con `descripcion`) | **1** | 1 |
| `enriched-no-region (no-desc)` (excluido, no es B real) | 6 | — |
| **P1-w2 plan-conforme** | **11** | **11** |

- Los 11 POIs plan-conforme están exactamente identificados; sus 4 FK previas (`region_id, zone_id, admin3_id, locality_id`) quedan snapshot-eadas en CSV para rollback granular.
- Los 6 `enriched-no-region (no-desc)` NO son B según el contrato (no son POIs enriched sin region; son D-pendientes sin region todavía) y NO entran en P1-w2.

**Gate 1.3: ✅ PASA.**

### 1.4 Confirmación de exclusiones

Verificadas en queries §1.1:

- A (coords 0/0 o sin name): 0 hoy con `is_approved=true` y sin descripción.
- C (broken/stale_name/empty/hardError): 4 excluidos.
- B no resuelto: 76 canon-gap + 6 enriched-no-region + 1 partial = 83 excluidos.
- XK: 0 POIs en el universo `is_approved` actual (3 del plan no aparecen como aprobados hoy; consistente con anexo bloqueado).
- UNKNOWN_CANON: ningún POI con `country_code` fuera de canon entra a P2.
- Sandbox `sandbox-agent@vandits.test`: 2 sin descripción excluidos (los otros 336 sandbox-owned ya tenían descripción o `is_approved=false`).
- A/C explícitamente no autorizados por el usuario: NO se generan acciones sobre ellos.

**Gate 1.4: ✅ PASA.**

---

## 2. Gate bloqueante — STOP CONDITION

### 2.1 Filtro de inclusión/exclusión **NO cableado** en runtime de enrich

Búsqueda en `supabase/functions/enrich-location/index.ts` y `supabase/functions/batch-enrich/index.ts`:

- No existe ninguna referencia a:
  - `root` / `identity_root_status` / A/B/C/D,
  - `custom_data->>'synthetic'` ni `under_review`,
  - exclusión por sandbox uid `f04b3b95-7308-4b74-b3c7-7e819767c5fb`,
  - validación `country_code IN TERRITORIAL_CANON` previa a la llamada IA.
- El plan §6 lo declara explícitamente:
  > "No cabla `enrich-location` con el nuevo filtro (sólo lo documenta)."
- El plan §7 lo lista como aprobación pendiente:
  > "[ ] Aprobar P2 (cablear filtro §2.2 + §2.3 en `enrich-location` o en wrapper de cola)."

**Consecuencia:** disparar `batch-enrich` ahora procesaría POIs sin las exclusiones nuevas (sandbox, synthetic, under_review, root B/C). Eso viola §2.10 (anti re-enrich aún se sostiene, pero §2.3 NO), §4 (riesgos), §6 (lo que el plan NO hace), y la instrucción explícita del usuario "Ejecuta el batch exactamente según el plan".

**Gate 2.1: ❌ FALLA → DETENER.**

### 2.2 P1-w2 también detenido

Aunque el snapshot está listo y los 11 POIs identificados, ejecutar el `backfill-admin-fks` requiere:

1. UPDATE masivo en `locations.{region_id, zone_id, admin3_id, locality_id}` → instrucciones del runtime exigen **migración aprobada por el usuario** para cualquier UPDATE; ninguna autorización de migración recibida en este turno.
2. El plan §1.5.2 exige un `dry-run --dry-run` previo (modo del job) antes del run real; no se ha ejecutado.
3. Política conservadora del usuario: "Si falla cualquier gate o stop condition: detener y reportar, sin reintentar ciegamente." El fallo de §2.1 bloquea también el avance a §2.2 dentro de la misma ventana nocturna.

**Gate 2.2: ⏸ DIFERIDO — snapshot conservado, sin UPDATE.**

---

## 3. Lo que SE entrega en este turno

| Artefacto | Ruta | Estado |
|---|---|---|
| Scope congelado P2 | `/mnt/documents/poi-nightly-batch/p2-scope-frozen-20260521T213054Z.csv` | 1.259 filas |
| Snapshot P1-w2 | `/mnt/documents/poi-nightly-batch/p1-w2-snapshot-20260521T213054Z.csv` | 17 filas (11 plan-conforme + 6 no-B) |
| Reporte de ejecución | `docs/audits/poi-identity-nightly-batch-20260521T213054Z-execution.md` | este archivo |

## 4. Lo que NO se ha hecho (y por qué)

- **No UPDATE / INSERT / DELETE.** Gate §2.1 falló antes de autorización de mutación.
- **No llamada IA / Nominatim.** Cableado de filtros inexistente; ejecutar sin filtro sería violar §6 del plan.
- **No P1-code/canon waves** (w1, w3, w4). No autorizadas por el usuario.
- **No XK.** No autorizado.
- **No `computePoiMaturity`, no marker fill, no paleta, no bump.** No autorizado.
- **No data-fix sin snapshot.** Snapshot listo pero migración no solicitada.

## 5. Acciones recomendadas para la próxima ventana

1. Cablear filtro §2.2 + §2.3 en `enrich-location` o en wrapper `batch-enrich` (PR código, sin datos), incluyendo:
   - rechazo de `owner_user_id = sandbox_uid`,
   - rechazo de `custom_data->>'synthetic'` y `under_review`,
   - validación `country_code ∈ TERRITORIAL_CANON`,
   - lock optimista `enrichment_status='in_progress'` (§2.10).
2. Test del wrapper contra el CSV congelado `p2-scope-frozen-20260521T213054Z.csv` → debe devolver exactamente 1.259 IDs (paridad).
3. Migración acotada para P1-w2: UPDATE de 4 FKs sobre los 11 IDs del snapshot, con rollback CSV adjunto.
4. Re-aprobación del usuario para disparar el batch con filtro cableado.

## 6. Stop condition documentada

> Filter §2.2/§2.3 not wired in `enrich-location` nor `batch-enrich`. Plan §6 says explicitly this nightly batch is not allowed to run without that wiring. Halting per user instruction: "Si falla cualquier gate o stop condition: detener y reportar, sin reintentar ciegamente."

— Fin del reporte —
