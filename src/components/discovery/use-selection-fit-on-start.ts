/**
 * use-selection-fit-on-start.ts — Hook canónico (PR-4A.1).
 *
 * Observa la selección masiva en el modo Seleccionar de FilterBar.
 * Cuando la selección pasa de 0 → N (debounce 250 ms), pide al mapa
 * un fit `if-outside` al subconjunto seleccionado.
 *
 * Reglas:
 *  - Solo dispara el primer fit (intención inicial). Cambios incrementales
 *    1→2, 2→3, etc. NO mueven cámara.
 *  - Si la selección baja a 0 antes de disparar, cancela.
 *  - El listener del mapa aplica clamp z12 + cooldown manual.
 *
 * Ver mem://logic/map/subset-fit-contract.
 */

import { useEffect, useRef } from 'react';
import { requestSubsetFit } from '@/components/map/subset-fit';

const DEBOUNCE_MS = 250;

export function useSelectionFitOnStart(selectedLocations: Set<string>): void {
  const wasEmptyRef = useRef(true);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const count = selectedLocations.size;

    // Selección vaciada: limpiar timeout y rearmar para próxima 0→N.
    if (count === 0) {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      wasEmptyRef.current = true;
      return;
    }

    // Solo el primer fit (transición 0 → N).
    if (!wasEmptyRef.current) return;
    wasEmptyRef.current = false;

    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    const idsAtSchedule = Array.from(selectedLocations);
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      if (idsAtSchedule.length === 0) return;
      requestSubsetFit(idsAtSchedule, {
        mode: 'if-outside',
        reason: 'selection-start',
      });
    }, DEBOUNCE_MS);

    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [selectedLocations]);
}
