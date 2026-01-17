import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Save, X } from 'lucide-react';

interface NotesEditorProps {
  locationId: string | null;
  locationName: string;
  initialNotes: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function NotesEditor({ 
  locationId, 
  locationName, 
  initialNotes, 
  open, 
  onOpenChange,
  onSaved 
}: NotesEditorProps) {
  const [notes, setNotes] = useState(initialNotes);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNotes(initialNotes);
  }, [initialNotes, locationId]);

  const handleSave = async () => {
    if (!locationId) return;

    setSaving(true);
    try {
      // Get current custom_data
      const { data: location, error: fetchError } = await supabase
        .from('locations')
        .select('custom_data')
        .eq('id', locationId)
        .single();

      if (fetchError) throw fetchError;

      const currentCustomData = (location?.custom_data as Record<string, string>) || {};
      const updatedCustomData = {
        ...currentCustomData,
        notes: notes.trim(),
      };

      const { error: updateError } = await supabase
        .from('locations')
        .update({ 
          custom_data: updatedCustomData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', locationId);

      if (updateError) throw updateError;

      toast.success('Notas guardadas');
      onSaved();
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving notes:', error);
      toast.error('Error al guardar las notas');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[400px] sm:w-[540px] z-[2001]">
        <SheetHeader>
          <SheetTitle className="text-lg font-semibold">
            Notas: {locationName}
          </SheetTitle>
        </SheetHeader>
        
        <div className="mt-6 space-y-4">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Escribe tus notas personales sobre este lugar..."
            className="min-h-[300px] resize-none"
          />
          
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
              disabled={saving}
            >
              <Save className="w-4 h-4 mr-1" />
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
