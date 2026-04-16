/**
 * PreferencePanelRenderer — Generic panel that renders fields from a ManageableUnit.
 */
import React from 'react';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { PreferenceUnit, PreferenceScope, ResolvedPreferences } from '../types';

interface PreferencePanelRendererProps {
  unit: PreferenceUnit;
  preferences: ResolvedPreferences;
  scope: PreferenceScope;
  onUpdate: (key: string, value: unknown) => void;
  /** Optional custom renderers for specific field keys */
  customRenderers?: Record<string, (value: unknown, onChange: (v: unknown) => void) => React.ReactNode>;
  className?: string;
}

export function PreferencePanelRenderer({
  unit,
  preferences,
  scope,
  onUpdate,
  customRenderers,
  className,
}: PreferencePanelRendererProps) {
  const visibleFields = unit.fields.filter(f => !f.hidden);

  return (
    <div className={className ?? 'space-y-4'}>
      {visibleFields.map(field => {
        const value = preferences[field.key] ?? field.defaultValue;
        const customRenderer = customRenderers?.[field.key];

        if (customRenderer) {
          return (
            <div key={field.key} className="space-y-1">
              <Label className="text-sm font-medium">{field.label}</Label>
              {field.description && (
                <p className="text-xs text-muted-foreground">{field.description}</p>
              )}
              {customRenderer(value, (v) => onUpdate(field.key, v))}
            </div>
          );
        }

        return (
          <div key={field.key} className="space-y-1">
            {field.type === 'boolean' ? (
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">{field.label}</Label>
                  {field.description && (
                    <p className="text-xs text-muted-foreground">{field.description}</p>
                  )}
                </div>
                <Switch
                  checked={!!value}
                  onCheckedChange={(checked) => onUpdate(field.key, checked)}
                />
              </div>
            ) : (
              <>
                <Label className="text-sm font-medium">{field.label}</Label>
                {field.description && (
                  <p className="text-xs text-muted-foreground">{field.description}</p>
                )}
                {field.type === 'number' && (
                  <div className="flex items-center gap-3">
                    <Slider
                      value={[Number(value) || 0]}
                      min={field.min ?? 0}
                      max={field.max ?? 100}
                      step={field.step ?? 1}
                      onValueChange={([v]) => onUpdate(field.key, v)}
                      className="flex-1"
                    />
                    <span className="text-xs text-muted-foreground w-10 text-right">
                      {String(value)}
                    </span>
                  </div>
                )}
                {field.type === 'enum' && field.enumOptions && (
                  <Select
                    value={String(value)}
                    onValueChange={(v) => onUpdate(field.key, v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {field.enumOptions.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {field.type === 'color' && (
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={String(value)}
                      onChange={(e) => onUpdate(field.key, e.target.value)}
                      className="w-8 h-8 rounded border border-input cursor-pointer"
                    />
                    <Input
                      value={String(value)}
                      onChange={(e) => onUpdate(field.key, e.target.value)}
                      className="flex-1 font-mono text-xs"
                      placeholder="#000000"
                    />
                  </div>
                )}
                {field.type === 'string' && (
                  <Input
                    value={String(value ?? '')}
                    onChange={(e) => onUpdate(field.key, e.target.value)}
                  />
                )}
                {field.type === 'json' && (
                  <Textarea
                    value={typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                    onChange={(e) => {
                      try {
                        onUpdate(field.key, JSON.parse(e.target.value));
                      } catch {
                        // Keep raw string until valid JSON
                      }
                    }}
                    className="font-mono text-xs"
                    rows={4}
                  />
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
