import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/domains/identity';

const LOCAL_STORAGE_KEY = 'vandits-last-export';

export interface ExportRecord {
 timestamp: string;
 format: 'kml' | 'csv' | 'json';
 target: 'mymaps' | 'gurumaps' | 'general';
 locationCount: number;
 locationIds: string[];
}

export interface ExportTracking {
 lastExport: ExportRecord | null;
 modifiedSinceExport: string[]; // IDs of locations modified after last export
 modifiedCount: number;
}

function loadLastExport(): ExportRecord | null {
 try {
 const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
 if (stored) {
 return JSON.parse(stored);
 }
 } catch (e) {
 console.error('Error loading last export:', e);
 }
 return null;
}

function saveLastExport(record: ExportRecord): void {
 try {
 localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(record));
 } catch (e) {
 console.error('Error saving last export:', e);
 }
}

export function useExportTracking() {
 const { user } = useAuth();
 const [lastExport, setLastExport] = useState<ExportRecord | null>(null);
 const [modifiedSinceExport, setModifiedSinceExport] = useState<string[]>([]);
 const [isLoading, setIsLoading] = useState(false);

  // Load last export on mount
 useEffect(() => {
 const stored = loadLastExport();
 setLastExport(stored);
 }, []);

  // Check for modifications since last export
 const checkModifications = useCallback(async () => {
 if (!lastExport || !user) {
 setModifiedSinceExport([]);
 return;
 }

 setIsLoading(true);
 try {
      // Query locations modified after last export
 const { data, error } = await supabase
 .from('locations')
 .select('id, updated_at')
 .gt('updated_at', lastExport.timestamp);

 if (error) throw error;

 const modifiedIds = data?.map(loc => loc.id) || [];
 setModifiedSinceExport(modifiedIds);
 } catch (error) {
 console.error('Error checking modifications:', error);
 } finally {
 setIsLoading(false);
 }
 }, [lastExport, user]);

  // Check modifications when lastExport changes
 useEffect(() => {
 checkModifications();
 }, [checkModifications]);

  // Record an export
 const recordExport = useCallback((
 format: ExportRecord['format'],
 target: ExportRecord['target'],
 locationIds: string[]
 ) => {
 const record: ExportRecord = {
 timestamp: new Date().toISOString(),
 format,
 target,
 locationCount: locationIds.length,
 locationIds,
 };
 
 saveLastExport(record);
 setLastExport(record);
 setModifiedSinceExport([]);
 }, []);

  // Clear export history
 const clearExportHistory = useCallback(() => {
 localStorage.removeItem(LOCAL_STORAGE_KEY);
 setLastExport(null);
 setModifiedSinceExport([]);
 }, []);

  // Format timestamp for display
 const formatLastExportTime = useCallback(() => {
 if (!lastExport) return null;
 
 const date = new Date(lastExport.timestamp);
 const now = new Date();
 const diffMs = now.getTime() - date.getTime();
 const diffMins = Math.floor(diffMs / 60000);
 const diffHours = Math.floor(diffMs / 3600000);
 const diffDays = Math.floor(diffMs / 86400000);

 if (diffMins < 1) return 'Hace un momento';
 if (diffMins < 60) return `Hace ${diffMins} min`;
 if (diffHours < 24) return `Hace ${diffHours}h`;
 if (diffDays < 7) return `Hace ${diffDays} días`;
 
 return date.toLocaleDateString('es-ES', {
 day: 'numeric',
 month: 'short',
 year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
 });
 }, [lastExport]);

 return {
 lastExport,
 modifiedSinceExport,
 modifiedCount: modifiedSinceExport.length,
 isLoading,
 recordExport,
 clearExportHistory,
 formatLastExportTime,
 checkModifications,
 };
}
