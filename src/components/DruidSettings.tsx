import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings2,
  Save,
  X,
  Loader2,
  MapPin,
  Play,
  Leaf,
  RefreshCw,
  Target,
  Search,
  Clock,
  Sparkles,
  FileText,
  Image,
  Link,
  Hash,
  Star,
  Phone,
  BookOpen,
  Navigation,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface DruidSettingsProps {
  druidId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
}

interface DruidData {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  icon: string;
  color: string;
  search_center_lat: number | null;
  search_center_lng: number | null;
  search_radius_km: number;
  overpass_query: string | null;
  search_keywords: string[] | null;
  category_filter: string | null;
  max_results: number;
  refresh_interval_hours: number;
  auto_enrich: boolean;
  is_active: boolean;
  // Enrichment settings
  enrichment_tone: string;
  enrichment_expected_nature: string;
  enrichment_min_length: number;
  enrichment_custom_prompt: string | null;
  enrichment_include_image: boolean;
  enrichment_include_web: boolean;
  enrichment_include_tags: boolean;
  enrichment_include_interest_index: boolean;
  enrichment_include_contact: boolean;
  enrichment_show_sources: boolean;
  enrichment_search_radius_meters: number;
  enrichment_correct_coordinates: boolean;
  min_visibility_zoom: number | null;
  visibility_radius_meters: number | null;
}

const OVERPASS_PRESETS = [
  { label: 'Veterinarios', value: 'amenity=veterinary' },
  { label: 'Monasterios', value: 'amenity=monastery' },
  { label: 'Castillos', value: 'historic=castle' },
  { label: 'Ruinas', value: 'historic=ruins' },
  { label: 'Ermitas', value: 'building=chapel' },
  { label: 'Miradores', value: 'tourism=viewpoint' },
  { label: 'Cuevas', value: 'natural=cave_entrance' },
  { label: 'Picos', value: 'natural=peak' },
  { label: 'Cascadas', value: 'waterway=waterfall' },
  { label: 'Fuentes', value: 'amenity=drinking_water' },
  { label: 'Refugios', value: 'tourism=alpine_hut' },
  { label: 'Campings', value: 'tourism=camp_site' },
  { label: 'Áreas de autocaravanas', value: 'tourism=caravan_site' },
  { label: 'Museos', value: 'tourism=museum' },
  { label: 'Iglesias', value: 'amenity=place_of_worship' },
  { label: 'Hospitales', value: 'amenity=hospital' },
  { label: 'Farmacias', value: 'amenity=pharmacy' },
  { label: 'Gasolineras', value: 'amenity=fuel' },
  { label: 'Restaurantes', value: 'amenity=restaurant' },
  { label: 'Bares', value: 'amenity=bar' },
  { label: 'Hoteles', value: 'tourism=hotel' },
  { label: 'Playas', value: 'natural=beach' },
];

const TONE_OPTIONS = [
  { value: 'tecnico', label: 'Técnico', description: 'Preciso y objetivo' },
  { value: 'divulgativo', label: 'Divulgativo', description: 'Accesible y educativo' },
  { value: 'poetico', label: 'Poético', description: 'Evocador y literario' },
];

