import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Save, X, Loader2, Tag, ChevronDown } from 'lucide-react';
import { renderLineIcon } from '@/lib/icon-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { IconPickerGrid } from '@/components/IconPickerGrid';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';

interface PersonalCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string | null;
  is_shared: boolean;
  sort_order: number;
  locationCount?: number;
}

interface PersonalCategoriesPanelProps {
  selectedCategoryId?: string | null;
  onSelectCategory?: (categoryId: string | null) => void;
}

export function PersonalCategoriesPanel({ selectedCategoryId, onSelectCategory }: PersonalCategoriesPanelProps = {}) {
  const { user } = useAuth();

  const [categories, setCategories] = useState<PersonalCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<PersonalCategory | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PersonalCategory | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formIcon, setFormIcon] = useState('map-pin');
  const [formColor, setFormColor] = useState('#6b7280');
  const [formDescription, setFormDescription] = useState('');

  const loadCategories = useCallback(async () => {
    // Always try getSession — it's the most reliable source
    const { data: { session } } = await supabase.auth.getSession();
    const userId = user?.id || session?.user?.id;
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [catsResult, countsResult] = await Promise.all([
        supabase
          .from('personal_categories')
          .select('*')
          .eq('user_id', userId)
          .order('sort_order', { ascending: true }),
        supabase
          .from('locations')
          .select('personal_category_id')
          .not('personal_category_id', 'is', null),
      ]);

      if (catsResult.error) throw catsResult.error;

      const countMap: Record<string, number> = {};
      countsResult.data?.forEach(l => {
        const catId = l.personal_category_id as string;
        countMap[catId] = (countMap[catId] || 0) + 1;
      });

      setCategories((catsResult.data || []).map(c => ({
        ...c,
        locationCount: countMap[c.id] || 0,
      })));
    } catch (e) {
      console.error('Error loading categories:', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Load on mount and when user changes
  useEffect(() => { loadCategories(); }, [loadCategories]);

  // Reload categories on custom event
  useEffect(() => {
    const handler = () => loadCategories();
    window.addEventListener('personal-categories:reload', handler);
    return () => window.removeEventListener('personal-categories:reload', handler);
  }, [loadCategories]);

  const resetForm = () => {
    setFormName('');
    setFormIcon('map-pin');
    setFormColor('#6b7280');
    setFormDescription('');
    setEditingCategory(null);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (cat: PersonalCategory) => {
    setEditingCategory(cat);
    setFormName(cat.name);
    setFormIcon(cat.icon);
    setFormColor(cat.color);
    setFormDescription(cat.description || '');
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    resetForm();
  };

  const handleSave = async () => {
    if (!user || !formName.trim()) return;
    setSaving(true);
    try {
      if (editingCategory) {
        const { error } = await supabase
          .from('personal_categories')
          .update({ name: formName.trim(), icon: formIcon, color: formColor, description: formDescription.trim() || null })
          .eq('id', editingCategory.id);
        if (error) throw error;
        toast.success('Categoría actualizada');
      } else {
        const { error } = await supabase
          .from('personal_categories')
          .insert({ user_id: user.id, name: formName.trim(), icon: formIcon, color: formColor, description: formDescription.trim() || null, sort_order: categories.length });
        if (error) {
          if (error.code === '23505') {
            toast.error('Ya existe una categoría con ese nombre');
            return;
          }
          throw error;
        }
        toast.success('Categoría creada');
      }
      closeDialog();
      await loadCategories();
      window.dispatchEvent(new CustomEvent('personal-categories:reload'));
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
      if (selectedCategoryId === deleteTarget.id) {
        onSelectCategory?.(null);
      }
      await loadCategories();
    } catch (e) {
      console.error('Error deleting category:', e);
      toast.error('Error al eliminar categoría');
    } finally {
      setDeleting(false);
    }
  };

  const selectedCat = categories.find(c => c.id === selectedCategoryId);

  return (
    <>
      {/* Compact combo + add button */}
      <div className="flex items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 min-w-0 flex-1 justify-between">
              {loading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : selectedCat ? (
                <span className="flex items-center gap-1.5 truncate">
                  {renderLineIcon(selectedCat.icon, { className: 'w-3.5 h-3.5 shrink-0', color: selectedCat.color })}
                  <span className="truncate">{selectedCat.name}</span>
                </span>
              ) : (
                <span className="text-muted-foreground">Sin categoría</span>
              )}
              <ChevronDown className="w-3 h-3 shrink-0 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onClick={() => onSelectCategory?.(null)}>
              <span className="text-muted-foreground">Sin categoría</span>
            </DropdownMenuItem>
            {categories.map(cat => (
              <DropdownMenuItem key={cat.id} className="flex items-center justify-between gap-2" onClick={() => onSelectCategory?.(cat.id)}>
                <span className="flex items-center gap-2 truncate">
                  {renderLineIcon(cat.icon, { className: 'w-4 h-4 shrink-0', color: cat.color })}
                  <span className="truncate">{cat.name}</span>
                  <span className="text-[10px] text-muted-foreground">{cat.locationCount || 0}</span>
                </span>
                <div className="flex gap-0.5" onClick={e => e.stopPropagation()}>
                  <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => openEdit(cat)}>
                    <Pencil className="w-2.5 h-2.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-5 w-5 text-destructive" onClick={() => setDeleteTarget(cat)}>
                    <Trash2 className="w-2.5 h-2.5" />
                  </Button>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={openCreate}>
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Create/Edit dialog - centered */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">{editingCategory ? 'Editar categoría' : 'Nueva categoría'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Input
              value={formName}
              onChange={e => setFormName(e.target.value)}
              placeholder="Nombre de la categoría"
              className="h-9 text-sm"
              autoFocus
            />

            <div className="space-y-1">
              <Label className="text-xs">Descripción</Label>
              <Input
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
                placeholder="Descripción opcional"
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Icono</Label>
              <IconPickerGrid selected={formIcon} onSelect={setFormIcon} />
            </div>

            <div className="flex items-center gap-2">
              <Label className="text-xs shrink-0">Color</Label>
              <input
                type="color"
                value={formColor}
                onChange={e => setFormColor(e.target.value)}
                className="w-8 h-8 rounded-full border border-border cursor-pointer p-0.5 bg-transparent"
              />
              <span className="text-xs text-muted-foreground font-mono">{formColor}</span>
            </div>


            <div className="flex gap-2 pt-2">
              <Button size="sm" onClick={handleSave} disabled={!formName.trim() || saving} className="h-8 text-xs gap-1 flex-1">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                {editingCategory ? 'Guardar' : 'Crear'}
              </Button>
              <Button size="sm" variant="ghost" onClick={closeDialog} className="h-8 text-xs">
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
    </>
  );
}
