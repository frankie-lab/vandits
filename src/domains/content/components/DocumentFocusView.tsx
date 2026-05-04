import React, { useState, useEffect, useCallback, useMemo, Suspense, lazy } from 'react';
import {
  ChevronLeft, MapPin, Check, CheckCheck, CheckCircle, X, Sparkles, GripVertical,
  Pencil, Save, Loader2, Eye, EyeOff, Route as RouteIcon, Car,
  Download, FileArchive, Plus, Users, Lock, FolderPlus, Tag as TagIcon, Folder,
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
import { useLocationsStore } from '@/domains/content';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { NearbyPanel } from './PointContextActions';
import { calculateDistance } from '@/lib/duplicate-detection';
import { DocumentWaypointsTabs } from './DocumentWaypointsTabs';

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
  const [nearbyMismatch, setNearbyMismatch] = useState<{
    providedName: string;
    nameLocation?: { lat: number; lng: number; title: string; url: string; distanceKm: number };
  } | null>(null);
  const [highlightedRouteId, setHighlightedRouteId] = useState<string | null>(null);
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [originalFilePath, setOriginalFilePath] = useState<string | null>(null);
  const [docStatus, setDocStatus] = useState<string>('draft');
  const [downloadingOriginal, setDownloadingOriginal] = useState(false);
  const [showCatalogDialog, setShowCatalogDialog] = useState(false);
  type AddModeKey = 'catalog' | 'itinerary' | 'collection' | 'route' | 'tag';
  const [addModes, setAddModes] = useState<Set<AddModeKey>>(new Set());
  // Back-compat: derive a "primary" mode for legacy effects (preview computation, etc.).
  // The actual apply step iterates over ALL selected modes sequentially.
  const addMode: AddModeKey = (Array.from(addModes)[0] as AddModeKey) || 'catalog';
  const toggleAddMode = (m: AddModeKey) => {
    setAddModes(prev => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m); else next.add(m);
      return next;
    });
  };
  const [catalogOptions, setCatalogOptions] = useState({
    scope: 'all' as 'all' | 'selected' | 'approved',
    visibility: 'followers' as 'public' | 'followers' | 'private',
    routeScope: 'all' as 'all' | 'none' | 'selected',
    autoEnrich: false,
  });
  const [itineraryName, setItineraryName] = useState('');
  // Collection / Route / Tag mode state — driven by document-add.service
  const [userCollections, setUserCollections] = useState<{ id: string; name: string; icon: string; color: string }[]>([]);
  const [userRoutes, setUserRoutes] = useState<{ id: string; name: string }[]>([]);
  const [collectionId, setCollectionId] = useState<string>('__new__');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [targetRouteId, setTargetRouteId] = useState<string>('');
  const [tagInput, setTagInput] = useState('');
  const [tagList, setTagList] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [publishProgress, setPublishProgress] = useState<{
    current: number;
    total: number;
    label: string;
  } | null>(null);
  // Progreso fino por puntos (insertados/actualizados) dentro de la cadena.
  // current = puntos procesados acumulados, total = total esperado de puntos a tocar.
  const [pointProgress, setPointProgress] = useState<{ current: number; total: number } | null>(null);
  const [matchingCatalogIds, setMatchingCatalogIds] = useState<string[]>([]);
  
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
      // Carga ÍNTEGRA de los waypoints del documento.
      // PostgREST limita cada respuesta a 1000 filas como máximo absoluto del
      // backend, por lo que internamente hacemos lotes secuenciales hasta
      // agotar todos los registros. La UI recibe SIEMPRE la lista completa
      // (sin "siguiente página" ni botones de cargar más).
      const CHUNK = 1000;        // límite duro del backend, no es UX
      const SAFETY_MAX = 100_000; // tope defensivo (~100k puntos)
      const allLocs: LocationRow[] = [];
      while (allLocs.length < SAFETY_MAX) {
        const from = allLocs.length;
        const to = from + CHUNK - 1;
        const { data, error } = await supabase
          .from('locations')
          .select('id, name, description, latitude, longitude, is_approved, enrichment_status, enriched_data, place_type, continent, country, region')
          .eq('document_id', docId)
          .is('deleted_at', null)
          .order('name', { ascending: true })
          .range(from, to);
        if (error) throw error;
        const batch = data || [];
        allLocs.push(...batch);
        if (batch.length < CHUNK) break; // último lote, lista íntegra cargada
      }

      const [routesRes, docRes] = await Promise.all([
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

      const docLocs = allLocs;
      setLocations(docLocs);
      setRoutes(routesRes.data || []);
      if (docRes.data) {
        setOriginalFilePath((docRes.data as any).original_file_path || null);
        setDocStatus(docRes.data.status || 'draft');
      }

      // Compute catalog matches for this document's points
      if (docLocs.length > 0) {
        const { data: catalogLocs } = await supabase
          .from('locations')
          .select('id, name, latitude, longitude')
          .eq('is_approved', true)
          .is('deleted_at', null)
          .neq('document_id', docId)
          .limit(5000);

        const catalog = catalogLocs || [];
        const matchIds: string[] = [];
        for (const loc of docLocs) {
          const match = findCatalogMatch(loc, catalog, 250);
          // Push the LOCAL waypoint id, not the catalog twin id, so the store
          // can tag this document's matching points with _layerType='catalog'.
          if (match) matchIds.push(loc.id);
        }
        setMatchingCatalogIds(matchIds);
      } else {
        setMatchingCatalogIds([]);
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
        matchingCatalogIds,
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
  }, [docId, docName, loading, locations, routes, matchingCatalogIds]);

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

  // In-place patch when a point gets enriched — moves it to the
  // "Enriquecidos" tab instantly without reloading the whole document.
  useEffect(() => {
    const handler = (e: Event) => {
      const { id, patch } = (e as CustomEvent).detail || {};
      if (!id || !patch) return;
      setLocations(prev => {
        const idx = prev.findIndex(l => l.id === id);
        if (idx < 0) return prev; // not in this document
        const next = [...prev];
        next[idx] = { ...next[idx], ...patch };
        return next;
      });
    };
    window.addEventListener('location:enriched', handler);
    return () => window.removeEventListener('location:enriched', handler);
  }, []);

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
      const detail = (e as CustomEvent).detail || {};
      const { locationId, reason, providedName, nameLocation } = detail;
      const loc = locations.find(l => l.id === locationId);
      if (loc) {
        setNearbyLocation(loc);
        if (reason === 'name-coordinate-mismatch') {
          setNearbyMismatch({ providedName, nameLocation });
        } else {
          setNearbyMismatch(null);
        }
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
    setAddModes(new Set(['catalog']));
    setItineraryName(docName);
    setShowCatalogDialog(true);
    computeCatalogPreview(catalogOptions.scope);
  }, [catalogOptions.scope, computeCatalogPreview, docName]);

  // Recompute preview when scope or route scope changes
  useEffect(() => {
    if (showCatalogDialog && addModes.has('catalog')) {
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
    if (showCatalogDialog && addModes.has('itinerary')) {
      computeItineraryPreview();
    }
  }, [showCatalogDialog, addMode, computeItineraryPreview]);

  // Load user collections + routes when the Add dialog opens (collection/route modes)
  useEffect(() => {
    if (!showCatalogDialog) return;
    let cancelled = false;
    (async () => {
      const [cRes, rRes] = await Promise.all([
        supabase.from('collections').select('id, name, icon, color').eq('user_id', userId).order('name'),
        supabase.from('routes').select('id, name').eq('user_id', userId).order('name'),
      ]);
      if (cancelled) return;
      setUserCollections((cRes.data ?? []) as any);
      setUserRoutes((rRes.data ?? []) as any);
      if (!targetRouteId && rRes.data && rRes.data.length > 0) {
        setTargetRouteId((rRes.data[0] as any).id);
      }
    })();
    return () => { cancelled = true; };
  }, [showCatalogDialog, userId]);

  const handleAddToCollection = async () => {
    setPublishing(true);
    try {
      const { applyCollection } = await import('@/services/document-add.service');
      const res = await applyCollection({
        docId, userId,
        scope: catalogOptions.scope,
        selectedIds: Array.from(selectedIds),
        collectionId: collectionId === '__new__' ? null : collectionId,
        newCollection: collectionId === '__new__'
          ? {
              name: newCollectionName.trim() || docName,
              icon: 'folder',
              color: '#6b7280',
              visibility: catalogOptions.visibility,
            }
          : undefined,
      });
      toast.success(`${res.added} puntos añadidos a la colección`);
      setShowCatalogDialog(false);
      setSelectedIds(new Set());
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Error al añadir a la colección');
    } finally {
      setPublishing(false);
    }
  };

  const handleAddToRoute = async () => {
    if (!targetRouteId) { toast.error('Selecciona una ruta'); return; }
    setPublishing(true);
    try {
      const { applyRoute } = await import('@/services/document-add.service');
      const res = await applyRoute({
        docId, userId,
        scope: catalogOptions.scope,
        selectedIds: Array.from(selectedIds),
        routeId: targetRouteId,
      });
      toast.success(`${res.added} puntos añadidos a la ruta`);
      setShowCatalogDialog(false);
      setSelectedIds(new Set());
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Error al añadir a la ruta');
    } finally {
      setPublishing(false);
    }
  };

  const handleApplyTags = async () => {
    if (tagList.length === 0) { toast.error('Añade al menos una etiqueta'); return; }
    setPublishing(true);
    try {
      const { applyTag } = await import('@/services/document-add.service');
      const res = await applyTag({
        docId, userId,
        scope: catalogOptions.scope,
        selectedIds: Array.from(selectedIds),
        tags: tagList,
      });
      if (res.failed > 0) {
        toast.warning(`${res.updated} etiquetados, ${res.failed} fallaron de ${res.total}`);
      } else {
        toast.success(`${res.updated} puntos etiquetados`);
      }
      setShowCatalogDialog(false);
      setSelectedIds(new Set());
      setTagList([]);
      setTagInput('');
      window.dispatchEvent(new CustomEvent('locations-updated'));
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Error al etiquetar');
    } finally {
      setPublishing(false);
    }
  };

  /**
   * Aplica TODAS las acciones seleccionadas en cadena (multi-selección).
   *
   * Norma transversal (no hardcode):
   * 1) Autoflush de inputs pendientes (p. ej. tagInput → tagList) antes de validar.
   * 2) Validación previa atómica: si falta algún dato requerido, NADA se ejecuta.
   * 3) Refresh y feedback POR PASO (continue-on-error): cada acción exitosa
   *    despacha su evento y se reporta; los fallos no abortan los demás pasos.
   *
   * Orden: catalog → itinerary → collection → route → tag (estructural → auxiliar).
   */
  const handleApplyAll = async () => {
    const order: AddModeKey[] = ['catalog', 'itinerary', 'collection', 'route', 'tag'];
    const selected = order.filter(m => addModes.has(m));
    if (selected.length === 0) return;

    // ---- 1) Autoflush de inputs pendientes ----
    let effectiveTagList = tagList;
    if (addModes.has('tag')) {
      const pending = tagInput.trim().replace(/^#/, '');
      if (pending && !tagList.includes(pending)) {
        effectiveTagList = [...tagList, pending];
        setTagList(effectiveTagList);
        setTagInput('');
      }
    }

    // ---- 2) Validación previa atómica ----
    const errors: string[] = [];
    if (addModes.has('catalog')) {
      if (!catalogPreview || catalogPreview.loading) {
        errors.push('Catálogo: aún calculando vista previa');
      }
    }
    if (addModes.has('itinerary')) {
      // itineraryName cae a docName si está vacío → no es bloqueante
    }
    if (addModes.has('collection')) {
      if (collectionId === '__new__' && !newCollectionName.trim() && !docName.trim()) {
        errors.push('Colección: indica un nombre');
      }
    }
    if (addModes.has('route')) {
      if (!targetRouteId) errors.push('Ruta: selecciona una ruta destino');
    }
    if (addModes.has('tag')) {
      if (effectiveTagList.length === 0) errors.push('Etiquetas: añade al menos una');
    }
    if (errors.length > 0) {
      toast.error(errors.join(' · '));
      return;
    }

    // ---- 3) Ejecución resiliente paso a paso ----
    setPublishing(true);
    const eventsFor: Record<AddModeKey, string[]> = {
      catalog: ['locations-updated'],
      itinerary: ['routes:changed'],
      collection: ['collections:changed', 'locations-updated'],
      route: ['routes:changed', 'locations-updated'],
      tag: ['locations-updated'],
    };
    const labels: Record<AddModeKey, string> = {
      catalog: 'Catálogo',
      itinerary: 'Itinerario',
      collection: 'Colección',
      route: 'Ruta',
      tag: 'Etiquetas',
    };
    const results: { mode: AddModeKey; ok: boolean; error?: string }[] = [];

    // Tamaño real de puntos por modo (sin sumar entre modos: la barra fina
    // representa el progreso del step actual, el contador grueso (X/N) ya
    // refleja el avance entre modos).
    const scopedCount = catalogOptions.scope === 'selected'
      ? selectedIds.size
      : locations.length;
    const pointsForMode = (m: AddModeKey): number => {
      if (m === 'catalog') return catalogPreview?.toAdd.length ?? 0;
      if (m === 'itinerary') return locations.length;
      return scopedCount;
    };

    setPublishProgress({ current: 0, total: selected.length, label: labels[selected[0]] });
    setPointProgress({ current: 0, total: Math.max(1, pointsForMode(selected[0])) });

    for (let stepIdx = 0; stepIdx < selected.length; stepIdx++) {
      const m = selected[stepIdx];
      const stepTotal = Math.max(1, pointsForMode(m));
      setPublishProgress({ current: stepIdx, total: selected.length, label: labels[m] });
      setPointProgress({ current: 0, total: stepTotal });
      const onStepProgress = (processed: number) => {
        setPointProgress({ current: Math.min(processed, stepTotal), total: stepTotal });
      };
      try {
        if (m === 'catalog') {
          const targetIds = catalogPreview!.toAdd;
          const routeIds = catalogPreview!.routesToAdd;
          // Trozeamos el UPDATE de visibilidad para reportar progreso por puntos
          const CHUNK = 100;
          for (let i = 0; i < targetIds.length; i += CHUNK) {
            const slice = targetIds.slice(i, i + CHUNK);
            await supabase.from('locations').update({ visibility: catalogOptions.visibility }).in('id', slice);
            onStepProgress(Math.min(i + slice.length, targetIds.length));
          }
          if (routeIds.length > 0) {
            await supabase.from('routes').update({ visibility: catalogOptions.visibility }).in('id', routeIds);
          }
          const idsToApprove = targetIds.filter(id => {
            const loc = locations.find(l => l.id === id);
            return loc && !loc.is_approved;
          });
          if (idsToApprove.length > 0) await handleApprove(idsToApprove, true);
          await supabase.from('documents').update({ status: 'published' }).eq('id', docId);
          setDocStatus('published');
          if (catalogOptions.autoEnrich && targetIds.length > 0) {
            try {
              await supabase.functions.invoke('batch-enrich', {
                body: { action: 'start', documentId: docId, locationIds: targetIds },
              });
            } catch { /* ignore */ }
          }
          onStepProgress(targetIds.length);
        } else if (m === 'itinerary') {
          const name = itineraryName.trim() || docName;
          const { data: existingLocs } = await supabase
            .from('locations').select('id, name, latitude, longitude')
            .eq('is_approved', true).is('deleted_at', null).neq('document_id', docId).limit(5000);
          const existing = existingLocs || [];
          const { data: newRoute, error: routeError } = await supabase
            .from('routes')
            .insert({
              name, user_id: userId, transport_mode: 'multimodal', status: 'draft',
              visibility: catalogOptions.visibility,
              route_preferences: { documentId: docId, documentName: docName, isItinerary: true } as any,
            })
            .select('id').single();
          if (routeError) throw routeError;
          const waypoints = locations.map((loc, idx) => {
            const catalogMatch = findCatalogMatch(loc, existing, 250);
            return {
              route_id: newRoute.id,
              position: idx,
              name: loc.name,
              latitude: loc.latitude,
              longitude: loc.longitude,
              location_id: catalogMatch?.id || loc.id,
              transport_mode: 'driving' as const,
            };
          });
          const CHUNK_W = 100;
          for (let i = 0; i < waypoints.length; i += CHUNK_W) {
            const slice = waypoints.slice(i, i + CHUNK_W);
            await supabase.from('route_waypoints').insert(slice);
            onStepProgress(Math.min(i + slice.length, waypoints.length));
          }
          onStepProgress(waypoints.length);
          // Auto-delete itinerary if it ended up with <2 waypoints (transversal rule)
          {
            const { autoDeleteIfEmptyRoute } = await import('@/domains/content/lib/auto-delete-empty');
            await autoDeleteIfEmptyRoute(newRoute.id);
          }
        } else if (m === 'collection') {
          const { applyCollection } = await import('@/services/document-add.service');
          const res = await applyCollection({
            docId, userId,
            scope: catalogOptions.scope,
            selectedIds: Array.from(selectedIds),
            collectionId: collectionId === '__new__' ? null : collectionId,
            newCollection: collectionId === '__new__'
              ? { name: newCollectionName.trim() || docName, icon: 'folder', color: '#6b7280', visibility: catalogOptions.visibility }
              : undefined,
            onProgress: (processed) => onStepProgress(processed),
          });
          onStepProgress(res?.added ?? stepTotal);
        } else if (m === 'route') {
          const { applyRoute } = await import('@/services/document-add.service');
          const res = await applyRoute({
            docId, userId,
            scope: catalogOptions.scope,
            selectedIds: Array.from(selectedIds),
            routeId: targetRouteId,
            onProgress: (processed) => onStepProgress(processed),
          });
          onStepProgress(res?.added ?? stepTotal);
        } else if (m === 'tag') {
          const { applyTag } = await import('@/services/document-add.service');
          const res = await applyTag({
            docId, userId,
            scope: catalogOptions.scope,
            selectedIds: Array.from(selectedIds),
            tags: effectiveTagList,
            onProgress: (processed) => onStepProgress(processed),
          });
          onStepProgress(res?.total ?? stepTotal);
        }
        // Refresh inmediato tras cada paso exitoso
        for (const evt of eventsFor[m]) {
          window.dispatchEvent(new CustomEvent(evt));
        }
        results.push({ mode: m, ok: true });
        setPublishProgress({ current: stepIdx + 1, total: selected.length, label: labels[m] });
        setPointProgress({ current: stepTotal, total: stepTotal });
      } catch (e: any) {
        console.error(`[handleApplyAll] step "${m}" failed:`, e);
        results.push({ mode: m, ok: false, error: e?.message || 'error' });
      }
    }

    // ---- Reporte final ----
    const okCount = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok);
    if (failed.length === 0) {
      toast.success(`Aplicadas ${okCount} acción${okCount === 1 ? '' : 'es'}`);
      setShowCatalogDialog(false);
      setCatalogPreview(null);
      setSelectedIds(new Set());
      setSelectedRouteIds(new Set());
      setTagList([]);
      setTagInput('');
      // Volver a la vista general tras éxito completo
      setTimeout(() => onBack(), 150);
    } else if (okCount > 0) {
      toast.warning(
        `Completadas ${okCount} de ${results.length}. Falló: ${failed.map(f => labels[f.mode]).join(', ')}`,
      );
    } else {
      toast.error(`Error: ${failed.map(f => `${labels[f.mode]} (${f.error})`).join(' · ')}`);
    }
    setPublishing(false);
    setPublishProgress(null);
    setPointProgress(null);
  };

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
      window.dispatchEvent(new CustomEvent('locations-updated'));
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

      // 3. Create waypoints for each location — link to the location's own ID
      //    (waypoints already exist as location records in this document)
      const waypoints = locations.map((loc, idx) => {
        // First try to match against external catalog
        const catalogMatch = findCatalogMatch(loc, existing, THRESHOLD);
        return {
          route_id: routeId,
          position: idx,
          name: loc.name,
          latitude: loc.latitude,
          longitude: loc.longitude,
          // Link to the external catalog match if found, otherwise link to this document's own location
          location_id: catalogMatch?.id || loc.id,
          transport_mode: 'driving' as const,
          _original: loc,
        };
      });

      // Collect all linked location IDs for enrichment
      const allLocationIds: string[] = [];
      for (const wp of waypoints) {
        if (wp.location_id && !allLocationIds.includes(wp.location_id)) {
          allLocationIds.push(wp.location_id);
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
          mismatch={nearbyMismatch}
          onClose={() => { setNearbyLocation(null); setNearbyMismatch(null); }}
          onLocationUpdated={(updated) => {
            setLocations(prev => prev.map(l => l.id === updated.id ? updated : l));
          }}
          onLocationMerged={(_mergedIntoId, removedId) => {
            setLocations(prev => prev.filter(l => l.id !== removedId));
            setNearbyLocation(null);
            setNearbyMismatch(null);
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

      {/* Waypoints + Routes — 4 tabs (norma mem://ui/document-view-tabs) */}
      {loading ? (
        <div className="flex flex-col items-center justify-center flex-1 py-12 gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Cargando puntos...</span>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          <DocumentWaypointsTabs
            locations={locations}
            routes={routes}
            selectedIds={selectedIds}
            selectedRouteIds={selectedRouteIds}
            focusedId={focusedId}
            highlightedRouteId={highlightedRouteId}
            onToggleSelect={toggleSelect}
            onToggleRouteSelect={toggleRouteSelect}
            onHighlight={handleHighlight}
            onOpenNearby={(loc) => setNearbyLocation(loc)}
            onEditRoute={(id) => setEditingRouteId(id)}
          />
        </div>
      )}

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
      <Dialog
        open={showCatalogDialog}
        onOpenChange={(open) => {
          // Mientras se está publicando, ignorar intentos de cerrar
          if (publishing && !open) return;
          setShowCatalogDialog(open);
        }}
      >
        <DialogContent
          className={cn(
            "left-1/2 top-1/2 w-[min(32rem,calc(100vw-2rem))] max-w-none max-h-[90vh] -translate-x-1/2 -translate-y-1/2",
            publishing ? "overflow-hidden" : "overflow-y-auto"
          )}
          onPointerDownOutside={(e) => { if (publishing) e.preventDefault(); }}
          onEscapeKeyDown={(e) => { if (publishing) e.preventDefault(); }}
          onInteractOutside={(e) => { if (publishing) e.preventDefault(); }}
        >
          {/* Overlay bloqueante con progreso durante la cadena.
              absolute + inset-0 cubre todo el DialogContent independientemente
              del scroll, asegurando que ningún control quede accesible. */}
          {publishing && (
            <div
              className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background/95 backdrop-blur-sm rounded-lg px-8"
            >
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <div className="text-sm font-medium text-center">
                {publishProgress
                  ? `Aplicando ${publishProgress.label} (${publishProgress.current}/${publishProgress.total})`
                  : 'Procesando…'}
              </div>
              {pointProgress && pointProgress.total > 0 && (
                <div className="w-full max-w-xs space-y-1.5">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-[width] duration-200 ease-out"
                      style={{
                        width: `${Math.min(100, Math.round((pointProgress.current / pointProgress.total) * 100))}%`,
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{pointProgress.current} / {pointProgress.total} puntos</span>
                    <span>{Math.min(100, Math.round((pointProgress.current / pointProgress.total) * 100))}%</span>
                  </div>
                </div>
              )}
              <div className="text-[11px] text-muted-foreground">No cierres esta ventana</div>
            </div>
          )}
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Añadir
            </DialogTitle>
            <DialogDescription>
              Elige cómo incorporar los puntos de "{docName}".
            </DialogDescription>
          </DialogHeader>

          <div className={cn("space-y-4 py-2", publishing && "pointer-events-none opacity-60")}>
            {/* ── 1. RESUMEN + VISIBILIDAD (siempre arriba) ── */}
            <div className="rounded-md border bg-muted/40 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-medium">
                  <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                  Puntos a importar
                </span>
                <span className="font-semibold text-sm text-emerald-600">
                  {catalogPreview?.toAdd.length ?? (
                    catalogOptions.scope === 'selected' ? selectedIds.size :
                    catalogOptions.scope === 'approved' ? approvedCount : locations.length
                  )}
                </span>
              </div>

              {catalogPreview && catalogPreview.skippedDuplicates > 0 && (
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1.5 text-[11px] text-blue-600 dark:text-blue-400">
                    <Check className="w-3 h-3" />
                    Coincidentes con catálogo
                  </span>
                  <span className="font-medium text-[11px] text-blue-600 dark:text-blue-400">{catalogPreview.skippedDuplicates}</span>
                </div>
              )}

              <Separator />

              <div className="space-y-2">
                <Label className="text-xs font-medium">Visibilidad</Label>
                <RadioGroup
                  value={catalogOptions.visibility}
                  onValueChange={(v) => setCatalogOptions(prev => ({ ...prev, visibility: v as any }))}
                  className="grid grid-cols-3 gap-2"
                >
                  <Label
                    htmlFor="vis-public"
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-md border p-2 cursor-pointer text-[11px]",
                      catalogOptions.visibility === 'public' ? "border-primary bg-primary/5" : "border-border"
                    )}
                  >
                    <RadioGroupItem value="public" id="vis-public" className="sr-only" />
                    <Eye className="w-3.5 h-3.5" />
                    Público
                  </Label>
                  <Label
                    htmlFor="vis-followers"
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-md border p-2 cursor-pointer text-[11px]",
                      catalogOptions.visibility === 'followers' ? "border-primary bg-primary/5" : "border-border"
                    )}
                  >
                    <RadioGroupItem value="followers" id="vis-followers" className="sr-only" />
                    <Users className="w-3.5 h-3.5" />
                    Seguidores
                  </Label>
                  <Label
                    htmlFor="vis-private"
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-md border p-2 cursor-pointer text-[11px]",
                      catalogOptions.visibility === 'private' ? "border-primary bg-primary/5" : "border-border"
                    )}
                  >
                    <RadioGroupItem value="private" id="vis-private" className="sr-only" />
                    <Lock className="w-3.5 h-3.5" />
                    Privado
                  </Label>
                </RadioGroup>
              </div>
            </div>

            {/* ── 2. ¿CÓMO AÑADIR? — Secciones en orden: Catálogo → Itinerario → Colección → Ruta → Etiquetas ── */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">¿Cómo añadir?</Label>
              <p className="text-[10px] text-muted-foreground">
                Puedes combinar varias acciones; se aplicarán en cadena.
              </p>
            </div>

            {/* 2.a — Al catálogo general */}
            <div className={cn("space-y-1 rounded-md border p-3", addModes.has('catalog') ? "border-border bg-muted/30" : "border-transparent")}>
              <div className="flex items-center gap-2">
                <Checkbox id="mode-catalog" checked={addModes.has('catalog')} onCheckedChange={() => toggleAddMode('catalog')} />
                <Label htmlFor="mode-catalog" className="text-xs cursor-pointer flex items-center gap-1.5">
                  <MapPin className="w-3 h-3" /> Al catálogo general
                </Label>
              </div>
              <p className="text-[10px] text-muted-foreground ml-6">
                Los puntos se integran como ubicaciones permanentes del catálogo.
              </p>
              {addModes.has('catalog') && routes.length > 0 && (
                <div className="ml-6 mt-3 space-y-2 border-l-2 border-border pl-3">
                  <Label className="text-xs font-medium">¿Qué rutas incorporar?</Label>
                  <RadioGroup
                    value={catalogOptions.routeScope}
                    onValueChange={(v) => setCatalogOptions(prev => ({ ...prev, routeScope: v as any }))}
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="all" id="route-all" />
                      <Label htmlFor="route-all" className="text-xs cursor-pointer">Todas las rutas ({routes.length})</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="selected" id="route-selected" />
                      <Label htmlFor="route-selected" className="text-xs cursor-pointer">Solo seleccionadas ({selectedRouteIds.size})</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="none" id="route-none" />
                      <Label htmlFor="route-none" className="text-xs cursor-pointer">Ninguna</Label>
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
              )}
            </div>

            {/* 2.b — Como nuevo itinerario */}
            <div className={cn("space-y-1 rounded-md border p-3", addModes.has('itinerary') ? "border-border bg-muted/30" : "border-transparent")}>
              <div className="flex items-center gap-2">
                <Checkbox id="mode-itinerary" checked={addModes.has('itinerary')} onCheckedChange={() => toggleAddMode('itinerary')} />
                <Label htmlFor="mode-itinerary" className="text-xs cursor-pointer flex items-center gap-1.5">
                  <RouteIcon className="w-3 h-3" /> Como nuevo itinerario
                </Label>
              </div>
              <p className="text-[10px] text-muted-foreground ml-6">
                Crea un itinerario con los puntos como paradas.
              </p>
              {addModes.has('itinerary') && (
                <div className="ml-6 mt-3 space-y-3 border-l-2 border-border pl-3">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Nombre del itinerario</Label>
                    <Input
                      value={itineraryName}
                      onChange={e => setItineraryName(e.target.value)}
                      placeholder={docName}
                      className="h-8 text-sm"
                    />
                  </div>
                  {itineraryPreview && !itineraryPreview.loading && (
                    <div className="space-y-0.5 text-[11px]">
                      {itineraryPreview.linkedCount > 0 && (
                        <div className="flex justify-between">
                          <span className="text-emerald-600 dark:text-emerald-400">Ya en catálogo</span>
                          <span className="font-medium text-emerald-600 dark:text-emerald-400">{itineraryPreview.linkedCount}</span>
                        </div>
                      )}
                      {itineraryPreview.newCount > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Nuevos (solo en itinerario)</span>
                          <span className="font-medium text-muted-foreground">{itineraryPreview.newCount}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 2.c — A una colección */}
            <div className={cn("space-y-1 rounded-md border p-3", addModes.has('collection') ? "border-border bg-muted/30" : "border-transparent")}>
              <div className="flex items-center gap-2">
                <Checkbox id="mode-collection" checked={addModes.has('collection')} onCheckedChange={() => toggleAddMode('collection')} />
                <Label htmlFor="mode-collection" className="text-xs cursor-pointer flex items-center gap-1.5">
                  <Folder className="w-3 h-3" /> A una colección (carpeta)
                </Label>
              </div>
              <p className="text-[10px] text-muted-foreground ml-6">
                Agrupa los puntos en una colección personal existente o crea una nueva.
              </p>
              {addModes.has('collection') && (
                <div className="ml-6 mt-3 space-y-3 border-l-2 border-border pl-3">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Colección destino</Label>
                    <select
                      className="w-full h-9 text-xs rounded-md border bg-background px-2"
                      value={collectionId}
                      onChange={(e) => setCollectionId(e.target.value)}
                    >
                      <option value="__new__">+ Crear nueva colección…</option>
                      {userCollections.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  {collectionId === '__new__' && (
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Nombre de la colección</Label>
                      <Input
                        value={newCollectionName}
                        onChange={(e) => setNewCollectionName(e.target.value)}
                        placeholder={docName}
                        className="h-8 text-sm"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 2.d — A una ruta existente */}
            <div className={cn("space-y-1 rounded-md border p-3", addModes.has('route') ? "border-border bg-muted/30" : "border-transparent")}>
              <div className="flex items-center gap-2">
                <Checkbox id="mode-route" checked={addModes.has('route')} onCheckedChange={() => toggleAddMode('route')} />
                <Label htmlFor="mode-route" className="text-xs cursor-pointer flex items-center gap-1.5">
                  <RouteIcon className="w-3 h-3" /> A una ruta existente
                </Label>
              </div>
              <p className="text-[10px] text-muted-foreground ml-6">
                Añade los puntos como paradas al final de una ruta que ya tienes.
              </p>
              {addModes.has('route') && (
                <div className="ml-6 mt-3 space-y-2 border-l-2 border-border pl-3">
                  <Label className="text-xs font-medium">Ruta destino</Label>
                  {userRoutes.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No tienes rutas. Crea una primero o usa "Como nuevo itinerario".</p>
                  ) : (
                    <select
                      className="w-full h-9 text-xs rounded-md border bg-background px-2"
                      value={targetRouteId}
                      onChange={(e) => setTargetRouteId(e.target.value)}
                    >
                      {userRoutes.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>

            {/* 2.e — Asignar etiquetas */}
            <div className={cn("space-y-1 rounded-md border p-3", addModes.has('tag') ? "border-border bg-muted/30" : "border-transparent")}>
              <div className="flex items-center gap-2">
                <Checkbox id="mode-tag" checked={addModes.has('tag')} onCheckedChange={() => toggleAddMode('tag')} />
                <Label htmlFor="mode-tag" className="text-xs cursor-pointer flex items-center gap-1.5">
                  <TagIcon className="w-3 h-3" /> Asignar etiquetas
                </Label>
              </div>
              <p className="text-[10px] text-muted-foreground ml-6">
                Añade etiquetas personalizadas a los puntos (no afecta a su publicación).
              </p>
              {addModes.has('tag') && (
                <div className="ml-6 mt-3 space-y-2 border-l-2 border-border pl-3">
                  <Label className="text-xs font-medium">Etiquetas</Label>
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        const t = tagInput.trim().replace(/^#/, '');
                        if (t && !tagList.includes(t)) setTagList([...tagList, t]);
                        setTagInput('');
                      }
                    }}
                    placeholder="Escribe una etiqueta y pulsa Enter"
                    className="h-8 text-sm"
                  />
                  {tagList.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {tagList.map((t) => (
                        <Badge key={t} variant="secondary" className="gap-1">
                          #{t}
                          <button
                            type="button"
                            onClick={() => setTagList(tagList.filter((x) => x !== t))}
                            className="hover:text-destructive"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── 3. ENRIQUECER CON IA (al final) ── */}
            <Separator />
            <div className="flex items-center justify-between rounded-md border bg-muted/30 p-3">
              <div className="space-y-0.5">
                <Label className="text-xs font-medium cursor-pointer flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  Enriquecer con IA
                </Label>
                <p className="text-[10px] text-muted-foreground">
                  Genera descripción y datos clave para los puntos nuevos.
                </p>
              </div>
              <Switch
                checked={catalogOptions.autoEnrich}
                onCheckedChange={(v) => setCatalogOptions(prev => ({ ...prev, autoEnrich: v }))}
              />
            </div>

            {/* Ámbito (oculto avanzado: solo aparece si hay selección parcial o aprobados parciales) */}
            {(selectedIds.size > 0 || (approvedCount > 0 && approvedCount < locations.length)) && (
              <details className="rounded-md border border-dashed p-2.5">
                <summary className="text-[11px] text-muted-foreground cursor-pointer">
                  Avanzado: ¿a qué puntos aplicar?
                </summary>
                <div className="mt-2">
                  <RadioGroup
                    value={catalogOptions.scope}
                    onValueChange={(v) => setCatalogOptions((p) => ({ ...p, scope: v as any }))}
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="all" id="alt-scope-all" />
                      <Label htmlFor="alt-scope-all" className="text-xs cursor-pointer">
                        Todos los puntos ({locations.length})
                      </Label>
                    </div>
                    {selectedIds.size > 0 && (
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="selected" id="alt-scope-sel" />
                        <Label htmlFor="alt-scope-sel" className="text-xs cursor-pointer">
                          Solo seleccionados ({selectedIds.size})
                        </Label>
                      </div>
                    )}
                    {approvedCount > 0 && (
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="approved" id="alt-scope-approved" />
                        <Label htmlFor="alt-scope-approved" className="text-xs cursor-pointer">
                          Solo los ya aprobados ({approvedCount})
                        </Label>
                      </div>
                    )}
                  </RadioGroup>
                </div>
              </details>
            )}

          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setShowCatalogDialog(false); setCatalogPreview(null); }}>
              Cancelar
            </Button>
            {(() => {
              // Single-mode → keep the bespoke button (preserves existing labels & disabled rules).
              if (addModes.size === 1) {
                if (addModes.has('catalog')) {
                  return (
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
                  );
                }
                if (addModes.has('itinerary')) {
                  return (
                    <Button size="sm" onClick={handleAddAsItinerary} disabled={publishing || locations.length === 0} className="gap-1">
                      {publishing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RouteIcon className="w-3 h-3" />}
                      Crear itinerario ({locations.length} paradas)
                    </Button>
                  );
                }
                if (addModes.has('collection')) {
                  return (
                    <Button size="sm" onClick={handleAddToCollection} disabled={publishing} className="gap-1">
                      {publishing ? <Loader2 className="w-3 h-3 animate-spin" /> : <FolderPlus className="w-3 h-3" />}
                      Añadir a colección
                    </Button>
                  );
                }
                if (addModes.has('route')) {
                  return (
                    <Button size="sm" onClick={handleAddToRoute} disabled={publishing || !targetRouteId} className="gap-1">
                      {publishing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RouteIcon className="w-3 h-3" />}
                      Añadir a ruta
                    </Button>
                  );
                }
                if (addModes.has('tag')) {
                  return (
                    <Button size="sm" onClick={handleApplyTags} disabled={publishing || tagList.length === 0} className="gap-1">
                      {publishing ? <Loader2 className="w-3 h-3 animate-spin" /> : <TagIcon className="w-3 h-3" />}
                      Aplicar etiquetas
                    </Button>
                  );
                }
              }
              // Multi-mode → single chained "Aplicar" button.
              return (
                <Button size="sm" onClick={handleApplyAll} disabled={publishing} className="gap-1">
                  {publishing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  Aplicar {addModes.size} acciones
                </Button>
              );
            })()}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
