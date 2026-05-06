// Global loading bus — single source of truth for in-flight operations.
// Real data only: do NOT report fake or simulated progress.
import { useEffect, useState } from 'react';

export type LoadingTask = {
  id: string;
  label: string;
  current?: number;
  total?: number;
  startedAt: number;
  blocking?: boolean;
};

const tasks = new Map<string, LoadingTask>();
const EVENT = 'loading-bus-changed';

function emit() {
  if (typeof window === 'undefined') return;
  // Toggle blocking class
  const anyBlocking = Array.from(tasks.values()).some((t) => t.blocking);
  document.body.classList.toggle('is-blocking-load', anyBlocking);
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function startLoading(
  id: string,
  label: string,
  opts?: { total?: number; blocking?: boolean }
): void {
  tasks.set(id, {
    id,
    label,
    total: opts?.total,
    current: opts?.total != null ? 0 : undefined,
    blocking: opts?.blocking,
    startedAt: Date.now(),
  });
  emit();
}

export function updateLoading(id: string, current: number, total?: number): void {
  const t = tasks.get(id);
  if (!t) return;
  t.current = current;
  if (total != null) t.total = total;
  emit();
}

export function endLoading(id: string): void {
  if (tasks.delete(id)) emit();
}

export function getLoadings(): LoadingTask[] {
  return Array.from(tasks.values()).sort((a, b) => b.startedAt - a.startedAt);
}

export function useActiveLoadings(minVisibleMs = 150): LoadingTask[] {
  const [list, setList] = useState<LoadingTask[]>(() => getLoadings());

  useEffect(() => {
    let raf = 0;
    const handler = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setList(getLoadings()));
    };
    window.addEventListener(EVENT, handler);
    // Re-evaluate periodically so we honor the minVisibleMs threshold UX-wise
    const id = window.setInterval(handler, 250);
    return () => {
      window.removeEventListener(EVENT, handler);
      window.clearInterval(id);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Filter ultra-fast tasks (<minVisibleMs) to avoid flicker
  const now = Date.now();
  return list.filter((t) => now - t.startedAt >= minVisibleMs || t.total != null);
}
