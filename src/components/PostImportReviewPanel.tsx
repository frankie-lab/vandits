import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Sparkles, Tag, SkipForward, MapPin, CheckCircle, ChevronDown, ChevronUp, Eye,
} from 'lucide-react';
import { renderTransportModeIcon } from '@/lib/icon-utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useLocationsStore } from '@/store/locations-store';
import { toast } from 'sonner';

/** Data passed when the panel opens after import */
export interface PostImportReviewData {
  /** Document ID of the import */
  documentId: string;
  /** New point IDs (non-matching) */
  newPointIds: string[];
  /** Matching point IDs (auto-enriched) */
  matchingPointIds: string[];
  /** The action chosen during preview for new points */
  defaultAction: 'enrich' | 'category' | 'skip';
  /** Default category if chosen */
  defaultCategory?: string;
  defaultCategoryIcon?: string;
  defaultCategoryColor?: string;
}

const PREDEFINED_CATEGORIES = [
  { name: 'Zona de acampada', icon: 'tent', color: '#22c55e' },
  { name: 'Lugar de pesca', icon: 'fish', color: '#3b82f6' },
  { name: 'Parking / Parada', icon: 'circle-parking', color: '#6b7280' },
  { name: 'Punto de agua', icon: 'droplets', color: '#06b6d4' },
  { name: 'Área de descanso', icon: 'trees', color: '#f59e0b' },
  { name: 'Taller / Servicio', icon: 'wrench', color: '#ef4444' },
  { name: 'Aprovisionamiento', icon: 'shopping-cart', color: '#8b5cf6' },
  { name: 'Punto personal', icon: 'map-pin', color: '#64748b' },
];

type PointAction = 'enrich' | 'category' | 'skip';

interface PointDecision {
  action: PointAction;
  categoryName?: string;
  categoryIcon?: string;
  categoryColor?: string;
}

interface PostImportReviewPanelProps {
  data: PostImportReviewData;
  onClose: () => void;
}

