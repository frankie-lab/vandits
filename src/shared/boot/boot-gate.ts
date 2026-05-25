// PR-BOOT-PERF-1 — Boot-gate único.
//
// Mide y publica las fases del arranque para que consumidores secundarios
// (pollers de enrichment, refrescos opcionales, etc.) puedan diferir trabajo
// no crítico hasta DESPUÉS de que el mapa sea interactivo y haya un hueco
// de idle.
//
// Estados (monótonos, sólo avanzan):
//   - 'cold'           → app recién montada, catálogo aún no aplicado
//   - 'mapInteractive' → snapshot 'mine' aplicado y mapa pintando
//   - 'bootComplete'   → applyCatalogSnapshot('social') terminó
//   - 'idleAfterBoot'  → tras bootComplete + requestIdleCallback / fallback
//
// API:
//   notifyMapInteractive() / notifyBootComplete()
//     → llamados por `useDatabaseSync` en los marks correspondientes.
//   awaitMapInteractive({ idle }) → Promise<void>
//     → resuelve cuando se alcanza ese estado. Si `idle:true`, espera además
//       a `requestIdleCallback` (o setTimeout 250ms si no existe).
//
// No tiene side effects fuera del bus interno. Pensado para que consumidores
// hagan `await awaitMapInteractive({ idle: true })` antes del primer fetch
// caro y antes de armar setInterval.

import { bootMark } from '@/shared/perf/boot-perf';

export type BootPhase = 'cold' | 'mapInteractive' | 'bootComplete' | 'idleAfterBoot';

const order: Record<BootPhase, number> = {
  cold: 0,
  mapInteractive: 1,
  bootComplete: 2,
  idleAfterBoot: 3,
};

let current: BootPhase = 'cold';
const waiters: Array<{ target: BootPhase; resolve: () => void }> = [];

function setPhase(next: BootPhase) {
  if (order[next] <= order[current]) return;
  current = next;
  // Drain anyone waiting on this phase or earlier.
  for (let i = waiters.length - 1; i >= 0; i--) {
    if (order[waiters[i].target] <= order[next]) {
      waiters[i].resolve();
      waiters.splice(i, 1);
    }
  }
}

export function getBootPhase(): BootPhase {
  return current;
}

export function awaitBootPhase(target: BootPhase): Promise<void> {
  if (order[current] >= order[target]) return Promise.resolve();
  return new Promise<void>((resolve) => {
    waiters.push({ target, resolve });
  });
}

export function awaitMapInteractive(opts?: { idle?: boolean }): Promise<void> {
  const idle = opts?.idle === true;
  return awaitBootPhase('mapInteractive').then(() => {
    if (!idle) return;
    return new Promise<void>((resolve) => {
      const ric = (globalThis as any).requestIdleCallback as
        | ((cb: () => void, opts?: { timeout?: number }) => number)
        | undefined;
      if (typeof ric === 'function') {
        ric(() => resolve(), { timeout: 1500 });
      } else {
        setTimeout(resolve, 250);
      }
    });
  });
}

export function notifyMapInteractive(): void {
  if (order[current] >= order.mapInteractive) return;
  bootMark('boot-gate:map-interactive');
  setPhase('mapInteractive');
}

export function notifyBootComplete(): void {
  if (order[current] >= order.bootComplete) return;
  bootMark('boot-gate:boot-complete');
  setPhase('bootComplete');
  // Schedule transition to idleAfterBoot via rIC / fallback so secondary
  // consumers gated on 'idleAfterBoot' wake up shortly after.
  const ric = (globalThis as any).requestIdleCallback as
    | ((cb: () => void, opts?: { timeout?: number }) => number)
    | undefined;
  const flip = () => {
    bootMark('boot-gate:idle-after-boot');
    setPhase('idleAfterBoot');
  };
  if (typeof ric === 'function') {
    ric(flip, { timeout: 2000 });
  } else {
    setTimeout(flip, 400);
  }
}

// Test-only reset. Not exported in production paths.
export function _resetBootGateForTests(): void {
  current = 'cold';
  waiters.length = 0;
}
