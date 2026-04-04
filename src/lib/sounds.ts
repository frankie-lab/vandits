/**
 * Utility for playing subtle notification sounds using Web Audio API
 * No external dependencies required
 */

const SOUNDS_ENABLED_KEY = 'vandits-sounds-enabled';

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
 if (!audioContext) {
 audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
 }
 return audioContext;
}

/**
 * Check if sounds are enabled
 */
export function areSoundsEnabled(): boolean {
 try {
 const stored = localStorage.getItem(SOUNDS_ENABLED_KEY);
    // Default to true if not set
 return stored === null ? true : stored === 'true';
 } catch {
 return true;
 }
}

/**
 * Set sounds enabled/disabled
 */
export function setSoundsEnabled(enabled: boolean): void {
 try {
 localStorage.setItem(SOUNDS_ENABLED_KEY, enabled ? 'true' : 'false');
 } catch {
    // Ignore storage errors
 }
}

/**
 * Toggle sounds on/off
 */
export function toggleSounds(): boolean {
 const newState = !areSoundsEnabled();
 setSoundsEnabled(newState);
 return newState;
}

/**
 * Play a subtle success chime - two ascending tones
 */
export function playSuccessChime() {
 if (!areSoundsEnabled()) return;
 
 try {
 const ctx = getAudioContext();
 const now = ctx.currentTime;
 
    // First tone (lower)
 const osc1 = ctx.createOscillator();
 const gain1 = ctx.createGain();
 osc1.type = 'sine';
 osc1.frequency.value = 523.25; // C5
 gain1.gain.setValueAtTime(0.15, now);
 gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
 osc1.connect(gain1);
 gain1.connect(ctx.destination);
 osc1.start(now);
 osc1.stop(now + 0.15);
 
    // Second tone (higher) - slightly delayed
 const osc2 = ctx.createOscillator();
 const gain2 = ctx.createGain();
 osc2.type = 'sine';
 osc2.frequency.value = 659.25; // E5
 gain2.gain.setValueAtTime(0, now + 0.08);
 gain2.gain.linearRampToValueAtTime(0.12, now + 0.1);
 gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
 osc2.connect(gain2);
 gain2.connect(ctx.destination);
 osc2.start(now + 0.08);
 osc2.stop(now + 0.3);
 
 } catch (e) {
    // Silently fail if audio isn't available
 console.debug('Audio not available:', e);
 }
}

/**
 * Play a subtle completion sound - gentle ding
 */
export function playCompletionDing() {
 if (!areSoundsEnabled()) return;
 
 try {
 const ctx = getAudioContext();
 const now = ctx.currentTime;
 
    // Main tone
 const osc = ctx.createOscillator();
 const gain = ctx.createGain();
 
 osc.type = 'sine';
 osc.frequency.value = 880; // A5
 
    // Quick attack, gentle decay
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

/**
 * Play enrichment complete sound - sparkle effect
 */
export function playEnrichmentComplete() {
 if (!areSoundsEnabled()) return;
 
 try {
 const ctx = getAudioContext();
 const now = ctx.currentTime;
 
    // Create a richer "sparkle" effect with more notes and higher volume
 const notes = [523, 659, 784, 988, 1175, 1319]; // C5, E5, G5, B5, D6, E6
 
 notes.forEach((freq, i) => {
 const osc = ctx.createOscillator();
 const gain = ctx.createGain();
 
 osc.type = 'sine';
 osc.frequency.value = freq;
 
 const startTime = now + (i * 0.06);
      // Increased volume from 0.08 to 0.18
 gain.gain.setValueAtTime(0, startTime);
 gain.gain.linearRampToValueAtTime(0.18, startTime + 0.02);
 gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);
 
 osc.connect(gain);
 gain.connect(ctx.destination);
 
 osc.start(startTime);
 osc.stop(startTime + 0.35);
 });
 
    // Add a subtle "ding" at the end for emphasis
 setTimeout(() => {
 const osc = ctx.createOscillator();
 const gain = ctx.createGain();
 osc.type = 'sine';
 osc.frequency.value = 1568; // G6
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
