import React, { useCallback, useState } from 'react';
import { Upload, FileUp, Globe2, AlertTriangle, CheckCircle, X, Eye, Users, Lock, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { parseKML } from '@/lib/kml-parser';
import { useLocationsStore } from '@/store/locations-store';
import { saveDocumentToDatabase, loadAllLocationsFromDatabase } from '@/hooks/use-database-sync';
import { deduplicateLocations, formatDistance, DuplicateMatch } from '@/lib/duplicate-detection';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { KMLDocument, GeoLocation, LocationVisibility } from '@/types/location';

interface FileUploadZoneProps {
  onUploadComplete?: () => void;
}

interface DeduplicationState {
  document: KMLDocument;
  uniqueLocations: GeoLocation[];
  duplicates: DuplicateMatch[];
}

interface UploadConditions {
  visibility: LocationVisibility;
  acceptTerms: boolean;
  acceptDuplicatePolicy: boolean;
}

const VISIBILITY_OPTIONS: { value: LocationVisibility; label: string; description: string; icon: React.ReactNode }[] = [
  { 
    value: 'public', 
    label: 'Público', 
    description: 'Cualquier usuario puede ver estas ubicaciones',
    icon: <Eye className="w-4 h-4" />
  },
  { 
    value: 'followers', 
    label: 'Seguidores', 
    description: 'Solo tus seguidores aceptados pueden ver estas ubicaciones',
    icon: <Users className="w-4 h-4" />
  },
  { 
    value: 'private', 
    label: 'Privado', 
    description: 'Solo tú puedes ver estas ubicaciones',
    icon: <Lock className="w-4 h-4" />
  },
];

export function FileUploadZone({ onUploadComplete }: FileUploadZoneProps) {
  const addDocument = useLocationsStore(state => state.addDocument);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showDuplicatesDialog, setShowDuplicatesDialog] = useState(false);
  const [showConditionsDialog, setShowConditionsDialog] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadConditions, setUploadConditions] = useState<UploadConditions>({
    visibility: 'followers',
    acceptTerms: false,
    acceptDuplicatePolicy: false,
  });
  const [deduplicationState, setDeduplicationState] = useState<DeduplicationState | null>(null);

  // Show conditions dialog first when a file is selected
  const initiateUpload = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith('.kml')) {
      toast.error('Por favor, sube un archivo KML válido');
      return;
    }
    setPendingFile(file);
    setUploadConditions({
      visibility: 'followers',
      acceptTerms: false,
      acceptDuplicatePolicy: false,
    });
    setShowConditionsDialog(true);
  }, []);

  const handleFile = useCallback(async (file: File, visibility: LocationVisibility) => {
    setIsProcessing(true);
    
    try {
      const content = await file.text();
      const document = parseKML(content, file.name);
      
      // Apply visibility to all locations
      document.locations = document.locations.map(loc => ({
        ...loc,
        visibility,
      }));
      
      // Load all existing locations for duplicate detection
      const existingLocations = await loadAllLocationsFromDatabase();
      
      // Detect duplicates
      const { uniqueLocations, duplicates, stats } = deduplicateLocations(
        document.locations,
        existingLocations
      );
      
      // If duplicates found, show dialog
      if (duplicates.length > 0) {
        setDeduplicationState({
          document,
          uniqueLocations,
          duplicates,
        });
        setShowDuplicatesDialog(true);
        setIsProcessing(false);
        return;
      }
      
      // No duplicates, save normally
      const saved = await saveDocumentToDatabase(document);
      
      if (saved) {
        addDocument(document);
        toast.success(`Guardado: ${document.locations.length} ubicaciones en base de datos`);
        onUploadComplete?.();
      }
    } catch (error) {
      console.error('Error parsing KML:', error);
      toast.error('Error al procesar el archivo KML');
    } finally {
      setIsProcessing(false);
    }
  }, [addDocument, onUploadComplete]);

  const handleConfirmConditions = async () => {
    if (!pendingFile) return;
    
    setShowConditionsDialog(false);
    await handleFile(pendingFile, uploadConditions.visibility);
    setPendingFile(null);
  };

  const handleCancelConditions = () => {
    setShowConditionsDialog(false);
    setPendingFile(null);
    setUploadConditions({
      visibility: 'followers',
      acceptTerms: false,
      acceptDuplicatePolicy: false,
    });
  };

  const handleConfirmDeduplication = async () => {
    if (!deduplicationState) return;
    
    setIsProcessing(true);
    
    try {
      const { document, uniqueLocations, duplicates } = deduplicationState;
      
      // Create document with only unique locations
      const dedupedDocument: KMLDocument = {
        ...document,
        locations: uniqueLocations,
      };
      
      // Save to database
      if (uniqueLocations.length > 0) {
        const saved = await saveDocumentToDatabase(dedupedDocument);
        
        if (saved) {
          addDocument(dedupedDocument);
          toast.success(
            `Guardadas ${uniqueLocations.length} ubicaciones nuevas. ` +
            `${duplicates.length} duplicados omitidos (se mantienen las versiones existentes enriquecidas).`
          );
        }
      } else {
        toast.info('Todas las ubicaciones ya existen en la base de datos. No se añadieron nuevas.');
      }
      
      onUploadComplete?.();
    } catch (error) {
      console.error('Error saving deduplicated document:', error);
      toast.error('Error al guardar el documento');
    } finally {
      setIsProcessing(false);
      setShowDuplicatesDialog(false);
      setDeduplicationState(null);
    }
  };

  const handleCancelDeduplication = () => {
    setShowDuplicatesDialog(false);
    setDeduplicationState(null);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) initiateUpload(file);
  }, [initiateUpload]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) initiateUpload(file);
  }, [initiateUpload]);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-2xl mx-auto"
      >
        <label
          className={`
            relative flex flex-col items-center justify-center w-full h-64 
            border-2 border-dashed rounded-xl cursor-pointer
            transition-all duration-300 ease-out
            ${isDragging 
              ? 'border-primary bg-accent/50 scale-[1.02]' 
              : 'border-border bg-card hover:border-primary/50 hover:bg-muted/50'
            }
            ${isProcessing ? 'pointer-events-none opacity-70' : ''}
          `}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <input
            type="file"
            accept=".kml"
            className="hidden"
            onChange={handleFileInput}
            disabled={isProcessing}
          />
          
          <motion.div
            animate={isDragging ? { scale: 1.1, y: -5 } : { scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="flex flex-col items-center gap-4"
          >
            <div className={`
              p-4 rounded-full transition-colors duration-300
              ${isDragging ? 'ocean-gradient text-primary-foreground' : 'bg-muted text-muted-foreground'}
            `}>
              {isProcessing ? (
                <Globe2 className="w-10 h-10 animate-spin" />
              ) : isDragging ? (
                <FileUp className="w-10 h-10" />
              ) : (
                <Upload className="w-10 h-10" />
              )}
            </div>
            
            <div className="text-center space-y-2">
              <p className="text-lg font-medium text-foreground">
                {isProcessing 
                  ? 'Analizando duplicados...' 
                  : isDragging 
                    ? 'Suelta el archivo aquí' 
                    : 'Arrastra tu archivo KML aquí'
                }
              </p>
              <p className="text-sm text-muted-foreground">
                o haz clic para seleccionar
              </p>
            </div>
          </motion.div>
          
          {/* Animated border effect */}
          {isDragging && (
            <motion.div
              className="absolute inset-0 rounded-xl border-2 border-primary"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          )}
        </label>
      </motion.div>

      {/* Upload Conditions Dialog */}
      <Dialog open={showConditionsDialog} onOpenChange={(open) => !isProcessing && (open ? null : handleCancelConditions())}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="w-5 h-5 text-primary" />
              Condiciones de subida
            </DialogTitle>
            <DialogDescription>
              Antes de procesar el archivo, configura la visibilidad y acepta las condiciones.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* File info */}
            {pendingFile && (
              <div className="p-3 bg-muted rounded-lg flex items-center gap-3">
                <FileUp className="w-5 h-5 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{pendingFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(pendingFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
            )}

            {/* Visibility selection */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Visibilidad de las ubicaciones</Label>
              <RadioGroup
                value={uploadConditions.visibility}
                onValueChange={(value) => setUploadConditions(prev => ({ ...prev, visibility: value as LocationVisibility }))}
                className="space-y-2"
              >
                {VISIBILITY_OPTIONS.map(option => (
                  <label
                    key={option.value}
                    className={`
                      flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                      ${uploadConditions.visibility === option.value 
                        ? 'border-primary bg-primary/5' 
                        : 'border-border hover:bg-muted/50'
                      }
                    `}
                  >
                    <RadioGroupItem value={option.value} id={option.value} className="mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {option.icon}
                        <span className="font-medium">{option.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{option.description}</p>
                    </div>
                  </label>
                ))}
              </RadioGroup>
            </div>

            {/* Terms acceptance */}
            <div className="space-y-3 border-t pt-4">
              <Label className="text-sm font-medium">Condiciones de uso</Label>
              
              <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer">
                <Checkbox
                  checked={uploadConditions.acceptTerms}
                  onCheckedChange={(checked) => setUploadConditions(prev => ({ ...prev, acceptTerms: checked === true }))}
                  className="mt-0.5"
                />
                <div className="text-sm">
                  <span className="font-medium">Acepto los términos de uso</span>
                  <p className="text-xs text-muted-foreground mt-1">
                    Confirmo que tengo derecho a compartir esta información y que no contiene datos sensibles o personales de terceros.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer">
                <Checkbox
                  checked={uploadConditions.acceptDuplicatePolicy}
                  onCheckedChange={(checked) => setUploadConditions(prev => ({ ...prev, acceptDuplicatePolicy: checked === true }))}
                  className="mt-0.5"
                />
                <div className="text-sm">
                  <span className="font-medium">Acepto la política de duplicados</span>
                  <p className="text-xs text-muted-foreground mt-1">
                    Entiendo que las ubicaciones duplicadas serán omitidas y se mantendrán las versiones existentes enriquecidas.
                  </p>
                </div>
              </label>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleCancelConditions}>
              <X className="w-4 h-4 mr-1" />
              Cancelar
            </Button>
            <Button 
              onClick={handleConfirmConditions}
              disabled={!uploadConditions.acceptTerms || !uploadConditions.acceptDuplicatePolicy}
            >
              <Upload className="w-4 h-4 mr-1" />
              Procesar archivo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicates Dialog */}
      <Dialog open={showDuplicatesDialog} onOpenChange={(open) => !isProcessing && setShowDuplicatesDialog(open)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Duplicados detectados
            </DialogTitle>
            <DialogDescription>
              Se encontraron ubicaciones que ya existen en la base de datos (por proximidad geográfica).
              Las versiones existentes enriquecidas se mantendrán.
            </DialogDescription>
          </DialogHeader>

          {deduplicationState && (
            <div className="space-y-4 py-2">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-2xl font-bold">{deduplicationState.document.locations.length}</p>
                  <p className="text-xs text-muted-foreground">Total en archivo</p>
                </div>
                <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                  <p className="text-2xl font-bold text-green-600">{deduplicationState.uniqueLocations.length}</p>
                  <p className="text-xs text-muted-foreground">Nuevas</p>
                </div>
                <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
                  <p className="text-2xl font-bold text-amber-600">{deduplicationState.duplicates.length}</p>
                  <p className="text-xs text-muted-foreground">Duplicados</p>
                </div>
              </div>

              {/* Duplicates list */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Ubicaciones duplicadas (se omitirán):</p>
                <ScrollArea className="h-48 border rounded-lg p-2">
                  <div className="space-y-2">
                    {deduplicationState.duplicates.map((dup, idx) => (
                      <div 
                        key={idx}
                        className="p-2 bg-muted/50 rounded-lg text-sm space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium truncate flex-1">{dup.newLocation.name}</span>
                          <Badge variant="outline" className="text-xs shrink-0">
                            {formatDistance(dup.distance)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <span>→ Ya existe como:</span>
                          <span className="font-medium text-foreground">{dup.existingLocation.name}</span>
                          {dup.existingLocation.enrichedData && (
                            <Badge className="ml-1 text-[10px] bg-purple-500/10 text-purple-600 border-purple-500/20">
                              Enriquecido
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              <p className="text-xs text-muted-foreground bg-muted p-2 rounded">
                <strong>Umbrales:</strong> 250m para localidades/accidentes geográficos, 10m para establecimientos
              </p>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={handleCancelDeduplication}
              disabled={isProcessing}
            >
              <X className="w-4 h-4 mr-1" />
              Cancelar
            </Button>
            <Button 
              onClick={handleConfirmDeduplication}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <Globe2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-1" />
              )}
              Continuar ({deduplicationState?.uniqueLocations.length || 0} nuevas)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
