/**
 * EligibilityCounter — "X de Y compartibles · N excluidos".
 *
 * Usado por ShareSheet en grupo (collection|route). Variante compacta.
 */
import React from 'react';
import { ShieldAlert } from 'lucide-react';

interface Props {
  eligible: number;
  total: number;
  excluded: number;
  noun?: string; // "puntos", "POIs"
}

export function EligibilityCounter({
  eligible,
  total,
  excluded,
  noun = 'puntos',
}: Props) {
  if (total === 0) {
    return (
      <div className="text-xs text-muted-foreground">
        Sin {noun} en este grupo
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="rounded-md border border-border/60 px-2 py-1 tabular-nums">
        <span className="font-semibold text-foreground">{eligible}</span>
        <span className="text-muted-foreground"> de {total} compartibles</span>
      </span>
      {excluded > 0 && (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <ShieldAlert className="w-3.5 h-3.5" />
          {excluded} excluidos
        </span>
      )}
    </div>
  );
}
