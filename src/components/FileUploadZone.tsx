import React, { useCallback, useState } from 'react';
import { Upload, FileUp, Globe2, AlertTriangle, CheckCircle, X, Eye, Users, Lock, Info, MapPin, FileText, ArrowRight, ExternalLink, ClipboardList } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { parseGeoFile, SUPPORTED_FORMATS, getAcceptedExtensions } from '@/lib/geo-file-parser';
import { useLocationsStore } from '@/store/locations-store';
import { Link } from 'react-router-dom';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { KMLDocument, GeoLocation, LocationVisibility } from '@/types/location';
import { UploadPreviewDialog } from './UploadPreviewDialog';

interface FileUploadZoneProps {
 onUploadComplete?: () => void;
 curatorId?: string;
 curatorName?: string;
}

interface DeduplicationState {
 document: KMLDocument;
 uniqueLocations: GeoLocation[];
 possibleDuplicates: DuplicateMatch[];
 autoDiscarded: DuplicateMatch[];
}

interface UploadConditions {
 visibility: LocationVisibility;
 acceptTerms: boolean;
 acceptDuplicatePolicy: boolean;
}

type UploadStep = 'conditions' | 'upload' | 'preview' | 'duplicates';

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

// Formatos soportados se importan de geo-file-parser

