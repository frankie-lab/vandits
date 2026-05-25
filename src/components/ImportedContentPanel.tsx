/**
 * ImportedContentPanel — Panel "Contenido".
 *
 * PR-IMPORT-UX-2: rediseño real del hub. Ya NO es un PanelTabs con cuatro
 * pestañas. Es un router de vistas:
 *
 *   view = 'hub'    → ImportHub (3 cards canónicas + biblioteca secundaria)
 *   view = 'wizard' → ImportWizardShell con la vía elegida (file | web | onedrive)
 *   view = 'library'→ DocumentsPanel (historial operativo, no es importación)
 *
 * Las tres vías de importación se sienten como un único asistente porque
 * comparten el shell (header, back-to-hub, stepper). La biblioteca queda
 * fuera del flujo principal.
 *
 * Compat: `defaultTab` se mapea al estado nuevo:
 *   upload/web/onedrive → view='wizard' con su channel.
 *   documents           → view='library'.
 *
 * Ver:
 *   - docs/contracts/import-canon.md §5
 *   - mem://logic/import/import-canon
 *   - docs/audits/import-ux-operability.md
 */
import { useState, useEffect } from 'react';
import { FolderOpen, ArrowLeft, FileText, Globe, Cloud } from 'lucide-react';
import { PanelShell } from '@/shared/components/ui/panel';
import { Button } from '@/components/ui/button';
import { FileUploadZone, DocumentsPanel } from '@/domains/content/components';
import { WebImportPanel } from '@/domains/content/components/WebImportPanel';
import { OneDrivePhotosPanel } from '@/components/OneDrivePhotosPanel';
import { ImportHub, type ImportChannelId } from '@/shared/components/import/ImportHub';
import { ImportWizardShell } from '@/shared/components/import/ImportWizardShell';

export type ImportedContentTab = 'upload' | 'web' | 'onedrive' | 'documents';

interface ImportedContentPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Compat con el menú existente: si se pasa una pestaña explícita,
   * entramos directamente al wizard de esa vía o a la biblioteca.
   * Sin valor, abre el hub.
   */
  defaultTab?: ImportedContentTab;
  onTabChange?: (tab: ImportedContentTab) => void;
}

type View = { kind: 'hub' } | { kind: 'wizard'; channel: ImportChannelId } | { kind: 'library' };

function tabToView(tab: ImportedContentTab | undefined): View {
  switch (tab) {
    case 'upload': return { kind: 'wizard', channel: 'file' };
    case 'web': return { kind: 'wizard', channel: 'web' };
    case 'onedrive': return { kind: 'wizard', channel: 'onedrive' };
    case 'documents': return { kind: 'library' };
    default: return { kind: 'hub' };
  }
}

function viewToTab(view: View): ImportedContentTab {
  if (view.kind === 'library') return 'documents';
  if (view.kind === 'wizard') {
    if (view.channel === 'file') return 'upload';
    if (view.channel === 'web') return 'web';
    return 'onedrive';
  }
  return 'upload'; // hub default — caller no debería depender de esto
}

export function ImportedContentPanel({
  isOpen,
  onClose,
  defaultTab,
  onTabChange,
}: ImportedContentPanelProps) {
  const [view, setView] = useState<View>(() => tabToView(defaultTab));

  // Sincronizar cuando el padre cambia defaultTab.
  useEffect(() => {
    setView(tabToView(defaultTab));
  }, [defaultTab]);

  const goHub = () => {
    setView({ kind: 'hub' });
  };

  const goWizard = (channel: ImportChannelId) => {
    setView({ kind: 'wizard', channel });
    onTabChange?.(viewToTab({ kind: 'wizard', channel }));
  };

  const goLibrary = () => {
    setView({ kind: 'library' });
    onTabChange?.('documents');
  };

  return (
    <PanelShell
      title="Contenido"
      icon={<FolderOpen className="w-4 h-4 text-primary" />}
      isOpen={isOpen}
      onClose={onClose}
      variant="library"
      position="right"
    >
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {view.kind === 'hub' && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <ImportHub onSelectChannel={goWizard} onOpenLibrary={goLibrary} />
          </div>
        )}

        {view.kind === 'wizard' && view.channel === 'file' && (
          <ImportWizardShell
            channelId="file"
            icon={<FileText className="w-5 h-5" />}
            title="Importar desde fichero"
            subtitle="KML · KMZ · GPX · GeoJSON · CSV. Te guiamos paso a paso."
            onBackToHub={goHub}
          >
            <FileUploadZone onUploadComplete={onClose} wizardMode />
          </ImportWizardShell>
        )}

        {view.kind === 'wizard' && view.channel === 'web' && (
          <ImportWizardShell
            channelId="web"
            icon={<Globe className="w-5 h-5" />}
            title="Importar desde la web"
            subtitle="Atlas Obscura · KML remoto · NetworkLink. Inmediato o en background."
            onBackToHub={goHub}
          >
            <WebImportPanel onComplete={onClose} wizardMode />
          </ImportWizardShell>
        )}

        {view.kind === 'wizard' && view.channel === 'onedrive' && (
          <ImportWizardShell
            channelId="onedrive"
            icon={<Cloud className="w-5 h-5" />}
            title="Importar fotos desde OneDrive"
            subtitle="Detectamos fotos con GPS para crear ubicaciones."
            onBackToHub={goHub}
          >
            <OneDrivePhotosPanel wizardMode />
          </ImportWizardShell>
        )}

        {view.kind === 'library' && (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="shrink-0 px-[var(--panel-padding-x)] pt-4 pb-2 border-b">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={goHub}
                className="h-7 -ml-2 text-muted-foreground hover:text-foreground"
                data-import-back-to-hub
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                Importar
              </Button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <DocumentsPanel />
            </div>
          </div>
        )}
      </div>
    </PanelShell>
  );
}
