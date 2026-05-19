/**
 * usePendingValidationEvents
 *
 * Segunda extracción incremental de orquestación desde `src/pages/Index.tsx`
 * (deuda técnica ítem 5). Encapsula el listener global de validaciones
 * pendientes y su estado local:
 *
 * - Evento: `pending-validations-updated`
 * - Payload: `{ count: number; names: string[] }`
 * - Consumido por `FloatingToolbar` (badge + tooltip).
 *
 * Restricciones (contrato invariante):
 * - NO renombra el evento.
 * - NO cambia el payload.
 * - NO cambia el comportamiento observable.
 * - SOLO traslada el `useEffect` + `useState` fuera de `Index.tsx`.
 *
 * Ver `docs/tech-debt.md` ítem 5 y `docs/architecture/global-events.md`.
 */
import { useEffect, useState } from 'react';

export interface PendingValidationEvents {
  pendingValidationsCount: number;
  pendingValidationNames: string[];
}

export function usePendingValidationEvents(): PendingValidationEvents {
  const [pendingValidationsCount, setPendingValidationsCount] = useState(0);
  const [pendingValidationNames, setPendingValidationNames] = useState<string[]>([]);

  useEffect(() => {
    const handleValidationsUpdate = (e: CustomEvent<{ count: number; names: string[] }>) => {
      setPendingValidationsCount(e.detail.count);
      setPendingValidationNames(e.detail.names || []);
    };
    window.addEventListener(
      'pending-validations-updated',
      handleValidationsUpdate as EventListener,
    );
    return () =>
      window.removeEventListener(
        'pending-validations-updated',
        handleValidationsUpdate as EventListener,
      );
  }, []);

  return { pendingValidationsCount, pendingValidationNames };
}
