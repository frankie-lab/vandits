import React, { useState } from 'react';
import { Sparkles, Loader2, MapPin, CheckCircle, AlertCircle, Globe, ExternalLink, Hash, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useLocationsStore } from '@/store/locations-store';
import { GeoLocation, EnrichedLocationData, PLACE_TYPE_LABELS, getPlaceTypeFromTipo } from '@/types/location';
import { supabase } from '@/integrations/supabase/client';
import { updateLocationInDatabase } from '@/hooks/use-database-sync';
import { toast } from 'sonner';

interface EnrichLocationPanelProps {
  location: GeoLocation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Collapsible Technical Data Section
function TechnicalDataSection({ location, enrichedData }: { location: GeoLocation; enrichedData: EnrichedLocationData }) {
  const [isOpen, setIsOpen] = useState(false);
  const geoData = enrichedData.datos_geograficos;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between px-3 py-2 h-auto text-sm text-muted-foreground hover:text-foreground">
          <span className="flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            Datos técnicos del punto
          </span>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pt-2">
        {/* Jerarquía geográfica completa */}
        {geoData && (
          <div className="border rounded-lg overflow-hidden">
            <div className="p-2 bg-blue-50 dark:bg-blue-950 border-b">
              <span className="text-xs font-medium text-blue-700 dark:text-blue-300 uppercase tracking-wide">
                Jerarquía Administrativa
              </span>
            </div>
            <div className="grid divide-y text-sm">
              {geoData.continente && (
                <div className="flex justify-between p-2">
                  <span className="text-muted-foreground text-xs">Continente</span>
                  <span className="font-medium text-xs">{geoData.continente}</span>
                </div>
              )}
              {geoData.pais && (
                <div className="flex justify-between p-2 bg-muted/20">
                  <span className="text-muted-foreground text-xs">País</span>
                  <span className="font-medium text-xs">{geoData.pais}</span>
                </div>
              )}
              {geoData.admin_nivel_1 && (
                <div className="flex justify-between p-2">
                  <span className="text-muted-foreground text-xs">Región/Comunidad</span>
                  <span className="font-medium text-xs text-right max-w-[60%]">{geoData.admin_nivel_1}</span>
                </div>
              )}
              {geoData.admin_nivel_2 && (
                <div className="flex justify-between p-2 bg-muted/20">
                  <span className="text-muted-foreground text-xs">Provincia/Dpto.</span>
                  <span className="font-medium text-xs text-right max-w-[60%]">{geoData.admin_nivel_2}</span>
                </div>
              )}
              {geoData.admin_nivel_3 && (
                <div className="flex justify-between p-2">
                  <span className="text-muted-foreground text-xs">Comarca/Municipio</span>
                  <span className="font-medium text-xs text-right max-w-[60%]">{geoData.admin_nivel_3}</span>
                </div>
              )}
              {geoData.localidad && (
                <div className="flex justify-between p-2 bg-muted/20">
                  <span className="text-muted-foreground text-xs">Localidad</span>
                  <span className="font-medium text-xs text-right max-w-[60%]">{geoData.localidad}</span>
                </div>
              )}
              {geoData.sublocalidad && (
                <div className="flex justify-between p-2">
                  <span className="text-muted-foreground text-xs">Barrio</span>
                  <span className="font-medium text-xs text-right max-w-[60%]">{geoData.sublocalidad}</span>
                </div>
              )}
              {geoData.lugar_interes && (
                <div className="flex justify-between p-2 bg-muted/20">
                  <span className="text-muted-foreground text-xs">Lugar de interés</span>
                  <span className="font-medium text-xs text-right max-w-[60%]">{geoData.lugar_interes}</span>
                </div>
              )}
              {geoData.direccion_postal && (
                <div className="flex justify-between p-2">
                  <span className="text-muted-foreground text-xs">Dirección</span>
                  <span className="font-medium text-xs text-right max-w-[60%]">{geoData.direccion_postal}</span>
                </div>
              )}
              <div className="flex justify-between p-2 bg-muted/20">
                <span className="text-muted-foreground text-xs">Coordenadas</span>
                <span className="font-mono text-xs">{geoData.coordenadas || `${location.coordinates.lat.toFixed(6)}, ${location.coordinates.lng.toFixed(6)}`}</span>
              </div>
            </div>
          </div>
        )}

        {/* Datos del punto original */}
        <div className="p-3 bg-muted/50 rounded-lg space-y-3">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-mono">
              {location.coordinates.lat.toFixed(6)}, {location.coordinates.lng.toFixed(6)}
            </span>
          </div>
          
          {location.placeType && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Tipo:</span>
              <Badge variant="default" className="bg-purple-600 hover:bg-purple-700 text-white">
                {PLACE_TYPE_LABELS[location.placeType]}
              </Badge>
            </div>
          )}
          
