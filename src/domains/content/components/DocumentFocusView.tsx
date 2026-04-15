import React, { useState, useEffect, useCallback, useMemo, Suspense, lazy } from 'react';
import {
  ChevronLeft, MapPin, Check, CheckCheck, X, Sparkles, GripVertical,
  Pencil, Save, Loader2, Eye, EyeOff, Route as RouteIcon, Car,
  Download, FileArchive, Plus, Users, Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

const RouteBuilder = lazy(() => import('@/components/RouteBuilder').then(m => ({ default: m.RouteBuilder })));
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { useLocationsStore } from '@/store/locations-store';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { PointContextActions, NearbyPanel } from './PointContextActions';
import { calculateDistance } from '@/lib/duplicate-detection';

/** Normalize a name for fuzzy comparison */
function normalizeName(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '').trim();
}

/** Match a candidate against catalog entries using distance + name similarity.
 *  If names match closely, the distance threshold is extended to 1000m. */
function findCatalogMatch(
  candidate: { name: string; latitude: number; longitude: number },
  catalog: { id: string; name: string; latitude: number; longitude: number }[],
  baseThreshold = 250,
): typeof catalog[number] | undefined {
  const candNorm = normalizeName(candidate.name);
  for (const ex of catalog) {
    const dist = calculateDistance(candidate.latitude, candidate.longitude, ex.latitude, ex.longitude);
    if (dist < baseThreshold) return ex;
    // Extended threshold when names are very similar
    if (dist < 1000) {
      const exNorm = normalizeName(ex.name);
      if (candNorm.length > 2 && exNorm.length > 2 && (candNorm.includes(exNorm) || exNorm.includes(candNorm) || candNorm === exNorm)) {
        return ex;
      }
    }
  }
  return undefined;
}

interface LocationRow {
  id: string;
  name: string;
  description: string | null;
  latitude: number;
  longitude: number;
  is_approved: boolean;
  enrichment_status: string | null;
  enriched_data: any;
  place_type: string | null;
  continent: string | null;
  country: string | null;
  region: string | null;
}

interface RouteRow {
  id: string;
  name: string;
  transport_mode: string;
  status: string;
  total_distance_meters: number | null;
  total_duration_seconds: number | null;
}

interface DocumentFocusViewProps {
  docId: string;
  docName: string;
  userId: string;
  onBack: () => void;
}

