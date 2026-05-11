/**
 * Floating bottom bar with the publish/discard controls.
 * Visible siempre que haya drafts sin publicar. No depende de un modo edición.
 */
import { useState } from 'react';
import { Save, X, AlertTriangle } from 'lucide-react';
import { Button } from '@/design-system/primitives/button';
import { useDesignSystemEdit } from '@/design-system/runtime/edit-mode-store';
import { toast } from 'sonner';

export function EditModeBar() {
  const draft = useDesignSystemEdit((s) => s.draft);
  const discard = useDesignSystemEdit((s) => s.discard);
  const publish = useDesignSystemEdit((s) => s.publish);
  const [busy, setBusy] = useState(false);

  const changeCount = Object.keys(draft).length;
  if (changeCount === 0) return null;

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
          <span className="font-medium">Cambios sin publicar</span>
          <span className="text-muted-foreground">
            · {changeCount} cambio{changeCount === 1 ? '' : 's'}
          </span>
        </div>
        <div className="h-5 w-px bg-border" />
        <Button size="sm" variant="ghost" onClick={onDiscard} disabled={busy}>
          <X className="w-3.5 h-3.5 mr-1" />
          Descartar
        </Button>
        <Button size="sm" variant="cta" onClick={onPublish} disabled={busy}>
          <Save className="w-3.5 h-3.5 mr-1" />
          Publicar
        </Button>
        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
      </div>
    </div>
  );
}
