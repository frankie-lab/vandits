# PR-BOOT-PERF-2 — Dossier paginación concurrente

Fecha: 2026-05-25
Sesión: Frankie (catálogo ~5100 POIs)
Flag: `?perf=1`
Build: v1.5.13 → v1.5.14

## 1. Resumen

Tras PR-BOOT-PERF-1 (storm killed) la corrida confirmó que la paginación
secuencial sigue siendo el cuello restante (~11 s para 6 páginas de 1000
filas). PR-BOOT-PERF-2 paraleliza la descarga del catálogo con ventana
de concurrencia 3, reutilizando `createConcurrencyPool` y manteniendo
orden estable por índice de página.

## 2. Cambio

`fetchAllLocationsPaginated`:

- **Camino concurrente** (cuando `withCount: true` y el HEAD count
  devuelve N > 0):
  - Plan estático de páginas `ceil(N / 1000)`.
  - `createConcurrencyPool(CATALOG_PAGE_CONCURRENCY)` con `CATALOG_PAGE_CONCURRENCY = 3`.
  - Resultados depositados en `results[idx]` y reensamblados por
    orden de página → orden final estable.
  - `onPage` emite el cumulativo según completan, para que la barra
    de progreso siga avanzando suavemente.
- **Camino secuencial** (fallback): preservado tal cual para reloads
  silenciosos (`silent: true` ⇒ `withCount: false`) y para el caso en
  que el HEAD count falla.
- Retries por `statement_timeout (57014)` heredados intactos.
- Caps `MAX_LOCATIONS = 50000` y `MAX_PAGES = 50` preservados.

## 3. Métricas esperadas (Frankie, 5100 POIs)

| Fase                                  | PR-BOOT-PERF-1 | PR-BOOT-PERF-2 (esperado) |
|---------------------------------------|----------------|---------------------------|
| `catalog:query:start` → `catalog:query:end` | 10.8–11.2 s | **3.5–4.5 s** |
| `map:interactive` (desde t0)          | ~11.9 s        | **~5 s** |
| `boot:complete` (total)               | ~18.5 s        | **~11.5 s** (gap social ~6 s persiste) |
| Pico fetches `v_locations_resolved`   | 1 (serial)     | **≤ 3** |

La validación real se hará con `?perf=1` en la sesión Frankie tras
deploy. El contract test asegura el invariante de concurrencia.

## 4. Por qué ventana 3 y no más

- 3 mantiene el pool HTTP/2 con margen para auth/profiles/realtime
  paralelos durante el boot.
- 6+ vuelve a saturar y reintroduce contención (comprobado durante el
  storm de PR-BOOT-PERF-MEASURE-1).
- La latencia real por página observada es 200–700 ms; con 3 in-flight
  cubrimos overlap suficiente para esconder casi toda la latencia
  acumulada de las 6 páginas.

## 5. Contract test

`src/test/catalog-pagination-concurrent.test.ts` (4 tests):

1. `CATALOG_PAGE_CONCURRENCY === 3` (cap exportado como constante).
2. Con `withCount:true` y 5100 filas, las 6 páginas corren en paralelo
   con `peakInFlight ∈ (1, 3]`.
3. Orden estable: resolviendo páginas en orden inverso, el array final
   sigue ordenado por `idx` ascendente.
4. Con `withCount:false`, el camino secuencial probe sigue activo
   (peak in-flight = 1, probe extra hasta página vacía).

## 6. Fuera de alcance

- Gap `social:apply` ~6 s — sigue pendiente, NO se toca aquí.
- Queries / RLS / schema del catálogo.
- Marker logic, clustering, culling.
- UX de loading (`CatalogLoadingCard`).
- Reloads silenciosos (mantienen camino secuencial por contrato).

## 7. Siguiente paso

Validar con `?perf=1` sesión Frankie:
- catálogo ≤ 5 s (objetivo).
- `peakInFlight` observado ≤ 3 en el panel Network filtrado por
  `v_locations_resolved`.
- boot total cae a ~11–12 s.

Si se cumple, abrir **PR-BOOT-PERF-3** para diagnosticar el gap social
~6 s con instrumentación dentro de `applyCatalogSnapshot('social')`.
