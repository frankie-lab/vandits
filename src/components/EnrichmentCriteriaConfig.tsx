import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Settings2, 
  Save, 
  RotateCcw, 
  FileText, 
  Image, 
  Link, 
  Hash,
  CheckCircle,
  AlertTriangle,
  Upload,
  Globe,
  Shield,
  Maximize2,
  UserX,
  Target,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useLocationsStore } from '@/store/locations-store';
import { toast } from 'sonner';

// Opciones de fuente de imagen (ahora es un array para selección múltiple)
export type ImageSourceType = 'wikimedia' | 'verified' | 'uploaded';

// Opciones de resolución mínima (selección única)
export type ImageResolutionOption = 'none' | '800x600' | '1200x800' | '1920x1080';

export const IMAGE_RESOLUTION_OPTIONS: { value: ImageResolutionOption; label: string; description: string }[] = [
  { value: 'none', label: 'Sin requisito', description: 'Cualquier tamaño' },
  { value: '800x600', label: '800×600', description: 'Mínima aceptable' },
  { value: '1200x800', label: '1200×800', description: 'Recomendada' },
  { value: '1920x1080', label: '1920×1080', description: 'Full HD' },
];

// Tipos de tono de descripción
export type DescriptionToneType = 'technical' | 'informative' | 'contextual';

export const DESCRIPTION_TONE_OPTIONS: { 
  value: DescriptionToneType; 
  label: string; 
  subtitle: string;
  description: string; 
  example: string;
  usage: string[];
}[] = [
  { 
    value: 'technical', 
    label: 'Neutro–Técnico', 
    subtitle: 'Informar con precisión',
    description: 'Impersonal, descriptivo, sin adjetivación valorativa, datos verificables.',
    example: 'Enclave situado en una zona rural de media montaña, caracterizado por edificaciones tradicionales y una trama dispersa.',
    usage: ['Cartografía', 'GIS / KML', 'Catálogos oficiales', 'Inventarios']
  },
  { 
    value: 'informative', 
    label: 'Informativo–Divulgativo', 
    subtitle: 'Explicar de forma clara y accesible',
    description: 'Lenguaje comprensible, ligero contexto explicativo, sin opinión personal, mantiene rigor.',
    example: 'Se trata de un pequeño enclave rural situado en una zona de montaña, conocido por conservar construcciones tradicionales.',
    usage: ['Guías', 'Plataformas de destinos', 'Fichas públicas', 'Mapas para usuarios']
  },
  { 
    value: 'contextual', 
    label: 'Contextual–Interpretativo', 
    subtitle: 'Aportar significado y lectura cultural',
    description: 'Lenguaje sobrio, interpretación basada en contexto histórico o cultural, no narrativo.',
    example: 'Este enclave refleja un modelo tradicional de asentamiento vinculado al aprovechamiento del territorio.',
    usage: ['Patrimonio', 'Cultura', 'Lugares históricos', 'Contextos simbólicos']
  },
];

// Regla fija de variedad estructural
export const DESCRIPTION_VARIETY_RULE = {
  label: 'Variedad estructural obligatoria',
  description: 'Las descripciones deben variar su estructura para evitar monotonía.',
  examples: [
    'Situado en el corazón de la comarca...',
    'Este enclave rural conserva...',
    'A orillas del río...',
    'Conocido por su arquitectura tradicional...',
    'Entre valles y montañas se encuentra...',
  ]
};

export interface EnrichmentCriteria {
  // Descripción
  minDescriptionLength: number;
  descriptionTone: DescriptionToneType; // Tono de la descripción
  
  // Imagen - Siempre se intenta obtener, el usuario elige fuentes aceptadas
  // Si imageSources está vacío = sin requisito de imagen
  imageSources: ImageSourceType[]; // Fuentes de imagen aceptadas (múltiple selección)
  imageMinResolution: ImageResolutionOption; // Resolución mínima requerida
  // Filtros de calidad son FIJOS (siempre activos): excluir retratos, coincidir con tipo
  
  // Campos requeridos
  requireWebReference: boolean;
  requireTags: boolean;
  minTagsCount: number;
  
  // Datos clave
  requireType: boolean;
  requireAccess: boolean;
  requireProtection: boolean;
  // Geografía - requireFullGeography es SIEMPRE obligatorio (criterio fijo)
}

