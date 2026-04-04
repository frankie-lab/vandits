import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';

export interface MapCenterConfig {
 mode: 'home' | 'geolocation' | 'auto';
 homeLocation?: {
 lat: number;
 lng: number;
 name?: string;
 };
}

const STORAGE_KEY = 'geodata-map-center-config';

// Load from localStorage as fallback (for non-authenticated users or initial load)
export function loadMapCenterConfigFromStorage(): MapCenterConfig {
 try {
 const stored = localStorage.getItem(STORAGE_KEY);
 if (stored) {
 return JSON.parse(stored);
 }
 } catch (e) {
 console.error('Error loading map center config from storage:', e);
 }
 return { mode: 'auto' };
}

// Save to localStorage as cache
export function saveMapCenterConfigToStorage(config: MapCenterConfig): void {
 try {
 localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
 } catch (e) {
 console.error('Error saving map center config to storage:', e);
 }
}

// Hook to load map center config (from DB or localStorage)
export function useMapCenterConfig() {
 const { user } = useAuth();
 const [config, setConfig] = useState<MapCenterConfig>({ mode: 'auto' });
 const [loading, setLoading] = useState(true);

 useEffect(() => {
 const loadConfig = async () => {
 if (user) {
 try {
 const { data, error } = await supabase
 .from('profiles')
 .select('map_center_mode, home_latitude, home_longitude, home_name')
 .eq('id', user.id)
 .maybeSingle();

 if (!error && data) {
 const loadedConfig: MapCenterConfig = {
 mode: (data.map_center_mode as MapCenterConfig['mode']) || 'auto',
 };

 if (data.home_latitude && data.home_longitude) {
 loadedConfig.homeLocation = {
 lat: data.home_latitude,
 lng: data.home_longitude,
 name: data.home_name || undefined,
 };
 }

 setConfig(loadedConfig);
 saveMapCenterConfigToStorage(loadedConfig);
 setLoading(false);
 return;
 }
 } catch (e) {
 console.error('Error loading map center config:', e);
 }
 }

      // Fallback to localStorage
 setConfig(loadMapCenterConfigFromStorage());
 setLoading(false);
 };

 loadConfig();
 }, [user]);

 return { config, loading };
}
