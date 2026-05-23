/**
 * PoiP2RunnerButton — TEMPORARY MAINTENANCE TOOL.
 *
 * Visible inside `InternalToolsPanel` (capability `run_internal_tooling`,
 * effectively master-only). Provides the "Continuar P2 Auto-Enrich" entry
 * point so masters don't have to type the URL manually.
 *
 * Behaviour:
 *   - On mount: queries the bridge `status` (read-only).
 *   - Active run (not terminal)       → button becomes "Ver estado P2",
 *                                       deep-links to /admin/dev/poi-p2-runner.
 *   - No active run + Pilot-100 FAIL  → disabled with tooltip.
 *   - No active run + Pilot-100 PASS  → opens confirm modal (25/100/250).
 *   - ALLOW_P2_REAL_BATCH off         → badge DRY-RUN, bridge no-ops.
 *   - ALLOW_P2_REAL_BATCH on          → badge REAL MODE, bridge runs.
 *
 * The dedicated page /admin/dev/poi-p2-runner remains the source of truth
 * for status/report/pause/resume/abort. This button is a shortcut, not a
 * replacement.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Rocket, ExternalLink, Loader2, Activity, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type RunStatus =
  | 'queued' | 'running' | 'paused' | 'completed' | 'aborted' | 'failed';

type BridgeStatus = {
  activeRun: { id: string; status: RunStatus; label: string } | null;
  pilot100: { pass: boolean; reason: string };
  allowRealBatch: boolean;
  nextBatchAllowed: boolean;
  nextBatchBlockReason?: string;
};

const SIZES = [25, 100, 250] as const;
const RUNNER_PATH = '/admin/dev/poi-p2-runner';

function isTerminal(s: RunStatus | undefined): boolean {
  return s === 'completed' || s === 'aborted' || s === 'failed';
}

export function PoiP2RunnerButton() {
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [size, setSize] = useState<number>(250);
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke('poi-p2-runner-bridge', {
        body: { action: 'status' },
      });
      if (error) throw error;
      setStatus(data as BridgeStatus);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const activeRunBusy = !!status?.activeRun && !isTerminal(status.activeRun.status);
  const pilotPass = !!status?.pilot100?.pass;
  const realMode = !!status?.allowRealBatch;

  const blockReason: string | null = useMemo(() => {
    if (!status) return null;
    if (activeRunBusy) return null; // handled by the "Ver estado" branch
    if (!pilotPass) return 'Pilot-100 debe terminar correctamente antes de lanzar batch.';
    if (size > 100 && confirmText !== 'CONFIRM P2 BATCH') return 'confirm_token_required';
    return null;
  }, [status, activeRunBusy, pilotPass, size, confirmText]);

  async function submit() {
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('poi-p2-runner-bridge', {
        body: {
          action: 'start-next-batch',
          size,
          confirmToken: size > 100 ? confirmText : undefined,
        },
      });
      if (error) throw error;
      if (data?.dryRun) {
        toast.success(`Dry-run OK · size=${size}. ALLOW_P2_REAL_BATCH desactivado.`);
      } else if (data?.blocked) {
        toast.error(`Bloqueado: ${data?.reason ?? 'unknown'}`);
      } else {
        toast.success(`Batch lanzado · run=${String(data?.runId ?? '').slice(0, 8)}`);
      }
      setOpen(false);
      setConfirmText('');
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div
        data-testid="poi-p2-runner-button-card"
        className="rounded border border-amber-500/40 bg-amber-500/5 p-3 flex flex-col gap-2"
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-semibold flex items-center gap-2 flex-wrap">
                <span>P2 Auto-Enrich</span>
                <Badge
                  variant={realMode ? 'destructive' : 'outline'}
                  className="text-[10px] font-mono"
                  data-testid="poi-p2-runner-mode-badge"
                >
                  {realMode ? 'REAL MODE' : 'DRY-RUN'}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Herramienta temporal de mantenimiento.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}

            {error && (
              <span className="text-xs text-destructive" data-testid="poi-p2-runner-error">
                {error}
              </span>
            )}

            {!loading && !error && activeRunBusy && (
              <Button
                asChild
                size="sm"
                variant="secondary"
                data-testid="poi-p2-runner-button-view"
              >
                <Link to={RUNNER_PATH}>
                  <Activity className="w-3.5 h-3.5 mr-1.5" />
                  Ver estado P2
                  <ExternalLink className="w-3 h-3 ml-1.5" />
                </Link>
              </Button>
            )}

            {!loading && !error && !activeRunBusy && (
              <>
                {!pilotPass ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={0}>
                        <Button
                          size="sm"
                          variant="default"
                          disabled
                          data-testid="poi-p2-runner-button-disabled"
                        >
                          <Rocket className="w-3.5 h-3.5 mr-1.5" />
                          Continuar P2 Auto-Enrich
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      Pilot-100 debe terminar correctamente antes de lanzar batch.
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => setOpen(true)}
                        data-testid="poi-p2-runner-button-start"
                      >
                        <Rocket className="w-3.5 h-3.5 mr-1.5" />
                        Continuar P2 Auto-Enrich
                      </Button>
                    </TooltipTrigger>
                    {!realMode && (
                      <TooltipContent>
                        Modo dry-run. Activar ALLOW_P2_REAL_BATCH=1 para ejecución real.
                      </TooltipContent>
                    )}
                  </Tooltip>
                )}

                <Button asChild size="sm" variant="ghost" data-testid="poi-p2-runner-button-open-page">
                  <Link to={RUNNER_PATH}>
                    Detalle
                    <ExternalLink className="w-3 h-3 ml-1.5" />
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lanzar siguiente batch P2</DialogTitle>
            <DialogDescription>
              Seeds only D-eligible POIs. Excludes A/B/C, canon_gap, fixtures, hardError,
              in_progress y enriched. Escribe únicamente <code>enriched_data</code>,
              <code> enrichment_status</code> y <code>updated_at</code>.
              {!realMode && (
                <span className="block mt-2 text-amber-600 dark:text-amber-400">
                  Modo dry-run. No se ejecutará batch real.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label>Batch size</Label>
              <Select value={String(size)} onValueChange={v => setSize(Number(v))}>
                <SelectTrigger data-testid="poi-p2-runner-size-trigger"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SIZES.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {size > 100 && (
              <div>
                <Label>Confirm token</Label>
                <Input
                  data-testid="poi-p2-runner-confirm-input"
                  value={confirmText}
                  onChange={e => setConfirmText(e.target.value)}
                  placeholder="Type: CONFIRM P2 BATCH"
                />
                <p className="text-xs text-muted-foreground mt-1">Required for size &gt; 100.</p>
              </div>
            )}
            {blockReason && blockReason !== 'confirm_token_required' && (
              <div className="text-xs text-destructive">Blocked: {blockReason}</div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              data-testid="poi-p2-runner-submit"
              onClick={() => void submit()}
              disabled={!!blockReason || submitting}
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              {realMode ? 'Lanzar batch' : 'Lanzar (dry-run)'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
