import React, { useState } from 'react';
import { Sparkles, Loader2, X, MapPin, Utensils, Calendar, Lightbulb, CheckCircle, AlertCircle, Globe, Mountain, Building, Landmark, Eye } from 'lucide-react';
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
import { GeoLocation, EnrichedLocationData, PlaceType, PLACE_TYPE_LABELS } from '@/types/location';
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
        
        // Update the location in the store
        updateLocation(selectedDocument.id, location.id, {
          enrichedData: data.data,
        });
        
        toast.success('Ubicación enriquecida correctamente');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al conectar con el servicio');
    } finally {
      setIsLoading(false);
    }
  };

  // Update enrichedData when location changes
  React.useEffect(() => {
    setEnrichedData(location?.enrichedData || null);
  }, [location]);

  if (!location) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-hidden flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Ficha Enriquecida
          </SheetTitle>
          <SheetDescription>
            {location.name}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-6 py-4">
            {/* Location info */}
            <div className="p-4 bg-muted/50 rounded-lg space-y-3">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">
                  {location.coordinates.lat.toFixed(6)}, {location.coordinates.lng.toFixed(6)}
                </span>
              </div>
              
              {/* Place type badge */}
              {location.placeType && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Tipo:</span>
                  <Badge variant="default" className="bg-purple-600 hover:bg-purple-700 text-white">
                    {PLACE_TYPE_LABELS[location.placeType]}
                  </Badge>
                </div>
              )}
              
              {/* Location tags - Continent, Country, Region, Zone */}
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
                <p className="text-sm text-muted-foreground mt-2">
                  {location.description}
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
                    Buscando información...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Enriquecer con IA
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
                <p className="text-muted-foreground">
                  Buscando información turística, gastronómica y de viajes...
                </p>
              </motion.div>
            )}

            {/* Enriched data display */}
            <AnimatePresence>
              {enrichedData && !isLoading && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  {/* Verification status */}
                  <div className={`flex items-start gap-3 p-3 rounded-lg ${
                    enrichedData.verified ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'
                  }`}>
                    {enrichedData.verified ? (
                      <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className={`font-medium text-sm ${enrichedData.verified ? 'text-green-800' : 'text-yellow-800'}`}>
                        {enrichedData.verified ? 'Ubicación verificada' : 'Verificación pendiente'}
                      </p>
                      <p className={`text-sm ${enrichedData.verified ? 'text-green-700' : 'text-yellow-700'}`}>
                        {enrichedData.verification_notes}
                      </p>
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <h4 className="font-semibold mb-2">Descripción</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {enrichedData.enriched_description}
                    </p>
                  </div>

                  {/* Tourism */}
                  <div>
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-primary" />
                      Turismo
                    </h4>
                    <div className="space-y-3">
                      {enrichedData.tourism.main_attractions.length > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Atracciones principales</p>
                          <div className="flex flex-wrap gap-1.5">
                            {enrichedData.tourism.main_attractions.map((attr, i) => (
                              <Badge key={i} variant="secondary">{attr}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {enrichedData.tourism.best_season && (
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Mejor época</p>
                          <p className="text-sm flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                            {enrichedData.tourism.best_season}
                          </p>
                        </div>
                      )}
                      {enrichedData.tourism.tips.length > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Consejos</p>
                          <ul className="text-sm space-y-1">
                            {enrichedData.tourism.tips.map((tip, i) => (
                              <li key={i} className="flex items-start gap-2">
                                <span className="text-primary">•</span>
                                {tip}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Gastronomy */}
                  <div>
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <Utensils className="w-4 h-4 text-primary" />
                      Gastronomía
                    </h4>
                    <div className="space-y-3">
                      {enrichedData.gastronomy.typical_dishes.length > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Platos típicos</p>
                          <div className="flex flex-wrap gap-1.5">
                            {enrichedData.gastronomy.typical_dishes.map((dish, i) => (
                              <Badge key={i} variant="outline">{dish}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {enrichedData.gastronomy.food_tips && (
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Recomendaciones</p>
                          <p className="text-sm text-muted-foreground">{enrichedData.gastronomy.food_tips}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Practical info */}
                  <div>
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <Lightbulb className="w-4 h-4 text-primary" />
                      Información práctica
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      {enrichedData.practical_info.estimated_time && (
                        <div className="p-3 bg-muted/50 rounded-lg">
                          <p className="text-xs text-muted-foreground">Tiempo recomendado</p>
                          <p className="text-sm font-medium">{enrichedData.practical_info.estimated_time}</p>
                        </div>
                      )}
                      {enrichedData.practical_info.budget && (
                        <div className="p-3 bg-muted/50 rounded-lg">
                          <p className="text-xs text-muted-foreground">Presupuesto</p>
                          <p className="text-sm font-medium">{enrichedData.practical_info.budget}</p>
                        </div>
                      )}
                    </div>
                    {enrichedData.practical_info.accessibility && (
                      <div className="mt-3">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Cómo llegar</p>
                        <p className="text-sm text-muted-foreground">{enrichedData.practical_info.accessibility}</p>
                      </div>
                    )}
                  </div>

                  {/* Curiosities */}
                  {enrichedData.curiosities.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-3">Datos curiosos</h4>
                      <ul className="text-sm space-y-2">
                        {enrichedData.curiosities.map((curiosity, i) => (
                          <li key={i} className="flex items-start gap-2 p-2 bg-muted/30 rounded">
                            <span className="text-lg">💡</span>
                            {curiosity}
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
                    Volver a enriquecer
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
