import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import { Home, MapPin, Navigation, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';

export interface MapCenterConfig {
  mode: 'home' | 'geolocation' | 'auto';
  homeLocation?: {
    lat: number;
    lng: number;
    name?: string;
  };
}

const STORAGE_KEY = 'geodata-map-center-config';

// Load from localStorage as fallback (for non-authenticated users or initial load)
export function loadMapCenterConfigFromStorage(): MapCenterConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Error loading map center config from storage:', e);
  }
  return { mode: 'auto' };
}

// Save to localStorage as cache
function saveMapCenterConfigToStorage(config: MapCenterConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Error saving map center config to storage:', e);
  }
}

interface MapCenterSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function MapCenterSettings({ open, onOpenChange, onSaved }: MapCenterSettingsProps) {
  const { user } = useAuth();
  const [config, setConfig] = useState<MapCenterConfig>({ mode: 'auto' });
  const [latInput, setLatInput] = useState('');
  const [lngInput, setLngInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [gettingLocation, setGettingLocation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load config from database when dialog opens
  useEffect(() => {
    if (open && user) {
      loadConfigFromDB();
    } else if (open) {
      // Fallback to localStorage for non-authenticated
      const saved = loadMapCenterConfigFromStorage();
      setConfig(saved);
      if (saved.homeLocation) {
        setLatInput(saved.homeLocation.lat.toString());
        setLngInput(saved.homeLocation.lng.toString());
        setNameInput(saved.homeLocation.name || '');
      }
    }
  }, [open, user]);

  const loadConfigFromDB = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('map_center_mode, home_latitude, home_longitude, home_name')
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const loadedConfig: MapCenterConfig = {
          mode: (data.map_center_mode as MapCenterConfig['mode']) || 'auto',
        };

        if (data.home_latitude && data.home_longitude) {
          loadedConfig.homeLocation = {
            lat: data.home_latitude,
            lng: data.home_longitude,
            name: data.home_name || undefined,
          };
          setLatInput(data.home_latitude.toString());
          setLngInput(data.home_longitude.toString());
          setNameInput(data.home_name || '');
        }

        setConfig(loadedConfig);
        // Also update localStorage cache
        saveMapCenterConfigToStorage(loadedConfig);
      }
    } catch (e) {
      console.error('Error loading map center config from DB:', e);
      // Fallback to localStorage
      const saved = loadMapCenterConfigFromStorage();
      setConfig(saved);
      if (saved.homeLocation) {
        setLatInput(saved.homeLocation.lat.toString());
        setLngInput(saved.homeLocation.lng.toString());
        setNameInput(saved.homeLocation.name || '');
      }
    } finally {
      setLoading(false);
    }
  };

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

  const handleSave = async () => {
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

    setSaving(true);
    try {
      if (user) {
        // Save to database
        const { error } = await supabase
          .from('profiles')
          .update({
            map_center_mode: newConfig.mode,
            home_latitude: newConfig.homeLocation?.lat || null,
            home_longitude: newConfig.homeLocation?.lng || null,
            home_name: newConfig.homeLocation?.name || null,
          })
          .eq('id', user.id);

        if (error) throw error;
      }

      // Always save to localStorage as cache
      saveMapCenterConfigToStorage(newConfig);
      
      toast.success('Configuración guardada');
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      console.error('Error saving map center config:', e);
      toast.error('Error al guardar la configuración');
    } finally {
      setSaving(false);
    }
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

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
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
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  'Guardar'
                )}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Hook to load map center config (from DB or localStorage)
export function useMapCenterConfig() {
  const { user } = useAuth();
  const [config, setConfig] = useState<MapCenterConfig>({ mode: 'auto' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadConfig = async () => {
      if (user) {
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('map_center_mode, home_latitude, home_longitude, home_name')
            .eq('id', user.id)
            .maybeSingle();

          if (!error && data) {
            const loadedConfig: MapCenterConfig = {
              mode: (data.map_center_mode as MapCenterConfig['mode']) || 'auto',
            };

            if (data.home_latitude && data.home_longitude) {
              loadedConfig.homeLocation = {
                lat: data.home_latitude,
                lng: data.home_longitude,
                name: data.home_name || undefined,
              };
            }

            setConfig(loadedConfig);
            saveMapCenterConfigToStorage(loadedConfig);
            setLoading(false);
            return;
          }
        } catch (e) {
          console.error('Error loading map center config:', e);
        }
      }

      // Fallback to localStorage
      setConfig(loadMapCenterConfigFromStorage());
      setLoading(false);
    };

    loadConfig();
  }, [user]);

  return { config, loading };
}
