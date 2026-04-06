/**
 * Hook: useCuratorDruidMode
 * Domain: Curators + Druids
 * Handles entering/exiting curator and druid modes via custom events.
 */
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLocationsStore } from '@/store/locations-store';
import { toast } from 'sonner';

export function useCuratorDruidMode(loadFromDatabase: () => Promise<void>) {
  // Listen for curator mode activation
  useEffect(() => {
    const { setFilters, addDocument, clearAllDocuments } = useLocationsStore.getState();

    const handleCuratorFilter = async (e: CustomEvent) => {
      const { curatorId, curatorName } = e.detail;
      console.log('[Index] Curator mode activated:', curatorName);

      try {
        const { data: curatorDocs, error: docsError } = await supabase
          .from('curator_documents')
          .select('document_id')
          .eq('curator_id', curatorId);

        if (docsError) throw docsError;

        if (!curatorDocs || curatorDocs.length === 0) {
          toast.info(`El curador "${curatorName}" no tiene documentos asignados`, {
            description: 'Puedes crear un nuevo documento para este curador',
          });
          return;
        }

        const docIds = curatorDocs.map(cd => cd.document_id);

        const { data: docs, error: fetchDocsError } = await supabase
          .from('documents')
          .select('*')
          .in('id', docIds);

        if (fetchDocsError) throw fetchDocsError;

        const { data: locations, error: locsError } = await supabase
          .from('locations')
          .select('*')
          .in('document_id', docIds)
          .is('deleted_at', null);

        if (locsError) throw locsError;

        clearAllDocuments();

        docs?.forEach(doc => {
          const docLocations = (locations || [])
            .filter(l => l.document_id === doc.id)
            .map(l => ({
              id: l.id,
              name: l.name,
              description: l.description || '',
              coordinates: { lat: l.latitude, lng: l.longitude, altitude: l.altitude || undefined },
              continent: l.continent || undefined,
              country: l.country || undefined,
              region: l.region || undefined,
              zone: l.zone || undefined,
              placeType: l.place_type as any,
              visibility: l.visibility as any,
              customData: (l.custom_data as Record<string, string>) || {},
              enrichedData: l.enriched_data as any,
              createdAt: new Date(l.created_at),
              updatedAt: new Date(l.updated_at),
              _curatorId: curatorId,
            }));

          addDocument({
            id: doc.id,
            name: doc.name,
            fileName: doc.original_filename || doc.name,
            locations: docLocations,
            uploadedAt: new Date(doc.created_at),
            userId: doc.user_id || undefined,
            curatorId: curatorId,
          });
        });

        setFilters({
          filterByCuratorId: curatorId,
          filterByCuratorName: curatorName,
        });

        console.log('[Index] Curator documents loaded:', docs?.length, 'locations:', locations?.length);
      } catch (error) {
        console.error('[Index] Error loading curator data:', error);
        toast.error('Error al cargar datos del curador');
      }
    };

    const handleExitCuratorMode = () => {
      console.log('[Index] Exiting curator mode, reloading user data...');
      setFilters({});
      loadFromDatabase();
    };

    window.addEventListener('lovable:filter-by-curator', handleCuratorFilter as EventListener);
    window.addEventListener('lovable:exit-curator-mode', handleExitCuratorMode);

    return () => {
      window.removeEventListener('lovable:filter-by-curator', handleCuratorFilter as EventListener);
      window.removeEventListener('lovable:exit-curator-mode', handleExitCuratorMode);
    };
  }, [loadFromDatabase]);

  // Listen for druid mode activation
  useEffect(() => {
    const { setFilters, addDocument, clearAllDocuments } = useLocationsStore.getState();

    const handleDruidFilter = async (e: CustomEvent) => {
      const { druidId, druidName } = e.detail;
      console.log('[Index] Druid mode activated:', druidName);

      try {
        const { data: druidData, error: druidError } = await supabase
          .from('druids')
          .select('icon, color, search_radius_km')
          .eq('id', druidId)
          .single();

        if (druidError) throw druidError;

        const { data: druidLocations, error: locsError } = await supabase
          .from('druid_locations')
          .select('*')
          .eq('druid_id', druidId);

        if (locsError) throw locsError;

        if (!druidLocations || druidLocations.length === 0) {
          toast.info(`El druida "${druidName}" no tiene puntos`, {
            description: 'Ejecuta una búsqueda para encontrar puntos',
          });
          setFilters({
            filterByDruidId: druidId,
            filterByDruidName: druidName,
          });
          return;
        }

        clearAllDocuments();

        const druidLocationsFormatted = druidLocations.map(l => ({
          id: l.id,
          name: l.name,
          description: (l.enriched_data as any)?.descripcion || '',
          coordinates: { lat: l.latitude, lng: l.longitude },
          placeType: l.place_type as any,
          customData: {},
          enrichedData: l.enriched_data as any,
          createdAt: new Date(l.created_at),
          updatedAt: new Date(l.updated_at),
          _druidId: druidId,
        }));

        addDocument({
          id: `druid-${druidId}`,
          name: `Druida: ${druidName}`,
          fileName: `druid-${druidId}.kml`,
          locations: druidLocationsFormatted,
          uploadedAt: new Date(),
          druidId: druidId,
          druidIcon: druidData?.icon || '',
          druidColor: druidData?.color || '#22c55e',
        });

        setFilters({
          filterByDruidId: druidId,
          filterByDruidName: druidName,
        });

        console.log('[Index] Druid locations loaded:', druidLocations.length);
        toast.success(`${druidLocations.length} puntos cargados`);
      } catch (error) {
        console.error('[Index] Error loading druid data:', error);
        toast.error('Error al cargar datos del druida');
      }
    };

    const handleExitDruidMode = () => {
      console.log('[Index] Exiting druid mode, reloading user data...');
      setFilters({});
      loadFromDatabase();
    };

    window.addEventListener('lovable:filter-by-druid', handleDruidFilter as EventListener);
    window.addEventListener('lovable:exit-druid-mode', handleExitDruidMode);

    return () => {
      window.removeEventListener('lovable:filter-by-druid', handleDruidFilter as EventListener);
      window.removeEventListener('lovable:exit-druid-mode', handleExitDruidMode);
    };
  }, [loadFromDatabase]);
}
