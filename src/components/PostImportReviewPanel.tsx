import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Sparkles, Tag, SkipForward, MapPin, CheckCircle, ChevronDown, ChevronUp,
  Navigation, Plus, Save, X, Ruler, Search,
} from 'lucide-react';
import { renderLineIcon } from '@/lib/icon-utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useLocationsStore } from '@/store/locations-store';
import { calculateDistance, formatDistance } from '@/lib/duplicate-detection';
import { GeoLocation } from '@/types/location';
import { toast } from 'sonner';

/** Data passed when the panel opens after import */
export interface PostImportReviewData {
  documentId: string;
  newPointIds: string[];
  matchingPointIds: string[];
  defaultAction: 'enrich' | 'category' | 'skip';
  defaultCategory?: string;
  defaultCategoryIcon?: string;
  defaultCategoryColor?: string;
}

interface PersonalCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
}

const ICON_OPTIONS: { key: string; label: string }[] = [
  { key: 'map-pin', label: 'Marcador' },
  { key: 'mountain', label: 'Montaña' },
  { key: 'tent', label: 'Camping' },
  { key: 'home', label: 'Alojamiento' },
  { key: 'utensils', label: 'Comida' },
  { key: 'coffee', label: 'Café' },
  { key: 'camera', label: 'Mirador' },
  { key: 'star', label: 'Favorito' },
  { key: 'heart', label: 'Especial' },
  { key: 'anchor', label: 'Puerto' },
  { key: 'landmark', label: 'Monumento' },
  { key: 'church', label: 'Religioso' },
  { key: 'castle', label: 'Castillo' },
  { key: 'tree-pine', label: 'Naturaleza' },
  { key: 'fish', label: 'Pesca' },
  { key: 'waves', label: 'Playa' },
  { key: 'droplets', label: 'Agua' },
  { key: 'fuel', label: 'Gasolinera' },
  { key: 'shopping-cart', label: 'Compras' },
  { key: 'target', label: 'Objetivo' },
  { key: 'flag', label: 'Hito' },
  { key: 'compass', label: 'Explorar' },
  { key: 'music', label: 'Música' },
  { key: 'gem', label: 'Joya' },
];

const COLOR_OPTIONS: { hex: string; label: string }[] = [
  { hex: '#22c55e', label: 'Verde' },
  { hex: '#3b82f6', label: 'Azul' },
  { hex: '#06b6d4', label: 'Cian' },
  { hex: '#14b8a6', label: 'Teal' },
  { hex: '#84cc16', label: 'Lima' },
  { hex: '#f59e0b', label: 'Ámbar' },
  { hex: '#f97316', label: 'Naranja' },
  { hex: '#ef4444', label: 'Rojo' },
  { hex: '#ec4899', label: 'Rosa' },
  { hex: '#8b5cf6', label: 'Violeta' },
  { hex: '#6b7280', label: 'Gris' },
  { hex: '#64748b', label: 'Pizarra' },
];

type PointAction = 'enrich' | 'category' | 'skip';

interface PointDecision {
  action: PointAction;
  categoryId?: string;
  categoryName?: string;
  categoryIcon?: string;
  categoryColor?: string;
}

interface NearbyPoint {
  location: GeoLocation;
  distance: number;
  category: string;
  interestIndex?: number;
  description?: string;
  isEnriched: boolean;
}

interface PostImportReviewPanelProps {
  data: PostImportReviewData;
  onClose: () => void;
}

