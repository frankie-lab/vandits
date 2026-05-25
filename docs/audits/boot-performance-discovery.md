# PR-BOOT-PERF-DISCOVERY-1 — Auditoría de carga inicial

Estado: **discovery only**. No se ha modificado lógica de queries, RLS, markers, clustering, import/export ni enrichment. Sólo:

- Documento de auditoría.
- Utilidad `src/shared/perf/boot-perf.ts` (opt-in `?perf=1` o `localStorage.debugBoot=1`).
- 8 `bootMark` no destructivos en `useDatabaseSync` (mismo lugar donde ya había `console.log`).

Caso medido: usuario Frankie, 5.100 POIs accesibles, preview reporta "Cargando catálogo 1000 / 5100" y estimación de minutos.

---

## 1. Timeline del boot (modelo actual)

```
auth.onAuthStateChange / getSession              [Identity]
        │
        ▼
useDatabaseSync.loadFromDatabase                 [Content]
   ├─ supabase.auth.getUser                      ≈ instant (token local)
   ├─ select documents                           ≈ 1 query, 200ms p50
   ├─ fetchProfiles(in: ownerIds)                ≈ 1 query, 150ms p50
   ├─ fetchAllLocationsPaginated                 ◀── CUELLO DE BOTELLA (ver §3)
   │     onPage × N → updateLoading('db-sync')
   ├─ map + group por documento (CPU, sync)      ≈ 30–80ms para 5100 rows
   ├─ applyCatalogSnapshot('mine')               ≈ 10–30ms (delta merge)
   │     → endLoading('db-sync')  ◀──── map:interactive
   ├─ setTimeout(0) (yield)
   └─ applyCatalogSnapshot('social')             ≈ 10–30ms

En paralelo al boot (gatillado por Index.tsx):
   useRealtimeLocations()       → subscribe postgres_changes per doc
   useLinkedLocationIds()
   usePermissions() / useCapability()
   useV2Flags()
   initSessionCollectionVisibility(userId)
        ├─ collectionService.findByUser
        ├─ Promise.all(loadEntry × N)            ── N peticiones a collection_items
        └─ setupCollectionItemsRealtime
   EnrichmentLane setInterval 2s → enrichment_jobs   (ver §3.2 — bug ya corregido)
   GeocodingLane / ImageRecoveryLane polls
   useAuth → get_my_home + map preferences
```

Fases instrumentadas por `boot-perf.ts` (activar con `?perf=1`):

| phase                  | origen                                  | bloqueante UI |
|------------------------|------------------------------------------|---------------|
| `boot:start`           | useDatabaseSync.loadFromDatabase entrada | sí (cold)     |
| `auth:ready`           | supabase.auth.getUser resuelve           | —             |
| `documents:loaded`     | select documents                         | sí            |
| `profiles:loaded`      | select profiles in (...)                 | sí            |
| `catalog:query:start`  | fetchAllLocationsPaginated empieza       | sí            |
| `catalog:chunk`        | cada página de 1000                      | sí            |
| `catalog:query:end`    | última página                            | sí            |
| `catalog:mapped`       | tras agrupar por doc                     | sí            |
| `catalog:apply:mine`   | applyCatalogSnapshot mine                | sí            |
| `map:interactive`      | endLoading('db-sync') tras mine          | **NO**        |
| `catalog:apply:social` | applyCatalogSnapshot social              | no (yield)    |
| `boot:complete`        | fin                                      | no            |

Salida en consola con `?perf=1`: `console.table` con `phase | tStart | sincePrev | meta` y otra con las `bootMeasure`.

---

## 2. Queries detectadas al inicio

Inspección de `code--read_network_requests` (sesión real, usuario Frankie, 25/05):

