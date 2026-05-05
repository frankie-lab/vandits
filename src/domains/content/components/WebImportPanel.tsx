/**
 * WebImportPanel — Importar puntos desde URLs públicas (Atlas Obscura).
 *
 * Reutiliza el flujo unificado de importación: construye un KMLDocument
 * sintético a partir del payload del scraper y delega en
 * `saveDocumentToDatabase` + `processImportedDocument` + `ImportSummaryDialog`,
 * idénticos a la subida de KML/GPX.
 *
 * Helper único transversal — no duplicar la lógica de scraping en otros sitios.
 */
import { useCallback, useState } from 'react';
import { Globe, Sparkles, Link2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/domains/identity';
import { useLocationsStore, saveDocumentToDatabase } from '@/domains/content';
import { processImportedDocument } from '@/domains/content/lib/process-imported-document';
import { ImportSummaryDialog } from './ImportSummaryDialog';
import type { KMLDocument, GeoLocation, EnrichedLocationData } from '@/types/location';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';

type ScrapedPlace = {
  url: string;
  name: string;
  description?: string;
  latitude: number;
  longitude: number;
  country?: string;
  region?: string;
  locality?: string;
  image?: string;
  tags?: string[];
};

type ScrapeResponse =
  | { ok: true; documentName: string; sourceUrl: string; places: ScrapedPlace[]; skipped: number }
  | { ok: false; error: string };

function genId(): string {
  return (globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

function placeToLocation(place: ScrapedPlace, sourceUrl: string): GeoLocation {
  const enrichedSeed: Partial<EnrichedLocationData> = {
    etiquetas_personales: place.tags && place.tags.length > 0 ? place.tags : undefined,
    fuentes: ['Atlas Obscura', place.url],
  };
  // Only attach enrichedData if we have something useful that the import-first
  // pipeline won't overwrite (personal tags + source attribution).
  const enrichedData = Object.values(enrichedSeed).some(Boolean)
    ? (enrichedSeed as EnrichedLocationData)
    : undefined;

  return {
    id: genId(),
    name: place.name,
    description: place.description,
    coordinates: { lat: place.latitude, lng: place.longitude },
    country: place.country,
    region: place.region,
    localidad: place.locality,
    customData: {
      source: 'atlas-obscura',
      sourceUrl: place.url,
      listingUrl: sourceUrl,
    },
    enrichedData,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as GeoLocation;
}

function buildSyntheticDocument(payload: {
  documentName: string;
  sourceUrl: string;
  places: ScrapedPlace[];
}): KMLDocument {
  const id = genId();
  const fileName = `${payload.sourceUrl.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '-')}.web`;
  return {
    id,
    name: payload.documentName,
    fileName,
    locations: payload.places.map((p) => placeToLocation(p, payload.sourceUrl)),
    uploadedAt: new Date(),
  };
}

export function WebImportPanel({ onComplete }: { onComplete?: () => void }) {
  const { user } = useAuth();
  const addDocument = useLocationsStore((s) => s.addDocument);

  const [url, setUrl] = useState('');
  const [maxItems, setMaxItems] = useState(30);
  const [autoEnrich, setAutoEnrich] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'scraping' | 'saving'>('idle');

  const [summaryDoc, setSummaryDoc] = useState<{
    id: string; name: string; fileName: string; pointCount: number; routeCount: number;
  } | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  const isAtlas = /^https?:\/\/(www\.)?atlasobscura\.com\/(places|things-to-do)\//i.test(url.trim());

  const handleImport = useCallback(async () => {
    if (!user) { toast.error('Inicia sesión para importar'); return; }
    if (!isAtlas) { toast.error('La URL debe ser de atlasobscura.com (/places/... o /things-to-do/...)'); return; }
    setIsWorking(true);
    setPhase('scraping');
    try {
      const { data, error } = await supabase.functions.invoke<ScrapeResponse>('scrape-atlas-obscura', {
        body: { url: url.trim(), maxItems },
      });
      if (error || !data) { toast.error(error?.message || 'No se pudo extraer la página'); return; }
      if (!data.ok) { toast.error((data as { error: string }).error); return; }
      if (data.places.length === 0) { toast.error('No se encontraron puntos en esa URL'); return; }
      if (data.skipped > 0) {
        toast.warning(`${data.skipped} fichas no pudieron leerse y se omitieron`);
      }

      setPhase('saving');
      const doc = buildSyntheticDocument(data);
      const saved = await saveDocumentToDatabase(doc);
      if (!saved) { toast.error('Error al guardar el documento'); return; }
      addDocument(doc);
      toast.success(`Importados ${doc.locations.length} puntos desde Atlas Obscura`);

      processImportedDocument(doc.id, { autoEnrich }).catch((e) =>
        console.warn('Background processing failed:', e),
      );

      window.dispatchEvent(new CustomEvent('document:view-on-map', {
        detail: { docId: doc.id, docName: doc.name, routeIds: [], matchingCatalogIds: [] },
      }));

      setSummaryDoc({
        id: doc.id,
        name: doc.name,
        fileName: doc.fileName,
        pointCount: doc.locations.length,
        routeCount: 0,
      });
      setShowSummary(true);
      setUrl('');
    } catch (e) {
      console.error('Web import failed:', e);
      toast.error('Error al importar desde la web');
    } finally {
      setIsWorking(false);
      setPhase('idle');
    }
  }, [url, maxItems, autoEnrich, user, isAtlas, addDocument]);

  return (
    <>
      <div className="w-full max-w-lg mx-auto space-y-5">
        <div className="bg-card rounded-2xl border shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <Globe className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Importar desde Atlas Obscura</p>
              <p className="text-xs text-muted-foreground leading-snug">
                Pega una URL de listado (ej. <span className="font-mono">/things-to-do/australia</span>)
                o de una ficha individual (<span className="font-mono">/places/...</span>).
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ao-url" className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              URL
            </Label>
            <div className="relative">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                id="ao-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.atlasobscura.com/things-to-do/australia"
                className="h-11 pl-9"
                disabled={isWorking}
              />
            </div>
            {url.trim() && !isAtlas && (
              <p className="text-[11px] text-destructive">
                Solo URLs de atlasobscura.com (/places/... o /things-to-do/...).
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ao-max" className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Máximo de puntos (listados)
            </Label>
            <Input
              id="ao-max"
              type="number"
              min={1}
              max={200}
              value={maxItems}
              onChange={(e) => setMaxItems(Math.max(1, Math.min(200, Number(e.target.value) || 30)))}
              className="h-11"
              disabled={isWorking}
            />
            <p className="text-[10px] text-muted-foreground">
              Visitamos cada ficha individualmente para leer sus coordenadas. 30 es un buen punto de partida.
            </p>
          </div>

          <label className="flex items-start gap-3 p-3 rounded-xl border bg-muted/20 cursor-pointer">
            <Switch checked={autoEnrich} onCheckedChange={setAutoEnrich} disabled={isWorking} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-medium">Enriquecer con IA tras importar</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                Lanza el enriquecimiento en segundo plano una vez guardados los puntos.
              </p>
            </div>
          </label>

          <Button
            onClick={handleImport}
            disabled={isWorking || !isAtlas}
            className="w-full h-11"
          >
            {isWorking ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {phase === 'scraping' ? 'Extrayendo de Atlas Obscura…' : 'Guardando puntos…'}
              </>
            ) : (
              <>
                <Globe className="w-4 h-4 mr-2" />
                Extraer e importar
              </>
            )}
          </Button>

          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Las coordenadas exactas se obtienen del marcado JSON-LD público de cada ficha.
            La fuente queda registrada en cada punto. Sin login, sin cookies.
          </p>
        </div>
      </div>

      <ImportSummaryDialog
        open={showSummary}
        docId={summaryDoc?.id ?? null}
        docName={summaryDoc?.name ?? null}
        pointCount={summaryDoc?.pointCount ?? 0}
        routeCount={summaryDoc?.routeCount ?? 0}
        fileName={summaryDoc?.fileName ?? null}
        onOpenChange={(open) => {
          setShowSummary(open);
          if (!open) onComplete?.();
        }}
        onViewDocument={() => {
          setShowSummary(false);
          if (summaryDoc) {
            window.dispatchEvent(new CustomEvent('document:open-workspace', {
              detail: { docId: summaryDoc.id, docName: summaryDoc.name },
            }));
          }
          onComplete?.();
        }}
      />
    </>
  );
}
