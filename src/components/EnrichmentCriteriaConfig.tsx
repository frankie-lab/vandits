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

// Opciones de resolución mínima (ahora array para selección múltiple)
export type ImageResolutionOption = '800x600' | '1200x800' | '1920x1080';

export const IMAGE_RESOLUTION_OPTIONS: { value: ImageResolutionOption; label: string; description: string }[] = [
  { value: '800x600', label: '800×600', description: 'Mínima aceptable' },
  { value: '1200x800', label: '1200×800', description: 'Recomendada' },
  { value: '1920x1080', label: '1920×1080', description: 'Full HD' },
];

export interface EnrichmentCriteria {
  // Descripción
  minDescriptionLength: number;
  
  // Imagen - Opciones avanzadas
  requireImage: boolean; // Si se requiere imagen
  imageSources: ImageSourceType[]; // Fuentes de imagen aceptadas (múltiple selección)
  imageResolutions: ImageResolutionOption[]; // Resoluciones aceptadas (múltiple selección)
  imageExcludePortraits: boolean; // Excluir retratos/personas/documentos
  imageMatchPlaceType: boolean; // Debe coincidir con el tipo de lugar
  
  // Campos requeridos
  requireWebReference: boolean;
  requireTags: boolean;
  minTagsCount: number;
  
  // Datos clave
  requireType: boolean;
  requireAccess: boolean;
  requireProtection: boolean;
  
  // Geografía
  requireFullGeography: boolean; // continent, country, region
}

const DEFAULT_CRITERIA: EnrichmentCriteria = {
  minDescriptionLength: 1000,
  // Imagen
  requireImage: true,
  imageSources: ['wikimedia', 'verified', 'uploaded'], // Por defecto acepta todas
  imageResolutions: ['800x600', '1200x800', '1920x1080'], // Por defecto acepta todas
  imageExcludePortraits: true,
  imageMatchPlaceType: true,
  // Campos
  requireWebReference: false,
  requireTags: false,
  minTagsCount: 3,
  requireType: true,
  requireAccess: false,
  requireProtection: false,
  requireFullGeography: false,
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
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pb-4">
                <div className="space-y-2">
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
              </AccordionContent>
            </AccordionItem>

            {/* Image Criteria - EXPANDED SECTION WITH MULTI-SELECT */}
            <AccordionItem value="image" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <Image className="w-4 h-4 text-primary" />
                  <span>Imagen</span>
                  {criteria.requireImage && (
                    <Badge variant="secondary" className="ml-2 text-[10px]">
                      Requerida
                    </Badge>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-5 pb-4">
                {/* Requerir imagen */}
                <div className="flex items-center justify-between p-2 rounded-md bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Image className="w-4 h-4 text-primary" />
                    <Label className="font-medium">Imagen obligatoria</Label>
                  </div>
                  <Switch
                    checked={criteria.requireImage}
                    onCheckedChange={(checked) => updateCriteria({ requireImage: checked })}
                  />
                </div>

                {/* Fuentes de imagen aceptadas (múltiple selección) */}
                {criteria.requireImage && (
                  <div className="space-y-3">
                    <Label className="flex items-center gap-2">
                      <Globe className="w-3.5 h-3.5" />
                      Fuentes aceptadas
                      <span className="text-xs text-muted-foreground">(selecciona una o más)</span>
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
                      <p className="text-xs text-amber-600 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Selecciona al menos una fuente
                      </p>
                    )}
                  </div>
                )}

                {/* Resoluciones aceptadas (múltiple selección) */}
                {criteria.requireImage && (
                  <div className="space-y-3 pt-2 border-t">
                    <Label className="flex items-center gap-2">
                      <Maximize2 className="w-3.5 h-3.5" />
                      Resoluciones aceptadas
                      <span className="text-xs text-muted-foreground">(selecciona una o más)</span>
                    </Label>
                    <div className="grid gap-2">
                      {IMAGE_RESOLUTION_OPTIONS.map((option) => (
                        <div 
                          key={option.value}
                          className={`flex items-center space-x-3 p-3 rounded-md border cursor-pointer transition-colors ${
                            criteria.imageResolutions.includes(option.value) 
                              ? 'bg-primary/10 border-primary/30' 
                              : 'hover:bg-muted/50'
                          }`}
                          onClick={() => {
                            const newResolutions = criteria.imageResolutions.includes(option.value)
                              ? criteria.imageResolutions.filter(r => r !== option.value)
                              : [...criteria.imageResolutions, option.value] as ImageResolutionOption[];
                            updateCriteria({ imageResolutions: newResolutions });
                          }}
                        >
                          <Checkbox 
                            checked={criteria.imageResolutions.includes(option.value)} 
                            id={`res-${option.value}`}
                          />
                          <Label htmlFor={`res-${option.value}`} className="flex-1 cursor-pointer">
                            <span className="font-medium">{option.label}</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              {option.description}
                            </span>
                          </Label>
                        </div>
                      ))}
                    </div>
                    
                    {criteria.imageResolutions.length === 0 && (
                      <p className="text-xs text-amber-600 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Selecciona al menos una resolución
                      </p>
                    )}
                  </div>
                )}

                {/* Filtros de calidad */}
                {criteria.requireImage && (
                  <div className="space-y-3 pt-2 border-t">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                      Filtros de calidad
                    </Label>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <UserX className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <Label className="text-sm">Excluir retratos y documentos</Label>
                          <p className="text-[10px] text-muted-foreground">
                            Evita fotos de personas, publicaciones y documentos
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={criteria.imageExcludePortraits}
                        onCheckedChange={(checked) => updateCriteria({ imageExcludePortraits: checked })}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Target className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <Label className="text-sm">Coincidir con tipo de lugar</Label>
                          <p className="text-[10px] text-muted-foreground">
                            Paisaje para naturaleza, edificio para arquitectura, etc.
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={criteria.imageMatchPlaceType}
                        onCheckedChange={(checked) => updateCriteria({ imageMatchPlaceType: checked })}
                      />
                    </div>
                  </div>
                )}
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

            {/* Geography */}
            <AccordionItem value="geography" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-primary" />
                  <span>Geografía</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Jerarquía geográfica completa</Label>
                    <p className="text-xs text-muted-foreground">Requiere continente, país y región</p>
                  </div>
                  <Switch
                    checked={criteria.requireFullGeography}
                    onCheckedChange={(checked) => updateCriteria({ requireFullGeography: checked })}
                  />
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
