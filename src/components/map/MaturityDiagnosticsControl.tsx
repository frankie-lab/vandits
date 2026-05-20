/**
 * MaturityDiagnosticsControl — Toggle del overlay POI-Maturity (admin-only).
 *
 * v1.2.22: leyenda larga retirada de la esquina inferior izquierda.
 * Este componente sólo expone el botón ON/OFF. La leyenda compacta de
 * colores POI-0..POI-10 vive ahora en la barra inferior derecha
 * (`LocationMap` → status pill), junto a la leyenda base del marker.
 *
 * Defensa en profundidad: además del gating en `LocationMap`, este
 * componente verifica `allowed` internamente.
 */

import { Gauge } from 'lucide-react';
import { usePoiMaturityDiagnostics } from '@/hooks/use-poi-maturity-diagnostics';

export default function MaturityDiagnosticsControl() {
  const { enabled, allowed, setEnabled } = usePoiMaturityDiagnostics();

  if (!allowed) return null;

  return (
    <div className="absolute bottom-12 left-4 z-[999]">
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
    </div>
  );
}
