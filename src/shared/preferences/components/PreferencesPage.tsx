/**
 * PreferencesPage — Grouped UX preferences panel.
 * 
 * Organizes preferences into families:
 *  - Apariencia (ux.appearance + ux.audio)
 *  - Layout (ux.layout)
 *  - Mapa (ux.map.chrome + ux.map.interaction + ux.map.visibility)
 *  - Accesibilidad (ux.accessibility)
 */
import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PreferencePanelRenderer } from './PreferencePanelRenderer';
import { usePreferences } from '../usePreferences';

// Ensure all UX units are registered
import '../units';

interface PreferencesPageProps {
  onClose?: () => void;
}

function UnitSection({ unitId, scope = 'user' as const }: { unitId: string; scope?: 'user' | 'session' | 'device' }) {
  const { preferences, loading, update, unit } = usePreferences({ unitId });

  if (!unit || loading) return null;

  return (
    <div className="space-y-1">
      <h3 className="text-sm font-semibold text-foreground">{unit.name}</h3>
      {unit.description && (
        <p className="text-xs text-muted-foreground mb-3">{unit.description}</p>
      )}
      <PreferencePanelRenderer
        unit={unit}
        preferences={preferences}
        scope={scope}
        onUpdate={(key, value) => update(scope, key, value)}
        className="space-y-3"
      />
    </div>
  );
}

export function PreferencesPage({ onClose }: PreferencesPageProps) {
  const [activeTab, setActiveTab] = useState('appearance');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <h2 className="text-base font-semibold text-foreground">Preferencias</h2>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="mx-4 mt-3 mb-1 h-8">
          <TabsTrigger value="appearance" className="text-xs">Apariencia</TabsTrigger>
          <TabsTrigger value="layout" className="text-xs">Layout</TabsTrigger>
          <TabsTrigger value="map" className="text-xs">Mapa</TabsTrigger>
          <TabsTrigger value="accessibility" className="text-xs">Accesibilidad</TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1">
          <div className="px-4 py-4 space-y-6">
            <TabsContent value="appearance" className="mt-0 space-y-6">
              <UnitSection unitId="ux.appearance" />
              <div className="border-t border-border/30 pt-4">
                <UnitSection unitId="ux.audio" />
              </div>
            </TabsContent>

            <TabsContent value="layout" className="mt-0">
              <UnitSection unitId="ux.layout" />
            </TabsContent>

            <TabsContent value="map" className="mt-0 space-y-6">
              <UnitSection unitId="ux.map.chrome" />
              <div className="border-t border-border/30 pt-4">
                <UnitSection unitId="ux.map.interaction" />
              </div>
              <div className="border-t border-border/30 pt-4">
                <UnitSection unitId="ux.map.visibility" />
              </div>
            </TabsContent>

            <TabsContent value="accessibility" className="mt-0">
              <UnitSection unitId="ux.accessibility" />
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>
    </div>
  );
}
