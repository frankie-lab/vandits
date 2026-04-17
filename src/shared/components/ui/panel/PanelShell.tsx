/**
 * PanelShell — Carcasa única para TODOS los paneles laterales de VANDITS.
 *
 * Envuelve el contrato actual de `FloatingPanel` (desktop) y `Drawer` (mobile)
 * sin reinventarlo: aprovecha la lógica probada de animación, posicionamiento
 * y mobile-conmute, pero estandariza header, padding y tokens.
 *
 * Variantes:
 *   - 'form'     → edición/configuración (Perfil, Categorías, Ajustes)
 *   - 'library'  → listas/exploración (Documentos, OneDrive, Auditoría)
 *   - 'workflow' → procesos/asistentes (Importar, Validar, Enriquecer)
 *
 * NO debe haber otra carcasa de panel en el proyecto. `FloatingPanel` queda
 * como infra interna; los consumidores deben usar `PanelShell` directamente.
 *
 * Ver ADR: docs/adr/003-panel-system.md
 */
import * as React from 'react';
import { FloatingPanel } from '@/components/FloatingPanel';
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
  /** Contenido del panel. Normalmente: PanelTabs + PanelBody / PanelFooter. */
  children: React.ReactNode;
}

/**
 * Atributo data-panel-variant en el contenedor para hooks de estilo y tests.
 */
export function PanelShell({
  title,
  icon,
  isOpen,
  onClose,
  variant,
  position = 'right',
  topOffset,
  className,
  children,
}: PanelShellProps) {
  return (
    <FloatingPanel
      title={title}
      icon={icon}
      isOpen={isOpen}
      onClose={onClose}
      position={position}
      topOffset={topOffset}
      className={className}
    >
      <div
        data-panel-variant={variant}
        className="flex flex-col h-full min-h-0"
      >
        {children}
      </div>
    </FloatingPanel>
  );
}
