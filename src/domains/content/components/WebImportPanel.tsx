/**
 * WebImportPanel — Importar puntos desde URLs públicas (Atlas Obscura).
 *
 * Flujo en 2 fases:
 *  1) Probar URL → scrapea 20 fichas completas (preview, sin guardar nada).
 *  2) Importar → guarda los no-duplicados como documento + acciones (visibilidad, IA).
 *
 * Reutiliza el pipeline unificado: KMLDocument sintético → saveDocumentToDatabase
 * → processImportedDocument → ImportSummaryDialog.
 */
import { useCallback, useMemo, useState } from 'react';
import { Globe, Sparkles, Link2, Loader2, FlaskConical, MapPin, AlertCircle, Eye, Users, Lock } from 'lucide-react';
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BackgroundScrapeJobs } from './BackgroundScrapeJobs';

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

type Visibility = 'public' | 'followers' | 'private';

const PREVIEW_SIZE = 20;
const DUP_RADIUS_M = 250;

function genId(): string {
  return (globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const la1 = a.lat * Math.PI / 180;
  const la2 = b.lat * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(la1) * Math.cos(la2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

function placeToLocation(place: ScrapedPlace, sourceUrl: string): GeoLocation {
  const enrichedSeed: Partial<EnrichedLocationData> = {
    etiquetas_personales: place.tags && place.tags.length > 0 ? place.tags : undefined,
    fuentes: ['Atlas Obscura', place.url],
  };
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
  const [autoEnrich, setAutoEnrich] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>('followers');
  const [phase, setPhase] = useState<'idle' | 'testing' | 'saving'>('idle');

  // Preview state
  const [preview, setPreview] = useState<ScrapeResponse & { ok: true } | null>(null);
  const [duplicates, setDuplicates] = useState<Set<string>>(new Set()); // urls que ya existen <250m
  const [excludedDuplicates, setExcludedDuplicates] = useState(true); // saltar duplicados (por defecto)

  const [summaryDoc, setSummaryDoc] = useState<{
    id: string; name: string; fileName: string; pointCount: number; routeCount: number;
  } | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  const isAtlas = /^https?:\/\/(www\.)?atlasobscura\.com\/(places|things-to-do)\//i.test(url.trim());
  const isWorking = phase !== 'idle';

  const finalCount = useMemo(() => {
    if (!preview) return 0;
    if (!excludedDuplicates) return preview.places.length;
    return preview.places.filter(p => !duplicates.has(p.url)).length;
  }, [preview, duplicates, excludedDuplicates]);

  const handleTest = useCallback(async () => {
    if (!user) { toast.error('Inicia sesión para importar'); return; }
    if (!isAtlas) { toast.error('La URL debe ser de atlasobscura.com'); return; }
    setPhase('testing');
    setPreview(null);
    setDuplicates(new Set());
    try {
      const { data, error } = await supabase.functions.invoke<ScrapeResponse>('scrape-atlas-obscura', {
        body: { url: url.trim(), maxItems: PREVIEW_SIZE },
      });
      if (error || !data) { toast.error(error?.message || 'No se pudo extraer la página'); return; }
      if (!data.ok) { toast.error((data as { error: string }).error); return; }
      if (data.places.length === 0) { toast.error('No se encontraron puntos en esa URL'); return; }
      setPreview(data);

      // Detectar duplicados <250m vs catálogo del usuario
      const { data: existing } = await supabase
        .from('locations')
        .select('latitude, longitude')
        .eq('owner_user_id', user.id)
        .is('deleted_at', null)
        .limit(5000);
      if (existing && existing.length > 0) {
        const dups = new Set<string>();
        for (const place of data.places) {
          for (const ex of existing) {
            if (haversineMeters(
              { lat: place.latitude, lng: place.longitude },
              { lat: ex.latitude as number, lng: ex.longitude as number },
            ) <= DUP_RADIUS_M) {
              dups.add(place.url);
              break;
            }
          }
        }
        setDuplicates(dups);
      }
      toast.success(`Muestra de ${data.places.length} puntos lista`);
    } catch (e) {
      console.error('Test failed:', e);
      toast.error('Error al probar la URL');
    } finally {
      setPhase('idle');
    }
  }, [url, user, isAtlas]);

  const handleImport = useCallback(async () => {
    if (!user || !preview) return;
    const placesToImport = excludedDuplicates
      ? preview.places.filter(p => !duplicates.has(p.url))
      : preview.places;
    if (placesToImport.length === 0) {
      toast.error('No hay puntos nuevos para importar');
      return;
    }
    setPhase('saving');
    try {
      const doc = buildSyntheticDocument({
        documentName: preview.documentName,
        sourceUrl: preview.sourceUrl,
        places: placesToImport,
      });
      // Aplicar visibilidad seleccionada a cada punto
      doc.locations = doc.locations.map(l => ({ ...l, visibility } as GeoLocation));

      const saved = await saveDocumentToDatabase(doc);
      if (!saved) { toast.error('Error al guardar el documento'); return; }
      addDocument(doc);
      toast.success(`Importados ${doc.locations.length} puntos`);

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
      setPreview(null);
      setDuplicates(new Set());
    } catch (e) {
      console.error('Import failed:', e);
      toast.error('Error al importar');
    } finally {
      setPhase('idle');
    }
  }, [user, preview, duplicates, excludedDuplicates, visibility, autoEnrich, addDocument]);

  return (
    <>
      <div className="w-full max-w-lg mx-auto space-y-5">
        <Tabs defaultValue="instant" className="w-full">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="instant">Inmediato</TabsTrigger>
            <TabsTrigger value="background">Background</TabsTrigger>
          </TabsList>

          <TabsContent value="instant" className="mt-4">
            <div className="bg-card rounded-2xl border shadow-sm p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                  <Globe className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Importar desde Atlas Obscura</p>
                  <p className="text-xs text-muted-foreground leading-snug">
                    Pega una URL, prueba qué puntos saldrían y luego importa.
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ao-url" className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  URL
                </Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="ao-url"
                      type="url"
                      value={url}
                      onChange={(e) => { setUrl(e.target.value); setPreview(null); }}
                      placeholder="https://www.atlasobscura.com/things-to-do/italy"
                      className="h-11 pl-9"
                      disabled={isWorking}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleTest}
                    disabled={isWorking || !isAtlas}
                    className="h-11 shrink-0"
                  >
                    {phase === 'testing' ? (
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    ) : (
                      <FlaskConical className="w-4 h-4 mr-1.5" />
                    )}
                    Probar
                  </Button>
                </div>
                {url.trim() && !isAtlas && (
                  <p className="text-[11px] text-destructive">
                    Solo URLs de atlasobscura.com (/places/... o /things-to-do/...).
                  </p>
                )}
              </div>

              {/* Preview */}
              {preview && (
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold">
                      Muestra: {preview.places.length} puntos
                      {duplicates.size > 0 && (
                        <span className="text-muted-foreground font-normal">
                          {' '}· {duplicates.size} ya existentes
                        </span>
                      )}
                    </p>
                    {duplicates.size > 0 && (
                      <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                        <Switch
                          checked={excludedDuplicates}
                          onCheckedChange={setExcludedDuplicates}
                        />
                        Saltar duplicados
                      </label>
                    )}
                  </div>

                  <ScrollArea className="h-64 rounded-lg border bg-muted/10">
                    <div className="divide-y">
                      {preview.places.map((p) => {
                        const isDup = duplicates.has(p.url);
                        return (
                          <div key={p.url} className="flex gap-3 p-2.5 items-start">
                            {p.image ? (
                              <img
                                src={p.image}
                                alt=""
                                className="w-12 h-12 rounded object-cover shrink-0 bg-muted"
                                loading="lazy"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded bg-muted shrink-0 flex items-center justify-center">
                                <MapPin className="w-4 h-4 text-muted-foreground" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-xs font-medium truncate">{p.name}</p>
                                {isDup && (
                                  <Badge variant="outline" className="text-[9px] h-4 px-1 border-amber-400 text-amber-600">
                                    <AlertCircle className="w-2.5 h-2.5 mr-0.5" />
                                    Existe
                                  </Badge>
                                )}
                              </div>
                              <p className="text-[10px] text-muted-foreground truncate">
                                {[p.locality, p.region, p.country].filter(Boolean).join(' · ') || '—'}
                              </p>
                              {p.description && (
                                <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">
                                  {p.description}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>

                  {/* Visibilidad */}
                  <div>
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Visibilidad
                    </Label>
                    <div className="grid grid-cols-3 gap-2 mt-1.5">
                      {([
                        { v: 'public', label: 'Público', Icon: Eye },
                        { v: 'followers', label: 'Seguidores', Icon: Users },
                        { v: 'private', label: 'Privado', Icon: Lock },
                      ] as const).map(({ v, label, Icon }) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setVisibility(v)}
                          className={`flex flex-col items-center gap-1 py-2 px-2 rounded-lg border text-xs transition-colors ${
                            visibility === v
                              ? 'border-primary bg-primary/5 text-primary'
                              : 'border-border hover:bg-muted/40'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Enriquecer IA */}
                  <label className="flex items-start gap-3 p-3 rounded-xl border bg-muted/20 cursor-pointer">
                    <Switch checked={autoEnrich} onCheckedChange={setAutoEnrich} disabled={isWorking} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-primary" />
                        <span className="text-xs font-medium">Enriquecer con IA tras importar</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                        Genera descripción y datos clave para los puntos nuevos.
                      </p>
                    </div>
                  </label>

                  <Button
                    onClick={handleImport}
                    disabled={isWorking || finalCount === 0}
                    className="w-full h-11"
                  >
                    {phase === 'saving' ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Guardando…
                      </>
                    ) : (
                      <>
                        <Globe className="w-4 h-4 mr-2" />
                        Importar {finalCount} {finalCount === 1 ? 'punto' : 'puntos'}
                      </>
                    )}
                  </Button>
                </div>
              )}

              {!preview && (
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Probar trae los primeros {PREVIEW_SIZE} puntos con sus coordenadas reales (sin guardar).
                  Para volúmenes grandes (centenares o miles), usa la pestaña Background.
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="background" className="mt-4">
            <BackgroundScrapeJobs />
          </TabsContent>
        </Tabs>
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
