/**
 * Utility for playing subtle notification sounds using Web Audio API
 * No external dependencies required
 */

const SOUNDS_ENABLED_KEY = 'vandits-sounds-enabled';
const SOUND_PREFS_KEY = 'vandits-sound-preferences';

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
 if (!audioContext) {
 audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
 }
 return audioContext;
}

// ─── Sound categories ──────────────────────────────────────────────────────
export type SoundAction =
 | 'enrichment_complete'
 | 'file_upload'
 | 'export_complete'
 | 'duplicate_resolved'
 | 'geocode_complete'
 | 'route_calculated';

export interface SoundActionConfig {
 key: SoundAction;
 label: string;
 description: string;
 /** Lucide icon name (kebab-case) */
 iconName: string;
}

export const SOUND_ACTIONS: SoundActionConfig[] = [
 { key: 'enrichment_complete', label: 'Enriquecimiento IA', description: 'Al completar el enriquecimiento de ubicaciones', iconName: 'sparkles' },
 { key: 'file_upload', label: 'Subida de archivos', description: 'Al importar un archivo KML/GPX/GeoJSON', iconName: 'file-up' },
 { key: 'export_complete', label: 'Exportación', description: 'Al terminar de exportar datos', iconName: 'download' },
 { key: 'duplicate_resolved', label: 'Duplicados resueltos', description: 'Al resolver un par de duplicados', iconName: 'copy' },
 { key: 'geocode_complete', label: 'Geocodificación', description: 'Al completar la geocodificación masiva', iconName: 'globe' },
 { key: 'route_calculated', label: 'Ruta calculada', description: 'Al calcular una ruta con éxito', iconName: 'route' },
];

// ─── Global toggle ─────────────────────────────────────────────────────────
export function areSoundsEnabled(): boolean {
 try {
 const stored = localStorage.getItem(SOUNDS_ENABLED_KEY);
 return stored === null ? true : stored === 'true';
 } catch {
 return true;
 }
}

export function setSoundsEnabled(enabled: boolean): void {
 try {
 localStorage.setItem(SOUNDS_ENABLED_KEY, enabled ? 'true' : 'false');
 } catch {}
}

export function toggleSounds(): boolean {
 const newState = !areSoundsEnabled();
 setSoundsEnabled(newState);
 return newState;
}

// ─── Per-action preferences ────────────────────────────────────────────────
export function getSoundPreferences(): Record<SoundAction, boolean> {
 const defaults: Record<SoundAction, boolean> = {
  enrichment_complete: true,
  file_upload: true,
  export_complete: true,
  duplicate_resolved: true,
  geocode_complete: true,
  route_calculated: true,
 };
 try {
  const stored = localStorage.getItem(SOUND_PREFS_KEY);
  if (stored) {
   return { ...defaults, ...JSON.parse(stored) };
  }
 } catch {}
 return defaults;
}

export function setSoundPreference(action: SoundAction, enabled: boolean): void {
 try {
  const prefs = getSoundPreferences();
  prefs[action] = enabled;
  localStorage.setItem(SOUND_PREFS_KEY, JSON.stringify(prefs));
 } catch {}
}

export function isSoundActionEnabled(action: SoundAction): boolean {
 if (!areSoundsEnabled()) return false;
 return getSoundPreferences()[action] ?? true;
}

// ─── Sound players ─────────────────────────────────────────────────────────

export function playSuccessChime() {
 if (!areSoundsEnabled()) return;
 
 try {
 const ctx = getAudioContext();
 const now = ctx.currentTime;
 
 const osc1 = ctx.createOscillator();
 const gain1 = ctx.createGain();
 osc1.type = 'sine';
 osc1.frequency.value = 523.25;
 gain1.gain.setValueAtTime(0.15, now);
 gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
 osc1.connect(gain1);
 gain1.connect(ctx.destination);
 osc1.start(now);
 osc1.stop(now + 0.15);
 
 const osc2 = ctx.createOscillator();
 const gain2 = ctx.createGain();
 osc2.type = 'sine';
 osc2.frequency.value = 659.25;
 gain2.gain.setValueAtTime(0, now + 0.08);
 gain2.gain.linearRampToValueAtTime(0.12, now + 0.1);
 gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
 osc2.connect(gain2);
 gain2.connect(ctx.destination);
 osc2.start(now + 0.08);
 osc2.stop(now + 0.3);
 
 } catch (e) {
 console.debug('Audio not available:', e);
 }
}

export function playEnrichmentComplete() {
 if (!isSoundActionEnabled('enrichment_complete')) return;
 
 try {
 const ctx = getAudioContext();
 const now = ctx.currentTime;
 
 const notes = [523, 659, 784, 988, 1175, 1319];
 
 notes.forEach((freq, i) => {
 const osc = ctx.createOscillator();
 const gain = ctx.createGain();
 
 osc.type = 'sine';
 osc.frequency.value = freq;
 
 const startTime = now + (i * 0.06);
 gain.gain.setValueAtTime(0, startTime);
 gain.gain.linearRampToValueAtTime(0.18, startTime + 0.02);
 gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);
 
 osc.connect(gain);
 gain.connect(ctx.destination);
 
 osc.start(startTime);
 osc.stop(startTime + 0.35);
 });
 
 setTimeout(() => {
 const osc = ctx.createOscillator();
 const gain = ctx.createGain();
 osc.type = 'sine';
 osc.frequency.value = 1568;
 gain.gain.setValueAtTime(0, ctx.currentTime);
 gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.01);
 gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
 osc.connect(gain);
 gain.connect(ctx.destination);
 osc.start(ctx.currentTime);
 osc.stop(ctx.currentTime + 0.5);
 }, 350);
 
 } catch (e) {
 console.debug('Audio not available:', e);
 }
}

export function playActionSound(action: SoundAction) {
 if (!isSoundActionEnabled(action)) return;
 
 try {
 const ctx = getAudioContext();
 const now = ctx.currentTime;
 
 const osc = ctx.createOscillator();
 const gain = ctx.createGain();
 
 osc.type = 'sine';
 osc.frequency.value = 880;
 
 gain.gain.setValueAtTime(0, now);
 gain.gain.linearRampToValueAtTime(0.1, now + 0.02);
 gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
 
 osc.connect(gain);
 gain.connect(ctx.destination);
 
 osc.start(now);
 osc.stop(now + 0.4);
 
 } catch (e) {
 console.debug('Audio not available:', e);
 }
}