export function PostImportReviewPanel({ data, onClose }: PostImportReviewPanelProps) {
  const { user } = useAuth();
  const documents = useLocationsStore(state => state.documents);
  const setFocusedLocation = useLocationsStore(state => state.setFocusedLocation);

  // Configurable search radius (meters)
  const [searchRadius, setSearchRadius] = useState(1000);

  // Personal categories from DB
  const [categories, setCategories] = useState<PersonalCategory[]>([]);
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('map-pin');
  const [newCatColor, setNewCatColor] = useState('#6b7280');
  const [savingCategory, setSavingCategory] = useState(false);

  // Load personal categories
  const loadCategories = useCallback(async () => {
    if (!user) return;
    const { data: cats } = await supabase
      .from('personal_categories')
      .select('id, name, icon, color')
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true });
    setCategories(cats || []);
  }, [user]);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  // All existing locations (excluding the imported document entirely)
  const existingLocations = useMemo(() => {
    const importedIds = new Set([...data.newPointIds, ...data.matchingPointIds]);
    return documents.flatMap(doc => {
      // Skip the document being imported to avoid self-matches
      if (doc.id === data.documentId) {
        return doc.locations.filter(loc => !importedIds.has(loc.id) && loc.placeType !== 'route');
      }
      return doc.locations.filter(loc => loc.placeType !== 'route');
    });
  }, [documents, data.documentId, data.newPointIds, data.matchingPointIds]);

  // Resolve new points from the store
  const newPoints = useMemo(() => {
    const idSet = new Set(data.newPointIds);
    for (const doc of documents) {
      const found = doc.locations.filter(loc => idSet.has(loc.id));
      if (found.length > 0) return found;
    }
    return [];
  }, [documents, data.newPointIds]);

  // Per-point decisions
  const [decisions, setDecisions] = useState<Record<string, PointDecision>>(() => {
    const init: Record<string, PointDecision> = {};
    for (const id of data.newPointIds) {
      init[id] = {
        action: data.defaultAction,
        categoryName: data.defaultCategory,
        categoryIcon: data.defaultCategoryIcon,
        categoryColor: data.defaultCategoryColor,
      };
    }
    return init;
  });

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Nearby points — query DB directly to avoid tiered-loading gaps
  const [nearbyPoints, setNearbyPoints] = useState<NearbyPoint[]>([]);
  const [loadingNearby, setLoadingNearby] = useState(false);

  useEffect(() => {
    if (!expandedId) { setNearbyPoints([]); return; }
    const point = newPoints.find(p => p.id === expandedId);
    if (!point) { setNearbyPoints([]); return; }

    let cancelled = false;
    const fetchNearby = async () => {
      setLoadingNearby(true);
      try {
        // Convert radius to rough lat/lng delta for bounding box (1° ≈ 111 km)
        const delta = (searchRadius / 1000) / 111;
        const lat = point.coordinates.lat;
        const lng = point.coordinates.lng;

        const { data: rows } = await supabase
          .from('locations')
          .select('id, name, latitude, longitude, description, enriched_data, place_type, enrichment_status')
          .gte('latitude', lat - delta)
          .lte('latitude', lat + delta)
          .gte('longitude', lng - delta)
          .lte('longitude', lng + delta)
          .is('deleted_at', null)
          .limit(50);

        if (cancelled) return;

        const importedIds = new Set([...data.newPointIds, ...data.matchingPointIds]);
        const nearby: NearbyPoint[] = [];

        for (const row of rows || []) {
          if (importedIds.has(row.id)) continue;
          const dist = calculateDistance(lat, lng, row.latitude, row.longitude);
          if (dist > searchRadius) continue;

          const enriched = row.enriched_data as Record<string, any> | null;
          nearby.push({
            location: {
              id: row.id,
              name: row.name,
              coordinates: { lat: row.latitude, lng: row.longitude },
              description: row.description || undefined,
              enrichedData: enriched as any,
              placeType: row.place_type as any,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            distance: dist,
            category: enriched?.clasificacion?.categoria_principal || row.place_type || 'Punto',
            interestIndex: enriched?.indice_interes ? Number(enriched.indice_interes) : undefined,
            description: enriched?.descripcion_corta || enriched?.descripcion?.substring(0, 80) || row.description?.substring(0, 80),
            isEnriched: !!enriched?.descripcion,
          });
        }

        nearby.sort((a, b) => {
          if (a.isEnriched !== b.isEnriched) return a.isEnriched ? -1 : 1;
          if ((a.interestIndex ?? 0) !== (b.interestIndex ?? 0)) return (b.interestIndex ?? 0) - (a.interestIndex ?? 0);
          return a.distance - b.distance;
        });

        setNearbyPoints(nearby.slice(0, 10));
      } catch (e) {
        console.error('Error fetching nearby points:', e);
        setNearbyPoints([]);
      } finally {
        if (!cancelled) setLoadingNearby(false);
      }
    };

    fetchNearby();
    return () => { cancelled = true; };
  }, [expandedId, newPoints, searchRadius, data.newPointIds, data.matchingPointIds]);

  // Focus on map when expanding a point
  useEffect(() => {
    if (expandedId) {
      setFocusedLocation(expandedId);
    }
  }, [expandedId, setFocusedLocation]);

  const updateDecision = useCallback((id: string, patch: Partial<PointDecision>) => {
    setDecisions(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  const setCategoryForPoint = useCallback((id: string, cat: PersonalCategory) => {
    updateDecision(id, {
      action: 'category',
      categoryId: cat.id,
      categoryName: cat.name,
      categoryIcon: cat.icon,
      categoryColor: cat.color,
    });
  }, [updateDecision]);

  const setBulkAction = useCallback((action: PointAction) => {
    setDecisions(prev => {
      const next = { ...prev };
      for (const id of data.newPointIds) {
        next[id] = { ...next[id], action };
      }
      return next;
    });
  }, [data.newPointIds]);

  const summary = useMemo(() => {
    let enrich = 0, category = 0, skip = 0;
    for (const id of data.newPointIds) {
      const d = decisions[id];
      if (d?.action === 'enrich') enrich++;
      else if (d?.action === 'category') category++;
      else skip++;
    }
    return { enrich, category, skip };
  }, [decisions, data.newPointIds]);

  // Create new personal category
  const handleCreateCategory = useCallback(async () => {
    if (!user || !newCatName.trim()) return;
    setSavingCategory(true);
    try {
      const { data: created, error } = await supabase
        .from('personal_categories')
        .insert({
          user_id: user.id,
          name: newCatName.trim(),
          icon: newCatIcon,
          color: newCatColor,
        })
        .select('id, name, icon, color')
        .single();

      if (error) throw error;
      if (created) {
        setCategories(prev => [...prev, created]);
        toast.success(`Categoría "${created.name}" creada`);
        setNewCatName('');
        setNewCatIcon('map-pin');
        setNewCatColor('#6b7280');
        setShowCreateCategory(false);
      }
    } catch (e) {
      console.error(e);
      toast.error('Error al crear la categoría');
    } finally {
      setSavingCategory(false);
    }
  }, [user, newCatName, newCatIcon, newCatColor]);

  const handleConfirm = useCallback(async () => {
    if (!user) return;
    setIsProcessing(true);
    try {
      const enrichIds: string[] = [];
      const categoryAssignments: Record<string, string[]> = {}; // categoryId → locationIds

      for (const [id, dec] of Object.entries(decisions)) {
        if (dec.action === 'enrich') {
          enrichIds.push(id);
        } else if (dec.action === 'category' && dec.categoryId) {
          if (!categoryAssignments[dec.categoryId]) categoryAssignments[dec.categoryId] = [];
          categoryAssignments[dec.categoryId].push(id);
        } else if (dec.action === 'category' && dec.categoryName && !dec.categoryId) {
          // Category by name (predefined but not yet in DB) — create it
          const { data: existingCat } = await supabase
            .from('personal_categories')
            .select('id')
            .eq('user_id', user.id)
            .eq('name', dec.categoryName)
            .maybeSingle();
          let catId = existingCat?.id;
          if (!catId) {
            const { data: newCat } = await supabase
              .from('personal_categories')
              .insert({ user_id: user.id, name: dec.categoryName, icon: dec.categoryIcon || 'map-pin', color: dec.categoryColor || '#64748b' })
              .select('id')
              .single();
            catId = newCat?.id;
          }
          if (catId) {
            if (!categoryAssignments[catId]) categoryAssignments[catId] = [];
            categoryAssignments[catId].push(id);
          }
        }
      }

      // Batch-enrich
      if (enrichIds.length > 0) {
        const { error } = await supabase.functions.invoke('batch-enrich', {
          body: { action: 'start', documentId: data.documentId, locationIds: enrichIds },
        });
        if (error) {
          toast.error('No se pudo iniciar el enriquecimiento');
        } else {
          toast.success(`Enriqueciendo ${enrichIds.length} puntos...`);
        }
      }

      // Assign categories
      for (const [catId, ids] of Object.entries(categoryAssignments)) {
        await supabase.from('locations').update({ personal_category_id: catId }).in('id', ids);
      }

      toast.success('Revisión completada');
      onClose();
    } catch (e) {
      console.error('Post-import review error:', e);
      toast.error('Error al procesar la revisión');
    } finally {
      setIsProcessing(false);
    }
  }, [user, decisions, data.documentId, onClose]);

  if (newPoints.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        No hay puntos nuevos para revisar.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-h-[70vh]">
      {/* Header */}
      <div className="p-3 space-y-2 border-b">
        <p className="text-sm text-muted-foreground">
          {newPoints.length} puntos nuevos. Selecciona uno para ver el entorno y decidir.
        </p>
        {data.matchingPointIds.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-500/10 rounded-md px-2 py-1">
            <CheckCircle className="w-3.5 h-3.5 shrink-0" />
            {data.matchingPointIds.length} coincidentes se enriquecen automáticamente
          </div>
        )}

        {/* Search radius */}
        <div className="flex items-center gap-2">
          <Ruler className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground whitespace-nowrap">Radio:</span>
          <Slider
            value={[searchRadius]}
            onValueChange={([v]) => setSearchRadius(v)}
            min={100} max={2000} step={100}
            className="flex-1"
          />
          <span className="text-xs font-medium w-12 text-right">{searchRadius}m</span>
        </div>

        {/* Bulk actions */}
        <div className="flex gap-1.5">
          <Button
            variant={summary.enrich === newPoints.length ? 'default' : 'outline'}
            size="sm" className="text-xs flex-1"
            onClick={() => setBulkAction('enrich')}
          >
            <Sparkles className="w-3 h-3 mr-1" /> Todos IA
          </Button>
          <Button
            variant={summary.skip === newPoints.length ? 'default' : 'outline'}
            size="sm" className="text-xs flex-1"
            onClick={() => setBulkAction('skip')}
          >
            <SkipForward className="w-3 h-3 mr-1" /> Ninguno
          </Button>
        </div>
      </div>

      {/* Point list */}
      <ScrollArea className="flex-1">
        <div className="divide-y">
          {newPoints.map(point => {
            const dec = decisions[point.id];
            const isExpanded = expandedId === point.id;

            return (
              <div key={point.id} className={cn('px-3 py-2', isExpanded && 'bg-muted/30')}>
                <button
                  type="button"
                  className="flex items-center gap-2 w-full text-left"
                  onClick={() => setExpandedId(isExpanded ? null : point.id)}
                >
                  <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-sm font-medium truncate flex-1">{point.name}</span>
                  <Badge variant="outline" className={cn(
                    'text-[10px] shrink-0',
                    dec?.action === 'enrich' && 'bg-primary/10 text-primary border-primary/30',
                    dec?.action === 'category' && 'bg-accent/50 text-accent-foreground border-accent',
                    dec?.action === 'skip' && 'bg-muted text-muted-foreground',
                  )}>
                    {dec?.action === 'enrich' ? 'IA' : dec?.action === 'category' ? (dec.categoryName || 'Cat.') : 'Sin acción'}
                  </Badge>
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                </button>

                {isExpanded && (
                  <div className="mt-2 ml-5 space-y-3">
                    {point.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{point.description}</p>
                    )}

                    {/* Nearby existing points */}
                    {nearbyPoints.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                          <Navigation className="w-3 h-3" />
                          {nearbyPoints.length} punto{nearbyPoints.length > 1 ? 's' : ''} de interés ({formatDistance(searchRadius)})
                        </p>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {nearbyPoints.map(np => (
                            <button
                              key={np.location.id}
                              type="button"
                              className="flex items-start gap-1.5 w-full text-left px-1.5 py-1.5 rounded hover:bg-muted/50 transition-colors"
                              onClick={() => setFocusedLocation(np.location.id)}
                            >
                              <MapPin className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1">
                                  <span className="text-xs font-medium truncate">{np.location.name}</span>
                                  {np.isEnriched && (
                                    <Sparkles className="w-2.5 h-2.5 text-primary shrink-0" />
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <Badge variant="outline" className="text-[9px] h-4 px-1">{np.category}</Badge>
                                  {np.interestIndex != null && (
                                    <span className="text-[9px] text-muted-foreground">{np.interestIndex}/10</span>
                                  )}
                                </div>
                                {np.description && (
                                  <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">{np.description}</p>
                                )}
                              </div>
                              <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">{formatDistance(np.distance)}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {nearbyPoints.length === 0 && (
                      <p className="text-[10px] text-muted-foreground italic">
                        Sin puntos de interés en {formatDistance(searchRadius)} · {existingLocations.length} puntos totales cargados
                      </p>
                    )}

                    <Separator />

                    {/* Action buttons */}
                    <div className="flex gap-1.5 flex-wrap">
                      <Button
                        variant={dec?.action === 'enrich' ? 'default' : 'outline'}
                        size="sm" className="text-xs h-7"
                        onClick={() => updateDecision(point.id, { action: 'enrich' })}
                      >
                        <Sparkles className="w-3 h-3 mr-1" /> Enriquecer IA
                      </Button>
                      <Button
                        variant={dec?.action === 'skip' ? 'default' : 'outline'}
                        size="sm" className="text-xs h-7"
                        onClick={() => updateDecision(point.id, { action: 'skip' })}
                      >
                        <SkipForward className="w-3 h-3 mr-1" /> Sin acción
                      </Button>
                    </div>

                    {/* Category assignment */}
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                        <Tag className="w-3 h-3" /> Categoría personal
                      </p>
                      <div className="flex gap-1 flex-wrap">
                        {categories.map(cat => (
                          <button
                            key={cat.id}
                            type="button"
                            title={cat.name}
                            className={cn(
                              'h-7 px-2 rounded-md flex items-center gap-1 border text-xs transition-all',
                              dec?.action === 'category' && dec?.categoryId === cat.id
                                ? 'ring-2 ring-primary border-primary bg-primary/5'
                                : 'border-border hover:bg-muted/50'
                            )}
                            onClick={() => setCategoryForPoint(point.id, cat)}
                          >
                            {renderLineIcon(cat.icon, { className: 'w-3 h-3' })}
                            <span className="truncate max-w-[80px]">{cat.name}</span>
                          </button>
                        ))}
                        <button
                          type="button"
                          className="h-7 px-2 rounded-md flex items-center gap-1 border border-dashed border-border hover:bg-muted/50 text-xs text-muted-foreground"
                          onClick={() => setShowCreateCategory(true)}
                        >
                          <Plus className="w-3 h-3" /> Nueva
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Create category inline form */}
      {showCreateCategory && (
        <div className="p-3 border-t bg-muted/30 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium">Nueva categoría</p>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setShowCreateCategory(false)}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
          <Input
            placeholder="Nombre de la categoría"
            value={newCatName}
            onChange={e => setNewCatName(e.target.value)}
            className="h-8 text-xs"
          />
           <div className="space-y-2">
            <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Icono</Label>
            <div className="grid grid-cols-6 gap-1.5">
              {ICON_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  title={opt.label}
                  className={cn(
                    'flex flex-col items-center gap-0.5 py-1.5 px-1 rounded-lg border transition-all',
                    newCatIcon === opt.key
                      ? 'ring-2 ring-primary border-primary bg-primary/10'
                      : 'border-border hover:bg-muted/50'
                  )}
                  onClick={() => setNewCatIcon(opt.key)}
                >
                  {renderLineIcon(opt.key, { className: 'w-4 h-4' })}
                  <span className="text-[8px] text-muted-foreground leading-tight truncate w-full text-center">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Color</Label>
            <div className="flex gap-2 flex-wrap">
              {COLOR_OPTIONS.map(opt => (
                <button
                  key={opt.hex}
                  type="button"
                  title={opt.label}
                  className={cn(
                    'w-7 h-7 rounded-full border-2 transition-all',
                    newCatColor === opt.hex ? 'ring-2 ring-primary ring-offset-2' : 'border-transparent hover:scale-110'
                  )}
                  style={{ backgroundColor: opt.hex }}
                  onClick={() => setNewCatColor(opt.hex)}
                />
              ))}
            </div>
          </div>
          <Button
            size="sm" className="w-full text-xs h-7"
            disabled={!newCatName.trim() || savingCategory}
            onClick={handleCreateCategory}
          >
            <Save className="w-3 h-3 mr-1" />
            {savingCategory ? 'Guardando...' : 'Crear categoría'}
          </Button>
        </div>
      )}

      {/* Footer */}
      <div className="p-3 border-t space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{summary.enrich} enriquecer</span>
          <span>{summary.category} categorizar</span>
          <span>{summary.skip} sin acción</span>
        </div>
        <Button
          className="w-full"
          onClick={handleConfirm}
          disabled={isProcessing}
        >
          {isProcessing ? 'Procesando...' : 'Confirmar revisión'}
        </Button>
      </div>
    </div>
  );
}
