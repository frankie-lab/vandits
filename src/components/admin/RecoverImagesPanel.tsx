/**
 * RecoverImagesPanel — retroactively search for images for already-enriched
 * POIs that ended up without `cover_url`. Calls the
 * `recover-missing-images` edge function in batches and chains nextCursor
 * automatically. Dry-run is the recommended first flow.
 */
import { useState, useRef } from 'react';
import { ImageIcon, Loader2, Play, Pause, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

type Scope = 'all' | 'user' | 'ids';

interface ItemLog {
  id: string;
  name: string | null;
  result: 'found' | 'none' | 'skipped' | 'transient';
  source: string | null;
  durationMs: number;
}

interface BatchResponse {
  scanned: number;
  updated: number;
  skippedAlreadyAttempted: number;
  failedTransient: number;
  nextCursor: string | null;
  dryRun: boolean;
  items: ItemLog[];
}

export function RecoverImagesPanel() {
  const [scope, setScope] = useState<Scope>('all');
  const [userId, setUserId] = useState('');
  const [idsText, setIdsText] = useState('');
  const [dryRun, setDryRun] = useState(true);
  const [force, setForce] = useState(false);
  const [retryStaleDays, setRetryStaleDays] = useState(30);
  const [batchSize, setBatchSize] = useState(50);

  const [running, setRunning] = useState(false);
  const stopRef = useRef(false);

  const [totals, setTotals] = useState({
    scanned: 0,
    updated: 0,
    skippedAlreadyAttempted: 0,
    failedTransient: 0,
    waves: 0,
  });
  const [recentItems, setRecentItems] = useState<ItemLog[]>([]);

  const reset = () => {
    setTotals({ scanned: 0, updated: 0, skippedAlreadyAttempted: 0, failedTransient: 0, waves: 0 });
    setRecentItems([]);
  };

  const start = async () => {
    if (running) return;
    if (scope === 'user' && !userId.trim()) {
      toast.error('Indica un userId para scope=user');
      return;
    }
    let locationIds: string[] | undefined;
    if (scope === 'ids') {
      locationIds = idsText
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (locationIds.length === 0) {
        toast.error('Pega al menos un ID');
        return;
      }
    }

    reset();
    setRunning(true);
    stopRef.current = false;

    let cursor: string | null = null;
    try {
      while (!stopRef.current) {
        const { data, error } = await supabase.functions.invoke<BatchResponse>(
          'recover-missing-images',
          {
            body: {
              scope,
              userId: scope === 'user' ? userId.trim() : undefined,
              locationIds,
              batchSize,
              dryRun,
              force,
              retryStaleDays,
              cursor: cursor ?? undefined,
            },
          },
        );

        if (error || !data) {
          toast.error('Error en lote', { description: error?.message ?? 'sin respuesta' });
          break;
        }

        setTotals((t) => ({
          scanned: t.scanned + data.scanned,
          updated: t.updated + data.updated,
          skippedAlreadyAttempted: t.skippedAlreadyAttempted + data.skippedAlreadyAttempted,
          failedTransient: t.failedTransient + data.failedTransient,
          waves: t.waves + 1,
        }));
        setRecentItems((prev) => [...data.items, ...prev].slice(0, 30));

        if (!data.nextCursor) {
          toast.success(dryRun ? 'Dry-run completado' : 'Recuperación completada');
          break;
        }
        cursor = data.nextCursor;
      }
    } finally {
      setRunning(false);
      stopRef.current = false;
    }
  };

  const stop = () => {
    stopRef.current = true;
  };

  return (
    <section className="border rounded-lg bg-card">
      <header className="flex items-center gap-2 p-3 border-b">
        <ImageIcon className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Recuperar imágenes faltantes</h3>
        <Badge variant="secondary" className="text-xs">retroactivo</Badge>
      </header>

      <div className="p-4 space-y-4">
        <p className="text-xs text-muted-foreground">
          Reintenta búsqueda multi-fuente (Wikipedia, Commons, Wikidata, Openverse) para POIs
          ya enriquecidos sin cover_url. Empieza siempre con dry-run para medir cobertura.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Alcance</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as Scope)} disabled={running}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los POIs sin imagen</SelectItem>
                <SelectItem value="user">Un usuario concreto</SelectItem>
                <SelectItem value="ids">Lista de IDs</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Tamaño de lote</Label>
            <Input
              type="number"
              value={batchSize}
              min={1}
              max={200}
              onChange={(e) => setBatchSize(Math.min(200, Math.max(1, Number(e.target.value) || 50)))}
              disabled={running}
              className="h-8 text-sm"
            />
          </div>
        </div>

        {scope === 'user' && (
          <div className="space-y-1.5">
            <Label className="text-xs">User ID</Label>
            <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="uuid"
              disabled={running} className="h-8 text-sm font-mono" />
          </div>
        )}

        {scope === 'ids' && (
          <div className="space-y-1.5">
            <Label className="text-xs">Location IDs (separados por coma o salto de línea)</Label>
            <textarea
              value={idsText}
              onChange={(e) => setIdsText(e.target.value)}
              disabled={running}
              rows={4}
              className="w-full text-xs font-mono border rounded p-2 bg-background"
            />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
          <div className="flex items-center gap-2">
            <Switch checked={dryRun} onCheckedChange={setDryRun} disabled={running} id="dryrun" />
            <Label htmlFor="dryrun" className="text-sm cursor-pointer">
              Dry-run (no escribe en BD)
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={force} onCheckedChange={setForce} disabled={running} id="force" />
            <Label htmlFor="force" className="text-sm cursor-pointer flex items-center gap-1.5">
              Forzar (ignora intentos previos)
              {force && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
            </Label>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">
              Reintentar tras: <span className="font-mono">{retryStaleDays}</span> días
            </Label>
          </div>
          <Slider
            value={[retryStaleDays]}
            onValueChange={(v) => setRetryStaleDays(v[0])}
            min={0}
            max={180}
            step={1}
            disabled={running || force}
          />
        </div>

        <div className="flex items-center gap-2">
          {!running ? (
            <Button onClick={start} className="gap-2">
              <Play className="w-4 h-4" />
              {dryRun ? 'Ejecutar dry-run' : 'Recuperar imágenes'}
            </Button>
          ) : (
            <Button onClick={stop} variant="secondary" className="gap-2">
              <Pause className="w-4 h-4" />
              Detener tras lote actual
            </Button>
          )}
          {running && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        </div>

        {(totals.scanned > 0 || running) && (
          <div className="border rounded p-3 bg-muted/30 space-y-2">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
              <Stat label="Lotes" value={totals.waves} />
              <Stat label="Escaneados" value={totals.scanned} />
              <Stat label={dryRun ? 'Encontrarían' : 'Actualizados'} value={totals.updated} tone="success" />
              <Stat label="Saltados" value={totals.skippedAlreadyAttempted} />
              <Stat label="Errores transitorios" value={totals.failedTransient} tone={totals.failedTransient ? 'warn' : undefined} />
            </div>
            {totals.scanned > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Tasa éxito: {((totals.updated / totals.scanned) * 100).toFixed(1)}% del escaneado
              </p>
            )}
          </div>
        )}

        {recentItems.length > 0 && (
          <div className="border rounded">
            <div className="text-xs font-semibold px-3 py-2 border-b bg-muted/30">
              Últimos {recentItems.length} POIs
            </div>
            <ul className="max-h-64 overflow-y-auto divide-y text-xs">
              {recentItems.map((it, i) => (
                <li key={`${it.id}-${i}`} className="px-3 py-1.5 flex items-center gap-2">
                  <ResultBadge result={it.result} />
                  <span className="flex-1 truncate">{it.name ?? it.id}</span>
                  {it.source && <code className="text-[10px] text-muted-foreground">{it.source}</code>}
                  <span className="text-[10px] text-muted-foreground">{it.durationMs}ms</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'success' | 'warn' }) {
  const color =
    tone === 'success' ? 'text-emerald-600 dark:text-emerald-400'
    : tone === 'warn' ? 'text-amber-600 dark:text-amber-400'
    : 'text-foreground';
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className={`font-mono text-base font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function ResultBadge({ result }: { result: ItemLog['result'] }) {
  const map: Record<ItemLog['result'], { label: string; cls: string }> = {
    found: { label: 'OK', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
    none: { label: '—', cls: 'bg-muted text-muted-foreground' },
    skipped: { label: 'SKIP', cls: 'bg-muted text-muted-foreground' },
    transient: { label: 'RETRY', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  };
  const m = map[result];
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${m.cls}`}>{m.label}</span>;
}
