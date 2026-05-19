/**
 * usePendingValidationEvents
 *
 * Segunda extracción incremental de orquestación desde `src/pages/Index.tsx`
 * (deuda técnica ítem 5). Encapsula el listener global de validaciones
 * pendientes y su estado local:
 *
 * - Evento: `pending-validations-updated`
 * - Payload: `{ count: number; names?: string[] }`
 * - Consumido por `FloatingToolbar` (badge + tooltip).
 *
 * Migrado en v1.2.7 al helper tipado `addGlobalEventListener`
 * (`src/lib/global-events.ts`). Sin cambios de contrato, payload o efectos.
 */
import { useEffect, useState } from 'react';
import { addGlobalEventListener } from '@/lib/global-events';

export interface PendingValidationEvents {
  pendingValidationsCount: number;
  pendingValidationNames: string[];
}

export function usePendingValidationEvents(): PendingValidationEvents {
  const [pendingValidationsCount, setPendingValidationsCount] = useState(0);
  const [pendingValidationNames, setPendingValidationNames] = useState<string[]>([]);

  useEffect(() => {
    const off = addGlobalEventListener('pending-validations-updated', (detail) => {
      setPendingValidationsCount(detail.count);
      setPendingValidationNames(detail.names ?? []);
    });
    return off;
  }, []);

  return { pendingValidationsCount, pendingValidationNames };
}
