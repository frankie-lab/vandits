import { Switch } from '@/components/ui/switch';
import { Layers, MapPin, Briefcase, Users, Camera, Route, Eye, User, UserCheck } from 'lucide-react';
import { useLayerVisibility, LAYER_VISIBILITY_EVENT } from '@/hooks/use-layer-visibility';
import { isPhotoLayerVisible, togglePhotoLayer } from '@/components/map/map-photo-layer';
import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

const LAYER_ITEMS = [
  { type: 'catalog' as const, label: 'Catálogo', icon: MapPin, colorClass: 'text-sky-500', description: 'Puntos aprobados en tu colección' },
  { type: 'workspace' as const, label: 'Mesa de trabajo', icon: Briefcase, colorClass: 'text-amber-500', description: 'Puntos pendientes de aprobar' },
  { type: 'followed' as const, label: 'Seguidos', icon: Users, colorClass: 'text-emerald-500', description: 'Puntos de usuarios que sigues' },
] as const;

export function LayersPanel() {
  const { isLayerVisible, toggleLayer, ownershipFilter, setOwnershipFilter } = useLayerVisibility();
  const [photosVisible, setPhotosVisible] = useState(isPhotoLayerVisible());
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const handler = () => forceUpdate(n => n + 1);
    window.addEventListener(LAYER_VISIBILITY_EVENT, handler);
    return () => window.removeEventListener(LAYER_VISIBILITY_EVENT, handler);
  }, []);

  const handleTogglePhotos = useCallback(() => {
    togglePhotoLayer();
    setPhotosVisible(isPhotoLayerVisible());
  }, []);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">Capas del mapa</h3>
            <p className="text-xs text-muted-foreground">Controla qué capas se muestran en el mapa</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-8">
        <div className="px-4 py-2 space-y-1">
          <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-2">General</p>
          <div className="flex items-center justify-between py-2 px-2 rounded-md hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-2.5 min-w-0">
              <Eye className="w-4 h-4 shrink-0 text-foreground" />
              <div className="min-w-0">
                <span className="text-sm text-foreground block">Puntos</span>
                <span className="text-[11px] text-muted-foreground block truncate">Mostrar todos los marcadores</span>
              </div>
            </div>
            <Switch
              checked={isLayerVisible('points')}
              onCheckedChange={() => toggleLayer('points')}
              className="shrink-0 ml-3"
            />
          </div>
          <div className="flex items-center justify-between py-2 px-2 rounded-md hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-2.5 min-w-0">
              <Route className="w-4 h-4 shrink-0 text-teal-500" />
              <div className="min-w-0">
                <span className="text-sm text-foreground block">Rutas</span>
                <span className="text-[11px] text-muted-foreground block truncate">Mostrar rutas guardadas en el mapa</span>
              </div>
            </div>
            <Switch
              checked={isLayerVisible('routes')}
              onCheckedChange={() => toggleLayer('routes')}
              className="shrink-0 ml-3"
            />
          </div>
        </div>

        <div className="border-t border-border mx-4 my-2" />

        <div className="px-4 py-2 space-y-2">
          <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-2">Puntos</p>

          {/* Quick ownership selector */}
          <div className="grid grid-cols-3 gap-1 p-1 rounded-md bg-muted/40 mb-2">
            {([
              { value: 'all', label: 'Todos', Icon: Users },
              { value: 'mine', label: 'Míos', Icon: User },
              { value: 'followed', label: 'Seguidos', Icon: UserCheck },
            ] as const).map(({ value, label, Icon }) => {
              const active = ownershipFilter === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setOwnershipFilter(value)}
                  className={cn(
                    'flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded text-[11px] transition-colors',
                    active
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-background/60',
                  )}
                  title={`Filtrar por: ${label}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          {LAYER_ITEMS.map(({ type, label, icon: Icon, colorClass, description }) => (
            <div
              key={type}
              className="flex items-center justify-between py-2 px-2 rounded-md hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon className={`w-4 h-4 shrink-0 ${colorClass}`} />
                <div className="min-w-0">
                  <span className="text-sm text-foreground block">{label}</span>
                  <span className="text-[11px] text-muted-foreground block truncate">{description}</span>
                </div>
              </div>
              <Switch
                checked={isLayerVisible(type)}
                onCheckedChange={() => toggleLayer(type)}
                className="shrink-0 ml-3"
              />
            </div>
          ))}
        </div>

        <div className="border-t border-border mx-4 my-2" />

        <div className="px-4 py-2 space-y-1">
          <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-2">Otros</p>
          <div className="flex items-center justify-between py-2 px-2 rounded-md hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-2.5 min-w-0">
              <Camera className="w-4 h-4 shrink-0 text-rose-500" />
              <div className="min-w-0">
                <span className="text-sm text-foreground block">Fotos</span>
                <span className="text-[11px] text-muted-foreground block truncate">Fotos geolocalizadas de OneDrive</span>
              </div>
            </div>
            <Switch
              checked={photosVisible}
              onCheckedChange={handleTogglePhotos}
              className="shrink-0 ml-3"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
