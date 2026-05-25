// PR-BOOT-PERF-DISCOVERY-1 — Instrumentación opt-in del arranque.
//
// Activación:
//   - URL flag:        `?perf=1`
//   - localStorage:    `localStorage.setItem('debugBoot', '1')`
//
// En producción normal NO emite logs. Cuando está activo:
//   - `bootMark(name, meta?)` deja un punto en el timeline (performance.mark + log).
//   - `bootMeasure(name, from, to?, meta?)` calcula duración entre dos marks.
//   - `bootSummary()` imprime una tabla agregada `phase | start | end | duration | meta`.
//
// No tiene efectos colaterales fuera de `console` y `performance.mark/measure`.
// Pensado para diagnóstico — no es API pública del runtime.

type Meta = Record<string, unknown> | undefined;

interface BootMark {
  name: string;
  t: number; // ms desde performance.timeOrigin
  meta?: Meta;
}

interface BootMeasure {
  name: string;
  from: string;
  to: string;
  duration: number;
  meta?: Meta;
}

const marks: BootMark[] = [];
const measures: BootMeasure[] = [];
let enabled: boolean | null = null;

function detectEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('perf') === '1') return true;
  } catch { /* ignore */ }
  try {
    if (window.localStorage?.getItem('debugBoot') === '1') return true;
  } catch { /* ignore */ }
  return false;
}

export function isBootPerfEnabled(): boolean {
  if (enabled == null) enabled = detectEnabled();
  return enabled;
}

export function bootMark(name: string, meta?: Meta): void {
  if (!isBootPerfEnabled()) return;
  const t = typeof performance !== 'undefined' ? performance.now() : Date.now();
  marks.push({ name, t, meta });
  try { performance.mark(`boot:${name}`); } catch { /* ignore */ }
  // eslint-disable-next-line no-console
  console.log(`[boot] ${name}`, meta ?? '');
}

export function bootMeasure(name: string, from: string, to?: string, meta?: Meta): void {
  if (!isBootPerfEnabled()) return;
  const fromMark = marks.find((m) => m.name === from);
  const toMark = to ? marks.find((m) => m.name === to) : marks[marks.length - 1];
  if (!fromMark || !toMark) return;
  const duration = toMark.t - fromMark.t;
  measures.push({ name, from, to: toMark.name, duration, meta });
  // eslint-disable-next-line no-console
  console.log(`[boot:measure] ${name} = ${duration.toFixed(1)}ms`, meta ?? '');
}

export function bootSummary(): void {
  if (!isBootPerfEnabled()) return;
  if (marks.length === 0) return;
  const t0 = marks[0].t;
  const rows = marks.map((m, i) => {
    const prev = i === 0 ? m.t : marks[i - 1].t;
    return {
      phase: m.name,
      tStart: `${(m.t - t0).toFixed(0)}ms`,
      sincePrev: `${(m.t - prev).toFixed(0)}ms`,
      meta: m.meta ? JSON.stringify(m.meta) : '',
    };
  });
  // eslint-disable-next-line no-console
  console.groupCollapsed(`[boot] timeline (${marks.length} marks, total ${(marks[marks.length - 1].t - t0).toFixed(0)}ms)`);
  // eslint-disable-next-line no-console
  console.table(rows);
  if (measures.length > 0) {
    // eslint-disable-next-line no-console
    console.table(measures.map((m) => ({
      name: m.name,
      duration: `${m.duration.toFixed(1)}ms`,
      from: m.from,
      to: m.to,
      meta: m.meta ? JSON.stringify(m.meta) : '',
    })));
  }
  // eslint-disable-next-line no-console
  console.groupEnd();
}

// Expose a tiny global for ad-hoc inspection from DevTools when enabled.
if (typeof window !== 'undefined' && isBootPerfEnabled()) {
  (window as unknown as Record<string, unknown>).__bootPerf = { marks, measures, bootSummary };
}
