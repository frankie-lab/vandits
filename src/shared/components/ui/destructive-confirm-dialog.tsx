/**
 * DestructiveConfirmDialog — Confirmación fuerte con typed-token (PR-BACKOFFICE-GOVERNANCE F3).
 *
 * Patrón único reutilizable para acciones destructivas del Back Office:
 * el usuario debe TIPEAR un token exacto (case-sensitive) para habilitar
 * el botón de confirmación. Cero ambigüedad, cero clic accidental.
 *
 * NO sustituye a la lógica de preview / dry-run: se compone con ella
 * (el caller puede renderizar children con el resumen previo).
 */

import { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';

interface DestructiveConfirmDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  title: string;
  description?: React.ReactNode;
  /** Token exacto que el usuario debe tipear (case-sensitive). */
  token: string;
  /** Etiqueta del botón confirmador. */
  confirmLabel?: string;
  /** Texto auxiliar antes del input. */
  inputHelper?: string;
  /** Lambda async; el diálogo se cierra al resolverse (caller decide). */
  onConfirm: () => void | Promise<void>;
  /** Inhabilita el botón externamente (p. ej. preview vacío). */
  disabled?: boolean;
  /** Si true, muestra spinner y bloquea cancelar/cerrar. */
  busy?: boolean;
  /** Render adicional dentro del cuerpo (preview, counts, etc.). */
  children?: React.ReactNode;
}

export function DestructiveConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  token,
  confirmLabel = 'Confirmar',
  inputHelper,
  onConfirm,
  disabled = false,
  busy = false,
  children,
}: DestructiveConfirmDialogProps) {
  const [typed, setTyped] = useState('');

  // Reset cuando se abre/cierra
  useEffect(() => {
    if (!open) setTyped('');
  }, [open]);

  const matches = typed === token;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        onOpenChange(next);
      }}
    >
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && (
            <AlertDialogDescription asChild>
              <div className="space-y-3">{description}</div>
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>

        {children}

        <div className="space-y-2 pt-2">
          <label className="text-xs text-muted-foreground block">
            {inputHelper ?? (
              <>
                Para continuar, escribe{' '}
                <code className="px-1 py-0.5 rounded bg-muted text-foreground font-mono text-[11px]">
                  {token}
                </code>{' '}
                exactamente.
              </>
            )}
          </label>
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={token}
            autoFocus
            disabled={busy}
            className="font-mono"
            data-testid="destructive-confirm-token-input"
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={!matches || disabled || busy}
            onClick={(e) => {
              e.preventDefault();
              if (!matches || disabled || busy) return;
              void onConfirm();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
