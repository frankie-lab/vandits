/**
 * RecoverImagesPanel — configures + triggers the retroactive
 * `recover-missing-images` job. The actual loop, progress and stop
 * controls live in the global `image-recovery-job-store` and are
 * surfaced by `ImageRecoveryLane` inside the BottomProgressBar.
 *
 * This panel is now stateless w.r.t. progress: it can be closed at any
 * time without aborting the job.
 */
import { useState } from 'react';
import { ImageIcon, Loader2, Play, Pause, AlertTriangle } from 'lucide-react';
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
import {
  useImageRecoveryJobStore,
  type ImageRecoveryScope,
  type ImageRecoveryItemLog,
} from '@/stores/image-recovery-job-store';

export function RecoverImagesPanel() {
  const [scope, setScope] = useState<ImageRecoveryScope>('all');
  const [userId, setUserId] = useState('');
  const [idsText, setIdsText] = useState('');
  const [dryRun, setDryRun] = useState(true);
  const [force, setForce] = useState(false);
  const [retryStaleDays, setRetryStaleDays] = useState(30);
  const [batchSize, setBatchSize] = useState(50);
  // Franjas / tope
  const [maxTotalText, setMaxTotalText] = useState('');
  const [country, setCountry] = useState('');
  const [region, setRegion] = useState('');
  const [zone, setZone] = useState('');
  const [createdBefore, setCreatedBefore] = useState(''); // YYYY-MM-DD
  const [createdAfter, setCreatedAfter] = useState('');

  const job = useImageRecoveryJobStore();
  const running = job.running;

  const start = () => {
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

    const maxTotalNum = maxTotalText.trim() ? Math.max(1, Number(maxTotalText)) : null;

    void useImageRecoveryJobStore.getState().start({
      scope,
      userId: scope === 'user' ? userId.trim() : undefined,
      locationIds,
      batchSize,
      dryRun,
      force,
      retryStaleDays,
      maxTotal: Number.isFinite(maxTotalNum as number) ? maxTotalNum : null,
      country: country.trim() || null,
      region: region.trim() || null,
      zone: zone.trim() || null,
      createdBefore: createdBefore ? `${createdBefore}T00:00:00Z` : null,
      createdAfter: createdAfter ? `${createdAfter}T00:00:00Z` : null,
    });
  };

  const stop = () => useImageRecoveryJobStore.getState().stop();

  return (
    <section className="border rounded-lg bg-card">
      <header className="flex items-center gap-2 p-3 border-b">
        <ImageIcon className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Recuperar imágenes faltantes</h3>
        <Badge variant="secondary" className="text-xs">retroactivo</Badge>
        {running && (
          <Badge variant="outline" className="text-xs ml-auto">
            En marcha · ver barra inferior
          </Badge>
        )}
      </header>

      <div className="p-4 space-y-4">
        <p className="text-xs text-muted-foreground">
          Reintenta búsqueda multi-fuente (Wikipedia, Commons, Wikidata, Openverse) para POIs
          ya enriquecidos sin imagen. Empieza siempre con dry-run para medir cobertura.
          El progreso aparece en la barra inferior y sobrevive al cierre de este panel.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Alcance</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as ImageRecoveryScope)} disabled={running}>
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

        {/* Franjas — opcionales. Reducen el universo a procesar. */}
        <details className="border rounded-md bg-muted/20" open={!!(country || region || zone || createdBefore || createdAfter || maxTotalText)}>
          <summary className="text-xs font-semibold px-3 py-2 cursor-pointer select-none">
            Franjas (opcional) · acotar el universo
          </summary>
          <div className="p-3 space-y-3 border-t">
            <div className="space-y-1.5">
              <Label className="text-xs">Tope total (parar tras N escaneados)</Label>
              <Input
                type="number"
                value={maxTotalText}
                onChange={(e) => setMaxTotalText(e.target.value)}
                placeholder="vacío = sin tope"
                min={1}
                disabled={running}
                className="h-8 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">País</Label>
                <Input
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="ej. España"
                  disabled={running}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Región</Label>
                <Input
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  placeholder="ej. Galicia"
                  disabled={running}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Zona / provincia</Label>
                <Input
                  value={zone}
                  onChange={(e) => setZone(e.target.value)}
                  placeholder="ej. A Coruña"
                  disabled={running}
                  className="h-8 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Creados antes de</Label>
                <Input
                  type="date"
                  value={createdBefore}
                  onChange={(e) => setCreatedBefore(e.target.value)}
                  disabled={running}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Creados después de</Label>
                <Input
                  type="date"
                  value={createdAfter}
                  onChange={(e) => setCreatedAfter(e.target.value)}
                  disabled={running}
                  className="h-8 text-sm"
                />
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Las franjas geográficas usan coincidencia case-insensitive contra los campos
              de texto del POI (country / region / zone). Las franjas por antigüedad filtran
              por <code>created_at</code>.
            </p>
          </div>
        </details>

        <div className="flex items-center gap-2">
          {!running ? (
            <Button onClick={start} className="gap-2">
              <Play className="w-4 h-4" />
              {dryRun ? 'Ejecutar dry-run' : 'Recuperar imágenes'}
            </Button>
          ) : (
            <Button onClick={stop} variant="secondary" className="gap-2" disabled={job.stopping}>
              {job.stopping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pause className="w-4 h-4" />}
              Detener tras lote actual
            </Button>
          )}
          {(job.scanned > 0 || running) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => useImageRecoveryJobStore.getState().reset()}
              disabled={running}
              className="ml-auto"
            >
              Limpiar
            </Button>
          )}
        </div>

        {(job.scanned > 0 || running) && (
          <div className="border rounded p-3 bg-muted/30 space-y-2">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
              <Stat label="Lotes" value={job.waves} />
              <Stat label="Escaneados" value={job.scanned} />
              <Stat
                label={(job.config?.dryRun ?? dryRun) ? 'Encontrarían' : 'Actualizados'}
                value={job.updated}
                tone="success"
              />
              <Stat label="Saltados" value={job.skippedAlreadyAttempted} />
              <Stat
                label="Errores transitorios"
                value={job.failedTransient}
                tone={job.failedTransient ? 'warn' : undefined}
              />
            </div>
            {job.scanned > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Tasa éxito: {((job.updated / job.scanned) * 100).toFixed(1)}% del escaneado
              </p>
            )}
          </div>
        )}

        {job.recentItems.length > 0 && (
          <div className="border rounded">
            <div className="text-xs font-semibold px-3 py-2 border-b bg-muted/30">
              Últimos {job.recentItems.length} POIs
            </div>
            <ul className="max-h-64 overflow-y-auto divide-y text-xs">
              {job.recentItems.map((it, i) => (
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

function ResultBadge({ result }: { result: ImageRecoveryItemLog['result'] }) {
  const map: Record<ImageRecoveryItemLog['result'], { label: string; cls: string }> = {
    found: { label: 'OK', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
    none: { label: '—', cls: 'bg-muted text-muted-foreground' },
    skipped: { label: 'SKIP', cls: 'bg-muted text-muted-foreground' },
    transient: { label: 'RETRY', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  };
  const m = map[result];
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${m.cls}`}>{m.label}</span>;
}
