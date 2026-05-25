# PR-BOOT-PERF-1 — Dossier after / before

Fecha: 2026-05-25
Sesión: Frankie (catálogo ~5100 POIs, 22 documents, 4 profiles)
Flag: `?perf=1` (instrumentación opt-in `src/shared/perf/boot-perf.ts`)
Build: v1.5.12 + v1.5.13 (este PR)

## 1. Resumen ejecutivo

PR-BOOT-PERF-1 elimina el storm de `batch-enrich` durante el arranque y
limita el fan-out de `getActive` a 4 in-flight. Tras la segunda corrida
limpia:

- El catálogo deja de competir por sockets HTTP/2 con `batch-enrich`.
- `map:interactive` se alcanza antes del primer POST de enrichment.
- El gap `social:apply` permanece (no es objetivo de PR1 — queda para
  diagnóstico posterior).
- El catálogo secuencial sigue consumiendo ~11s, lo que confirma que el
  cuello restante NO es contención sino paginación serializada.
  → habilita abrir **PR-BOOT-PERF-2** (paginación concurrente ventana 3).

## 2. Métricas before / after

| Fase                                  | Antes (PR-BOOT-PERF-MEASURE-1) | Después (PR-BOOT-PERF-1) | Δ |
|---------------------------------------|--------------------------------|--------------------------|---|
| `auth:ready` → `documents:loaded`     | ~0.6 s                         | ~0.6 s                   | =  |
| `documents:loaded` → `profiles:loaded`| ~0.2 s                         | ~0.2 s                   | =  |
| `catalog:query:start` → `catalog:query:end` (5100 / 6 páginas) | **11.0 s** | **10.8–11.2 s** | ≈ = |
| `catalog:mapped` (mapping cliente)    | 13 ms                          | 12–15 ms                 | =  |
| `catalog:apply:mine`                  | 1 ms                           | 1 ms                     | =  |
| `map:interactive` (desde t0)          | 11.93 s                        | 11.8–12.0 s              | =  |
| `social:apply:scheduled` → `social:apply:end` (gap) | **~6.2 s** | **~6.0–6.4 s** | ≈ = |
| `boot:complete` (total)               | **19.0 s**                     | **~18.5 s**              | ≈ = |
| **Inicio real de `batch-enrich`**     | **t ≈ 0.9 s**                  | **t ≈ 12.5–14 s**        | **+11.6 s** |
| **Pico de POSTs `batch-enrich` concurrentes durante boot (t<12s)** | **>100** | **0** | **−100%** |
| **POSTs `getActive` concurrentes (fan-out por documento)** | 22 simultáneos | ≤ 4 simultáneos | clamp duro |

### Lectura

- El **número total de segundos** del boot apenas cambia (~−0.5 s). Eso
  es esperado: PR1 no acelera trabajo, sólo lo reordena para que el
  catálogo y el primer paint dejen de competir por el pool HTTP/2.
- Lo que SÍ cambia drásticamente es **cuándo** ocurre `batch-enrich`:
  movido de t≈0.9 s (pleno arranque) a t≈12.5 s (post-interactive +
  idle). Confirmado en la consola: el primer mark
  `boot-gate:map-interactive` precede a cualquier POST `/functions/v1/batch-enrich`.
- El **gap `social:apply`** persiste ~6 s. Es independiente de la red
  (no hay tráfico durante esa ventana). Queda fuera de PR1.

## 3. Validación en consola (`?perf=1`)

Marks esperados en orden, observados en la segunda corrida:

```text
boot:start
auth:ready
documents:loaded            { docs: 22 }
profiles:loaded             { profiles: 4 }
catalog:query:start
catalog:query:page          { page: 1, ms: ~700 }
... (× 6)
catalog:query:end           { rows: 5100, ms: ~11000 }
catalog:mapped              { ms: ~13 }
catalog:apply:mine
boot-gate:map-interactive   ← gate flips
map:interactive
social:apply:scheduled
social:apply:start
social:apply:end            { ms: ~6200 }
boot-gate:boot-complete
boot:complete
boot-gate:idle-after-boot   ← consumidores secundarios despiertan
```

Network panel filtrado por `batch-enrich`:

- Antes: primer POST en t≈900 ms, >100 in-flight durante la descarga
  del catálogo.
- Después: primer POST en t≈12.5–14 s, siempre POSTERIOR a
  `boot-gate:map-interactive`. Concurrencia observada: estable bajo el
  límite del pool (≤4 simultáneos para `getActive`).

## 4. Cuello de botella residual

Confirmado en la segunda corrida:

1. **Paginación serializada del catálogo** sigue en ~11 s sin storm.
   No es DB (cada página 200–700 ms reales) — es la latencia
   acumulada de las 6 páginas en serie.
   → **Justifica abrir PR-BOOT-PERF-2**: ventana de concurrencia 3
   sobre las páginas del catálogo. Objetivo: 11 s → ~4 s.
2. **Gap `social:apply` ~6 s**. Sin tráfico de red durante esa ventana.
   Sospecha: microtask storm al insertar 4739 POIs en el store o al
   recomputar índices. Requiere instrumentación adicional dentro de
   `applyCatalogSnapshot('social')` — fuera del alcance de PR1.

## 5. Contract test

Añadido `src/test/boot-gate-contract.test.ts`. Garantiza:

- Boot-gate sólo avanza monótonamente (`cold` → `mapInteractive` →
  `bootComplete` → `idleAfterBoot`).
- `awaitMapInteractive({ idle: true })` NO resuelve mientras la fase
  sea `cold` y SÍ resuelve tras `notifyMapInteractive()` + tick de idle.
- `notifyBootComplete()` transita a `idleAfterBoot` en ≤ tick de idle.
- `createConcurrencyPool(4)` jamás supera 4 tareas in-flight, incluso
  bajo presión (20 tareas encoladas).

Si un futuro consumidor lanza un poller sin gate o eleva el pool por
encima de 4 sin justificación, el test rojo lo bloquea.

## 6. Qué NO se tocó en este PR (por contrato)

- Paginación del catálogo (queda para PR-BOOT-PERF-2).
- Queries y RLS del catálogo.
- Marker logic / clustering / culling.
- Social apply logic (gap de 6 s pendiente de diagnóstico).
- UX de loading (`CatalogLoadingCard`).

## 7. Siguiente paso recomendado

Abrir **PR-BOOT-PERF-2 — Paginación concurrente del catálogo**:

- Ventana de concurrencia 3 sobre `v_locations_resolved`.
- Reutilizar `createConcurrencyPool` ya existente.
- Mantener orden estable del snapshot.
- Objetivo medible: `catalog:query:end − catalog:query:start` ≤ 5 s
  con sesión Frankie (5100 POIs).

PR2 y PR1 NO se mezclan: PR1 cierra aquí.
