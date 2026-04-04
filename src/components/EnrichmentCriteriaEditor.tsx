import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Settings2, Save, RotateCcw, AlertTriangle, Check, Hash, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
 Sheet,
 SheetContent,
 SheetHeader,
 SheetTitle,
 SheetDescription,
} from '@/components/ui/sheet';
import {
 Accordion,
 AccordionContent,
 AccordionItem,
 AccordionTrigger,
} from "@/components/ui/accordion";
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface EnrichmentCriteriaEditorProps {
 open: boolean;
 onOpenChange: (open: boolean) => void;
}

// Default criteria based on current implementation
const DEFAULT_TAG_RULES = `REGLAS DE ETIQUETAS:
- Las etiquetas se generan a partir de los resultados de las consultas realizadas para construir la descripción
- Deben reflejar: naturaleza, tipología, contexto geográfico, cultural o funcional del punto
- NO incluir etiquetas redundantes (#España si ya está en etiquetas_geograficas)
- NO incluir etiquetas genéricas (#Turismo, #Viaje)
- Usar formato CamelCase sin espacios: #PatrimonioHistórico, #ParqueNatural
- Normalizar ortografía: siempre con acentos (#CastillaYLeón, NO #CastillayLeon)

CATEGORÍAS SUGERIDAS:
1. Tipo de lugar: #Municipio, #Castillo, #Playa, #Montaña, #ParqueNatural, #Mirador
2. Patrimonio: #PatrimonioHistórico, #PatrimonioDeLaHumanidad, #BienDeInterésCultural
3. Naturaleza: #Geología, #Bosque, #Cascada, #Acantilados, #ReservaNatural
4. Arquitectura: #Románico, #Gótico, #ArquitecturaMedieval, #ArquitecturaTradicional
5. Actividades: #Senderismo, #Fotografía, #BañoPermitido
6. Acceso: #AccesoLibre, #AccesoPago, #Accesible
7. Público: #FamiliaConNiños, #PetFriendly`;

const DEFAULT_CONTENT_RULES = `REGLAS DE CONTENIDO:

1. Nombre del lugar: 
 - Usar únicamente el nombre oficial o el más común documentado
 - Coherente con las coordenadas
 - No añadir descriptores

2. Localización: 
 - Una sola línea estructurada: vía/núcleo, municipio, provincia, región, país, continente
 - Derivada directamente de las coordenadas

3. Descripción: 
 - Entre 2 y 3 frases exclusivamente factuales
 - Qué es el lugar + dato físico/geográfico/histórico principal
 - Tiempo verbal: presente

4. Punto destacado: 
 - Una sola frase
 - El elemento más relevante documentado

5. Observación (opcional): 
 - Solo información práctica verificable
 - Horarios, acceso, recomendaciones prácticas
 - Sin valoración subjetiva

6. Datos clave: 
 - Solo datos verificados: tipo, dimensión, acceso, protección, coordenadas, web`;

const DEFAULT_TONE_RULES = `IDIOMA Y TONO:
- Castellano normativo
- Estilo descriptivo, técnico y neutral
- Prohibido lenguaje promocional, emocional o literario
- No usar superlativos ni adjetivos valorativos

PROHIBICIONES:
- No metáforas
- No adjetivos valorativos (espectacular, impresionante, maravilloso)
- No experiencias personales
- No inventar datos
- No inferencias no respaldadas
- No presentar datos no verificados (omitir en vez de decir "no disponible")`;

