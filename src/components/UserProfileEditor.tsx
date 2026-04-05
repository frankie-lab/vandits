import React, { useState, useRef, useEffect, useCallback } from 'react';
import { renderTransportModeIcon } from '@/lib/icon-utils';
import { motion } from 'framer-motion';
import { 
 X, 
 Camera, 
 User, 
 AtSign, 
 FileText, 
 Lock, 
 Unlock,
 Save,
 Loader2,
 Copy,
 Map as MapIcon,
 Eye,
 EyeOff,
 Home,
 Navigation,
 MapPin,
 Image,
 Settings,
 Shield,
 Compass,
 Car,
 GripVertical,
 Anchor,
 DollarSign,
 Clock,
 Sofa,
 Sunrise,
 Shuffle,
 Mountain,
 Footprints,
 Ship,
 Bus,
 Sailboat,
 Plane,
 AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth, UserProfile } from '@/hooks/use-auth';
import { useSocialStats } from '@/hooks/use-social-stats';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { reverseGeocodeAddress, forwardGeocode, ForwardGeocodeResult, AddressSuggestion } from '@/lib/geocoding';
import { TravelProfile } from '@/hooks/use-travel-advisor';

interface UserProfileEditorProps {
  onClose: () => void;
}

type TransportLayer = 'owned' | 'rentable' | 'infrastructure';
type TransportPreference = 'required' | 'preferred' | 'allowed';
interface TransportSelection { layer: TransportLayer; code: string; preference: TransportPreference; }

const DISTANCE_OPTIONS = [
 { value: 2.5, label: '2,5 m' },
 { value: 5, label: '5 m' },
 { value: 10, label: '10 m' },
 { value: 25, label: '25 m' },
 { value: 50, label: '50 m' },
 { value: 100, label: '100 m' },
 { value: 250, label: '250 m' },
 { value: 500, label: '500 m' },
 { value: 1000, label: '1 km' },
 { value: 2000, label: '2 km' },
 { value: 5000, label: '5 km' },
 { value: 100000, label: '100 km' },
 { value: 250000, label: '250 km' },
 { value: 500000, label: '500 km' },
];

const VISIBILITY_OPTIONS = [
 { value: 'public', label: 'Pública', icon: Eye, description: 'Visible para todos' },
 { value: 'followers', label: 'Seguidores', icon: User, description: 'Solo seguidores' },
 { value: 'private', label: 'Privada', icon: EyeOff, description: 'Solo tú' },
];

type MapCenterMode = 'auto' | 'geolocation' | 'home';