          {location.description && (
            <p className="text-sm text-muted-foreground italic">
              Descripción original: {location.description}
            </p>
          )}
        </div>

        {/* Datos clave detallados */}
        <div className="border rounded-lg overflow-hidden">
          <div className="grid divide-y text-sm">
            <div className="flex justify-between p-3 bg-muted/30">
              <span className="text-muted-foreground">Tipo</span>
              <span className="font-medium">{enrichedData.datos_clave.tipo}</span>
            </div>
            {enrichedData.datos_clave.dimension_principal && (
              <div className="flex justify-between p-3">
                <span className="text-muted-foreground">Dimensión</span>
                <span className="font-medium">{enrichedData.datos_clave.dimension_principal}</span>
              </div>
            )}
            {enrichedData.datos_clave.acceso && (
              <div className="flex justify-between p-3 bg-muted/30">
                <span className="text-muted-foreground">Acceso</span>
                <span className="font-medium text-right max-w-[60%]">{enrichedData.datos_clave.acceso}</span>
              </div>
            )}
            {enrichedData.datos_clave.estado_proteccion && (
              <div className="flex justify-between p-3">
                <span className="text-muted-foreground">Protección</span>
                <span className="font-medium text-right max-w-[60%]">{enrichedData.datos_clave.estado_proteccion}</span>
              </div>
            )}
            <div className="flex justify-between p-3 bg-muted/30">
              <span className="text-muted-foreground">Coordenadas</span>
              <span className="font-mono text-xs">{enrichedData.datos_clave.coordenadas}</span>
            </div>
            {enrichedData.datos_clave.web_referencia && (
              <div className="flex justify-between p-3 items-center">
                <span className="text-muted-foreground">Referencia</span>
                <a 
                  href={enrichedData.datos_clave.web_referencia.startsWith('http') ? enrichedData.datos_clave.web_referencia : `https://${enrichedData.datos_clave.web_referencia}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline flex items-center gap-1 text-sm"
                >
                  <ExternalLink className="w-3 h-3" />
                  Web oficial
                </a>
              </div>
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function EnrichLocationPanel({ location, open, onOpenChange }: EnrichLocationPanelProps) {
  const { selectedDocument, updateLocation } = useLocationsStore();
  const [isLoading, setIsLoading] = useState(false);
  const [enrichedData, setEnrichedData] = useState<EnrichedLocationData | null>(
    location?.enrichedData || null
  );

  const handleEnrich = async () => {
    if (!location || !selectedDocument) return;

    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('enrich-location', {
        body: {
          location: {
            name: location.name,
            description: location.description,
            coordinates: location.coordinates,
            country: location.country,
            region: location.region,
            zone: location.zone,
            continent: location.continent,
          },
          generateImage: true,
        }
      });

      if (error) {
        console.error('Error enriching location:', error);
        toast.error('Error al enriquecer la ubicación');
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      if (data?.success && data?.data) {
        setEnrichedData(data.data);
        
        // Extract geocoded data from enrichment response
        const geocoded = data.data._geocoded || {};
        
        // Derive placeType from datos_clave.tipo (más preciso que categoria)
        const derivedPlaceType = data.data.datos_clave?.tipo 
          ? getPlaceTypeFromTipo(data.data.datos_clave.tipo)
          : undefined;
        
        // Build updates object with enriched data AND geographic fields
        const updates: Partial<GeoLocation> = {
          enrichedData: data.data,
        };
        
        // Update placeType from AI datos_clave.tipo
        if (derivedPlaceType && derivedPlaceType !== 'other') {
          updates.placeType = derivedPlaceType;
        }
        
        // Update geographic fields if they were geocoded by the enrichment
        if (geocoded.country && !location.country) {
          updates.country = geocoded.country;
        }
        if (geocoded.region && !location.region) {
          updates.region = geocoded.region;
        }
        if (geocoded.zone && !location.zone) {
          updates.zone = geocoded.zone;
        }
        if (geocoded.continent && !location.continent) {
          updates.continent = geocoded.continent;
        }
        
        // Update store with all changes
        updateLocation(location.id, updates);
        
        // Create updated location for database
        const updatedLocation: GeoLocation = {
          ...location,
          ...updates,
        };
        
        // Save to database
        await updateLocationInDatabase(updatedLocation);
        
        toast.success('Ficha técnica generada y guardada');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al conectar con el servicio');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadImage = () => {
    if (!enrichedData?.imagen) return;
    
    const link = document.createElement('a');
    link.href = enrichedData.imagen;
    link.download = `${enrichedData.nombre_lugar.replace(/\s+/g, '_')}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  React.useEffect(() => {
    setEnrichedData(location?.enrichedData || null);
  }, [location]);

  if (!location) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-hidden flex flex-col pt-6">

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-6 py-4">
            {/* Enrich button - only show if not enriched */}
            {!enrichedData && !isLoading && (
              <div className="space-y-3">
                {/* Location info básica (solo cuando no hay datos enriquecidos) */}
                <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-mono">
                      {location.coordinates.lat.toFixed(6)}, {location.coordinates.lng.toFixed(6)}
                    </span>
                  </div>
                  
                  {location.placeType && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground uppercase tracking-wide">Tipo:</span>
                      <Badge variant="default" className="bg-purple-600 hover:bg-purple-700 text-white">
                        {PLACE_TYPE_LABELS[location.placeType]}
                      </Badge>
                    </div>
                  )}
                  
                  <div className="space-y-2">
                    <span className="text-xs text-muted-foreground uppercase tracking-wide">Ubicación original:</span>
                    <div className="flex flex-wrap gap-2">
                      {location.continent && (
                        <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 gap-1">
                          <Globe className="w-3 h-3" />
                          {location.continent}
                        </Badge>
                      )}
                      {location.country && (
                        <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                          {location.country}
                        </Badge>
                      )}
                      {location.region && (
                        <Badge variant="outline" className="bg-orange-50 text-orange-700 dark:bg-orange-900 dark:text-orange-300 border-orange-200">
                          {location.region}
                        </Badge>
                      )}
                      {location.zone && (
                        <Badge variant="outline" className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                          {location.zone}
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  {location.description && (
                    <p className="text-sm text-muted-foreground mt-2 italic">
                      Descripción original: {location.description}
                    </p>
                  )}
                </div>

                <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    <strong>Esta ubicación aún no tiene ficha técnica.</strong> Genera una ficha enriquecida con datos verificados, imágenes y referencias.
                  </p>
                </div>
                <Button
                  onClick={handleEnrich}
                  disabled={isLoading}
                  className="w-full gap-2 ocean-gradient"
                  size="lg"
                >
                  <Sparkles className="w-5 h-5" />
                  Generar Ficha Técnica
                </Button>
              </div>
            )}

            {/* Loading state */}
            {isLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-8 space-y-4"
              >
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-sm">
                    Validando coordenadas y generando ficha técnica...
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Esto puede tardar unos segundos (incluye generación de imagen)
                  </p>
                </div>
              </motion.div>
            )}

            {/* Enriched data display */}
            <AnimatePresence>
              {enrichedData && !isLoading && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-5"
                >
                  {/* 1. Imagen (siempre arriba) */}
                  {enrichedData.imagen && (
                    <div className="relative rounded-lg overflow-hidden border">
                      <img 
                        src={enrichedData.imagen} 
                        alt={enrichedData.nombre_lugar}
                        className="w-full h-48 object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                        <div className="flex items-center justify-between">
                          <span className="text-white/80 text-xs">
                            {enrichedData.imagen_fuente || 'Wikimedia Commons (CC)'}
                          </span>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="h-6 px-2 gap-1 text-xs"
                            onClick={handleDownloadImage}
                          >
                            <Download className="w-3 h-3" />
                            Descargar
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 2. Nombre del lugar */}
                  <div className="border-b pb-4">
                    <h3 className="text-xl font-semibold text-foreground">
                      {enrichedData.nombre_lugar}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {enrichedData.localizacion}
                    </p>
                  </div>

                  {/* 3. Nube de etiquetas geográficas */}
                  <div className="flex flex-wrap gap-2">
                    {location.continent && (
                      <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 gap-1">
                        <Globe className="w-3 h-3" />
                        {location.continent}
                      </Badge>
                    )}
                    {location.country && (
                      <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                        {location.country}
                      </Badge>
                    )}
                    {location.region && (
                      <Badge variant="outline" className="bg-orange-50 text-orange-700 dark:bg-orange-900 dark:text-orange-300 border-orange-200">
                        {location.region}
                      </Badge>
                    )}
                    {location.zone && (
                      <Badge variant="outline" className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                        {location.zone}
                      </Badge>
                    )}
                  </div>

                  {/* 4. Punto destacado (frase destacada) */}
                  <div className="p-3 bg-primary/5 border-l-4 border-primary rounded-r-lg">
                    <p className="text-sm font-medium">
                      {enrichedData.punto_destacado}
                    </p>
                  </div>

                  {/* 5. Descripción */}
                  <p className="text-sm leading-relaxed">
                    {enrichedData.descripcion}
                  </p>

                  {/* 6. Nube de hashtags temáticos */}
                  {enrichedData.etiquetas && enrichedData.etiquetas.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {enrichedData.etiquetas.map((etiqueta, i) => (
                        <Badge 
                          key={i} 
                          variant="secondary" 
                          className="bg-primary/10 text-primary hover:bg-primary/20 font-normal"
                        >
                          <Hash className="w-3 h-3 mr-0.5" />
                          {etiqueta.replace(/^#/, '')}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* 7. Observación (opcional) */}
                  {enrichedData.observacion && (
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <p className="text-sm text-muted-foreground italic">
                        {enrichedData.observacion}
                      </p>
                    </div>
                  )}

                  {/* 8. Verification status */}
                  <div className={`flex items-start gap-3 p-3 rounded-lg border ${
                    enrichedData.verified 
                      ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800' 
                      : 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800'
                  }`}>
                    {enrichedData.verified ? (
                      <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className={`font-medium text-sm ${
                        enrichedData.verified 
                          ? 'text-green-800 dark:text-green-200' 
                          : 'text-yellow-800 dark:text-yellow-200'
                      }`}>
                        {enrichedData.verified ? 'Datos verificados' : 'Verificación parcial'}
                      </p>
                      <p className={`text-sm ${
                        enrichedData.verified 
                          ? 'text-green-700 dark:text-green-300' 
                          : 'text-yellow-700 dark:text-yellow-300'
                      }`}>
                        {enrichedData.verification_notes}
                      </p>
                    </div>
                  </div>

                  {/* 9. Fuentes */}
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p className="uppercase tracking-wide font-medium">Fuentes</p>
                    <ul className="space-y-0.5">
                      {enrichedData.fuentes.map((fuente, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-primary">•</span>
                          {fuente}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* 10. Datos técnicos (ocultos por defecto) */}
                  <TechnicalDataSection location={location} enrichedData={enrichedData} />

                  {/* Re-enrich button - secondary action */}
                  <div className="pt-4 border-t">
                    <p className="text-xs text-muted-foreground mb-2 text-center">
                      ¿Quieres actualizar la información? Los datos se regenerarán completamente.
                    </p>
                    <Button
                      onClick={handleEnrich}
                      disabled={isLoading}
                      variant="outline"
                      className="w-full gap-2"
                    >
                      <Sparkles className="w-4 h-4" />
                      Regenerar ficha
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
