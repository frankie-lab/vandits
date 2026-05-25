/**
 * ImportedContentPanel — Panel "Fuentes de importación" (PR-IMPORT-UX-3).
 *
 * Reemplaza el rediseño wizard de PR-IMPORT-UX-2 (rechazado por el usuario
 * por no ofrecer fuentes claras ni histórico contextual). Vuelve al modelo
 * canónico de TRES pestañas operativas alineadas con `docs/contracts/import-canon.md`:
 *
 *   1. Archivos   → FileUploadZone + histórico de archivos importados
 *   2. Web        → WebImportPanel + histórico de jobs/webs procesadas
 *   3. Imágenes   → OneDrivePhotosPanel (provider OneDrive) + índice GPS
 *
 * Reglas duras (PR-IMPORT-UX-3):
 *   - Título del panel: "Fuentes de importación" (NO "Contenido").
 *   - Tabs principales exactas: Archivos · Web · Imágenes. Sin más.
 *   - "OneDrive · fotos" NO es tab principal: OneDrive es proveedor
 *     dentro de Imágenes.
 *   - "Biblioteca / Documentos importados" NO compite como tab principal;
 *     vive contextual dentro de Archivos (DocumentsPanel filtrado).
 *   - No hub de cards. No wizard. No stepper de 5 pasos.
 *
 * Compat con menú existente (`defaultTab`):
 *   upload    → archivos
 *   web       → web
 *   onedrive  → imagenes
 *   documents → archivos (el histórico vive ahí)
 *
 * Ver:
 *   - mem://logic/import/import-canon
 *   - docs/contracts/import-canon.md §8 (PR-IMPORT-UX-3)
 */
import { useState, useEffect } from 'react';
import { FolderOpen, FileText, Globe, Image as ImageIcon } from 'lucide-react';
import { PanelShell } from '@/shared/components/ui/panel';
import { PanelTabs } from '@/shared/components/ui/panel/PanelTabs';
import { FileUploadZone, DocumentsPanel } from '@/domains/content/components';
import { WebImportPanel } from '@/domains/content/components/WebImportPanel';
import { OneDrivePhotosPanel } from '@/components/OneDrivePhotosPanel';

export type ImportedContentTab = 'upload' | 'web' | 'onedrive' | 'documents';

/** Canon interno: 3 fuentes. */
type SourceTab = 'archivos' | 'web' | 'imagenes';

const FILE_SOURCE_TYPES = ['kml', 'kmz', 'gpx', 'geojson', 'csv'];

interface ImportedContentPanelProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: ImportedContentTab;
  onTabChange?: (tab: ImportedContentTab) => void;
}

function legacyToSource(tab: ImportedContentTab | undefined): SourceTab {
  switch (tab) {
    case 'web': return 'web';
    case 'onedrive': return 'imagenes';
    case 'upload':
    case 'documents':
    default:
      return 'archivos';
  }
}

function sourceToLegacy(tab: SourceTab): ImportedContentTab {
  switch (tab) {
    case 'web': return 'web';
    case 'imagenes': return 'onedrive';
    case 'archivos':
    default:
      return 'upload';
  }
}

export function ImportedContentPanel({
  isOpen,
  onClose,
  defaultTab,
  onTabChange,
}: ImportedContentPanelProps) {
  const [tab, setTab] = useState<SourceTab>(() => legacyToSource(defaultTab));

  useEffect(() => {
    setTab(legacyToSource(defaultTab));
  }, [defaultTab]);

  const handleChange = (next: string) => {
    const t = next as SourceTab;
    setTab(t);
    onTabChange?.(sourceToLegacy(t));
  };

  return (
    <PanelShell
      title="Fuentes de importación"
      icon={<FolderOpen className="w-4 h-4 text-primary" />}
      isOpen={isOpen}
      onClose={onClose}
      variant="library"
      position="right"
    >
      <div
        className="flex-1 min-h-0 flex flex-col overflow-hidden"
        data-import-sources="v3"
      >
        <PanelTabs value={tab} onValueChange={handleChange}>
          <div className="shrink-0 px-[var(--panel-padding-x)] pt-[var(--panel-padding-y)] pb-3">
            <PanelTabs.Group label="Fuentes">
              <PanelTabs.Trigger
                value="archivos"
                icon={<FileText className="w-3.5 h-3.5" />}
                data-import-source-tab="archivos"
              >
                Archivos
              </PanelTabs.Trigger>
              <PanelTabs.Trigger
                value="web"
                icon={<Globe className="w-3.5 h-3.5" />}
                data-import-source-tab="web"
              >
                Web
              </PanelTabs.Trigger>
              <PanelTabs.Trigger
                value="imagenes"
                icon={<ImageIcon className="w-3.5 h-3.5" />}
                data-import-source-tab="imagenes"
              >
                Imágenes
              </PanelTabs.Trigger>
            </PanelTabs.Group>
          </div>

          {/* ARCHIVOS */}
          <PanelTabs.Content
            value="archivos"
            className="flex-1 min-h-0 m-0 flex flex-col data-[state=inactive]:hidden"
            data-import-source-content="archivos"
          >
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="px-[var(--panel-padding-x)] pt-2 pb-4">
                <FileUploadZone onUploadComplete={onClose} />
              </div>
              <div className="border-t" data-import-history="archivos">
                <DocumentsPanel
                  sourceFilter={FILE_SOURCE_TYPES}
                  headerLabel="Archivos importados anteriormente"
                  headerSubtitle="Histórico de KML · KMZ · GPX · GeoJSON · CSV ya importados. Pulsa un archivo para abrirlo o gestionarlo."
                />
              </div>
            </div>
          </PanelTabs.Content>

          {/* WEB */}
          <PanelTabs.Content
            value="web"
            className="flex-1 min-h-0 m-0 flex flex-col data-[state=inactive]:hidden"
            data-import-source-content="web"
          >
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="px-[var(--panel-padding-x)] pt-2 pb-4">
                <WebImportPanel onComplete={onClose} />
              </div>
            </div>
          </PanelTabs.Content>

          {/* IMÁGENES */}
          <PanelTabs.Content
            value="imagenes"
            className="flex-1 min-h-0 m-0 flex flex-col data-[state=inactive]:hidden"
            data-import-source-content="imagenes"
          >
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="shrink-0 px-[var(--panel-padding-x)] pt-2 pb-2 space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Proveedor · OneDrive
                </p>
                <p className="text-xs text-muted-foreground leading-snug">
                  Detecta imágenes con coordenadas GPS (EXIF) en tu OneDrive para
                  relacionarlas con ubicaciones o visitas.
                </p>
              </div>
              <div className="flex-1 min-h-0 flex flex-col">
                <OneDrivePhotosPanel />
              </div>
            </div>
          </PanelTabs.Content>
        </PanelTabs>
      </div>
    </PanelShell>
  );
}
