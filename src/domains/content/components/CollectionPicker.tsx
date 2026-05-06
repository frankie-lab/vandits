/**
 * CollectionPicker — selector único transversal para asignar una colección
 * destino durante CUALQUIER importación (Web/Atlas, Archivos KML/GPX/GeoJSON,
 * post-import en DocumentFocusView).
 *
 * Estados de `value`:
 *   - ''         → No asignar a ninguna colección (solo si allowNone)
 *   - '__new__'  → Crear colección nueva (muestra Input de nombre)
 *   - '<uuid>'   → Colección existente del usuario
 *
 * Reglas (mem://ui/import-collection-picker):
 *   - Carga colecciones del usuario una sola vez al montarse (orden por nombre).
 *   - Si no hay user_id, solo expone la opción de crear nueva.
 *   - Sin estilos de panel propios: hereda paddings de su contenedor.
 */
import { useEffect, useState } from 'react';
import { Folder } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface UserCollection {
  id: string;
  name: string;
}

export interface CollectionPickerProps {
  userId: string | undefined;
  value: string;
  onValueChange: (id: string) => void;
  newName: string;
  onNewNameChange: (n: string) => void;
  /** Sugerencia de nombre cuando se elige "Crear nueva" */
  defaultNewName?: string;
  /** Permite la opción "No asignar" (value=''). Default: true */
  allowNone?: boolean;
  /** Texto del label superior. Default: "Colección destino" */
  label?: string;
  className?: string;
  disabled?: boolean;
}

export function CollectionPicker({
  userId,
  value,
  onValueChange,
  newName,
  onNewNameChange,
  defaultNewName,
  allowNone = true,
  label = 'Colección destino',
  className,
  disabled,
}: CollectionPickerProps) {
  const [collections, setCollections] = useState<UserCollection[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) { setCollections([]); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from('collections')
        .select('id, name')
        .eq('user_id', userId)
        .order('name');
      if (cancelled) return;
      setCollections((data ?? []) as UserCollection[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  return (
    <div className={className}>
      <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <Folder className="w-3 h-3" /> {label}
      </Label>
      <select
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        disabled={disabled || loading}
        className="mt-1.5 w-full h-9 text-xs rounded-md border bg-background px-2"
      >
        {allowNone && <option value="">No asignar</option>}
        <option value="__new__">+ Crear nueva colección…</option>
        {collections.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>

      {value === '__new__' && (
        <div className="mt-2 space-y-1.5">
          <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Nombre de la colección
          </Label>
          <Input
            value={newName}
            onChange={(e) => onNewNameChange(e.target.value)}
            placeholder={defaultNewName || 'Nombre…'}
            className="h-9 text-sm"
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}
