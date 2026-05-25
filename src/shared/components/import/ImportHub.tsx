/**
 * ImportHub — Pantalla inicial del panel Contenido.
 *
 * Canon: tres vías de importación (fichero · web · OneDrive fotos) presentadas
 * como cards grandes. El usuario entiende en 5 segundos qué puede importar y
 * cuál es el siguiente paso. La biblioteca de documentos importados aparece
 * como sección secundaria, no compite visualmente.
 *
 * Ver `docs/contracts/import-canon.md` §2 y `mem://logic/import/import-canon`.
 */
import { FileText, Globe, Cloud, FileStack, ArrowRight } from 'lucide-react';
import { ImportChannelCard } from './ImportChannelCard';

export type ImportChannelId = 'file' | 'web' | 'onedrive';

interface ImportHubProps {
  onSelectChannel: (channel: ImportChannelId) => void;
  onOpenLibrary: () => void;
  libraryCount?: number;
}

export function ImportHub({ onSelectChannel, onOpenLibrary, libraryCount }: ImportHubProps) {
  return (
    <div
      data-import-hub="v2"
      className="w-full max-w-2xl mx-auto px-[var(--panel-padding-x)] py-6 space-y-6"
    >
      <header className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">Importar contenido</h2>
        <p className="text-sm text-muted-foreground leading-snug">
          Elige cómo quieres traer ubicaciones a tu catálogo. Cada vía es un
          asistente guiado paso a paso.
        </p>
      </header>

      <div className="space-y-3" role="list" aria-label="Vías de importación">
        <div role="listitem">
          <ImportChannelCard
            channelId="file"
            icon={<FileText className="w-6 h-6" />}
            title="Importar desde fichero"
            accepts={['KML', 'KMZ', 'GPX', 'GeoJSON', 'CSV']}
            creates="POIs en tu catálogo a partir del fichero subido."
            whenToUse="Tienes un export de Google My Maps, una traza GPS o un listado en CSV."
            onSelect={() => onSelectChannel('file')}
          />
        </div>

        <div role="listitem">
          <ImportChannelCard
            channelId="web"
            icon={<Globe className="w-6 h-6" />}
            title="Importar desde la web"
            accepts={['URL Atlas Obscura', 'KML remoto', 'NetworkLink']}
            creates="POIs scrapeados de la URL indicada (inmediato o en background)."
            whenToUse="Quieres traer un listado de Atlas Obscura o un KML publicado online."
            onSelect={() => onSelectChannel('web')}
          />
        </div>

        <div role="listitem">
          <ImportChannelCard
            channelId="onedrive"
            icon={<Cloud className="w-6 h-6" />}
            title="Importar fotos desde OneDrive"
            accepts={['Fotos con GPS (EXIF)']}
            creates="Índice de fotos georreferenciadas listas para crear POIs."
            whenToUse="Tus fotos viajan ya con coordenadas y quieres usarlas como base."
            onSelect={() => onSelectChannel('onedrive')}
          />
        </div>
      </div>

      {/* Biblioteca — sección secundaria, no compite */}
      <div className="pt-4 border-t">
        <button
          type="button"
          onClick={onOpenLibrary}
          data-import-library-link="v2"
          className="w-full flex items-center justify-between gap-3 p-3 rounded-xl text-left hover:bg-muted/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-muted text-muted-foreground shrink-0">
              <FileStack className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Documentos importados</p>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Historial operativo. No es una vía de importación.
                {typeof libraryCount === 'number' && libraryCount > 0 && (
                  <span className="ml-1">· {libraryCount} en biblioteca</span>
                )}
              </p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </button>
      </div>
    </div>
  );
}
