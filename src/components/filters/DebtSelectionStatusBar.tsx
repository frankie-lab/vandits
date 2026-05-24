/**
 * DebtSelectionStatusBar — DEPRECATED (PR-MAINTAIN-FOOTER-2).
 *
 * El contador de selección local del panel "Con deuda" se renderiza ahora
 * INLINE dentro de la fila superior de contadores (canon "fila de contadores
 * arriba"). Este componente queda como no-op para evitar regresiones de
 * imports legacy.
 *
 * Reemplazo canónico: `TopCounterDebtBadge` en `FilterBar.tsx`.
 */
export function DebtSelectionStatusBar() {
  return null;
}
