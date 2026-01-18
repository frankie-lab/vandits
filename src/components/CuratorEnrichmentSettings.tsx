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
  Star,
  MessageSquare,
  Plus,
  X,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
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

interface CuratorEnrichmentSettingsProps {
  curatorId: string;
  curatorName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface EnrichmentPreferences {
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

const TONE_OPTIONS = [
  { value: 'tecnico', label: 'Técnico', description: 'Datos precisos, objetivo, enciclopédico' },
  { value: 'divulgativo', label: 'Divulgativo', description: 'Equilibrio entre datos y narrativa' },
  { value: 'poetico', label: 'Poético', description: 'Evocador, sensorial, literario' },
  { value: 'formal', label: 'Formal', description: 'Institucional, protocolar' },
  { value: 'casual', label: 'Casual', description: 'Cercano, como un amigo' },
];

const DEFAULT_PREFERENCES: EnrichmentPreferences = {
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

  // Load preferences
  useEffect(() => {
    if (!open || !curatorId) return;

    const fetchPreferences = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('curators')
          .select('enrichment_tone, enrichment_min_length, enrichment_custom_prompt, enrichment_include_image, enrichment_include_web, enrichment_include_tags, enrichment_include_interest_index, enrichment_focus_keywords, enrichment_exclude_keywords')
          .eq('id', curatorId)
          .single();

        if (error) throw error;

        if (data) {
          setPreferences({
            enrichment_tone: data.enrichment_tone || DEFAULT_PREFERENCES.enrichment_tone,
            enrichment_min_length: data.enrichment_min_length || DEFAULT_PREFERENCES.enrichment_min_length,
            enrichment_custom_prompt: data.enrichment_custom_prompt,
            enrichment_include_image: data.enrichment_include_image ?? DEFAULT_PREFERENCES.enrichment_include_image,
            enrichment_include_web: data.enrichment_include_web ?? DEFAULT_PREFERENCES.enrichment_include_web,
            enrichment_include_tags: data.enrichment_include_tags ?? DEFAULT_PREFERENCES.enrichment_include_tags,
            enrichment_include_interest_index: data.enrichment_include_interest_index ?? DEFAULT_PREFERENCES.enrichment_include_interest_index,
            enrichment_focus_keywords: data.enrichment_focus_keywords || [],
            enrichment_exclude_keywords: data.enrichment_exclude_keywords || [],
          });
        }
      } catch (error) {
        console.error('Error loading curator preferences:', error);
        toast.error('Error al cargar preferencias');
      } finally {
        setIsLoading(false);
      }
    };

    fetchPreferences();
  }, [open, curatorId]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('curators')
        .update({
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
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
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
          <div className="flex-1 overflow-y-auto space-y-6 py-4">
            {/* Tone selection */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Tono de descripción
              </Label>
              <Select
                value={preferences.enrichment_tone}
                onValueChange={(value) => setPreferences({ ...preferences, enrichment_tone: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex flex-col">
                        <span className="font-medium">{option.label}</span>
                        <span className="text-xs text-muted-foreground">{option.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <Label className="text-sm font-medium">Contenido a incluir</Label>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Image className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">Buscar imagen de Wikimedia</span>
                  </div>
                  <Switch
                    checked={preferences.enrichment_include_image}
                    onCheckedChange={(checked) =>
                      setPreferences({ ...preferences, enrichment_include_image: checked })
                    }
                  />
                </div>

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
          </div>
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
