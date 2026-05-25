/**
 * ImportedContentPanel — Panel "Fuentes de importación".
 *
 * Estructura canónica (PR-IMPORT-UX-4-FIX rev2):
 *   - Fila 1: 3 pestañas principales (Archivos · Web · Imágenes).
 *   - Fila 2: segmented control contextual INMEDIATAMENTE debajo de fila 1,
 *     dentro de la pestaña activa. Cambia entre vista "acción" e "histórico"
 *     de esa fuente. Labels exactos por fuente:
 *        archivos → Subir archivos     | Histórico de archivos
 *        web      → Seleccionar web    | Jobs recientes
 *        imagenes → Subir imágenes     | Histórico de imágenes
 *   - Footer: SOLO la acción principal de la vista activa. NO navegación.
 *        action  → CTA primaria elevada del hijo
 *        history → CTA de retorno específica (vuelve a vista acción)
 *
 * Reglas duras:
 *   - El cambio de modo (acción/histórico) vive en la fila 2, NUNCA en el footer.
 *   - El footer NUNCA contiene "Ver histórico" ni navegación secundaria.
 *   - Una sola CTA primaria por footer.
 *   - `source_type` filtros: KMZ↔kml (enum no tiene 'kmz'); web → ['web_import'];
 *     imágenes hoy no tiene enum dedicado (sin filtro → empty state explícito).
 *
 * Ver: mem://logic/import/import-canon · docs/contracts/import-canon.md §8.
 */
import { useCallback, useEffect, useState } from 'react';
import { FolderOpen, FileText, Globe, Image as ImageIcon, Loader2 } from 'lucide-react';
import { PanelShell, PanelFooter } from '@/shared/components/ui/panel';
import { PanelTabs } from '@/shared/components/ui/panel/PanelTabs';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { FileUploadZone, DocumentsPanel } from '@/domains/content/components';
import { WebImportPanel } from '@/domains/content/components/WebImportPanel';
import { OneDrivePhotosPanel } from '@/components/OneDrivePhotosPanel';
import { OneDrivePhotoHistoryPanel } from '@/components/OneDrivePhotoHistoryPanel';
import { ScrapeJobsList } from '@/domains/content/components/BackgroundScrapeJobs';
import type { ImportPrimaryCtaState } from '@/shared/components/import/import-primary-cta';
import { EMPTY_PRIMARY_CTA } from '@/shared/components/import/import-primary-cta';

export type ImportedContentTab = 'upload' | 'web' | 'onedrive' | 'documents';

type SourceTab = 'archivos' | 'web' | 'imagenes';
type SubView = 'action' | 'history';

// Filtros canónicos por `documents.source_type` (enum real:
// kml | gpx | geojson | csv | manual | web_import). KMZ se persiste como 'kml'.
const FILE_SOURCE_TYPES = ['kml', 'gpx', 'geojson', 'csv'];
const WEB_SOURCE_TYPES = ['web_import'];
// Imágenes: NO usa `documents` (OneDrive no escribe ahí). El histórico
// se sirve desde `OneDrivePhotoHistoryPanel` leyendo `onedrive_photo_index`.

// Labels exactos del segmented control (fila 2) por fuente.
const SUBVIEW_LABELS: Record<SourceTab, Record<SubView, string>> = {
  archivos: { action: 'Subir archivos', history: 'Histórico de archivos' },
  web:      { action: 'Seleccionar web', history: 'Jobs recientes' },
  imagenes: { action: 'Subir imágenes', history: 'Histórico de imágenes' },
};

// Label exacto de la CTA de retorno (footer en vista histórico) por fuente.
const RETURN_TO_ACTION_LABELS: Record<SourceTab, string> = {
  archivos: 'Subir archivo',
  web: 'Nueva web',
  imagenes: 'Subir imágenes',
};

const HISTORY_EMPTY_COPY: Record<SourceTab, { title: string; hint: string }> = {
  archivos: {
    title: 'No hay archivos importados todavía',
    hint: 'Formatos soportados: KML · KMZ · GPX · GeoJSON · CSV.',
  },
  web: {
    title: 'No hay webs importadas todavía',
    hint: 'Importa una URL desde la vista de acción.',
  },
  imagenes: {
    title: 'No hay imágenes importadas todavía',
    hint: 'Audita tu OneDrive desde la vista de acción.',
  },
};

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

