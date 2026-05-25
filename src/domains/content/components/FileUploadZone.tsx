import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ImportPrimaryCtaState } from '@/shared/components/import/import-primary-cta';
import { Upload, FileUp, Globe2, CheckCircle, Eye, Users, Lock, ExternalLink, Sparkles, FileText } from 'lucide-react';
import { motion } from 'framer-motion';
import { parseGeoFile, SUPPORTED_FORMATS, getFormatFromFileName } from '@/lib/geo-file-parser';
import { useLocationsStore } from '@/domains/content';
import { Link } from 'react-router-dom';
import { saveDocumentToDatabase } from '@/domains/content';
import { processImportedDocument } from '@/domains/content/lib/process-imported-document';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { KMLDocument, GeoLocation, LocationVisibility } from '@/types/location';
import { ImportSummaryDialog } from './ImportSummaryDialog';
import { CollectionPicker } from './CollectionPicker';
import { ImportSurfaceShell } from '@/shared/components/import/ImportSurfaceShell';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/domains/identity';
import { documentV2Repository } from '@/repositories/document-v2.repository';

interface FileUploadZoneProps {
 onUploadComplete?: () => void;
 curatorId?: string;
 curatorName?: string;
 /**
  * PR-IMPORT-UX-2 (legacy): wizard shell mode. Mantener mientras no se
  * cierre el backlog `PR-IMPORT-CLEANUP`.
  */
 wizardMode?: boolean;
 /**
  * PR-IMPORT-UX-4: oculta el header `ImportSurfaceShell` interno y deja
  * que el padre renderice la CTA primaria en `PanelFooter`. El dropzone
  * sigue siendo plenamente funcional (click/drag continúan disparando
  * la selección de archivo).
  */
 hidePrimaryCta?: boolean;
 /**
  * PR-IMPORT-UX-4: callback canónico para elevar el estado de la CTA
  * primaria al padre. Ver `mem://logic/import/import-canon` §PR-IMPORT-UX-4.
  */
 onPrimaryStateChange?: (state: ImportPrimaryCtaState) => void;
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

export function FileUploadZone({
  onUploadComplete,
  curatorId,
  curatorName,
  wizardMode = false,
  hidePrimaryCta = false,
  onPrimaryStateChange,
}: FileUploadZoneProps) {
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
  const [autoEnrich, setAutoEnrich] = useState(false);
  const [summaryDoc, setSummaryDoc] = useState<{
    id: string;
    name: string;
    fileName: string;
    pointCount: number;
    routeCount: number;
  } | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const rawFileRef = useRef<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [collectionId, setCollectionId] = useState<string>('');
  const [newCollectionName, setNewCollectionName] = useState<string>('');

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

  // ── PR-IMPORT-UX-4: emitir estado de CTA primaria al padre ──
  const openFilePicker = useCallback(() => {
    if (isProcessing || !canUpload) return;
    fileInputRef.current?.click();
  }, [isProcessing, canUpload]);

  useEffect(() => {
    if (!onPrimaryStateChange) return;
    const disabledReason = !canUpload
      ? 'Acepta los términos y la política de duplicados.'
      : isProcessing
        ? 'Procesando archivo…'
        : undefined;
    onPrimaryStateChange({
      label: isProcessing ? 'Procesando…' : 'Subir archivo',
      submit: openFilePicker,
      canSubmit: canUpload && !isProcessing,
      isProcessing,
      disabledReason,
    });
  }, [canUpload, isProcessing, openFilePicker, onPrimaryStateChange]);

 // ── File handling ──
  const handleFile = useCallback(async (file: File) => {
   if (!canUpload) {
    toast.warning('Acepta las condiciones antes de subir un archivo');
    return;
   }

   // Pre-check: ¿el mismo usuario ya tiene una importación en revisión con el mismo nombre y tamaño?
   if (user) {
    try {
     const { data: existingDocs } = await supabase
      .from('documents')
      .select('id, name, original_filename, original_file_path, import_status, created_at')
      .eq('user_id', user.id)
      .eq('original_filename', file.name)
      .eq('import_status', 'reviewing')
      .order('created_at', { ascending: false })
      .limit(1);

     if (existingDocs && existingDocs.length > 0) {
      const existing = existingDocs[0];
      const proceed = window.confirm(
       `Ya tienes una importación en revisión de "${file.name}" iniciada el ${new Date(existing.created_at).toLocaleString()}.\n\n` +
       `¿Quieres SUSTITUIRLA? (Aceptar: borra la anterior y empieza de nuevo. Cancelar: aborta esta subida.)`
      );
      if (!proceed) {
       toast.info('Subida cancelada. Reanuda la importación anterior desde "Documentos".');
       return;
      }
      // Sustituir: borrar el documento anterior y su archivo
      if (existing.original_file_path) {
       await supabase.storage.from('document-originals').remove([existing.original_file_path]);
      }
      await supabase.from('documents').delete().eq('id', existing.id);
      toast.info('Importación anterior eliminada. Procesando nueva subida...');
     }
    } catch (e) {
     console.warn('Pre-check de duplicado falló (continuando):', e);
    }
   }

    setIsProcessing(true);
    const minSpinner = new Promise(r => setTimeout(r, 800));
    try {
     // KMZ is binary (ZIP); everything else is text. Read accordingly.
     const isKmz = file.name.toLowerCase().endsWith('.kmz');
     const fileInput: string | ArrayBuffer = isKmz
      ? await file.arrayBuffer()
      : await file.text();
     const result = await parseGeoFile(fileInput, file.name);
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

     // ─── IMPORT-FIRST: guardar TODO crudo, sin dedup/geocoding/match ───
     const detectedFormat = getFormatFromFileName(document.fileName);
     const sourceType = (detectedFormat === 'kmz' ? 'kml' : detectedFormat) ?? undefined;
     const saved = await saveDocumentToDatabase(document, {
       rawFile: rawFileRef.current || undefined,
       sourceType,
      });
     if (!saved) {
       toast.error('Error al guardar el documento');
       return;
     }
     addDocument(document);
     toast.success(`Importado: ${document.locations.length} puntos${document.routes?.length ? ` y ${document.routes.length} rutas` : ''}`);

     // Diferir colección hasta aprobación: guardar intención en metadata.
     if (user && (collectionId === '__new__' || (collectionId && collectionId !== ''))) {
       try {
         const { setPendingCollection } = await import('@/services/pending-collection.service');
         await setPendingCollection(document.id, {
           collectionId: collectionId !== '__new__' ? collectionId : null,
           newCollection: collectionId === '__new__'
             ? { name: newCollectionName.trim() || document.name, visibility: uploadConditions.visibility }
             : null,
         });
       } catch (e) {
         console.warn('setPendingCollection failed:', e);
       }
     }

     // Routes (si las hay) se guardan igual que antes
     if (document.routes && document.routes.length > 0) {
       saveImportedRoutes(document.routes, document, {
         documentLocations: document.locations.filter(l => l.placeType !== 'route'),
         matchingPointIds: [],
         catalogLocations: [],
       });
     }

     // Mostrar diálogo informativo no-bloqueante
     setSummaryDoc({
       id: document.id,
       name: document.name,
       fileName: document.fileName,
       pointCount: document.locations.length,
       routeCount: document.routes?.length || 0,
     });
     setShowSummary(true);

      // Lanzar procesado en background (fire-and-forget)
      processImportedDocument(document.id, {
        autoEnrich,
        curatorId,
      }).catch(e => console.warn('Background processing failed:', e));

      // Proyectar puntos en el mapa, pero NO abrir el panel de workspace
      // automáticamente: eso desmontaría el diálogo. El usuario lo abre desde
      // el botón "Ver documento" del ImportSummaryDialog.
      window.dispatchEvent(new CustomEvent('document:view-on-map', {
        detail: { docId: document.id, docName: document.name, routeIds: [], matchingCatalogIds: [] },
      }));

    } catch (error) {
    await minSpinner;
    console.error('Error parsing file:', error);
    toast.error('Error al procesar el archivo');
   } finally {
    setIsProcessing(false);
   }
  }, [uploadConditions.visibility, canUpload, user]);



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
   <div className={cn(
    'w-full space-y-4',
    wizardMode ? 'max-w-2xl mx-auto px-[var(--panel-padding-x)] py-5' : 'max-w-lg mx-auto',
   )}>
    {!wizardMode && !hidePrimaryCta && (
     <ImportSurfaceShell
      surfaceId="file"
      icon={<FileText className="w-5 h-5" />}
      title="Importar desde fichero"
      subtitle="Formatos soportados: KML · KMZ · GPX · GeoJSON · CSV."
      notice={
       !canUpload ? (
        <span>Confirma las dos condiciones de abajo para poder subir archivos.</span>
       ) : null
      }
      source={undefined}
     />
    )}
    {wizardMode && (
     <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
       Paso 1 · Elige tu archivo
      </p>
      <p className="text-sm text-foreground/90 leading-snug">
       Arrastra el fichero o haz clic para seleccionarlo. Tras analizarlo,
       te pediremos confirmar condiciones y elegir destino.
      </p>
     </div>
    )}
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
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileInput} disabled={isProcessing || !canUpload} />

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

       {/* Collection picker (transversal) */}
       <CollectionPicker
         userId={user?.id}
         value={collectionId}
         onValueChange={setCollectionId}
         newName={newCollectionName}
         onNewNameChange={setNewCollectionName}
       />

       {/* Conditions */}
      <div className="space-y-1.5">
        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Condiciones</Label>
        <div className="grid grid-cols-1 gap-2">
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
            Confirmo que el archivo no incluye datos sensibles ni personales de terceros.
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

    <ImportSummaryDialog
     open={showSummary}
     docId={summaryDoc?.id ?? null}
     docName={summaryDoc?.name ?? null}
     pointCount={summaryDoc?.pointCount ?? 0}
     routeCount={summaryDoc?.routeCount ?? 0}
     fileName={summaryDoc?.fileName ?? null}
     onOpenChange={setShowSummary}
     onViewDocument={() => {
       setShowSummary(false);
       if (summaryDoc) {
         window.dispatchEvent(new CustomEvent('document:open-workspace', {
           detail: { docId: summaryDoc.id, docName: summaryDoc.name },
         }));
       }
     }}
    />
  </>
 );
}
