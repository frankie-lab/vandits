/**
 * ScrapeJobsList — listado de jobs de scraping en curso/recientes con controles.
 * El formulario de encolado vive ahora dentro de WebImportPanel (panel unificado).
 */
import { useCallback, useEffect, useState } from 'react';
import { Play, Pause, Gauge, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/domains/identity';
import { Button } from '@/components/ui/button';

import { Badge } from '@/components/ui/badge';

export type Preset = 'slow' | 'normal' | 'fast';

export const PRESET_LABEL: Record<Preset, string> = {
  slow: 'Lento',
  normal: 'Normal',
  fast: 'Rápido',
};

export const PRESET_LEGEND: Record<Preset, string> = {
  slow: 'Tick 90 s – 4 min · 2 fichas/tick · Pausa 10–30 min cada 25–50 fichas · ≈ 40–80 fichas/h. Para índices muy grandes.',
  normal: 'Tick 1–3 min · 3 fichas/tick · Pausa 5–20 min cada 25–75 fichas · ≈ 90–180 fichas/h. Equilibrio recomendado.',
  fast: 'Tick 45 s – 2 min · 5 fichas/tick · Pausa 3–10 min cada 50–120 fichas · ≈ 150–400 fichas/h. Mayor riesgo de rate-limit.',
};

type ScrapeJob = {
  id: string;
  user_id: string;
  source: string;
  seed_url: string;
  document_id: string | null;
  status: 'queued' | 'running' | 'paused' | 'done' | 'error' | 'cancelled';
  max_items: number | null;
  rate_per_tick: number;
  min_tick_seconds: number;
  max_tick_seconds: number;
  pause_after_min: number;
  pause_after_max: number;
  pause_duration_min_minutes: number;
  pause_duration_max_minutes: number;
  items_until_pause: number;
  pages_seen: number;
  items_found: number;
  items_imported: number;
  items_skipped: number;
  items_lost?: number | null;
  next_tick_at: string;
  paused_until: string | null;
  last_tick_at: string | null;
  error_message: string | null;
  created_at: string;
};

const PRESET_CONFIG: Record<Preset, {
  rate_per_tick: number;
  min_tick_seconds: number;
  max_tick_seconds: number;
  pause_after_min: number;
  pause_after_max: number;
  pause_duration_min_minutes: number;
  pause_duration_max_minutes: number;
}> = {
  slow:   { rate_per_tick: 2, min_tick_seconds: 90, max_tick_seconds: 240, pause_after_min: 25, pause_after_max: 50,  pause_duration_min_minutes: 10, pause_duration_max_minutes: 30 },
  normal: { rate_per_tick: 3, min_tick_seconds: 60, max_tick_seconds: 180, pause_after_min: 25, pause_after_max: 75,  pause_duration_min_minutes: 5,  pause_duration_max_minutes: 20 },
  fast:   { rate_per_tick: 5, min_tick_seconds: 45, max_tick_seconds: 120, pause_after_min: 50, pause_after_max: 120, pause_duration_min_minutes: 3,  pause_duration_max_minutes: 10 },
};

function detectPreset(j: ScrapeJob): Preset {
  if (j.rate_per_tick <= 2) return 'slow';
  if (j.rate_per_tick >= 5) return 'fast';
  return 'normal';
}

function statusLabel(j: ScrapeJob): { label: string; tone: 'default' | 'secondary' | 'destructive' | 'outline' } {
  if (j.status === 'done') return { label: 'Completado', tone: 'secondary' };
  if (j.status === 'error') return { label: 'Error', tone: 'destructive' };
  if (j.status === 'cancelled') return { label: 'Cancelado', tone: 'outline' };
  if (j.status === 'paused') return { label: 'Pausado', tone: 'outline' };
  if (j.paused_until && new Date(j.paused_until) > new Date()) {
    const mins = Math.max(1, Math.round((new Date(j.paused_until).getTime() - Date.now()) / 60000));
    return { label: `Pausa anti-bloqueo · ${mins} min`, tone: 'outline' };
  }
  return { label: 'Procesando', tone: 'default' };
}

function nextTickLabel(j: ScrapeJob): string | null {
  if (j.status !== 'running') return null;
  if (j.paused_until && new Date(j.paused_until) > new Date()) return null;
  const ms = new Date(j.next_tick_at).getTime() - Date.now();
  if (ms <= 0) return 'Próximo ciclo: ahora';
  const s = Math.round(ms / 1000);
  if (s < 60) return `Próximo ciclo: ${s}s`;
  return `Próximo ciclo: ${Math.round(s / 60)} min`;
}

export function ScrapeJobsList() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<ScrapeJob[]>([]);

  const loadJobs = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('scrape_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    setJobs((data ?? []) as ScrapeJob[]);
  }, [user]);

  useEffect(() => {
    loadJobs();
    if (!user) return;
    const channel = supabase
      .channel(`scrape_jobs_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scrape_jobs', filter: `user_id=eq.${user.id}` }, () => {
        loadJobs();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, loadJobs]);

  const updateStatus = async (id: string, status: ScrapeJob['status']) => {
    await supabase.from('scrape_jobs').update({ status }).eq('id', id);
    loadJobs();
  };

  const updatePreset = async (id: string, p: Preset) => {
    const cfg = PRESET_CONFIG[p];
    await supabase.from('scrape_jobs').update(cfg).eq('id', id);
    loadJobs();
  };

  const openDoc = (docId: string | null) => {
    if (!docId) return;
    window.dispatchEvent(new CustomEvent('document:open-workspace', { detail: { docId } }));
  };

  // Tick countdown re-render every second when there are active jobs
  const [, setNowTick] = useState(0);
  useEffect(() => {
    const hasActive = jobs.some(j => j.status === 'running' || j.status === 'paused');
    if (!hasActive) return;
    const id = setInterval(() => setNowTick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, [jobs]);

  if (jobs.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">Jobs recientes</p>
      {jobs.map((j) => {
        const found = Math.max(j.items_found ?? 0, 0);
        const imported = Math.max(j.items_imported ?? 0, 0);
        const skipped = Math.max(j.items_skipped ?? 0, 0);
        const isTerminal = j.status === 'done' || j.status === 'error' || j.status === 'cancelled';
        const lost = isTerminal
          ? Math.max(j.items_lost ?? Math.max(0, found - imported - skipped), 0)
          : 0;
        const processed = imported + skipped + lost;
        const pending = isTerminal ? 0 : Math.max(0, found - processed);
        const denom = Math.max(found, processed, 1);
        const pctImported = (imported / denom) * 100;
        const pctSkipped = (skipped / denom) * 100;
        const pctLost = (lost / denom) * 100;
        const pctPending = isTerminal ? 0 : (pending / denom) * 100;
        const st = statusLabel(j);
        const isActive = j.status === 'running' || j.status === 'paused';
        const currentPreset = detectPreset(j);
        const tickInfo = nextTickLabel(j);
        return (
          <div key={j.id} className="bg-card rounded-xl border p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{j.seed_url}</p>
                <p className="text-[10px] text-muted-foreground">{j.source}</p>
              </div>
              <Badge variant={st.tone} className="text-[10px] shrink-0">{st.label}</Badge>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground tabular-nums">
              <span>Inicio: {new Date(j.created_at).toLocaleString()}</span>
              {isTerminal && j.last_tick_at && (
                <>
                  <span>·</span>
                  <span>Fin: {new Date(j.last_tick_at).toLocaleString()}</span>
                </>
              )}
            </div>
            <div
              className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted"
              title={`${imported} importados · ${skipped} omitidos${lost ? ` · ${lost} perdidos` : ''}${pending ? ` · ${pending} pendientes` : ''} de ${found} encontrados`}
            >
              {pctImported > 0 && (
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pctImported}%` }} />
              )}
              {pctSkipped > 0 && (
                <div className="h-full bg-amber-500 transition-all" style={{ width: `${pctSkipped}%` }} />
              )}
              {pctLost > 0 && (
                <div className="h-full bg-destructive transition-all" style={{ width: `${pctLost}%` }} />
              )}
              {pctPending > 0 && (
                <div className="h-full bg-transparent" style={{ width: `${pctPending}%` }} />
              )}
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span className="tabular-nums">
                {found} encontrados · <span className="text-emerald-600 dark:text-emerald-400">{imported} importados</span> · <span className="text-amber-600 dark:text-amber-400">{skipped} omitidos</span>
                {!isTerminal && pending > 0 && (
                  <> · <span>{pending} pendientes</span></>
                )}
                {isTerminal && lost > 0 && (
                  <> · <span className="text-destructive font-medium" title="Diferencia no contabilizada — posible error en el procesamiento">{lost} perdidos</span></>
                )}
              </span>

              <div className="flex items-center gap-1">
                {j.document_id && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[10px] gap-1"
                    onClick={() => openDoc(j.document_id)}
                    title="Abrir documento resultado"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Ver resultado
                  </Button>
                )}
                {isActive && j.status === 'running' && (
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => updateStatus(j.id, 'paused')} title="Pausar">
                    <Pause className="w-3.5 h-3.5" />
                  </Button>
                )}
                {isActive && j.status === 'paused' && (
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => updateStatus(j.id, 'running')} title="Reanudar">
                    <Play className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>
            {isActive && (
              <div className="flex items-center justify-between gap-2 pt-1 border-t">
                <div className="flex items-center gap-1">
                  <Gauge className="w-3 h-3 text-muted-foreground" />
                  {(['slow', 'normal', 'fast'] as Preset[]).map((p) => (
                    <Button
                      key={p}
                      size="sm"
                      variant={currentPreset === p ? 'default' : 'outline'}
                      className="h-6 px-2 text-[10px]"
                      onClick={() => updatePreset(j.id, p)}
                      title={PRESET_LEGEND[p]}
                    >
                      {PRESET_LABEL[p]}
                    </Button>
                  ))}
                </div>
                {tickInfo && (
                  <span className="text-[10px] text-muted-foreground tabular-nums">{tickInfo}</span>
                )}
              </div>
            )}
            {j.error_message && (
              <p className="text-[10px] text-destructive">{j.error_message}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Backwards-compat alias (algunos imports existentes pueden seguir usando este nombre)
export const BackgroundScrapeJobs = ScrapeJobsList;
