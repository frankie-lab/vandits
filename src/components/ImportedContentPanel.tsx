/**
 * ImportedContentPanel — Panel unificado de "Contenido importado".
 *
 * MIGRADO al sistema de paneles canónico (`shared/components/ui/panel`).
 * Este es el PILOTO de validación de la API de PanelShell + PanelTabs.
 *
 * Estructura conceptual (preservada):
 *   FUENTES   → Archivos · OneDrive
 *   BIBLIOTECA → Documentos importados
 *
 * No reescribe la lógica interna de los componentes hijos.
 *
 * Ver: mem://ui/imported-content-panel · mem://ui/panel-system
 *      docs/adr/003-panel-system.md
 */
import { FolderOpen, Upload, Cloud, FileStack } from 'lucide-react';
import {
  PanelShell,
  PanelTabs,
} from '@/shared/components/ui/panel';
import { FileUploadZone } from '@/domains/content/components';
import { DocumentsPanel } from '@/domains/content/components';
import { OneDrivePhotosPanel } from '@/components/OneDrivePhotosPanel';

export type ImportedContentTab = 'upload' | 'onedrive' | 'documents';

interface ImportedContentPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** Pestaña inicial — preserva el atajo directo desde el menú. */
  defaultTab?: ImportedContentTab;
  onTabChange?: (tab: ImportedContentTab) => void;
}

export function ImportedContentPanel({
  isOpen,
  onClose,
  defaultTab = 'documents',
  onTabChange,
}: ImportedContentPanelProps) {
  return (
    <PanelShell
      title="Contenido"
      icon={<FolderOpen className="w-4 h-4 text-primary" />}
      isOpen={isOpen}
      onClose={onClose}
      variant="library"
      position="right"
    >
      <PanelTabs
        value={defaultTab}
        onValueChange={(v) => onTabChange?.(v as ImportedContentTab)}
      >
        {/*
          Header con dos grupos visuales (Fuentes / Biblioteca) compartiendo
          el mismo Tabs controlado. La accesibilidad de Radix se preserva
          porque cada grupo renderiza su propio TabsList pero el estado
          activo es único.
        */}
        <PanelTabs.Header>
          <PanelTabs.Group label="Fuentes">
            <PanelTabs.Trigger value="upload" icon={<Upload className="w-3.5 h-3.5" />}>
              Archivos
            </PanelTabs.Trigger>
            <PanelTabs.Trigger value="onedrive" icon={<Cloud className="w-3.5 h-3.5" />}>
              OneDrive
            </PanelTabs.Trigger>
          </PanelTabs.Group>

          <PanelTabs.Group label="Biblioteca">
            <PanelTabs.Trigger value="documents" icon={<FileStack className="w-3.5 h-3.5" />}>
              Documentos importados
            </PanelTabs.Trigger>
          </PanelTabs.Group>
        </PanelTabs.Header>

        {/*
          Body con un único scroll dominante. Cada TabsContent gestiona su
          propio overflow según sus necesidades (Workflow vs Library).
        */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <PanelTabs.Content
            value="upload"
            className="h-full m-0 overflow-y-auto p-[var(--panel-padding-x)]"
          >
            <FileUploadZone onUploadComplete={onClose} />
          </PanelTabs.Content>

          <PanelTabs.Content
            value="onedrive"
            className="h-full m-0 overflow-hidden flex flex-col data-[state=inactive]:hidden"
          >
            <OneDrivePhotosPanel />
          </PanelTabs.Content>

          <PanelTabs.Content value="documents" className="h-full m-0 overflow-hidden">
            <DocumentsPanel />
          </PanelTabs.Content>
        </div>
      </PanelTabs>
    </PanelShell>
  );
}