| Endpoint                                                             | Origen                          | Frecuencia boot | Coste          |
|----------------------------------------------------------------------|---------------------------------|------------------|----------------|
| `GET /rest/v1/v_locations_resolved?select=*` (range pages × 5)      | useDatabaseSync                 | 5 peticiones    | **alto**       |
| `HEAD /rest/v1/v_locations_resolved?select=id` (count exact)        | fetchAllLocationsPaginated      | 1                | bajo           |
| `GET /rest/v1/documents?select=*`                                   | useDatabaseSync                 | 1                | bajo           |
| `GET /rest/v1/profiles?select=id,display_name,username&in=(...)`     | fetchProfiles                   | 1                | bajo           |
| `GET /rest/v1/locations?select=id,updated_at&updated_at>X`           | use-locations-watchdog (otro hook) | 1             | bajo           |
| `POST /rest/v1/rpc/get_my_home`                                     | useAuth → home prefs            | 1                | bajo           |
| `GET /rest/v1/geocoding_jobs?status=in.(running,canceling)`         | GeocodingLane                   | poll 2s          | bajo           |
| `GET /rest/v1/enrichment_jobs?status=in.(pending,running,paused)`    | EnrichmentLane                  | poll 2s nominal | **alto antes del fix PR-PERF-ENRICHMENT-LANE** (ver §3.2) |
| `GET /rest/v1/collection_items?...` paginado 1000 × N colecciones   | initSessionCollectionVisibility | N peticiones    | medio          |
| `GET /rest/v1/user_owner_color_assignments?...`                      | identity allocator              | 1–2              | bajo           |
| Realtime channels (`user:{uid}`, `public:*`, `collection_items`, `locations`) | varios | múltiples WS open | bajo en boot |

Notas:
- `v_locations_resolved` es una VIEW con `security_invoker` y N joins (admin_areas × continent/country/region/zone/admin3/locality). EXPLAIN ANALYZE para `range(0,999)` → **15ms server-side**.
- Tamaño real medido (`pg_column_size`): 19 MB para los 5100 POIs (`enriched_data` solo ≈10 MB). JSON-sobre-cable: ~6–8 MB por página de 1000.

---

## 3. Cuello de botella real

### 3.1 Carga de catálogo: `fetchAllLocationsPaginated`

`src/domains/content/lib/db-transformers.ts`:

```ts
const PAGE_SIZE = 1000;
while (hasMore && pages < 50) {
  const data = await fetchPageWithRetry(from, to);   // ← await secuencial
  allLocations.push(...data);
  page++;
  onPage(allLocations.length, total);
}
```

Hechos:

- **DB rápido** (15 ms / 1000 filas).
- **Cliente lento**: cada página observada tardaba 20–90 s en sesión real (`paginator` console.logs: page=0 11:22:12 → page=3 11:24:10).
- **No es la DB**: `cloud_status` ACTIVE_HEALTHY, conexiones 25/160, memoria 20 %, sin restarts.
- **No es la red** (per se): 6 MB/página debería tardar < 2 s en una conexión normal.
- **Es contención HTTP/2** contra el mismo `nolmcafkzqwfmpleyfkx.supabase.co`: el resto de pollers (ver §3.2 y §3.3) saturan los streams en paralelo.

Patrón secuencial empeora el efecto: la página N+1 sólo arranca tras recibir la N. Cada espera bloquea la card "Cargando catálogo 1000 / 5100" hasta el siguiente `onPage`.

### 3.2 Poll storm de `enrichment_jobs` (causa raíz reciente — ya arreglada)

`src/shared/progress/EnrichmentLane.tsx` tenía:

```ts
const fetchJobStatus = useCallback(async () => { …; setActiveJob(session); … }, [activeJob, …]);
useEffect(() => {
  fetchJobStatus();
  const id = setInterval(fetchJobStatus, 2000);
  return () => clearInterval(id);
}, [fetchJobStatus]);
```

Ciclo: cada `setActiveJob` cambiaba `activeJob` → recreaba `fetchJobStatus` → `useEffect` re-corre → llama a `fetchJobStatus()` inmediatamente otra vez. Resultado observado en `code--read_network_requests`: **5–6 GET/segundo** a `enrichment_jobs` (timestamps 11:26:51, 11:26:51, 11:26:52, 11:26:53 ×3, 11:26:54).

Esa tormenta saturaba HTTP/2 → las páginas de `v_locations_resolved` (~6 MB cada una) esperaban su turno y tardaban 60–90 s.

Fix aplicado en PR previo (sin alterar este audit): `activeJob` movido a `useRef`, `fetchJobStatus` con deps estables. Polling vuelve a 1 req/2s.

### 3.3 `collection_items` paginado en paralelo

`initSessionCollectionVisibility` → `Promise.all(all.map(loadEntry))` (línea 146). Cada `loadEntry` hace `collectionService.getItems(id)` que pagina internamente de 1000 en 1000. En el peor caso (varias colecciones de miles de items), son N×K GETs concurrentes al mismo host.

