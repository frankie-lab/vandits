import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
 Trophy, ChevronDown, ChevronRight, Save, Plus, Trash2, 
 Loader2, GripVertical, ToggleLeft, ToggleRight, Pencil
} from 'lucide-react';
import { renderIcon } from '@/lib/icon-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
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

interface AchievementLevel {
 level: number;
 name: string;
 threshold: number;
 icon: string;
}

interface AchievementDefinition {
 id: string;
 code: string;
 name: string;
 description: string;
 icon: string;
 category: string;
 levels: AchievementLevel[];
 metric_type: string;
 is_active: boolean;
 sort_order: number;
}

const CATEGORY_LABELS: Record<string, string> = {
 exploration: 'Exploración',
 enrichment: 'Enriquecimiento',
 content: 'Contenido',
 activity: 'Actividad',
 quality: 'Calidad',
 social: 'Social',
 general: 'General',
};

const METRIC_LABELS: Record<string, string> = {
 pioneer_locations: 'Puntos pioneros',
 unique_countries: 'Países únicos',
 total_locations: 'Total de ubicaciones',
 enriched_locations: 'Ubicaciones enriquecidas',
 classified_locations: 'Ubicaciones clasificadas',
 uploaded_photos: 'Fotos subidas',
 notes_written: 'Notas escritas',
 visited_locations: 'Ubicaciones visitadas',
 five_star_ratings: 'Valoraciones 5',
 zone_leadership: 'Liderazgo por zona',
};

const ICON_SUGGESTIONS = ['trophy', 'star', 'crown', 'gem', 'mountain', 'compass', 'map-pin', 'flag', 'heart', 'camera', 'globe-2', 'footprints', 'bird', 'leaf', 'music', 'palette', 'coffee', 'landmark', 'castle', 'ship'];

