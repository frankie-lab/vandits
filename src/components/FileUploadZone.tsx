import React, { useCallback, useState } from 'react';
import { Upload, FileUp, Globe2, AlertTriangle, CheckCircle, X, Eye, Users, Lock, MapPin, FileText, ArrowRight, ArrowLeft, ExternalLink, ClipboardList, Shield, FileCheck, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { parseGeoFile, SUPPORTED_FORMATS } from '@/lib/geo-file-parser';
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

const StepIndicator = ({ currentStep }: { currentStep: UploadStep }) => {
 const steps = [
  { id: 'conditions', label: 'Configurar', icon: Shield },
  { id: 'upload', label: 'Subir archivo', icon: Upload },
 ];
 const currentIndex = steps.findIndex(s => s.id === currentStep);

 return (
  <div className="flex items-center justify-center gap-2 mb-6">
   {steps.map((step, i) => {
    const isActive = step.id === currentStep;
    const isDone = i < currentIndex;
    const Icon = step.icon;
    return (
     <React.Fragment key={step.id}>
      {i > 0 && (
       <div className={`h-px w-8 transition-colors ${isDone ? 'bg-primary' : 'bg-border'}`} />
      )}
      <div className="flex items-center gap-1.5">
       <div className={`
        w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all
        ${isActive ? 'bg-primary text-primary-foreground shadow-md shadow-primary/25' : ''}
        ${isDone ? 'bg-primary/15 text-primary' : ''}
        ${!isActive && !isDone ? 'bg-muted text-muted-foreground' : ''}
       `}>
        {isDone ? <CheckCircle className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
       </div>
       <span className={`text-xs font-medium hidden sm:inline ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
        {step.label}
       </span>
      </div>
     </React.Fragment>
    );
   })}
  </div>
 );
};

export function FileUploadZone({ onUploadComplete, curatorId, curatorName }: FileUploadZoneProps) {
 const addDocument = useLocationsStore(state => state.addDocument);
 const [isDragging, setIsDragging] = useState(false);
 const [isProcessing, setIsProcessing] = useState(false);
 const [currentStep, setCurrentStep] = useState<UploadStep>('conditions');
 const [uploadConditions, setUploadConditions] = useState<UploadConditions>({
 visibility: curatorId ? 'public' : 'followers',
 acceptTerms: false,
 acceptDuplicatePolicy: false,
 });
 const [deduplicationState, setDeduplicationState] = useState<DeduplicationState | null>(null);
 const [showDuplicatesDialog, setShowDuplicatesDialog] = useState(false);
 const [previewDocument, setPreviewDocument] = useState<KMLDocument | null>(null);
 const [showPreviewDialog, setShowPreviewDialog] = useState(false);

 const isCuratorMode = !!curatorId;
 const canProceedToUpload = uploadConditions.acceptTerms && uploadConditions.acceptDuplicatePolicy;

 const handleProceedToUpload = () => {
 if (canProceedToUpload) setCurrentStep('upload');
 };

 const handleBackToConditions = () => setCurrentStep('conditions');

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
  if (result.warnings?.length) {
  result.warnings.forEach(w => toast.warning(w));
  }
  const document = result.document;
  const formatInfo = SUPPORTED_FORMATS.find(f => f.id === result.format);
  if (formatInfo) console.log(`Formato detectado: ${formatInfo.name}`);
  document.locations = document.locations.map(loc => ({
  ...loc,
  visibility: uploadConditions.visibility,
  }));
  setPreviewDocument(document);
  setShowPreviewDialog(true);
  setIsProcessing(false);
 } catch (error) {
  console.error('Error parsing file:', error);
  toast.error('Error al procesar el archivo');
  setIsProcessing(false);
 }
 }, [uploadConditions.visibility]);

 const handlePreviewConfirm = useCallback(async (locations: GeoLocation[], isSample: boolean) => {
 if (!previewDocument) return;
 setShowPreviewDialog(false);
 setIsProcessing(true);
 try {
  const documentToSave: KMLDocument = {
  ...previewDocument,
  name: isSample ? `${previewDocument.name} (muestra)` : previewDocument.name,
  locations,
  };
  const existingLocations = await loadAllLocationsFromDatabase();
  const userThreshold = 250;
  const { uniqueLocations, possibleDuplicates, autoDiscarded, skippedFromPriorImport } = deduplicateLocations(
  documentToSave.locations, existingLocations, userThreshold, documentToSave.fileName,
  );
  if (skippedFromPriorImport.length > 0) {
  const newCount = uniqueLocations.length + possibleDuplicates.length;
  if (newCount === 0) {
   toast.warning(`Todos los ${skippedFromPriorImport.length} puntos de este archivo ya existen.`);
   setIsProcessing(false);
   setPreviewDocument(null);
   return;
  }
  toast.info(`${skippedFromPriorImport.length} puntos ya existentes omitidos. ${newCount} nuevos detectados.`);
  }
  if (autoDiscarded.length > 0) {
  toast.info(`${autoDiscarded.length} duplicados exactos descartados automáticamente`);
  }
  if (possibleDuplicates.length > 0) {
  setDeduplicationState({ document: documentToSave, uniqueLocations, possibleDuplicates, autoDiscarded });
  setShowDuplicatesDialog(true);
  setIsProcessing(false);
  return;
  }
  const saved = await saveDocumentToDatabase(documentToSave, { curatorId });
  if (saved) {
  addDocument(documentToSave);
  const sampleNote = isSample ? ' (muestra)' : '';
  const msg = curatorId
   ? `Guardado para curador "${curatorName}": ${documentToSave.locations.length} ubicaciones${sampleNote}`
   : `Guardado: ${documentToSave.locations.length} ubicaciones${sampleNote}`;
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
  if (sendToReview && possibleDuplicates.length > 0) {
  addPendingDuplicates(possibleDuplicates);
  toast.info(`${possibleDuplicates.length} posibles duplicados enviados a revisión manual.`);
  }
  const dedupedDocument: KMLDocument = { ...document, locations: uniqueLocations };
  if (uniqueLocations.length > 0) {
  const saved = await saveDocumentToDatabase(dedupedDocument, { curatorId });
  if (saved) {
   addDocument(dedupedDocument);
   const dupMsg = sendToReview
   ? `${possibleDuplicates.length} pendientes de revisión.`
   : `${possibleDuplicates.length} duplicados omitidos.`;
   toast.success(`Guardadas ${uniqueLocations.length} ubicaciones nuevas. ${dupMsg}`);
  }
  } else {
  toast.info('Todas las ubicaciones ya existen. No se añadieron nuevas.');
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
   initial={{ opacity: 0, y: 12 }}
   animate={{ opacity: 1, y: 0 }}
   exit={{ opacity: 0, y: -12 }}
   transition={{ duration: 0.25, ease: 'easeOut' }}
   className="w-full max-w-lg mx-auto"
   >
   <div className="bg-card rounded-2xl border shadow-sm overflow-hidden">
    {/* Header with gradient accent */}
    <div className="relative px-6 pt-6 pb-4">
     <StepIndicator currentStep={currentStep} />
     <div className="text-center">
      <h2 className="text-lg font-semibold tracking-tight">Importar ubicaciones</h2>
      <p className="text-sm text-muted-foreground mt-1">Configura la visibilidad y acepta las condiciones</p>
     </div>
    </div>

    <div className="px-6 pb-6 space-y-5">
     {/* Supported formats — compact pills */}
     <div className="flex items-center gap-2 flex-wrap justify-center">
      {SUPPORTED_FORMATS.map(format => (
       <Tooltip key={format.id}>
        <TooltipTrigger asChild>
         <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent/60 text-accent-foreground text-xs font-medium cursor-default">
          <FileText className="w-3 h-3 opacity-60" />
          {format.name}
         </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
         <p className="font-medium">{format.description}</p>
         <p className="text-muted-foreground">{format.platforms.join(', ')}</p>
        </TooltipContent>
       </Tooltip>
      ))}
      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
       <Sparkles className="w-3 h-3" /> Auto-detección
      </span>
     </div>

     {/* Visibility selection */}
     {isCuratorMode ? (
      <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/15">
       <Globe2 className="w-5 h-5 text-primary shrink-0" />
       <div>
        <p className="text-sm font-medium text-primary">Visibilidad pública</p>
        <p className="text-xs text-muted-foreground">Los puntos del curador son siempre públicos</p>
       </div>
      </div>
     ) : (
      <div className="space-y-2">
       <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Visibilidad</Label>
       <RadioGroup
        value={uploadConditions.visibility}
        onValueChange={(value) => setUploadConditions(prev => ({ ...prev, visibility: value as LocationVisibility }))}
        className="grid grid-cols-3 gap-2"
       >
        {VISIBILITY_OPTIONS.map(option => (
         <label
          key={option.value}
          className={`
           relative flex flex-col items-center gap-1.5 p-3 rounded-xl border cursor-pointer transition-all text-center
           ${uploadConditions.visibility === option.value
            ? 'border-primary bg-primary/5 shadow-sm shadow-primary/10'
            : 'border-border hover:border-primary/30 hover:bg-muted/30'
           }
          `}
         >
          <RadioGroupItem value={option.value} id={option.value} className="sr-only" />
          <div className={`p-1.5 rounded-lg transition-colors ${uploadConditions.visibility === option.value ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}>
           {option.icon}
          </div>
          <span className="text-xs font-semibold">{option.label}</span>
          <span className="text-[10px] text-muted-foreground leading-tight">{option.description}</span>
          {uploadConditions.visibility === option.value && (
           <motion.div layoutId="vis-check" className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
            <CheckCircle className="w-3 h-3" />
           </motion.div>
          )}
         </label>
        ))}
       </RadioGroup>
      </div>
     )}

     {/* Terms — compact cards */}
     <div className="space-y-2">
      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Condiciones</Label>

      <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${uploadConditions.acceptTerms ? 'border-primary/30 bg-primary/5' : 'border-border hover:bg-muted/30'}`}>
       <Checkbox
        checked={uploadConditions.acceptTerms}
        onCheckedChange={(checked) => setUploadConditions(prev => ({ ...prev, acceptTerms: checked === true }))}
        className="mt-0.5"
       />
       <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
         <span className="text-sm font-medium">Términos de uso</span>
         <Link to="/terms" target="_blank" className="text-[10px] text-primary hover:underline flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          Leer <ExternalLink className="w-2.5 h-2.5" />
         </Link>
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
         Confirmo que tengo derecho a compartir esta información y que no contiene datos sensibles o personales de terceros.
        </p>
       </div>
      </label>

      <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${uploadConditions.acceptDuplicatePolicy ? 'border-primary/30 bg-primary/5' : 'border-border hover:bg-muted/30'}`}>
       <Checkbox
        checked={uploadConditions.acceptDuplicatePolicy}
        onCheckedChange={(checked) => setUploadConditions(prev => ({ ...prev, acceptDuplicatePolicy: checked === true }))}
        className="mt-0.5"
       />
       <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
         <span className="text-sm font-medium">Política de duplicados</span>
         <Link to="/duplicate-policy" target="_blank" className="text-[10px] text-primary hover:underline flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          Leer <ExternalLink className="w-2.5 h-2.5" />
         </Link>
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
         Los duplicados serán omitidos y se conservarán las versiones enriquecidas existentes.
        </p>
       </div>
      </label>
     </div>

     {/* CTA */}
     <Button
      onClick={handleProceedToUpload}
      disabled={!canProceedToUpload}
      className="w-full h-11 rounded-xl font-semibold text-sm gap-2"
      size="lg"
     >
      Continuar
      <ArrowRight className="w-4 h-4" />
     </Button>
    </div>
   </div>
   </motion.div>
  )}

  {currentStep === 'upload' && (
   <motion.div
   key="upload"
   initial={{ opacity: 0, y: 12 }}
   animate={{ opacity: 1, y: 0 }}
   exit={{ opacity: 0, y: -12 }}
   transition={{ duration: 0.25, ease: 'easeOut' }}
   className="w-full max-w-lg mx-auto"
   >
   <div className="bg-card rounded-2xl border shadow-sm overflow-hidden">
    <div className="px-6 pt-6 pb-2">
     <StepIndicator currentStep={currentStep} />
     <div className="flex items-center justify-between mb-4">
      <Button variant="ghost" size="sm" onClick={handleBackToConditions} className="gap-1 text-xs -ml-2">
       <ArrowLeft className="w-3.5 h-3.5" />
       Configuración
      </Button>
      <Badge variant="outline" className="gap-1 text-xs rounded-full px-2.5">
       {uploadConditions.visibility === 'public' && <Eye className="w-3 h-3" />}
       {uploadConditions.visibility === 'followers' && <Users className="w-3 h-3" />}
       {uploadConditions.visibility === 'private' && <Lock className="w-3 h-3" />}
       {VISIBILITY_OPTIONS.find(o => o.value === uploadConditions.visibility)?.label}
      </Badge>
     </div>
    </div>

    {/* Drop zone */}
    <div className="px-6 pb-6">
     <label
      className={`
       relative flex flex-col items-center justify-center w-full min-h-[240px]
       border-2 border-dashed rounded-2xl cursor-pointer
       transition-all duration-300 ease-out group
       ${isDragging
        ? 'border-primary bg-primary/5 scale-[1.01]'
        : 'border-border bg-muted/20 hover:border-primary/40 hover:bg-primary/5'
       }
       ${isProcessing ? 'pointer-events-none opacity-60' : ''}
      `}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
     >
      <input type="file" className="hidden" onChange={handleFileInput} disabled={isProcessing} />

      <motion.div
       animate={isDragging ? { scale: 1.05, y: -4 } : { scale: 1, y: 0 }}
       transition={{ type: 'spring', stiffness: 300, damping: 20 }}
       className="flex flex-col items-center gap-3 py-4"
      >
       <div className={`
        p-4 rounded-2xl transition-all duration-300
        ${isDragging
         ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
         : 'bg-accent/60 text-accent-foreground group-hover:bg-primary/10 group-hover:text-primary'
        }
       `}>
        {isProcessing ? (
         <Globe2 className="w-8 h-8 animate-spin" />
        ) : isDragging ? (
         <FileUp className="w-8 h-8" />
        ) : (
         <Upload className="w-8 h-8" />
        )}
       </div>

       <div className="text-center space-y-1.5">
        <p className="text-base font-semibold text-foreground">
         {isProcessing ? 'Analizando archivo...' : isDragging ? 'Suelta aquí' : 'Arrastra tu archivo'}
        </p>
        <p className="text-xs text-muted-foreground">
         o <span className="text-primary font-medium">haz clic para seleccionar</span>
        </p>
       </div>

       <div className="flex items-center gap-1.5 mt-1">
        {SUPPORTED_FORMATS.map(format => (
         <span key={format.id} className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground text-[10px] font-medium">
          {format.extensions[0]}
         </span>
        ))}
       </div>

       <p className="text-[10px] text-muted-foreground flex items-center gap-1">
        <Sparkles className="w-3 h-3" />
        El formato se detecta automáticamente por contenido
       </p>
      </motion.div>

      {/* Animated border on drag */}
      {isDragging && (
       <motion.div
        className="absolute inset-0 rounded-2xl border-2 border-primary pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 1.5, repeat: Infinity }}
       />
      )}
     </label>
    </div>
   </div>
   </motion.div>
  )}
  </AnimatePresence>

  {/* Duplicates Dialog */}
  <Dialog open={showDuplicatesDialog} onOpenChange={(open) => !isProcessing && setShowDuplicatesDialog(open)}>
  <DialogContent className="sm:max-w-xl z-[2200] bg-background rounded-2xl">
   <DialogHeader>
   <DialogTitle className="flex items-center gap-2">
    <div className="p-1.5 rounded-lg bg-amber-500/10">
     <AlertTriangle className="w-4 h-4 text-amber-500" />
    </div>
    Duplicados detectados
   </DialogTitle>
   <DialogDescription>
    Ubicaciones que ya existen en la base de datos por proximidad geográfica.
   </DialogDescription>
   </DialogHeader>

   {deduplicationState && (
   <div className="space-y-4 py-2">
    {/* Stats — mini cards */}
    <div className="grid grid-cols-3 gap-2">
     <div className="p-2.5 bg-muted/60 rounded-xl text-center">
      <p className="text-xl font-bold tabular-nums">{deduplicationState.document.locations.length}</p>
      <p className="text-[10px] text-muted-foreground font-medium">En archivo</p>
     </div>
     <div className="p-2.5 rounded-xl text-center bg-emerald-500/10 border border-emerald-500/15">
      <p className="text-xl font-bold tabular-nums text-emerald-600">{deduplicationState.uniqueLocations.length}</p>
      <p className="text-[10px] text-muted-foreground font-medium">Nuevas</p>
     </div>
     <div className="p-2.5 rounded-xl text-center bg-amber-500/10 border border-amber-500/15">
      <p className="text-xl font-bold tabular-nums text-amber-600">{deduplicationState.possibleDuplicates.length}</p>
      <p className="text-[10px] text-muted-foreground font-medium">Duplicados</p>
     </div>
    </div>

    {/* Duplicates list */}
    <ScrollArea className="h-44 border rounded-xl">
     <div className="p-2 space-y-1.5">
     {deduplicationState.possibleDuplicates.map((dup, idx) => (
      <div key={idx} className="p-2.5 bg-muted/40 rounded-lg text-sm">
       <div className="flex items-center justify-between gap-2">
        <span className="font-medium truncate flex-1">{dup.newLocation.name}</span>
        <Badge variant="outline" className="text-[10px] shrink-0 rounded-full px-2">
         {formatDistance(dup.distance)}
        </Badge>
       </div>
       <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-1">
        <span>≈</span>
        <span className="font-medium text-foreground truncate">{dup.existingLocation.name}</span>
        {dup.existingLocation.enrichedData && (
         <Badge className="ml-auto text-[9px] bg-purple-500/10 text-purple-600 border-purple-500/20 rounded-full px-1.5">
          Enriquecido
         </Badge>
        )}
       </div>
      </div>
     ))}
     </div>
    </ScrollArea>
   </div>
   )}

   <DialogFooter className="flex-col sm:flex-row gap-2">
   <Button variant="outline" onClick={handleCancelDeduplication} disabled={isProcessing} size="sm">
    <X className="w-3.5 h-3.5 mr-1" />
    Cancelar
   </Button>
   <Button variant="secondary" onClick={() => handleConfirmDeduplication(true)} disabled={isProcessing} size="sm">
    <ClipboardList className="w-3.5 h-3.5 mr-1" />
    Revisar ({deduplicationState?.possibleDuplicates.length || 0})
   </Button>
   <Button onClick={() => handleConfirmDeduplication(false)} disabled={isProcessing} size="sm">
    {isProcessing ? (
     <Globe2 className="w-3.5 h-3.5 mr-1 animate-spin" />
    ) : (
     <FileCheck className="w-3.5 h-3.5 mr-1" />
    )}
    Importar {deduplicationState?.uniqueLocations.length || 0} nuevas
   </Button>
   </DialogFooter>
  </DialogContent>
  </Dialog>

  {/* Preview Dialog */}
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
