import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Volume2, VolumeX } from 'lucide-react';
import {
 areSoundsEnabled,
 setSoundsEnabled,
 getSoundPreferences,
 setSoundPreference,
 SOUND_ACTIONS,
 playSuccessChime,
 playActionSound,
 type SoundAction,
} from '@/lib/sounds';

export function SoundSettingsPanel() {
 const [globalEnabled, setGlobalEnabled] = useState(areSoundsEnabled());
 const [prefs, setPrefs] = useState(getSoundPreferences());

 const handleGlobalToggle = (enabled: boolean) => {
  setSoundsEnabled(enabled);
  setGlobalEnabled(enabled);
  if (enabled) playSuccessChime();
 };

 const handleActionToggle = (action: SoundAction, enabled: boolean) => {
  setSoundPreference(action, enabled);
  setPrefs(prev => ({ ...prev, [action]: enabled }));
  if (enabled && globalEnabled) {
   playActionSound(action);
  }
 };

 return (
  <div className="flex flex-col h-full min-h-0 overflow-hidden">
   {/* Header */}
   <div className="px-4 py-3 border-b border-border shrink-0">
    <div className="flex items-center justify-between">
     <div className="flex items-center gap-2">
      {globalEnabled ? (
       <Volume2 className="w-4 h-4 text-primary" />
      ) : (
       <VolumeX className="w-4 h-4 text-muted-foreground" />
      )}
      <div>
       <h3 className="text-sm font-semibold text-foreground">Sonidos</h3>
       <p className="text-xs text-muted-foreground">Controla qué acciones emiten sonido</p>
      </div>
     </div>
     <Switch checked={globalEnabled} onCheckedChange={handleGlobalToggle} />
    </div>
   </div>

   {/* Action list */}
   <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2">
    <div className="space-y-1">
     {SOUND_ACTIONS.map((action) => (
      <div
       key={action.key}
       className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
        globalEnabled ? 'hover:bg-muted/50' : 'opacity-50 pointer-events-none'
       }`}
      >
       <span className="text-lg flex-shrink-0">{action.icon}</span>
       <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{action.label}</p>
        <p className="text-xs text-muted-foreground">{action.description}</p>
       </div>
       <Switch
        checked={prefs[action.key]}
        onCheckedChange={(v) => handleActionToggle(action.key, v)}
        disabled={!globalEnabled}
       />
      </div>
     ))}
    </div>
   </div>
  </div>
 );
}
