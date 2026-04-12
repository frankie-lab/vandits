import React, { useState, useEffect, useCallback } from 'react';
import {
  MapPin, Trash2, Loader2, CheckSquare, Square, ChevronLeft,
  Sparkles, Route as RouteIcon, Filter, CheckCheck, XSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface LocationRow {
  id: string;
  name: string;
  enrichment_status: string | null;
  country: string | null;
  region: string | null;
}

interface RouteRow {
  id: string;
  name: string;
  transport_mode: string;
  total_distance_meters: number | null;
  status: string;
}

interface Props {
  docId: string;
  docName: string;
  userId: string;
  onBack: () => void;
  onDataChanged: () => void;
}

export function DocumentContentManager({ docId, docName, userId, onBack, onDataChanged }: Props) {
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLocationIds, setSelectedLocationIds] = useState<Set<string>>(new Set());
  const [selectedRouteIds, setSelectedRouteIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    type: 'locations' | 'routes';
    ids: string[];
    label: string;
  }>({ open: false, type: 'locations', ids: [], label: '' });

  const loadContent = useCallback(async () => {
    setLoading(true);
    try {
      const [locsRes, routesRes] = await Promise.all([
        supabase
          .from('locations')
          .select('id, name, enrichment_status, country, region')
          .eq('document_id', docId)
          .is('deleted_at', null)
          .order('name'),
        supabase
          .from('routes')
          .select('id, name, transport_mode, total_distance_meters, status')
          .eq('user_id', userId)
          .contains('route_preferences', { documentId: docId })
          .order('name'),
      ]);

      setLocations(locsRes.data || []);
      setRoutes(routesRes.data || []);
    } catch (e) {
      console.error('Error loading document content:', e);
    } finally {
      setLoading(false);
    }
  }, [docId, userId]);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  // ─── Selection helpers ─────────────────────────────────────────
  const toggleLocation = (id: string) => {
    setSelectedLocationIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleRoute = (id: string) => {
    setSelectedRouteIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllLocations = () => setSelectedLocationIds(new Set(locations.map(l => l.id)));
  const selectNoneLocations = () => setSelectedLocationIds(new Set());
  const selectNotEnrichedLocations = () => {
    setSelectedLocationIds(new Set(
      locations.filter(l => l.enrichment_status !== 'enriched').map(l => l.id)
    ));
  };
  const selectEnrichedLocations = () => {
    setSelectedLocationIds(new Set(
      locations.filter(l => l.enrichment_status === 'enriched').map(l => l.id)
    ));
  };

  const selectAllRoutes = () => setSelectedRouteIds(new Set(routes.map(r => r.id)));
  const selectNoneRoutes = () => setSelectedRouteIds(new Set());

  // ─── Delete operations ─────────────────────────────────────────
  const deleteLocations = async (ids: string[]) => {
    setDeleting(true);
    try {
      // Delete in batches of 50
      for (let i = 0; i < ids.length; i += 50) {
        const batch = ids.slice(i, i + 50);
        const { error } = await supabase.from('locations').delete().in('id', batch);
        if (error) throw error;
      }
      toast.success(`${ids.length} ubicación${ids.length !== 1 ? 'es' : ''} eliminada${ids.length !== 1 ? 's' : ''}`);
      setSelectedLocationIds(new Set());
      await loadContent();
      onDataChanged();
      window.dispatchEvent(new CustomEvent('store-updated'));
    } catch (e) {
      console.error('Error deleting locations:', e);
      toast.error('Error al eliminar ubicaciones');
    } finally {
      setDeleting(false);
    }
  };

  const deleteRoutes = async (ids: string[]) => {
    setDeleting(true);
    try {
      // Delete FK children first
      await Promise.all([
        supabase.from('route_waypoints').delete().in('route_id', ids),
        supabase.from('route_stops').delete().in('route_id', ids),
        supabase.from('route_day_stages').delete().in('route_id', ids),
      ]);
      const { error } = await supabase.from('routes').delete().in('id', ids);
      if (error) throw error;

      toast.success(`${ids.length} ruta${ids.length !== 1 ? 's' : ''} eliminada${ids.length !== 1 ? 's' : ''}`);
      setSelectedRouteIds(new Set());
      await loadContent();
      onDataChanged();
      window.dispatchEvent(new CustomEvent('routes:changed'));
    } catch (e) {
      console.error('Error deleting routes:', e);
      toast.error('Error al eliminar rutas');
    } finally {
      setDeleting(false);
    }
  };

  const openConfirm = (type: 'locations' | 'routes', ids: string[], label: string) => {
    setConfirmDialog({ open: true, type, ids, label });
  };

  const handleConfirmDelete = async () => {
    const { type, ids } = confirmDialog;
    setConfirmDialog(prev => ({ ...prev, open: false }));
    if (type === 'locations') await deleteLocations(ids);
    else await deleteRoutes(ids);
  };

  const enrichedCount = locations.filter(l => l.enrichment_status === 'enriched').length;
  const notEnrichedCount = locations.length - enrichedCount;

  const modeLabels: Record<string, string> = {
    driving: 'Coche', walking: 'A pie', ferry: 'Ferry', flight: 'Vuelo', multimodal: 'Multimodal',
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b bg-muted/30 space-y-1">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onBack}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{docName}</p>
            <p className="text-[10px] text-muted-foreground">
              {locations.length} puntos · {routes.length} rutas
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Cargando contenido...</span>
        </div>
      ) : (
        <Tabs defaultValue="locations" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-3 mt-2 grid grid-cols-2">
            <TabsTrigger value="locations" className="text-xs gap-1">
              <MapPin className="w-3 h-3" />
              Puntos ({locations.length})
            </TabsTrigger>
            <TabsTrigger value="routes" className="text-xs gap-1">
              <RouteIcon className="w-3 h-3" />
              Rutas ({routes.length})
            </TabsTrigger>
          </TabsList>

          {/* ─── LOCATIONS TAB ─── */}
          <TabsContent value="locations" className="flex-1 flex flex-col overflow-hidden mt-0 px-0">
            {/* Toolbar */}
            <div className="px-3 py-2 border-b flex items-center gap-1 flex-wrap">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                    <Filter className="w-3 h-3" />
                    Seleccionar
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="z-[2002]">
                  <DropdownMenuItem onClick={selectAllLocations}>
                    <CheckCheck className="w-3.5 h-3.5 mr-2" />
                    Todos ({locations.length})
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={selectNoneLocations}>
                    <XSquare className="w-3.5 h-3.5 mr-2" />
                    Ninguno
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={selectNotEnrichedLocations}>
                    <Square className="w-3.5 h-3.5 mr-2" />
                    No enriquecidos ({notEnrichedCount})
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={selectEnrichedLocations}>
                    <Sparkles className="w-3.5 h-3.5 mr-2" />
                    Enriquecidos ({enrichedCount})
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {selectedLocationIds.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-7 text-xs gap-1 ml-auto"
                  disabled={deleting}
                  onClick={() => openConfirm(
                    'locations',
                    Array.from(selectedLocationIds),
                    `${selectedLocationIds.size} ubicación${selectedLocationIds.size !== 1 ? 'es' : ''}`
                  )}
                >
                  {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  Eliminar ({selectedLocationIds.size})
                </Button>
              )}
            </div>

            <ScrollArea className="flex-1">
              {locations.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Sin ubicaciones</p>
              ) : (
                <div className="divide-y">
                  {locations.map(loc => (
                    <label
                      key={loc.id}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-muted/30 cursor-pointer transition-colors"
                    >
                      <Checkbox
                        checked={selectedLocationIds.has(loc.id)}
                        onCheckedChange={() => toggleLocation(loc.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{loc.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {[loc.country, loc.region].filter(Boolean).join(' · ') || 'Sin ubicar'}
                        </p>
                      </div>
                      {loc.enrichment_status === 'enriched' ? (
                        <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          <Sparkles className="w-2 h-2 mr-0.5" />
                          Enriquecido
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[9px] px-1 py-0 opacity-50">
                          Sin enriquecer
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openConfirm('locations', [loc.id], `"${loc.name}"`);
                        }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </label>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* ─── ROUTES TAB ─── */}
          <TabsContent value="routes" className="flex-1 flex flex-col overflow-hidden mt-0 px-0">
            {/* Toolbar */}
            <div className="px-3 py-2 border-b flex items-center gap-1 flex-wrap">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                    <Filter className="w-3 h-3" />
                    Seleccionar
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="z-[2002]">
                  <DropdownMenuItem onClick={selectAllRoutes}>
                    <CheckCheck className="w-3.5 h-3.5 mr-2" />
                    Todas ({routes.length})
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={selectNoneRoutes}>
                    <XSquare className="w-3.5 h-3.5 mr-2" />
                    Ninguna
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {selectedRouteIds.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-7 text-xs gap-1 ml-auto"
                  disabled={deleting}
                  onClick={() => openConfirm(
                    'routes',
                    Array.from(selectedRouteIds),
                    `${selectedRouteIds.size} ruta${selectedRouteIds.size !== 1 ? 's' : ''}`
                  )}
                >
                  {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  Eliminar ({selectedRouteIds.size})
                </Button>
              )}
            </div>

            <ScrollArea className="flex-1">
              {routes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Sin rutas</p>
              ) : (
                <div className="divide-y">
                  {routes.map(route => (
                    <label
                      key={route.id}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-muted/30 cursor-pointer transition-colors"
                    >
                      <Checkbox
                        checked={selectedRouteIds.has(route.id)}
                        onCheckedChange={() => toggleRoute(route.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{route.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {modeLabels[route.transport_mode] || route.transport_mode}
                          {route.total_distance_meters
                            ? ` · ${(route.total_distance_meters / 1000).toFixed(1)} km`
                            : ''}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openConfirm('routes', [route.id], `"${route.name}"`);
                        }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </label>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      )}

      {/* Confirmation dialog */}
      <AlertDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}
      >
        <AlertDialogContent className="z-[2001]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar {confirmDialog.type === 'locations' ? 'ubicaciones' : 'rutas'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán permanentemente {confirmDialog.label} de la base de datos.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
