import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import { Home, MapPin, Navigation, Loader2, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { reverseGeocodeAddress, AddressSuggestion } from '@/lib/geocoding';

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
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [loadingAddresses, setLoadingAddresses] = useState(false);

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
    setAddressSuggestions([]);
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        
        setLatInput(lat.toFixed(6));
        setLngInput(lng.toFixed(6));
        setGettingLocation(false);
        
        // Fetch address suggestions
        setLoadingAddresses(true);
        try {
          const suggestions = await reverseGeocodeAddress(lat, lng);
          setAddressSuggestions(suggestions);
          
          // Auto-select first suggestion if available
          if (suggestions.length > 0) {
            setNameInput(suggestions[0].shortName);
          } else {
            setNameInput('Mi ubicación actual');
          }
          
          toast.success('Ubicación obtenida - selecciona una dirección');
        } catch (e) {
          console.error('Error fetching addresses:', e);
          setNameInput('Mi ubicación actual');
          toast.success('Ubicación obtenida');
        } finally {
          setLoadingAddresses(false);
        }
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

  const handleSelectAddress = (suggestion: AddressSuggestion) => {
    setNameInput(suggestion.displayName);
    setAddressSuggestions([]); // Clear suggestions after selection
    toast.success('Dirección seleccionada');
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
      <DialogContent className="sm:max-w-[425px] z-[2001] max-h-[85vh] overflow-hidden flex flex-col">
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
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto space-y-4 py-2 -mr-2 pr-2">
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
                    disabled={gettingLocation || loadingAddresses}
                    className="w-full"
                  >
                    {gettingLocation ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Obteniendo ubicación...
                      </>
                    ) : loadingAddresses ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Buscando direcciones...
                      </>
                    ) : (
                      <>
                        <Navigation className="w-4 h-4 mr-2" />
                        Usar mi ubicación actual
                      </>
                    )}
                  </Button>

                  {/* Address suggestions */}
                  {addressSuggestions.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Selecciona tu dirección:</Label>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {addressSuggestions.map((suggestion, index) => (
                          <button
                            key={index}
                            type="button"
                            onClick={() => handleSelectAddress(suggestion)}
                            className={`w-full text-left p-2 rounded-md border text-sm transition-colors hover:bg-primary/10 hover:border-primary ${
                              nameInput === suggestion.displayName 
                                ? 'bg-primary/10 border-primary' 
                                : 'bg-background'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {nameInput === suggestion.displayName && (
                                <Check className="w-4 h-4 text-primary flex-shrink-0" />
                              )}
                              <span className="truncate">{suggestion.displayName}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        O escribe tu dirección manualmente arriba.
                      </p>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Puedes copiar las coordenadas desde Google Maps: clic derecho en un punto → copiar coordenadas.
                  </p>
                </div>
              )}
            </div>

            <div className="flex-shrink-0 flex justify-end gap-2 pt-4 border-t">
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
          </div>
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