export function FileUploadZone({ onUploadComplete, curatorId, curatorName }: FileUploadZoneProps) {
 const addDocument = useLocationsStore(state => state.addDocument);
 const [isDragging, setIsDragging] = useState(false);
 const [isProcessing, setIsProcessing] = useState(false);
 const [currentStep, setCurrentStep] = useState<UploadStep>('conditions');
  // Curator uploads are always public
 const [uploadConditions, setUploadConditions] = useState<UploadConditions>({
 visibility: curatorId ? 'public' : 'followers',
 acceptTerms: false,
 acceptDuplicatePolicy: false,
 });
 const [deduplicationState, setDeduplicationState] = useState<DeduplicationState | null>(null);
 const [showDuplicatesDialog, setShowDuplicatesDialog] = useState(false);
 
  // Preview state: parsed document before sampling decision
 const [previewDocument, setPreviewDocument] = useState<KMLDocument | null>(null);
 const [showPreviewDialog, setShowPreviewDialog] = useState(false);

 const isCuratorMode = !!curatorId;

 const canProceedToUpload = uploadConditions.acceptTerms && 
 uploadConditions.acceptDuplicatePolicy;

 const handleProceedToUpload = () => {
 if (canProceedToUpload) {
 setCurrentStep('upload');
 }
 };

 const handleBackToConditions = () => {
 setCurrentStep('conditions');
 };

  // Handle file after parsing (parse only, show preview)
 const handleFile = useCallback(async (file: File) => {
 setIsProcessing(true);
 
 try {
 const content = await file.text();
 const result = parseGeoFile(content, file.name);
 
 if (!result.success || !result.document) {
 toast.error(result.error || 'Error al procesar el archivo');
 setIsProcessing(false);
 return;
 }

      // Show warnings if any
 if (result.warnings && result.warnings.length > 0) {
 result.warnings.forEach(w => toast.warning(w));
 }

 const document = result.document;
 
      // Show format detected
 const formatInfo = SUPPORTED_FORMATS.find(f => f.id === result.format);
 if (formatInfo) {
 console.log(`Formato detectado: ${formatInfo.name}`);
 }

      // Apply visibility to all locations
 document.locations = document.locations.map(loc => ({
 ...loc,
 visibility: uploadConditions.visibility,
 }));
 
      // Show preview dialog for user to choose full/sample
 setPreviewDocument(document);
 setShowPreviewDialog(true);
 setIsProcessing(false);
 } catch (error) {
 console.error('Error parsing file:', error);
 toast.error('Error al procesar el archivo');
 setIsProcessing(false);
 }
 }, [uploadConditions.visibility]);

  // Called after preview confirmation (full or sampled locations)
 const handlePreviewConfirm = useCallback(async (locations: GeoLocation[], isSample: boolean) => {
 if (!previewDocument) return;
 
 setShowPreviewDialog(false);
 setIsProcessing(true);
 
 try {
      // Create document with selected locations
 const documentToSave: KMLDocument = {
 ...previewDocument,
        // Append sample suffix to name if sampled
 name: isSample ? `${previewDocument.name} (muestra)` : previewDocument.name,
 locations,
 };
 
       // Load all existing locations for duplicate detection
 const existingLocations = await loadAllLocationsFromDatabase();
 
       // TODO: Get user threshold from profile (default 250m)
 const userThreshold = 250;
 
       // Detect duplicates — with reimport detection + spatial index
 const { uniqueLocations, possibleDuplicates, autoDiscarded, skippedFromPriorImport } = deduplicateLocations(
  documentToSave.locations,
  existingLocations,
  userThreshold,
  documentToSave.fileName,
 );

 // Reimportación: puntos que ya existían con mismas coords+nombre
 if (skippedFromPriorImport.length > 0) {
  const newCount = uniqueLocations.length + possibleDuplicates.length;
  if (newCount === 0) {
   toast.warning(`Todos los ${skippedFromPriorImport.length} puntos de este archivo ya existen. No se importó nada nuevo.`);
   setIsProcessing(false);
   setPreviewDocument(null);
   return;
  }
  toast.info(`${skippedFromPriorImport.length} puntos ya existentes omitidos. ${newCount} nuevos detectados.`);
 }
 
       // Log auto-discarded for transparency
 if (autoDiscarded.length > 0) {
  console.log(`${autoDiscarded.length} duplicados exactos descartados automáticamente`);
  toast.info(`${autoDiscarded.length} duplicados exactos descartados (mismas coordenadas y nombre similar)`);
 }
 
       // If possible duplicates found, show dialog for user evaluation
 if (possibleDuplicates.length > 0) {
  setDeduplicationState({
   document: documentToSave,
   uniqueLocations,
   possibleDuplicates,
   autoDiscarded,
  });
  setShowDuplicatesDialog(true);
  setIsProcessing(false);
  return;
 }
 
      // No duplicates, save normally
 const saved = await saveDocumentToDatabase(documentToSave, { curatorId });
 
 if (saved) {
 addDocument(documentToSave);
 const sampleNote = isSample ? ' (muestra)' : '';
 const msg = curatorId 
 ? `Guardado para curador "${curatorName}": ${documentToSave.locations.length} ubicaciones${sampleNote}`
 : `Guardado: ${documentToSave.locations.length} ubicaciones en base de datos${sampleNote}`;
 toast.success(msg);
 onUploadComplete?.();
 }
 } catch (error) {
 console.error('Error saving document:', error);
 toast.error('Error al guardar el documento');
 } finally {
 setIsProcessing(false);
 setPreviewDocument(null);
 }
 }, [previewDocument, addDocument, onUploadComplete, curatorId, curatorName]);

 const handlePreviewCancel = useCallback(() => {
 setShowPreviewDialog(false);
 setPreviewDocument(null);
 }, []);

 const addPendingDuplicates = useLocationsStore(state => state.addPendingDuplicates);

 const handleConfirmDeduplication = async (sendToReview: boolean = false) => {
 if (!deduplicationState) return;
 
 setIsProcessing(true);
 
 try {
 const { document, uniqueLocations, possibleDuplicates } = deduplicationState;
 
      // If user wants manual review, save duplicates to pending queue
 if (sendToReview && possibleDuplicates.length > 0) {
 addPendingDuplicates(possibleDuplicates);
 toast.info(
 `${possibleDuplicates.length} posibles duplicados enviados a revisión manual. ` +
 `Accede desde el menú "Gestionar duplicados".`
 );
 }
 
      // Create document with only unique locations
 const dedupedDocument: KMLDocument = {
 ...document,
 locations: uniqueLocations,
 };
 
      // Save to database
 if (uniqueLocations.length > 0) {
 const saved = await saveDocumentToDatabase(dedupedDocument, { curatorId });
 
 if (saved) {
 addDocument(dedupedDocument);
 const dupMsg = sendToReview 
 ? `${possibleDuplicates.length} posibles duplicados pendientes de revisión.`
 : `${possibleDuplicates.length} posibles duplicados omitidos.`;
 const targetMsg = curatorId ? ` para curador "${curatorName}"` : '';
 toast.success(
 `Guardadas${targetMsg} ${uniqueLocations.length} ubicaciones nuevas. ${dupMsg}`
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
 if (file) handleFile(file);
 }, [handleFile]);

 const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
 const file = e.target.files?.[0];
 if (file) handleFile(file);
 }, [handleFile]);

 return (
 <>
 <AnimatePresence mode="wait">
 {currentStep === 'conditions' && (
 <motion.div
 key="conditions"
 initial={{ opacity: 0, x: -20 }}
 animate={{ opacity: 1, x: 0 }}
 exit={{ opacity: 0, x: -20 }}
 transition={{ duration: 0.3 }}
 className="w-full max-w-2xl mx-auto"
 >
 <div className="bg-card rounded-xl border p-6 space-y-6">
 {/* Header */}
 <div className="flex items-center gap-3">
 <div className="p-2 bg-primary/10 rounded-lg">
 <Info className="w-5 h-5 text-primary" />
 </div>
 <div>
 <h2 className="text-lg font-bold">Condiciones de subida</h2>
 <p className="text-sm text-muted-foreground">Configura la visibilidad y acepta los términos</p>
 </div>
 </div>

 {/* Supported formats info */}
 <div className="p-3 bg-muted/50 rounded-lg">
 <p className="text-sm font-medium mb-2">Formatos compatibles:</p>
 <div className="flex flex-wrap gap-2">
 {SUPPORTED_FORMATS.map(format => (
 <Tooltip key={format.id}>
 <TooltipTrigger asChild>
 <Badge variant="secondary" className="text-xs cursor-help">
 <FileText className="w-3 h-3 mr-1" />
 {format.name} ({format.extensions[0]})
 </Badge>
 </TooltipTrigger>
 <TooltipContent>
 <p className="font-medium">{format.description}</p>
 <p className="text-xs text-muted-foreground">{format.platforms.join(', ')}</p>
 </TooltipContent>
 </Tooltip>
 ))}
 </div>
 <p className="text-xs text-muted-foreground mt-2">
 <MapPin className="w-3 h-3 inline mr-1" />
 Todos los puntos deben contener coordenadas GPS válidas
 </p>
 </div>

 {/* Visibility selection - hidden for curators (always public) */}
 {isCuratorMode ? (
 <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
 <div className="flex items-center gap-2 mb-2">
 <Globe2 className="w-4 h-4 text-primary" />
 <span className="font-medium text-primary">Visibilidad pública</span>
 </div>
 <p className="text-xs text-muted-foreground">
 Los puntos del curador son siempre públicos y se comparten una vez enriquecidos.
 </p>
 </div>
 ) : (
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
 )}

 {/* Terms acceptance */}
 <div className="space-y-3 border-t pt-4">
 <Label className="text-sm font-medium">Condiciones obligatorias</Label>
 
 <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer">
 <Checkbox
 checked={uploadConditions.acceptTerms}
 onCheckedChange={(checked) => setUploadConditions(prev => ({ ...prev, acceptTerms: checked === true }))}
 className="mt-0.5"
 />
 <div className="text-sm flex-1">
 <div className="flex items-center justify-between">
 <span className="font-medium">Acepto los términos de uso</span>
 <Link 
 to="/terms" 
 target="_blank"
 className="text-xs text-primary hover:underline flex items-center gap-1"
 onClick={(e) => e.stopPropagation()}
 >
 Leer términos
 <ExternalLink className="w-3 h-3" />
 </Link>
 </div>
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
 <div className="text-sm flex-1">
 <div className="flex items-center justify-between">
 <span className="font-medium">Acepto la política de duplicados</span>
 <Link 
 to="/duplicate-policy" 
 target="_blank"
 className="text-xs text-primary hover:underline flex items-center gap-1"
 onClick={(e) => e.stopPropagation()}
 >
 Leer política
 <ExternalLink className="w-3 h-3" />
 </Link>
 </div>
 <p className="text-xs text-muted-foreground mt-1">
 Entiendo que las ubicaciones duplicadas serán omitidas y se mantendrán las versiones existentes enriquecidas.
 </p>
 </div>
 </label>
 </div>

 {/* Action button */}
 <div className="pt-2">
 <Button 
 onClick={handleProceedToUpload}
 disabled={!canProceedToUpload}
 className="w-full"
 size="lg"
 >
 Continuar a selección de archivo
 <ArrowRight className="w-4 h-4 ml-2" />
 </Button>
 </div>
 </div>
 </motion.div>
 )}

 {currentStep === 'upload' && (
 <motion.div
 key="upload"
 initial={{ opacity: 0, x: 20 }}
 animate={{ opacity: 1, x: 0 }}
 exit={{ opacity: 0, x: 20 }}
 transition={{ duration: 0.3 }}
 className="w-full max-w-2xl mx-auto space-y-4"
 >
 {/* Back button and visibility badge */}
 <div className="flex items-center justify-between">
 <Button variant="ghost" size="sm" onClick={handleBackToConditions}>
 <X className="w-4 h-4 mr-1" />
 Volver a condiciones
 </Button>
 <Badge variant="outline" className="gap-1">
 {uploadConditions.visibility === 'public' && <Eye className="w-3 h-3" />}
 {uploadConditions.visibility === 'followers' && <Users className="w-3 h-3" />}
 {uploadConditions.visibility === 'private' && <Lock className="w-3 h-3" />}
 Visibilidad: {VISIBILITY_OPTIONS.find(o => o.value === uploadConditions.visibility)?.label}
 </Badge>
 </div>

 {/* Upload zone */}
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
 accept={getAcceptedExtensions()}
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
 ? 'Analizando archivo...' 
 : isDragging 
 ? 'Suelta el archivo aquí' 
 : 'Arrastra tu archivo aquí'
 }
 </p>
 <p className="text-sm text-muted-foreground">
 o haz clic para seleccionar
 </p>
 <div className="flex justify-center gap-2 pt-2 flex-wrap">
 {SUPPORTED_FORMATS.map(format => (
 <Badge key={format.id} variant="secondary" className="text-xs">
 {format.extensions[0]}
 </Badge>
 ))}
 </div>
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
 )}
 </AnimatePresence>

 {/* Duplicates Dialog */}
 <Dialog open={showDuplicatesDialog} onOpenChange={(open) => !isProcessing && setShowDuplicatesDialog(open)}>
 <DialogContent className="sm:max-w-xl z-[2200] bg-background">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <AlertTriangle className="w-5 h-5 text-amber-500" />
 Duplicados detectados
 </DialogTitle>
 <DialogDescription>
 Se encontraron ubicaciones que ya existen en la base de datos (por proximidad geográfica).
 Puedes omitirlas o enviarlas a revisión manual para decidir caso por caso.
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
 <p className="text-2xl font-bold text-amber-600">{deduplicationState.possibleDuplicates.length}</p>
 <p className="text-xs text-muted-foreground">Duplicados</p>
 </div>
 </div>

 {/* Duplicates list */}
 <div className="space-y-2">
 <p className="text-sm font-medium">Ubicaciones duplicadas detectadas:</p>
 <ScrollArea className="h-48 border rounded-lg p-2">
 <div className="space-y-2">
 {deduplicationState.possibleDuplicates.map((dup, idx) => (
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
 <span> Ya existe como:</span>
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
 <strong>Umbral:</strong> 5 metros - Solo se consideran duplicados los puntos a menos de 5m de distancia
 </p>
 </div>
 )}

 <DialogFooter className="flex-col sm:flex-row gap-2">
 <Button 
 variant="outline" 
 onClick={handleCancelDeduplication}
 disabled={isProcessing}
 >
 <X className="w-4 h-4 mr-1" />
 Cancelar
 </Button>
 <Button 
 variant="secondary"
 onClick={() => handleConfirmDeduplication(true)}
 disabled={isProcessing}
 >
 <ClipboardList className="w-4 h-4 mr-1" />
 Revisar manualmente ({deduplicationState?.possibleDuplicates.length || 0})
 </Button>
 <Button 
 onClick={() => handleConfirmDeduplication(false)}
 disabled={isProcessing}
 >
 {isProcessing ? (
 <Globe2 className="w-4 h-4 mr-1 animate-spin" />
 ) : (
 <CheckCircle className="w-4 h-4 mr-1" />
 )}
 Omitir duplicados ({deduplicationState?.uniqueLocations.length || 0} nuevas)
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* Preview Dialog - for sampling before import */}
 {previewDocument && (
 <UploadPreviewDialog
 open={showPreviewDialog}
 document={previewDocument}
 onConfirm={handlePreviewConfirm}
 onCancel={handlePreviewCancel}
 />
 )}
 </>
 );
}
