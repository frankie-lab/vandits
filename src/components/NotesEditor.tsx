import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Save, X, Eye, EyeOff, Users } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

interface NotesEditorProps {
 locationId: string | null;
 locationName: string;
 initialNotes: string;
 open: boolean;
 onOpenChange: (open: boolean) => void;
 onSaved: () => void;
}

type NoteVisibility = 'private' | 'followers' | 'public';

export function NotesEditor({ 
 locationId, 
 locationName, 
 initialNotes, 
 open, 
 onOpenChange,
 onSaved 
}: NotesEditorProps) {
 const { user } = useAuth();
 const [notes, setNotes] = useState(initialNotes);
 const [visibility, setVisibility] = useState<NoteVisibility>('private');
 const [saving, setSaving] = useState(false);
 const [loading, setLoading] = useState(false);
 const [noteId, setNoteId] = useState<string | null>(null);

  // Cargar notas del usuario actual cuando se abre
 useEffect(() => {
 if (open && locationId && user) {
 loadUserNotes();
 }
 }, [open, locationId, user]);

 const loadUserNotes = async () => {
 if (!locationId || !user) return;
 
 setLoading(true);
 try {
 const { data, error } = await supabase
 .from('location_notes')
 .select('*')
 .eq('location_id', locationId)
 .eq('user_id', user.id)
 .maybeSingle();

 if (error) throw error;

 if (data) {
 setNotes(data.content);
 setVisibility(data.visibility as NoteVisibility);
 setNoteId(data.id);
 } else {
        // Si no hay nota en la nueva tabla, usar la legacy de custom_data
 setNotes(initialNotes);
 setVisibility('private');
 setNoteId(null);
 }
 } catch (error) {
 console.error('Error loading notes:', error);
      // Fallback a notas legacy
 setNotes(initialNotes);
 } finally {
 setLoading(false);
 }
 };

 const handleSave = async () => {
 if (!locationId || !user) {
 toast.error('Debes iniciar sesión para guardar notas');
 return;
 }

 setSaving(true);
 try {
 if (noteId) {
        // Actualizar nota existente
 const { error } = await supabase
 .from('location_notes')
 .update({ 
 content: notes.trim(),
 visibility,
 })
 .eq('id', noteId);

 if (error) throw error;
 } else {
        // Crear nueva nota
 const { error } = await supabase
 .from('location_notes')
 .insert({
 location_id: locationId,
 user_id: user.id,
 content: notes.trim(),
 visibility,
 });

 if (error) throw error;
 }

 toast.success('Notas guardadas');
 
      // Disparar evento para refrescar el popup del mapa
 window.dispatchEvent(new CustomEvent('notes-updated', { 
 detail: { locationId, notes: notes.trim(), visibility } 
 }));
 
 onSaved();
 onOpenChange(false);
 } catch (error) {
 console.error('Error saving notes:', error);
 toast.error('Error al guardar las notas');
 } finally {
 setSaving(false);
 }
 };

 const visibilityIcons = {
 private: <EyeOff className="w-4 h-4" />,
 followers: <Users className="w-4 h-4" />,
 public: <Eye className="w-4 h-4" />,
 };

 const visibilityLabels = {
 private: 'Solo yo',
 followers: 'Mis seguidores',
 public: 'Público',
 };

 return (
 <Sheet open={open} onOpenChange={onOpenChange}>
 <SheetContent side="right" className="w-full max-w-sm sm:max-w-sm z-[2001]">
 <SheetHeader>
 <SheetTitle className="text-lg font-semibold">
 Notas: {locationName}
 </SheetTitle>
 </SheetHeader>
 
 <div className="mt-6 space-y-4">
 {loading ? (
 <div className="flex items-center justify-center h-[300px] text-muted-foreground">
 Cargando notas...
 </div>
 ) : (
 <>
 <Textarea
 value={notes}
 onChange={(e) => setNotes(e.target.value)}
 placeholder="Escribe tus notas personales sobre este lugar..."
 className="min-h-[300px] resize-none"
 />
 
 <div className="space-y-2">
 <Label className="text-sm text-muted-foreground">
 Visibilidad de las notas
 </Label>
 <Select 
 value={visibility} 
 onValueChange={(v) => setVisibility(v as NoteVisibility)}
 >
 <SelectTrigger className="w-full">
 <SelectValue>
 <div className="flex items-center gap-2">
 {visibilityIcons[visibility]}
 <span>{visibilityLabels[visibility]}</span>
 </div>
 </SelectValue>
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="private">
 <div className="flex items-center gap-2">
 <EyeOff className="w-4 h-4" />
 <span>Solo yo</span>
 </div>
 </SelectItem>
 <SelectItem value="followers">
 <div className="flex items-center gap-2">
 <Users className="w-4 h-4" />
 <span>Mis seguidores</span>
 </div>
 </SelectItem>
 <SelectItem value="public">
 <div className="flex items-center gap-2">
 <Eye className="w-4 h-4" />
 <span>Público</span>
 </div>
 </SelectItem>
 </SelectContent>
 </Select>
 <p className="text-xs text-muted-foreground">
 {visibility === 'private' && 'Estas notas solo las verás tú.'}
 {visibility === 'followers' && 'Tus seguidores aceptados podrán ver estas notas.'}
 {visibility === 'public' && 'Cualquiera podrá ver estas notas.'}
 </p>
 </div>
 </>
 )}
 
 <div className="flex gap-2 justify-end">
 <Button
 variant="outline"
 size="sm"
 onClick={() => onOpenChange(false)}
 >
 <X className="w-4 h-4 mr-1" />
 Cancelar
 </Button>
 <Button
 size="sm"
 onClick={handleSave}
 disabled={saving || loading || !user}
 >
 <Save className="w-4 h-4 mr-1" />
 {saving ? 'Guardando...' : 'Guardar'}
 </Button>
 </div>
 
 {!user && (
 <p className="text-xs text-center text-amber-600">
 Inicia sesión para guardar notas personales.
 </p>
 )}
 </div>
 </SheetContent>
 </Sheet>
 );
}
