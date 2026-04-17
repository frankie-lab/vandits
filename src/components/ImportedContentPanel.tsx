/**
 * ImportedContentPanel — Panel unificado de "Contenido importado".
 *
 * Agrupa las tres entradas que antes vivían sueltas en el menú de usuario
 * (Subir archivos, Fotos OneDrive, Documentos importados) bajo una jerarquía
 * conceptual de dos niveles:
 *
 *   FUENTES  (origen del contenido)
 *     - Archivos      → FileUploadZone
 *     - Fotos OneDrive → OneDrivePhotosPanel
 *
 *   BIBLIOTECA (resultado / gestión de lo importado)
 *     - Documentos importados → DocumentsPanel
 *
 * No reescribe la lógica interna de los componentes hijos: solo cambia el
 * contenedor y la jerarquía visual. Los componentes siguen siendo autónomos.
 *
 * Ver: mem://ui/imported-content-panel
 */
import { FolderOpen, Upload, Cloud, FileStack } from 'lucide-react';
import { FloatingPanel } from '@/components/FloatingPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
    <FloatingPanel
      title="Contenido"
      icon={<FolderOpen className="w-4 h-4 text-primary" />}
      isOpen={isOpen}
      onClose={onClose}
      position="right"
    >
      <Tabs
        value={defaultTab}
        onValueChange={(v) => onTabChange?.(v as ImportedContentTab)}
        className="flex flex-col h-full min-h-0"
      >
        {/* Encabezados agrupados: dos secciones en el mismo Tabs controlado.
            Mantenemos un solo TabsList por accesibilidad de Radix, pero lo
            visualmente dividimos con un separador + label para reflejar la
            jerarquía Fuentes vs Biblioteca. */}
        <div className="px-3 pt-3 pb-2 border-b bg-muted/30 shrink-0 space-y-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">
              Fuentes
            </p>
            <TabsList className="grid grid-cols-2 w-full h-auto bg-muted/60">
              <TabsTrigger value="upload" className="gap-1.5 text-xs py-1.5">
                <Upload className="w-3.5 h-3.5" />
                Archivos
              </TabsTrigger>
              <TabsTrigger value="onedrive" className="gap-1.5 text-xs py-1.5">
                <Cloud className="w-3.5 h-3.5" />
                OneDrive
              </TabsTrigger>
            </TabsList>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">
              Biblioteca
            </p>
            <TabsList className="grid grid-cols-1 w-full h-auto bg-muted/60">
              <TabsTrigger value="documents" className="gap-1.5 text-xs py-1.5">
                <FileStack className="w-3.5 h-3.5" />
                Documentos importados
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          <TabsContent value="upload" className="h-full m-0 overflow-y-auto p-4">
            <FileUploadZone onUploadComplete={onClose} />
          </TabsContent>

          <TabsContent value="onedrive" className="h-full m-0 overflow-hidden">
            <OneDrivePhotosPanel />
          </TabsContent>

          <TabsContent value="documents" className="h-full m-0 overflow-hidden">
            <DocumentsPanel />
          </TabsContent>
        </div>
      </Tabs>
    </FloatingPanel>
  );
}
