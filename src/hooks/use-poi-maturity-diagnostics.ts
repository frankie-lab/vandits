/**
 * use-poi-maturity-diagnostics — Estado del toggle del overlay POI-Maturity.
 *
 * Tres líneas de defensa contra fuga a usuarios sin capability:
 *   1. Si `useCapability('view_audit_log').allowed === false` → `enabled`
 *      siempre `false`, aunque haya `true` persistido en localStorage de
 *      una sesión previa con permisos.
 *   2. `setEnabled(true)` se rechaza silenciosamente sin capability.
 *   3. El componente UI sólo se renderiza tras chequear `allowed`.
 *
 * Persiste en `localStorage` clave `lovable:diagnostics:poi-maturity`.
 * Emite/escucha evento global `lovable:diagnostics:poi-maturity-changed`
 * para sincronizar entre componentes en la misma sesión.
 */

import { useCallback, useEffect, useState } from 'react';
import { useCapability } from '@/domains/identity/hooks/use-permissions';
import {
  addGlobalEventListener,
  dispatchGlobalEvent,
} from '@/lib/global-events';

const STORAGE_KEY = 'lovable:diagnostics:poi-maturity';

function readStored(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeStored(v: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, v ? '1' : '0');
  } catch {
    /* localStorage no disponible — silencioso */
  }
}

export interface PoiMaturityDiagnosticsApi {
  /** True sólo si capability OK + toggle ON. */
  enabled: boolean;
  /** True si el viewer tiene capability para ver el toggle. */
  allowed: boolean;
  /** Cambia el toggle (no-op si falta capability). */
  setEnabled: (v: boolean) => void;
}

export function usePoiMaturityDiagnostics(): PoiMaturityDiagnosticsApi {
  const { allowed } = useCapability('view_audit_log');
  const [stored, setStored] = useState<boolean>(() => readStored());

  // Sincroniza entre instancias / pestañas vía evento global.
  useEffect(() => {
    const off = addGlobalEventListener(
      'lovable:diagnostics:poi-maturity-changed',
      () => setStored(readStored()),
    );
    return off;
  }, []);

  const setEnabled = useCallback(
    (v: boolean) => {
      if (!allowed) return;
      writeStored(v);
      setStored(v);
      dispatchGlobalEvent('lovable:diagnostics:poi-maturity-changed');
    },
    [allowed],
  );

  return {
    enabled: allowed && stored,
    allowed,
    setEnabled,
  };
}
