/**
 * ScrapeJobsList — listado de jobs de scraping en curso/recientes con controles.
 * El formulario de encolado vive ahora dentro de WebImportPanel (panel unificado).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, X, FolderOpen } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/domains/identity';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
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
  pages_seen: number;
  items_found: number;
  items_imported: number;
  items_skipped: number;
  next_tick_at: string;
  paused_until: string | null;
  last_tick_at: string | null;
  error_message: string | null;
  created_at: string;
};

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

  const openDoc = (docId: string | null) => {
    if (!docId) return;
    window.dispatchEvent(new CustomEvent('document:open-workspace', { detail: { docId } }));
  };

  if (jobs.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">Jobs recientes</p>
      {jobs.map((j) => {
        const total = j.max_items ?? Math.max(j.items_found, 1);
        const pct = Math.min(100, Math.round((j.items_imported / Math.max(total, 1)) * 100));
        const st = statusLabel(j);
        const isActive = j.status === 'running' || j.status === 'paused';
        return (
          <div key={j.id} className="bg-card rounded-xl border p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{j.seed_url}</p>
                <p className="text-[10px] text-muted-foreground">{j.source}</p>
              </div>
              <Badge variant={st.tone} className="text-[10px] shrink-0">{st.label}</Badge>
            </div>
            <Progress value={pct} className="h-1.5" />
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{j.items_imported} importados · {j.items_found} encontrados · {j.items_skipped} omitidos</span>
              <div className="flex items-center gap-1">
                {j.document_id && (
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openDoc(j.document_id)} title="Abrir documento">
                    <FolderOpen className="w-3.5 h-3.5" />
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
                {isActive && (
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => updateStatus(j.id, 'cancelled')} title="Cancelar">
                    <X className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>
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
