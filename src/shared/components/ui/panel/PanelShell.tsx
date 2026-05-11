/**
 * PanelShell — Carcasa única para TODOS los paneles laterales de VANDITS.
 *
 * Envuelve `FloatingPanel` (desktop) y `Drawer` (mobile) sin reinventarlos.
 *
 * Variantes:
 *   - 'form'     → edición/configuración (Perfil, Categorías, Ajustes)
 *   - 'library'  → listas/exploración (Documentos, OneDrive, Auditoría)
 *   - 'workflow' → procesos/asistentes (Importar, Validar, Enriquecer)
 *
 * Contrato de loading (DS-UX1A · PR-3):
 *
 *   | hasContent | loading | Render                                              |
 *   |------------|---------|-----------------------------------------------------|
 *   | false      | true    | `loadingFallback` (o default) reemplaza children    |
 *   | true       | true    | Children intactos + spinner en header (no parpadeo) |
 *   | false      | false   | Children (empty state lo maneja la feature)         |
 *   | true       | false   | Children                                            |
 *
 * - `loading` SIEMPRE activa el `AppSpinner` xs a la derecha del título.
 * - `loadingFallback` SOLO reemplaza children cuando `hasContent === false`.
 * - Sin `loadingFallback` y sin contenido → fallback por defecto =
 *   `PanelListSkeleton rows={4}`.
 * - Ningún estado activa `body.is-blocking-load`. Header, tabs y footer
 *   siguen siendo interactivos durante `loading`.
 *
 * Ver memoria: mem://ui/panel-loading-pattern · ADR: docs/adr/003-panel-system.md
 */
import * as React from 'react';
import { FloatingPanel } from '@/components/FloatingPanel';
import { AppSpinner } from '@/shared/components/ui/AppSpinner';
import { PanelListSkeleton } from '@/design-system/patterns/Skeletons';
import type { PanelVariant } from './tokens';

export interface PanelShellProps {
  /** Título mostrado en el header. */
  title: string;
  /** Icono opcional alineado a la izquierda del título. */
  icon?: React.ReactNode;
  /** Estado controlado de apertura. */
  isOpen: boolean;
  /** Callback al cerrar (botón X, overlay, ESC). */
  onClose: () => void;
  /** Variante semántica. Influye en densidad interna, no en estructura. */
  variant: PanelVariant;
  /** Posición lateral (desktop). Mobile siempre usa Drawer inferior. */
  position?: 'left' | 'right';
  /** Offset superior opcional (para coexistir con headers fijos). */
  topOffset?: string;
  /** Clases extra en el contenedor desktop. Mobile las ignora. */
  className?: string;
  /**
   * Marca el panel como en carga. Renderiza un `AppSpinner` xs a la derecha
   * del título. NO bloquea la interacción global ni activa el overlay.
   */
  loading?: boolean;
  /**
   * Fallback renderizado cuando `loading && !hasContent`. Si se omite, se
   * usa `<PanelListSkeleton rows={4} />`. Si `hasContent` es true, los
   * children permanecen visibles aunque `loading` sea true.
   */
  loadingFallback?: React.ReactNode;
  /**
   * Indica si ya hay contenido renderizable. Cuando es `true`, el shell
   * mantiene los children durante un refresh (no parpadea). Cuando es
   * `false` y `loading` es `true`, se muestra `loadingFallback`.
   * Si se omite, se asume `false` (fetch inicial).
   */
  hasContent?: boolean;
  /** Contenido del panel. Normalmente: PanelTabs + PanelBody / PanelFooter. */
  children: React.ReactNode;
}

const DEFAULT_FALLBACK = <PanelListSkeleton rows={4} />;

export function PanelShell({
  title,
  icon,
  isOpen,
  onClose,
  variant,
  position = 'right',
  topOffset,
  className,
  loading = false,
  loadingFallback,
  hasContent = false,
  children,
}: PanelShellProps) {
  const showFallback = loading && !hasContent;
  const headerAccessory = loading ? (
    <span className="inline-flex items-center px-1" aria-hidden>
      <AppSpinner size="xs" />
    </span>
  ) : null;

  return (
    <FloatingPanel
      title={title}
      icon={icon}
      isOpen={isOpen}
      onClose={onClose}
      position={position}
      topOffset={topOffset}
      className={className}
      headerAccessory={headerAccessory}
    >
      <div
        data-panel-variant={variant}
        data-panel-loading={loading ? 'true' : undefined}
        className="flex flex-col h-full min-h-0"
      >
        {showFallback ? (loadingFallback ?? DEFAULT_FALLBACK) : children}
      </div>
    </FloatingPanel>
  );
}
