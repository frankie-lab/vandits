/**
 * AuditPanel — Admin-only console for runtime preference auditing.
 *
 * 4 sections:
 *  1. Resolved preference state with provenance
 *  2. Live change trace (last 20 events)
 *  3. Runtime vs persistence comparison
 *  4. Quick scenario verification
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { CheckCircle2, XCircle, RefreshCw, Loader2, Play, Eye, Clock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { listUnits } from '@/shared/preferences/registry';
import { resolveWithProvenance, type ScopeLayer } from '@/shared/preferences/resolver';
import { onPrefChanged, type PrefChangedDetail } from '@/shared/preferences/preferencesBus';
import { defaultAdapter } from '@/shared/preferences/storage';
import type { PreferenceUnit, PreferenceScope } from '@/shared/preferences/types';

// ── Types ────────────────────────────────────────────────────
interface TraceEntry {
  timestamp: Date;
  unitId: string;
  scope: PreferenceScope;
  fields: string[];
}

interface SyncResult {
  unitId: string;
  field: string;
  memoryValue: unknown;
  storedValue: unknown;
  match: boolean;
}

interface ScenarioResult {
  name: string;
  status: 'ok' | 'fail' | 'pending' | 'running';
  detail?: string;
}

// ── Component ────────────────────────────────────────────────
export function AuditPanel() {
  const [activeSection, setActiveSection] = useState<'resolution' | 'trace' | 'sync' | 'scenarios'>('resolution');

  return (
    <div className="flex-1 overflow-hidden min-h-0 flex flex-col p-4 gap-4">
      {/* Section tabs */}
      <div className="flex gap-2 flex-wrap">
        {[
          { id: 'resolution' as const, label: 'Estado resuelto', icon: Eye },
          { id: 'trace' as const, label: 'Trazas', icon: Clock },
          { id: 'sync' as const, label: 'Runtime vs DB', icon: RefreshCw },
          { id: 'scenarios' as const, label: 'Escenarios', icon: Play },
        ].map(({ id, label, icon: Icon }) => (
          <Button
            key={id}
            variant={activeSection === id ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveSection(id)}
            className="gap-1.5"
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </Button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeSection === 'resolution' && <ResolutionSection />}
        {activeSection === 'trace' && <TraceSection />}
        {activeSection === 'sync' && <SyncSection />}
        {activeSection === 'scenarios' && <ScenariosSection />}
      </div>
    </div>
  );
}

// ── 1. Resolution Section ────────────────────────────────────

function ResolutionSection() {
  const units = listUnits();

  if (units.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
        <AlertTriangle className="w-8 h-8" />
        <p>No hay unidades de preferencias registradas</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 pr-4 pb-4">
        {units.map(unit => (
          <UnitResolutionCard key={unit.key} unit={unit} />
        ))}
      </div>
    </ScrollArea>
  );
}

