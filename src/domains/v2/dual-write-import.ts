/**
 * V2 Dual-Write Bridge for Import Flow
 * 
 * Wraps the V2 import service with flag-aware dual-write logic.
 * When v2_data_write_imports is active, imports write to both
 * legacy (locations) and V2 (waypoints/documents) tables.
 * 
 * Usage: call from the existing import flow after legacy write.
 */

import { importService } from '@/services/import.service';
import { getV2Flags } from '@/hooks/use-v2-flags';
import type { Waypoint, DocumentTrack, DocumentSourceType } from '@/domains/v2';

/**
 * After a legacy import completes, optionally mirror data into V2 tables.
 * Safe to call always — no-ops when flags are off.
 */
export async function dualWriteImport(params: {
  documentId: string;
  sourceType: DocumentSourceType;
  waypoints: Omit<Waypoint, 'id' | 'createdAt' | 'updatedAt'>[];
  tracks: Omit<DocumentTrack, 'id' | 'createdAt' | 'updatedAt'>[];
}): Promise<void> {
  const flags = await getV2Flags();

  if (!flags.v2DataWriteImports) return;

  try {
    await importService.registerParsedContent(
      params.documentId,
      params.waypoints,
      params.tracks,
      params.sourceType,
    );
    console.log('[V2 DualWrite] Import mirrored to V2 tables');
  } catch (error) {
    // V2 write failure should not break the legacy flow
    console.error('[V2 DualWrite] Import mirror failed:', error);
  }
}

/**
 * After a legacy waypoint resolution, optionally mirror to V2.
 */
export async function dualWriteResolveWaypoint(params: {
  waypointId: string;
  placeId: string;
  method: Waypoint['resolutionMethod'];
  userId?: string;
}): Promise<void> {
  const flags = await getV2Flags();

  if (!flags.v2DataWriteImports) return;

  try {
    await importService.resolveWaypoint(
      params.waypointId,
      params.placeId,
      params.method,
      params.userId,
    );
  } catch (error) {
    console.error('[V2 DualWrite] Waypoint resolution mirror failed:', error);
  }
}