export function DocumentFocusView({ docId, docName, userId, onBack }: DocumentFocusViewProps) {
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedRouteIds, setSelectedRouteIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; description: string }>({ name: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [nearbyLocation, setNearbyLocation] = useState<LocationRow | null>(null);
  const [highlightedRouteId, setHighlightedRouteId] = useState<string | null>(null);
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [originalFilePath, setOriginalFilePath] = useState<string | null>(null);
  const [docStatus, setDocStatus] = useState<string>('draft');
  const [downloadingOriginal, setDownloadingOriginal] = useState(false);
  const [showCatalogDialog, setShowCatalogDialog] = useState(false);
  const [addMode, setAddMode] = useState<'catalog' | 'itinerary'>('catalog');
  const [catalogOptions, setCatalogOptions] = useState({
    scope: 'all' as 'all' | 'selected' | 'approved',
    visibility: 'followers' as 'public' | 'followers' | 'private',
    routeScope: 'all' as 'all' | 'none' | 'selected',
    autoEnrich: false,
  });
  const [itineraryName, setItineraryName] = useState('');
  const [publishing, setPublishing] = useState(false);
  
  const [catalogPreview, setCatalogPreview] = useState<{
    toAdd: string[];
    routesToAdd: string[];
    skippedDuplicates: number;
    loading: boolean;
  } | null>(null);

  const [itineraryPreview, setItineraryPreview] = useState<{
    linkedCount: number;
    newCount: number;
    matches: Map<string, string>; // locationId -> catalogLocationName
    loading: boolean;
  } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [locsRes, routesRes, docRes] = await Promise.all([
        supabase
          .from('locations')
          .select('id, name, description, latitude, longitude, is_approved, enrichment_status, enriched_data, place_type, continent, country, region')
          .eq('document_id', docId)
          .is('deleted_at', null)
          .order('name', { ascending: true }),
        supabase
          .from('routes')
          .select('id, name, transport_mode, status, total_distance_meters, total_duration_seconds')
          .eq('user_id', userId)
          .contains('route_preferences', { documentId: docId })
          .order('name', { ascending: true }),
        supabase
          .from('documents')
          .select('original_file_path, status')
          .eq('id', docId)
          .single(),
      ]);

      if (locsRes.error) throw locsRes.error;
      setLocations(locsRes.data || []);
      setRoutes(routesRes.data || []);
      if (docRes.data) {
        setOriginalFilePath((docRes.data as any).original_file_path || null);
        setDocStatus(docRes.data.status || 'draft');
      }
    } catch (e) {
      console.error('Error fetching data:', e);
      toast.error('Error al cargar contenido');
    } finally {
      setLoading(false);
    }
  }, [docId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Focus map on this document's points and keep routes in sync while data changes
  useEffect(() => {
    if (loading) return;

    window.dispatchEvent(new CustomEvent('document:view-on-map', {
      detail: {
        docId,
        docName,
        locationIds: locations.map(l => l.id),
        routeIds: routes.map(r => r.id),
      },
    }));

    if (locations.length > 0) {
      const lats = locations.map(l => l.latitude);
      const lngs = locations.map(l => l.longitude);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('map-fit-bounds', {
          detail: {
            bounds: [
              [Math.min(...lats), Math.min(...lngs)],
              [Math.max(...lats), Math.max(...lngs)],
            ],
            padding: [60, 60],
            maxZoom: 15,
          },
        }));
      }, 100);
    }
  }, [docId, docName, loading, locations, routes]);

  useEffect(() => {
    return () => {
      window.dispatchEvent(new CustomEvent('document:view-on-map', { detail: null }));
    };
  }, [docId]);

  // Refresh list when locations are trashed or restored
  useEffect(() => {
    const refresh = () => fetchData();
    window.addEventListener('trash-updated', refresh);
    window.addEventListener('locations-updated', refresh);
    return () => {
      window.removeEventListener('trash-updated', refresh);
      window.removeEventListener('locations-updated', refresh);
    };
  }, [fetchData]);

  // Listen for map click events to enable drag-edit
  useEffect(() => {
    const handleLocationMoved = async (e: CustomEvent<{ locationId: string; lat: number; lng: number }>) => {
      const { locationId, lat, lng } = e.detail;
      try {
        const { error } = await supabase
          .from('locations')
          .update({ latitude: lat, longitude: lng })
          .eq('id', locationId);
        if (error) throw error;

        setLocations(prev => prev.map(l =>
          l.id === locationId ? { ...l, latitude: lat, longitude: lng } : l
        ));
        toast.success('Coordenadas actualizadas');
      } catch {
        toast.error('Error al mover punto');
      }
    };

    window.addEventListener('location:moved', handleLocationMoved as EventListener);
    return () => window.removeEventListener('location:moved', handleLocationMoved as EventListener);
  }, []);

  // Listen for route:focus events (from map route click) to scroll and highlight
  useEffect(() => {
    const handleRouteFocus = (e: Event) => {
      const { routeId } = (e as CustomEvent).detail || {};
      if (!routeId || !routes.find(r => r.id === routeId)) return;

      setHighlightedRouteId(routeId);
      setTimeout(() => {
        const el = document.querySelector(`[data-route-id="${routeId}"]`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
      setTimeout(() => setHighlightedRouteId(null), 2500);
    };

    // Also intercept map-route-selected to open inline editor
    const handleMapRouteSelected = (e: Event) => {
      const { routeId } = (e as CustomEvent).detail || {};
      if (!routeId || !routes.find(r => r.id === routeId)) return;
      setEditingRouteId(routeId);
    };

    window.addEventListener('route:focus', handleRouteFocus as EventListener);
    window.addEventListener('map-route-selected', handleMapRouteSelected as EventListener);
    return () => {
      window.removeEventListener('route:focus', handleRouteFocus as EventListener);
      window.removeEventListener('map-route-selected', handleMapRouteSelected as EventListener);
    };
  }, [routes]);

  const approvedCount = useMemo(() => locations.filter(l => l.is_approved).length, [locations]);
  const pendingCount = useMemo(() => locations.filter(l => !l.is_approved).length, [locations]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleRouteSelect = (id: string) => {
    setSelectedRouteIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(locations.map(l => l.id)));
    setSelectedRouteIds(new Set(routes.map(r => r.id)));
  };
  const selectNone = () => { setSelectedIds(new Set()); setSelectedRouteIds(new Set()); };
  const selectPending = () => setSelectedIds(new Set(locations.filter(l => !l.is_approved).map(l => l.id)));
  const selectApproved = () => setSelectedIds(new Set(locations.filter(l => l.is_approved).map(l => l.id)));

  const handleApprove = async (ids: string[], approve: boolean) => {
    setApproving(true);
    try {
      const { error } = await supabase
        .from('locations')
        .update({ is_approved: approve })
        .in('id', ids);

      if (error) throw error;

      setLocations(prev => prev.map(l =>
        ids.includes(l.id) ? { ...l, is_approved: approve } : l
      ));

      // Update the store so the map refreshes
      const store = useLocationsStore.getState();
      ids.forEach(id => {
        store.updateLocation(id, { isApproved: approve });
      });

      toast.success(approve
        ? `${ids.length} punto(s) aprobado(s) para el mapa general`
        : `${ids.length} punto(s) retirado(s) del mapa general`
      );
      setSelectedIds(new Set());
    } catch (e) {
      console.error('Error updating approval:', e);
      toast.error('Error al actualizar aprobación');
    } finally {
      setApproving(false);
    }
  };

  const handleHighlight = (loc: LocationRow) => {
    setFocusedId(loc.id);
    useLocationsStore.getState().setFocusedLocation(loc.id);
  };

  const startEdit = (loc: LocationRow) => {
    setEditingId(loc.id);
    setEditForm({ name: loc.name, description: loc.description || '' });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('locations')
        .update({ name: editForm.name, description: editForm.description || null })
        .eq('id', editingId);

      if (error) throw error;

      setLocations(prev => prev.map(l =>
        l.id === editingId ? { ...l, name: editForm.name, description: editForm.description || null } : l
      ));

      // Update store
      useLocationsStore.getState().updateLocation(editingId, {
        name: editForm.name,
        description: editForm.description || undefined,
      });

      toast.success('Punto actualizado');
      setEditingId(null);
    } catch {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  // Enable draggable markers mode
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('map:set-drag-mode', { detail: { enabled: true, docId } }));
    return () => {
      window.dispatchEvent(new CustomEvent('map:set-drag-mode', { detail: { enabled: false } }));
    };
  }, [docId]);

  // Listen for open-nearby-context from map popup actions
  useEffect(() => {
    const handler = (e: Event) => {
      const { locationId } = (e as CustomEvent).detail;
      const loc = locations.find(l => l.id === locationId);
      if (loc) {
        setNearbyLocation(loc);
      }
    };
    window.addEventListener('open-nearby-context', handler);
    return () => window.removeEventListener('open-nearby-context', handler);
  }, [locations]);

  const handleDownloadOriginal = async () => {
    if (!originalFilePath) return;
    setDownloadingOriginal(true);
    try {
      const { data, error } = await supabase.storage
        .from('document-originals')
        .download(originalFilePath);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const filename = originalFilePath.split('/').pop() || 'original';
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Error downloading original:', e);
      toast.error('Error al descargar archivo original');
    } finally {
      setDownloadingOriginal(false);
    }
  };

  // Compute catalog preview (duplicate detection)
  const computeCatalogPreview = useCallback(async (scope: 'all' | 'selected' | 'approved') => {
    setCatalogPreview({ toAdd: [], routesToAdd: [], skippedDuplicates: 0, loading: true });
    try {
      let candidates: LocationRow[];
      if (scope === 'all') candidates = locations;
      else if (scope === 'selected') candidates = locations.filter(l => selectedIds.has(l.id));
      else candidates = locations.filter(l => l.is_approved);

      const { data: existingLocs } = await supabase
        .from('locations')
        .select('id, name, latitude, longitude')
        .eq('is_approved', true)
        .is('deleted_at', null)
        .neq('document_id', docId)
        .limit(5000);

      const existing = existingLocs || [];
      const THRESHOLD = 250;

      const toAdd: string[] = [];
      let skippedDuplicates = 0;

      for (const candidate of candidates) {
        const isDuplicate = !!findCatalogMatch(candidate, existing, THRESHOLD);
        if (isDuplicate) {
          skippedDuplicates++;
        } else {
          toAdd.push(candidate.id);
        }
      }

      // Routes based on current routeScope
      let routesToAdd: string[];
      if (catalogOptions.routeScope === 'all') routesToAdd = routes.map(r => r.id);
      else if (catalogOptions.routeScope === 'selected') routesToAdd = Array.from(selectedRouteIds);
      else routesToAdd = [];

      setCatalogPreview({ toAdd, routesToAdd, skippedDuplicates, loading: false });
    } catch (e) {
      console.error('Error computing catalog preview:', e);
      setCatalogPreview(null);
    }
  }, [locations, selectedIds, docId, routes, catalogOptions.routeScope, selectedRouteIds]);

  // Open dialog and compute preview
  const openCatalogDialog = useCallback(() => {
    setAddMode('catalog');
    setItineraryName(docName);
    setShowCatalogDialog(true);
    computeCatalogPreview(catalogOptions.scope);
  }, [catalogOptions.scope, computeCatalogPreview, docName]);

  // Recompute preview when scope or route scope changes
  useEffect(() => {
    if (showCatalogDialog && addMode === 'catalog') {
      computeCatalogPreview(catalogOptions.scope);
    }
  }, [catalogOptions.scope, catalogOptions.routeScope, selectedRouteIds, showCatalogDialog, addMode]);

  // Compute itinerary preview (linked vs new)
  const computeItineraryPreview = useCallback(async () => {
    setItineraryPreview({ linkedCount: 0, newCount: 0, matches: new Map(), loading: true });
    try {
      const { data: existingLocs } = await supabase
        .from('locations')
        .select('id, name, latitude, longitude')
        .eq('is_approved', true)
        .is('deleted_at', null)
        .neq('document_id', docId)
        .limit(5000);
      const externalCatalog = existingLocs || [];
      const THRESHOLD = 250;
      let linkedCount = 0;
      const matches = new Map<string, string>();
      for (const loc of locations) {
        const match = findCatalogMatch(loc, externalCatalog, THRESHOLD);
        if (match) {
          linkedCount++;
          matches.set(loc.id, match.name);
        }
      }
      setItineraryPreview({ linkedCount, newCount: locations.length - linkedCount, matches, loading: false });
    } catch {
      setItineraryPreview(null);
    }
  }, [locations, docId]);

  useEffect(() => {
    if (showCatalogDialog && addMode === 'itinerary') {
      computeItineraryPreview();
    }
  }, [showCatalogDialog, addMode, computeItineraryPreview]);

  const handlePublishToCatalog = async () => {
    if (!catalogPreview || catalogPreview.loading) return;
    setPublishing(true);
    try {
      const targetIds = catalogPreview.toAdd;
      const routeIds = catalogPreview.routesToAdd;
      const idsToApprove = targetIds.filter(id => {
        const loc = locations.find(l => l.id === id);
        return loc && !loc.is_approved;
      });

      // Update visibility on target locations
      if (targetIds.length > 0) {
        await supabase
          .from('locations')
          .update({ visibility: catalogOptions.visibility })
          .in('id', targetIds);
      }

      // Update visibility on target routes
      if (routeIds.length > 0) {
        await supabase
          .from('routes')
          .update({ visibility: catalogOptions.visibility })
          .in('id', routeIds);
      }

      // Approve pending
      if (idsToApprove.length > 0) {
        await handleApprove(idsToApprove, true);
      }

      // Update document status
      const { error } = await supabase
        .from('documents')
        .update({ status: 'published' })
        .eq('id', docId);
      if (error) throw error;
      setDocStatus('published');

      // Auto-enrich if requested
      if (catalogOptions.autoEnrich && targetIds.length > 0) {
        try {
          await supabase.functions.invoke('batch-enrich', {
            body: { action: 'start', documentId: docId, locationIds: targetIds },
          });
          toast.success(`Enriqueciendo ${targetIds.length} puntos...`);
        } catch (e) {
          console.warn('Auto-enrich failed:', e);
        }
      }

      const skipped = catalogPreview.skippedDuplicates;
      const parts: string[] = [];
      if (targetIds.length > 0) parts.push(`${targetIds.length} puntos`);
      if (routeIds.length > 0) parts.push(`${routeIds.length} rutas`);
      const itemsMsg = parts.length > 0 ? parts.join(' y ') + ' añadidos al catálogo' : 'Documento actualizado';
      const msg = skipped > 0 ? `${itemsMsg} (${skipped} coincidentes con catálogo)` : itemsMsg;
      toast.success(msg);
      setShowCatalogDialog(false);
      setCatalogPreview(null);
      setSelectedIds(new Set());
      setSelectedRouteIds(new Set());
    } catch (e) {
      console.error('Error publishing to catalog:', e);
      toast.error('Error al publicar');
    } finally {
      setPublishing(false);
    }
  };

  const handleReturnToWorkspace = async () => {
    try {
      // Set all locations back to unapproved
      const approvedIds = locations.filter(l => l.is_approved).map(l => l.id);
      if (approvedIds.length > 0) {
        await handleApprove(approvedIds, false);
      }
      const { error } = await supabase
        .from('documents')
        .update({ status: 'draft' })
        .eq('id', docId);
      if (error) throw error;
      setDocStatus('draft');
      toast.success('Documento devuelto a mesa de trabajo — puntos retirados del catálogo');
    } catch (e) {
      toast.error('Error al cambiar estado');
    }
  };

  const handleAddAsItinerary = async () => {
    setPublishing(true);
    try {
      const name = itineraryName.trim() || docName;

      // 1. Fetch existing catalog locations to match against
      const { data: existingLocs } = await supabase
        .from('locations')
        .select('id, name, latitude, longitude')
        .eq('is_approved', true)
        .is('deleted_at', null)
        .neq('document_id', docId)
        .limit(5000);
      const existing = existingLocs || [];
      const THRESHOLD = 250;

      // 2. Create the parent route (itinerary container)
      const { data: newRoute, error: routeError } = await supabase
        .from('routes')
        .insert({
          name,
          user_id: userId,
          transport_mode: 'multimodal',
          status: 'draft',
          visibility: catalogOptions.visibility,
          route_preferences: { documentId: docId, documentName: docName, isItinerary: true } as any,
        })
        .select('id')
        .single();
      if (routeError) throw routeError;

      const routeId = newRoute.id;

      // 3. Create waypoints for each location
      const waypoints = locations.map((loc, idx) => {
        const catalogMatch = findCatalogMatch(loc, existing, THRESHOLD);
        return {
          route_id: routeId,
          position: idx,
          name: loc.name,
          latitude: loc.latitude,
          longitude: loc.longitude,
          location_id: catalogMatch?.id || null,
          transport_mode: 'driving' as const,
          _original: loc, // keep reference for catalog creation
        };
      });

      // 3b. If auto-enrich is on, create catalog locations for new points (not yet in catalog)
      const allLocationIds: string[] = [];
      if (catalogOptions.autoEnrich) {
        const newPoints = waypoints.filter(w => !w.location_id);
        if (newPoints.length > 0) {
          const locsToInsert = newPoints.map(wp => ({
            name: wp.name,
            latitude: wp.latitude,
            longitude: wp.longitude,
            document_id: docId,
            is_approved: true,
            visibility: catalogOptions.visibility,
            place_type: (wp._original as any).placeType || null,
            country: (wp._original as any).country || null,
            region: (wp._original as any).region || null,
            continent: (wp._original as any).continent || null,
            description: (wp._original as any).description || null,
          }));
          
          const { data: createdLocs, error: createErr } = await supabase
            .from('locations')
            .insert(locsToInsert)
            .select('id');
          
          if (!createErr && createdLocs) {
            // Link new catalog IDs back to waypoints
            for (let i = 0; i < newPoints.length; i++) {
              newPoints[i].location_id = createdLocs[i].id;
              allLocationIds.push(createdLocs[i].id);
            }
          }
        }
        // Add already-linked catalog IDs
        for (const wp of waypoints) {
          if (wp.location_id && !allLocationIds.includes(wp.location_id)) {
            allLocationIds.push(wp.location_id);
          }
        }
      }

      // Insert waypoints in batches (strip internal _original field)
      for (let i = 0; i < waypoints.length; i += 100) {
        const batch = waypoints.slice(i, i + 100).map(({ _original, ...rest }) => rest);
        const { error: wpError } = await supabase.from('route_waypoints').insert(batch);
        if (wpError) throw wpError;
      }

      // 4. Also link existing document routes as child routes if any
      if (routes.length > 0) {
        for (let ri = 0; ri < routes.length; ri++) {
          await supabase
            .from('routes')
            .update({ parent_route_id: routeId, segment_position: ri } as any)
            .eq('id', routes[ri].id);
        }
      }

      const linkedCount = waypoints.filter(w => w.location_id).length;
      const newCount = waypoints.length - linkedCount;

      // Auto-enrich all catalog locations (existing + newly created)
      if (catalogOptions.autoEnrich && allLocationIds.length > 0) {
        try {
          await supabase.functions.invoke('batch-enrich', {
            body: { action: 'start', locationIds: allLocationIds, documentId: docId },
          });
          toast.info(`Enriquecimiento IA iniciado para ${allLocationIds.length} ubicaciones`);
        } catch (enrichErr) {
          console.warn('Auto-enrich failed:', enrichErr);
        }
      }

      toast.success(
        `Itinerario "${name}" creado con ${waypoints.length} paradas` +
        (linkedCount > 0 ? ` (${linkedCount} ya en catálogo)` : '') +
        (routes.length > 0 ? ` y ${routes.length} rutas` : '')
      );

      setShowCatalogDialog(false);
      setCatalogPreview(null);
      window.dispatchEvent(new CustomEvent('routes:changed'));
    } catch (e) {
      console.error('Error creating itinerary:', e);
      toast.error('Error al crear itinerario');
    } finally {
      setPublishing(false);
    }
  };

  // If editing a route inline, render RouteBuilder
  if (editingRouteId) {
    return (
      <div data-document-focus-panel="true" className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="px-3 py-2 border-b bg-muted/30 flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setEditingRouteId(null)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{docName}</p>
            <p className="text-[11px] text-muted-foreground">Editando itinerario</p>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          <Suspense fallback={<div className="p-4 text-center text-muted-foreground text-sm">Cargando...</div>}>
            <RouteBuilder
              editRouteId={editingRouteId}
              onClose={() => setEditingRouteId(null)}
              onRouteCalculated={(segments) => {
                window.dispatchEvent(new CustomEvent('map-show-route', { detail: { segments, stops: [] } }));
              }}
            />
          </Suspense>
        </div>
      </div>
    );
  }

  // If nearby panel is active, render it instead of the document list
  if (nearbyLocation) {
    return (
      <div data-document-focus-panel="true" className="flex h-full min-h-0 flex-col overflow-hidden">
        <NearbyPanel
          location={nearbyLocation}
          docId={docId}
          userId={userId}
          onClose={() => setNearbyLocation(null)}
          onLocationUpdated={(updated) => {
            setLocations(prev => prev.map(l => l.id === updated.id ? updated : l));
          }}
          onLocationMerged={(_mergedIntoId, removedId) => {
            setLocations(prev => prev.filter(l => l.id !== removedId));
            setNearbyLocation(null);
          }}
        />
      </div>
    );
  }

  return (
    <div data-document-focus-panel="true" className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b bg-muted/30 space-y-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onBack}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium truncate">{docName}</p>
              <Badge variant={docStatus === 'published' ? 'default' : 'secondary'} className="text-[9px] h-4 shrink-0">
                {docStatus === 'published' ? 'Catálogo' : 'Mesa de trabajo'}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {locations.length} puntos · {routes.length} rutas · {approvedCount} aprobados · {pendingCount} pendientes
            </p>
          </div>
          {/* Document actions */}
          <div className="flex items-center gap-0.5 shrink-0">
            {originalFilePath && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={downloadingOriginal}
                    onClick={handleDownloadOriginal}
                  >
                    {downloadingOriginal ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Descargar archivo original</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Workspace / Catalog actions */}
        <div className="flex items-center gap-1.5">
          {docStatus !== 'published' ? (
            <Button
              variant="default"
              size="sm"
              className="h-7 text-[11px] gap-1 flex-1"
              onClick={openCatalogDialog}
            >
              <Plus className="w-3 h-3" />
              Añadir
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px] gap-1 flex-1"
              onClick={handleReturnToWorkspace}
            >
              <FileArchive className="w-3 h-3" />
              Devolver a mesa de trabajo
            </Button>
          )}
        </div>

        {/* Bulk actions */}
        <div className="flex items-center gap-1 flex-wrap">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-6 text-[11px] gap-1">
                <CheckCheck className="w-3 h-3" />
                Seleccionar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={selectAll}>Todos ({locations.length})</DropdownMenuItem>
              <DropdownMenuItem onClick={selectNone}>Ninguno</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={selectPending}>Pendientes ({pendingCount})</DropdownMenuItem>
              <DropdownMenuItem onClick={selectApproved}>Aprobados ({approvedCount})</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {(selectedIds.size > 0 || selectedRouteIds.size > 0) && (
            <>
              <Badge variant="secondary" className="text-[10px] h-5">
                {selectedIds.size + selectedRouteIds.size} sel.
              </Badge>
              <Button
                variant="default"
                size="sm"
                className="h-6 text-[11px] gap-1"
                disabled={approving}
                onClick={() => handleApprove(Array.from(selectedIds), true)}
              >
                {approving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Aprobar
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[11px] gap-1"
                disabled={approving}
                onClick={() => handleApprove(Array.from(selectedIds), false)}
              >
                <X className="w-3 h-3" />
                Retirar
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Location list */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Cargando puntos...</span>
          </div>
        ) : (
          <div className="divide-y">
            {locations.map(loc => {
              const isEnriched = loc.enrichment_status === 'enriched';
              const isSelected = selectedIds.has(loc.id);
              const isFocused = focusedId === loc.id;

              return (
                <div
                  key={loc.id}
                  className={`px-3 py-2 transition-colors group ${isFocused ? 'bg-primary/10 border-l-2 border-l-primary' : isSelected ? 'bg-primary/5' : 'hover:bg-muted/40'}`}
                >
                  <div className="flex items-start gap-2">
                    {/* Checkbox */}
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelect(loc.id)}
                      className="mt-0.5 shrink-0"
                    />

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {/* Approval badge */}
                        {loc.is_approved ? (
                          <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                        ) : (
                          <div className="w-3 h-3 rounded-full border-2 border-amber-400 shrink-0" />
                        )}

                        {/* Name — click to focus on map */}
                        <button
                          onClick={() => handleHighlight(loc)}
                          className="text-[13px] font-medium truncate text-left hover:text-primary transition-colors"
                        >
                          {loc.name}
                        </button>

                        {isEnriched && (
                          <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
                        )}
                      </div>

                      {/* Meta */}
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                        {loc.country && <span>{loc.country}</span>}
                        {loc.region && <><span className="opacity-30">·</span><span>{loc.region}</span></>}
                        <span className="opacity-30">·</span>
                        <span className="tabular-nums">{loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        title={loc.is_approved ? 'Retirar del mapa' : 'Aprobar para el mapa'}
                        onClick={() => handleApprove([loc.id], !loc.is_approved)}
                      >
                        {loc.is_approved ? (
                          <EyeOff className="w-3 h-3 text-muted-foreground" />
                        ) : (
                          <Eye className="w-3 h-3 text-emerald-500" />
                        )}
                      </Button>
                      <PointContextActions
                        location={loc}
                        docId={docId}
                        userId={userId}
                        onOpenNearby={(loc) => setNearbyLocation(loc)}
                        onLocationUpdated={(updated) => {
                          setLocations(prev => prev.map(l => l.id === updated.id ? updated : l));
                        }}
                        onLocationDuplicated={(newLoc) => {
                          setLocations(prev => [...prev, newLoc].sort((a, b) => a.name.localeCompare(b.name)));
                        }}
                        onLocationMerged={(_mergedIntoId, removedId) => {
                          setLocations(prev => prev.filter(l => l.id !== removedId));
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Routes section */}
            {routes.length > 0 && (
              <>
                <div className="px-3 py-2 bg-muted/20 border-t border-b">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                    <RouteIcon className="w-3 h-3" />
                    Rutas ({routes.length})
                  </div>
                </div>
                {routes.map(route => (
                  <div
                    key={route.id}
                    data-route-id={route.id}
                    className={cn(
                      "px-3 py-2 hover:bg-muted/40 transition-all group cursor-pointer",
                      highlightedRouteId === route.id && "bg-primary/10 ring-1 ring-primary/30"
                    )}
                    onClick={() => setEditingRouteId(route.id)}
                  >
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedRouteIds.has(route.id)}
                        onCheckedChange={() => toggleRouteSelect(route.id)}
                        className="mt-0.5 shrink-0"
                      />
                      <RouteIcon className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium truncate">{route.name}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                          <span>{route.transport_mode}</span>
                          {route.total_distance_meters && (
                            <>
                              <span className="opacity-30">·</span>
                              <span className="tabular-nums">{(route.total_distance_meters / 1000).toFixed(1)} km</span>
                            </>
                          )}
                          {route.total_duration_seconds && (
                            <>
                              <span className="opacity-30">·</span>
                              <span className="tabular-nums">{Math.round(route.total_duration_seconds / 3600)}h {Math.round((route.total_duration_seconds % 3600) / 60)}m</span>
                            </>
                          )}
                          <span className="opacity-30">·</span>
                          <Badge variant="outline" className="text-[9px] h-4 px-1">{route.status}</Badge>
                        </div>
                      </div>
                      <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Edit sheet */}
      <Sheet open={editingId !== null} onOpenChange={open => { if (!open) setEditingId(null); }}>
        <SheetContent side="bottom" className="h-[50vh]">
          <SheetHeader>
            <SheetTitle className="text-sm">Editar punto</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="text-xs">Nombre</Label>
              <Input
                value={editForm.name}
                onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Descripción</Label>
              <Textarea
                value={editForm.description}
                onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                className="min-h-[100px] text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={saveEdit} disabled={saving} className="gap-1">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                Guardar
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Añadir dialog */}
      <Dialog open={showCatalogDialog} onOpenChange={setShowCatalogDialog}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Añadir
            </DialogTitle>
            <DialogDescription>
              Elige cómo incorporar los puntos de "{docName}".
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Mode selector */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">¿Cómo añadir?</Label>
              <RadioGroup
                value={addMode}
                onValueChange={(v) => setAddMode(v as 'catalog' | 'itinerary')}
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="catalog" id="mode-catalog" />
                  <Label htmlFor="mode-catalog" className="text-xs cursor-pointer flex items-center gap-1.5">
                    <MapPin className="w-3 h-3" />
                    Al catálogo general
                  </Label>
                </div>
                <p className="text-[10px] text-muted-foreground ml-6 -mt-1">
                  Todos los puntos se integran como ubicaciones permanentes del catálogo.
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <RadioGroupItem value="itinerary" id="mode-itinerary" />
                  <Label htmlFor="mode-itinerary" className="text-xs cursor-pointer flex items-center gap-1.5">
                    <RouteIcon className="w-3 h-3" />
                    Como nuevo itinerario
                  </Label>
                </div>
                <p className="text-[10px] text-muted-foreground ml-6 -mt-1">
                  Crea un itinerario con los puntos como paradas. Los que ya existen en catálogo se vinculan; los nuevos solo aparecen dentro del itinerario.
                </p>
              </RadioGroup>
            </div>

            <Separator />

            {addMode === 'catalog' ? (
              <>
                {/* ─── CATALOG MODE ─── */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">¿Qué puntos incorporar?</Label>
                  <RadioGroup
                    value={catalogOptions.scope}
                    onValueChange={(v) => setCatalogOptions(prev => ({ ...prev, scope: v as any }))}
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="all" id="scope-all" />
                      <Label htmlFor="scope-all" className="text-xs cursor-pointer">
                        Todos los puntos ({locations.length})
                      </Label>
                    </div>
                    {selectedIds.size > 0 && (
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="selected" id="scope-selected" />
                        <Label htmlFor="scope-selected" className="text-xs cursor-pointer">
                          Solo seleccionados ({selectedIds.size})
                        </Label>
                      </div>
                    )}
                    {approvedCount > 0 && (
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="approved" id="scope-approved" />
                        <Label htmlFor="scope-approved" className="text-xs cursor-pointer">
                          Solo los ya aprobados ({approvedCount})
                        </Label>
                      </div>
                    )}
                  </RadioGroup>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label className="text-xs font-medium">Visibilidad en el catálogo</Label>
                  <RadioGroup
                    value={catalogOptions.visibility}
                    onValueChange={(v) => setCatalogOptions(prev => ({ ...prev, visibility: v as any }))}
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="public" id="vis-public" />
                      <Label htmlFor="vis-public" className="text-xs cursor-pointer flex items-center gap-1">
                        <Eye className="w-3 h-3" /> Público
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="followers" id="vis-followers" />
                      <Label htmlFor="vis-followers" className="text-xs cursor-pointer flex items-center gap-1">
                        <Users className="w-3 h-3" /> Seguidores
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="private" id="vis-private" />
                      <Label htmlFor="vis-private" className="text-xs cursor-pointer flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Privado
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {routes.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">¿Qué rutas incorporar?</Label>
                      <RadioGroup
                        value={catalogOptions.routeScope}
                        onValueChange={(v) => setCatalogOptions(prev => ({ ...prev, routeScope: v as any }))}
                      >
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="all" id="route-all" />
                          <Label htmlFor="route-all" className="text-xs cursor-pointer">
                            Todas las rutas ({routes.length})
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="selected" id="route-selected" />
                          <Label htmlFor="route-selected" className="text-xs cursor-pointer">
                            Solo seleccionadas ({selectedRouteIds.size})
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="none" id="route-none" />
                          <Label htmlFor="route-none" className="text-xs cursor-pointer">
                            Ninguna
                          </Label>
                        </div>
                      </RadioGroup>

                      {catalogOptions.routeScope === 'selected' && (
                        <div className="ml-5 space-y-1 mt-1 max-h-32 overflow-y-auto">
                          {routes.map(r => (
                            <div key={r.id} className="flex items-center gap-2">
                              <Checkbox
                                checked={selectedRouteIds.has(r.id)}
                                onCheckedChange={() => {
                                  setSelectedRouteIds(prev => {
                                    const next = new Set(prev);
                                    if (next.has(r.id)) next.delete(r.id); else next.add(r.id);
                                    return next;
                                  });
                                }}
                              />
                              <span className="text-xs truncate">{r.name}</span>
                              <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                                {r.total_distance_meters ? `${(r.total_distance_meters / 1000).toFixed(1)} km` : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs cursor-pointer">Enriquecer con IA al incorporar</Label>
                    <Switch
                      checked={catalogOptions.autoEnrich}
                      onCheckedChange={(v) => setCatalogOptions(prev => ({ ...prev, autoEnrich: v }))}
                    />
                  </div>
                </div>

                <Separator />

                {/* Preview summary */}
                <div className="rounded-md border bg-muted/40 p-3 space-y-1.5 text-sm">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Resumen de la operación</p>
                  {catalogPreview?.loading ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span className="text-xs">Analizando duplicados...</span>
                    </div>
                  ) : catalogPreview ? (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="flex items-center gap-1.5 text-xs">
                          <MapPin className="w-3 h-3 text-emerald-600" />
                          Puntos a incorporar
                        </span>
                        <span className="font-medium text-xs text-emerald-600">{catalogPreview.toAdd.length}</span>
                      </div>
                      {catalogPreview.routesToAdd.length > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="flex items-center gap-1.5 text-xs">
                            <RouteIcon className="w-3 h-3 text-emerald-600" />
                            Rutas a incorporar
                          </span>
                          <span className="font-medium text-xs text-emerald-600">{catalogPreview.routesToAdd.length}</span>
                        </div>
                      )}
                      {catalogPreview.skippedDuplicates > 0 && (
                        <div className="flex justify-between items-center">
                           <span className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400">
                             <Check className="w-3 h-3" />
                             Coincidentes con catálogo
                           </span>
                           <span className="font-medium text-xs text-blue-600 dark:text-blue-400">{catalogPreview.skippedDuplicates}</span>
                        </div>
                      )}
                      {catalogOptions.autoEnrich && catalogPreview.toAdd.length > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                            <Sparkles className="w-3 h-3" />
                            Se enriquecerán con IA
                          </span>
                          <span className="font-medium text-xs text-amber-600 dark:text-amber-400">{catalogPreview.toAdd.length}</span>
                        </div>
                      )}
                    </>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                {/* ─── ITINERARY MODE ─── */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Nombre del itinerario</Label>
                  <Input
                    value={itineraryName}
                    onChange={e => setItineraryName(e.target.value)}
                    placeholder={docName}
                    className="h-8 text-sm"
                  />
                </div>

                {/* Visibility */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Visibilidad en el catálogo</Label>
                  <RadioGroup
                    value={catalogOptions.visibility}
                    onValueChange={(v) => setCatalogOptions(prev => ({ ...prev, visibility: v as any }))}
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="public" id="itin-vis-public" />
                      <Label htmlFor="itin-vis-public" className="text-xs cursor-pointer flex items-center gap-1">
                        <Eye className="w-3 h-3" /> Público
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="followers" id="itin-vis-followers" />
                      <Label htmlFor="itin-vis-followers" className="text-xs cursor-pointer flex items-center gap-1">
                        <Users className="w-3 h-3" /> Seguidores
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="private" id="itin-vis-private" />
                      <Label htmlFor="itin-vis-private" className="text-xs cursor-pointer flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Privado
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Waypoints list with match status */}
                <div className="rounded-md border bg-muted/40 p-3 space-y-1.5 text-sm">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Paradas del itinerario</p>
                  {itineraryPreview?.loading ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span className="text-xs">Analizando coincidencias con catálogo...</span>
                    </div>
                  ) : (
                    <>
                      <div className="max-h-48 overflow-y-auto space-y-0.5">
                        {locations.map((loc, idx) => {
                          const catalogName = itineraryPreview?.matches.get(loc.id);
                          const isLinked = !!catalogName;
                          return (
                            <div key={loc.id} className="flex items-center gap-2 py-0.5 text-xs">
                              <span className="text-muted-foreground w-4 text-right shrink-0">{idx + 1}</span>
                              {isLinked ? (
                                <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              ) : (
                                <Plus className="w-3 h-3 text-muted-foreground shrink-0" />
                              )}
                              <span className={cn("truncate", isLinked && "text-emerald-600 dark:text-emerald-400")}>
                                {loc.name}
                              </span>
                              {isLinked && catalogName !== loc.name && (
                                <span className="text-[10px] text-muted-foreground truncate">≈ {catalogName}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <Separator className="my-2" />

                      {/* Summary counts */}
                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="flex items-center gap-1.5 text-xs">
                            <MapPin className="w-3 h-3" />
                            Total paradas
                          </span>
                          <span className="font-medium text-xs">{locations.length}</span>
                        </div>
                        {itineraryPreview && itineraryPreview.linkedCount > 0 && (
                          <div className="flex justify-between items-center">
                            <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 pl-4">
                              <Check className="w-3 h-3" />
                              Ya en catálogo
                            </span>
                            <span className="font-medium text-xs text-emerald-600 dark:text-emerald-400">{itineraryPreview.linkedCount}</span>
                          </div>
                        )}
                        {itineraryPreview && itineraryPreview.newCount > 0 && (
                          <div className="flex justify-between items-center">
                            <span className="flex items-center gap-1.5 text-xs text-muted-foreground pl-4">
                              <Plus className="w-3 h-3" />
                              Nuevos (solo en itinerario)
                            </span>
                            <span className="font-medium text-xs text-muted-foreground">{itineraryPreview.newCount}</span>
                          </div>
                        )}
                        {routes.length > 0 && (
                          <div className="flex justify-between items-center">
                            <span className="flex items-center gap-1.5 text-xs">
                              <RouteIcon className="w-3 h-3" />
                              Rutas incluidas
                            </span>
                            <span className="font-medium text-xs">{routes.length}</span>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setShowCatalogDialog(false); setCatalogPreview(null); }}>
              Cancelar
            </Button>
            {addMode === 'catalog' ? (
              <Button
                size="sm"
                onClick={handlePublishToCatalog}
                disabled={publishing || !catalogPreview || catalogPreview.loading || (catalogPreview.toAdd.length === 0 && catalogPreview.routesToAdd.length === 0)}
                className="gap-1"
              >
                {publishing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                {catalogPreview && !catalogPreview.loading
                  ? (() => {
                      const parts: string[] = [];
                      if (catalogPreview.toAdd.length > 0) parts.push(`${catalogPreview.toAdd.length} puntos`);
                      if (catalogPreview.routesToAdd.length > 0) parts.push(`${catalogPreview.routesToAdd.length} rutas`);
                      return parts.length > 0 ? `Incorporar ${parts.join(' y ')}` : 'Sin elementos';
                    })()
                  : 'Confirmar'}
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleAddAsItinerary}
                disabled={publishing || locations.length === 0}
                className="gap-1"
              >
                {publishing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RouteIcon className="w-3 h-3" />}
                Crear itinerario ({locations.length} paradas)
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
