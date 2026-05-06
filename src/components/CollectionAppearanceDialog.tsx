/**
 * CollectionAppearanceDialog — Edita nombre, color e icono Lucide de una
 * colección. El color/icono se aplica a TODOS sus puntos y rutas en el mapa
 * mientras la colección esté visible (no muta los records originales).
 */
import React, { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Folder, Star, Heart, MapPin, Camera, Mountain, Tent, Bike, Car, Anchor,
  Compass, Coffee, UtensilsCrossed, Bed, Trees, Waves, Sun, Moon, Flag,
  Map, Route, Tag, Bookmark, Sparkles,
} from 'lucide-react';
import type { Collection } from '@/domains/v2';

const SWATCHES = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#10b981', '#14b8a6',
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6',
  '#a855f7', '#d946ef', '#ec4899', '#6b7280',
];

const ICONS: { key: string; Icon: React.ComponentType<any> }[] = [
  { key: 'folder', Icon: Folder },
  { key: 'star', Icon: Star },
  { key: 'heart', Icon: Heart },
  { key: 'map-pin', Icon: MapPin },
  { key: 'camera', Icon: Camera },
  { key: 'mountain', Icon: Mountain },
  { key: 'tent', Icon: Tent },
  { key: 'bike', Icon: Bike },
  { key: 'car', Icon: Car },
  { key: 'anchor', Icon: Anchor },
  { key: 'compass', Icon: Compass },
  { key: 'coffee', Icon: Coffee },
  { key: 'utensils-crossed', Icon: UtensilsCrossed },
  { key: 'bed', Icon: Bed },
  { key: 'trees', Icon: Trees },
  { key: 'waves', Icon: Waves },
  { key: 'sun', Icon: Sun },
  { key: 'moon', Icon: Moon },
  { key: 'flag', Icon: Flag },
  { key: 'map', Icon: Map },
  { key: 'route', Icon: Route },
  { key: 'tag', Icon: Tag },
  { key: 'bookmark', Icon: Bookmark },
  { key: 'sparkles', Icon: Sparkles },
];

export function getCollectionIconComponent(key: string | null | undefined) {
  return (ICONS.find(i => i.key === key)?.Icon) ?? Folder;
}

interface Props {
  open: boolean;
  collection: Collection;
  onClose: () => void;
  onSave: (updates: { name: string; color: string; icon: string; inCatalog: boolean }) => Promise<void> | void;
}

export function CollectionAppearanceDialog({ open, collection, onClose, onSave }: Props) {
  const [name, setName] = useState(collection.name);
  const [color, setColor] = useState(collection.color || '#6b7280');
  const [icon, setIcon] = useState(collection.icon || 'folder');
  const [inCatalog, setInCatalog] = useState(collection.inCatalog === true);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (open) {
      setName(collection.name);
      setColor(collection.color || '#6b7280');
      setIcon(collection.icon || 'folder');
      setInCatalog(collection.inCatalog === true);
    }
  }, [open, collection]);

  const SelectedIcon = getCollectionIconComponent(icon);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), color, icon, inCatalog });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar colección</DialogTitle>
          <DialogDescription>
            El color y el icono se aplican a todos los puntos y rutas de la colección
            cuando está visible en el mapa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 border-2"
              style={{ backgroundColor: color, borderColor: color }}
            >
              <SelectedIcon className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 space-y-1">
              <Label htmlFor="col-name" className="text-xs">Nombre</Label>
              <Input
                id="col-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                className="h-9"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Color</Label>
            <div className="grid grid-cols-8 gap-2">
              {SWATCHES.map(s => (
                <button
                  key={s}
                  type="button"
                  className={`h-8 w-8 rounded-full border-2 transition-transform ${color === s ? 'scale-110 border-foreground' : 'border-transparent hover:scale-105'}`}
                  style={{ backgroundColor: s }}
                  onClick={() => setColor(s)}
                  aria-label={`Color ${s}`}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Icono</Label>
            <div className="grid grid-cols-8 gap-2 max-h-44 overflow-y-auto pr-1">
              {ICONS.map(({ key, Icon }) => (
                <button
                  key={key}
                  type="button"
                  className={`h-9 w-9 rounded-md flex items-center justify-center border transition-colors ${
                    icon === key
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-background border-border hover:bg-accent text-foreground'
                  }`}
                  onClick={() => setIcon(key)}
                  aria-label={`Icono ${key}`}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-start gap-3 rounded-lg border border-border/60 p-3 cursor-pointer hover:bg-accent/30">
            <input
              type="checkbox"
              checked={inCatalog}
              onChange={(e) => setInCatalog(e.target.checked)}
              className="mt-1"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Incluir en catálogo general</p>
              <p className="text-xs text-muted-foreground">
                Los puntos aprobados aparecen en el mapa global por defecto.
                Si se desactiva, la colección queda privada y sus puntos solo
                se muestran al activar el ojo en sesión.
              </p>
            </div>
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
