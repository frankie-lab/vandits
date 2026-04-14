import { Switch } from '@/components/ui/switch';
import { Layers, MapPin, Briefcase, Users, Wand2, Bot, Camera } from 'lucide-react';
import { useLayerVisibility } from '@/hooks/use-layer-visibility';
import { isPhotoLayerVisible, togglePhotoLayer } from '@/components/map/map-photo-layer';
import { useState } from 'react';

const LAYER_ITEMS = [
  { type: 'catalog' as const, label: 'Catálogo', icon: MapPin, colorClass: 'text-sky-500', description: 'Puntos aprobados en tu colección' },
  { type: 'workspace' as const, label: 'Mesa de trabajo', icon: Briefcase, colorClass: 'text-amber-500', description: 'Puntos pendientes de aprobar' },
  { type: 'followed' as const, label: 'Seguidos', icon: Users, colorClass: 'text-emerald-500', description: 'Puntos de usuarios que sigues' },
  { type: 'curator' as const, label: 'Curadores', icon: Wand2, colorClass: 'text-purple-500', description: 'Capas temáticas curadas' },
  { type: 'druid' as const, label: 'Druidas', icon: Bot, colorClass: 'text-indigo-500', description: 'Capas de búsqueda automática' },
] as const;

export function LayersPanel() {
  const { isLayerVisible, toggleLayer } = useLayerVisibility();
  const [photosVisible, setPhotosVisible] = useState(isPhotoLayerVisible());

  const handleTogglePhotos = () => {
    togglePhotoLayer();
    setPhotosVisible(isPhotoLayerVisible());
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">Capas del mapa</h3>
            <p className="text-xs text-muted-foreground">Controla qué capas se muestran en el mapa</p>
          </div>
        </div>
      </div>

      {/* Layers list */}
      <div className="flex-1 overflow-y-auto pb-8">
        <div className="px-4 py-2 space-y-1">
          <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-2">Puntos</p>
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
