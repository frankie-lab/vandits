/**
 * ImportSurfaceShell — Carcasa visual común para las tres vías del hub
 * de importación (Archivos · Web · OneDrive fotos).
 *
 * Sólo presentación. No tiene lógica de import, ni hace fetch, ni guarda.
 * Cada vía la envuelve y rellena los slots semánticos A–F definidos en
 * el canon (`docs/contracts/import-canon.md` §5 wording UI):
 *
 *   A. Qué vas a importar   → title + subtitle + icon
 *   B. De dónde viene       → children[slot='source']
 *   C. Qué se va a crear    → children[slot='target']        (opcional)
 *   D. Preview / revisión   → children[slot='preview']       (opcional)
 *   E. Estado / historial   → children[slot='history']       (opcional)
 *   F. Acción principal     → footer prop (opcional)
 *
 * El componente no impone padding lateral (el padre `ImportedContentPanel`
 * ya aplica `--panel-padding-x` en su `PanelTabs.Content`). Sólo aporta
 * gramática visual: header con icono, jerarquía de secciones y footer
 * opcional para CTA primaria.
 *
 * Ver mem://logic/import/import-canon y mem://ui/imported-content-panel.
 */
import type { ReactNode } from 'react';

export interface ImportSurfaceShellProps {
  icon: ReactNode;
  title: string;
  /** Subtítulo descriptivo: qué crea y de qué fuente. */
  subtitle: ReactNode;
  /** Aviso/banner opcional renderizado bajo el header (e.g. condiciones bloqueantes). */
  notice?: ReactNode;
  /** Slot B: input/dropzone/explorador. Opcional cuando el shell se usa sólo como header. */
  source?: ReactNode;
  /** Slot C: destino (visibilidad, colección, etc.). */
  target?: ReactNode;
  /** Slot D: preview de lo que se va a guardar. */
  preview?: ReactNode;
  /** Slot E: estado/historial (jobs, índice, listados). */
  history?: ReactNode;
  /** Slot F: CTA primaria (se renderiza al final, no sticky). */
  footer?: ReactNode;
  /** Test hook. */
  surfaceId?: 'file' | 'web' | 'onedrive';
}

export function ImportSurfaceShell({
  icon,
  title,
  subtitle,
  notice,
  source,
  target,
  preview,
  history,
  footer,
  surfaceId,
}: ImportSurfaceShellProps) {
  return (
    <section
      data-import-surface={surfaceId ?? 'unknown'}
      className="w-full max-w-lg mx-auto space-y-4"
    >
      <header className="flex items-start gap-3" data-import-slot="header">
        <div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground leading-snug mt-0.5">
            {subtitle}
          </p>
        </div>
      </header>

      {notice && (
        <div
          data-import-slot="notice"
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300"
        >
          {notice}
        </div>
      )}

      <div data-import-slot="source">{source}</div>

      {target && <div data-import-slot="target">{target}</div>}

      {preview && <div data-import-slot="preview">{preview}</div>}

      {history && (
        <div data-import-slot="history" className="pt-2 border-t">
          {history}
        </div>
      )}

      {footer && <div data-import-slot="footer">{footer}</div>}
    </section>
  );
}