/**
 * Fila 2 — segmented control contextual dentro de la pestaña activa.
 * Vive entre la fila de fuentes y el contenido. NO es navegación de footer.
 */
function SubViewSwitcher({
  source,
  value,
  onChange,
}: {
  source: SourceTab;
  value: SubView;
  onChange: (next: SubView) => void;
}) {
  const labels = SUBVIEW_LABELS[source];
  const triggerClass = (active: boolean) =>
    cn(
      'inline-flex items-center justify-center whitespace-nowrap',
      'rounded-[calc(var(--panel-tabs-radius)-4px)] px-3 text-xs font-medium',
      'h-[calc(var(--panel-tabs-h)-8px)]',
      'transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      active
        ? 'bg-background text-foreground shadow-sm'
        : 'text-muted-foreground hover:text-foreground',
    );
  return (
    <div
      className="shrink-0 px-[var(--panel-padding-x)] pb-3"
      data-import-subview-row={source}
    >
      <div
        role="tablist"
        aria-label={`Modo de ${source}`}
        className="grid grid-cols-2 w-full bg-muted/60 p-1 rounded-[var(--panel-tabs-radius)]"
        data-import-subview-control={source}
      >
        <button
          type="button"
          role="tab"
          aria-selected={value === 'action'}
          className={triggerClass(value === 'action')}
          onClick={() => onChange('action')}
          data-import-subview-trigger="action"
          data-import-subview-source={source}
          data-state={value === 'action' ? 'active' : 'inactive'}
        >
          {labels.action}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={value === 'history'}
          className={triggerClass(value === 'history')}
          onClick={() => onChange('history')}
          data-import-subview-trigger="history"
          data-import-subview-source={source}
          data-state={value === 'history' ? 'active' : 'inactive'}
        >
          {labels.history}
        </button>
      </div>
    </div>
  );
}

