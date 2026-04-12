import React, { useCallback, useRef, useState, useEffect } from 'react';
import { Upload, FileUp, Globe2, AlertTriangle, CheckCircle, X, Eye, Users, Lock, FileText, ArrowRight, ExternalLink, ClipboardList, Sparkles, FileCheck, Route, CalendarIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { parseGeoFile, SUPPORTED_FORMATS } from '@/lib/geo-file-parser';
import { useLocationsStore } from '@/store/locations-store';
import { Link } from 'react-router-dom';
import { saveDocumentToDatabase, loadAllLocationsFromDatabase } from '@/hooks/use-database-sync';
import { deduplicateLocations, formatDistance, DuplicateMatch } from '@/lib/duplicate-detection';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
 Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { KMLDocument, GeoLocation, LocationVisibility, ImportedRoute } from '@/types/location';
import { UploadPreviewDialog, UploadPreviewOptions } from './UploadPreviewDialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/domains/identity';

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

const VISIBILITY_OPTIONS: { value: LocationVisibility; label: string; description: string; icon: React.ReactNode }[] = [
 { value: 'public', label: 'Público', description: 'Visible para todos', icon: <Eye className="w-4 h-4" /> },
 { value: 'followers', label: 'Seguidores', description: 'Solo seguidores aceptados', icon: <Users className="w-4 h-4" /> },
 { value: 'private', label: 'Privado', description: 'Solo tú', icon: <Lock className="w-4 h-4" /> },
];

export function FileUploadZone({ onUploadComplete, curatorId, curatorName }: FileUploadZoneProps) {
 const addDocument = useLocationsStore(state => state.addDocument);
 const addPendingDuplicates = useLocationsStore(state => state.addPendingDuplicates);
 const { user } = useAuth();
 const [isDragging, setIsDragging] = useState(false);
 const [isProcessing, setIsProcessing] = useState(false);
 const [uploadConditions, setUploadConditions] = useState<UploadConditions>({
  visibility: curatorId ? 'public' : 'followers',
  acceptTerms: false,
  acceptDuplicatePolicy: false,
 });
 const [deduplicationState, setDeduplicationState] = useState<DeduplicationState | null>(null);
 const [showDuplicatesDialog, setShowDuplicatesDialog] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<KMLDocument | null>(null);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const pendingOptionsRef = useRef<UploadPreviewOptions | null>(null);

  // Editable options in the duplicates dialog
  const [dedupAutoEnrich, setDedupAutoEnrich] = useState(true);
  const [dedupMarkVisited, setDedupMarkVisited] = useState(true);
  const [dedupSaveRoutes, setDedupSaveRoutes] = useState(true);
  const [dedupRouteName, setDedupRouteName] = useState('');
  const [dedupRouteDate, setDedupRouteDate] = useState<Date | undefined>(undefined);

  // Sync dedup options from pending when dialog opens
  useEffect(() => {
    if (showDuplicatesDialog && pendingOptionsRef.current) {
      const opts = pendingOptionsRef.current;
      setDedupAutoEnrich(opts.autoEnrich);
      setDedupMarkVisited(opts.markRoutePointsVisited);
      setDedupSaveRoutes(opts.saveRoutes);
      setDedupRouteName(opts.routesToSave[0]?.name || previewDocument?.name || '');
      setDedupRouteDate(opts.routesToSave[0]?.date || undefined);
    }
  }, [showDuplicatesDialog]);

  const triggerAutoEnrich = useCallback(async (doc: KMLDocument, options?: UploadPreviewOptions) => {
   // Determine which IDs to enrich based on matching logic
   let idsToEnrich: string[] = [];

   if (options) {
    // Always enrich matching points (they correlate with known locations)
    const matchingIds = new Set(options.matchingPointIds);
    const matchingUnenriched = doc.locations
     .filter((loc) => matchingIds.has(loc.id) && !loc.enrichedData?.descripcion && loc.placeType !== 'route')
     .map((loc) => loc.id);
    idsToEnrich.push(...matchingUnenriched);

    // For new (non-matching) points, check the user's action choice
    if (options.newPointAction === 'enrich') {
     const newUnenriched = doc.locations
      .filter((loc) => !matchingIds.has(loc.id) && !loc.enrichedData?.descripcion && loc.placeType !== 'route')
      .map((loc) => loc.id);
     idsToEnrich.push(...newUnenriched);
    }
   } else {
    // Legacy fallback: enrich all unenriched
    idsToEnrich = doc.locations
     .filter((loc) => !loc.enrichedData?.descripcion && loc.placeType !== 'route')
     .map((loc) => loc.id);
   }

   if (idsToEnrich.length === 0) return;

   try {
    const { error } = await supabase.functions.invoke('batch-enrich', {
     body: {
      action: 'start',
      documentId: doc.id,
      locationIds: idsToEnrich,
      curatorId: curatorId || undefined,
     },
    });
    if (error) {
     console.error('Auto-enrich error:', error);
     toast.info('Enriquecimiento automático no pudo iniciarse. Puedes hacerlo manualmente.');
    } else {
     toast.success(`Enriqueciendo ${idsToEnrich.length} puntos automáticamente...`);
    }
   } catch (e) {
    console.error('Auto-enrich error:', e);
   }
  }, [curatorId]);

  /** Create or retrieve a personal category for the user, then assign it to new locations */
  const assignPersonalCategory = useCallback(async (doc: KMLDocument, options: UploadPreviewOptions) => {
   if (!user || !options.personalCategoryName) return;
   try {
    // Upsert personal category
    const { data: existingCat } = await supabase
     .from('personal_categories')
     .select('id')
     .eq('user_id', user.id)
     .eq('name', options.personalCategoryName)
     .maybeSingle();

    let categoryId: string;
    if (existingCat) {
     categoryId = existingCat.id;
    } else {
     const { data: newCat, error } = await supabase
      .from('personal_categories')
      .insert({
       user_id: user.id,
       name: options.personalCategoryName,
      icon: options.personalCategoryIcon || 'map-pin',
       color: options.personalCategoryColor || '#6b7280',
      })
      .select('id')
      .single();
     if (error || !newCat) {
      console.error('Error creating personal category:', error);
      return;
     }
     categoryId = newCat.id;
    }

    // Assign category to non-matching locations
    const matchingIds = new Set(options.matchingPointIds);
    const newLocationIds = doc.locations
     .filter((loc) => !matchingIds.has(loc.id) && loc.placeType !== 'route')
     .map((loc) => loc.id);

    if (newLocationIds.length > 0) {
     const { error } = await supabase
      .from('locations')
      .update({ personal_category_id: categoryId })
      .in('id', newLocationIds);

     if (error) {
      console.error('Error assigning category:', error);
     } else {
      toast.success(`${newLocationIds.length} puntos asignados a "${options.personalCategoryName}"`);
     }
    }
   } catch (e) {
    console.error('Error in assignPersonalCategory:', e);
   }
  }, [user]);

  /** Save imported routes to the routes + route_waypoints tables */
  const saveImportedRoutes = useCallback(async (
   routes: ImportedRoute[],
   sourceDocument?: Pick<KMLDocument, 'id' | 'name'>,
  ) => {
   if (!user || routes.length === 0) return;

   let savedCount = 0;
   for (const route of routes) {
    try {
     // Calculate total distance approximation from coordinates
     let totalDistanceMeters = 0;
     for (let i = 1; i < route.coordinates.length; i++) {
      const [lat1, lng1] = route.coordinates[i - 1];
      const [lat2, lng2] = route.coordinates[i];
      const R = 6371000;
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLng = ((lng2 - lng1) * Math.PI) / 180;
      const a =
       Math.sin(dLat / 2) * Math.sin(dLat / 2) +
       Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
      totalDistanceMeters += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
     }

     const routeGeometry = {
      type: 'LineString',
      coordinates: route.coordinates.map(([lat, lng]) => [lng, lat]),
     };

      const createdAt = route.date ? route.date.toISOString() : new Date().toISOString();
      const routePreferences = {
       ...(route.date ? { date: route.date.toISOString() } : {}),
       ...(sourceDocument?.id
        ? {
          documentId: sourceDocument.id,
          documentName: sourceDocument.name,
         }
        : {}),
      };

     const { data: routeData, error: routeError } = await supabase
      .from('routes')
      .insert({
       user_id: user.id,
       name: route.name,
       description: `Importada desde archivo`,
       visibility: 'private',
       status: 'completed' as any,
       transport_mode: 'driving',
       road_preference: 'fastest',
       total_distance_meters: Math.round(totalDistanceMeters),
       route_geometry: routeGeometry as any,
        route_preferences: Object.keys(routePreferences).length > 0 ? routePreferences : null,
       created_at: createdAt,
      })
      .select('id')
      .single();

     if (routeError) {
      console.error('Error saving route:', routeError);
      continue;
     }

     // Save first and last points as waypoints (origin + destination)
     const first = route.coordinates[0];
     const last = route.coordinates[route.coordinates.length - 1];

     const waypoints = [
      {
       route_id: routeData.id,
       position: 0,
       name: `Inicio — ${route.name}`,
       latitude: first[0],
       longitude: first[1],
       transport_mode: 'driving' as any,
      },
      {
       route_id: routeData.id,
       position: 1,
       name: `Fin — ${route.name}`,
       latitude: last[0],
       longitude: last[1],
       transport_mode: 'driving' as any,
      },
     ];

     const { error: wpError } = await supabase
      .from('route_waypoints')
      .insert(waypoints);

     if (wpError) {
      console.error('Error saving waypoints:', wpError);
     }

     savedCount++;
    } catch (e) {
     console.error('Error saving route:', e);
    }
   }

   if (savedCount > 0) {
    toast.success(`${savedCount} ruta${savedCount !== 1 ? 's' : ''} guardada${savedCount !== 1 ? 's' : ''} en tu colección`);
    // Notify route list to refresh and show on map
    if (typeof window !== 'undefined') {
     window.dispatchEvent(new CustomEvent('routes:changed'));
     // Auto-display imported routes on the map
     for (const route of routes) {
      const routeGeometry = {
       type: 'LineString',
       coordinates: route.coordinates.map(([lat, lng]) => [lng, lat]),
      };
      window.dispatchEvent(new CustomEvent('map-show-route', {
       detail: {
        segments: [{
         geometry: routeGeometry,
         distance: 0,
         duration: 0,
         transportMode: 'driving',
        }],
       },
      }));
     }
    }
   }
  }, [user]);

 const isCuratorMode = !!curatorId;
 const canUpload = uploadConditions.acceptTerms && uploadConditions.acceptDuplicatePolicy;

 // ── File handling ──
 const handleFile = useCallback(async (file: File) => {
  if (!canUpload) {
   toast.warning('Acepta las condiciones antes de subir un archivo');
   return;
  }
  setIsProcessing(true);
  try {
   const content = await file.text();
   const result = parseGeoFile(content, file.name);
   if (!result.success || !result.document) {
    toast.error(result.error || 'Error al procesar el archivo');
    setIsProcessing(false);
    return;
   }
   result.warnings?.forEach(w => toast.warning(w));
   const document = result.document;
   const formatInfo = SUPPORTED_FORMATS.find(f => f.id === result.format);
   if (formatInfo) toast.success(`Formato detectado: ${formatInfo.name} — ${document.locations.length} puntos`);
   document.locations = document.locations.map(loc => ({ ...loc, visibility: uploadConditions.visibility }));
   setPreviewDocument(document);
   setShowPreviewDialog(true);
  } catch (error) {
   console.error('Error parsing file:', error);
   toast.error('Error al procesar el archivo');
  } finally {
   setIsProcessing(false);
  }
 }, [uploadConditions.visibility, canUpload]);

  const handlePreviewConfirm = useCallback(async (locations: GeoLocation[], isSample: boolean, options: UploadPreviewOptions) => {
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
      toast.warning(`Todos los ${skippedFromPriorImport.length} puntos ya existen.`);
      setIsProcessing(false);
      setPreviewDocument(null);
      return;
     }
     toast.info(`${skippedFromPriorImport.length} existentes omitidos. ${newCount} nuevos.`);
    }
    if (autoDiscarded.length > 0) {
     toast.info(`${autoDiscarded.length} duplicados exactos descartados`);
    }
    if (possibleDuplicates.length > 0) {
     setDeduplicationState({ document: documentToSave, uniqueLocations, possibleDuplicates, autoDiscarded });
     setShowDuplicatesDialog(true);
     setIsProcessing(false);
     // Store options for post-dedup use
     pendingOptionsRef.current = options;
     return;
    }
     const saved = await saveDocumentToDatabase(documentToSave, { curatorId });
     if (saved) {
      addDocument(documentToSave);
      toast.success(`Guardado: ${documentToSave.locations.length} ubicaciones${isSample ? ' (muestra)' : ''}`);
       // Determine new (non-matching) point IDs
       const matchingSet = new Set(options.matchingPointIds);
       const newPointIds = documentToSave.locations
        .filter(loc => !matchingSet.has(loc.id) && loc.placeType !== 'route')
        .map(loc => loc.id);

       // Trigger auto-enrich for matching points always
       if (options.matchingPointIds?.length > 0) {
        triggerAutoEnrich(documentToSave, { ...options, newPointAction: 'skip' });
       }

       // Open review panel for new points (regardless of action chosen)
       if (newPointIds.length > 0) {
        // Hide new points from map until user confirms review
        useLocationsStore.getState().setPendingReviewLocationIds(newPointIds);
        window.dispatchEvent(new CustomEvent('import:open-review', {
         detail: {
          documentId: documentToSave.id,
          newPointIds,
          matchingPointIds: options.matchingPointIds || [],
          defaultAction: options.newPointAction,
          defaultCategory: options.personalCategoryName,
          defaultCategoryIcon: options.personalCategoryIcon,
          defaultCategoryColor: options.personalCategoryColor,
         },
        }));
       } else if (options.matchingPointIds?.length > 0) {
        // Only matching points, no review needed
       }
      // Save imported routes if enabled
       if (options.saveRoutes && options.routesToSave.length > 0) {
        saveImportedRoutes(options.routesToSave, documentToSave);
      }
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

 const handleConfirmDeduplication = async (sendToReview: boolean = false) => {
   if (!deduplicationState) return;
   setIsProcessing(true);
   try {
    const { document, uniqueLocations, possibleDuplicates } = deduplicationState;
    if (sendToReview && possibleDuplicates.length > 0) {
     addPendingDuplicates(possibleDuplicates);
     toast.info(`${possibleDuplicates.length} duplicados enviados a revisión.`);
    }
    const dedupedDocument: KMLDocument = { ...document, locations: uniqueLocations };
    // Build updated routes from dialog state
    const updatedRoutes = dedupSaveRoutes && pendingOptionsRef.current?.routesToSave
     ? pendingOptionsRef.current.routesToSave.map(r => ({ ...r, name: dedupRouteName || r.name, date: dedupRouteDate || r.date }))
     : [];
     if (uniqueLocations.length > 0) {
      const saved = await saveDocumentToDatabase(dedupedDocument, { curatorId });
      if (saved) {
       addDocument(dedupedDocument);
        toast.success(`Guardadas ${uniqueLocations.length} ubicaciones nuevas.`);
         // Open review panel for new points
         const opts = pendingOptionsRef.current;
         if (opts) {
          // Auto-enrich matching points
          if (opts.matchingPointIds?.length > 0) {
           triggerAutoEnrich(dedupedDocument, { ...opts, newPointAction: 'skip' });
          }
          const matchingSet = new Set(opts.matchingPointIds);
          const newPointIds = dedupedDocument.locations
           .filter(loc => !matchingSet.has(loc.id) && loc.placeType !== 'route')
           .map(loc => loc.id);
          if (newPointIds.length > 0) {
           window.dispatchEvent(new CustomEvent('import:open-review', {
            detail: {
             documentId: dedupedDocument.id,
             newPointIds,
             matchingPointIds: opts.matchingPointIds || [],
             defaultAction: opts.newPointAction,
             defaultCategory: opts.personalCategoryName,
             defaultCategoryIcon: opts.personalCategoryIcon,
             defaultCategoryColor: opts.personalCategoryColor,
            },
           }));
          }
         }
         if (dedupSaveRoutes && updatedRoutes.length > 0) {
          saveImportedRoutes(updatedRoutes, dedupedDocument);
        }
      }
   } else {
    toast.info('Todas las ubicaciones ya existen.');
   }
   onUploadComplete?.();
  } catch (error) {
   toast.error('Error al guardar el documento');
  } finally {
   setIsProcessing(false);
   setShowDuplicatesDialog(false);
   setDeduplicationState(null);
  }
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
   <div className="w-full max-w-lg mx-auto">
    <div className="bg-card rounded-2xl border shadow-sm overflow-hidden">
     {/* ── Drop zone (top, always visible) ── */}
     <label
      className={`
       relative flex flex-col items-center justify-center w-full min-h-[180px] cursor-pointer
       transition-all duration-300 ease-out group border-b
       ${isDragging
        ? 'bg-primary/5'
        : isProcessing
         ? 'bg-muted/30 pointer-events-none opacity-60'
         : canUpload
          ? 'bg-muted/10 hover:bg-primary/5'
          : 'bg-muted/20 opacity-50 pointer-events-none'
       }
      `}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
     >
      <input type="file" className="hidden" onChange={handleFileInput} disabled={isProcessing || !canUpload} />

      <motion.div
       animate={isDragging ? { scale: 1.05, y: -3 } : { scale: 1, y: 0 }}
       transition={{ type: 'spring', stiffness: 300, damping: 20 }}
       className="flex flex-col items-center gap-2.5 py-6"
      >
       <div className={`
        p-3.5 rounded-2xl transition-all duration-300
        ${isDragging
         ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
         : 'bg-accent/60 text-accent-foreground group-hover:bg-primary/10 group-hover:text-primary'
        }
       `}>
        {isProcessing ? (
         <Globe2 className="w-7 h-7 animate-spin" />
        ) : isDragging ? (
         <FileUp className="w-7 h-7" />
        ) : (
         <Upload className="w-7 h-7" />
        )}
       </div>

       <div className="text-center space-y-1">
        <p className="text-sm font-semibold text-foreground">
         {isProcessing ? 'Analizando...' : isDragging ? 'Suelta aquí' : canUpload ? 'Arrastra tu archivo aquí' : 'Acepta las condiciones primero'}
        </p>
        {canUpload && !isProcessing && !isDragging && (
         <p className="text-xs text-muted-foreground">
          o <span className="text-primary font-medium">haz clic para seleccionar</span>
         </p>
        )}
       </div>

       <div className="flex items-center gap-1.5">
        {SUPPORTED_FORMATS.map(format => (
         <Tooltip key={format.id}>
          <TooltipTrigger asChild>
           <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground text-[10px] font-medium cursor-default">
            {format.name}
           </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
           <p>{format.description} — {format.platforms.join(', ')}</p>
          </TooltipContent>
         </Tooltip>
        ))}
        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 ml-1">
         <Sparkles className="w-2.5 h-2.5" /> Auto
        </span>
       </div>
      </motion.div>

      {isDragging && (
       <motion.div
        className="absolute inset-0 border-2 border-dashed border-primary rounded-t-2xl pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 1.5, repeat: Infinity }}
       />
      )}
     </label>

     {/* ── Settings (bottom) ── */}
     <div className="px-5 py-4 space-y-4">
      {/* Visibility */}
      {isCuratorMode ? (
       <div className="flex items-center gap-3 p-2.5 rounded-xl bg-primary/5 border border-primary/15">
        <Globe2 className="w-4 h-4 text-primary shrink-0" />
        <div>
         <p className="text-xs font-medium text-primary">Visibilidad pública (curador)</p>
        </div>
       </div>
      ) : (
       <div className="space-y-1.5">
        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Visibilidad</Label>
        <RadioGroup
         value={uploadConditions.visibility}
         onValueChange={(value) => setUploadConditions(prev => ({ ...prev, visibility: value as LocationVisibility }))}
         className="grid grid-cols-3 gap-1.5"
        >
         {VISIBILITY_OPTIONS.map(option => (
          <label
           key={option.value}
           className={`
            relative flex flex-col items-center gap-1 p-2.5 rounded-xl border cursor-pointer transition-all text-center
            ${uploadConditions.visibility === option.value
             ? 'border-primary bg-primary/5 shadow-sm shadow-primary/10'
             : 'border-border hover:border-primary/30 hover:bg-muted/30'
            }
           `}
          >
           <RadioGroupItem value={option.value} id={option.value} className="sr-only" />
           <div className={`p-1 rounded-lg transition-colors ${uploadConditions.visibility === option.value ? 'text-primary' : 'text-muted-foreground'}`}>
            {option.icon}
           </div>
           <span className="text-[11px] font-semibold leading-none">{option.label}</span>
           <span className="text-[9px] text-muted-foreground leading-tight">{option.description}</span>
           {uploadConditions.visibility === option.value && (
            <motion.div layoutId="vis-indicator" className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
             <CheckCircle className="w-2.5 h-2.5" />
            </motion.div>
           )}
          </label>
         ))}
        </RadioGroup>
       </div>
      )}

      {/* Conditions */}
      <div className="space-y-1.5">
        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Condiciones</Label>

        <div className="grid grid-cols-2 gap-2">
         <label className={`flex items-start gap-2 p-2.5 rounded-xl border cursor-pointer transition-all ${uploadConditions.acceptTerms ? 'border-primary/30 bg-primary/5' : 'border-border hover:bg-muted/30'}`}>
          <Checkbox
           checked={uploadConditions.acceptTerms}
           onCheckedChange={(checked) => setUploadConditions(prev => ({ ...prev, acceptTerms: checked === true }))}
           className="mt-0.5"
          />
          <div className="flex-1 min-w-0">
           <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium">Términos de uso</span>
            <Link to="/terms" target="_blank" className="text-[10px] text-primary hover:underline flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
             Leer <ExternalLink className="w-2.5 h-2.5" />
            </Link>
           </div>
           <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
            Confirmo que no contiene datos sensibles o personales de terceros.
           </p>
          </div>
         </label>

         <label className={`flex items-start gap-2 p-2.5 rounded-xl border cursor-pointer transition-all ${uploadConditions.acceptDuplicatePolicy ? 'border-primary/30 bg-primary/5' : 'border-border hover:bg-muted/30'}`}>
          <Checkbox
           checked={uploadConditions.acceptDuplicatePolicy}
           onCheckedChange={(checked) => setUploadConditions(prev => ({ ...prev, acceptDuplicatePolicy: checked === true }))}
           className="mt-0.5"
          />
          <div className="flex-1 min-w-0">
           <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium">Política de duplicados</span>
            <Link to="/duplicate-policy" target="_blank" className="text-[10px] text-primary hover:underline flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
             Leer <ExternalLink className="w-2.5 h-2.5" />
            </Link>
           </div>
           <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
            Los duplicados se omitirán y se conservarán las versiones enriquecidas.
           </p>
          </div>
         </label>
        </div>
       </div>
     </div>
    </div>
   </div>

   {/* Duplicates Dialog */}
   <Dialog open={showDuplicatesDialog} onOpenChange={(open) => !isProcessing && setShowDuplicatesDialog(open)}>
    <DialogContent className="sm:max-w-xl z-[2200] bg-background rounded-2xl">
     <DialogHeader>
      <DialogTitle className="flex items-center gap-2">
        <div className="p-1.5 rounded-lg bg-blue-500/10">
         <CheckCircle className="w-4 h-4 text-blue-500" />
        </div>
        Puntos ya existentes
       </DialogTitle>
       <DialogDescription>
        Ubicaciones que coinciden con puntos de tu colección por proximidad geográfica.
       </DialogDescription>
     </DialogHeader>
     {deduplicationState && (
      <div className="space-y-4 py-2">
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
         <p className="text-[10px] text-muted-foreground font-medium">Ya existentes</p>
        </div>
       </div>
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

        {/* Import options */}
        <Separator />
        <div className="space-y-3">
         <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Opciones de importación</Label>
         {(() => {
          const hasRoutes = (previewDocument?.routes?.length || 0) > 0;
          return (
           <>
            <div className={cn('grid gap-2', hasRoutes ? 'grid-cols-2' : 'grid-cols-1')}>
             <label className={cn('flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all', dedupAutoEnrich ? 'border-primary/30 bg-primary/5' : 'border-border')}>
              <Switch checked={dedupAutoEnrich} onCheckedChange={setDedupAutoEnrich} className="shrink-0" />
              <div className="min-w-0">
               <p className="text-xs font-medium truncate">Enriquecer automáticamente</p>
               <p className="text-[10px] text-muted-foreground truncate">Fichas IA para puntos nuevos</p>
              </div>
             </label>
             {hasRoutes && (
              <label className={cn('flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all', dedupMarkVisited ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border')}>
               <Switch checked={dedupMarkVisited} onCheckedChange={setDedupMarkVisited} className="shrink-0" />
               <div className="min-w-0">
                <p className="text-xs font-medium truncate">Marcar como visitados</p>
                <p className="text-[10px] text-muted-foreground truncate">Puntos en rutas</p>
               </div>
              </label>
             )}
            </div>

            {hasRoutes && (
             <div className="space-y-2">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Configuración de rutas</Label>
              <div className="grid grid-cols-2 gap-2">
               <button type="button" onClick={() => setDedupSaveRoutes(true)}
                className={cn('flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all text-left', dedupSaveRoutes ? 'border-orange-500/30 bg-orange-500/5' : 'border-border')}>
                <div className={cn('w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0', dedupSaveRoutes ? 'border-orange-500' : 'border-muted-foreground/40')}>
                 {dedupSaveRoutes && <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />}
                </div>
                <div className="min-w-0">
                 <p className="text-[11px] font-medium leading-tight">Guardar rutas</p>
                 <p className="text-[10px] text-muted-foreground leading-tight">En tu colección</p>
                </div>
               </button>
               <button type="button" onClick={() => setDedupSaveRoutes(false)}
                className={cn('flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all text-left', !dedupSaveRoutes ? 'border-orange-500/30 bg-orange-500/5' : 'border-border')}>
                <div className={cn('w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0', !dedupSaveRoutes ? 'border-orange-500' : 'border-muted-foreground/40')}>
                 {!dedupSaveRoutes && <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />}
                </div>
                <div className="min-w-0">
                 <p className="text-[11px] font-medium leading-tight">Solo puntos</p>
                 <p className="text-[10px] text-muted-foreground leading-tight">Sin rutas</p>
                </div>
               </button>
              </div>
              {dedupSaveRoutes && (
               <div className="grid grid-cols-2 gap-2 pl-2">
                <div className="space-y-1">
                 <Label className="text-[10px] text-muted-foreground">Nombre</Label>
                 <Input placeholder="Nombre..." value={dedupRouteName} onChange={(e) => setDedupRouteName(e.target.value)} className="text-xs h-8" />
                </div>
                <div className="space-y-1">
                 <Label className="text-[10px] text-muted-foreground">Fecha</Label>
                 <Popover>
                  <PopoverTrigger asChild>
                   <Button variant="outline" size="sm" className={cn('w-full justify-start text-left font-normal h-8 text-xs', !dedupRouteDate && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-1.5 h-3 w-3" />
                    {dedupRouteDate ? format(dedupRouteDate, "PPP", { locale: es }) : 'Fecha'}
                   </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 z-[2300]" align="start">
                   <Calendar mode="single" selected={dedupRouteDate} onSelect={setDedupRouteDate} disabled={(date) => date > new Date()} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                 </Popover>
                </div>
               </div>
              )}
             </div>
            )}
           </>
          );
         })()}
        </div>
       </div>
      )}
     <DialogFooter className="flex-col sm:flex-row gap-2">
      <Button variant="outline" onClick={() => { setShowDuplicatesDialog(false); setDeduplicationState(null); }} disabled={isProcessing} size="sm">
       <X className="w-3.5 h-3.5 mr-1" /> Cancelar
      </Button>
      <Button variant="secondary" onClick={() => handleConfirmDeduplication(true)} disabled={isProcessing} size="sm">
       <ClipboardList className="w-3.5 h-3.5 mr-1" /> Revisar ({deduplicationState?.possibleDuplicates.length || 0})
      </Button>
      <Button onClick={() => handleConfirmDeduplication(false)} disabled={isProcessing} size="sm">
       {isProcessing ? <Globe2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <FileCheck className="w-3.5 h-3.5 mr-1" />}
       Importar {deduplicationState?.uniqueLocations.length || 0} nuevas
      </Button>
     </DialogFooter>
    </DialogContent>
   </Dialog>

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
