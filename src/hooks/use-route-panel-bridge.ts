/**
 * useRoutePanelBridge
 *
 * Tercera extracción incremental desde `src/pages/Index.tsx` (deuda técnica
 * ítem 5). Encapsula el puente bidireccional entre el right-panel registry
 * (`routes` / `routeBuilder`) y el estado interno de `useRouteOrchestration`.
 *
 * Mantiene exactamente el mismo comportamiento de los dos `useEffect` que
 * vivían inline en Index.tsx, incluidas sus dependencias intencionadamente
 * acotadas (con su `eslint-disable-next-line react-hooks/exhaustive-deps`).
 *
 * Restricciones:
 * - NO cambia contratos de eventos ni payloads.
 * - NO toca lógica de `useRouteOrchestration`.
 */
import { useEffect } from 'react';

interface RouteOrchBridge {
  showRoutesPanel: boolean;
  setShowRoutesPanel: (v: boolean) => void;
  showRouteBuilder: boolean;
}

interface UseRoutePanelBridgeParams {
  routesPanelOpen: boolean;
  routeBuilderOpen: boolean;
  routeOrch: RouteOrchBridge;
  open: (panelId: string) => void;
  close: (panelId: string) => void;
}

export function useRoutePanelBridge({
  routesPanelOpen,
  routeBuilderOpen,
  routeOrch,
  open,
  close,
}: UseRoutePanelBridgeParams): void {
  useEffect(() => {
    if (routesPanelOpen !== routeOrch.showRoutesPanel) {
      routeOrch.setShowRoutesPanel(routesPanelOpen);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routesPanelOpen]);

  useEffect(() => {
    if (routeOrch.showRouteBuilder && !routeBuilderOpen) {
      open('routeBuilder');
    } else if (!routeOrch.showRouteBuilder && routeBuilderOpen) {
      close('routeBuilder');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeOrch.showRouteBuilder]);
}