const DEFAULT_CRITERIA: EnrichmentCriteria = {
  minDescriptionLength: 1000,
  descriptionTone: 'informative', // Por defecto tono informativo-divulgativo
  // Imagen - por defecto todas las fuentes activas
  imageSources: ['wikimedia', 'verified', 'uploaded'],
  imageMinResolution: '1200x800',
  // Campos
  requireWebReference: false,
  requireTags: false,
  minTagsCount: 3,
  requireType: true,
  requireAccess: false,
  requireProtection: false,
  // requireFullGeography eliminado - ahora es criterio fijo obligatorio
};

// Fecha a partir de la cual las fichas se consideran "actualizadas" (verde)
export function getCriteriaTimestamp(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed._updatedAt || 0;
    }
  } catch (e) {}
  return 0;
}

const STORAGE_KEY = 'geodata-enrichment-criteria';

export function loadEnrichmentCriteria(): EnrichmentCriteria {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_CRITERIA, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.error('Error loading enrichment criteria:', e);
  }
  return DEFAULT_CRITERIA;
}

export function saveEnrichmentCriteria(criteria: EnrichmentCriteria): void {
  // Guardar con timestamp para saber cuándo se actualizaron los criterios
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...criteria, _updatedAt: Date.now() }));
}

interface EnrichmentCriteriaConfigProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EnrichmentCriteriaConfig({ open, onOpenChange }: EnrichmentCriteriaConfigProps) {
  const [criteria, setCriteria] = useState<EnrichmentCriteria>(loadEnrichmentCriteria());
  const [hasChanges, setHasChanges] = useState(false);
  
  const getAllLocations = useLocationsStore(state => state.getAllLocations);
  const getEnrichedStats = useLocationsStore(state => state.getEnrichedStats);

  // Calculate impact preview - based on actual current stats
  const calculateImpact = () => {
    const allLocations = getAllLocations();
    if (allLocations.length === 0) return { current: 0, willBePending: 0, total: 0 };
    
    const stats = getEnrichedStats();
    // All enriched (green + blue) will become pending when criteria changes
    const totalEnriched = stats.byCriteria.current + stats.byCriteria.previous;
    
    return {
      current: stats.byCriteria.current,
      alreadyPending: stats.byCriteria.previous,
      willBePending: totalEnriched, // All enriched will need re-update after criteria change
      total: allLocations.length,
    };
  };

  const impact = calculateImpact();

  const updateCriteria = (updates: Partial<EnrichmentCriteria>) => {
    setCriteria(prev => ({ ...prev, ...updates }));
    setHasChanges(true);
  };

  const handleSave = () => {
    saveEnrichmentCriteria(criteria);
    setHasChanges(false);
    toast.success('Criterios de actualización guardados');
    // Trigger a re-render of stats by closing and reopening or refreshing
    window.dispatchEvent(new CustomEvent('enrichment-criteria-changed'));
    onOpenChange(false);
  };

  const handleReset = () => {
    setCriteria(DEFAULT_CRITERIA);
    setHasChanges(true);
  };

