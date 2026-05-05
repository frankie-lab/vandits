/**
 * CollectionFocusView — Vista enfocada de una colección. Muestra dos pestañas
 * (Puntos / Rutas) y un botón para volver a la lista. Aplica como capa el
 * tinte de la colección durante toda la duración de la vista.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  ChevronLeft, MapPin, Route as RouteIcon, Loader2, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PanelTabs } from '@/shared/components/ui/panel';
import { supabase } from '@/integrations/supabase/client';
import { collectionService } from '@/services/collection.service';
import type { Collection } from '@/domains/v2';
import { getCollectionIconComponent } from './CollectionAppearanceDialog';
import { useLocationsStore } from '@/domains/content';
import { toast } from 'sonner';

interface PlaceRow { id: string; name: string; latitude: number; longitude: number }
interface RouteRow { id: string; name: string; transport_mode: string }

interface Props {
  collection: Collection;
  onBack: () => void;
}

export function CollectionFocusView({ collection, onBack }: Props) {
  const [loading, setLoading] = useState(true);
  const [places, setPlaces] = useState<PlaceRow[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);

  const Icon = getCollectionIconComponent(collection.icon);
  const tint = collection.color || '#6b7280';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const items = await collectionService.getItems(collection.id);
      const placeIds = items.filter(i => i.itemType === 'place' || i.itemType === 'waypoint').map(i => i.itemId);
      const routeIds = items.filter(i => i.itemType === 'route').map(i => i.itemId);

      const [placesRes, routesRes] = await Promise.all([
        placeIds.length > 0
          ? supabase.from('locations').select('id, name, latitude, longitude').in('id', placeIds).is('deleted_at', null)
          : Promise.resolve({ data: [], error: null } as any),
        routeIds.length > 0
          ? supabase.from('routes').select('id, name, transport_mode').in('id', routeIds)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      const placeRows = (placesRes.data || []) as PlaceRow[];
      setPlaces(placeRows);
      setRoutes((routesRes.data || []) as RouteRow[]);

      // Auto-fit map to collection content
      if (placeRows.length > 0) {
        const lats = placeRows.map(p => p.latitude);
        const lngs = placeRows.map(p => p.longitude);
        window.dispatchEvent(new CustomEvent('map-fit-bounds', {
          detail: {
            bounds: [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]],
            padding: [60, 60], maxZoom: 14,
          },
        }));
      }
    } catch (e) {
      toast.error('No se pudo cargar la colección');
    } finally {
      setLoading(false);
    }
  }, [collection.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRemovePlace = async (id: string) => {
    try {
      await collectionService.removeItem(collection.id, 'place', id);
      setPlaces(prev => prev.filter(p => p.id !== id));
      toast.success('Punto retirado de la colección');
    } catch (e: any) {
      toast.error('No se pudo quitar', { description: e?.message });
    }
  };

  const handleRemoveRoute = async (id: string) => {
    try {
      await collectionService.removeItem(collection.id, 'route', id);
      setRoutes(prev => prev.filter(r => r.id !== id));
      toast.success('Ruta retirada de la colección');
    } catch (e: any) {
      toast.error('No se pudo quitar', { description: e?.message });
    }
  };

  const handleFocusPlace = (p: PlaceRow) => {
    useLocationsStore.getState().setFocusedLocation(p.id);
    window.dispatchEvent(new CustomEvent('map-fly-to', {
      detail: { lat: p.latitude, lng: p.longitude, zoom: 15 },
    }));
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 px-3 pt-3 pb-2 flex items-center gap-2 border-b">
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onBack}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span
          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: tint }}
        >
          <Icon className="w-4 h-4 text-white" />
        </span>
        <h3 className="font-bold text-sm truncate flex-1">{collection.name}</h3>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <PanelTabs defaultValue="places">
          <div className="shrink-0 px-3 pt-2 pb-2 border-b">
            <PanelTabs.Group>
              <PanelTabs.Trigger value="places">Puntos · {places.length}</PanelTabs.Trigger>
              <PanelTabs.Trigger value="routes">Rutas · {routes.length}</PanelTabs.Trigger>
            </PanelTabs.Group>
          </div>

          <PanelTabs.Content value="places" className="flex-1 min-h-0 outline-none">
            <ScrollArea className="h-full">
              <div className="p-3 space-y-1.5">
                {places.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No hay puntos en esta colección
                  </p>
                ) : (
                  places.map(p => (
                    <div
                      key={p.id}
                      className="flex items-center gap-2 rounded-lg border border-border/60 bg-card hover:bg-accent/30 px-2 py-2"
                    >
                      <button
                        type="button"
                        onClick={() => handleFocusPlace(p)}
                        className="flex items-center gap-2 min-w-0 flex-1 text-left"
                      >
                        <MapPin className="w-3.5 h-3.5 shrink-0" style={{ color: tint }} />
                        <span className="text-sm truncate">{p.name}</span>
                      </button>
                      <Button
                        variant="ghost" size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemovePlace(p.id)}
                        title="Quitar de la colección"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </PanelTabs.Content>

          <PanelTabs.Content value="routes" className="flex-1 min-h-0 outline-none">
            <ScrollArea className="h-full">
              <div className="p-3 space-y-1.5">
                {routes.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No hay rutas en esta colección
                  </p>
                ) : (
                  routes.map(r => (
                    <div
                      key={r.id}
                      className="flex items-center gap-2 rounded-lg border border-border/60 bg-card hover:bg-accent/30 px-2 py-2"
                    >
                      <RouteIcon className="w-3.5 h-3.5 shrink-0" style={{ color: tint }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate">{r.name}</p>
                        <p className="text-[10px] text-muted-foreground capitalize">{r.transport_mode}</p>
                      </div>
                      <Button
                        variant="ghost" size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemoveRoute(r.id)}
                        title="Quitar de la colección"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </PanelTabs.Content>
        </PanelTabs>
      )}
    </div>
  );
}