`rebuildCatalogMembership` ya se serializó en un PR anterior. `initSessionCollectionVisibility` **no** está serializado: sigue siendo `Promise.all`. Para Frankie (≈8–12 colecciones, varias > 1000 items) son 10–25 GETs concurrentes en el boot, compitiendo con el catálogo.

### 3.4 Mapping cliente

`dbLocationToGeoLocation` × 5100 + agrupación por doc + `applyCatalogSnapshotPure`. Coste total estimado < 80 ms (verificable con `?perf=1` → `catalog:query:end` → `catalog:mapped`). **No es el bottleneck.**

### 3.5 Markers Leaflet

`LocationMap.tsx` líneas 1786–1929: bucle sobre `markerLocations` (viewport-culled en z ≥ 7). Para el viewport inicial (Galicia, z 11) se renderizan típicamente 100–400 markers, no 5100. Cada uno:

- `createCustomIcon` (SVG string).
- `bindTooltip(buildHoverTooltipHtml)`.
- `bindPopup(createPopupContent)` + 3× `getComputedStyle(documentElement)` para `autoPanPadding`.
- `group.addLayer(marker)`.

Coste estimado en viewport: 30–80 ms. **Tampoco es el cuello cuando hay culling activo.** En z ≤ 6 sí se renderizarían todos los `markerLocations`, pero la card bloqueante impide llegar al mapa antes.

### 3.6 ETA "2 min" mostrado en la card

`CatalogLoadingCard.tsx` calcula EMA de items/ms a partir de cada `onPage`. Como cada página entrega 1000 items en un único tick separado por 20–90 s, la EMA da 11–50 items/s → ETA = (total - cargados) / rate → **entre 80 s y 7 min**. La fórmula es correcta; el "2 min" refleja el ritmo real degradado por contención HTTP/2.

---

## 4. Diagnóstico de UI bloqueante

`CatalogLoadingCard` (`src/shared/loading/CatalogLoadingCard.tsx`):

```ts
const shouldShow = !!task && task.blocking === true && !hasDocs;
```

- `blocking = !silent && !storeHadDocs` → en **cold start** SIEMPRE bloquea.
- Cierra al ejecutar `endLoading('db-sync')`, justo tras `applyCatalogSnapshot('mine')`.

Implicación: el mapa no es interactivo hasta que **TODO el catálogo (mine + social)** se haya descargado + mapeado. La fase `mine`/`social` solo splittea la **escritura al store**, no la **descarga**. La carga descarga todo y luego separa.

Acciones bloqueadas mientras la card está visible:
- Pan/zoom del mapa están técnicamente operativos (Leaflet montado), pero la card cubre el centro y `pointer-events-none` en el contenedor + `pointer-events-auto` en la card → es un visual block, no un input block estricto. Aun así percepción = bloqueo.
- Sidebars y top-bar siguen operativos (no están detrás de la card).

---

## 5. Estrategia de carga — opciones (sin implementar)

| Id | Propuesta | Esfuerzo | Riesgo | Ganancia esperada |
|----|-----------|----------|--------|-------------------|
| A  | Cargar primero **viewport inicial** (`latitude/longitude in bounds`) y aplicar snapshot parcial → cerrar card. Resto en background. | medio | bajo (la vista ya está culled en z ≥ 7) | TTFM 1–3 s para el viewport |
| B  | Cargar por **bounds + zoom** con queries on-demand (`moveend` ya tiene `requestSubsetFit`/culling pero no fetch). | alto | medio (RLS + paginación on-demand) | Catálogo siempre pequeño en memoria |
| C  | Paginar en **background paralelo** (sin cerrar HTTP/2 streams a otros consumidores) — necesita primero §3.3. | bajo | bajo | 2-3× wall time |
| D  | **Render progresivo** de markers: aplicar snapshot tras CADA página, no al final. Requiere idempotencia en delta merge (ya la tenemos). | bajo | bajo | Mapa visualmente lleno en cuanto llega la página del viewport |
| E  | **Worker** para `dbLocationToGeoLocation` + grouping. | medio | medio | Innecesario hoy (mapping < 80 ms) |
| F  | **Cache local** (IndexedDB) con `updated_at` watermark → solo descargar deltas. | alto | medio | Boot caliente < 500 ms |
| G  | **Lazy hydration de `enriched_data`**: cargar `select` sin `enriched_data` + `raw_geocode` (las dos columnas que pesan ~12 MB de los 19 MB totales), hidratar bajo demanda al abrir popup. | medio | bajo (helpers ya leen `enrichedData` opcional) | Payload boot −60 %, wall time esperado 1.5–4× |
| H  | Separar `map:interactive` de `catalog:fullyLoaded` explícitamente (la primera ya existe — sólo falta no bloquear con la card). | trivial | bajo | Percepción inmediata: card no bloqueante |