export function PostImportReviewPanel({ data, onClose }: PostImportReviewPanelProps) {
  const { user } = useAuth();
  const documents = useLocationsStore(state => state.documents);

  // Resolve new points from the store
  const newPoints = useMemo(() => {
    const idSet = new Set(data.newPointIds);
    for (const doc of documents) {
      const found = doc.locations.filter(loc => idSet.has(loc.id));
      if (found.length > 0) return found;
    }
    return [];
  }, [documents, data.newPointIds]);

  // Per-point decisions, initialized with the default action
  const [decisions, setDecisions] = useState<Record<string, PointDecision>>(() => {
    const init: Record<string, PointDecision> = {};
    for (const id of data.newPointIds) {
      init[id] = {
        action: data.defaultAction,
        categoryName: data.defaultCategory,
        categoryIcon: data.defaultCategoryIcon,
        categoryColor: data.defaultCategoryColor,
      };
    }
    return init;
  });

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const updateDecision = useCallback((id: string, patch: Partial<PointDecision>) => {
    setDecisions(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  const setCategoryForPoint = useCallback((id: string, cat: typeof PREDEFINED_CATEGORIES[number]) => {
    updateDecision(id, { action: 'category', categoryName: cat.name, categoryIcon: cat.icon, categoryColor: cat.color });
  }, [updateDecision]);

  // Bulk action
  const setBulkAction = useCallback((action: PointAction) => {
    setDecisions(prev => {
      const next = { ...prev };
      for (const id of data.newPointIds) {
        next[id] = { ...next[id], action };
      }
      return next;
    });
  }, [data.newPointIds]);

  // Summary counts
  const summary = useMemo(() => {
    let enrich = 0, category = 0, skip = 0;
    for (const id of data.newPointIds) {
      const d = decisions[id];
      if (d?.action === 'enrich') enrich++;
      else if (d?.action === 'category') category++;
      else skip++;
    }
    return { enrich, category, skip };
  }, [decisions, data.newPointIds]);

  const handleConfirm = useCallback(async () => {
    if (!user) return;
    setIsProcessing(true);
    try {
      // Collect IDs by action
      const enrichIds: string[] = [];
      const categoryGroups: Record<string, { ids: string[]; icon: string; color: string }> = {};

      for (const [id, dec] of Object.entries(decisions)) {
        if (dec.action === 'enrich') {
          enrichIds.push(id);
        } else if (dec.action === 'category' && dec.categoryName) {
          if (!categoryGroups[dec.categoryName]) {
            categoryGroups[dec.categoryName] = { ids: [], icon: dec.categoryIcon || 'map-pin', color: dec.categoryColor || '#64748b' };
          }
          categoryGroups[dec.categoryName].ids.push(id);
        }
        // skip → do nothing
      }

      // Trigger batch-enrich for enrichIds
      if (enrichIds.length > 0) {
        const { error } = await supabase.functions.invoke('batch-enrich', {
          body: {
            action: 'start',
            documentId: data.documentId,
            locationIds: enrichIds,
          },
        });
        if (error) {
          console.error('Enrich error:', error);
          toast.error('No se pudo iniciar el enriquecimiento');
        } else {
          toast.success(`Enriqueciendo ${enrichIds.length} puntos...`);
        }
      }

      // Assign categories
      for (const [catName, group] of Object.entries(categoryGroups)) {
        // Upsert personal category
        const { data: existingCat } = await supabase
          .from('personal_categories')
          .select('id')
          .eq('user_id', user.id)
          .eq('name', catName)
          .maybeSingle();

        let categoryId = existingCat?.id;
        if (!categoryId) {
          const { data: newCat } = await supabase
            .from('personal_categories')
            .insert({ user_id: user.id, name: catName, icon: group.icon, color: group.color })
            .select('id')
            .single();
          categoryId = newCat?.id;
        }

        if (categoryId) {
          await supabase
            .from('locations')
            .update({ personal_category_id: categoryId })
            .in('id', group.ids);
        }
      }

      toast.success('Revisión completada');
      onClose();
    } catch (e) {
      console.error('Post-import review error:', e);
      toast.error('Error al procesar la revisión');
    } finally {
      setIsProcessing(false);
    }
  }, [user, decisions, data.documentId, onClose]);

  if (newPoints.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        No hay puntos nuevos para revisar.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-h-[70vh]">
      {/* Header summary */}
      <div className="p-3 space-y-2 border-b">
        <p className="text-sm text-muted-foreground">
          {newPoints.length} puntos nuevos importados. Revisa y decide qué hacer con cada uno.
        </p>
        {data.matchingPointIds.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-500/10 rounded-md px-2 py-1">
            <CheckCircle className="w-3.5 h-3.5 shrink-0" />
            {data.matchingPointIds.length} puntos coincidentes se enriquecen automáticamente
          </div>
        )}

        {/* Bulk actions */}
        <div className="flex gap-1.5">
          <Button
            variant={summary.enrich === newPoints.length ? 'default' : 'outline'}
            size="sm" className="text-xs flex-1"
            onClick={() => setBulkAction('enrich')}
          >
            <Sparkles className="w-3 h-3 mr-1" /> Todos IA
          </Button>
          <Button
            variant={summary.skip === newPoints.length ? 'default' : 'outline'}
            size="sm" className="text-xs flex-1"
            onClick={() => setBulkAction('skip')}
          >
            <SkipForward className="w-3 h-3 mr-1" /> Ninguno
          </Button>
        </div>
      </div>

      {/* Point list */}
      <ScrollArea className="flex-1">
        <div className="divide-y">
          {newPoints.map(point => {
            const dec = decisions[point.id];
            const isExpanded = expandedId === point.id;

            return (
              <div key={point.id} className="px-3 py-2">
                <button
                  type="button"
                  className="flex items-center gap-2 w-full text-left"
                  onClick={() => setExpandedId(isExpanded ? null : point.id)}
                >
                  <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-sm font-medium truncate flex-1">{point.name}</span>
                  <Badge variant="outline" className={cn(
                    'text-[10px] shrink-0',
                    dec?.action === 'enrich' && 'bg-primary/10 text-primary border-primary/30',
                    dec?.action === 'category' && 'bg-violet-500/10 text-violet-600 border-violet-500/30',
                    dec?.action === 'skip' && 'bg-muted text-muted-foreground',
                  )}>
                    {dec?.action === 'enrich' ? 'IA' : dec?.action === 'category' ? dec.categoryName : 'Sin acción'}
                  </Badge>
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                </button>

                {isExpanded && (
                  <div className="mt-2 ml-5 space-y-2">
                    {point.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{point.description}</p>
                    )}
                    {/* Action buttons */}
                    <div className="flex gap-1.5 flex-wrap">
                      <Button
                        variant={dec?.action === 'enrich' ? 'default' : 'outline'}
                        size="sm" className="text-xs h-7"
                        onClick={() => updateDecision(point.id, { action: 'enrich' })}
                      >
                        <Sparkles className="w-3 h-3 mr-1" /> Enriquecer IA
                      </Button>
                      <Button
                        variant={dec?.action === 'skip' ? 'default' : 'outline'}
                        size="sm" className="text-xs h-7"
                        onClick={() => updateDecision(point.id, { action: 'skip' })}
                      >
                        <SkipForward className="w-3 h-3 mr-1" /> Sin acción
                      </Button>
                    </div>
                    {/* Category quick-assign */}
                    <div className="flex gap-1 flex-wrap">
                      {PREDEFINED_CATEGORIES.map(cat => (
                        <button
                          key={cat.name}
                          type="button"
                          title={cat.name}
                          className={cn(
                            'w-7 h-7 rounded-md flex items-center justify-center border transition-all',
                            dec?.action === 'category' && dec?.categoryName === cat.name
                              ? 'ring-2 ring-primary border-primary'
                              : 'border-border hover:bg-muted/50'
                          )}
                          onClick={() => setCategoryForPoint(point.id, cat)}
                        >
                          {renderTransportModeIcon(cat.icon, null, 'w-3.5 h-3.5')}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-3 border-t space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{summary.enrich} enriquecer</span>
          <span>{summary.category} categorizar</span>
          <span>{summary.skip} sin acción</span>
        </div>
        <Button
          className="w-full"
          onClick={handleConfirm}
          disabled={isProcessing}
        >
          {isProcessing ? 'Procesando...' : 'Confirmar revisión'}
        </Button>
      </div>
    </div>
  );
}
