/**
 * ETA helpers for the unified geocoding job.
 * Pure functions — no React, no side effects.
 */

export interface EtaInput {
  startedAt: number | null;
  totalProcessed: number;
  remaining: number;
  /** Optional reference time (defaults to Date.now()). Useful for tests. */
  now?: number;
}

export interface EtaResult {
  elapsedMs: number;
  ratePerMin: number;
  /** null while we lack signal (<5s elapsed or <2 points done). */
  etaMs: number | null;
  finishAt: Date | null;
}

const MIN_ELAPSED_MS = 5_000;
const MIN_SAMPLES = 2;

export function computeEta({ startedAt, totalProcessed, remaining, now }: EtaInput): EtaResult {
  const ts = now ?? Date.now();
  if (!startedAt) {
    return { elapsedMs: 0, ratePerMin: 0, etaMs: null, finishAt: null };
  }
  const elapsedMs = Math.max(0, ts - startedAt);
  const elapsedMin = elapsedMs / 60_000;
  const ratePerMin = elapsedMin > 0 ? totalProcessed / elapsedMin : 0;

  const enoughSignal = elapsedMs >= MIN_ELAPSED_MS && totalProcessed >= MIN_SAMPLES && ratePerMin > 0;
  if (!enoughSignal || remaining <= 0) {
    return { elapsedMs, ratePerMin, etaMs: null, finishAt: null };
  }

  const etaMs = Math.round((remaining / ratePerMin) * 60_000);
  const finishAt = new Date(ts + etaMs);
  return { elapsedMs, ratePerMin, etaMs, finishAt };
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
  if (m > 0) return `${m} min ${String(s).padStart(2, '0')} s`;
  return `${s} s`;
}

export function formatClock(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatRate(perMin: number): string {
  if (!Number.isFinite(perMin) || perMin <= 0) return '—';
  if (perMin >= 10) return `${Math.round(perMin)} pts/min`;
  return `${perMin.toFixed(1)} pts/min`;
}
