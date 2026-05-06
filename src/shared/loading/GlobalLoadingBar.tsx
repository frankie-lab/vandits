import React from 'react';
import { useActiveLoadings } from './loading-bus';

export function GlobalLoadingBar() {
  const tasks = useActiveLoadings();
  if (tasks.length === 0) return null;

  const top = tasks[0];
  const determinate = top.total != null && top.total > 0;
  const pct = determinate
    ? Math.min(100, Math.round(((top.current ?? 0) / (top.total as number)) * 100))
    : 0;
  const extra = tasks.length - 1;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[10000] pointer-events-none"
      role="status"
      aria-live="polite"
      aria-label={top.label}
    >
      <div className="h-[3px] bg-transparent overflow-hidden">
        {determinate ? (
          <div
            className="h-full bg-primary transition-[width] duration-200 ease-out"
            style={{ width: `${pct}%` }}
          />
        ) : (
          <div className="h-full w-1/3 bg-primary global-loading-indeterminate" />
        )}
      </div>
      <div className="pointer-events-auto absolute top-2 right-3 text-[11px] px-2 py-1 rounded-md bg-background/85 backdrop-blur border border-border text-muted-foreground shadow-sm">
        {top.label}
        {determinate ? ` · ${top.current ?? 0}/${top.total}` : ''}
        {extra > 0 ? ` (+${extra})` : ''}
      </div>
    </div>
  );
}