export function AchievementsManager() {
 const [achievements, setAchievements] = useState<AchievementDefinition[]>([]);
 const [loading, setLoading] = useState(true);
 const [saving, setSaving] = useState<string | null>(null);
 const [expandedId, setExpandedId] = useState<string | null>(null);
 const [editingLevels, setEditingLevels] = useState<Record<string, AchievementLevel[]>>({});
 const [deleteConfirm, setDeleteConfirm] = useState<AchievementDefinition | null>(null);
 const [showAddForm, setShowAddForm] = useState(false);
 const [newAchievement, setNewAchievement] = useState({
 code: '',
 name: '',
 description: '',
 icon: '',
 category: 'general',
 metric_type: 'total_locations',
 });

 const fetchAchievements = useCallback(async () => {
 setLoading(true);
 try {
 const { data, error } = await supabase
 .from('achievement_definitions')
 .select('*')
 .order('sort_order');

 if (error) throw error;
 
      // Parse levels from JSONB - handle both array and string formats
 const parsed = (data || []).map(a => ({
 ...a,
 levels: Array.isArray(a.levels) 
 ? (a.levels as unknown as AchievementLevel[])
 : typeof a.levels === 'string' 
 ? (JSON.parse(a.levels) as AchievementLevel[])
 : (a.levels as unknown as AchievementLevel[]),
 }));
 
 setAchievements(parsed);
 } catch (error: any) {
 console.error('Error fetching achievements:', error);
 toast.error('Error al cargar logros');
 } finally {
 setLoading(false);
 }
 }, []);

 useEffect(() => {
 fetchAchievements();
 }, [fetchAchievements]);

 const toggleActive = async (achievement: AchievementDefinition) => {
 setSaving(achievement.id);
 try {
 const { error } = await supabase
 .from('achievement_definitions')
 .update({ is_active: !achievement.is_active })
 .eq('id', achievement.id);

 if (error) throw error;
 
 setAchievements(prev => prev.map(a => 
 a.id === achievement.id ? { ...a, is_active: !a.is_active } : a
 ));
 toast.success(achievement.is_active ? 'Logro desactivado' : 'Logro activado');
 } catch (error: any) {
 console.error('Error toggling achievement:', error);
 toast.error('Error al actualizar logro');
 } finally {
 setSaving(null);
 }
 };

 const startEditingLevels = (achievement: AchievementDefinition) => {
 setEditingLevels(prev => ({
 ...prev,
 [achievement.id]: [...achievement.levels],
 }));
 setExpandedId(achievement.id);
 };

 const updateLevel = (achievementId: string, levelIndex: number, field: keyof AchievementLevel, value: string | number) => {
 setEditingLevels(prev => {
 const levels = [...(prev[achievementId] || [])];
 levels[levelIndex] = { ...levels[levelIndex], [field]: value };
 return { ...prev, [achievementId]: levels };
 });
 };

 const addLevel = (achievementId: string) => {
 setEditingLevels(prev => {
 const levels = [...(prev[achievementId] || [])];
 const lastLevel = levels[levels.length - 1];
 levels.push({
 level: levels.length + 1,
 name: 'Nuevo nivel',
 threshold: (lastLevel?.threshold || 0) * 2 || 100,
 icon: '',
 });
 return { ...prev, [achievementId]: levels };
 });
 };

 const removeLevel = (achievementId: string, levelIndex: number) => {
 setEditingLevels(prev => {
 const levels = [...(prev[achievementId] || [])].filter((_, i) => i !== levelIndex);
      // Renumber levels
 levels.forEach((l, i) => { l.level = i + 1; });
 return { ...prev, [achievementId]: levels };
 });
 };

 const saveLevels = async (achievementId: string) => {
 const levels = editingLevels[achievementId];
 if (!levels) return;

 setSaving(achievementId);
 try {
 const { error } = await supabase
 .from('achievement_definitions')
 .update({ levels: levels as any })
 .eq('id', achievementId);

 if (error) throw error;

 setAchievements(prev => prev.map(a => 
 a.id === achievementId ? { ...a, levels } : a
 ));
 setEditingLevels(prev => {
 const next = { ...prev };
 delete next[achievementId];
 return next;
 });
 toast.success('Niveles actualizados');
 } catch (error: any) {
 console.error('Error saving levels:', error);
 toast.error('Error al guardar niveles');
 } finally {
 setSaving(null);
 }
 };

 const updateAchievementField = async (achievementId: string, field: string, value: string) => {
 setSaving(achievementId);
 try {
 const { error } = await supabase
 .from('achievement_definitions')
 .update({ [field]: value })
 .eq('id', achievementId);

 if (error) throw error;

 setAchievements(prev => prev.map(a => 
 a.id === achievementId ? { ...a, [field]: value } : a
 ));
 toast.success('Actualizado');
 } catch (error: any) {
 console.error('Error updating achievement:', error);
 toast.error('Error al actualizar');
 } finally {
 setSaving(null);
 }
 };

 const createAchievement = async () => {
 if (!newAchievement.code || !newAchievement.name) {
 toast.error('Código y nombre son requeridos');
 return;
 }

 setSaving('new');
 try {
 const { data, error } = await supabase
 .from('achievement_definitions')
 .insert({
 ...newAchievement,
 sort_order: achievements.length + 1,
 })
 .select()
 .single();

 if (error) throw error;

 const parsed = {
 ...data,
 levels: Array.isArray(data.levels) 
 ? (data.levels as unknown as AchievementLevel[])
 : (JSON.parse(data.levels as string) as AchievementLevel[]),
 };

 setAchievements(prev => [...prev, parsed]);
 setNewAchievement({
 code: '',
 name: '',
 description: '',
 icon: '',
 category: 'general',
 metric_type: 'total_locations',
 });
 setShowAddForm(false);
 toast.success('Logro creado');
 } catch (error: any) {
 console.error('Error creating achievement:', error);
 toast.error(error.message?.includes('duplicate') ? 'El código ya existe' : 'Error al crear logro');
 } finally {
 setSaving(null);
 }
 };

 const deleteAchievement = async () => {
 if (!deleteConfirm) return;

 setSaving(deleteConfirm.id);
 try {
 const { error } = await supabase
 .from('achievement_definitions')
 .delete()
 .eq('id', deleteConfirm.id);

 if (error) throw error;

 setAchievements(prev => prev.filter(a => a.id !== deleteConfirm.id));
 toast.success('Logro eliminado');
 } catch (error: any) {
 console.error('Error deleting achievement:', error);
 toast.error('Error al eliminar logro');
 } finally {
 setSaving(null);
 setDeleteConfirm(null);
 }
 };

 if (loading) {
 return (
 <div className="flex items-center justify-center py-12">
 <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
 </div>
 );
 }

 return (
 <div className="space-y-4">
 {/* Header con botón añadir */}
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <Trophy className="w-5 h-5 text-amber-500" />
 <span className="font-medium">{achievements.length} logros definidos</span>
 </div>
 <Button 
 size="sm" 
 onClick={() => setShowAddForm(!showAddForm)}
 variant={showAddForm ? 'secondary' : 'default'}
 >
 <Plus className="w-4 h-4 mr-1" />
 {showAddForm ? 'Cancelar' : 'Nuevo logro'}
 </Button>
 </div>

 {/* Formulario nuevo logro */}
 <AnimatePresence>
 {showAddForm && (
 <motion.div
 initial={{ height: 0, opacity: 0 }}
 animate={{ height: 'auto', opacity: 1 }}
 exit={{ height: 0, opacity: 0 }}
 className="overflow-hidden"
 >
 <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
 <div className="grid grid-cols-2 gap-4">
 <div>
 <Label className="text-xs">Código (único)</Label>
 <Input
 value={newAchievement.code}
 onChange={e => setNewAchievement(prev => ({ ...prev, code: e.target.value.toLowerCase().replace(/\s/g, '_') }))}
 placeholder="mi_logro"
 className="mt-1"
 />
 </div>
 <div>
 <Label className="text-xs">Nombre</Label>
 <Input
 value={newAchievement.name}
 onChange={e => setNewAchievement(prev => ({ ...prev, name: e.target.value }))}
 placeholder="Mi Logro"
 className="mt-1"
 />
 </div>
 </div>
 <div>
 <Label className="text-xs">Descripción</Label>
 <Textarea
 value={newAchievement.description}
 onChange={e => setNewAchievement(prev => ({ ...prev, description: e.target.value }))}
 placeholder="Descripción del logro..."
 className="mt-1 min-h-[60px]"
 />
 </div>
 <div className="grid grid-cols-3 gap-4">
 <div>
 <Label className="text-xs">Icono</Label>
 <div className="flex gap-2 mt-1">
 <Input
 value={newAchievement.icon}
 onChange={e => setNewAchievement(prev => ({ ...prev, icon: e.target.value }))}
 className="w-16 text-center text-lg"
 />
  <div className="flex flex-wrap gap-1">
  {ICON_SUGGESTIONS.slice(0, 6).map(iconKey => (
  <button
  key={iconKey}
  onClick={() => setNewAchievement(prev => ({ ...prev, icon: iconKey }))}
  className="w-7 h-7 rounded hover:bg-muted transition-colors flex items-center justify-center"
  >
  {renderIcon(iconKey, { size: 16 })}
  </button>
  ))}
  </div>
 </div>
 </div>
 <div>
 <Label className="text-xs">Categoría</Label>
 <Select
 value={newAchievement.category}
 onValueChange={v => setNewAchievement(prev => ({ ...prev, category: v }))}
 >
 <SelectTrigger className="mt-1">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
 <SelectItem key={value} value={value}>{label}</SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div>
 <Label className="text-xs">Métrica</Label>
 <Select
 value={newAchievement.metric_type}
 onValueChange={v => setNewAchievement(prev => ({ ...prev, metric_type: v }))}
 >
 <SelectTrigger className="mt-1">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {Object.entries(METRIC_LABELS).map(([value, label]) => (
 <SelectItem key={value} value={value}>{label}</SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 </div>
 <Button 
 onClick={createAchievement} 
 disabled={saving === 'new'}
 className="w-full"
 >
 {saving === 'new' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
 Crear logro
 </Button>
 </div>
 </motion.div>
 )}
 </AnimatePresence>

 {/* Lista de logros */}
 <ScrollArea className="h-[400px]">
 <div className="space-y-2 pr-4">
 {achievements.map(achievement => {
 const isExpanded = expandedId === achievement.id;
 const isEditing = !!editingLevels[achievement.id];
 const levels = isEditing ? editingLevels[achievement.id] : achievement.levels;

 return (
 <div 
 key={achievement.id} 
 className={`border rounded-lg overflow-hidden transition-colors ${
 achievement.is_active ? 'bg-card' : 'bg-muted/30 opacity-75'
 }`}
 >
 {/* Header */}
 <div className="flex items-center gap-3 p-3">
 <button
 onClick={() => setExpandedId(isExpanded ? null : achievement.id)}
 className="flex-1 flex items-center gap-3 text-left"
 >
 <span className="text-2xl">{achievement.icon}</span>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2">
 <span className="font-medium">{achievement.name}</span>
 <Badge variant="outline" className="text-[10px]">
 {CATEGORY_LABELS[achievement.category] || achievement.category}
 </Badge>
 {!achievement.is_active && (
 <Badge variant="secondary" className="text-[10px]">Inactivo</Badge>
 )}
 </div>
 <p className="text-xs text-muted-foreground truncate">
 {achievement.description}
 </p>
 </div>
 {isExpanded ? (
 <ChevronDown className="w-5 h-5 text-muted-foreground" />
 ) : (
 <ChevronRight className="w-5 h-5 text-muted-foreground" />
 )}
 </button>
 
 <div className="flex items-center gap-2">
 <Switch
 checked={achievement.is_active}
 onCheckedChange={() => toggleActive(achievement)}
 disabled={saving === achievement.id}
 />
 <Button
 variant="ghost"
 size="icon"
 className="h-8 w-8 text-destructive hover:text-destructive"
 onClick={() => setDeleteConfirm(achievement)}
 >
 <Trash2 className="w-4 h-4" />
 </Button>
 </div>
 </div>

 {/* Expanded content */}
 <AnimatePresence>
 {isExpanded && (
 <motion.div
 initial={{ height: 0, opacity: 0 }}
 animate={{ height: 'auto', opacity: 1 }}
 exit={{ height: 0, opacity: 0 }}
 className="border-t overflow-hidden"
 >
 <div className="p-4 space-y-4">
 {/* Basic info editing */}
 <div className="grid grid-cols-2 gap-3">
 <div>
 <Label className="text-xs">Nombre</Label>
 <Input
 defaultValue={achievement.name}
 onBlur={e => {
 if (e.target.value !== achievement.name) {
 updateAchievementField(achievement.id, 'name', e.target.value);
 }
 }}
 className="mt-1 h-8 text-sm"
 />
 </div>
 <div>
 <Label className="text-xs">Icono</Label>
 <div className="flex gap-1 mt-1">
 <Input
 defaultValue={achievement.icon}
 onBlur={e => {
 if (e.target.value !== achievement.icon) {
 updateAchievementField(achievement.id, 'icon', e.target.value);
 }
 }}
 className="w-12 h-8 text-center text-lg"
 />
  {ICON_SUGGESTIONS.slice(0, 8).map(iconKey => (
  <button
  key={iconKey}
  onClick={() => updateAchievementField(achievement.id, 'icon', iconKey)}
  className="w-8 h-8 rounded hover:bg-muted transition-colors flex items-center justify-center"
  >
  {renderIcon(iconKey, { size: 16 })}
  </button>
  ))}
 </div>
 </div>
 </div>

 {/* Levels */}
 <div>
 <div className="flex items-center justify-between mb-2">
 <Label className="text-xs font-medium">Niveles ({levels.length})</Label>
 <div className="flex gap-2">
 {!isEditing ? (
 <Button 
 size="sm" 
 variant="outline"
 onClick={() => startEditingLevels(achievement)}
 className="h-7 text-xs"
 >
 <Pencil className="w-3 h-3 mr-1" />
 Editar niveles
 </Button>
 ) : (
 <>
 <Button 
 size="sm" 
 variant="outline"
 onClick={() => addLevel(achievement.id)}
 className="h-7 text-xs"
 >
 <Plus className="w-3 h-3 mr-1" />
 Añadir
 </Button>
 <Button 
 size="sm"
 onClick={() => saveLevels(achievement.id)}
 disabled={saving === achievement.id}
 className="h-7 text-xs"
 >
 {saving === achievement.id ? (
 <Loader2 className="w-3 h-3 animate-spin mr-1" />
 ) : (
 <Save className="w-3 h-3 mr-1" />
 )}
 Guardar
 </Button>
 </>
 )}
 </div>
 </div>

 <div className="space-y-2">
 {levels.map((level, idx) => (
 <div 
 key={idx}
 className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg"
 >
 <span className="text-xs text-muted-foreground w-6">Lv{level.level}</span>
 
 {isEditing ? (
 <>
 <Input
 value={level.icon}
 onChange={e => updateLevel(achievement.id, idx, 'icon', e.target.value)}
 className="w-12 h-7 text-center text-lg p-0"
 />
 <Input
 value={level.name}
 onChange={e => updateLevel(achievement.id, idx, 'name', e.target.value)}
 className="flex-1 h-7 text-sm"
 placeholder="Nombre del nivel"
 />
 <div className="flex items-center gap-1">
 <span className="text-xs text-muted-foreground">≥</span>
 <Input
 type="number"
 value={level.threshold}
 onChange={e => updateLevel(achievement.id, idx, 'threshold', parseInt(e.target.value) || 0)}
 className="w-20 h-7 text-sm"
 />
 </div>
 {levels.length > 1 && (
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7 text-destructive"
 onClick={() => removeLevel(achievement.id, idx)}
 >
 <Trash2 className="w-3 h-3" />
 </Button>
 )}
 </>
 ) : (
 <>
 <span className="text-lg">{level.icon}</span>
 <span className="flex-1 text-sm">{level.name}</span>
 <Badge variant="outline" className="text-xs">
 ≥ {level.threshold.toLocaleString()}
 </Badge>
 </>
 )}
 </div>
 ))}
 </div>
 </div>

 {/* Metric info */}
 <div className="text-xs text-muted-foreground pt-2 border-t">
 <span className="font-medium">Métrica:</span> {METRIC_LABELS[achievement.metric_type] || achievement.metric_type}
 <span className="mx-2">•</span>
 <span className="font-medium">Código:</span> {achievement.code}
 </div>
 </div>
 </motion.div>
 )}
 </AnimatePresence>
 </div>
 );
 })}
 </div>
 </ScrollArea>

 {/* Delete confirmation */}
 <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
 <AlertDialogContent>
 <AlertDialogHeader>
 <AlertDialogTitle>¿Eliminar logro?</AlertDialogTitle>
 <AlertDialogDescription>
 Esto eliminará el logro "{deleteConfirm?.name}" y todo el progreso de usuarios asociado.
 Esta acción no se puede deshacer.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel>Cancelar</AlertDialogCancel>
 <AlertDialogAction 
 onClick={deleteAchievement}
 className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
 >
 Eliminar
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>
 </div>
 );
}
