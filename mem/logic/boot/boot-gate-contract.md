---
name: Boot gate (PR-BOOT-PERF-1)
description: Pollers secundarios (enrichment getActive, EnrichmentLane, EnrichmentProgressIndicator) deben diferirse al boot-gate antes de armar fetch/setInterval.
type: constraint
---

# Boot gate — pollers diferidos

## Regla DURA

Cualquier `setInterval` o fetch periódico que NO sea crítico para pintar
el mapa DEBE esperar al boot-gate antes de armar su primer ciclo:

```ts
import { awaitMapInteractive } from '@/shared/boot/boot-gate';

useEffect(() => {
  let cancelled = false;
  let interval: number | null = null;
  awaitMapInteractive({ idle: true }).then(() => {
    if (cancelled) return;
    fetchOnce();
    interval = window.setInterval(fetchOnce, 2000);
  });
  return () => {
    cancelled = true;
    if (interval != null) window.clearInterval(interval);
  };
}, [deps]);
```

## Por qué

Medición real (Frankie, 5100 POIs, `?perf=1`):
- `FloatingToolbar` lanzaba `supabase.functions.invoke('batch-enrich', { action:'getActive' })`
  **una vez por documento, cada 2 s**, desde t≈0.9 s. Con 22 documentos = 22 POSTs
  paralelos cada ciclo. Saturaba el pool HTTP/2 y retrasaba las páginas del catálogo.
- Mismo patrón en `EnrichmentProgressIndicator` y `EnrichmentLane`.

Ver `docs/audits/boot-performance-measure-1.md` y dossier after en
`docs/audits/boot-performance-after-pr1.md`.

## Helpers únicos

- `awaitMapInteractive({ idle?: boolean })` — espera a que `useDatabaseSync`
  haya aplicado el snapshot `mine` y (opcionalmente) a un `requestIdleCallback`.
- `awaitBootPhase('bootComplete' | 'idleAfterBoot')` — para consumidores muy diferidos.
- `notifyMapInteractive()` / `notifyBootComplete()` — SoT en `use-database-sync.ts`.
  No llamar desde otros sitios.

## Concurrencia defensiva

Aunque se difiera, fan-outs sobre N documentos NO deben lanzar N POSTs simultáneas.
Envolver con `createConcurrencyPool(4)` (`src/shared/boot/concurrency-pool.ts`)
y `pool.run(() => invoke(...))`.

## Prohibido

- Re-introducir `setInterval(fetchJobStatus, 2000)` sin gate.
- Fan-out sin pool sobre `supabase.functions.invoke('batch-enrich', { action:'getActive' })`.
- Mover `notifyMapInteractive()` antes del `applyCatalogSnapshot('mine')`.
