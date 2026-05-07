// Domain: Geography — Botón único reutilizable para renormalizar la
// jerarquía geográfica de un punto desde sus coordenadas.
// Usa el helper `renormalizeLocation` (ver renormalize.ts). No toca
// name/description/enriched_data/photos/notas.
import { useState } from 'react';
import { Compass, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { renormalizeLocation } from './renormalize';

interface Props {
  locationId: string;
  variant?: 'icon' | 'menu' | 'full';
  className?: string;
  onDone?: () => void;
}

export function RenormalizeButton({ locationId, variant = 'menu', className, onDone }: Props) {
  const [busy, setBusy] = useState(false);
  const handleClick = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      const ok = await renormalizeLocation(locationId);
      if (ok) onDone?.();
    } finally {
      setBusy(false);
    }
  };

  const Icon = busy ? Loader2 : Compass;
  const iconCls = busy ? 'animate-spin' : '';

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent text-muted-foreground hover:text-foreground ${className ?? ''}`}
        title="Renormalizar geografía desde coordenadas"
      >
        <Icon className={`w-3.5 h-3.5 ${iconCls}`} />
      </button>
    );
  }
  if (variant === 'full') {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={busy}
        className={className}
      >
        <Icon className={`w-3.5 h-3.5 mr-2 ${iconCls}`} />
        Renormalizar geografía
      </Button>
    );
  }
  // 'menu' — DropdownMenuItem-friendly inline content
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className={`flex w-full items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-accent ${className ?? ''}`}
    >
      <Icon className={`w-3.5 h-3.5 text-amber-500 ${iconCls}`} />
      Renormalizar geografía
    </button>
  );
}
