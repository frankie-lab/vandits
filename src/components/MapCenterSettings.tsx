import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import { Home, MapPin, Navigation, Loader2 } from 'lucide-react';

interface MapCenterConfig {
  mode: 'home' | 'geolocation' | 'auto';
  homeLocation?: {
    lat: number;
    lng: number;
    name?: string;
  };
}

const STORAGE_KEY = 'geodata-map-center-config';

export function loadMapCenterConfig(): MapCenterConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    console.log('Loading map center config:', stored);
    if (stored) {
      const parsed = JSON.parse(stored);
      console.log('Parsed map center config:', parsed);
      return parsed;
    }
  } catch (e) {
    console.error('Error loading map center config:', e);
  }
  return { mode: 'auto' };
}

export function saveMapCenterConfig(config: MapCenterConfig): void {
  try {
    const serialized = JSON.stringify(config);
    console.log('Saving map center config:', serialized);
    localStorage.setItem(STORAGE_KEY, serialized);
    console.log('Map center config saved successfully');
  } catch (e) {
    console.error('Error saving map center config:', e);
  }
}

interface MapCenterSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function MapCenterSettings({ open, onOpenChange, onSaved }: MapCenterSettingsProps) {
  const [config, setConfig] = useState<MapCenterConfig>({ mode: 'auto' });
  const [latInput, setLatInput] = useState('');
  const [lngInput, setLngInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [gettingLocation, setGettingLocation] = useState(false);

  useEffect(() => {
    if (open) {
      const saved = loadMapCenterConfig();
      setConfig(saved);
      if (saved.homeLocation) {
        setLatInput(saved.homeLocation.lat.toString());
        setLngInput(saved.homeLocation.lng.toString());
        setNameInput(saved.homeLocation.name || '');
      }
    }
  }, [open]);

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Tu navegador no soporta geolocalización');
      return;
    }

    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatInput(position.coords.latitude.toFixed(6));
        setLngInput(position.coords.longitude.toFixed(6));
        setNameInput('Mi ubicación actual');
        setGettingLocation(false);
        toast.success('Ubicación obtenida');
      },
      (error) => {
        setGettingLocation(false);
        console.error('Geolocation error:', error);
        if (error.code === error.PERMISSION_DENIED) {
          toast.error('Permiso de ubicación denegado');
        } else {
          toast.error('No se pudo obtener la ubicación');
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSave = () => {
    const newConfig: MapCenterConfig = { mode: config.mode };

    if (config.mode === 'home') {
      const lat = parseFloat(latInput);
      const lng = parseFloat(lngInput);

      if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        toast.error('Coordenadas inválidas');
        return;
      }

      newConfig.homeLocation = {
        lat,
        lng,
        name: nameInput.trim() || undefined,
      };
    }

    saveMapCenterConfig(newConfig);
    toast.success('Configuración guardada');
    onSaved?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] z-[2001]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Home className="w-5 h-5" />
            Centro del mapa
          </DialogTitle>
          <DialogDescription>
            Configura dónde se centra el mapa al iniciar la aplicación.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <RadioGroup
            value={config.mode}
            onValueChange={(value) => setConfig({ ...config, mode: value as MapCenterConfig['mode'] })}
          >
            <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
              <RadioGroupItem value="auto" id="auto" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="auto" className="font-medium cursor-pointer flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-primary" />
                  Automático (ver todos los puntos)
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  El mapa se ajusta para mostrar todos tus puntos guardados.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
              <RadioGroupItem value="geolocation" id="geolocation" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="geolocation" className="font-medium cursor-pointer flex items-center gap-2">
                  <Navigation className="w-4 h-4 text-blue-500" />
                  Mi ubicación actual (GPS)
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Usa tu ubicación GPS cada vez que abras la app.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
              <RadioGroupItem value="home" id="home" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="home" className="font-medium cursor-pointer flex items-center gap-2">
                  <Home className="w-4 h-4 text-green-600" />
                  Mi casa / residencia
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Define una ubicación fija como centro del mapa.
                </p>
              </div>
            </div>
          </RadioGroup>

          {config.mode === 'home' && (
            <div className="space-y-4 p-4 bg-muted/30 rounded-lg border">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre (opcional)</Label>
                <Input
                  id="name"
                  placeholder="Ej: Mi casa, Oficina..."
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="lat">Latitud</Label>
                  <Input
                    id="lat"
                    type="number"
                    step="any"
                    placeholder="40.416775"
                    value={latInput}
                    onChange={(e) => setLatInput(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lng">Longitud</Label>
                  <Input
                    id="lng"
                    type="number"
                    step="any"
                    placeholder="-3.703790"
                    value={lngInput}
                    onChange={(e) => setLngInput(e.target.value)}
                  />
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleGetCurrentLocation}
                disabled={gettingLocation}
                className="w-full"
              >
                {gettingLocation ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Obteniendo ubicación...
                  </>
                ) : (
                  <>
                    <Navigation className="w-4 h-4 mr-2" />
                    Usar mi ubicación actual
                  </>
                )}
              </Button>

              <p className="text-xs text-muted-foreground">
                Puedes copiar las coordenadas desde Google Maps: clic derecho en un punto → copiar coordenadas.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>
            Guardar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