  useEffect(() => {
    setCriteria(loadEnrichmentCriteria());
    setHasChanges(false);
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle className="font-display flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-primary" />
            Criterios de Actualización
          </SheetTitle>
          <SheetDescription>
            Define qué requisitos debe cumplir una ficha para considerarse "actualizada" (verde)
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {/* Impact Preview */}
          <div className="p-4 rounded-lg border bg-muted/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Vista previa del impacto</span>
              {hasChanges && (
                <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  Sin guardar
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded bg-green-50 border border-green-200">
                <div className="text-lg font-bold text-green-600">{impact.current}</div>
                <div className="text-[10px] text-green-700">Actualizadas</div>
              </div>
              <div className="p-2 rounded bg-blue-50 border border-blue-200">
                <div className="text-lg font-bold text-blue-600">{impact.alreadyPending}</div>
                <div className="text-[10px] text-blue-700">Pendientes</div>
              </div>
              <div className="p-2 rounded bg-amber-50 border border-amber-200">
                <div className="text-lg font-bold text-amber-600">{impact.willBePending}</div>
                <div className="text-[10px] text-amber-700">Si cambias criterios</div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Al guardar nuevos criterios, <strong>todas</strong> las fichas enriquecidas ({impact.willBePending}) pasarán a "pendiente" hasta regenerarse.
            </p>
          </div>

          <Accordion type="multiple" defaultValue={['description', 'image', 'fields']} className="space-y-2">
            {/* Description Criteria */}
            <AccordionItem value="description" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  <span>Descripción</span>
                  <Badge variant="secondary" className="ml-2 text-[10px]">
                    {DESCRIPTION_TONE_OPTIONS.find(t => t.value === criteria.descriptionTone)?.label}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-5 pb-4">
                {/* Tono de descripción */}
                <div className="space-y-3">
                  <Label className="flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5" />
                    Tono de la descripción
                  </Label>
                  <div className="grid gap-2">
                    {DESCRIPTION_TONE_OPTIONS.map((option) => (
                      <div 
                        key={option.value}
                        className={`p-3 rounded-md border cursor-pointer transition-colors ${
                          criteria.descriptionTone === option.value 
                            ? 'bg-primary/10 border-primary/30' 
                            : 'hover:bg-muted/50'
                        }`}
                        onClick={() => updateCriteria({ descriptionTone: option.value })}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            criteria.descriptionTone === option.value 
                              ? 'border-primary bg-primary' 
                              : 'border-muted-foreground'
                          }`}>
                            {criteria.descriptionTone === option.value && (
                              <div className="w-2 h-2 rounded-full bg-white" />
                            )}
                          </div>
                          <span className="font-medium text-sm">{option.label}</span>
                          <span className="text-xs text-muted-foreground">— {option.subtitle}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground ml-6 mb-2">
                          {option.description}
                        </p>
                        <div className="ml-6 p-2 rounded bg-muted/50 text-[10px] italic text-muted-foreground">
                          "{option.example}"
                        </div>
                        <div className="ml-6 mt-2 flex flex-wrap gap-1">
                          {option.usage.map((use) => (
                            <span key={use} className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              {use}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Longitud mínima */}
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <Label>Longitud mínima de descripción</Label>
                    <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
                      {criteria.minDescriptionLength} chars
                    </span>
                  </div>
                  <Slider
                    value={[criteria.minDescriptionLength]}
                    onValueChange={([value]) => updateCriteria({ minDescriptionLength: value })}
                    min={200}
                    max={2000}
                    step={100}
                    className="w-full"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>200 (corta)</span>
                    <span>1000 (media)</span>
                    <span>2000 (extensa)</span>
                  </div>
                </div>

                {/* Regla fija de variedad estructural */}
                <div className="space-y-2 pt-2 border-t">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Shield className="w-3 h-3" />
                    Criterio obligatorio
                  </Label>
                  <div className="p-3 rounded-md bg-green-50/70 border border-green-300">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                      <span className="font-medium text-sm text-green-800">{DESCRIPTION_VARIETY_RULE.label}</span>
                    </div>
                    <p className="text-[11px] text-green-700 mb-2">
                      {DESCRIPTION_VARIETY_RULE.description}
                    </p>
                    <div className="space-y-1">
                      <span className="text-[10px] font-medium text-green-800">Ejemplos de inicios variados:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {DESCRIPTION_VARIETY_RULE.examples.map((example, idx) => (
                          <span 
                            key={idx} 
                            className="text-[10px] px-2 py-1 rounded-full bg-green-100 text-green-700 border border-green-200"
                          >
                            {example}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Image Criteria - Siempre se intenta obtener imagen */}
            <AccordionItem value="image" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <Image className="w-4 h-4 text-primary" />
                  <span>Imagen</span>
                  {criteria.imageSources.length > 0 && (
                    <Badge variant="secondary" className="ml-2 text-[10px]">
                      {criteria.imageSources.length} fuente{criteria.imageSources.length > 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-5 pb-4">
                {/* Explicación */}
                <div className="p-3 rounded-md bg-muted/30 text-xs text-muted-foreground">
                  <p>Siempre se intenta obtener una imagen. Selecciona las fuentes aceptadas.</p>
                  <p className="mt-1 text-[10px]">
                    💡 Todas las fichas permiten subir foto propia independientemente de estos criterios.
                  </p>
                </div>

                {/* Fuentes de imagen aceptadas (múltiple selección) */}
                <div className="space-y-3">
                  <Label className="flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5" />
                    Fuentes aceptadas para criterio "actualizada"
                  </Label>
                  <div className="grid gap-2">
                    <div 
                      className={`flex items-center space-x-3 p-3 rounded-md border cursor-pointer transition-colors ${
                        criteria.imageSources.includes('wikimedia') 
                          ? 'bg-green-50 border-green-300' 
                          : 'hover:bg-muted/50'
                      }`}
                      onClick={() => {
                        const newSources = criteria.imageSources.includes('wikimedia')
                          ? criteria.imageSources.filter(s => s !== 'wikimedia')
                          : [...criteria.imageSources, 'wikimedia'] as ImageSourceType[];
                        updateCriteria({ imageSources: newSources });
                      }}
                    >
                      <Checkbox 
                        checked={criteria.imageSources.includes('wikimedia')} 
                        id="img-wikimedia"
                      />
                      <Label htmlFor="img-wikimedia" className="flex-1 cursor-pointer">
                        <span className="flex items-center gap-2">
                          <Shield className="w-4 h-4 text-green-600" />
                          Wikimedia Commons
                        </span>
                        <p className="text-[10px] text-muted-foreground">
                          Imágenes libres de derechos (búsqueda automática)
                        </p>
                      </Label>
                    </div>

                    <div 
                      className={`flex items-center space-x-3 p-3 rounded-md border cursor-pointer transition-colors ${
                        criteria.imageSources.includes('verified') 
                          ? 'bg-blue-50 border-blue-300' 
                          : 'hover:bg-muted/50'
                      }`}
                      onClick={() => {
                        const newSources = criteria.imageSources.includes('verified')
                          ? criteria.imageSources.filter(s => s !== 'verified')
                          : [...criteria.imageSources, 'verified'] as ImageSourceType[];
                        updateCriteria({ imageSources: newSources });
                      }}
                    >
                      <Checkbox 
                        checked={criteria.imageSources.includes('verified')} 
                        id="img-verified"
                      />
                      <Label htmlFor="img-verified" className="flex-1 cursor-pointer">
                        <span className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-blue-600" />
                          URL verificada
                        </span>
                        <p className="text-[10px] text-muted-foreground">
                          Se verifica que la imagen sea accesible
                        </p>
                      </Label>
                    </div>

                    <div 
                      className={`flex items-center space-x-3 p-3 rounded-md border cursor-pointer transition-colors ${
                        criteria.imageSources.includes('uploaded') 
                          ? 'bg-purple-50 border-purple-300' 
                          : 'hover:bg-muted/50'
                      }`}
                      onClick={() => {
                        const newSources = criteria.imageSources.includes('uploaded')
                          ? criteria.imageSources.filter(s => s !== 'uploaded')
                          : [...criteria.imageSources, 'uploaded'] as ImageSourceType[];
                        updateCriteria({ imageSources: newSources });
                      }}
                    >
                      <Checkbox 
                        checked={criteria.imageSources.includes('uploaded')} 
                        id="img-uploaded"
                      />
                      <Label htmlFor="img-uploaded" className="flex-1 cursor-pointer">
                        <span className="flex items-center gap-2">
                          <Upload className="w-4 h-4 text-purple-600" />
                          Subida por usuario
                        </span>
                        <p className="text-[10px] text-muted-foreground">
                          Imágenes propias subidas manualmente
                        </p>
                      </Label>
                    </div>
                  </div>
                  
                  {criteria.imageSources.length === 0 && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Sin requisito de imagen para marcar como "actualizada"
                    </p>
                  )}
                </div>

                {/* Resolución mínima (selección única) - solo si hay fuentes seleccionadas */}
                {criteria.imageSources.length > 0 && (
                  <div className="space-y-3 pt-2 border-t">
                    <Label className="flex items-center gap-2">
                      <Maximize2 className="w-3.5 h-3.5" />
                      Resolución mínima
                    </Label>
                    <div className="grid gap-2">
                      {IMAGE_RESOLUTION_OPTIONS.map((option) => (
                        <div 
                          key={option.value}
                          className={`flex items-center space-x-3 p-3 rounded-md border cursor-pointer transition-colors ${
                            criteria.imageMinResolution === option.value 
                              ? 'bg-primary/10 border-primary/30' 
                              : 'hover:bg-muted/50'
                          }`}
                          onClick={() => updateCriteria({ imageMinResolution: option.value })}
                        >
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            criteria.imageMinResolution === option.value 
                              ? 'border-primary bg-primary' 
                              : 'border-muted-foreground'
                          }`}>
                            {criteria.imageMinResolution === option.value && (
                              <div className="w-2 h-2 rounded-full bg-white" />
                            )}
                          </div>
                          <Label htmlFor={`res-${option.value}`} className="flex-1 cursor-pointer">
                            <span className="font-medium">{option.label}</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              {option.description}
                            </span>
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Filtros de calidad - criterios fijos obligatorios */}
                <div className="space-y-3 pt-2 border-t">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                    Filtros de calidad aplicados
                  </Label>
                  
                  <div className="flex items-center gap-2 p-2 rounded-md bg-green-50/50">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <div>
                      <Label className="text-sm text-green-800">Excluir retratos y documentos</Label>
                      <p className="text-[10px] text-green-700">
                        Se evitan fotos de personas, publicaciones y documentos
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 p-2 rounded-md bg-green-50/50">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <div>
                      <Label className="text-sm text-green-800">Coincidir con tipo de lugar</Label>
                      <p className="text-[10px] text-green-700">
                        Paisaje para naturaleza, edificio para arquitectura, etc.
                      </p>
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Required Fields */}
            <AccordionItem value="fields" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-primary" />
                  <span>Otros campos requeridos</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pb-4">

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Link className="w-4 h-4 text-muted-foreground" />
                    <Label>Web de referencia obligatoria</Label>
                  </div>
                  <Switch
                    checked={criteria.requireWebReference}
                    onCheckedChange={(checked) => updateCriteria({ requireWebReference: checked })}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Hash className="w-4 h-4 text-muted-foreground" />
                      <Label>Etiquetas obligatorias</Label>
                    </div>
                    <Switch
                      checked={criteria.requireTags}
                      onCheckedChange={(checked) => updateCriteria({ requireTags: checked })}
                    />
                  </div>
                  {criteria.requireTags && (
                    <div className="ml-6 flex items-center gap-2">
                      <Label className="text-xs">Mínimo:</Label>
                      <Input
                        type="number"
                        value={criteria.minTagsCount}
                        onChange={(e) => updateCriteria({ minTagsCount: parseInt(e.target.value) || 1 })}
                        min={1}
                        max={20}
                        className="w-16 h-7 text-xs"
                      />
                      <span className="text-xs text-muted-foreground">etiquetas</span>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Data Fields */}
            <AccordionItem value="data" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-primary" />
                  <span>Datos clave</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pb-4">
                <div className="flex items-center justify-between">
                  <Label>Tipo de lugar obligatorio</Label>
                  <Switch
                    checked={criteria.requireType}
                    onCheckedChange={(checked) => updateCriteria({ requireType: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label>Información de acceso obligatoria</Label>
                  <Switch
                    checked={criteria.requireAccess}
                    onCheckedChange={(checked) => updateCriteria({ requireAccess: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label>Estado de protección obligatorio</Label>
                  <Switch
                    checked={criteria.requireProtection}
                    onCheckedChange={(checked) => updateCriteria({ requireProtection: checked })}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Geography - Criterio fijo obligatorio */}
            <AccordionItem value="geography" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-primary" />
                  <span>Geografía</span>
                  <Badge variant="default" className="ml-2 text-[10px] bg-green-600">
                    Obligatorio
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pb-4">
                <div className="p-3 rounded-md bg-green-50/70 border border-green-300">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <span className="font-medium text-sm text-green-800">Jerarquía geográfica completa</span>
                  </div>
                  <p className="text-[11px] text-green-700">
                    Requiere continente, país y región para considerar la ficha actualizada.
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <SheetFooter className="flex-shrink-0 gap-2 pt-4 border-t">
          <Button variant="outline" onClick={handleReset} className="flex-1">
            <RotateCcw className="w-4 h-4 mr-2" />
            Restablecer
          </Button>
          <Button onClick={handleSave} className="flex-1" disabled={!hasChanges}>
            <Save className="w-4 h-4 mr-2" />
            Guardar criterios
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
