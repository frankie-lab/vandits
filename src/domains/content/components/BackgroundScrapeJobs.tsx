/**
 * BackgroundScrapeJobs — encolar URL como job de scraping lento y listar jobs en curso.
 *
 * Reglas:
 *  - URL libre (Atlas Obscura u otra; el backend detecta source).
 *  - Preset Lento/Normal/Rápido controla ritmo y pausas anti-detección.
 *  - Realtime sobre `scrape_jobs` para ver progreso sin recargar.
 */
import { useCallback, useEffect, useState } from 'react';
import { Loader2, Link2, Play, Pause, X, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/domains/identity';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

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

type Preset = 'slow' | 'normal' | 'fast';

const PRESET_LABEL: Record<Preset, string> = {
  slow: 'Lento (≈40/h)',
  normal: 'Normal (≈90/h)',
  fast: 'Rápido (≈180/h)',
};

const PRESET_LEGEND: Record<Preset, string> = {
  slow: 'Tick cada 90 s – 4 min con jitter, 2 fichas/tick. Pausa larga aleatoria de 10–30 min cada 25–50 fichas. ≈ 40–80 fichas/h. Recomendado para índices muy grandes o sesiones largas desatendidas.',
  normal: 'Tick cada 1–3 min con jitter, 3 fichas/tick. Pausa larga aleatoria de 5–20 min cada 25–75 fichas. ≈ 90–180 fichas/h. Equilibrio por defecto.',
  fast: 'Tick cada 45 s – 2 min con jitter, 5 fichas/tick. Pausa larga aleatoria de 3–10 min cada 50–120 fichas. ≈ 150–400 fichas/h. Más agresivo: mayor riesgo de pausa forzada por rate-limit del servidor.',
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

export function BackgroundScrapeJobs() {
  const { user } = useAuth();
  const [url, setUrl] = useState('');
  const [maxItems, setMaxItems] = useState<string>('');
  const [preset, setPreset] = useState<Preset>('normal');
  const [enqueueing, setEnqueueing] = useState(false);
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

  const enqueue = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) { toast.error('Pega una URL'); return; }
    try { new URL(trimmed); } catch { toast.error('URL inválida'); return; }
    setEnqueueing(true);
    try {
      const { data, error } = await supabase.functions.invoke('scrape-enqueue', {
        body: { url: trimmed, preset, maxItems: maxItems ? Number(maxItems) : null },
      });
      if (error) { toast.error(error.message); return; }
      if (!(data as any)?.ok) { toast.error((data as any)?.error || 'No se pudo encolar'); return; }
      toast.success('Job encolado. Empezará a beber datos en el próximo minuto.');
      setUrl(''); setMaxItems('');
      loadJobs();
    } finally { setEnqueueing(false); }
  }, [url, preset, maxItems, loadJobs]);

  const updateStatus = async (id: string, status: ScrapeJob['status']) => {
    await supabase.from('scrape_jobs').update({ status }).eq('id', id);
    loadJobs();
  };

  const openDoc = (docId: string | null) => {
    if (!docId) return;
    window.dispatchEvent(new CustomEvent('document:open-workspace', { detail: { docId } }));
  };

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-2xl border shadow-sm p-5 space-y-4">
        <div>
          <p className="text-sm font-semibold">Job en background (lento, anti-bloqueo)</p>
          <p className="text-xs text-muted-foreground leading-snug">
            Encola una URL y la recorremos poco a poco con pausas aleatorias. Ideal para índices grandes (Italia, Japón…).
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">URL</Label>
          <div className="relative">
            <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.atlasobscura.com/things-to-do/italy/places"
              className="h-11 pl-9"
              disabled={enqueueing}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ritmo</Label>
            <div className="grid grid-cols-3 gap-1">
              {(['slow', 'normal', 'fast'] as Preset[]).map((p) => (
                <Button
                  key={p}
                  type="button"
                  variant={preset === p ? 'default' : 'outline'}
                  size="sm"
                  className="h-11 text-[11px] px-1"
                  onClick={() => setPreset(p)}
                  disabled={enqueueing}
                >
                  {PRESET_LABEL[p].split(' ')[0]}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tope (opcional)</Label>
            <Input
              type="number"
              min={1}
              value={maxItems}
              onChange={(e) => setMaxItems(e.target.value)}
              placeholder="Sin tope"
              className="h-11"
              disabled={enqueueing}
            />
          </div>
        </div>

        <Button onClick={enqueue} disabled={enqueueing || !url.trim()} className="w-full h-11">
          {enqueueing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Encolando…</> : 'Encolar job'}
        </Button>

        <p className="text-[10px] text-muted-foreground leading-relaxed">
          {PRESET_LEGEND[preset]}{' '}
          Los puntos llegan a un documento sin aprobar (verifícalos en Contenido → Documentos).
        </p>
      </div>

      {jobs.length > 0 && (
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
      )}
    </div>
  );
}
