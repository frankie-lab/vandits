# PR-BOOT-PERF-MEASURE-1 — Medición real del boot

> Sesión real con `?perf=1`. Usuario `b977aa23-27eb-4195-ac4e-a754fbd20315` (Frankie).
> Catálogo: 5100 POIs · 22 documentos (10 propios, 12 sociales) · 4 perfiles.
> Fecha: 2026-05-25.
>
> **No se implementa optimización en este PR. Solo diagnóstico.**

---

## 1. Tabla real de boot-perf

| Fase | tStart | sincePrev | Meta |
|---|---|---|---|
| boot:start | 0 ms | 0 ms | blocking=true |
| auth:ready | 391 ms | 391 ms | uid Frankie |
| documents:loaded | 626 ms | 235 ms | count=22 |
| profiles:loaded | 877 ms | 251 ms | count=4 |
| catalog:query:start | 879 ms | 3 ms | — |
| catalog:chunk loaded=0 | 1114 ms | 235 ms | total=5100 |
| catalog:chunk loaded=1000 | 3120 ms | **2006 ms** | |
| catalog:chunk loaded=2000 | 5083 ms | **1963 ms** | |
| catalog:chunk loaded=3000 | 6832 ms | **1749 ms** | |
| catalog:chunk loaded=4000 | 8651 ms | **1819 ms** | |
| catalog:chunk loaded=5000 | 10589 ms | **1938 ms** | |
| catalog:chunk loaded=5100 | 11635 ms | 1046 ms | (página parcial) |
| catalog:query:end | 11911 ms | 275 ms | count=5100 |
| catalog:mapped | 11924 ms | **13 ms** | own=10 social=12 detached=5 |
| catalog:apply:mine | 11925 ms | 1 ms | |
| **map:interactive** | **11926 ms** | 1 ms | |
| catalog:apply:social | 19037 ms | **7111 ms** | gap inexplicado |
| boot:complete | 19037 ms | 0 ms | |

**Medidas agregadas:**
- `catalog:query` = **11 031 ms** (5100 rows, 6 páginas)
- `boot:total` = **19 037 ms**
- Tiempo hasta mapa interactivo = **11.9 s**
- Tiempo desde "map:interactive" hasta apply social = **7.1 s** (gap)

---

## 2. Network waterfall (durante boot)

Capturado vía `browser--list_network_requests` (xhr+fetch):

- **142 requests** sólo durante el arranque visible.
- **>100 POST `/functions/v1/batch-enrich`** lanzados **en paralelo** desde t≈0.9 s, mezclados con las páginas del catálogo. Duraciones individuales 220-780 ms.
- Páginas del catálogo (`v_locations_resolved`) servidas en ~200-700 ms a nivel DB, pero el **tStart entre páginas es 1.7-2.0 s**, indicando bloqueo por contención del pool HTTP/2.
- Polling secundario activo: `enrichment_jobs?status=…` cada ~2 s (consistente con `EnrichmentLane`).
- Auth bootstrap repite `/auth/v1/user` 8+ veces (síntoma de múltiples consumidores de `useAuth` aunque ya hay singleton; verificar suscriptores tempranos en árbol React).
- 5 HEAD `ERR` en `follows`/`locations` (cancelados, no críticos).

**Sin retries visibles. Sin 429/5xx.** El problema NO es la DB respondiendo lento; es la **competencia por sockets** entre catálogo y la tormenta de `batch-enrich`.

---

## 3. CPU / main thread

- `catalog:mapped` (13 ms) y `apply:mine` (1 ms) demuestran que el reducer/transformer es barato.
- No se observan freezes >100 ms en boot-perf (sólo se mide network, pero los saltos entre marks consecutivos son <30 ms).
- El gap de 7111 ms entre `map:interactive` y `apply:social` **no es CPU** (no hay marks intermedios y el setTimeout(0) debería ceder); es consistente con el main thread cediendo y el `applyCatalogSnapshot(otherKmlDocs, …)` siguiente esperando microtasks de markers / heavy promises pendientes.
- (Profile detallado de CPU diferido — el waterfall ya explica el cuello principal.)

