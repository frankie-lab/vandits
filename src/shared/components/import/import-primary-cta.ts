/**
 * PR-IMPORT-UX-4 — contrato canónico para elevar la CTA primaria de cada
 * fuente de importación (Archivos · Web · Imágenes) al `PanelFooter` del
 * panel padre `ImportedContentPanel`.
 *
 * Reglas duras del canon:
 *   - Footer SIEMPRE contiene la acción principal real de la vista (no
 *     decorativo). Ver `docs/contracts/import-canon.md` §8 (PR-IMPORT-UX-4).
 *   - Una sola CTA primaria por footer.
 *   - Si está disabled, `disabledReason` es obligatorio (tooltip explícito,
 *     canon `mem://ui/selector-interaction-contract`).
 *   - El componente hijo SIGUE siendo dueño de su lógica: el padre sólo
 *     pinta el botón y delega en `submit()`.
 */

export interface ImportPrimaryCtaState {
  /** Texto exacto del botón (sin emojis). */
  label: string;
  /** Disparador real. Idempotente respecto a re-clicks. */
  submit: () => void;
  /** `true` si el botón debe estar habilitado. */
  canSubmit: boolean;
  /** `true` cuando hay una operación en curso (muestra spinner). */
  isProcessing: boolean;
  /** Razón humana para tooltip cuando `canSubmit=false`. Obligatoria si disabled. */
  disabledReason?: string;
}

/** Estado "noop" inicial (mientras el hijo no ha emitido todavía). */
export const EMPTY_PRIMARY_CTA: ImportPrimaryCtaState = {
  label: '',
  submit: () => {},
  canSubmit: false,
  isProcessing: false,
  disabledReason: 'Cargando…',
};
