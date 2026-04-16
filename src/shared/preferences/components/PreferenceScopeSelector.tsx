/**
 * PreferenceScopeSelector — allows switching between scopes when editing preferences.
 */
import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { PreferenceScope } from '../types';

const SCOPE_LABELS: Record<PreferenceScope, string> = {
  system: 'Sistema (por defecto)',
  domain: 'Dominio',
  user: 'Usuario',
  entity: 'Entidad',
  session: 'Sesión',
};

interface PreferenceScopeSelectorProps {
  supportedScopes: PreferenceScope[];
  currentScope: PreferenceScope;
  onScopeChange: (scope: PreferenceScope) => void;
  className?: string;
}

export function PreferenceScopeSelector({
  supportedScopes,
  currentScope,
  onScopeChange,
  className,
}: PreferenceScopeSelectorProps) {
  if (supportedScopes.length <= 1) return null;

  return (
    <div className={className ?? 'flex items-center gap-2'}>
      <Label className="text-xs text-muted-foreground whitespace-nowrap">Nivel:</Label>
      <Select value={currentScope} onValueChange={(v) => onScopeChange(v as PreferenceScope)}>
        <SelectTrigger className="h-7 text-xs w-auto min-w-[100px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {supportedScopes.map(scope => (
            <SelectItem key={scope} value={scope} className="text-xs">
              {SCOPE_LABELS[scope]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
