/**
 * ImportedContentPanel — Panel "Fuentes de importación" (PR-IMPORT-UX-4).
 *
 * Estructura canónica:
 *   - 3 pestañas principales: Archivos · Web · Imágenes.
 *   - Bajo cada pestaña, sub-toggle binario Acción / Histórico (default = Acción).
 *   - Footer canónico (`PanelFooter`) con la CTA REAL de la vista:
 *       Vista Acción   → CTA elevada desde el componente hijo
 *                        vía `hidePrimaryCta` + `onPrimaryStateChange`.
 *       Vista Histórico→ CTA secundaria única "Nueva importación".
 *
 * Reglas duras (PR-IMPORT-UX-4):
 *   - Footer SIEMPRE contiene la acción principal real (no decorativo).
 *   - Una sola CTA primaria por footer.
 *   - Sub-toggle = segmented control compacto (NO segundo nivel de tabs grandes).
 *   - Default Vista Acción al abrir/cambiar de tab.
 *   - Sin duplicación de CTAs: los botones inline equivalentes dentro de los
 *     hijos se ocultan vía `hidePrimaryCta`.
 *
 * Ver: mem://logic/import/import-canon · docs/contracts/import-canon.md §8.
 */
import { useCallback, useEffect, useState } from 'react';
import { FolderOpen, FileText, Globe, Image as ImageIcon, Loader2, Plus } from 'lucide-react';
import { PanelShell, PanelFooter } from '@/shared/components/ui/panel';
import { PanelTabs } from '@/shared/components/ui/panel/PanelTabs';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { FileUploadZone, DocumentsPanel } from '@/domains/content/components';
import { WebImportPanel } from '@/domains/content/components/WebImportPanel';
import { OneDrivePhotosPanel } from '@/components/OneDrivePhotosPanel';
import { ScrapeJobsList } from '@/domains/content/components/BackgroundScrapeJobs';
import type { ImportPrimaryCtaState } from '@/shared/components/import/import-primary-cta';
import { EMPTY_PRIMARY_CTA } from '@/shared/components/import/import-primary-cta';

export type ImportedContentTab = 'upload' | 'web' | 'onedrive' | 'documents';

type SourceTab = 'archivos' | 'web' | 'imagenes';
type SubView = 'action' | 'history';

const FILE_SOURCE_TYPES = ['kml', 'kmz', 'gpx', 'geojson', 'csv'];
const WEB_SOURCE_TYPES = ['web_import', 'scrape', 'atlas-obscura'];
const IMAGE_SOURCE_TYPES = ['onedrive', 'photo'];

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

interface SubToggleProps {
  value: SubView;
  onChange: (next: SubView) => void;
  actionLabel: string;
  historyLabel: string;
}

function SubToggle({ value, onChange, actionLabel, historyLabel }: SubToggleProps) {
  return (
    <div
      role="tablist"
      data-import-subtoggle
      className="inline-flex items-center gap-0.5 rounded-lg border bg-muted/40 p-0.5"
    >
      {([['action', actionLabel], ['history', historyLabel]] as const).map(([key, label]) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={value === key}
          data-import-subview={key}
          onClick={() => onChange(key)}
          className={cn(
            'px-3 h-7 rounded-md text-[11px] font-medium transition-colors',
            value === key
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const SUBTOGGLE_LABELS: Record<SourceTab, { action: string; history: string }> = {
  archivos: { action: 'Subir archivos', history: 'Histórico de archivos' },
  web:      { action: 'Seleccionar web', history: 'Jobs recientes' },
  imagenes: { action: 'Subir imágenes', history: 'Histórico de imágenes' },
};

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
          <div className="shrink-0 px-[var(--panel-padding-x)] pt-[var(--panel-padding-y)] pb-2">
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

          {/* Sub-toggle Acción/Histórico — un solo control compartido por la tab activa */}
          <div className="shrink-0 px-[var(--panel-padding-x)] pb-3 flex items-center justify-between gap-2">
            <SubToggle
              value={currentSub}
              onChange={setSub}
              actionLabel={SUBTOGGLE_LABELS[tab].action}
              historyLabel={SUBTOGGLE_LABELS[tab].history}
            />
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
                      headerSubtitle="Documentos creados desde URL (Atlas Obscura, scrape, etc.)."
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
                    headerSubtitle="Documentos creados desde fotos con GPS (OneDrive)."
                  />
                </div>
              )}
            </div>
          </PanelTabs.Content>
        </PanelTabs>

        {/* PanelFooter canónico — CTA real elevada desde el componente hijo
            (Acción) o CTA secundaria "Nueva importación" (Histórico). */}
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
              variant="outline"
              onClick={() => setSub('action')}
              className="w-full h-11"
              data-import-secondary-cta={tab}
            >
              <Plus className="w-4 h-4 mr-2" />
              Nueva importación
            </Button>
          )}
        </PanelFooter>
      </div>
    </PanelShell>
  );
}
