import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings2,
  Save,
  RotateCcw,
  FileText,
  Image,
  Link,
  Hash,
  Star,
  MessageSquare,
  Plus,
  X,
  Loader2,
  Eye,
  Sparkles,
  MapPin,
  ListChecks,
  RefreshCw,
  Compass,
  Phone,
  Target,
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
import { ScrollArea } from '@/components/ui/scroll-area';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useLocationsStore } from '@/store/locations-store';

interface CuratorLocation {
  id: string;
  name: string;
  description?: string;
  enriched_data?: any;
  country?: string;
  region?: string;
}

interface CuratorEnrichmentSettingsProps {
  curatorId: string;
  curatorName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface EnrichmentPreferences {
  enrichment_expected_nature: string;
  enrichment_search_radius_meters: number;
  enrichment_include_contact: boolean;
  enrichment_show_sources: boolean;
  enrichment_correct_coordinates: boolean;
  enrichment_tone: string;
  enrichment_min_length: number;
  enrichment_custom_prompt: string | null;
  enrichment_include_image: boolean;
  enrichment_include_web: boolean;
  enrichment_include_tags: boolean;
  enrichment_include_interest_index: boolean;
  enrichment_focus_keywords: string[];
  enrichment_exclude_keywords: string[];
}

const NATURE_EXAMPLES = [
  'Lugares de interés turístico general',
  'Monumentos históricos y patrimonio arquitectónico',
  'Espacios naturales, parques y paisajes',
  'Playas, calas y zonas costeras',
  'Restaurantes, bares y gastronomía local',
  'Alojamientos turísticos',
  'Pueblos pintorescos y núcleos rurales',
  'Miradores y puntos panorámicos',
  'Museos y espacios culturales',
  'Iglesias, ermitas y patrimonio religioso',
  'Yacimientos arqueológicos y ruinas',
];

const TONE_OPTIONS = [
  { value: 'tecnico', label: 'Técnico', description: 'Datos precisos, objetivo, enciclopédico', icon: '📊' },
  { value: 'divulgativo', label: 'Divulgativo', description: 'Equilibrio entre datos y narrativa', icon: '📖' },
  { value: 'poetico', label: 'Poético', description: 'Evocador, sensorial, literario', icon: '✨' },
];

// Preview text examples for each tone
const getPreviewText = (tone: string): string => {
  const previews: Record<string, string> = {
    tecnico: 'El Monasterio de San Juan de la Peña, fundado en el siglo X, constituye un ejemplo paradigmático de la arquitectura románica aragonesa. Su claustro, excavado bajo una formación rocosa de arenisca, presenta capiteles historiados con escenas bíblicas datados entre los siglos XII-XIII.',
    divulgativo: 'Escondido bajo un impresionante voladizo rocoso, el Monasterio de San Juan de la Peña es uno de los lugares más mágicos de Aragón. Este antiguo santuario, cuna del reino aragonés, combina historia medieval con un entorno natural espectacular que deja sin aliento a sus visitantes.',
    poetico: 'Donde la piedra abraza al cielo y el tiempo parece detenerse, San Juan de la Peña emerge como un susurro entre montañas. Bajo la caricia del acantilado que lo protege, sus muros centenarios guardan el eco de oraciones antiguas y el latido de un reino que nació entre estas rocas sagradas.',
    formal: 'El Real Monasterio de San Juan de la Peña, declarado Bien de Interés Cultural, representa un hito fundamental en el patrimonio histórico-artístico de la Comunidad Autónoma de Aragón. Su valor arquitectónico y su significación histórica lo convierten en un referente institucional de primer orden.',
    casual: '¿Buscas un lugar que te deje con la boca abierta? San Juan de la Peña es de esos sitios que parece sacado de una película. Imagínate un monasterio medieval metido literalmente dentro de una montaña. Cuando lo veas, entenderás por qué dicen que aquí nació Aragón.',
  };
  return previews[tone] || previews.divulgativo;
};

const DEFAULT_PREFERENCES: EnrichmentPreferences = {
  enrichment_expected_nature: 'Lugares de interés turístico general',
  enrichment_search_radius_meters: 500,
  enrichment_include_contact: true,
  enrichment_show_sources: true,
  enrichment_correct_coordinates: false,
  enrichment_tone: 'divulgativo',
  enrichment_min_length: 1500,
  enrichment_custom_prompt: null,
  enrichment_include_image: true,
  enrichment_include_web: true,
  enrichment_include_tags: true,
  enrichment_include_interest_index: true,
  enrichment_focus_keywords: [],
  enrichment_exclude_keywords: [],
};

export function CuratorEnrichmentSettings({
  curatorId,
  curatorName,
  open,
  onOpenChange,
}: CuratorEnrichmentSettingsProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [preferences, setPreferences] = useState<EnrichmentPreferences>(DEFAULT_PREFERENCES);
  const [newFocusKeyword, setNewFocusKeyword] = useState('');
  const [newExcludeKeyword, setNewExcludeKeyword] = useState('');
  const [curatorLocations, setCuratorLocations] = useState<CuratorLocation[]>([]);
  const [selectedPreviewLocation, setSelectedPreviewLocation] = useState<CuratorLocation | null>(null);
  const [activeTab, setActiveTab] = useState('settings');
  
  // Get locations from store that belong to curator
  const { getFilteredLocations } = useLocationsStore();

  // Load preferences and curator locations
  useEffect(() => {
    if (!open || !curatorId) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Fetch preferences
        const { data: prefData, error: prefError } = await supabase
          .from('curators')
          .select('enrichment_expected_nature, enrichment_search_radius_meters, enrichment_include_contact, enrichment_show_sources, enrichment_correct_coordinates, enrichment_tone, enrichment_min_length, enrichment_custom_prompt, enrichment_include_image, enrichment_include_web, enrichment_include_tags, enrichment_include_interest_index, enrichment_focus_keywords, enrichment_exclude_keywords')
          .eq('id', curatorId)
          .single();

        if (prefError) throw prefError;

        if (prefData) {
          setPreferences({
            enrichment_expected_nature: prefData.enrichment_expected_nature || DEFAULT_PREFERENCES.enrichment_expected_nature,
            enrichment_search_radius_meters: prefData.enrichment_search_radius_meters || DEFAULT_PREFERENCES.enrichment_search_radius_meters,
            enrichment_include_contact: prefData.enrichment_include_contact ?? DEFAULT_PREFERENCES.enrichment_include_contact,
            enrichment_show_sources: prefData.enrichment_show_sources ?? DEFAULT_PREFERENCES.enrichment_show_sources,
            enrichment_correct_coordinates: prefData.enrichment_correct_coordinates ?? DEFAULT_PREFERENCES.enrichment_correct_coordinates,
            enrichment_tone: prefData.enrichment_tone || DEFAULT_PREFERENCES.enrichment_tone,
            enrichment_min_length: prefData.enrichment_min_length || DEFAULT_PREFERENCES.enrichment_min_length,
            enrichment_custom_prompt: prefData.enrichment_custom_prompt,
            enrichment_include_image: prefData.enrichment_include_image ?? DEFAULT_PREFERENCES.enrichment_include_image,
            enrichment_include_web: prefData.enrichment_include_web ?? DEFAULT_PREFERENCES.enrichment_include_web,
            enrichment_include_tags: prefData.enrichment_include_tags ?? DEFAULT_PREFERENCES.enrichment_include_tags,
            enrichment_include_interest_index: prefData.enrichment_include_interest_index ?? DEFAULT_PREFERENCES.enrichment_include_interest_index,
            enrichment_focus_keywords: prefData.enrichment_focus_keywords || [],
            enrichment_exclude_keywords: prefData.enrichment_exclude_keywords || [],
          });
        }

        // Fetch curator locations
        const { data: curatorDocs } = await supabase
          .from('curator_documents')
          .select('document_id')
          .eq('curator_id', curatorId);
        
        if (curatorDocs && curatorDocs.length > 0) {
          const docIds = curatorDocs.map(cd => cd.document_id);
          const { data: locations } = await supabase
            .from('locations')
            .select('id, name, description, enriched_data, country, region')
            .in('document_id', docIds)
            .is('deleted_at', null)
            .order('name');
          
          if (locations) {
            setCuratorLocations(locations);
            // Set first unenriched location as preview
            const unenriched = locations.find(l => !l.enriched_data);
            setSelectedPreviewLocation(unenriched || locations[0] || null);
          }
        }
      } catch (error) {
        console.error('Error loading curator data:', error);
        toast.error('Error al cargar datos del curador');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [open, curatorId]);
  
  // Calculate stats for locations
  const locationStats = useMemo(() => {
    const enriched = curatorLocations.filter(l => l.enriched_data).length;
    const pending = curatorLocations.length - enriched;
    return { total: curatorLocations.length, enriched, pending };
  }, [curatorLocations]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('curators')
        .update({
          enrichment_expected_nature: preferences.enrichment_expected_nature,
          enrichment_search_radius_meters: preferences.enrichment_search_radius_meters,
          enrichment_include_contact: preferences.enrichment_include_contact,
          enrichment_show_sources: preferences.enrichment_show_sources,
          enrichment_correct_coordinates: preferences.enrichment_correct_coordinates,
          enrichment_tone: preferences.enrichment_tone,
          enrichment_min_length: preferences.enrichment_min_length,
          enrichment_custom_prompt: preferences.enrichment_custom_prompt || null,
          enrichment_include_image: preferences.enrichment_include_image,
          enrichment_include_web: preferences.enrichment_include_web,
          enrichment_include_tags: preferences.enrichment_include_tags,
          enrichment_include_interest_index: preferences.enrichment_include_interest_index,
          enrichment_focus_keywords: preferences.enrichment_focus_keywords,
          enrichment_exclude_keywords: preferences.enrichment_exclude_keywords,
          updated_at: new Date().toISOString(),
        })
        .eq('id', curatorId);

      if (error) throw error;

      toast.success('Preferencias de enriquecimiento guardadas');
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving preferences:', error);
      toast.error('Error al guardar preferencias');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setPreferences(DEFAULT_PREFERENCES);
  };

  const addFocusKeyword = () => {
    if (newFocusKeyword.trim() && !preferences.enrichment_focus_keywords.includes(newFocusKeyword.trim())) {
      setPreferences({
        ...preferences,
        enrichment_focus_keywords: [...preferences.enrichment_focus_keywords, newFocusKeyword.trim()],
      });
      setNewFocusKeyword('');
    }
  };

  const removeFocusKeyword = (keyword: string) => {
    setPreferences({
      ...preferences,
      enrichment_focus_keywords: preferences.enrichment_focus_keywords.filter((k) => k !== keyword),
    });
  };

  const addExcludeKeyword = () => {
    if (newExcludeKeyword.trim() && !preferences.enrichment_exclude_keywords.includes(newExcludeKeyword.trim())) {
      setPreferences({
        ...preferences,
        enrichment_exclude_keywords: [...preferences.enrichment_exclude_keywords, newExcludeKeyword.trim()],
      });
      setNewExcludeKeyword('');
    }
  };

  const removeExcludeKeyword = (keyword: string) => {
    setPreferences({
      ...preferences,
      enrichment_exclude_keywords: preferences.enrichment_exclude_keywords.filter((k) => k !== keyword),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-primary" />
            Preferencias de enriquecimiento
          </DialogTitle>
          <DialogDescription>
            Configura cómo se generan las fichas IA para el curador <strong>{curatorName}</strong>.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="settings" className="gap-2">
                <Settings2 className="w-4 h-4" />
                Configuración
              </TabsTrigger>
              <TabsTrigger value="preview" className="gap-2">
                <ListChecks className="w-4 h-4" />
                Puntos ({locationStats.total})
              </TabsTrigger>
            </TabsList>
            
            {/* Settings Tab */}
            <TabsContent value="settings" className="flex-1 overflow-y-auto space-y-6 mt-0">
            
            {/* PRIMARY SETTINGS - Nature, Radius, Image, Contact */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <Compass className="w-4 h-4" />
                Normas de búsqueda
              </div>
              
              {/* Expected Nature */}
              <div className="space-y-2">
                <Label className="text-sm">Naturaleza esperada de los puntos</Label>
                <Textarea
                  value={preferences.enrichment_expected_nature}
                  onChange={(e) => setPreferences({ ...preferences, enrichment_expected_nature: e.target.value })}
                  placeholder="Describe el tipo de lugares que contiene este conjunto de puntos..."
                  rows={2}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  Describe libremente la naturaleza de los puntos. La IA usará esta descripción para orientar el enriquecimiento.
                </p>
                <div className="flex flex-wrap gap-1">
                  {NATURE_EXAMPLES.slice(0, 4).map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => setPreferences({ ...preferences, enrichment_expected_nature: example })}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-muted hover:bg-primary/10 hover:text-primary transition-colors"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Search Radius */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2 text-sm">
                    <Target className="w-4 h-4" />
                    Radio de búsqueda
                  </Label>
                  <span className="text-sm font-bold text-primary">
                    {preferences.enrichment_search_radius_meters >= 1000 
                      ? `${(preferences.enrichment_search_radius_meters / 1000).toFixed(1)} km`
                      : `${preferences.enrichment_search_radius_meters} m`
                    }
                  </span>
                </div>
                <Slider
                  value={[preferences.enrichment_search_radius_meters]}
                  onValueChange={([value]) => setPreferences({ ...preferences, enrichment_search_radius_meters: value })}
                  min={50}
                  max={5000}
                  step={50}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>50 m (preciso)</span>
                  <span>5 km (amplio)</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Distancia máxima desde las coordenadas para buscar resultados compatibles
                </p>
              </div>
              
              {/* Quick toggles in grid */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-primary/10">
                <div className="flex items-center justify-between p-2 rounded-md bg-background">
                  <div className="flex items-center gap-2">
                    <Image className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">Imagen</span>
                  </div>
                  <Switch
                    checked={preferences.enrichment_include_image}
                    onCheckedChange={(checked) =>
                      setPreferences({ ...preferences, enrichment_include_image: checked })
                    }
                  />
                </div>
                <div className="flex items-center justify-between p-2 rounded-md bg-background">
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">Contacto</span>
                  </div>
                  <Switch
                    checked={preferences.enrichment_include_contact}
                    onCheckedChange={(checked) =>
                      setPreferences({ ...preferences, enrichment_include_contact: checked })
                    }
                  />
                </div>
                <div className="flex items-center justify-between p-2 rounded-md bg-background">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">Fuentes</span>
                  </div>
                  <Switch
                    checked={preferences.enrichment_show_sources}
                    onCheckedChange={(checked) =>
                      setPreferences({ ...preferences, enrichment_show_sources: checked })
                    }
                  />
                </div>
                <div className="flex items-center justify-between p-2 rounded-md bg-background">
                  <div className="flex items-center gap-2">
                    <Navigation className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">Corregir ubicación</span>
                  </div>
                  <Switch
                    checked={preferences.enrichment_correct_coordinates}
                    onCheckedChange={(checked) =>
                      setPreferences({ ...preferences, enrichment_correct_coordinates: checked })
                    }
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Si "Corregir ubicación" está activo, la IA puede mover el punto a las coordenadas exactas si detecta discrepancia.
              </p>
            </div>
            
            <Separator />
            
            {/* Tone selection - 3 cards */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Tono de descripción
              </Label>
              <div className="grid grid-cols-3 gap-3">
                {TONE_OPTIONS.map((option) => {
                  const isSelected = preferences.enrichment_tone === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setPreferences({ ...preferences, enrichment_tone: option.value })}
                      className={`p-3 rounded-lg border-2 transition-all text-left ${
                        isSelected 
                          ? 'border-primary bg-primary/10 ring-2 ring-primary/20' 
                          : 'border-border hover:border-primary/50 hover:bg-muted/50'
                      }`}
                    >
                      <div className="text-xl mb-1">{option.icon}</div>
                      <div className={`font-medium text-sm ${isSelected ? 'text-primary' : ''}`}>
                        {option.label}
                      </div>
                      <div className="text-[10px] text-muted-foreground leading-tight mt-1">
                        {option.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Min length */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Longitud mínima de descripción
                </Label>
                <span className="text-sm font-bold text-primary">
                  {preferences.enrichment_min_length.toLocaleString()} caracteres
                </span>
              </div>
              <Slider
                value={[preferences.enrichment_min_length]}
                onValueChange={([value]) => setPreferences({ ...preferences, enrichment_min_length: value })}
                min={500}
                max={5000}
                step={100}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>500 (corto)</span>
                <span>5000 (extenso)</span>
              </div>
            </div>

            <Separator />

            {/* Content toggles */}
            <div className="space-y-4">
              <Label className="text-sm font-medium">Contenido adicional</Label>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Link className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">Incluir URL de referencia web</span>
                  </div>
                  <Switch
                    checked={preferences.enrichment_include_web}
                    onCheckedChange={(checked) =>
                      setPreferences({ ...preferences, enrichment_include_web: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Hash className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">Generar etiquetas/hashtags</span>
                  </div>
                  <Switch
                    checked={preferences.enrichment_include_tags}
                    onCheckedChange={(checked) =>
                      setPreferences({ ...preferences, enrichment_include_tags: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">Calcular índice de interés (1-5)</span>
                  </div>
                  <Switch
                    checked={preferences.enrichment_include_interest_index}
                    onCheckedChange={(checked) =>
                      setPreferences({ ...preferences, enrichment_include_interest_index: checked })
                    }
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Custom prompt */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Settings2 className="w-4 h-4" />
                Instrucciones personalizadas (opcional)
              </Label>
              <Textarea
                value={preferences.enrichment_custom_prompt || ''}
                onChange={(e) =>
                  setPreferences({ ...preferences, enrichment_custom_prompt: e.target.value || null })
                }
                placeholder="Ej: Enfocarse en la historia local, mencionar rutas de senderismo cercanas, destacar la gastronomía de la zona..."
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Estas instrucciones se añaden al prompt de la IA para personalizar el contenido.
              </p>
            </div>

            <Separator />

            {/* Focus keywords */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Palabras clave a enfatizar</Label>
              <div className="flex gap-2">
                <Input
                  value={newFocusKeyword}
                  onChange={(e) => setNewFocusKeyword(e.target.value)}
                  placeholder="Añadir palabra clave..."
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addFocusKeyword())}
                />
                <Button type="button" size="icon" variant="outline" onClick={addFocusKeyword}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {preferences.enrichment_focus_keywords.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {preferences.enrichment_focus_keywords.map((keyword) => (
                    <Badge key={keyword} variant="secondary" className="gap-1">
                      {keyword}
                      <button
                        type="button"
                        onClick={() => removeFocusKeyword(keyword)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Exclude keywords */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Palabras/temas a evitar</Label>
              <div className="flex gap-2">
                <Input
                  value={newExcludeKeyword}
                  onChange={(e) => setNewExcludeKeyword(e.target.value)}
                  placeholder="Añadir palabra a evitar..."
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addExcludeKeyword())}
                />
                <Button type="button" size="icon" variant="outline" onClick={addExcludeKeyword}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {preferences.enrichment_exclude_keywords.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {preferences.enrichment_exclude_keywords.map((keyword) => (
                    <Badge key={keyword} variant="outline" className="gap-1 text-destructive border-destructive/50">
                      {keyword}
                      <button
                        type="button"
                        onClick={() => removeExcludeKeyword(keyword)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {/* Preview Section */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <Eye className="w-4 h-4" />
                Vista previa del estilo
              </Label>
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span className="text-xs text-muted-foreground">
                    Ejemplo de cómo se generará el contenido
                  </span>
                </div>
                
                {/* Primary settings summary */}
                <div className="space-y-1 p-2 rounded-md bg-primary/5 border border-primary/10">
                  <div className="text-xs">
                    <span className="text-muted-foreground">Tipo: </span>
                    <span className="font-medium line-clamp-1">{preferences.enrichment_expected_nature || 'Sin definir'}</span>
                  </div>
                  <div className="text-xs">
                    <span className="text-muted-foreground">Radio: </span>
                    <span className="font-medium">
                      {preferences.enrichment_search_radius_meters >= 1000 
                        ? `${(preferences.enrichment_search_radius_meters / 1000).toFixed(1)} km`
                        : `${preferences.enrichment_search_radius_meters} m`
                      }
                    </span>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Tono: {TONE_OPTIONS.find(t => t.value === preferences.enrichment_tone)?.label}
                  </div>
                  <p className="text-sm leading-relaxed text-foreground/90">
                    {getPreviewText(preferences.enrichment_tone)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  {preferences.enrichment_include_image && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Image className="w-3 h-3" /> Imagen
                    </Badge>
                  )}
                  {preferences.enrichment_include_contact && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Phone className="w-3 h-3" /> Contacto
                    </Badge>
                  )}
                  {preferences.enrichment_show_sources && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <BookOpen className="w-3 h-3" /> Fuentes
                    </Badge>
                  )}
                  {preferences.enrichment_correct_coordinates && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Navigation className="w-3 h-3" /> Geo-corrección
                    </Badge>
                  )}
                  {preferences.enrichment_include_web && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Link className="w-3 h-3" /> Web
                    </Badge>
                  )}
                  {preferences.enrichment_include_tags && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Hash className="w-3 h-3" /> Tags
                    </Badge>
                  )}
                  {preferences.enrichment_include_interest_index && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Star className="w-3 h-3" /> Índice
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground pt-1 border-t">
                  Longitud objetivo: ~{preferences.enrichment_min_length.toLocaleString()} caracteres
                  {preferences.enrichment_focus_keywords.length > 0 && (
                    <span className="ml-2">
                      • Enfoque: {preferences.enrichment_focus_keywords.slice(0, 3).join(', ')}
                      {preferences.enrichment_focus_keywords.length > 3 && '...'}
                    </span>
                  )}
                </div>
              </div>
            </div>
            </TabsContent>
            
            {/* Preview/Locations Tab */}
            <TabsContent value="preview" className="flex-1 overflow-hidden mt-0">
              <div className="h-full flex flex-col gap-4">
                {/* Stats Summary */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-muted/50 p-3 text-center">
                    <div className="text-2xl font-bold text-foreground">{locationStats.total}</div>
                    <div className="text-xs text-muted-foreground">Total puntos</div>
                  </div>
                  <div className="rounded-lg bg-green-50 dark:bg-green-900/20 p-3 text-center">
                    <div className="text-2xl font-bold text-green-600">{locationStats.enriched}</div>
                    <div className="text-xs text-green-600/80">Enriquecidos</div>
                  </div>
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 p-3 text-center">
                    <div className="text-2xl font-bold text-amber-600">{locationStats.pending}</div>
                    <div className="text-xs text-amber-600/80">Pendientes</div>
                  </div>
                </div>
                
                {/* Locations List */}
                <div className="flex-1 overflow-hidden rounded-lg border">
                  <div className="bg-muted/50 px-3 py-2 border-b flex items-center justify-between">
                    <span className="text-sm font-medium">Puntos del curador</span>
                    <Badge variant="secondary" className="text-xs">
                      {curatorLocations.length} ubicaciones
                    </Badge>
                  </div>
                  <ScrollArea className="h-[280px]">
                    <div className="divide-y">
                      {curatorLocations.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                          <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No hay puntos asignados a este curador</p>
                        </div>
                      ) : (
                        curatorLocations.map((location) => {
                          const isEnriched = !!location.enriched_data;
                          const isSelected = selectedPreviewLocation?.id === location.id;
                          return (
                            <div
                              key={location.id}
                              onClick={() => setSelectedPreviewLocation(location)}
                              className={`p-3 cursor-pointer transition-colors hover:bg-muted/50 ${
                                isSelected ? 'bg-primary/5 border-l-2 border-l-primary' : ''
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                  isEnriched ? 'bg-green-500' : 'bg-amber-500'
                                }`} />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium truncate">{location.name}</div>
                                  {(location.region || location.country) && (
                                    <div className="text-xs text-muted-foreground truncate">
                                      {[location.region, location.country].filter(Boolean).join(', ')}
                                    </div>
                                  )}
                                </div>
                                {isEnriched ? (
                                  <Badge variant="secondary" className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                    <Sparkles className="w-3 h-3 mr-1" />
                                    IA
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                                    Pendiente
                                  </Badge>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </ScrollArea>
                </div>
                
                {/* Selected Location Preview */}
                {selectedPreviewLocation && (
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Eye className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium">Vista previa: {selectedPreviewLocation.name}</span>
                    </div>
                    {selectedPreviewLocation.enriched_data ? (
                      <div className="space-y-2">
                        <p className="text-sm text-foreground/90 line-clamp-4">
                          {selectedPreviewLocation.enriched_data.descripcion || 
                           selectedPreviewLocation.enriched_data.description ||
                           'Descripción disponible'}
                        </p>
                        {selectedPreviewLocation.enriched_data.hashtags && (
                          <div className="flex flex-wrap gap-1">
                            {(selectedPreviewLocation.enriched_data.hashtags as string[]).slice(0, 5).map((tag: string) => (
                              <Badge key={tag} variant="secondary" className="text-[10px]">
                                #{tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground italic">
                        Este punto aún no ha sido enriquecido. Se generará con el tono "{TONE_OPTIONS.find(t => t.value === preferences.enrichment_tone)?.label}" y una longitud de ~{preferences.enrichment_min_length.toLocaleString()} caracteres.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter className="gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={handleReset} disabled={isSaving}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Restaurar predeterminados
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isLoading}>
            {isSaving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Guardar preferencias
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