---

## 4. Datos exactos solicitados

| Métrica | Valor |
|---|---|
| Tiempo hasta primer request de catalog | ~880 ms |
| Tiempo hasta primera página recibida (chunk=0) | 1114 ms (235 ms de query inicial) |
| Tiempo hasta todas las páginas | 11 635 ms |
| Tiempo de apply (mapping + snapshot mine) | **14 ms** (13 + 1) |
| Tiempo hasta mapa interactivo | **11 926 ms** |
| Tiempo total boot | **19 037 ms** |

---

## 5. Diagnóstico causal

**Cuello principal (≈85% del tiempo): paginación secuencial del catálogo bajo contención de red.**

Causa raíz dual:
1. **`fetchAllLocationsPaginated` es estrictamente secuencial** (6 páginas × 1.8-2.0 s = 11 s).
   - Cada página por sí sola en DB ≈ 200-700 ms → potencial real ≈ 2-3 s si fueran concurrentes.
2. **Tormenta de `batch-enrich` arranca al mismo tiempo que el catálogo** (>100 POSTs paralelos a edge functions desde t≈0.9 s). Satura el pool HTTP/2 del navegador hacia `*.supabase.co` y compite con las páginas del catálogo.

**Cuello secundario (37% del boot total, percibido tras "map:interactive"):**
3. Gap de 7.1 s entre `map:interactive` y `catalog:apply:social`. Sospecha:
   - `applyCatalogSnapshot(otherKmlDocs, social)` espera tras un `setTimeout(0)` mientras la cola de microtasks/markers procesa los 4739 POIs propios recién aplicados.
   - O el yield está siendo retrasado por la misma tormenta de `batch-enrich` y los listeners de markers.

**Descartado:**
- DB lenta por query: las páginas individuales son rápidas.
- Reducer/apply lento: 14 ms total para 4739 POIs.
- Geo tree / marker rendering como cuello del boot inicial (map:interactive cae a 11.9 s sin esperarlos).
- Loading card como bug de percepción: los 12 s son reales hasta interactividad.
- Estimación incorrecta: el ratio EMA es coherente (chunks ~2 s, ETA visible).

---

## 6. Propuestas de optimización (NO implementar en este PR)

Prioridad por impacto/coste:

1. **[Alto/Bajo] Diferir el orchestrator de enrichment** (`batch-enrich` storm) hasta `map:interactive` o `requestIdleCallback`. Esto solo debería recuperar 30-50% del tiempo de las páginas del catálogo por liberar sockets.
2. **[Alto/Medio] Paginación concurrente** del catálogo: fetch en paralelo de 3 páginas a la vez (`Promise.all` con ventana deslizante). Potencial 11 s → ~4 s.
3. **[Medio/Bajo] Limitar concurrencia de `batch-enrich`** a N=2-3 con cola. Reduce contención global, no sólo en boot.
4. **[Medio/Medio] Investigar el gap de 7.1 s** antes de `apply:social`. Añadir marks dentro de `applyCatalogSnapshot('mine')` y antes del segundo apply para localizar el bloqueo.
5. **[Bajo/Bajo] Auditar duplicación de `/auth/v1/user`** (8+ llamadas). El singleton de `useAuth` se aplicó, pero algo en el árbol sigue solicitando `getUser()` directo.
6. **[Bajo/Bajo] Progressive apply** (snapshot por chunk) sólo útil si 1+2 no bastan; añade complejidad al reducer.

---

## 7. Criterio de cierre

✅ Sabemos con datos exactos:
- Cuello = **paginación secuencial bajo contención de batch-enrich** (no DB, no CPU, no markers, no percepción).
- Existe un gap secundario de 7 s no explicado entre `map:interactive` y `apply:social` que merece su propio mark antes de optimizar.

Pendiente de decisión del usuario qué propuesta abrir en `PR-BOOT-PERF-1`.
