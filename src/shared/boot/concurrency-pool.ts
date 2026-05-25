// PR-BOOT-PERF-1 — Pool de concurrencia mínimo.
//
// Limita cuántas promises de un mismo grupo pueden estar in-flight a la vez.
// Pensado para envolver fan-outs de `supabase.functions.invoke(...)` que de
// otro modo lanzan N requests simultáneas y saturan el pool HTTP/2.
//
// Uso:
//   const pool = createConcurrencyPool(4);
//   const results = await Promise.all(items.map((it) => pool.run(() => doIt(it))));
//
// El pool es FIFO y no tiene timeout — la única garantía es "≤N tareas
// in-flight simultáneamente".

export interface ConcurrencyPool {
  run<T>(task: () => Promise<T>): Promise<T>;
  readonly inFlight: number;
  readonly queued: number;
}

export function createConcurrencyPool(limit: number): ConcurrencyPool {
  if (!Number.isFinite(limit) || limit < 1) {
    throw new Error(`createConcurrencyPool: limit must be >= 1, got ${limit}`);
  }
  let active = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    if (active >= limit) return;
    const wake = queue.shift();
    if (wake) wake();
  };

  const pool: ConcurrencyPool = {
    get inFlight() { return active; },
    get queued() { return queue.length; },
    run<T>(task: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const exec = () => {
          active++;
          task()
            .then(resolve, reject)
            .finally(() => {
              active--;
              next();
            });
        };
        if (active < limit) {
          exec();
        } else {
          queue.push(exec);
        }
      });
    },
  };
  return pool;
}
