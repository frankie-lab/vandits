/**
 * MaturityDiagnosticsControl — Toggle + leyenda del overlay POI-Maturity.
 *
 * Admin-only: el componente padre (`LocationMap`) sólo lo monta cuando
 * el usuario tiene capability `view_audit_log`. Aun así, este componente
 * verifica `allowed` internamente (defensa en profundidad).
 *
 * Sin emojis. Icono Lucide `Gauge`. Estilo neutro para no confundirse
 * con la paleta canónica del mapa.
 */

import { useState } from 'react';
import { Gauge, ChevronDown, ChevronUp } from 'lucide-react';
import { usePoiMaturityDiagnostics } from '@/hooks/use-poi-maturity-diagnostics';
import { resolveMaturityBadgeStyle } from '@/shared/diagnostics/poi-maturity-overlay';
import type { PoiMaturityLevel } from '@/domains/content/lib/poi-maturity';

const LEGEND: Array<{ level: PoiMaturityLevel; label: string }> = [
  { level: 0,  label: 'Sin dato útil' },
  { level: 1,  label: 'Solo coordenadas' },
  { level: 2,  label: 'Solo nombre' },
  { level: 3,  label: 'Nombre + coords' },
  { level: 4,  label: 'Identidad confirmada' },
  { level: 5,  label: 'País/continente' },
  { level: 6,  label: 'Región/zona' },
  { level: 7,  label: 'Descripción enriquecida' },
  { level: 8,  label: 'Media validada' },
  { level: 9,  label: 'Categoría/tags' },
  { level: 10, label: 'Curado completo' },
];

export default function MaturityDiagnosticsControl() {
  const { enabled, allowed, setEnabled } = usePoiMaturityDiagnostics();
  const [legendOpen, setLegendOpen] = useState<boolean>(true);

  if (!allowed) return null;

  return (
    <div className="absolute bottom-4 left-4 z-[999] flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={() => setEnabled(!enabled)}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium shadow-md backdrop-blur-sm transition-colors ${
          enabled
            ? 'bg-primary text-primary-foreground'
            : 'bg-background/90 text-foreground hover:bg-background'
        }`}
        title="Diagnóstico POI-0..POI-10 (admin)"
        aria-pressed={enabled}
      >
        <Gauge className="h-3.5 w-3.5" />
        Madurez POI {enabled ? 'ON' : 'OFF'}
      </button>

      {enabled && (
        <div className="rounded-lg bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setLegendOpen((v) => !v)}
            className="mb-1 flex items-center gap-1 font-semibold text-foreground"
          >
            Leyenda
            {legendOpen ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronUp className="h-3 w-3" />
            )}
          </button>
          {legendOpen && (
            <ul className="space-y-1">
              {LEGEND.map(({ level, label }) => {
                const { bg } = resolveMaturityBadgeStyle(level);
                return (
                  <li key={level} className="flex items-center gap-2">
                    <span
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white shadow-sm"
                      style={{ background: bg, textShadow: '0 1px 1px rgba(0,0,0,0.5)' }}
                    >
                      {level}
                    </span>
                    <span className="text-muted-foreground">
                      POI-{level} · {label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
