/**
 * PoiP2RunnerPage — TEMPORARY MAINTENANCE TOOL.
 * Remove or keep hidden after the P2 backlog is drained.
 *
 * Route: /admin/dev/poi-p2-runner
 * Access: master role + capability `run_internal_tooling`.
 * Hidden from menus and from `ADMIN_TABS`. Non-master → redirect to "/".
 *
 * Capabilities:
 *   - status / report   → live read-only
 *   - pause / resume / abort / start-next-batch → implemented + protected
 *     behind ALLOW_P2_REAL_BATCH=1 on the edge function env. In this
 *     delivery the bridge returns `{ dryRun: true }` for those actions.
 *
 * No new feature surfaces are added to product navigation.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2, RefreshCcw, FileText, Pause, Play, Square, Rocket, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/domains/identity';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Status = {
  utc: string;
  activeRun: RunSummary | null;
  lastTerminalRun: RunSummary | null;
  dRemaining: number;
  pilot100: { pass: boolean; reason: string; label?: string };
  nextBatchAllowed: boolean;
  nextBatchBlockReason?: string;
  allowRealBatch: boolean;
};

type RunSummary = {
  id: string; label: string; status: string;
  aiCallsUsed: number; maxAiCalls: number;
  metrics: { success: number; fail: number; skip: number; noop: number };
  pending: number; inFlight: number;
  errorRatePct: number;
  lastUpdateSecAgo: number;
  stopCondition: string;
  pauseReason: string | null;
  abortReason: string | null;
};

type AuditRow = {
  id: string;
  user_id: string | null;
  action: string;
  run_id: string | null;
  batch_size: number | null;
  reason: string | null;
  result: any;
  report_path: string | null;
  created_at: string;
};

const SIZES = [25, 100, 250] as const;

async function callBridge(body: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke('poi-p2-runner-bridge', { body });
  if (error) throw error;
  return data;
}

export default function PoiP2RunnerPage() {
  const { loading, isMaster, hasPermission } = usePermissions();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Master + capability required. Non-master → redirect home (no fingerprint).
  if (!isMaster() || !hasPermission('run_internal_tooling')) {
    return <Navigate to="/" replace />;
  }

  return <PoiP2RunnerBody />;
}

function PoiP2RunnerBody() {
  const [status, setStatus] = useState<Status | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reportMd, setReportMd] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);

  const [startOpen, setStartOpen] = useState(false);
  const [abortOpen, setAbortOpen] = useState(false);
  const [startSize, setStartSize] = useState<number>(250);
  const [startConfirmText, setStartConfirmText] = useState('');
  const [abortReason, setAbortReason] = useState('');

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setStatusError(null);
    try {
      const out = await callBridge({ action: 'status' });
      setStatus(out as Status);
    } catch (e: any) {
      setStatusError(e?.message ?? String(e));
    } finally {
      setRefreshing(false);
    }
    const { data: rows } = await supabase
      .from('poi_p2_runner_audit')
      .select('*').order('created_at', { ascending: false }).limit(20);
    setAudit((rows as AuditRow[]) ?? []);
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 15000);
    return () => clearInterval(t);
  }, [refresh]);

  const activeId = status?.activeRun?.id ?? null;
  const lastTerminalId = status?.lastTerminalRun?.id ?? null;
  const targetRunId = activeId ?? lastTerminalId;

  const startBlockReason: string | null = useMemo(() => {
    if (!status) return 'loading';
    if (status.activeRun && !['completed', 'aborted', 'paused'].includes(status.activeRun.status)) {
      return 'active_run_not_terminal';
    }
    if (startSize > 100 && !status.pilot100.pass) return 'pilot100_gate_fail';
    if (startSize > 100 && startConfirmText !== 'CONFIRM P2 BATCH') return 'confirm_token_required';
    return null;
  }, [status, startSize, startConfirmText]);

  async function generateReport() {
    if (!targetRunId) return;
    setBusy(true);
    try {
      const out = await callBridge({ action: 'report', runId: targetRunId });
      setReportMd(out.markdown);
    } catch (e: any) {
      setStatusError(e?.message ?? String(e));
    } finally {
      setBusy(false); await refresh();
    }
  }

  async function doAction(action: 'pause' | 'resume', runId: string) {
    setBusy(true);
    try { await callBridge({ action, runId }); }
    catch (e: any) { setStatusError(e?.message ?? String(e)); }
    finally { setBusy(false); await refresh(); }
  }

  async function confirmAbort() {
    if (!activeId || abortReason.trim().length === 0) return;
    setBusy(true);
    try {
      await callBridge({ action: 'abort', runId: activeId, reason: abortReason.trim() });
      setAbortOpen(false); setAbortReason('');
    } catch (e: any) { setStatusError(e?.message ?? String(e)); }
    finally { setBusy(false); await refresh(); }
  }

  async function confirmStart() {
    setBusy(true);
    try {
      await callBridge({
        action: 'start-next-batch',
        size: startSize,
        confirmToken: startSize > 100 ? startConfirmText : undefined,
      });
      setStartOpen(false); setStartConfirmText('');
    } catch (e: any) { setStatusError(e?.message ?? String(e)); }
    finally { setBusy(false); await refresh(); }
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-5xl mx-auto space-y-4">

        {/* TEMPORARY banner */}
        <div className="flex items-start gap-3 p-3 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200">
          <ShieldAlert className="w-5 h-5 mt-0.5 shrink-0" />
          <div className="text-sm">
            <strong>TEMPORARY MAINTENANCE TOOL.</strong> Remove or keep hidden after the P2 backlog is drained.
            This page is hidden from product navigation and gated to <code>master</code> + <code>run_internal_tooling</code>.
          </div>
        </div>

        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">P2 Auto-Enrich Runner</h1>
            <p className="text-xs text-muted-foreground">
              <code>/admin/dev/poi-p2-runner</code> · bridge: <code>poi-p2-runner-bridge</code>
              {status && (
                <> · ALLOW_P2_REAL_BATCH=<strong>{status.allowRealBatch ? '1 (live)' : '0 (dry-run)'}</strong></>
              )}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={refreshing}>
            <RefreshCcw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </header>

        {statusError && (
          <div className="p-3 rounded-md border border-destructive/40 bg-destructive/10 text-sm">
            {statusError}
          </div>
        )}

        {/* Status grid */}
        <section className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold mb-3">Status</h2>
          {!status ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <Field label="Active run" value={status.activeRun ? `${status.activeRun.label} (${status.activeRun.status})` : 'none'} />
              <Field label="Run id" value={status.activeRun?.id?.slice(0, 8) ?? '—'} mono />
              <Field label="ai_calls" value={status.activeRun ? `${status.activeRun.aiCallsUsed} / ${status.activeRun.maxAiCalls}` : '—'} />
              <Field label="success" value={status.activeRun?.metrics.success ?? '—'} />
              <Field label="skip" value={status.activeRun?.metrics.skip ?? '—'} />
              <Field label="fail" value={status.activeRun?.metrics.fail ?? '—'} />
              <Field label="noop" value={status.activeRun?.metrics.noop ?? '—'} />
              <Field label="in_flight" value={status.activeRun?.inFlight ?? '—'} />
              <Field label="pending" value={status.activeRun?.pending ?? '—'} />
              <Field label="error_rate" value={status.activeRun ? `${status.activeRun.errorRatePct.toFixed(1)}%` : '—'} />
              <Field label="last update" value={status.activeRun ? `${status.activeRun.lastUpdateSecAgo}s ago` : '—'} />
              <Field label="stop condition" value={status.activeRun?.stopCondition ?? 'none'} />
              <Field label="D remaining" value={status.dRemaining.toLocaleString('en-US')} />
              <Field label="Pilot-100 gate" value={`${status.pilot100.pass ? 'PASS' : 'FAIL'} (${status.pilot100.reason})`} />
              <Field label="Next batch" value={status.nextBatchAllowed ? 'allowed' : `blocked: ${status.nextBatchBlockReason}`} />
            </div>
          )}
        </section>

        {/* Actions */}
        <section className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold mb-3">Actions</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={generateReport} disabled={busy || !targetRunId}>
              <FileText className="w-4 h-4 mr-2" /> Generate report
            </Button>
            <Button variant="outline" size="sm"
              onClick={() => activeId && void doAction('pause', activeId)}
              disabled={busy || !activeId || status?.activeRun?.status !== 'running'}>
              <Pause className="w-4 h-4 mr-2" /> Pause
            </Button>
            <Button variant="outline" size="sm"
              onClick={() => activeId && void doAction('resume', activeId)}
              disabled={busy || !activeId || status?.activeRun?.status !== 'paused'}>
              <Play className="w-4 h-4 mr-2" /> Resume
            </Button>
            <Button variant="outline" size="sm"
              onClick={() => setAbortOpen(true)}
              disabled={busy || !activeId}>
              <Square className="w-4 h-4 mr-2" /> Abort…
            </Button>
            <Button variant="default" size="sm"
              onClick={() => setStartOpen(true)}
              disabled={busy || (status?.activeRun ? !['completed', 'aborted', 'paused'].includes(status.activeRun.status) : false)}>
              <Rocket className="w-4 h-4 mr-2" /> Start next batch…
            </Button>
          </div>
        </section>

        {/* Report */}
        {reportMd && (
          <section className="rounded-lg border bg-card p-4">
            <h2 className="text-sm font-semibold mb-3">Report (markdown)</h2>
            <pre className="text-xs bg-muted/40 p-3 rounded max-h-96 overflow-auto whitespace-pre-wrap">{reportMd}</pre>
          </section>
        )}

        {/* Audit */}
        <section className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold mb-3">Audit (last 20)</h2>
          {audit.length === 0 ? (
            <div className="text-sm text-muted-foreground">No entries yet.</div>
          ) : (
            <div className="text-xs space-y-1 font-mono">
              {audit.map(a => (
                <div key={a.id} className="flex gap-2 border-b border-border/40 py-1">
                  <span className="text-muted-foreground shrink-0">{new Date(a.created_at).toISOString()}</span>
                  <span className="shrink-0">{a.action}</span>
                  {a.batch_size && <span>size={a.batch_size}</span>}
                  {a.run_id && <span>run={a.run_id.slice(0, 8)}</span>}
                  {a.reason && <span>reason={a.reason}</span>}
                  {a.result?.dryRun && <span className="text-amber-500">dry-run</span>}
                  {a.result?.blocked && <span className="text-destructive">blocked={a.result.reason}</span>}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Start dialog */}
      <Dialog open={startOpen} onOpenChange={setStartOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start next batch</DialogTitle>
            <DialogDescription>
              Seeds only D-eligible POIs. Excludes A/B/C, canon_gap, fixtures, hardError, in_progress, already-enriched.
              Writes only <code>enriched_data</code>, <code>enrichment_status</code>, <code>updated_at</code>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Batch size</Label>
              <Select value={String(startSize)} onValueChange={v => setStartSize(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SIZES.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {startSize > 100 && (
              <div>
                <Label>Confirm token</Label>
                <Input
                  data-testid="confirm-token-input"
                  value={startConfirmText}
                  onChange={e => setStartConfirmText(e.target.value)}
                  placeholder="Type: CONFIRM P2 BATCH"
                />
                <p className="text-xs text-muted-foreground mt-1">Required for size &gt; 100.</p>
              </div>
            )}
            {startBlockReason && (
              <div className="text-xs text-destructive">Blocked: {startBlockReason}</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setStartOpen(false)}>Cancel</Button>
            <Button
              data-testid="start-batch-confirm"
              onClick={() => void confirmStart()}
              disabled={!!startBlockReason || busy}
            >
              Start
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Abort dialog */}
      <Dialog open={abortOpen} onOpenChange={setAbortOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abort active run</DialogTitle>
            <DialogDescription>Reason is mandatory for audit.</DialogDescription>
          </DialogHeader>
          <Textarea
            data-testid="abort-reason-input"
            value={abortReason}
            onChange={e => setAbortReason(e.target.value)}
            placeholder="Why are you aborting?"
            rows={4}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbortOpen(false)}>Cancel</Button>
            <Button
              data-testid="abort-confirm"
              variant="destructive"
              onClick={() => void confirmAbort()}
              disabled={abortReason.trim().length === 0 || busy}
            >
              Abort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value, mono = false }: { label: string; value: any; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`text-sm ${mono ? 'font-mono' : ''}`}>{String(value)}</span>
    </div>
  );
}
