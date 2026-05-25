/**
 * ImportedContentPanel — Panel "Fuentes de importación".
 *
 * Estructura canónica (PR-IMPORT-UX-4-FIX):
 *   - 3 pestañas principales: Archivos · Web · Imágenes.
 *   - Bajo cada pestaña, una sola vista activa (acción O histórico) — NO sub-toggle.
 *   - Footer canónico (`PanelFooter`) con UNA CTA real específica por fuente:
 *       Vista Acción    → CTA elevada del hijo (Subir / Importar web / Auditar fotos)
 *                          + link secundario "Ver histórico".
 *       Vista Histórico → CTA específica de retorno por fuente:
 *                          archivos → "Subir archivo"
 *                          web      → "Nueva web"
 *                          imagenes → "Auditar imágenes"
 *
 * Reglas duras:
 *   - Footer SIEMPRE contiene la acción principal real (no decorativo).
 *   - Una sola CTA primaria por footer.
 *   - NO segmented control acción/histórico.
 *   - Default Vista Acción al abrir/cambiar de tab.
 *   - `source_type` filtros: KMZ↔kml (enum no tiene 'kmz'); web → ['web_import'];
 *     imágenes hoy no tiene enum dedicado (sin filtro → empty state explícito).
 *
 * Ver: mem://logic/import/import-canon · docs/contracts/import-canon.md §8.
 */
import { useCallback, useEffect, useState } from 'react';
import { FolderOpen, FileText, Globe, Image as ImageIcon, Loader2, History } from 'lucide-react';
import { PanelShell, PanelFooter } from '@/shared/components/ui/panel';
import { PanelTabs } from '@/shared/components/ui/panel/PanelTabs';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { FileUploadZone, DocumentsPanel } from '@/domains/content/components';
import { WebImportPanel } from '@/domains/content/components/WebImportPanel';
import { OneDrivePhotosPanel } from '@/components/OneDrivePhotosPanel';
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
// Imágenes: el enum no tiene 'onedrive'/'photo'. Hoy histórico vacío por diseño.
const IMAGE_SOURCE_TYPES: string[] = [];

const RETURN_TO_ACTION_LABELS: Record<SourceTab, string> = {
  archivos: 'Subir archivo',
  web: 'Nueva web',
  imagenes: 'Auditar imágenes',
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

  const setSub = (next: SubView) =>
    setSubView((prev) => ({ ...prev, [tab]: next }));

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

        {/* PanelFooter canónico — Acción: CTA real elevada + link "Ver histórico".
            Histórico: CTA específica de retorno por fuente. */}
        <PanelFooter>
          {currentSub === 'action' ? (
            <div className="w-full flex flex-col gap-2">
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
              <button
                type="button"
                onClick={() => setSub('history')}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 inline-flex items-center justify-center gap-1 mx-auto"
                data-import-secondary-cta="history-link"
                data-import-secondary-cta-tab={tab}
              >
                <History className="w-3 h-3" />
                Ver histórico
              </button>
            </div>
          ) : (
            <Button
              type="button"
              onClick={() => setSub('action')}
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
