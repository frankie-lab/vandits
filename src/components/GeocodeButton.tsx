import React, { useState } from 'react';
import { MapPin, Loader2, CheckCircle, Globe2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useLocationsStore } from '@/store/locations-store';
import { batchReverseGeocode, GeocodingProgress } from '@/lib/geocoding';
import { batchUpdateLocations } from '@/hooks/use-database-sync';
import { toast } from 'sonner';

export function GeocodeButton() {
  const { selectedDocument, updateLocation, getFilteredLocations } = useLocationsStore();
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [progress, setProgress] = useState<GeocodingProgress | null>(null);
  const [showDialog, setShowDialog] = useState(false);

  const locations = getFilteredLocations();
  
  // Count locations without country data
  const locationsToProcess = locations.filter(loc => !loc.country);
  const needsGeocoding = locationsToProcess.length > 0;

  const handleGeocode = async () => {
    if (!selectedDocument || locationsToProcess.length === 0) return;

    setIsGeocoding(true);
    setShowDialog(true);
    setProgress({ current: 0, total: locationsToProcess.length, currentName: '' });

    const locationsData = locationsToProcess.map(loc => ({
      id: loc.id,
      name: loc.name,
      lat: loc.coordinates.lat,
      lng: loc.coordinates.lng,
    }));

    let successCount = 0;
    const updatedLocations: typeof locations = [];

    await batchReverseGeocode(
      locationsData,
      (prog) => setProgress(prog),
      (id, result) => {
        if (result.country) {
          updateLocation(id, {
            country: result.country,
            region: result.region,
            zone: result.zone,
            continent: result.continent,
          });
          
          // Track updated location for database save
          const loc = locationsToProcess.find(l => l.id === id);
          if (loc) {
            updatedLocations.push({
              ...loc,
              country: result.country,
              region: result.region,
              zone: result.zone,
              continent: result.continent,
            });
          }
          successCount++;
        }
      }
    );

    // Save all updates to database
    if (updatedLocations.length > 0) {
      await batchUpdateLocations(updatedLocations);
    }

    setIsGeocoding(false);
    setShowDialog(false);
    toast.success(`Geocodificación completada: ${successCount} ubicaciones guardadas`);
  };

  const estimatedTime = Math.ceil(locationsToProcess.length * 1.1 / 60);

  if (!selectedDocument) return null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleGeocode}
        disabled={isGeocoding || !needsGeocoding}
        className="gap-2"
      >
        {isGeocoding ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Globe2 className="w-4 h-4" />
        )}
        {needsGeocoding 
          ? `Geocodificar (${locationsToProcess.length})`
          : 'Todo geocodificado'
        }
      </Button>

      <Dialog open={showDialog} onOpenChange={(open) => !isGeocoding && setShowDialog(open)}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe2 className="w-5 h-5 text-primary" />
              Geocodificando ubicaciones
            </DialogTitle>
            <DialogDescription>
              Obteniendo país, región y zona para cada punto...
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {progress && (
              <>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Progreso</span>
                    <span className="font-medium">{progress.current} / {progress.total}</span>
                  </div>
                  <Progress value={(progress.current / progress.total) * 100} />
                </div>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={progress.currentName}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex items-center gap-2 p-3 bg-muted rounded-lg"
                  >
                    <MapPin className="w-4 h-4 text-primary shrink-0" />
                    <span className="text-sm truncate">{progress.currentName}</span>
                  </motion.div>
                </AnimatePresence>

                <p className="text-xs text-muted-foreground text-center">
                  Tiempo estimado restante: ~{Math.ceil((progress.total - progress.current) * 1.1 / 60)} min
                </p>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
