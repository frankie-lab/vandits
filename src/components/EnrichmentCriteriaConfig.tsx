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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
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

export interface EnrichmentCriteria {
  // Descripción
  minDescriptionLength: number;
  
  // Campos requeridos
  requireImage: boolean;
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
  requireImage: false,
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
  
  const { selectedDocument, getEnrichedStats } = useLocationsStore();

  // Calculate impact preview - now based on date, not field validation
  const calculateImpact = () => {
    if (!selectedDocument) return { current: 0, willBePending: 0 };
    
    const currentStats = getEnrichedStats();
    const enrichedCount = selectedDocument.locations.filter(l => l.enrichedData?.descripcion).length;
    
    return {
      current: currentStats.byCriteria.current,
      willBePending: enrichedCount, // All enriched locations will become "pending" after save
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
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="p-2 rounded bg-green-50 border border-green-200">
                <div className="text-xl font-bold text-green-600">{impact.current}</div>
                <div className="text-[10px] text-green-700">Actuales (verde)</div>
              </div>
              <div className="p-2 rounded bg-blue-50 border border-blue-200">
                <div className="text-xl font-bold text-blue-600">{impact.willBePending}</div>
                <div className="text-[10px] text-blue-700">Pasarán a pendiente</div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Al guardar, todas las fichas enriquecidas pasarán a "pendiente" (azul) hasta que se regeneren.
            </p>
          </div>

          <Accordion type="multiple" defaultValue={['description', 'fields']} className="space-y-2">
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

            {/* Required Fields */}
            <AccordionItem value="fields" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-primary" />
                  <span>Campos requeridos</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Image className="w-4 h-4 text-muted-foreground" />
                    <Label>Imagen obligatoria</Label>
                  </div>
                  <Switch
                    checked={criteria.requireImage}
                    onCheckedChange={(checked) => updateCriteria({ requireImage: checked })}
                  />
                </div>

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
