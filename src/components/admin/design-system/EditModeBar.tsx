/**
 * Floating bottom bar shown while in design-system edit mode.
 * Anywhere in the app: lets you discard or publish global token changes.
 */
import { useState } from 'react';
import { Save, X, AlertTriangle } from 'lucide-react';
import { Button } from '@/design-system/primitives/button';
import { useDesignSystemEdit } from '@/design-system/runtime/edit-mode-store';
import { toast } from 'sonner';

export function EditModeBar() {
  const editMode = useDesignSystemEdit((s) => s.editMode);
  const draft = useDesignSystemEdit((s) => s.draft);
  const discard = useDesignSystemEdit((s) => s.discard);
  const publish = useDesignSystemEdit((s) => s.publish);
  const setEditMode = useDesignSystemEdit((s) => s.setEditMode);
  const [busy, setBusy] = useState(false);

  if (!editMode) return null;
  const changeCount = Object.keys(draft).length;

  const onPublish = async () => {
    setBusy(true);
    try {
      await publish();
      toast.success('Tema publicado para todos los usuarios');
    } catch (e) {
      toast.error('No se pudo publicar', { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const onDiscard = () => {
    discard();
    toast.message('Cambios descartados');
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-modal pointer-events-auto">
      <div className="flex items-center gap-3 px-4 py-2 rounded-token-lg border border-border bg-popover/95 backdrop-blur shadow-lg">
        <div className="flex items-center gap-2 text-sm">
          <span className="inline-flex h-2 w-2 rounded-full bg-primary animate-pulse" />
          <span className="font-medium">Editando tema</span>
          {changeCount > 0 ? (
            <span className="text-muted-foreground">
              · {changeCount} cambio{changeCount === 1 ? '' : 's'} sin publicar
            </span>
          ) : (
            <span className="text-muted-foreground">· sin cambios</span>
          )}
        </div>
        <div className="h-5 w-px bg-border" />
        <Button
          size="sm"
          variant="ghost"
          onClick={onDiscard}
          disabled={busy || changeCount === 0}
        >
          <X className="w-3.5 h-3.5 mr-1" />
          Descartar
        </Button>
        <Button size="sm" variant="cta" onClick={onPublish} disabled={busy || changeCount === 0}>
          <Save className="w-3.5 h-3.5 mr-1" />
          Publicar
        </Button>
        <div className="h-5 w-px bg-border" />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            if (changeCount > 0) {
              if (!confirm('Tienes cambios sin publicar. ¿Salir y descartar?')) return;
              discard();
            }
            setEditMode(false);
          }}
          title="Salir del modo edición"
        >
          Salir
        </Button>
        {changeCount > 0 && (
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
        )}
      </div>
    </div>
  );
}
