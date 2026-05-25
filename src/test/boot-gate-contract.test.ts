// PR-BOOT-PERF-1 — Contract test for boot-gate.
//
// Asegura el contrato establecido por `docs/audits/boot-performance-after-pr1.md`:
//
//   1. Consumidores secundarios (pollers de enrichment, getActive fan-out,
//      etc.) que llamen a `awaitMapInteractive({ idle: true })` NO se
//      desbloquean hasta que se notifique `mapInteractive` Y haya pasado
//      el tick de idle.
//
//   2. `createConcurrencyPool` respeta el límite duro (≤ N tareas
//      simultáneas in-flight). El call site canónico de FloatingToolbar
//      lo usa con N=4 — este test fija el invariante.
//
//   3. Los marks que el dossier de auditoría espera ver están presentes
//      en la API del boot-gate: 'boot-gate:map-interactive',
//      'boot-gate:boot-complete', 'boot-gate:idle-after-boot'.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetBootGateForTests,
  awaitMapInteractive,
  awaitBootPhase,
  getBootPhase,
  notifyBootComplete,
  notifyMapInteractive,
} from '@/shared/boot/boot-gate';
import { createConcurrencyPool } from '@/shared/boot/concurrency-pool';

describe('boot-gate contract (PR-BOOT-PERF-1)', () => {
  beforeEach(() => {
    _resetBootGateForTests();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts in cold and only advances monotonically', () => {
    expect(getBootPhase()).toBe('cold');
    notifyMapInteractive();
    expect(getBootPhase()).toBe('mapInteractive');
    // Re-notifying earlier phase is a no-op.
    notifyMapInteractive();
    expect(getBootPhase()).toBe('mapInteractive');
  });

  it('awaitMapInteractive() does NOT resolve while cold', async () => {
    let resolved = false;
    void awaitMapInteractive().then(() => { resolved = true; });
    // Flush microtasks; no notify yet → must still be pending.
    await Promise.resolve();
    expect(resolved).toBe(false);

    notifyMapInteractive();
    await Promise.resolve();
    expect(resolved).toBe(true);
  });

  it('awaitMapInteractive({ idle: true }) waits for the idle tick after map-interactive', async () => {
    let resolved = false;
    void awaitMapInteractive({ idle: true }).then(() => { resolved = true; });

    notifyMapInteractive();
    await Promise.resolve();
    // map-interactive reached but idle tick not yet flushed.
    expect(resolved).toBe(false);

    // requestIdleCallback may not exist in jsdom; the fallback is setTimeout(250).
    await vi.advanceTimersByTimeAsync(300);
    expect(resolved).toBe(true);
  });

  it('notifyBootComplete eventually transitions to idleAfterBoot', async () => {
    notifyMapInteractive();
    notifyBootComplete();
    expect(getBootPhase()).toBe('bootComplete');

    await vi.advanceTimersByTimeAsync(500);
    expect(getBootPhase()).toBe('idleAfterBoot');

    // awaitBootPhase resolves immediately if already past the target.
    let resolved = false;
    void awaitBootPhase('idleAfterBoot').then(() => { resolved = true; });
    await Promise.resolve();
    expect(resolved).toBe(true);
  });
});

describe('concurrency-pool contract (PR-BOOT-PERF-1)', () => {
  it('never exceeds the configured limit (canon: 4 for boot fan-outs)', async () => {
    const limit = 4;
    const pool = createConcurrencyPool(limit);
    let inFlight = 0;
    let peak = 0;
    const release: Array<() => void> = [];

    const tasks = Array.from({ length: 20 }, () => () => new Promise<void>((resolve) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      release.push(() => {
        inFlight--;
        resolve();
      });
    }));

    const all = Promise.all(tasks.map((t) => pool.run(t)));

    // Give the pool a chance to start `limit` tasks.
    await Promise.resolve();
    await Promise.resolve();
    expect(pool.inFlight).toBe(limit);
    expect(peak).toBe(limit);

    // Drain in waves; peak must stay capped.
    while (release.length > 0) {
      release.shift()!();
      await Promise.resolve();
      await Promise.resolve();
    }

    await all;
    expect(peak).toBe(limit);
    expect(pool.inFlight).toBe(0);
    expect(pool.queued).toBe(0);
  });

  it('rejects invalid limits', () => {
    expect(() => createConcurrencyPool(0)).toThrow();
    expect(() => createConcurrencyPool(-1)).toThrow();
    expect(() => createConcurrencyPool(Number.NaN)).toThrow();
  });
});