export function ImportedContentPanel({
  isOpen,
  onClose,
  defaultTab,
  onTabChange,
}: ImportedContentPanelProps) {
  const [tab, setTab] = useState<SourceTab>(() => legacyToSource(defaultTab));
  const [subView, setSubView] = useState<Record<SourceTab, SubView>>({
    archivos: 'action',
    web: 'action',
    imagenes: 'action',
  });
  const [ctaState, setCtaState] = useState<Record<SourceTab, ImportPrimaryCtaState>>({
    archivos: EMPTY_PRIMARY_CTA,
    web: EMPTY_PRIMARY_CTA,
    imagenes: EMPTY_PRIMARY_CTA,
  });

  useEffect(() => {
    setTab(legacyToSource(defaultTab));
  }, [defaultTab]);

  const handleTabChange = (next: string) => {
    const t = next as SourceTab;
    setTab(t);
    onTabChange?.(sourceToLegacy(t));
  };

  const setSub = useCallback(
    (source: SourceTab, next: SubView) =>
      setSubView((prev) => (prev[source] === next ? prev : { ...prev, [source]: next })),
    [],
  );

  const makeStateHandler = useCallback(
    (key: SourceTab) => (state: ImportPrimaryCtaState) => {
      setCtaState((prev) => {
        const cur = prev[key];
        if (
          cur.label === state.label &&
          cur.canSubmit === state.canSubmit &&
          cur.isProcessing === state.isProcessing &&
          cur.submit === state.submit &&
          cur.disabledReason === state.disabledReason
        ) return prev;
        return { ...prev, [key]: state };
      });
    },
    [],
  );

  const currentSub = subView[tab];
  const currentCta = ctaState[tab];

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
        data-import-sources="v4"
      >
        <PanelTabs value={tab} onValueChange={handleTabChange}>
          {/* Fila 1 — fuentes principales */}
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
            {/* Fila 2 contextual */}
            <SubViewSwitcher
              source="archivos"
              value={subView.archivos}
              onChange={(v) => setSub('archivos', v)}
            />
            <div className="flex-1 min-h-0 overflow-y-auto">
              {subView.archivos === 'action' ? (
                <div className="px-[var(--panel-padding-x)] pt-2 pb-4">
                  <FileUploadZone
                    onUploadComplete={onClose}
                    hidePrimaryCta
                    onPrimaryStateChange={makeStateHandler('archivos')}
                  />
                </div>
              ) : (
                <div data-import-history="archivos">
                  <DocumentsPanel
                    sourceFilter={FILE_SOURCE_TYPES}
                    headerLabel="Histórico de archivos"
                    headerSubtitle="KML · KMZ · GPX · GeoJSON · CSV importados. Pulsa un archivo para abrirlo o gestionarlo."
                    emptyTitle={HISTORY_EMPTY_COPY.archivos.title}
                    emptyHint={HISTORY_EMPTY_COPY.archivos.hint}
                  />
                </div>
              )}
            </div>
          </PanelTabs.Content>

          {/* WEB */}
          <PanelTabs.Content
            value="web"
            className="flex-1 min-h-0 m-0 flex flex-col data-[state=inactive]:hidden"
            data-import-source-content="web"
          >
            <SubViewSwitcher
              source="web"
              value={subView.web}
              onChange={(v) => setSub('web', v)}
            />
            <div className="flex-1 min-h-0 overflow-y-auto">
              {subView.web === 'action' ? (
                <div className="px-[var(--panel-padding-x)] pt-2 pb-4">
                  <WebImportPanel
                    onComplete={onClose}
                    hidePrimaryCta
                    onPrimaryStateChange={makeStateHandler('web')}
                  />
                </div>
              ) : (
                <div data-import-history="web" className="flex flex-col">
                  <div className="px-[var(--panel-padding-x)] pt-2 pb-3">
                    <ScrapeJobsList />
                  </div>
                  <div className="border-t">
                    <DocumentsPanel
                      sourceFilter={WEB_SOURCE_TYPES}
                      headerLabel="Histórico de webs importadas"
                      headerSubtitle="Documentos creados desde URL."
                      emptyTitle={HISTORY_EMPTY_COPY.web.title}
                      emptyHint={HISTORY_EMPTY_COPY.web.hint}
                    />
                  </div>
                </div>
              )}
            </div>
          </PanelTabs.Content>

          {/* IMÁGENES */}
          <PanelTabs.Content
            value="imagenes"
            className="flex-1 min-h-0 m-0 flex flex-col data-[state=inactive]:hidden"
            data-import-source-content="imagenes"
          >
            <SubViewSwitcher
              source="imagenes"
              value={subView.imagenes}
              onChange={(v) => setSub('imagenes', v)}
            />
            <div className="flex-1 min-h-0 flex flex-col">
              {subView.imagenes === 'action' ? (
                <>
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
                    <OneDrivePhotosPanel
                      hidePrimaryCta
                      onPrimaryStateChange={makeStateHandler('imagenes')}
                    />
                  </div>
                </>
              ) : (
                <div data-import-history="imagenes" className="flex-1 min-h-0 overflow-y-auto">
                  <DocumentsPanel
                    sourceFilter={IMAGE_SOURCE_TYPES}
                    headerLabel="Histórico de imágenes"
                    headerSubtitle="Imágenes procesadas desde OneDrive."
                    emptyTitle={HISTORY_EMPTY_COPY.imagenes.title}
                    emptyHint={HISTORY_EMPTY_COPY.imagenes.hint}
                  />
                </div>
              )}
            </div>
          </PanelTabs.Content>
        </PanelTabs>

        {/* PanelFooter canónico — SÓLO la acción principal de la vista activa.
            NO navegación. NO "Ver histórico". El cambio de modo vive en la fila 2. */}
        <PanelFooter>
          {currentSub === 'action' ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="w-full">
                  <Button
                    type="button"
                    onClick={currentCta.submit}
                    disabled={!currentCta.canSubmit}
                    className="w-full h-11"
                    data-import-primary-cta={tab}
                  >
                    {currentCta.isProcessing && (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    )}
                    {currentCta.label || 'Cargando…'}
                  </Button>
                </span>
              </TooltipTrigger>
              {!currentCta.canSubmit && currentCta.disabledReason && (
                <TooltipContent side="top" className="text-xs">
                  {currentCta.disabledReason}
                </TooltipContent>
              )}
            </Tooltip>
          ) : (
            <Button
              type="button"
              onClick={() => setSub(tab, 'action')}
              className="w-full h-11"
              data-import-return-to-action={tab}
            >
              {RETURN_TO_ACTION_LABELS[tab]}
            </Button>
          )}
        </PanelFooter>
      </div>
    </PanelShell>
  );
}