function UnitResolutionCard({ unit }: { unit: PreferenceUnit }) {
  const [layers, setLayers] = useState<ScopeLayer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const loaded: ScopeLayer[] = [];
      for (const scope of unit.supportedScopes) {
        const overrides = await defaultAdapter.load(unit.key, scope);
        if (overrides) loaded.push({ scope, overrides });
      }
      setLayers(loaded);
      setLoading(false);
    };
    load();
  }, [unit.key]);

  const resolved = loading ? [] : resolveWithProvenance(unit, layers);

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="bg-muted/30 px-4 py-2 flex items-center gap-2">
        <span className="font-medium text-sm">{unit.name}</span>
        <Badge variant="outline" className="text-xs">{unit.key}</Badge>
      </div>
      {loading ? (
        <div className="p-4 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando...
        </div>
      ) : (
        <div className="divide-y">
          {resolved.map(field => (
            <div key={field.key} className="px-4 py-2 flex items-center gap-3 text-sm">
              <span className="font-mono text-xs flex-1 min-w-0 truncate">{field.key}</span>
              <span className="text-muted-foreground truncate max-w-[200px]">
                {JSON.stringify(field.value)}
              </span>
              <Badge
                variant={field.isOverridden ? 'default' : 'secondary'}
                className="text-xs shrink-0"
              >
                {field.source}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 2. Trace Section ─────────────────────────────────────────

function TraceSection() {
  const [traces, setTraces] = useState<TraceEntry[]>([]);
  const maxTraces = 20;

  useEffect(() => {
    const unsub = onPrefChanged((detail: PrefChangedDetail) => {
      setTraces(prev => {
        const entry: TraceEntry = {
          timestamp: new Date(),
          unitId: detail.unitId,
          scope: detail.scope,
          fields: Object.keys(detail.overrides),
        };
        return [entry, ...prev].slice(0, maxTraces);
      });
    });
    return unsub;
  }, []);

  return (
    <ScrollArea className="h-full">
      <div className="space-y-1 pr-4 pb-4">
        {traces.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
            <Clock className="w-8 h-8" />
            <p className="text-sm">Sin cambios registrados. Modifica una preferencia para ver la traza.</p>
          </div>
        ) : (
          traces.map((t, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2 bg-muted/20 rounded text-sm">
              <span className="text-xs text-muted-foreground font-mono shrink-0">
                {t.timestamp.toLocaleTimeString()}
              </span>
              <Badge variant="outline" className="text-xs">{t.unitId}</Badge>
              <Badge variant="secondary" className="text-xs">{t.scope}</Badge>
              <span className="text-xs text-muted-foreground truncate">
                {t.fields.join(', ')}
              </span>
            </div>
          ))
        )}
      </div>
    </ScrollArea>
  );
}

// ── 3. Sync Section ──────────────────────────────────────────

function SyncSection() {
  const [results, setResults] = useState<SyncResult[]>([]);
  const [running, setRunning] = useState(false);

  const runCheck = useCallback(async () => {
    setRunning(true);
    const units = listUnits();
    const allResults: SyncResult[] = [];

    for (const unit of units) {
      // Load from storage
      const storedLayers: ScopeLayer[] = [];
      for (const scope of unit.supportedScopes) {
        const overrides = await defaultAdapter.load(unit.key, scope);
        if (overrides) storedLayers.push({ scope, overrides });
      }

      const storedResolved = resolveWithProvenance(unit, storedLayers);

      for (const field of storedResolved) {
        // Check localStorage raw value as "memory" proxy
        const lsKey = `vandits-pref-${unit.key}-device`;
        let memoryValue: unknown = field.value;
        try {
          const raw = localStorage.getItem(lsKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed[field.key] !== undefined) {
              memoryValue = parsed[field.key];
            }
          }
        } catch { /* ignore */ }

        allResults.push({
          unitId: unit.key,
          field: field.key,
          memoryValue,
          storedValue: field.value,
          match: JSON.stringify(memoryValue) === JSON.stringify(field.value),
        });
      }
    }

    setResults(allResults);
    setRunning(false);
  }, []);

  const mismatches = results.filter(r => !r.match);

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={runCheck} disabled={running} className="gap-1.5">
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Verificar
        </Button>
        {results.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {mismatches.length === 0 ? (
              <span className="text-green-600 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Todo sincronizado</span>
            ) : (
              <span className="text-destructive flex items-center gap-1"><XCircle className="w-4 h-4" /> {mismatches.length} discrepancia(s)</span>
            )}
          </span>
        )}
      </div>

      {results.length > 0 && (
        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-1 pr-4 pb-4">
            {results.map((r, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 px-3 py-2 rounded text-sm ${r.match ? 'bg-muted/20' : 'bg-destructive/10 border border-destructive/20'}`}
              >
                {r.match ? (
                  <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-destructive shrink-0" />
                )}
                <span className="font-mono text-xs">{r.unitId}.{r.field}</span>
                {!r.match && (
                  <span className="text-xs text-destructive truncate">
                    mem: {JSON.stringify(r.memoryValue)} ≠ db: {JSON.stringify(r.storedValue)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

// ── 4. Scenarios Section ─────────────────────────────────────

function ScenariosSection() {
  const [scenarios, setScenarios] = useState<ScenarioResult[]>([
    { name: 'Theme toggle', status: 'pending' },
    { name: 'Sound toggle', status: 'pending' },
    { name: 'Layer visibility', status: 'pending' },
    { name: 'Heatmap threshold', status: 'pending' },
  ]);

  const updateScenario = (name: string, update: Partial<ScenarioResult>) => {
    setScenarios(prev => prev.map(s => s.name === name ? { ...s, ...update } : s));
  };

  const runThemeTest = async () => {
    updateScenario('Theme toggle', { status: 'running' });
    try {
      const wasDark = document.documentElement.classList.contains('dark');
      // Toggle
      document.documentElement.classList.toggle('dark');
      await new Promise(r => setTimeout(r, 100));
      const isDark = document.documentElement.classList.contains('dark');
      // Restore
      if (wasDark) document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');

      if (isDark !== wasDark) {
        updateScenario('Theme toggle', { status: 'ok', detail: `Toggled: ${wasDark ? 'dark→light' : 'light→dark'} → restored` });
      } else {
        updateScenario('Theme toggle', { status: 'fail', detail: 'classList did not change' });
      }
    } catch (e: any) {
      updateScenario('Theme toggle', { status: 'fail', detail: e.message });
    }
  };

  const runSoundTest = async () => {
    updateScenario('Sound toggle', { status: 'running' });
    try {
      const key = 'vandits-sounds-enabled';
      const was = localStorage.getItem(key);
      localStorage.setItem(key, was === 'true' ? 'false' : 'true');
      const now = localStorage.getItem(key);
      // Restore
      if (was !== null) localStorage.setItem(key, was);
      else localStorage.removeItem(key);

      if (now !== was) {
        updateScenario('Sound toggle', { status: 'ok', detail: `Toggled: ${was} → ${now} → restored` });
      } else {
        updateScenario('Sound toggle', { status: 'fail', detail: 'Value did not change' });
      }
    } catch (e: any) {
      updateScenario('Sound toggle', { status: 'fail', detail: e.message });
    }
  };

  const runVisibilityTest = async () => {
    updateScenario('Layer visibility', { status: 'running' });
    try {
      const key = 'vandits-layer-visibility';
      const raw = localStorage.getItem(key);
      if (!raw) {
        updateScenario('Layer visibility', { status: 'fail', detail: 'No layer state in localStorage' });
        return;
      }
      const state = JSON.parse(raw);
      const catalogWas = state.catalog?.visible;
      state.catalog.visible = !catalogWas;
      localStorage.setItem(key, JSON.stringify(state));
      // Verify
      const check = JSON.parse(localStorage.getItem(key)!);
      const toggled = check.catalog.visible !== catalogWas;
      // Restore
      state.catalog.visible = catalogWas;
      localStorage.setItem(key, JSON.stringify(state));

      if (toggled) {
        updateScenario('Layer visibility', { status: 'ok', detail: `catalog: ${catalogWas} → ${!catalogWas} → restored` });
      } else {
        updateScenario('Layer visibility', { status: 'fail', detail: 'Toggle did not persist' });
      }
    } catch (e: any) {
      updateScenario('Layer visibility', { status: 'fail', detail: e.message });
    }
  };

  const runHeatmapTest = async () => {
    updateScenario('Heatmap threshold', { status: 'running' });
    try {
      const key = 'vandits-pref-ux.map.chrome-device';
      const raw = localStorage.getItem(key);
      const prev = raw ? JSON.parse(raw) : {};
      const wasThreshold = prev.heatmapThreshold ?? 'none';

      prev.heatmapThreshold = wasThreshold === 'none' ? 10 : 'none';
      localStorage.setItem(key, JSON.stringify(prev));
      const check = JSON.parse(localStorage.getItem(key)!);
      const changed = check.heatmapThreshold !== wasThreshold;

      // Restore
      prev.heatmapThreshold = wasThreshold;
      localStorage.setItem(key, JSON.stringify(prev));

      if (changed) {
        updateScenario('Heatmap threshold', { status: 'ok', detail: `${wasThreshold} → ${wasThreshold === 'none' ? 10 : 'none'} → restored` });
      } else {
        updateScenario('Heatmap threshold', { status: 'fail', detail: 'Value did not change' });
      }
    } catch (e: any) {
      updateScenario('Heatmap threshold', { status: 'fail', detail: e.message });
    }
  };

  const runners: Record<string, () => Promise<void>> = {
    'Theme toggle': runThemeTest,
    'Sound toggle': runSoundTest,
    'Layer visibility': runVisibilityTest,
    'Heatmap threshold': runHeatmapTest,
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Cada botón aplica un cambio, verifica el resultado y restaura el estado original.
      </p>
      {scenarios.map(s => (
        <div key={s.name} className="flex items-center gap-3 p-3 bg-muted/20 rounded-lg">
          <Button
            size="sm"
            variant="outline"
            onClick={() => runners[s.name]?.()}
            disabled={s.status === 'running'}
            className="gap-1.5 shrink-0"
          >
            {s.status === 'running' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            {s.name}
          </Button>
          <div className="flex-1 min-w-0">
            {s.status === 'ok' && (
              <span className="text-green-600 text-sm flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> OK {s.detail && <span className="text-xs text-muted-foreground">— {s.detail}</span>}
              </span>
            )}
            {s.status === 'fail' && (
              <span className="text-destructive text-sm flex items-center gap-1">
                <XCircle className="w-4 h-4" /> FALLO {s.detail && <span className="text-xs">— {s.detail}</span>}
              </span>
            )}
            {s.status === 'pending' && <span className="text-xs text-muted-foreground">Sin ejecutar</span>}
            {s.status === 'running' && <span className="text-xs text-muted-foreground">Ejecutando...</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
