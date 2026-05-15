/**
 * LaneRow — shared visual shell for the multi-lane BottomProgressBar.
 *
 * Each long-running background job (AI enrichment, geo normalization, …)
 * renders one LaneRow inside the bottom progress shell. The contract is
 * intentionally minimal so any future job can plug in without diverging.
 *
 * Layout (full-width row, ~52px tall):
 *   [icon] [title + subtitle]   [segmented bar with overlay metrics]   [controls]
 *
 * The row never decides whether to be visible — the parent shell mounts
 * it under AnimatePresence when the underlying job is active.
 */
import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export type LaneTone = 'primary' | 'amber' | 'emerald' | 'green';

export interface LaneSegment {
  /** Width in percent (0-100). Segments are drawn left-to-right, stacked. */
  pct: number;
  /** Tailwind gradient classes — full `bg-gradient-to-r from-X to-Y`. */
  className: string;
}

export interface LaneMetric {
  dotClassName: string; // e.g. 'bg-red-500'
  label?: string; // tooltip
  count: number;
}

export interface LaneRowProps {
  iconNode: React.ReactNode;
  iconTone: LaneTone;
  title: string;
  subtitle?: React.ReactNode;
  /** 0-100 total fill % (used for stripes + leading edge). */
  progressPct: number;
  segments: LaneSegment[];
  /** Right-aligned metric chips drawn on top of the bar. */
  metrics?: LaneMetric[];
  /** Big counter "done/total" drawn on the left of the bar. */
  counter: { done: number; total: number };
  eta?: string | null;
  controls?: React.ReactNode;
  /** When true, paints the bar amber regardless of segments (pause feedback). */
  paused?: boolean;
  /** When true, animates barber-pole stripes. */
  running?: boolean;
  /**
   * When true, the row is rendered as a true indeterminate progress bar:
   *   - segments and progress percentage are ignored,
   *   - a "ghost" segment slides across the track,
   *   - aria-busy is set, aria-valuenow is omitted.
   * Use for ops that have no measurable progress yet.
   */
  indeterminate?: boolean;
}

const TONE_BG: Record<LaneTone, string> = {
  primary: 'bg-primary/10 text-primary',
  amber: 'bg-amber-500/10 text-amber-500',
  emerald: 'bg-emerald-500/10 text-emerald-500',
  green: 'bg-green-500/10 text-green-500',
};

export function LaneRow({
  iconNode,
  iconTone,
  title,
  subtitle,
  progressPct,
  segments,
  metrics,
  counter,
  eta,
  controls,
  paused,
  running,
  indeterminate,
}: LaneRowProps) {
  const clamped = Math.min(100, Math.max(0, progressPct));
  return (
    <div className="flex items-center gap-4 px-4 py-2">
      {/* Icon + title block */}
      <div className="flex items-center gap-2.5 flex-shrink-0 min-w-0 max-w-[24%]">
        <div
          className={cn(
            'flex items-center justify-center w-7 h-7 rounded-full flex-shrink-0',
            TONE_BG[iconTone],
          )}
        >
          {iconNode}
        </div>
        <div className="flex flex-col min-w-0 leading-tight">
          <span className="font-medium text-sm truncate">{title}</span>
          {subtitle && (
            <span className="text-[11px] text-muted-foreground truncate">
              {subtitle}
            </span>
          )}
        </div>
      </div>

      {/* Bar */}
      <div className="flex-1 min-w-0">
        <div
          className="relative h-8 rounded-md overflow-hidden ring-1 ring-border/60 bg-muted/60 dark:bg-muted/30 shadow-inner"
          role="progressbar"
          aria-valuenow={Math.round(clamped)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={title}
        >
          {/* Segments drawn left-to-right */}
          {(() => {
            let cursor = 0;
            return segments.map((seg, idx) => {
              const left = cursor;
              cursor += seg.pct;
              return (
                <motion.div
                  key={idx}
                  className={cn('absolute inset-y-0', seg.className)}
                  initial={{ width: 0 }}
                  animate={{ left: `${left}%`, width: `${seg.pct}%` }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                />
              );
            });
          })()}

          {/* Stripes while running */}
          {running && !paused && clamped < 100 && (
            <motion.div
              className="absolute inset-y-0 left-0 pointer-events-none opacity-20 mix-blend-overlay"
              style={{
                width: `${clamped}%`,
                backgroundImage:
                  'repeating-linear-gradient(135deg, rgba(255,255,255,0.6) 0 8px, transparent 8px 16px)',
                backgroundSize: '22px 22px',
              }}
              animate={{ backgroundPositionX: ['0px', '44px'] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
            />
          )}

          {/* Leading edge */}
          {clamped > 0 && clamped < 100 && (
            <div
              className="absolute top-0 bottom-0 w-px bg-white/70 dark:bg-white/40 shadow-[0_0_8px_rgba(255,255,255,0.7)]"
              style={{ left: `calc(${clamped}% - 0.5px)` }}
            />
          )}

          {/* Overlay text */}
          <div className="absolute inset-0 flex items-center justify-between px-3 text-[12px] font-medium tabular-nums pointer-events-none">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={cn(
                  'font-semibold',
                  clamped > 55 ? 'text-white drop-shadow-sm' : 'text-foreground',
                )}
              >
                {counter.done}
                <span className="opacity-70">/{counter.total}</span>
              </span>
              <span
                className={cn(
                  'text-[11px]',
                  clamped > 55 ? 'text-white/85' : 'text-muted-foreground',
                )}
              >
                {Math.round(clamped)}%
              </span>
            </div>
            <div className="flex items-center gap-2.5 text-[11px]">
              {metrics?.map((m, idx) =>
                m.count > 0 ? (
                  <span
                    key={idx}
                    className={cn(
                      'inline-flex items-center gap-1',
                      clamped > 80 ? 'text-white' : 'text-muted-foreground',
                    )}
                    title={m.label}
                  >
                    <span
                      className={cn(
                        'w-1.5 h-1.5 rounded-full ring-1 ring-white/60',
                        m.dotClassName,
                      )}
                    />
                    {m.count}
                  </span>
                ) : null,
              )}
              {eta && (
                <span
                  className={cn(
                    'hidden sm:inline border-l pl-2.5',
                    clamped > 90
                      ? 'text-white border-white/30'
                      : 'text-muted-foreground border-border',
                  )}
                >
                  ETA {eta}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      {controls && (
        <div className="flex items-center gap-2 flex-shrink-0">{controls}</div>
      )}
    </div>
  );
}
