import React, { useState } from 'react';
import { Sparkles, Loader2, MapPin, CheckCircle, AlertCircle, Globe, ExternalLink, FileText, BookOpen, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useLocationsStore } from '@/store/locations-store';
import { GeoLocation, EnrichedLocationData, PLACE_TYPE_LABELS } from '@/types/location';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface EnrichLocationPanelProps {
  location: GeoLocation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
          }
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
        
        updateLocation(selectedDocument.id, location.id, {
          enrichedData: data.data,
        });
        
        toast.success('Ficha técnica generada correctamente');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al conectar con el servicio');
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    setEnrichedData(location?.enrichedData || null);
  }, [location]);

  if (!location) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-hidden flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Ficha Técnica
          </SheetTitle>
          <SheetDescription>
            {location.name}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-6 py-4">
            {/* Location info básica */}
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
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Ubicación:</span>
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

            {/* Enrich button */}
            {!enrichedData && (
              <Button
                onClick={handleEnrich}
                disabled={isLoading}
                className="w-full gap-2 ocean-gradient"
                size="lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Generando ficha técnica...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Generar Ficha Técnica
                  </>
                )}
              </Button>
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
                <p className="text-muted-foreground text-sm">
                  Validando coordenadas y generando ficha técnica verificable...
                </p>
              </motion.div>
            )}

            {/* Enriched data display - Nueva estructura técnica */}
            <AnimatePresence>
              {enrichedData && !isLoading && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-5"
                >
                  {/* Verification status */}
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
                        {enrichedData.verified ? 'Datos verificados' : 'Verificación pendiente'}
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

                  {/* Nombre del lugar */}
                  <div className="border-b pb-3">
                    <h3 className="text-lg font-semibold text-foreground">
                      {enrichedData.nombre_lugar}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {enrichedData.localizacion}
                    </p>
                  </div>

                  {/* Descripción */}
                  <div>
                    <h4 className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Descripción</h4>
                    <p className="text-sm leading-relaxed">
                      {enrichedData.descripcion}
                    </p>
                  </div>

                  {/* Punto destacado */}
                  <div className="p-3 bg-primary/5 border-l-4 border-primary rounded-r-lg">
                    <h4 className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Punto destacado</h4>
                    <p className="text-sm font-medium">
                      {enrichedData.punto_destacado}
                    </p>
                  </div>

                  {/* Observación (opcional) */}
                  {enrichedData.observacion && (
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <h4 className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Observación</h4>
                      <p className="text-sm text-muted-foreground">
                        {enrichedData.observacion}
                      </p>
                    </div>
                  )}

                  {/* Datos clave */}
                  <div>
                    <h4 className="text-xs text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                      <BookOpen className="w-4 h-4" />
                      Datos clave
                    </h4>
                    <div className="grid gap-2 text-sm">
                      <div className="flex justify-between py-2 border-b border-dashed">
                        <span className="text-muted-foreground">Tipo</span>
                        <span className="font-medium">{enrichedData.datos_clave.tipo}</span>
                      </div>
                      {enrichedData.datos_clave.dimension_principal && (
                        <div className="flex justify-between py-2 border-b border-dashed">
                          <span className="text-muted-foreground">Dimensión</span>
                          <span className="font-medium">{enrichedData.datos_clave.dimension_principal}</span>
                        </div>
                      )}
                      <div className="flex justify-between py-2 border-b border-dashed">
                        <span className="text-muted-foreground">Acceso</span>
                        <span className="font-medium text-right max-w-[60%]">{enrichedData.datos_clave.acceso}</span>
                      </div>
                      {enrichedData.datos_clave.estado_proteccion && (
                        <div className="flex justify-between py-2 border-b border-dashed">
                          <span className="text-muted-foreground">Protección</span>
                          <span className="font-medium text-right max-w-[60%]">{enrichedData.datos_clave.estado_proteccion}</span>
                        </div>
                      )}
                      <div className="flex justify-between py-2 border-b border-dashed">
                        <span className="text-muted-foreground">Coordenadas</span>
                        <span className="font-mono text-xs">{enrichedData.datos_clave.coordenadas}</span>
                      </div>
                      {enrichedData.datos_clave.web_referencia && (
                        <div className="flex justify-between py-2 items-center">
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

                  {/* Fuentes */}
                  <div>
                    <h4 className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Fuentes</h4>
                    <ul className="text-sm space-y-1">
                      {enrichedData.fuentes.map((fuente, i) => (
                        <li key={i} className="flex items-start gap-2 text-muted-foreground">
                          <span className="text-primary mt-1">•</span>
                          {fuente}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Datos no verificados (si existen) */}
                  {enrichedData.datos_no_verificados && enrichedData.datos_no_verificados.length > 0 && (
                    <div className="p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
                      <h4 className="text-xs text-amber-700 dark:text-amber-300 uppercase tracking-wide mb-2 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        Datos no verificados
                      </h4>
                      <ul className="text-sm space-y-1">
                        {enrichedData.datos_no_verificados.map((dato, i) => (
                          <li key={i} className="text-amber-700 dark:text-amber-300">
                            • {dato}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Re-enrich button */}
                  <Button
                    onClick={handleEnrich}
                    disabled={isLoading}
                    variant="outline"
                    className="w-full gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    Regenerar ficha
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
