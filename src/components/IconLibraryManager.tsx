import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Save, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useIconLibrary, ICON_LIBRARY_OPTIONS, IconLibrary } from '@/contexts/IconLibraryContext';

export function IconLibraryManager() {
  const { iconLibrary, setIconLibrary } = useIconLibrary();
  const [selected, setSelected] = useState<IconLibrary>(iconLibrary);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('app_settings' as any)
      .select('value')
      .eq('key', 'icon_library')
      .maybeSingle()
      .then(({ data }) => {
        if (data && (data as any).value) {
          setSelected((data as any).value as IconLibrary);
        }
        setLoading(false);
      });
  }, []);

  const hasChanges = selected !== iconLibrary;

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('app_settings' as any)
        .update({ value: JSON.stringify(selected) } as any)
        .eq('key', 'icon_library');
      if (error) throw error;
      setIconLibrary(selected);
      toast.success('Galería de iconos actualizada globalmente');
    } catch (err: any) {
      console.error(err);
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
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
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Galería de iconos</h3>
          <p className="text-xs text-muted-foreground">Define el estilo visual de iconos para todos los usuarios</p>
        </div>
        <Button size="sm" onClick={handleSave} disabled={!hasChanges || saving}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />}
          Guardar
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
        <RadioGroup
          value={selected}
          onValueChange={(value) => setSelected(value as IconLibrary)}
          className="space-y-2"
        >
          {ICON_LIBRARY_OPTIONS.map((opt) => (
            <div
              key={opt.value}
              className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                selected === opt.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
              }`}
            >
              <RadioGroupItem value={opt.value} id={`icon-lib-global-${opt.value}`} />
              <Label htmlFor={`icon-lib-global-${opt.value}`} className="flex-1 cursor-pointer">
                <div className="font-medium text-sm">{opt.label}</div>
                <p className="text-xs text-muted-foreground">{opt.description}</p>
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>
    </div>
  );
}
