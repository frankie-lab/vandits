import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Save, X, Share2, Loader2, Tag, MapPin } from 'lucide-react';
import { renderTransportModeIcon } from '@/lib/icon-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useLocationsStore } from '@/store/locations-store';
import { toast } from 'sonner';

interface PersonalCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  is_shared: boolean;
  sort_order: number;
  locationCount?: number;
}

const ICON_OPTIONS = ['map-pin', 'tent', 'fish', 'circle-parking', 'droplets', 'trees', 'wrench', 'shopping-cart', 'star', 'home', 'tree-pine', 'mountain', 'shower-head', 'anchor', 'utensils', 'camera', 'target', 'umbrella-beach', 'fuel', 'plug'];
const COLOR_OPTIONS = ['#22c55e', '#3b82f6', '#6b7280', '#06b6d4', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b', '#84cc16'];

export function PersonalCategoriesPanel() {
  const { user } = useAuth();
  const documents = useLocationsStore(state => state.documents);
  const updateLocation = useLocationsStore(state => state.updateLocation);

  const [categories, setCategories] = useState<PersonalCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PersonalCategory | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formIcon, setFormIcon] = useState('map-pin');
  const [formColor, setFormColor] = useState('#6b7280');
  const [formShared, setFormShared] = useState(false);

  // Reclassify state
  const [reclassifyLocationId, setReclassifyLocationId] = useState<string | null>(null);
  const [uncategorizedLocations, setUncategorizedLocations] = useState<{ id: string; name: string; currentCategory?: string }[]>([]);

  const loadCategories = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('personal_categories')
        .select('*')
        .eq('user_id', user.id)
        .order('sort_order', { ascending: true });

      if (error) throw error;

      // Count locations per category
      const { data: locationCounts } = await supabase
        .from('locations')
        .select('personal_category_id')
        .not('personal_category_id', 'is', null);

      const countMap: Record<string, number> = {};
      locationCounts?.forEach(l => {
        const catId = l.personal_category_id as string;
        countMap[catId] = (countMap[catId] || 0) + 1;
      });

      setCategories((data || []).map(c => ({
        ...c,
        locationCount: countMap[c.id] || 0,
      })));
    } catch (e) {
      console.error('Error loading categories:', e);
      toast.error('Error al cargar categorías');
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Load uncategorized locations (no enrichment, no personal category)
  const loadUncategorized = useCallback(() => {
    const allLocs = documents.flatMap(d =>
      d.locations
        .filter(l => !l.enrichedData && !l.enrichmentStatus)
        .map(l => ({ id: l.id, name: l.name, currentCategory: undefined as string | undefined }))
    );
    setUncategorizedLocations(allLocs);
  }, [documents]);

  useEffect(() => { loadCategories(); }, [loadCategories]);
  useEffect(() => { loadUncategorized(); }, [loadUncategorized]);

  const resetForm = () => {
    setFormName('');
    setFormIcon('map-pin');
    setFormColor('#6b7280');
    setFormShared(false);
    setEditingId(null);
    setCreating(false);
  };

  const startEdit = (cat: PersonalCategory) => {
    setEditingId(cat.id);
    setFormName(cat.name);
    setFormIcon(cat.icon);
    setFormColor(cat.color);
    setFormShared(cat.is_shared);
    setCreating(false);
  };

  const startCreate = () => {
    resetForm();
    setCreating(true);
  };

  const handleSave = async () => {
    if (!user || !formName.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        const { error } = await supabase
          .from('personal_categories')
          .update({ name: formName.trim(), icon: formIcon, color: formColor, is_shared: formShared })
          .eq('id', editingId);
        if (error) throw error;
        toast.success('Categoría actualizada');
      } else {
        const { error } = await supabase
          .from('personal_categories')
          .insert({ user_id: user.id, name: formName.trim(), icon: formIcon, color: formColor, is_shared: formShared, sort_order: categories.length });
        if (error) {
          if (error.code === '23505') {
            toast.error('Ya existe una categoría con ese nombre');
            return;
          }
          throw error;
        }
        toast.success('Categoría creada');
      }
      resetForm();
      await loadCategories();
    } catch (e: any) {
      console.error('Error saving category:', e);
      toast.error('Error al guardar categoría');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      // Unassign locations first
      await supabase
        .from('locations')
        .update({ personal_category_id: null })
        .eq('personal_category_id', deleteTarget.id);

      const { error } = await supabase
        .from('personal_categories')
        .delete()
        .eq('id', deleteTarget.id);
      if (error) throw error;

      toast.success('Categoría eliminada');
      setDeleteTarget(null);
      await loadCategories();
    } catch (e) {
      console.error('Error deleting category:', e);
      toast.error('Error al eliminar categoría');
    } finally {
      setDeleting(false);
    }
  };

  const assignLocationToCategory = async (locationId: string, categoryId: string) => {
    try {
      const { error } = await supabase
        .from('locations')
        .update({ personal_category_id: categoryId })
        .eq('id', locationId);
      if (error) throw error;

      // Update local store
      updateLocation(locationId, {} as any); // trigger re-render
      setUncategorizedLocations(prev => prev.filter(l => l.id !== locationId));
      toast.success('Punto reclasificado');
      await loadCategories();
    } catch (e) {
      console.error('Error assigning category:', e);
      toast.error('Error al reclasificar');
    }
  };

  const isEditing = editingId !== null || creating;

  return (
    <div className="flex flex-col h-full">
      {/* Header actions */}
      <div className="p-3 flex items-center justify-between border-b border-border">
        <span className="text-xs text-muted-foreground font-medium">
          {categories.length} categoría{categories.length !== 1 ? 's' : ''}
        </span>
        {!isEditing && (
          <Button size="sm" variant="outline" onClick={startCreate} className="h-7 text-xs gap-1">
            <Plus className="w-3 h-3" /> Nueva
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {/* Create/Edit form */}
          {isEditing && (
            <div className="p-3 rounded-lg border border-primary/30 bg-primary/5 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{editingId ? 'Editar' : 'Nueva categoría'}</span>
              </div>

              <Input
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="Nombre de la categoría"
                className="h-8 text-sm"
              />

              <div className="space-y-2">
                <Label className="text-xs">Icono</Label>
                <div className="flex flex-wrap gap-1.5">
                  {ICON_OPTIONS.map(icon => (
                    <button
                      key={icon}
                      onClick={() => setFormIcon(icon)}
                      className={`w-8 h-8 rounded-md flex items-center justify-center text-base border transition-all ${
                        formIcon === icon
                          ? 'border-primary bg-primary/10 ring-1 ring-primary'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      {renderTransportModeIcon(icon, null, 'w-4 h-4')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Color</Label>
                <div className="flex flex-wrap gap-1.5">
                  {COLOR_OPTIONS.map(color => (
                    <button
                      key={color}
                      onClick={() => setFormColor(color)}
                      className={`w-7 h-7 rounded-full border-2 transition-all ${
                        formColor === color ? 'border-foreground scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1.5">
                  <Share2 className="w-3 h-3" /> Compartir con seguidores
                </Label>
                <Switch checked={formShared} onCheckedChange={setFormShared} />
              </div>

              <div className="flex gap-2">
                <Button size="sm" onClick={handleSave} disabled={!formName.trim() || saving} className="h-7 text-xs gap-1 flex-1">
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  {editingId ? 'Guardar' : 'Crear'}
                </Button>
                <Button size="sm" variant="ghost" onClick={resetForm} className="h-7 text-xs">
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </div>
          )}

          {/* Categories list */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : categories.length === 0 && !isEditing ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Tag className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>No hay categorías personales</p>
              <p className="text-xs mt-1">Crea una para clasificar tus puntos</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {categories.map(cat => (
                <div
                  key={cat.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:border-primary/30 transition-colors group"
                >
                  <span
                    className="w-8 h-8 rounded-md flex items-center justify-center text-base shrink-0"
                    style={{ backgroundColor: cat.color + '20', border: `1px solid ${cat.color}40` }}
                  >
                    {renderTransportModeIcon(cat.icon, null, 'w-4 h-4')}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{cat.name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <span>{cat.locationCount || 0} puntos</span>
                      {cat.is_shared && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1">
                          <Share2 className="w-2.5 h-2.5 mr-0.5" /> Compartida
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => startEdit(cat)}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => setDeleteTarget(cat)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Uncategorized locations section */}
          {uncategorizedLocations.length > 0 && categories.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Puntos sin clasificar</span>
                  <Badge variant="secondary" className="text-xs h-5">{uncategorizedLocations.length}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Asigna una categoría personal a estos puntos no enriquecidos
                </p>
                <div className="space-y-1">
                  {uncategorizedLocations.slice(0, 50).map(loc => (
                    <div key={loc.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-border text-sm">
                      <span className="flex-1 truncate text-xs">{loc.name}</span>
                      <Select onValueChange={(catId) => assignLocationToCategory(loc.id, catId)}>
                        <SelectTrigger className="h-6 w-[140px] text-xs">
                          <SelectValue placeholder="Asignar..." />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map(cat => (
                            <SelectItem key={cat.id} value={cat.id} className="text-xs">
                              <span className="flex items-center gap-1.5">
                                <span>{renderTransportModeIcon(cat.icon, null, 'w-3.5 h-3.5')}</span> {cat.name}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                  {uncategorizedLocations.length > 50 && (
                    <p className="text-xs text-muted-foreground text-center py-1">
                      y {uncategorizedLocations.length - 50} más...
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </ScrollArea>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar categoría?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <strong>{deleteTarget?.name}</strong> y se desasignarán {deleteTarget?.locationCount || 0} puntos vinculados. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