export function DruidSettings({ druidId, open, onOpenChange, onSave }: DruidSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [druid, setDruid] = useState<DruidData | null>(null);
  const [locationCount, setLocationCount] = useState(0);
  const [newKeyword, setNewKeyword] = useState('');

  // Load druid data
  useEffect(() => {
    if (!open || !druidId) return;

    const loadDruid = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('druids')
          .select('*')
          .eq('id', druidId)
          .single();

        if (error) throw error;
        setDruid(data as DruidData);

        // Get location count
        const { count } = await supabase
          .from('druid_locations')
          .select('id', { count: 'exact', head: true })
          .eq('druid_id', druidId);

        setLocationCount(count || 0);
      } catch (err) {
        console.error('Error loading druid:', err);
        toast.error('Error al cargar druida');
      } finally {
        setLoading(false);
      }
    };

    loadDruid();
  }, [open, druidId]);

  const handleSave = async () => {
    if (!druid) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('druids')
        .update({
          name: druid.name,
          description: druid.description,
          category: druid.category,
          icon: druid.icon,
          color: druid.color,
          search_center_lat: druid.search_center_lat,
          search_center_lng: druid.search_center_lng,
          search_radius_km: druid.search_radius_km,
          overpass_query: druid.overpass_query,
          search_keywords: druid.search_keywords,
          category_filter: druid.category_filter,
          max_results: druid.max_results,
          refresh_interval_hours: druid.refresh_interval_hours,
          auto_enrich: druid.auto_enrich,
          is_active: druid.is_active,
          enrichment_tone: druid.enrichment_tone,
          enrichment_expected_nature: druid.enrichment_expected_nature,
          enrichment_min_length: druid.enrichment_min_length,
          enrichment_custom_prompt: druid.enrichment_custom_prompt,
          enrichment_include_image: druid.enrichment_include_image,
          enrichment_include_web: druid.enrichment_include_web,
          enrichment_include_tags: druid.enrichment_include_tags,
          enrichment_include_interest_index: druid.enrichment_include_interest_index,
          enrichment_include_contact: druid.enrichment_include_contact,
          enrichment_show_sources: druid.enrichment_show_sources,
          enrichment_search_radius_meters: druid.enrichment_search_radius_meters,
          enrichment_correct_coordinates: druid.enrichment_correct_coordinates,
          min_visibility_zoom: druid.min_visibility_zoom,
          visibility_radius_meters: druid.visibility_radius_meters,
        })
        .eq('id', druidId);

      if (error) throw error;

      toast.success('Druida guardado');
      onSave?.();
    } catch (err) {
      console.error('Error saving druid:', err);
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleRunSearch = async () => {
    setRunning(true);
    
    // Siempre usar la ubicación actual del usuario
    if (!navigator.geolocation) {
      toast.error('Geolocalización no soportada en este navegador');
      setRunning(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const currentLat = position.coords.latitude;
        const currentLng = position.coords.longitude;

        try {
          const { data, error } = await supabase.functions.invoke('druid-search', {
            body: { 
              druid_id: druidId, 
              force_refresh: true,
              override_center_lat: currentLat,
              override_center_lng: currentLng,
            }
          });

          if (error) throw error;

          toast.success(`Búsqueda completada desde tu ubicación: ${data.totalLocationsInserted || 0} puntos encontrados`);
          setLocationCount(data.totalLocationsInserted || locationCount);
        } catch (err) {
          console.error('Druid search error:', err);
          toast.error('Error en la búsqueda');
        } finally {
          setRunning(false);
        }
      },
      (error) => {
        console.error('Geolocation error:', error);
        toast.error('No se pudo obtener tu ubicación. Activa la geolocalización.');
        setRunning(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const addKeyword = () => {
    if (!newKeyword.trim() || !druid) return;
    const keywords = druid.search_keywords || [];
    if (!keywords.includes(newKeyword.trim())) {
      setDruid({
        ...druid,
        search_keywords: [...keywords, newKeyword.trim()]
      });
    }
    setNewKeyword('');
  };

  const removeKeyword = (keyword: string) => {
    if (!druid) return;
    setDruid({
      ...druid,
      search_keywords: (druid.search_keywords || []).filter(k => k !== keyword)
    });
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!druid) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ backgroundColor: `${druid.color}20` }}
            >
              <span className="text-xl">{druid.icon}</span>
            </div>
            <div>
              <span>{druid.name}</span>
              <Badge 
                className="ml-2 text-white text-xs"
                style={{ backgroundColor: druid.color }}
              >
                Druida
              </Badge>
            </div>
            <div className="ml-auto flex items-center gap-2 text-sm font-normal">
              <Leaf className="w-4 h-4" style={{ color: druid.color }} />
              <span className="font-bold">{locationCount}</span>
              <span className="text-muted-foreground">ubicaciones</span>
            </div>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="search" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="w-fit">
            <TabsTrigger value="search" className="gap-2">
              <Search className="w-4 h-4" />
              Búsqueda
            </TabsTrigger>
            <TabsTrigger value="enrichment" className="gap-2">
              <Sparkles className="w-4 h-4" />
              Enriquecimiento
            </TabsTrigger>
            <TabsTrigger value="visibility" className="gap-2">
              <Target className="w-4 h-4" />
              Visibilidad
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto py-4">
            {/* Search Tab */}
            <TabsContent value="search" className="m-0 space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <Input
                    value={druid.name}
                    onChange={(e) => setDruid({ ...druid, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Categoría</Label>
                  <Input
                    value={druid.category || ''}
                    onChange={(e) => setDruid({ ...druid, category: e.target.value })}
                    placeholder="Ej: Veterinarios, Histórico..."
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Descripción</Label>
                <Textarea
                  value={druid.description || ''}
                  onChange={(e) => setDruid({ ...druid, description: e.target.value })}
                  placeholder="Descripción del druida..."
                  rows={2}
                />
              </div>

              <Separator />

              {/* Search Center - Always uses current location */}
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
                  <Navigation className="w-5 h-5 text-primary" />
                  <div className="flex-1">
                    <p className="font-medium text-sm">Centro de búsqueda automático</p>
                    <p className="text-xs text-muted-foreground">
                      Al ejecutar la búsqueda, se usará tu ubicación actual en ese momento
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Radio de búsqueda</Label>
                    <span className="text-sm font-medium">{druid.search_radius_km} km</span>
                  </div>
                  <Slider
                    value={[druid.search_radius_km]}
                    onValueChange={([v]) => setDruid({ ...druid, search_radius_km: v })}
                    min={5}
                    max={500}
                    step={5}
                  />
                </div>
              </div>

              <Separator />

              {/* Overpass Query */}
              <div className="space-y-4">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <Search className="w-4 h-4" />
                  Query Overpass (OpenStreetMap)
                </Label>

                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Preset rápido</Label>
                  <Select
                    value=""
                    onValueChange={(value) => setDruid({ ...druid, overpass_query: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar categoría..." />
                    </SelectTrigger>
                    <SelectContent>
                      {OVERPASS_PRESETS.map((preset) => (
                        <SelectItem key={preset.value} value={preset.value}>
                          {preset.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Query personalizado</Label>
                  <Input
                    value={druid.overpass_query || ''}
                    onChange={(e) => setDruid({ ...druid, overpass_query: e.target.value })}
                    placeholder="amenity=veterinary"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Formato: clave=valor (ej: historic=castle, natural=peak)
                  </p>
                </div>
              </div>

              <Separator />

              {/* Keywords Filter */}
              <div className="space-y-4">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <Hash className="w-4 h-4" />
                  Keywords de filtro (opcional)
                </Label>
                <p className="text-sm text-muted-foreground">
                  Solo se incluirán puntos que contengan al menos una de estas palabras
                </p>

                <div className="flex gap-2">
                  <Input
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    placeholder="Añadir keyword..."
                    onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
                  />
                  <Button variant="outline" onClick={addKeyword}>
                    Añadir
                  </Button>
                </div>

                {druid.search_keywords && druid.search_keywords.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {druid.search_keywords.map((kw) => (
                      <Badge key={kw} variant="secondary" className="gap-1">
                        {kw}
                        <X 
                          className="w-3 h-3 cursor-pointer hover:text-destructive" 
                          onClick={() => removeKeyword(kw)}
                        />
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* Refresh Settings */}
              <div className="space-y-4">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Programación
                </Label>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Intervalo de refresco</Label>
                    <Select
                      value={String(druid.refresh_interval_hours)}
                      onValueChange={(v) => setDruid({ ...druid, refresh_interval_hours: parseInt(v) })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Cada hora</SelectItem>
                        <SelectItem value="6">Cada 6 horas</SelectItem>
                        <SelectItem value="12">Cada 12 horas</SelectItem>
                        <SelectItem value="24">Diario</SelectItem>
                        <SelectItem value="168">Semanal</SelectItem>
                        <SelectItem value="720">Mensual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Máximo resultados</Label>
                    <Input
                      type="number"
                      value={druid.max_results}
                      onChange={(e) => setDruid({ ...druid, max_results: parseInt(e.target.value) || 100 })}
                      min={10}
                      max={1000}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div>
                    <Label>Auto-enriquecer</Label>
                    <p className="text-xs text-muted-foreground">
                      Enriquecer automáticamente los puntos encontrados
                    </p>
                  </div>
                  <Switch
                    checked={druid.auto_enrich}
                    onCheckedChange={(checked) => setDruid({ ...druid, auto_enrich: checked })}
                  />
                </div>

                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div>
                    <Label>Druida activo</Label>
                    <p className="text-xs text-muted-foreground">
                      Desactivar para pausar las búsquedas programadas
                    </p>
                  </div>
                  <Switch
                    checked={druid.is_active}
                    onCheckedChange={(checked) => setDruid({ ...druid, is_active: checked })}
                  />
                </div>
              </div>
            </TabsContent>

            {/* Enrichment Tab */}
            <TabsContent value="enrichment" className="m-0 space-y-6">
              <div className="space-y-4">
                <Label className="text-base font-semibold">Tono del contenido</Label>
                <div className="grid grid-cols-3 gap-3">
                  {TONE_OPTIONS.map((tone) => (
                    <button
                      key={tone.value}
                      onClick={() => setDruid({ ...druid, enrichment_tone: tone.value })}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        druid.enrichment_tone === tone.value
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <div className="font-medium">{tone.label}</div>
                      <div className="text-xs text-muted-foreground">{tone.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Naturaleza esperada</Label>
                <Input
                  value={druid.enrichment_expected_nature}
                  onChange={(e) => setDruid({ ...druid, enrichment_expected_nature: e.target.value })}
                  placeholder="Ej: clínica veterinaria, monasterio medieval..."
                />
                <p className="text-xs text-muted-foreground">
                  Describe qué tipo de lugares esperas encontrar
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Longitud mínima descripción</Label>
                  <span className="text-sm font-medium">{druid.enrichment_min_length} caracteres</span>
                </div>
                <Slider
                  value={[druid.enrichment_min_length]}
                  onValueChange={([v]) => setDruid({ ...druid, enrichment_min_length: v })}
                  min={500}
                  max={3000}
                  step={100}
                />
              </div>

              <Separator />

              <div className="space-y-4">
                <Label className="text-base font-semibold">Incluir en el enriquecimiento</Label>
                
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: 'enrichment_include_image', label: 'Imagen', icon: Image },
                    { key: 'enrichment_include_web', label: 'Web/URL', icon: Link },
                    { key: 'enrichment_include_tags', label: 'Hashtags', icon: Hash },
                    { key: 'enrichment_include_interest_index', label: 'Índice de interés', icon: Star },
                    { key: 'enrichment_include_contact', label: 'Contacto', icon: Phone },
                    { key: 'enrichment_show_sources', label: 'Mostrar fuentes', icon: BookOpen },
                  ].map(({ key, label, icon: Icon }) => (
                    <div key={key} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-muted-foreground" />
                        <Label className="cursor-pointer">{label}</Label>
                      </div>
                      <Switch
                        checked={druid[key as keyof DruidData] as boolean}
                        onCheckedChange={(checked) => setDruid({ ...druid, [key]: checked })}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Prompt personalizado (opcional)</Label>
                <Textarea
                  value={druid.enrichment_custom_prompt || ''}
                  onChange={(e) => setDruid({ ...druid, enrichment_custom_prompt: e.target.value || null })}
                  placeholder="Instrucciones adicionales para la IA..."
                  rows={3}
                />
              </div>
            </TabsContent>

            {/* Visibility Tab */}
            <TabsContent value="visibility" className="m-0 space-y-6">
              <div className="space-y-4">
                <Label className="text-base font-semibold">Visibilidad en el mapa</Label>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Zoom mínimo para mostrar</Label>
                    <span className="text-sm font-medium">
                      {druid.min_visibility_zoom ?? 'Sin límite'}
                    </span>
                  </div>
                  <Slider
                    value={[druid.min_visibility_zoom ?? 1]}
                    onValueChange={([v]) => setDruid({ ...druid, min_visibility_zoom: v })}
                    min={1}
                    max={18}
                    step={1}
                  />
                  <p className="text-xs text-muted-foreground">
                    Los puntos solo serán visibles cuando el zoom sea igual o mayor a este nivel
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Radio de visibilidad</Label>
                    <span className="text-sm font-medium">
                      {druid.visibility_radius_meters 
                        ? `${Math.round(druid.visibility_radius_meters / 1000)} km` 
                        : 'Sin límite'}
                    </span>
                  </div>
                  <Slider
                    value={[druid.visibility_radius_meters ?? 50000]}
                    onValueChange={([v]) => setDruid({ ...druid, visibility_radius_meters: v })}
                    min={5000}
                    max={500000}
                    step={5000}
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <Label className="text-base font-semibold">Apariencia</Label>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Icono</Label>
                    <Input
                      value={druid.icon}
                      onChange={(e) => setDruid({ ...druid, icon: e.target.value })}
                      placeholder="🌿"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Color</Label>
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        value={druid.color}
                        onChange={(e) => setDruid({ ...druid, color: e.target.value })}
                        className="w-12 h-10 p-1"
                      />
                      <Input
                        value={druid.color}
                        onChange={(e) => setDruid({ ...druid, color: e.target.value })}
                        className="flex-1 font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={handleRunSearch}
            disabled={running || !druid.search_center_lat}
            className="gap-2"
          >
            {running ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Ejecutar búsqueda ahora
          </Button>

          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Guardar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