export function UserProfileEditor({ onClose }: UserProfileEditorProps) {
 const { profile, updateProfile, user, refreshProfile, loading: authLoading } = useAuth();
 const { stats, loading: statsLoading } = useSocialStats();
 const fileInputRef = useRef<HTMLInputElement>(null);
 
  // Profile tab
 const [formData, setFormData] = useState({
 display_name: '',
 username: '',
 bio: '',
 });
 const [avatarFile, setAvatarFile] = useState<File | null>(null);
 const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
 
  // Privacy tab
 const [privacyData, setPrivacyData] = useState({
 is_private: false,
 duplicate_threshold_meters: 250,
 default_photo_visibility: 'private' as string,
 default_location_visibility: 'followers' as string,
 default_note_visibility: 'private' as string,
 hide_home_location: true,
 });
 
  // Map tab
 const [mapData, setMapData] = useState({
 map_center_mode: 'auto' as MapCenterMode,
 home_latitude: null as number | null,
 home_longitude: null as number | null,
 home_name: '',
 measurement_units: 'metric' as 'metric' | 'imperial' | 'auto',
 });
 const [latInput, setLatInput] = useState('');
 const [lngInput, setLngInput] = useState('');
 const [gettingLocation, setGettingLocation] = useState(false);
 const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
 const [loadingAddresses, setLoadingAddresses] = useState(false);
 const [addressSearchQuery, setAddressSearchQuery] = useState('');
 const [addressSearchResults, setAddressSearchResults] = useState<ForwardGeocodeResult[]>([]);
 const [searchingAddress, setSearchingAddress] = useState(false);
 const addressSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
 
 const [saving, setSaving] = useState(false);
 const [uploadingAvatar, setUploadingAvatar] = useState(false);
 const [isLoading, setIsLoading] = useState(true);
 const [activeTab, setActiveTab] = useState('profile');
 const [travelProfile, setTravelProfile] = useState('adventure');
 const [travelProfiles, setTravelProfiles] = useState<TravelProfile[]>([]);
  const [allTransportModes, setAllTransportModes] = useState<{ code: string; name: string; icon: string; category: string; sub_category: string; is_complementary: boolean }[]>([]);
  
  // 3-layer transport mode selection: key = "layer:code"
  const [transportSelections, setTransportSelections] = useState<globalThis.Map<string, TransportSelection>>(new globalThis.Map());

  // Human-readable fallback names for transport codes
  const CODE_LABELS: Record<string, string> = {
    walking: 'A pie', bicycle: 'Bicicleta',
    motorcycle_own: 'Moto propia', car_own: 'Coche propio',
    camper: 'Camper / Autocaravana', car_caravan: 'Coche + Caravana',
    boat_own: 'Barco propio', plane_private: 'Avión privado',
    bicycle_rental: 'Bicicleta de alquiler', motorcycle_rental: 'Moto de alquiler',
    car_rental: 'Coche de alquiler', camper_rental: 'Camper de alquiler',
    caravan_rental: 'Caravana de alquiler', boat_rental: 'Barco de alquiler',
    plane_commercial: 'Avión de línea', plane_private_rental: 'Avión privado (chárter)',
    bus: 'Autobús', train: 'Tren',
    ferry: 'Ferry', local_transport: 'Transporte local', taxi: 'Taxi / Transfer',
  };

  const getModeName = (code: string) => {
    const dbMode = allTransportModes.find(m => m.code === code);
    return dbMode?.name || CODE_LABELS[code] || code;
  };
  const getModeIcon = (code: string) => {
    const dbMode = allTransportModes.find(m => m.code === code);
    return dbMode ? renderTransportModeIcon(dbMode.code, dbMode.icon, 'w-4 h-4') : null;
  };

  // Layer definitions with sub-groups and their transport mode codes
  const LAYER_OWNED = {
    key: 'owned' as TransportLayer,
    title: 'Tus medios',
    subtitle: '¿De qué medios dispones para iniciar o usar durante el viaje?',
    icon: Car,
    groups: [
      { label: 'No motorizados', icon: Footprints, codes: ['walking', 'bicycle'] },
      { label: 'Motorizados propios', icon: Car, codes: ['motorcycle_own', 'car_own'] },
      { label: 'Vehículos habitables', icon: Home, codes: ['camper', 'car_caravan'] },
      { label: 'Marítimos propios', icon: Sailboat, codes: ['boat_own'] },
      { label: 'Aéreos propios', icon: Plane, codes: ['plane_private'] },
    ],
  };
  const LAYER_RENTABLE = {
    key: 'rentable' as TransportLayer,
    title: 'Puedes contratar',
    subtitle: '¿Qué estás dispuesto a alquilar o contratar durante el viaje?',
    icon: Shuffle,
    groups: [
      { label: 'Alquiler terrestre', icon: Car, codes: ['bicycle_rental', 'motorcycle_rental', 'car_rental'] },
      { label: 'Habitables', icon: Home, codes: ['camper_rental', 'caravan_rental'] },
      { label: 'Marítimos', icon: Sailboat, codes: ['boat_rental'] },
      { label: 'Aéreos', icon: Plane, codes: ['plane_commercial', 'plane_private_rental'] },
    ],
  };
  const LAYER_INFRA = {
    key: 'infrastructure' as TransportLayer,
    title: 'Aceptas usar',
    subtitle: '¿Qué medios externos estás dispuesto a usar como parte del viaje?',
    icon: Bus,
    groups: [
      { label: 'Transporte colectivo', icon: Bus, codes: ['bus', 'train'] },
      { label: 'Conexiones', icon: Anchor, codes: ['ferry', 'local_transport', 'taxi'] },
    ],
  };
  const ALL_LAYERS = [LAYER_OWNED, LAYER_RENTABLE, LAYER_INFRA];
  const PREFERENCE_OPTIONS: { value: TransportPreference; label: string }[] = [
    { value: 'required', label: 'Obligatorio' },
    { value: 'preferred', label: 'Preferido' },
    { value: 'allowed', label: 'Permitido' },
  ];

  const toggleTransport = (layer: TransportLayer, code: string) => {
    const key = `${layer}:${code}`;
    setTransportSelections(prev => {
      const next = new globalThis.Map(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.set(key, { layer, code, preference: 'allowed' });
      }
      return next;
    });
  };

  const setTransportPreference = (layer: TransportLayer, code: string, preference: TransportPreference) => {
    const key = `${layer}:${code}`;
    setTransportSelections(prev => {
      const next = new globalThis.Map(prev);
      const existing = next.get(key);
      if (existing) {
        next.set(key, { ...existing, preference });
      }
      return next;
    });
  };


  // Priority ranking
 const PRIORITY_ITEMS: { code: string; label: string; icon: React.ReactNode }[] = [
  { code: 'cost', label: 'Ahorrar coste', icon: <DollarSign className="w-4 h-4" /> },
  { code: 'time', label: 'Ahorrar tiempo', icon: <Clock className="w-4 h-4" /> },
  { code: 'comfort', label: 'Maximizar comodidad', icon: <Sofa className="w-4 h-4" /> },
  { code: 'scenic', label: 'Maximizar paisaje', icon: <Sunrise className="w-4 h-4" /> },
  { code: 'flexibility', label: 'Maximizar libertad', icon: <Shuffle className="w-4 h-4" /> },
  { code: 'adventure', label: 'Maximizar aventura', icon: <Mountain className="w-4 h-4" /> },
 ];
 const [priorityRanking, setPriorityRanking] = useState<string[]>(
 PRIORITY_ITEMS.map(p => p.code)
 );
 const [dragPriorityIdx, setDragPriorityIdx] = useState<number | null>(null);

  // Load travel profiles and transport modes from DB
 useEffect(() => {
 (async () => {
 const [profilesRes, modesRes] = await Promise.all([
 supabase.from('travel_profiles').select('*').eq('is_active', true).order('sort_order'),
 supabase.from('transport_modes').select('code, name, icon, category, sub_category, is_complementary').eq('is_active', true).order('sub_category').order('name'),
 ]);
 if (profilesRes.data) {
 setTravelProfiles(profilesRes.data.map(p => ({
 code: p.code, name: p.name, icon: p.icon, description: p.description || '',
 weight_cost: p.weight_cost, weight_time: p.weight_time, weight_flexibility: p.weight_flexibility,
 weight_autonomy: p.weight_autonomy, weight_comfort: p.weight_comfort, weight_risk: p.weight_risk,
 weight_scenic: p.weight_scenic, weight_load: (p as any).weight_load ?? 1, weight_restrictions: (p as any).weight_restrictions ?? 1,
 })));
 }
 if (modesRes.data) {
 setAllTransportModes(modesRes.data.map(m => ({
 ...m,
 sub_category: (m as any).sub_category || 'autonomous',
 is_complementary: (m as any).is_complementary || false,
 })));
 }
 })();
 }, []);

  // Load user's available transport modes (3-layer)
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('user_transport_modes')
        .select('transport_mode_code, is_available, layer, preference')
        .eq('user_id', user.id);
      if (data) {
        const map = new globalThis.Map<string, TransportSelection>();
        data.filter(d => d.is_available).forEach(d => {
          const layer = (d.layer || 'owned') as TransportLayer;
          const preference = (d.preference || 'allowed') as TransportPreference;
          const key = `${layer}:${d.transport_mode_code}`;
          map.set(key, { layer, code: d.transport_mode_code, preference });
        });
        setTransportSelections(map);
      }
    })();
  }, [user]);

  // Load profile data when component mounts or profile changes
 useEffect(() => {
 const loadFullProfile = async () => {
 if (!user) return;
 
 try {
 const { data, error } = await supabase
 .from('profiles')
 .select('*')
 .eq('id', user.id)
 .maybeSingle();
 
 if (error) throw error;
 
 if (data) {
 setFormData({
 display_name: data.display_name || '',
 username: data.username || '',
 bio: data.bio || '',
 });
 setAvatarPreview(data.avatar_url || null);
 setTravelProfile((data as any).travel_profile || 'adventure');
 
          // Load priority ranking
 if ((data as any).priority_ranking) {
 const ranking = (data as any).priority_ranking;
 if (Array.isArray(ranking) && ranking.length > 0) {
 setPriorityRanking(ranking);
 }
 }
 
 setPrivacyData({
 is_private: data.is_private || false,
 duplicate_threshold_meters: data.duplicate_threshold_meters ?? 250,
 default_photo_visibility: data.default_photo_visibility || 'private',
 default_location_visibility: (data as any).default_location_visibility || 'followers',
 default_note_visibility: (data as any).default_note_visibility || 'private',
 hide_home_location: (data as any).hide_home_location ?? true,
 });
 
 setMapData({
 map_center_mode: (data.map_center_mode as MapCenterMode) || 'auto',
 home_latitude: data.home_latitude,
 home_longitude: data.home_longitude,
 home_name: data.home_name || '',
 measurement_units: ((data as any).measurement_units as 'metric' | 'imperial' | 'auto') || 'metric',
 });
 
 if (data.home_latitude) setLatInput(data.home_latitude.toString());
 if (data.home_longitude) setLngInput(data.home_longitude.toString());
 }
 } catch (e) {
 console.error('Error loading profile:', e);
 } finally {
 setIsLoading(false);
 }
 };
 
 if (user) {
 loadFullProfile();
 } else if (profile) {
      // Fallback to profile from auth hook
 setFormData({
 display_name: profile.display_name || '',
 username: profile.username || '',
 bio: profile.bio || '',
 });
 setAvatarPreview(profile.avatar_url || null);
 setPrivacyData({
 is_private: profile.is_private || false,
 duplicate_threshold_meters: profile.duplicate_threshold_meters ?? 250,
 default_photo_visibility: (profile as any).default_photo_visibility || 'private',
 default_location_visibility: (profile as any).default_location_visibility || 'followers',
 default_note_visibility: (profile as any).default_note_visibility || 'private',
 hide_home_location: (profile as any).hide_home_location ?? true,
 });
 setIsLoading(false);
 }
 }, [user, profile]);

 const initials = formData.display_name
 ?.split('')
 .map(n => n[0])
 .join('')
 .toUpperCase()
 .slice(0, 2) || formData.username?.slice(0, 2).toUpperCase() || 'U';

 const handleAvatarClick = () => {
 fileInputRef.current?.click();
 };

 const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
 const file = e.target.files?.[0];
 if (!file) return;

 const ext = file.name.split('.').pop()?.toLowerCase();
 const isHeic = ext === 'heic' || ext === 'heif' || file.type === 'image/heic' || file.type === 'image/heif';

 if (isHeic) {
 toast.error('Formato HEIC no compatible. Convierte a JPG/PNG/WebP.');
 return;
 }

 const allowedExts = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);
 const looksLikeImage = file.type.startsWith('image/') || (ext ? allowedExts.has(ext) : false);

 if (!looksLikeImage) {
 toast.error('Por favor, selecciona una imagen (JPG/PNG/WebP/GIF)');
 return;
 }

 const maxBytes = 20 * 1024 * 1024;
 if (file.size > maxBytes) {
 const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
 toast.error(`La imagen pesa ${sizeMb}MB. Máximo 20MB.`);
 return;
 }

 setAvatarFile(file);
 setAvatarPreview(URL.createObjectURL(file));
 e.currentTarget.value = '';
 };

 const uploadAvatar = async (): Promise<string | null> => {
 if (!avatarFile || !user) return profile?.avatar_url || null;

 setUploadingAvatar(true);
 try {
 const fileExt = avatarFile.name.split('.').pop()?.toLowerCase() || 'jpg';
 const fileName = `${user.id}/avatar.${fileExt}`;

 const { error: uploadError } = await supabase.storage
 .from('avatars')
 .upload(fileName, avatarFile, {
 upsert: true,
 contentType: avatarFile.type || 'image/jpeg',
 cacheControl: '3600',
 });

 if (uploadError) {
 console.error('Upload error:', uploadError);
 toast.error(uploadError.message || 'Error al subir la imagen');
 return profile?.avatar_url || null;
 }

 const { data: { publicUrl } } = supabase.storage
 .from('avatars')
 .getPublicUrl(fileName);

 return `${publicUrl}?t=${Date.now()}`;
 } catch (error) {
 console.error('Error uploading avatar:', error);
 toast.error('Error al subir la imagen');
 return profile?.avatar_url || null;
 } finally {
 setUploadingAvatar(false);
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
 
 setLoadingAddresses(true);
 try {
 const suggestions = await reverseGeocodeAddress(lat, lng);
 setAddressSuggestions(suggestions);
 
 if (suggestions.length > 0) {
 setMapData(prev => ({ ...prev, home_name: suggestions[0].shortName }));
 } else {
 setMapData(prev => ({ ...prev, home_name: 'Mi ubicación actual' }));
 }
 
 toast.success('Ubicación obtenida');
 } catch (e) {
 console.error('Error fetching addresses:', e);
 setMapData(prev => ({ ...prev, home_name: 'Mi ubicación actual' }));
 toast.success('Ubicación obtenida');
 } finally {
 setLoadingAddresses(false);
 }
 },
 (error) => {
 setGettingLocation(false);
 if (error.code === error.PERMISSION_DENIED) {
 toast.error('Permiso de ubicación denegado. Habilítalo en la configuración del navegador.');
 } else if (error.code === error.TIMEOUT) {
 toast.error('La ubicación tardó demasiado. Intenta de nuevo o escribe la dirección manualmente.');
 } else {
 toast.error('No se pudo obtener la ubicación. Usa la búsqueda de dirección.');
 }
 },
 { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
 );
 };

 const handleSelectAddress = (suggestion: AddressSuggestion) => {
 setMapData(prev => ({ ...prev, home_name: suggestion.displayName }));
 setAddressSuggestions([]);
 };

 const handleAddressSearch = (query: string) => {
 setAddressSearchQuery(query);
 if (addressSearchTimerRef.current) clearTimeout(addressSearchTimerRef.current);
 if (query.trim().length < 3) {
 setAddressSearchResults([]);
 return;
 }
 
 setSearchingAddress(true);
 addressSearchTimerRef.current = setTimeout(async () => {
 try {
 const results = await forwardGeocode(query);
 setAddressSearchResults(results);
 } catch (e) {
 console.error('Address search error:', e);
 } finally {
 setSearchingAddress(false);
 }
 }, 300);
 };

 const handleSelectSearchResult = (result: ForwardGeocodeResult) => {
 setLatInput(result.lat.toFixed(6));
 setLngInput(result.lng.toFixed(6));
 setMapData(prev => ({ ...prev, home_name: result.shortName }));
 setAddressSearchQuery(result.displayName);
 setAddressSearchResults([]);
 };

 const handleSave = async () => {
 if (!formData.username.trim()) {
 toast.error('El nombre de usuario es obligatorio');
 setActiveTab('profile');
 return;
 }

    // Validate home coordinates if they are filled in
 if (latInput.trim() || lngInput.trim()) {
 const lat = parseFloat(latInput);
 const lng = parseFloat(lngInput);
 if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
 toast.error('Coordenadas de casa inválidas');
 setActiveTab('map');
 return;
 }
 }

 setSaving(true);
 try {
 let avatar_url: string | null | undefined = profile?.avatar_url;
 if (avatarFile) {
 const uploadedUrl = await uploadAvatar();
 if (uploadedUrl) {
 avatar_url = uploadedUrl;
 }
 }

 const updates: Partial<UserProfile> & {
 map_center_mode?: string;
 home_latitude?: number | null;
 home_longitude?: number | null;
 home_name?: string | null;
 default_photo_visibility?: string;
 default_location_visibility?: string;
 default_note_visibility?: string;
 hide_home_location?: boolean;
 measurement_units?: string;
 } = {
 display_name: formData.display_name.trim() || null,
 username: formData.username.trim(),
 bio: formData.bio.trim() || null,
 is_private: privacyData.is_private,
 duplicate_threshold_meters: privacyData.duplicate_threshold_meters,
 default_photo_visibility: privacyData.default_photo_visibility,
 default_location_visibility: privacyData.default_location_visibility,
 default_note_visibility: privacyData.default_note_visibility,
 hide_home_location: privacyData.hide_home_location,
 map_center_mode: mapData.map_center_mode,
 measurement_units: mapData.measurement_units,
 travel_profile: travelProfile,
 priority_ranking: priorityRanking,
 } as any;

 if (avatarFile && avatar_url) {
 updates.avatar_url = avatar_url;
 }

      // Save home location if coordinates are provided (independent of map center mode)
 const parsedLat = parseFloat(latInput);
 const parsedLng = parseFloat(lngInput);
 if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
 updates.home_latitude = parsedLat;
 updates.home_longitude = parsedLng;
 updates.home_name = mapData.home_name.trim() || null;
 } else {
 updates.home_latitude = null;
 updates.home_longitude = null;
 updates.home_name = null;
 }

 const { error } = await updateProfile(updates as Partial<UserProfile>);
 
 if (!error) {
        // Save transport modes (3-layer)
  if (user) {
           // Delete all existing and re-insert
  await supabase.from('user_transport_modes').delete().eq('user_id', user.id);
  if (transportSelections.size > 0) {
  const rows = Array.from(transportSelections.values()).map(sel => ({
  user_id: user.id,
  transport_mode_code: sel.code,
  is_available: true,
  layer: sel.layer,
  preference: sel.preference,
  }));
  await supabase.from('user_transport_modes').insert(rows);
 }
 }

        // Update localStorage cache for map center
 const mapConfig = {
 mode: mapData.map_center_mode,
 homeLocation: (!isNaN(parseFloat(latInput)) && !isNaN(parseFloat(lngInput))) ? {
 lat: parseFloat(latInput),
 lng: parseFloat(lngInput),
 name: mapData.home_name.trim() || undefined,
 } : undefined,
 };
 localStorage.setItem('geodata-map-center-config', JSON.stringify(mapConfig));
 
 localStorage.setItem('geodata-measurement-units', mapData.measurement_units);
 
 window.dispatchEvent(new CustomEvent('measurement-units-changed', { 
 detail: { units: mapData.measurement_units } 
 }));
 
 onClose();
 }
 } catch (error) {
 console.error('Error saving profile:', error);
 toast.error('Error al guardar el perfil');
 } finally {
 setSaving(false);
 }
 };

 if (authLoading || (isLoading && !profile)) {
 return (
 <motion.div
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 className="fixed inset-0 z-[1002] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
 onClick={(e) => e.target === e.currentTarget && onClose()}
 >
 <div className="bg-background rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-4">
 <Loader2 className="w-8 h-8 animate-spin text-primary" />
 <p className="text-sm text-muted-foreground">Cargando perfil...</p>
 </div>
 </motion.div>
 );
 }

 return (
 <motion.div
 initial={{ opacity: 0, scale: 0.95 }}
 animate={{ opacity: 1, scale: 1 }}
 exit={{ opacity: 0, scale: 0.95 }}
 className="fixed inset-0 z-[1002] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
 onClick={(e) => e.target === e.currentTarget && onClose()}
 >
 <motion.div
 initial={{ y: 20 }}
 animate={{ y: 0 }}
 className="bg-background rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col"
 >
 {/* Header with Avatar */}
 <div className="relative bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-6 pb-16 flex-shrink-0">
 <Button
 variant="ghost"
 size="icon"
 onClick={onClose}
 className="absolute top-3 right-3 rounded-full bg-background/80 hover:bg-background"
 >
 <X className="w-4 h-4" />
 </Button>
 <h2 className="text-lg font-semibold">Preferencias</h2>
 </div>

 {/* Avatar - Overlapping header */}
 <div className="relative -mt-12 flex justify-center flex-shrink-0 z-10">
 <div 
 className="relative cursor-pointer group"
 onClick={handleAvatarClick}
 >
 <Avatar className="w-24 h-24 border-4 border-background shadow-lg">
 <AvatarImage
 src={avatarPreview || undefined}
 alt={formData.display_name || formData.username || 'Avatar'}
 />
 <AvatarFallback className="bg-gradient-to-br from-primary to-blue-500 text-white text-2xl">
 {initials}
 </AvatarFallback>
 </Avatar>
 <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
 {uploadingAvatar ? (
 <Loader2 className="w-6 h-6 text-white animate-spin" />
 ) : (
 <Camera className="w-6 h-6 text-white" />
 )}
 </div>
 <input
 ref={fileInputRef}
 type="file"
 accept="image/png,image/jpeg,image/webp,image/gif"
 onChange={handleFileChange}
 className="hidden"
 />
 </div>
 </div>

 {/* Tabs */}
 <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
 <TabsList className="mx-6 mt-4 grid grid-cols-4 flex-shrink-0">
 <TabsTrigger value="profile" className="gap-1 text-xs sm:text-sm">
 <User className="w-4 h-4" />
 <span className="hidden sm:inline">Perfil</span>
 </TabsTrigger>
 <TabsTrigger value="travel" className="gap-1 text-xs sm:text-sm">
 <Compass className="w-4 h-4" />
 <span className="hidden sm:inline">Viaje</span>
 </TabsTrigger>
 <TabsTrigger value="privacy" className="gap-1 text-xs sm:text-sm">
 <Shield className="w-4 h-4" />
 <span className="hidden sm:inline">Privacidad</span>
 </TabsTrigger>
 <TabsTrigger value="map" className="gap-1 text-xs sm:text-sm">
 <MapIcon className="w-4 h-4" />
 <span className="hidden sm:inline">Mapa</span>
 </TabsTrigger>
 </TabsList>

 <div className="flex-1 overflow-y-auto">
 {/* Profile Tab */}
 <TabsContent value="profile" className="p-6 space-y-5 mt-0">
 {/* Display Name */}
 <div className="space-y-2">
 <Label htmlFor="display_name" className="flex items-center gap-2 text-sm">
 <User className="w-4 h-4 text-muted-foreground" />
 Nombre para mostrar
 </Label>
 <Input
 id="display_name"
 value={formData.display_name}
 onChange={(e) => setFormData(prev => ({ ...prev, display_name: e.target.value }))}
 placeholder="Tu nombre"
 className="h-11"
 />
 </div>

 {/* Username */}
 <div className="space-y-2">
 <Label htmlFor="username" className="flex items-center gap-2 text-sm">
 <AtSign className="w-4 h-4 text-muted-foreground" />
 Nombre de usuario
 </Label>
 <Input
 id="username"
 value={formData.username}
 onChange={(e) => setFormData(prev => ({ 
 ...prev, 
 username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')
 }))}
 placeholder="usuario"
 className="h-11"
 />
 <p className="text-xs text-muted-foreground">
 Solo letras minúsculas, números y guiones bajos
 </p>
 </div>

 {/* Bio */}
 <div className="space-y-2">
 <Label htmlFor="bio" className="flex items-center gap-2 text-sm">
 <FileText className="w-4 h-4 text-muted-foreground" />
 Biografía
 </Label>
 <Textarea
 id="bio"
 value={formData.bio}
 onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
 placeholder="Cuéntanos algo sobre ti..."
 className="min-h-[80px] resize-none"
 maxLength={200}
 />
 <p className="text-xs text-muted-foreground text-right">
 {formData.bio.length}/200
 </p>
 </div>

 {/* Stats preview */}
 <div className="flex items-center justify-center gap-8 pt-2 text-center">
 <div>
 <p className="text-2xl font-bold text-primary">
 {statsLoading ? '-' : stats.myLocationsCount}
 </p>
 <p className="text-xs text-muted-foreground">Puntos</p>
 </div>
 <div className="w-px h-8 bg-border" />
 <div>
 <p className="text-2xl font-bold">
 {statsLoading ? '-' : stats.followersCount}
 </p>
 <p className="text-xs text-muted-foreground">Seguidores</p>
 </div>
 <div className="w-px h-8 bg-border" />
 <div>
 <p className="text-2xl font-bold">
 {statsLoading ? '-' : stats.followingCount}
 </p>
 <p className="text-xs text-muted-foreground">Siguiendo</p>
 </div>
 </div>
 </TabsContent>

 {/* Travel Tab */}
 <TabsContent value="travel" className="p-6 space-y-6 mt-0">

 {/* Block 1: Priority Ranking (drag to reorder) */}
 <div className="space-y-2">
 <Label className="flex items-center gap-2 text-sm font-semibold">
 <Compass className="w-4 h-4 text-muted-foreground" />
 ¿Qué priorizas?
 </Label>
 <p className="text-xs text-muted-foreground">
 Arrastra para ordenar de más a menos importante
 </p>
 <div className="space-y-1">
 {priorityRanking.map((code, idx) => {
 const item = PRIORITY_ITEMS.find(p => p.code === code);
 if (!item) return null;
 const isDragging = dragPriorityIdx === idx;
 return (
 <div
 key={code}
 draggable
 onDragStart={() => setDragPriorityIdx(idx)}
 onDragOver={(e) => {
 e.preventDefault();
 if (dragPriorityIdx === null || dragPriorityIdx === idx) return;
 setPriorityRanking(prev => {
 const next = [...prev];
 const [moved] = next.splice(dragPriorityIdx, 1);
 next.splice(idx, 0, moved);
 return next;
 });
 setDragPriorityIdx(idx);
 }}
 onDragEnd={() => setDragPriorityIdx(null)}
 className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-grab active:cursor-grabbing transition-all ${
 isDragging
 ? 'border-primary bg-primary/10 shadow-md scale-[1.02]'
 : 'border-border bg-card hover:bg-muted/30'
 }`}
 >
 <GripVertical className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
 <Badge variant="outline" className="text-[10px] w-5 h-5 flex items-center justify-center p-0 shrink-0 font-bold">
 {idx + 1}
 </Badge>
 <span className="text-sm">{item.icon}</span>
 <span className="text-sm flex-1">{item.label}</span>
 </div>
 );
 })}
 </div>
 </div>

  <Separator />

  {/* 3-Layer Transport System */}
  {ALL_LAYERS.map(layer => {
    const LayerIcon = layer.icon;
    return (
      <div key={layer.key} className="space-y-3">
        <div>
          <Label className="flex items-center gap-2 text-sm font-semibold">
            <LayerIcon className="w-4 h-4 text-muted-foreground" />
            {layer.title}
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">{layer.subtitle}</p>
        </div>

        {layer.groups.map(group => {
          const GroupIcon = group.icon;
          const modes = group.codes.map(code => allTransportModes.find(m => m.code === code)).filter(Boolean) as typeof allTransportModes;
          // Also show codes that aren't in DB yet as fallback labels
          const allCodes = group.codes;
          return (
            <div key={group.label} className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <GroupIcon className="w-3.5 h-3.5" />{group.label}
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {allCodes.map(code => {
                  const mode = allTransportModes.find(m => m.code === code);
                  const key = `${layer.key}:${code}`;
                  const sel = transportSelections.get(key);
                  const isSelected = !!sel;
                  return (
                    <div key={code} className="space-y-1">
                      <label
                        className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors text-sm ${
                          isSelected ? 'border-primary/40 bg-primary/5' : 'border-border hover:bg-muted/30'
                        }`}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleTransport(layer.key, code)}
                        />
                        {mode ? renderTransportModeIcon(mode.code, mode.icon, 'w-4 h-4') : null}
                        <span className="text-xs truncate">{mode?.name || code}</span>
                      </label>
                      {isSelected && (
                        <div className="flex gap-1 pl-1">
                          {PREFERENCE_OPTIONS.map(opt => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setTransportPreference(layer.key, code, opt.value)}
                              className={`text-[9px] px-1.5 py-0.5 rounded-full border transition-colors ${
                                sel?.preference === opt.value
                                  ? 'border-primary bg-primary/10 text-primary font-medium'
                                  : 'border-border text-muted-foreground hover:bg-muted/30'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        <Separator />
      </div>
    );
  })}

  {transportSelections.size === 0 && (
  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
   <AlertTriangle className="w-3.5 h-3.5" />
   Sin medios seleccionados se mostrarán todas las opciones
  </p>
 )}
 </TabsContent>

 {/* Privacy Tab */}
 <TabsContent value="privacy" className="p-6 space-y-5 mt-0">
 {/* Privacy Toggle */}
 <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
 <div className="flex items-center gap-3">
 {privacyData.is_private ? (
 <Lock className="w-5 h-5 text-amber-500" />
 ) : (
 <Unlock className="w-5 h-5 text-green-500" />
 )}
 <div>
 <p className="font-medium text-sm">
 {privacyData.is_private ? 'Cuenta privada' : 'Cuenta pública'}
 </p>
 <p className="text-xs text-muted-foreground">
 {privacyData.is_private 
 ? 'Solo seguidores aprobados pueden ver tus puntos'
 : 'Cualquiera puede ver tus puntos públicos'
 }
 </p>
 </div>
 </div>
 <Switch
 checked={privacyData.is_private}
 onCheckedChange={(checked) => setPrivacyData(prev => ({ ...prev, is_private: checked }))}
 className={privacyData.is_private 
 ? 'data-[state=checked]:bg-amber-500' 
 : 'data-[state=unchecked]:bg-green-500'
 }
 />
 </div>

 {/* Default Location Visibility */}
 <div className="space-y-3">
 <Label className="flex items-center gap-2 text-sm">
 <MapPin className="w-4 h-4 text-muted-foreground" />
 Visibilidad por defecto de localizaciones
 </Label>
 <div className="space-y-2">
 {VISIBILITY_OPTIONS.map((option) => (
 <div
 key={option.value}
 onClick={() => setPrivacyData(prev => ({ ...prev, default_location_visibility: option.value }))}
 className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
 privacyData.default_location_visibility === option.value
 ? 'border-primary bg-primary/5'
 : 'border-border hover:bg-muted/50'
 }`}
 >
 <option.icon className={`w-5 h-5 ${
 privacyData.default_location_visibility === option.value ? 'text-primary' : 'text-muted-foreground'
 }`} />
 <div className="flex-1">
 <p className="font-medium text-sm">{option.label}</p>
 <p className="text-xs text-muted-foreground">{option.description}</p>
 </div>
 <div className={`w-4 h-4 rounded-full border-2 ${
 privacyData.default_location_visibility === option.value
 ? 'border-primary bg-primary'
 : 'border-muted-foreground'
 }`}>
 {privacyData.default_location_visibility === option.value && (
 <div className="w-full h-full flex items-center justify-center">
 <div className="w-1.5 h-1.5 rounded-full bg-white" />
 </div>
 )}
 </div>
 </div>
 ))}
 </div>
 </div>

 {/* Default Photo Visibility */}
 <div className="space-y-3">
 <Label className="flex items-center gap-2 text-sm">
 <Image className="w-4 h-4 text-muted-foreground" />
 Visibilidad por defecto de fotos
 </Label>
 <div className="space-y-2">
 {VISIBILITY_OPTIONS.map((option) => (
 <div
 key={option.value}
 onClick={() => setPrivacyData(prev => ({ ...prev, default_photo_visibility: option.value }))}
 className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
 privacyData.default_photo_visibility === option.value
 ? 'border-primary bg-primary/5'
 : 'border-border hover:bg-muted/50'
 }`}
 >
 <option.icon className={`w-5 h-5 ${
 privacyData.default_photo_visibility === option.value ? 'text-primary' : 'text-muted-foreground'
 }`} />
 <div className="flex-1">
 <p className="font-medium text-sm">{option.label}</p>
 <p className="text-xs text-muted-foreground">{option.description}</p>
 </div>
 <div className={`w-4 h-4 rounded-full border-2 ${
 privacyData.default_photo_visibility === option.value
 ? 'border-primary bg-primary'
 : 'border-muted-foreground'
 }`}>
 {privacyData.default_photo_visibility === option.value && (
 <div className="w-full h-full flex items-center justify-center">
 <div className="w-1.5 h-1.5 rounded-full bg-white" />
 </div>
 )}
 </div>
 </div>
 ))}
 </div>
 </div>

 {/* Default Note Visibility */}
 <div className="space-y-3">
 <Label className="flex items-center gap-2 text-sm">
 <FileText className="w-4 h-4 text-muted-foreground" />
 Visibilidad por defecto de notas
 </Label>
 <div className="space-y-2">
 {VISIBILITY_OPTIONS.map((option) => (
 <div
 key={option.value}
 onClick={() => setPrivacyData(prev => ({ ...prev, default_note_visibility: option.value }))}
 className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
 privacyData.default_note_visibility === option.value
 ? 'border-primary bg-primary/5'
 : 'border-border hover:bg-muted/50'
 }`}
 >
 <option.icon className={`w-5 h-5 ${
 privacyData.default_note_visibility === option.value ? 'text-primary' : 'text-muted-foreground'
 }`} />
 <div className="flex-1">
 <p className="font-medium text-sm">{option.label}</p>
 <p className="text-xs text-muted-foreground">{option.description}</p>
 </div>
 <div className={`w-4 h-4 rounded-full border-2 ${
 privacyData.default_note_visibility === option.value
 ? 'border-primary bg-primary'
 : 'border-muted-foreground'
 }`}>
 {privacyData.default_note_visibility === option.value && (
 <div className="w-full h-full flex items-center justify-center">
 <div className="w-1.5 h-1.5 rounded-full bg-white" />
 </div>
 )}
 </div>
 </div>
 ))}
 </div>
 </div>

 {/* Hide Home Location */}
 <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
 <div className="flex items-center gap-3">
 <Home className={`w-5 h-5 ${privacyData.hide_home_location ? 'text-primary' : 'text-muted-foreground'}`} />
 <div>
 <p className="font-medium text-sm">Ocultar ubicación de casa</p>
 <p className="text-xs text-muted-foreground">
 {privacyData.hide_home_location
 ? 'Tu ubicación de casa no es visible para otros usuarios'
 : 'Otros usuarios pueden ver tu ubicación de casa'
 }
 </p>
 </div>
 </div>
 <Switch
 checked={privacyData.hide_home_location}
 onCheckedChange={(checked) => setPrivacyData(prev => ({ ...prev, hide_home_location: checked }))}
 />
 </div>

 {/* Duplicate Threshold */}
 <div className="space-y-2">
 <Label className="flex items-center gap-2 text-sm">
 <Copy className="w-4 h-4 text-muted-foreground" />
 Umbral de duplicados
 </Label>
 <Select
 value={String(privacyData.duplicate_threshold_meters)}
 onValueChange={(value) => setPrivacyData(prev => ({ 
 ...prev, 
 duplicate_threshold_meters: Number(value) 
 }))}
 >
 <SelectTrigger className="h-11">
 <SelectValue />
 </SelectTrigger>
 <SelectContent className="z-[2100]">
 {DISTANCE_OPTIONS.map(opt => (
 <SelectItem key={opt.value} value={String(opt.value)}>
 {opt.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 <p className="text-xs text-muted-foreground">
 Distancia máxima entre puntos para considerarlos duplicados
 </p>
 </div>
 </TabsContent>

 {/* Map Tab */}
 <TabsContent value="map" className="p-6 space-y-4 mt-0">
 <div className="space-y-1">
 <Label className="flex items-center gap-2 text-sm font-medium">
 <MapPin className="w-4 h-4 text-muted-foreground" />
 Centro inicial del mapa
 </Label>
 <p className="text-xs text-muted-foreground">
 Configura dónde se centra el mapa al abrir la aplicación
 </p>
 </div>

 <RadioGroup
 value={mapData.map_center_mode}
 onValueChange={(value) => setMapData(prev => ({ ...prev, map_center_mode: value as MapCenterMode }))}
 className="space-y-2"
 >
 <div className={`flex items-start space-x-3 p-3 rounded-lg border transition-colors cursor-pointer ${
 mapData.map_center_mode === 'auto' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
 }`}>
 <RadioGroupItem value="auto" id="auto" className="mt-0.5" />
 <div className="flex-1">
 <Label htmlFor="auto" className="font-medium cursor-pointer flex items-center gap-2 text-sm">
 <MapPin className="w-4 h-4 text-primary" />
 Automático
 </Label>
 <p className="text-xs text-muted-foreground mt-0.5">
 Ver todos los puntos
 </p>
 </div>
 </div>

 <div className={`flex items-start space-x-3 p-3 rounded-lg border transition-colors cursor-pointer ${
 mapData.map_center_mode === 'geolocation' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
 }`}>
 <RadioGroupItem value="geolocation" id="geolocation" className="mt-0.5" />
 <div className="flex-1">
 <Label htmlFor="geolocation" className="font-medium cursor-pointer flex items-center gap-2 text-sm">
 <Navigation className="w-4 h-4 text-blue-500" />
 Mi ubicación GPS
 </Label>
 <p className="text-xs text-muted-foreground mt-0.5">
 Usar tu ubicación actual
 </p>
 </div>
 </div>

 <div className={`flex items-start space-x-3 p-3 rounded-lg border transition-colors cursor-pointer ${
 mapData.map_center_mode === 'home' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
 }`}>
 <RadioGroupItem value="home" id="home" className="mt-0.5" />
 <div className="flex-1">
 <Label htmlFor="home" className="font-medium cursor-pointer flex items-center gap-2 text-sm">
 <Home className="w-4 h-4 text-green-600" />
 Mi casa
 </Label>
 <p className="text-xs text-muted-foreground mt-0.5">
 Ubicación fija personalizada
 </p>
 </div>
 </div>
 </RadioGroup>

 {/* Home location - always visible, independent of map center mode */}
 <div className="space-y-3 pt-4 border-t">
 <div className="space-y-1">
 <Label className="flex items-center gap-2 text-sm font-medium">
 <Home className="w-4 h-4 text-green-600" />
 Mi casa
 </Label>
 <p className="text-xs text-muted-foreground">
 Define tu ubicación de casa para centrar el mapa y usarla como punto de partida/destino en itinerarios
 </p>
 </div>

 <div className="space-y-4 p-4 bg-muted/30 rounded-lg border">
 {/* Combined address search + name field */}
 <div className="space-y-2">
 <Label htmlFor="home_name" className="text-sm">Dirección o nombre</Label>
 <div className="relative">
 <Input
 id="home_name"
 placeholder="Escribe una dirección, ciudad o nombre..."
 value={addressSearchQuery || mapData.home_name}
 onChange={(e) => {
 const val = e.target.value;
 setAddressSearchQuery(val);
 setMapData(prev => ({ ...prev, home_name: val }));
 handleAddressSearch(val);
 }}
 onFocus={() => {
 if (mapData.home_name && mapData.home_name.length >= 3 && addressSearchResults.length === 0) {
 handleAddressSearch(mapData.home_name);
 }
 }}
 className="h-10 pr-8"
 />
 {searchingAddress && (
 <Loader2 className="w-4 h-4 animate-spin absolute right-2.5 top-3 text-muted-foreground" />
 )}
 </div>
 {addressSearchResults.length > 0 && (
 <div className="space-y-1 max-h-48 overflow-y-auto rounded-lg border bg-background p-1 shadow-md">
 {addressSearchResults.map((result, index) => (
 <button
 key={index}
 type="button"
 onClick={() => {
 handleSelectSearchResult(result);
 setAddressSearchQuery('');
 }}
 className="w-full text-left p-2 rounded-md text-xs transition-colors hover:bg-muted"
 >
 <span className="font-medium">{result.shortName}</span>
 <span className="block text-muted-foreground truncate">{result.displayName}</span>
 </button>
 ))}
 </div>
 )}
 </div>

 {/* Lat/Lng display (read-only when filled from search, editable otherwise) */}
 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-2">
 <Label htmlFor="lat" className="text-sm text-muted-foreground">Latitud</Label>
 <Input
 id="lat"
 type="number"
 step="any"
 placeholder="40.416775"
 value={latInput}
 onChange={(e) => setLatInput(e.target.value)}
 className="h-9 text-xs"
 />
 </div>
 <div className="space-y-2">
 <Label htmlFor="lng" className="text-sm text-muted-foreground">Longitud</Label>
 <Input
 id="lng"
 type="number"
 step="any"
 placeholder="-3.703790"
 value={lngInput}
 onChange={(e) => setLngInput(e.target.value)}
 className="h-9 text-xs"
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

 {addressSuggestions.length > 0 && (
 <div className="space-y-2">
 <Label className="text-xs font-medium">Selecciona tu dirección:</Label>
 <div className="space-y-1 max-h-32 overflow-y-auto">
 {addressSuggestions.map((suggestion, index) => (
 <button
 key={index}
 type="button"
 onClick={() => handleSelectAddress(suggestion)}
 className={`w-full text-left p-2 rounded-md border text-xs transition-colors hover:bg-primary/10 hover:border-primary ${
 mapData.home_name === suggestion.displayName 
 ? 'bg-primary/10 border-primary' 
 : 'bg-background'
 }`}
 >
 <span className="truncate block">{suggestion.displayName}</span>
 </button>
 ))}
 </div>
 </div>
 )}
 </div>
 </div>

 {/* Measurement Units Preference */}
 <div className="space-y-3 pt-4 border-t">
 <div className="space-y-1">
 <Label className="flex items-center gap-2 text-sm font-medium">
 <Settings className="w-4 h-4 text-muted-foreground" />
 Unidades de medida
 </Label>
 <p className="text-xs text-muted-foreground">
 Sistema de medición para distancias en el mapa
 </p>
 </div>

 <RadioGroup
 value={mapData.measurement_units}
 onValueChange={(value) => setMapData(prev => ({ ...prev, measurement_units: value as 'metric' | 'imperial' | 'auto' }))}
 className="space-y-2"
 >
 <div className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors cursor-pointer ${
 mapData.measurement_units === 'metric' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
 }`}>
 <RadioGroupItem value="metric" id="metric" />
 <Label htmlFor="metric" className="flex-1 cursor-pointer">
 <div className="font-medium text-sm">Métrico</div>
 <p className="text-xs text-muted-foreground">Metros y kilómetros (m, km)</p>
 </Label>
 </div>

 <div className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors cursor-pointer ${
 mapData.measurement_units === 'imperial' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
 }`}>
 <RadioGroupItem value="imperial" id="imperial" />
 <Label htmlFor="imperial" className="flex-1 cursor-pointer">
 <div className="font-medium text-sm">Imperial</div>
 <p className="text-xs text-muted-foreground">Pies y millas (ft, mi)</p>
 </Label>
 </div>

 <div className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors cursor-pointer ${
 mapData.measurement_units === 'auto' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
 }`}>
 <RadioGroupItem value="auto" id="units-auto" />
 <Label htmlFor="units-auto" className="flex-1 cursor-pointer">
 <div className="font-medium text-sm">Automático</div>
 <p className="text-xs text-muted-foreground">Detectar según tu país</p>
 </Label>
 </div>
 </RadioGroup>
 </div>
 </TabsContent>
 </div>

 {/* Save Button - Fixed at bottom */}
 <div className="p-6 pt-4 border-t flex-shrink-0">
 <Button 
 onClick={handleSave} 
 disabled={saving || uploadingAvatar}
 className="w-full h-11 gap-2"
 >
 {saving ? (
 <>
 <Loader2 className="w-4 h-4 animate-spin" />
 Guardando...
 </>
 ) : (
 <>
 <Save className="w-4 h-4" />
 Guardar cambios
 </>
 )}
 </Button>
 </div>
 </Tabs>
 </motion.div>
 </motion.div>
 );
}
