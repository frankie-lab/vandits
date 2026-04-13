import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ChevronLeft, MapPin, Check, CheckCheck, X, Sparkles, GripVertical,
  Pencil, Save, Loader2, Eye, EyeOff, Route as RouteIcon, Car,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { PointContextActions } from './PointContextActions';

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; description: string }>({ name: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [locsRes, routesRes] = await Promise.all([
        supabase
          .from('locations')
          .select('id, name, description, latitude, longitude, is_approved, enrichment_status, enriched_data, place_type, continent, country, region')
          .eq('document_id', docId)
          .is('deleted_at', null)
          .order('name', { ascending: true }),
        supabase
          .from('routes')
          .select('id, name, transport_mode, status, total_distance_meters, total_duration_seconds')
          .contains('route_preferences', { documentId: docId })
          .order('name', { ascending: true }),
      ]);

      if (locsRes.error) throw locsRes.error;
      setLocations(locsRes.data || []);
      setRoutes(routesRes.data || []);
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

  // Focus map on this document's points
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('document:view-on-map', {
      detail: {
        docId,
        docName,
        locationIds: locations.map(l => l.id),
        routeIds: [],
      },
    }));

    if (locations.length > 0) {
      const lats = locations.map(l => l.latitude);
      const lngs = locations.map(l => l.longitude);
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
    }

    return () => {
      // Restore general view on unmount
      window.dispatchEvent(new CustomEvent('document:view-on-map', { detail: null }));
    };
  }, [docId, docName, locations.length]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const approvedCount = useMemo(() => locations.filter(l => l.is_approved).length, [locations]);
  const pendingCount = useMemo(() => locations.filter(l => !l.is_approved).length, [locations]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(locations.map(l => l.id)));
  const selectNone = () => setSelectedIds(new Set());
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
    useLocationsStore.getState().setFocusedLocation(loc.id);
    window.dispatchEvent(new CustomEvent('map-fit-bounds', {
      detail: {
        bounds: [
          [loc.latitude - 0.005, loc.longitude - 0.005],
          [loc.latitude + 0.005, loc.longitude + 0.005],
        ],
        padding: [60, 60],
        maxZoom: 16,
      },
    }));
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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b bg-muted/30 space-y-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onBack}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{docName}</p>
            <p className="text-[11px] text-muted-foreground">
              {locations.length} puntos · {approvedCount} aprobados · {pendingCount} pendientes
            </p>
          </div>
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

          {selectedIds.size > 0 && (
            <>
              <Badge variant="secondary" className="text-[10px] h-5">
                {selectedIds.size} sel.
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

              return (
                <div
                  key={loc.id}
                  className={`px-3 py-2 transition-colors group ${isSelected ? 'bg-primary/5' : 'hover:bg-muted/40'}`}
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
                        title="Editar"
                        onClick={() => startEdit(loc)}
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
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
    </div>
  );
}
