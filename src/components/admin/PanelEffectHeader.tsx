/**
 * PanelEffectHeader (PR-BACKOFFICE-UX-CLOSURE-1 — Sec. 3 + Sec. 4).
 *
 * Strip canónico que se inyecta ENCIMA del body de cada panel BackOffice.
 * No es plegable (decisión del usuario: el efecto operativo debe ser visible
 * siempre, no quedar oculto detrás de un disclosure).
 *
 * Composición:
 *   - EffectBadgeRow derivado de la capability del tab
 *   - OperationStatusCard si la capability es 'deferred' (jobs en background)
 *
 * Cableado central:
 *   - AdminRoutePage lo monta para los tabs routeMode='route'
 *   - AdminPanel lo monta para los tabs routeMode='modal'
 *
 * Mantiene la UX consistente sin tocar la lógica interna de cada panel.
 */
import type { Capability } from '@/domains/identity/capabilities';
import { CAPABILITY_META } from './permissions/capability-metadata';
import { EffectBadgeRow, effectsForCapability } from './EffectBadge';
import { OperationStatusCard } from './observability/OperationStatusCard';

/** Mapea capability → opKey estable para localStorage. */
export function operationKeyForCapability(cap: Capability): string {
  return `cap:${cap}`;
}

export interface PanelEffectHeaderProps {
  capability: Capability;
  label?: string;
  className?: string;
}

export function PanelEffectHeader({ capability, label, className }: PanelEffectHeaderProps) {
  const meta = CAPABILITY_META[capability];
  const effects = effectsForCapability(capability);
  const isDeferred = meta?.runtime === 'deferred';

  if (effects.length === 0) return null;

  return (
    <div
      data-panel-effect-header={capability}
      className={`shrink-0 border-b border-border/40 bg-muted/10 px-4 py-2 space-y-2 ${className ?? ''}`}
    >
      <EffectBadgeRow effects={effects} />
      {isDeferred && (
        <OperationStatusCard opKey={operationKeyForCapability(capability)} label={label ?? meta?.label} />
      )}
    </div>
  );
}
