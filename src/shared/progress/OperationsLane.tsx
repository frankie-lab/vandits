/**
 * OperationsLane — 4th lane in BottomProgressBar for transversal heavy ops.
 *
 * Phase 1 only renders ops started via `startOperation` (currently only the
 * MyCatalog popover filter ops). Indeterminate-by-default rendering — never
 * shows a spurious 100%. See mem://logic/operations/heavy-operations-feedback.
 */
import { useEffect } from 'react';
import { Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { LaneRow } from './LaneRow';
import { useActiveHeavyOperations } from '@/shared/operations/heavy-operations-store';

interface Props {
  onActiveChange: (active: boolean) => void;
}

export function OperationsLane({ onActiveChange }: Props) {
  const ops = useActiveHeavyOperations();
  const active = ops.length > 0;

  useEffect(() => {
    onActiveChange(active);
  }, [active, onActiveChange]);

  if (!active) return null;

  // Pick the most recent op as the headline; if many, summarise.
  const sorted = [...ops].sort((a, b) => b.startedAt - a.startedAt);
  const head = sorted[0];
  const isError = head.status === 'error';
  const isDone = head.status === 'done';
  const indeterminate = head.indeterminate && !isDone && !isError;
  const progressPct =
    isDone || isError
      ? 100
      : typeof head.progress === 'number'
        ? head.progress
        : 0;

  const title =
    sorted.length > 1
      ? `${sorted.length} operaciones en curso`
      : head.label;

  const subtitle = head.resultLabel
    ? head.resultLabel
    : sorted.length > 1
      ? sorted.map((o) => o.label).slice(0, 3).join(' · ')
      : head.source;

  const icon = isError ? (
    <AlertTriangle className="w-3.5 h-3.5" />
  ) : isDone ? (
    <CheckCircle2 className="w-3.5 h-3.5" />
  ) : (
    <Loader2 className="w-3.5 h-3.5 animate-spin" />
  );

  const segments = isError
    ? [{ pct: 100, className: 'bg-red-500/40' }]
    : isDone
      ? [{ pct: 100, className: 'bg-emerald-500/40' }]
      : indeterminate
        ? []
        : [{ pct: progressPct, className: 'bg-primary/50' }];

  return (
    <LaneRow
      iconNode={icon}
      iconTone={isError ? 'amber' : 'primary'}
      title={title}
      subtitle={subtitle}
      progressPct={progressPct}
      segments={segments}
      counter={{ done: 0, total: 0 }}
      eta={null}
      indeterminate={indeterminate}
      running={!isDone && !isError}
    />
  );
}
