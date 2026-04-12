import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  Search,
  Edit3,
  RefreshCw,
  Link2,
  MapPin,
  Loader2,
  ExternalLink,
  Check,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FloatingPanel } from './FloatingPanel';
import { useLocationsStore } from '@/store/locations-store';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { GeoLocation, PLACE_TYPE_LABELS, PlaceType } from '@/types/location';

interface UnresolvedLocationsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onLocationClick?: (locationId: string) => void;
}

type ActionMode = 'manual' | 'link' | 'reclassify' | null;

interface WikiSearchResult {
  title: string;
  pageId: number;
  extract: string;
  url: string;
  distance?: number;
}

export function UnresolvedLocationsPanel({
  isOpen,
  onClose,
  onLocationClick,
}: UnresolvedLocationsPanelProps) {
  const getAllLocations = useLocationsStore(state => state.getAllLocations);
  const updateLocation = useLocationsStore(state => state.updateLocation);
  const setFocusedLocation = useLocationsStore(state => state.setFocusedLocation);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Manual description state
  const [manualDescription, setManualDescription] = useState('');

  // Wikipedia search state
  const [wikiQuery, setWikiQuery] = useState('');
  const [wikiResults, setWikiResults] = useState<WikiSearchResult[]>([]);
  const [wikiSearching, setWikiSearching] = useState(false);

  // Reclassify state
  const [newName, setNewName] = useState('');
  const [newPlaceType, setNewPlaceType] = useState<PlaceType>('other');

  // Get unresolved locations
  const unresolvedLocations = getAllLocations().filter(
    loc => loc.enrichmentStatus === 'unresolved'
  );

  const handleExpand = (loc: GeoLocation) => {
    if (expandedId === loc.id) {
      setExpandedId(null);
      setActionMode(null);
    } else {
      setExpandedId(loc.id);
      setActionMode(null);
      setManualDescription('');
      setWikiQuery(loc.name);
      setWikiResults([]);
      setNewName(loc.name);
      setNewPlaceType(loc.placeType || 'other');
    }
  };

  const handleFocusLocation = (loc: GeoLocation) => {
    setFocusedLocation(loc.id);
    onLocationClick?.(loc.id);
  };

  // ── Action: Manual description ──
  const handleSaveManual = async (loc: GeoLocation) => {
    if (!manualDescription.trim()) return;
    setProcessingId(loc.id);

    try {
      const manualEnrichedData = {
        verified: false,
        verification_notes: 'Descripción añadida manualmente por el usuario',
        categoria: 'Otro',
        nombre_lugar: loc.name,
        localizacion: [loc.zone, loc.region, loc.country, loc.continent].filter(Boolean).join(', '),
        descripcion: manualDescription.trim(),
        punto_destacado: '',
        etiquetas: [],
        datos_clave: {
          tipo: loc.placeType || 'Lugar',
          coordenadas: `${loc.coordinates.lat.toFixed(6)}, ${loc.coordinates.lng.toFixed(6)}`,
        },
        fuentes: ['Descripción manual del usuario'],
      };

      const { error } = await supabase
        .from('locations')
        .update({
          enriched_data: manualEnrichedData as any,
          enrichment_status: 'manual',
          updated_at: new Date().toISOString(),
        })
        .eq('id', loc.id);

      if (error) throw error;

      updateLocation(loc.id, {
        enrichedData: manualEnrichedData as any,
        enrichmentStatus: 'manual',
        updatedAt: new Date(),
      });

      toast.success(`"${loc.name}" actualizado manualmente`);
      setExpandedId(null);
      setActionMode(null);
    } catch (error) {
      console.error('Error saving manual description:', error);
      toast.error('Error al guardar la descripción');
    } finally {
      setProcessingId(null);
    }
  };

  // ── Action: Wikipedia search & link ──
  const handleWikiSearch = async (loc: GeoLocation) => {
    if (!wikiQuery.trim()) return;
    setWikiSearching(true);
    setWikiResults([]);

    try {
      // Search nearby Wikipedia articles using geosearch + text search
      const geoSearchUrl = `https://es.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${loc.coordinates.lat}|${loc.coordinates.lng}&gsradius=10000&gslimit=10&format=json&origin=*`;
      const textSearchUrl = `https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(wikiQuery)}&srlimit=5&format=json&origin=*`;

      const [geoRes, textRes] = await Promise.all([
        fetch(geoSearchUrl).then(r => r.json()),
        fetch(textSearchUrl).then(r => r.json()),
      ]);

      const seen = new Set<number>();
      const results: WikiSearchResult[] = [];

      // Process geo results
      for (const page of geoRes.query?.geosearch || []) {
        if (seen.has(page.pageid)) continue;
        seen.add(page.pageid);

        const extractRes = await fetch(
          `https://es.wikipedia.org/w/api.php?action=query&pageids=${page.pageid}&prop=extracts|info&exintro=true&explaintext=true&exchars=300&inprop=url&format=json&origin=*`
        );
        const extractData = await extractRes.json();
        const pageInfo = extractData.query?.pages?.[page.pageid];

        results.push({
          title: page.title,
          pageId: page.pageid,
          extract: pageInfo?.extract?.substring(0, 250) || '',
          url: pageInfo?.fullurl || `https://es.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
          distance: Math.round(page.dist),
        });
      }

      // Process text results
      for (const page of textRes.query?.search || []) {
        if (seen.has(page.pageid)) continue;
        seen.add(page.pageid);

        const extractRes = await fetch(
          `https://es.wikipedia.org/w/api.php?action=query&pageids=${page.pageid}&prop=extracts|info&exintro=true&explaintext=true&exchars=300&inprop=url&format=json&origin=*`
        );
        const extractData = await extractRes.json();
        const pageInfo = extractData.query?.pages?.[page.pageid];

        results.push({
          title: page.title,
          pageId: page.pageid,
          extract: pageInfo?.extract?.substring(0, 250) || '',
          url: pageInfo?.fullurl || `https://es.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
        });
      }

      setWikiResults(results.slice(0, 8));
      if (results.length === 0) {
        toast.info('No se encontraron resultados en Wikipedia');
      }
    } catch (error) {
      console.error('Wikipedia search error:', error);
      toast.error('Error buscando en Wikipedia');
    } finally {
      setWikiSearching(false);
    }
  };

  const handleLinkWikipedia = async (loc: GeoLocation, wiki: WikiSearchResult) => {
    setProcessingId(loc.id);

    try {
      // Re-enrich using the confirmed candidate name
      const { data, error } = await supabase.functions.invoke('enrich-location', {
        body: {
          location: {
            ...loc,
            name: wiki.title, // Use Wikipedia article title
            latitude: loc.coordinates.lat,
            longitude: loc.coordinates.lng,
          },
          skipValidation: true,
          confirmedCandidate: wiki.title,
        },
      });

      if (error) throw error;
      if (!data?.success || !data?.data) {
        throw new Error(data?.error || 'Error al enriquecer');
      }

      const enrichedData = data.data;
      const geoData = enrichedData._geocoded || {};

      const { error: updateError } = await supabase
        .from('locations')
        .update({
          enriched_data: enrichedData,
          enrichment_status: 'enriched',
          place_type: enrichedData.clasificacion?.codigo || loc.placeType || null,
          continent: geoData.continent || loc.continent || null,
          country: geoData.country || loc.country || null,
          region: geoData.region || loc.region || null,
          zone: geoData.zone || loc.zone || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', loc.id);

      if (updateError) throw updateError;

      updateLocation(loc.id, {
        enrichedData,
        enrichmentStatus: 'enriched',
        placeType: enrichedData.clasificacion?.codigo || loc.placeType || undefined,
        continent: geoData.continent || loc.continent || undefined,
        country: geoData.country || loc.country || undefined,
        region: geoData.region || loc.region || undefined,
        zone: geoData.zone || loc.zone || undefined,
        updatedAt: new Date(),
      });

      toast.success(`"${loc.name}" vinculado a "${wiki.title}" y enriquecido`);
      setExpandedId(null);
      setActionMode(null);
    } catch (error) {
      console.error('Link Wikipedia error:', error);
      toast.error('Error al vincular y enriquecer');
    } finally {
      setProcessingId(null);
    }
  };

  // ── Action: Reclassify and retry ──
  const handleReclassifyRetry = async (loc: GeoLocation) => {
    if (!newName.trim()) return;
    setProcessingId(loc.id);

    try {
      // Update name/type first
      const { error: nameError } = await supabase
        .from('locations')
        .update({
          name: newName.trim(),
          place_type: newPlaceType,
          enrichment_status: 'pending',
          updated_at: new Date().toISOString(),
        })
        .eq('id', loc.id);

      if (nameError) throw nameError;

      updateLocation(loc.id, {
        name: newName.trim(),
        placeType: newPlaceType,
        enrichmentStatus: 'pending',
        updatedAt: new Date(),
      });

      // Re-try enrichment with new name
      const { data, error } = await supabase.functions.invoke('enrich-location', {
        body: {
          location: {
            ...loc,
            name: newName.trim(),
            latitude: loc.coordinates.lat,
            longitude: loc.coordinates.lng,
          },
          skipValidation: true,
        },
      });

      if (error) throw error;

      if (data?.success && data?.data) {
        const enrichedData = data.data;
        const geoData = enrichedData._geocoded || {};

        const { error: enrichError } = await supabase
          .from('locations')
          .update({
            enriched_data: enrichedData,
            enrichment_status: 'enriched',
            place_type: enrichedData.clasificacion?.codigo || newPlaceType || null,
            continent: geoData.continent || loc.continent || null,
            country: geoData.country || loc.country || null,
            region: geoData.region || loc.region || null,
            zone: geoData.zone || loc.zone || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', loc.id);

        if (enrichError) throw enrichError;

        updateLocation(loc.id, {
          enrichedData,
          enrichmentStatus: 'enriched',
          placeType: enrichedData.clasificacion?.codigo || newPlaceType || undefined,
          updatedAt: new Date(),
        });

        toast.success(`"${newName.trim()}" enriquecido correctamente`);
      } else {
        // Still couldn't enrich — keep as unresolved
        await supabase
          .from('locations')
          .update({ enrichment_status: 'unresolved' })
          .eq('id', loc.id);

        updateLocation(loc.id, { enrichmentStatus: 'unresolved' });
        toast.warning(`"${newName.trim()}" actualizado pero no se encontró correlación`);
      }

      setExpandedId(null);
      setActionMode(null);
    } catch (error) {
      console.error('Reclassify error:', error);
      toast.error('Error al reclasificar');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <FloatingPanel
      title="Puntos sin resolver"
      icon={<AlertTriangle className="w-4 h-4 text-amber-500" />}
      isOpen={isOpen}
      onClose={onClose}
      position="right"
    >
      <div className="p-3 space-y-3">
        {/* Header stats */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <span>
            {unresolvedLocations.length === 0
              ? 'No hay puntos sin resolver'
              : `${unresolvedLocations.length} punto${unresolvedLocations.length !== 1 ? 's' : ''} sin correlación automática`}
          </span>
        </div>

        {unresolvedLocations.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-xs">
            <Check className="w-8 h-8 mx-auto mb-2 text-green-500/60" />
            <p>Todos los puntos han sido resueltos</p>
          </div>
        )}

        <ScrollArea className="max-h-[calc(100vh-220px)]">
          <div className="space-y-2">
            {unresolvedLocations.map(loc => {
              const isExpanded = expandedId === loc.id;
              const isProcessing = processingId === loc.id;

              return (
                <motion.div
                  key={loc.id}
                  layout
                  className="border border-border rounded-lg overflow-hidden bg-card"
                >
                  {/* Location header */}
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-accent/50 transition-colors"
                    onClick={() => handleExpand(loc)}
                  >
                    <MapPin className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{loc.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {[loc.zone, loc.region, loc.country].filter(Boolean).join(', ') || 'Sin localización'}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={e => {
                        e.stopPropagation();
                        handleFocusLocation(loc);
                      }}
                    >
                      <MapPin className="w-3 h-3" />
                    </Button>
                    {isExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                  </button>

                  {/* Expanded actions */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-border"
                      >
                        <div className="p-3 space-y-3">
                          {/* Action selector */}
                          {!actionMode && (
                            <div className="grid grid-cols-3 gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex flex-col items-center gap-1 h-auto py-2.5 text-xs"
                                onClick={() => setActionMode('manual')}
                              >
                                <Edit3 className="w-4 h-4 text-blue-500" />
                                <span>Descripción</span>
                                <span className="text-muted-foreground">manual</span>
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex flex-col items-center gap-1 h-auto py-2.5 text-xs"
                                onClick={() => setActionMode('link')}
                              >
                                <Link2 className="w-4 h-4 text-green-500" />
                                <span>Vincular</span>
                                <span className="text-muted-foreground">Wikipedia</span>
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex flex-col items-center gap-1 h-auto py-2.5 text-xs"
                                onClick={() => setActionMode('reclassify')}
                              >
                                <RefreshCw className="w-4 h-4 text-orange-500" />
                                <span>Reclasificar</span>
                                <span className="text-muted-foreground">y reintentar</span>
                              </Button>
                            </div>
                          )}

                          {/* Manual description form */}
                          {actionMode === 'manual' && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-medium flex items-center gap-1.5">
                                  <Edit3 className="w-3.5 h-3.5 text-blue-500" />
                                  Descripción manual
                                </p>
                                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setActionMode(null)}>
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                              <Textarea
                                placeholder="Describe este punto..."
                                value={manualDescription}
                                onChange={e => setManualDescription(e.target.value)}
                                rows={4}
                                className="text-xs"
                              />
                              <Button
                                size="sm"
                                className="w-full"
                                disabled={!manualDescription.trim() || isProcessing}
                                onClick={() => handleSaveManual(loc)}
                              >
                                {isProcessing ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <Check className="w-3 h-3 mr-1.5" />}
                                Guardar descripción
                              </Button>
                            </div>
                          )}

                          {/* Wikipedia link form */}
                          {actionMode === 'link' && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-medium flex items-center gap-1.5">
                                  <Link2 className="w-3.5 h-3.5 text-green-500" />
                                  Vincular a Wikipedia
                                </p>
                                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setActionMode(null)}>
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                              <div className="flex gap-1.5">
                                <Input
                                  placeholder="Buscar lugar..."
                                  value={wikiQuery}
                                  onChange={e => setWikiQuery(e.target.value)}
                                  className="text-xs h-8"
                                  onKeyDown={e => e.key === 'Enter' && handleWikiSearch(loc)}
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2"
                                  disabled={wikiSearching || !wikiQuery.trim()}
                                  onClick={() => handleWikiSearch(loc)}
                                >
                                  {wikiSearching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                                </Button>
                              </div>

                              {wikiResults.length > 0 && (
                                <ScrollArea className="max-h-48">
                                  <div className="space-y-1.5">
                                    {wikiResults.map(wiki => (
                                      <button
                                        key={wiki.pageId}
                                        className="w-full text-left p-2 rounded-md border border-border hover:bg-accent/50 transition-colors"
                                        onClick={() => handleLinkWikipedia(loc, wiki)}
                                        disabled={isProcessing}
                                      >
                                        <div className="flex items-start gap-1.5">
                                          <ExternalLink className="w-3 h-3 mt-0.5 text-muted-foreground shrink-0" />
                                          <div className="min-w-0">
                                            <p className="text-xs font-medium truncate">{wiki.title}</p>
                                            {wiki.distance !== undefined && (
                                              <Badge variant="outline" className="text-[10px] h-4 mt-0.5">
                                                {wiki.distance}m
                                              </Badge>
                                            )}
                                            <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">
                                              {wiki.extract}
                                            </p>
                                          </div>
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                </ScrollArea>
                              )}
                            </div>
                          )}

                          {/* Reclassify form */}
                          {actionMode === 'reclassify' && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-medium flex items-center gap-1.5">
                                  <RefreshCw className="w-3.5 h-3.5 text-orange-500" />
                                  Reclasificar y reintentar
                                </p>
                                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setActionMode(null)}>
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                              <Input
                                placeholder="Nuevo nombre del punto..."
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                className="text-xs h-8"
                              />
                              <Select value={newPlaceType} onValueChange={v => setNewPlaceType(v as PlaceType)}>
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.entries(PLACE_TYPE_LABELS).map(([key, label]) => (
                                    <SelectItem key={key} value={key} className="text-xs">
                                      {label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                size="sm"
                                className="w-full"
                                disabled={!newName.trim() || isProcessing}
                                onClick={() => handleReclassifyRetry(loc)}
                              >
                                {isProcessing ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <RefreshCw className="w-3 h-3 mr-1.5" />}
                                Reclasificar y enriquecer
                              </Button>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    </FloatingPanel>
  );
}