export function EnrichmentCriteriaEditor({ open, onOpenChange }: EnrichmentCriteriaEditorProps) {
 const [tagRules, setTagRules] = useState(DEFAULT_TAG_RULES);
 const [contentRules, setContentRules] = useState(DEFAULT_CONTENT_RULES);
 const [toneRules, setToneRules] = useState(DEFAULT_TONE_RULES);
 const [customInstructions, setCustomInstructions] = useState('');
 const [isSaving, setIsSaving] = useState(false);
 const [hasChanges, setHasChanges] = useState(false);

  // Load saved criteria from localStorage
 useEffect(() => {
 const saved = localStorage.getItem('enrichment-criteria');
 if (saved) {
 try {
 const parsed = JSON.parse(saved);
 if (parsed.tagRules) setTagRules(parsed.tagRules);
 if (parsed.contentRules) setContentRules(parsed.contentRules);
 if (parsed.toneRules) setToneRules(parsed.toneRules);
 if (parsed.customInstructions) setCustomInstructions(parsed.customInstructions);
 } catch (e) {
 console.error('Error loading saved criteria:', e);
 }
 }
 }, []);

  // Track changes
 useEffect(() => {
 const saved = localStorage.getItem('enrichment-criteria');
 const current = JSON.stringify({ tagRules, contentRules, toneRules, customInstructions });
 setHasChanges(saved !== current);
 }, [tagRules, contentRules, toneRules, customInstructions]);

 const handleSave = async () => {
 setIsSaving(true);
 try {
 const criteria = { tagRules, contentRules, toneRules, customInstructions };
 localStorage.setItem('enrichment-criteria', JSON.stringify(criteria));
 
      // Also save to database for persistence across devices
      // This would require a new table, for now just local storage
 
 toast.success('Criterios guardados correctamente');
 setHasChanges(false);
 } catch (error) {
 console.error('Error saving criteria:', error);
 toast.error('Error al guardar los criterios');
 } finally {
 setIsSaving(false);
 }
 };

 const handleReset = () => {
 setTagRules(DEFAULT_TAG_RULES);
 setContentRules(DEFAULT_CONTENT_RULES);
 setToneRules(DEFAULT_TONE_RULES);
 setCustomInstructions('');
 toast.info('Criterios restaurados a valores por defecto');
 };

 return (
 <Sheet open={open} onOpenChange={onOpenChange}>
 <SheetContent className="w-full sm:max-w-xl flex flex-col">
 <SheetHeader>
 <SheetTitle className="font-display flex items-center gap-2">
 <Settings2 className="w-5 h-5 text-primary" />
 Criterios de Enriquecimiento
 </SheetTitle>
 <SheetDescription>
 Personaliza cómo se generan las fichas técnicas
 </SheetDescription>
 </SheetHeader>

 <ScrollArea className="flex-1 -mx-6 px-6 mt-4">
 <Tabs defaultValue="tags" className="w-full">
 <TabsList className="w-full grid grid-cols-3 mb-4">
 <TabsTrigger value="tags" className="gap-1.5">
 <Hash className="w-3.5 h-3.5" />
 Etiquetas
 </TabsTrigger>
 <TabsTrigger value="content" className="gap-1.5">
 <FileText className="w-3.5 h-3.5" />
 Contenido
 </TabsTrigger>
 <TabsTrigger value="tone" className="gap-1.5">
 <Settings2 className="w-3.5 h-3.5" />
 Tono
 </TabsTrigger>
 </TabsList>

 <TabsContent value="tags" className="space-y-4">
 <div className="space-y-2">
 <Label className="text-sm font-medium">Reglas de Etiquetas</Label>
 <p className="text-xs text-muted-foreground">
 Define cómo se generan y normalizan los hashtags
 </p>
 <Textarea
 value={tagRules}
 onChange={(e) => setTagRules(e.target.value)}
 className="min-h-[300px] font-mono text-xs"
 placeholder="Reglas para generación de etiquetas..."
 />
 </div>

 <Accordion type="single" collapsible className="w-full">
 <AccordionItem value="examples">
 <AccordionTrigger className="text-sm">
 Ver etiquetas actuales más usadas
 </AccordionTrigger>
 <AccordionContent>
 <div className="flex flex-wrap gap-1.5 p-2 bg-muted rounded-lg">
 {['#Municipio', '#PatrimonioHistórico', '#Castillo', '#Geología', '#ParqueNatural', 
 '#Asturias', '#Aragón', '#Cataluña', '#Playa', '#Románico', '#Fortaleza',
 '#Pirineos', '#ArquitecturaMedieval', '#Cascada', '#Montaña'].map(tag => (
 <Badge key={tag} variant="secondary" className="text-xs">
 {tag}
 </Badge>
 ))}
 </div>
 </AccordionContent>
 </AccordionItem>
 </Accordion>
 </TabsContent>

 <TabsContent value="content" className="space-y-4">
 <div className="space-y-2">
 <Label className="text-sm font-medium">Reglas de Contenido</Label>
 <p className="text-xs text-muted-foreground">
 Estructura y formato de las fichas técnicas
 </p>
 <Textarea
 value={contentRules}
 onChange={(e) => setContentRules(e.target.value)}
 className="min-h-[300px] font-mono text-xs"
 placeholder="Reglas para contenido de fichas..."
 />
 </div>
 </TabsContent>

 <TabsContent value="tone" className="space-y-4">
 <div className="space-y-2">
 <Label className="text-sm font-medium">Idioma y Tono</Label>
 <p className="text-xs text-muted-foreground">
 Estilo de redacción y prohibiciones
 </p>
 <Textarea
 value={toneRules}
 onChange={(e) => setToneRules(e.target.value)}
 className="min-h-[250px] font-mono text-xs"
 placeholder="Reglas de tono y estilo..."
 />
 </div>
 </TabsContent>
 </Tabs>

 {/* Custom Instructions */}
 <div className="mt-6 space-y-2">
 <Label className="text-sm font-medium">Instrucciones Adicionales</Label>
 <p className="text-xs text-muted-foreground">
 Instrucciones personalizadas que se añadirán al final del prompt
 </p>
 <Textarea
 value={customInstructions}
 onChange={(e) => setCustomInstructions(e.target.value)}
 className="min-h-[100px] font-mono text-xs"
 placeholder="Ejemplo: Prioriza información sobre accesibilidad. Incluye siempre horarios si están disponibles..."
 />
 </div>

 {/* Warning about re-enrichment */}
 <motion.div 
 initial={{ opacity: 0, y: 10 }}
 animate={{ opacity: 1, y: 0 }}
 className="mt-6 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800"
 >
 <div className="flex items-start gap-2">
 <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
 <div className="text-xs text-amber-700 dark:text-amber-400">
 <strong>Nota:</strong> Los cambios en los criterios solo afectan a nuevos enriquecimientos. 
 Para aplicar los nuevos criterios a ubicaciones ya enriquecidas, deberás regenerar sus fichas manualmente o usar el enriquecimiento por lotes con la opción de re-procesar.
 </div>
 </div>
 </motion.div>
 </ScrollArea>

 {/* Actions */}
 <div className="flex gap-2 pt-4 border-t mt-4">
 <Button
 variant="outline"
 onClick={handleReset}
 className="gap-2"
 >
 <RotateCcw className="w-4 h-4" />
 Restaurar
 </Button>
 <Button
 onClick={handleSave}
 className="flex-1 gap-2"
 disabled={!hasChanges || isSaving}
 >
 {isSaving ? (
 <motion.div
 animate={{ rotate: 360 }}
 transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
 >
 <Settings2 className="w-4 h-4" />
 </motion.div>
 ) : hasChanges ? (
 <Save className="w-4 h-4" />
 ) : (
 <Check className="w-4 h-4" />
 )}
 {hasChanges ? 'Guardar Cambios' : 'Guardado'}
 </Button>
 </div>
 </SheetContent>
 </Sheet>
 );
}