**Quick wins recomendados (cuando se abra PR-BOOT-PERF-1)**:
- (H) Hacer `CatalogLoadingCard` **no bloqueante** (sigue mostrando progreso pero no cubre el mapa). El mapa ya es interactivo desde el primer momento porque `LocationMap` se monta vacío y va recibiendo `applyCatalogSnapshot`.
- (D) Aplicar snapshot por chunk (cada `onPage` empuja al store su rango, no esperar al final).
- (G) Excluir `enriched_data` y `raw_geocode` del `select('*')` del boot. Hidratar al abrir popup (`UnenrichedRecoveryBlock` ya tiene patrón).
- (§3.3) Serializar `Promise.all` de `initSessionCollectionVisibility` igual que ya hicimos con `rebuildCatalogMembership`.

---

## 6. Caso real medido (Frankie, 25/05)

| Síntoma                                              | Confirmación                                                                 |
|------------------------------------------------------|-------------------------------------------------------------------------------|
| Card "Cargando catálogo 1000 / 5100"                | Sí — primer `onPage` llega a los 20–90 s del fetch start.                    |
| ETA "≈ 2 min"                                       | Real al ritmo medido (1000 items / 90 s ≈ 11 items/s → 370 s).               |
| ¿Se queda colgado?                                  | No — el contador sí avanza, sólo que tarda 1–2 min por chunk.                |
| ¿Sigue tras 100 %?                                   | Sí, se cierra card y mapa pinta markers culled del viewport sin más esperas. |
| ¿DB lenta?                                          | No (15 ms / página, healthy).                                                |
| ¿Red lenta?                                         | No por sí sola — saturada por pollers concurrentes (§3.2 confirmado).        |
| Tras fix `EnrichmentLane`                           | Pages bajan a 2–6 s/cada → ETA "≈ 30 s" en sesiones nuevas.                  |

---

## 7. Riesgos

- **Quick win D (snapshot por chunk)** puede disparar re-render de Leaflet 5 veces. El delta merge actual está preparado, pero conviene medir con `?perf=1` antes de mergear.
- **Quick win G (lazy enriched_data)** afecta helpers que leen `enrichedData` síncronamente para clasificar markers (`isPointEnriched`, `getPointVisualState`). Hay que asegurar fallback "no enriquecido" mientras no se hidrate.
- **Quick win H (card no bloqueante)** podría desconcertar si el usuario interactúa con el mapa antes de que carguen sus POIs propios. Mitigación: barra superior persistente (`GlobalLoadingBar`) ya existe.
- **§3.3 (serializar collection_items)** alarga el tiempo de la lista de colecciones pero descongestiona el catálogo. Aceptable: las colecciones no son críticas en TTFM.

---

## 8. Conclusión

El cuello de botella real **NO está** en:

- el motor de DB (15 ms por página),
- el mapping cliente (< 80 ms para 5100 rows),
- el render de markers (culled por viewport),
- el clustering,
- el árbol geográfico (no se construye en cliente — se lee de `v_locations_resolved`).

El cuello de botella real **ESTÁ en**:

1. **Contención HTTP/2** contra Supabase causada por pollers/realtime concurrentes al fetch del catálogo. La causa principal histórica era `EnrichmentLane` haciendo 5–6 req/s (ya corregido).
2. **Estrategia de descarga monolítica** (download-all-then-apply) + paginación secuencial. No hay rendering progresivo ni viewport-first fetch.
3. **Card de carga bloqueante** que mantiene la percepción de "colgado" aunque la app no esté técnicamente bloqueada.

Próximo PR sugerido: `PR-BOOT-PERF-1` con quick wins H + D + §3.3, medido con `?perf=1`. (G) se evalúa después según resultados.
