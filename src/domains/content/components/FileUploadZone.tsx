import React, { useCallback, useRef, useState } from 'react';
import { Upload, FileUp, Globe2, CheckCircle, Eye, Users, Lock, ExternalLink, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { parseGeoFile, SUPPORTED_FORMATS, getFormatFromFileName } from '@/lib/geo-file-parser';
import { useLocationsStore } from '@/domains/content';
import { Link } from 'react-router-dom';
import { saveDocumentToDatabase, loadAllLocationsFromDatabase } from '@/domains/content';
import { DuplicateMatch } from '@/lib/duplicate-detection';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { KMLDocument, GeoLocation, LocationVisibility } from '@/types/location';
import { UploadPreviewDialog, UploadPreviewOptions } from './UploadPreviewDialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/domains/identity';
import { documentV2Repository } from '@/repositories/document-v2.repository';

interface FileUploadZoneProps {
 onUploadComplete?: () => void;
 curatorId?: string;
 curatorName?: string;
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
  const [previewDocument, setPreviewDocument] = useState<KMLDocument | null>(null);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const rawFileRef = useRef<File | null>(null);

  const triggerAutoEnrich = useCallback(async (doc: KMLDocument, options: UploadPreviewOptions) => {
   let idsToEnrich: string[] = [];

   // Always enrich matching points
   const matchingIds = new Set(options.matchingPointIds);
   const matchingUnenriched = doc.locations
    .filter((loc) => matchingIds.has(loc.id) && !loc.enrichedData?.descripcion && loc.placeType !== 'route')
    .map((loc) => loc.id);
   idsToEnrich.push(...matchingUnenriched);

   // For new points, check action
   if (options.newPointAction === 'enrich') {
    const newUnenriched = doc.locations
     .filter((loc) => !matchingIds.has(loc.id) && !loc.enrichedData?.descripcion && loc.placeType !== 'route')
     .map((loc) => loc.id);
    idsToEnrich.push(...newUnenriched);
   }

   if (idsToEnrich.length === 0) return;

   try {
    const { error } = await supabase.functions.invoke('batch-enrich', {
     body: { action: 'start', documentId: doc.id, locationIds: idsToEnrich, curatorId: curatorId || undefined },
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

  /** Create or retrieve a personal category, then assign it to new locations */
  const assignPersonalCategory = useCallback(async (doc: KMLDocument, options: UploadPreviewOptions) => {
   if (!user || !options.personalCategoryName) return;
   try {
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

    const matchingIds = new Set(options.matchingPointIds);
    const newLocationIds = doc.locations
     .filter((loc) => !matchingIds.has(loc.id) && loc.placeType !== 'route')
     .map((loc) => loc.id);

    if (newLocationIds.length > 0) {
     const { error } = await supabase
      .from('locations')
      .update({ personal_category_id: categoryId })
      .in('id', newLocationIds);
     if (error) console.error('Error assigning category:', error);
     else toast.success(`${newLocationIds.length} puntos asignados a "${options.personalCategoryName}"`);
    }
   } catch (e) {
    console.error('Error in assignPersonalCategory:', e);
   }
  }, [user]);

  /** Find closest location within threshold */
  const findClosestLocation = (lat: number, lng: number, locations: GeoLocation[], thresholdMeters = 250): GeoLocation | null => {
   let best: GeoLocation | null = null;
   let bestDist = Infinity;
   const R = 6371000;
   for (const loc of locations) {
    const dLat = ((loc.coordinates.lat - lat) * Math.PI) / 180;
    const dLng = ((loc.coordinates.lng - lng) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat * Math.PI) / 180) * Math.cos((loc.coordinates.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (d < thresholdMeters && d < bestDist) { best = loc; bestDist = d; }
   }
   return best;
  };

  /** Save imported routes to routes + route_waypoints tables */
  const saveImportedRoutes = useCallback(async (
   routes: import('@/types/location').ImportedRoute[],
   sourceDocument?: Pick<KMLDocument, 'id' | 'name'>,
   linkingData?: {
    documentLocations: GeoLocation[];
    matchingPointIds: string[];
    catalogLocations: GeoLocation[];
   },
  ) => {
   if (!user || routes.length === 0) return;

   const itineraryName = sourceDocument?.name
    ? sourceDocument.name.replace(/\.\w+$/, '')
    : routes.length === 1 ? routes[0].name : 'Itinerario importado';

   const parentPreferences: Record<string, unknown> = {};
   if (sourceDocument?.id) {
    parentPreferences.documentId = sourceDocument.id;
    parentPreferences.documentName = sourceDocument.name;
   }

   const { data: parentRoute, error: parentError } = await supabase
    .from('routes')
    .insert({
     user_id: user.id,
     name: itineraryName,
     description: 'Itinerario importado desde archivo',
     visibility: 'private',
     status: 'completed',
     transport_mode: 'multimodal',
     road_preference: 'fastest',
     route_preferences: Object.keys(parentPreferences).length > 0 ? parentPreferences : null,
    } as any)
    .select('id')
    .single();

   if (parentError) {
    console.error('Error creating parent itinerary:', parentError);
    return;
   }

   const parentId = parentRoute.id;
   let savedCount = 0;

   const matchingSet = linkingData ? new Set(linkingData.matchingPointIds) : new Set<string>();

   for (let ri = 0; ri < routes.length; ri++) {
    const route = routes[ri];
    try {
     let totalDistanceMeters = 0;
     for (let i = 1; i < route.coordinates.length; i++) {
      const [lat1, lng1] = route.coordinates[i - 1];
      const [lat2, lng2] = route.coordinates[i];
      const R = 6371000;
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLng = ((lng2 - lng1) * Math.PI) / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
      totalDistanceMeters += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
     }

     const routeGeometry = {
      type: 'LineString',
      coordinates: route.coordinates.map(([lat, lng]) => [lng, lat]),
     };

     const createdAt = route.date ? route.date.toISOString() : new Date().toISOString();
     const routePreferences = {
      ...(route.date ? { date: route.date.toISOString() } : {}),
      ...(sourceDocument?.id ? { documentId: sourceDocument.id, documentName: sourceDocument.name } : {}),
     };

     const { data: routeData, error: routeError } = await supabase
      .from('routes')
      .insert({
       user_id: user.id,
       name: route.name,
       description: 'Importada desde archivo',
       visibility: 'private',
       status: 'completed' as any,
       transport_mode: 'driving',
       road_preference: 'fastest',
       total_distance_meters: Math.round(totalDistanceMeters),
       route_geometry: routeGeometry as any,
       route_preferences: Object.keys(routePreferences).length > 0 ? routePreferences : null,
       created_at: createdAt,
       parent_route_id: parentId,
       segment_position: ri,
      })
      .select('id')
      .single();

     if (routeError) { console.error('Error saving route:', routeError); continue; }

     const first = route.coordinates[0];
     const last = route.coordinates[route.coordinates.length - 1];
     const waypoints = [
      { route_id: routeData.id, position: 0, name: `Inicio — ${route.name}`, latitude: first[0], longitude: first[1], transport_mode: 'driving' as any },
      { route_id: routeData.id, position: 1, name: `Fin — ${route.name}`, latitude: last[0], longitude: last[1], transport_mode: 'driving' as any },
     ];
     await supabase.from('route_waypoints').insert(waypoints);
     savedCount++;
    } catch (e) { console.error('Error saving route:', e); }
   }

   // Parent waypoints from document locations
   if (savedCount > 0) {
    const resolveLocationId = (lat: number, lng: number): string | undefined => {
     if (!linkingData) return undefined;
     const catalogMatch = findClosestLocation(lat, lng, linkingData.catalogLocations);
     if (catalogMatch) return catalogMatch.id;
     const docMatch = findClosestLocation(lat, lng, linkingData.documentLocations);
     if (docMatch) return docMatch.id;
     return undefined;
    };

    const projectOntoRoute = (lat: number, lng: number): number => {
     let bestFrac = 0;
     let bestDist = Infinity;
     const R = 6371000;
     const allCoords: [number, number][] = [];
     for (const route of routes) allCoords.push(...route.coordinates);
     let cumDist = 0;
     const segDists: number[] = [0];
     for (let i = 1; i < allCoords.length; i++) {
      const [la1, lo1] = allCoords[i - 1];
      const [la2, lo2] = allCoords[i];
      const dLat = ((la2 - la1) * Math.PI) / 180;
      const dLng = ((lo2 - lo1) * Math.PI) / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos((la1 * Math.PI) / 180) * Math.cos((la2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
      cumDist += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      segDists.push(cumDist);
     }
     const totalDist = cumDist || 1;
     for (let i = 0; i < allCoords.length; i++) {
      const [vLat, vLng] = allCoords[i];
      const dLat = ((vLat - lat) * Math.PI) / 180;
      const dLng2 = ((vLng - lng) * Math.PI) / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat * Math.PI) / 180) * Math.cos((vLat * Math.PI) / 180) * Math.sin(dLng2 / 2) ** 2;
      const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      if (d < bestDist) { bestDist = d; bestFrac = segDists[i] / totalDist; }
     }
     return bestFrac;
    };

    const rawWaypoints: Array<{
     frac: number; name: string; latitude: number; longitude: number;
     location_id?: string; isEndpoint?: boolean;
    }> = [];

    const firstCoord = routes[0].coordinates[0];
    rawWaypoints.push({
     frac: 0, name: routes[0].name,
     latitude: firstCoord[0], longitude: firstCoord[1],
     location_id: resolveLocationId(firstCoord[0], firstCoord[1]),
     isEndpoint: true,
    });

    const lastRoute = routes[routes.length - 1];
    const lastCoord = lastRoute.coordinates[lastRoute.coordinates.length - 1];
    rawWaypoints.push({
     frac: 1, name: `Fin — ${lastRoute.name}`,
     latitude: lastCoord[0], longitude: lastCoord[1],
     location_id: resolveLocationId(lastCoord[0], lastCoord[1]),
     isEndpoint: true,
    });

    if (linkingData) {
     for (const loc of linkingData.documentLocations) {
      const isNearEndpoint = rawWaypoints.some(wp => {
       if (!wp.isEndpoint) return false;
       const dLat = ((wp.latitude - loc.coordinates.lat) * Math.PI) / 180;
       const dLng = ((wp.longitude - loc.coordinates.lng) * Math.PI) / 180;
       const a = Math.sin(dLat / 2) ** 2 + Math.cos((loc.coordinates.lat * Math.PI) / 180) * Math.cos((wp.latitude * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
       return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) < 250;
      });
      if (isNearEndpoint) continue;

      const frac = projectOntoRoute(loc.coordinates.lat, loc.coordinates.lng);
      const locId = resolveLocationId(loc.coordinates.lat, loc.coordinates.lng);
      rawWaypoints.push({
       frac, name: loc.name,
       latitude: loc.coordinates.lat, longitude: loc.coordinates.lng,
       location_id: locId,
      });
     }
    }

    rawWaypoints.sort((a, b) => a.frac - b.frac);
    const parentWaypoints = rawWaypoints.map((wp, idx) => ({
     route_id: parentId,
     position: idx,
     name: wp.name,
     latitude: wp.latitude,
     longitude: wp.longitude,
     transport_mode: 'driving' as any,
     ...(wp.location_id ? { location_id: wp.location_id } : {}),
    }));

    await supabase.from('route_waypoints').insert(parentWaypoints as any);

    toast.success(`Itinerario "${itineraryName}" creado con ${savedCount} tramo${savedCount !== 1 ? 's' : ''}`);
    if (typeof window !== 'undefined') {
     window.dispatchEvent(new CustomEvent('routes:changed'));
     for (const route of routes) {
      const routeGeometry = {
       type: 'LineString',
       coordinates: route.coordinates.map(([lat, lng]) => [lng, lat]),
      };
      window.dispatchEvent(new CustomEvent('map-show-route', {
       detail: {
        segments: [{ geometry: routeGeometry, distance: 0, duration: 0, transportMode: 'driving' }],
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
   const minSpinner = new Promise(r => setTimeout(r, 800));
   try {
    const content = await file.text();
    const result = parseGeoFile(content, file.name);
    await minSpinner;
    if (!result.success || !result.document) {
     toast.error(result.error || 'Error al procesar el archivo');
     setIsProcessing(false);
     return;
    }
    result.warnings?.forEach(w => toast.warning(w));
    const document = result.document;
    const formatInfo = SUPPORTED_FORMATS.find(f => f.id === result.format);
    if (formatInfo) toast.success(`Formato detectado: ${formatInfo.name} — ${document.locations.length} puntos${document.routes?.length ? ` y ${document.routes.length} rutas` : ''}`);
    document.locations = document.locations.map(loc => ({ ...loc, visibility: uploadConditions.visibility }));
    rawFileRef.current = file;
    setPreviewDocument(document);
    setShowPreviewDialog(true);
   } catch (error) {
    await minSpinner;
    console.error('Error parsing file:', error);
    toast.error('Error al procesar el archivo');
   } finally {
    setIsProcessing(false);
   }
  }, [uploadConditions.visibility, canUpload]);

  /**
   * Unified confirm handler — receives pre-computed dedup results from UploadPreviewDialog.
   * No more DuplicatesDialog or PostImportReviewPanel.
   */
  const handlePreviewConfirm = useCallback(async (locations: GeoLocation[], isSample: boolean, options: UploadPreviewOptions) => {
   if (!previewDocument) return;
   setShowPreviewDialog(false);
   setIsProcessing(true);
   try {
    // Build the document with only unique + matching locations (exclude auto-discarded)
    const uniqueIds = new Set(options.uniqueLocations.map(l => l.id));
    const matchingIds = new Set(options.matchingPointIds);
    const keepSet = new Set([...uniqueIds, ...matchingIds]);
    
    // Solo guardar puntos reales del documento; la geometría de rutas se guarda aparte en routes/route_waypoints
    const locationsToSave = locations.filter(loc => keepSet.has(loc.id));

    // Apply catalog names to matched points
    const nameMap = options.matchingPointNames || {};
    const renamedLocations = locationsToSave.map(loc =>
      nameMap[loc.id] ? { ...loc, name: nameMap[loc.id] } : loc
    );

    const documentToSave: KMLDocument = {
     ...previewDocument,
     name: isSample ? `${previewDocument.name} (muestra)` : previewDocument.name,
     locations: renamedLocations,
    };

    if (options.skippedFromPriorImportCount > 0) {
     toast.info(`${options.skippedFromPriorImportCount} existentes omitidos.`);
    }
    if (options.autoDiscardedCount > 0) {
     toast.info(`${options.autoDiscardedCount} duplicados exactos descartados.`);
    }

    // Send possible duplicates to review queue
    if (options.possibleDuplicates.length > 0) {
     addPendingDuplicates(options.possibleDuplicates);
    }

    const saved = await saveDocumentToDatabase(documentToSave, { rawFile: rawFileRef.current || undefined, matchingPointIds: options.matchingPointIds, matchingPointNames: options.matchingPointNames });
    if (saved) {
      addDocument(documentToSave);
      toast.success(`Guardado: ${locationsToSave.length} ubicaciones${isSample ? ' (muestra)' : ''}`);

      // NOTE: No auto-enrich in Step A — enrichment is decided in Step C (final incorporation)

      // Save routes
      if (options.saveRoutes && options.routesToSave.length > 0) {
       saveImportedRoutes(options.routesToSave, documentToSave, {
        documentLocations: documentToSave.locations.filter(l => l.placeType !== 'route'),
        matchingPointIds: options.matchingPointIds || [],
        catalogLocations: options.catalogLocations,
       });
      }

      // Navigate to document workspace (mesa de trabajo) — map + sidebar panel
      window.dispatchEvent(new CustomEvent('document:view-on-map', {
       detail: {
        docId: documentToSave.id,
        docName: documentToSave.name,
        routeIds: options.routesToSave?.map((r: any) => r.id) || [],
        matchingCatalogIds: options.matchingPointIds || [],
       },
      }));
      // Open the workspace view in the documents panel
      setTimeout(() => {
       window.dispatchEvent(new CustomEvent('document:open-workspace', {
        detail: { docId: documentToSave.id, docName: documentToSave.name },
       }));
      }, 300);

      onUploadComplete?.();
    }
   } catch (error) {
    console.error('Error saving document:', error);
    toast.error('Error al guardar el documento');
   } finally {
    setIsProcessing(false);
    setPreviewDocument(null);
   }
  }, [previewDocument, addDocument, addPendingDuplicates, onUploadComplete, curatorId, triggerAutoEnrich, assignPersonalCategory, saveImportedRoutes]);

 const handlePreviewCancel = useCallback(() => {
  setShowPreviewDialog(false);
  setPreviewDocument(null);
 }, []);

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
     {/* Drop zone */}
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
          <div className="relative">
           <Globe2 className="w-7 h-7 animate-spin" />
           <div className="absolute inset-0 animate-ping opacity-30"><Globe2 className="w-7 h-7" /></div>
          </div>
         ) : isDragging ? (
          <FileUp className="w-7 h-7" />
         ) : (
          <Upload className="w-7 h-7" />
         )}
        </div>

        <div className="text-center space-y-1">
         <p className="text-sm font-semibold text-foreground">
          {isProcessing ? 'Cargando y analizando archivo...' : isDragging ? 'Suelta aquí' : canUpload ? 'Arrastra tu archivo aquí' : 'Acepta las condiciones primero'}
         </p>
         {isProcessing && <p className="text-xs text-muted-foreground animate-pulse">Detectando formato y extrayendo puntos</p>}
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

     {/* Settings */}
     <div className="px-5 py-4 space-y-4">
      {/* Visibility */}
      {false ? null : (
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
