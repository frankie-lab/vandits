import { waypointRepository } from '@/repositories/waypoint.repository';
import { documentV2Repository } from '@/repositories/document-v2.repository';
import { documentTrackRepository } from '@/repositories/document-track.repository';
import type { Waypoint, DocumentTrack, DocumentSourceType } from '@/domains/v2';

/**
 * Import service — orchestrates the import lifecycle:
 * parsing → waypoint creation → resolution → confirmation.
 */
export const importService = {
  /**
   * Register parsed waypoints and tracks for a document.
   * Updates document audit counters.
   */
  async registerParsedContent(
    documentId: string,
    waypoints: Omit<Waypoint, 'id' | 'createdAt' | 'updatedAt'>[],
    tracks: Omit<DocumentTrack, 'id' | 'createdAt' | 'updatedAt'>[],
    sourceType: DocumentSourceType,
  ): Promise<{ waypoints: Waypoint[]; tracks: DocumentTrack[] }> {
    // Set source type and status
    await documentV2Repository.setSourceType(documentId, sourceType);
    await documentV2Repository.updateImportStatus(documentId, 'reviewing');

    // Insert waypoints and tracks
    const [insertedWaypoints, insertedTracks] = await Promise.all([
      waypointRepository.insertBatch(waypoints),
      documentTrackRepository.insertBatch(tracks),
    ]);

    // Update counters
    const pending = insertedWaypoints.filter(w => w.resolutionStatus === 'pending').length;
    const resolved = insertedWaypoints.filter(w => w.resolutionStatus === 'resolved').length;
    const conflicts = insertedWaypoints.filter(w => w.resolutionStatus === 'conflict').length;

    await documentV2Repository.updateAuditCounters(documentId, {
      totalWaypoints: insertedWaypoints.length,
      resolvedCount: resolved,
      pendingCount: pending,
      conflictCount: conflicts,
    });

    return { waypoints: insertedWaypoints, tracks: insertedTracks };
  },

  /**
   * Resolve a single waypoint to a canonical place.
   * Updates document counters.
   */
  async resolveWaypoint(
    waypointId: string,
    placeId: string,
    method: Waypoint['resolutionMethod'],
    userId?: string,
  ): Promise<Waypoint> {
    const resolved = await waypointRepository.resolve(waypointId, placeId, method, userId);

    // Update document counters
    const siblings = await waypointRepository.findByDocument(resolved.documentId);
    const counts = {
      resolvedCount: siblings.filter(w => w.resolutionStatus === 'resolved').length,
      pendingCount: siblings.filter(w => w.resolutionStatus === 'pending').length,
      conflictCount: siblings.filter(w => w.resolutionStatus === 'conflict').length,
    };
    await documentV2Repository.updateAuditCounters(resolved.documentId, counts);

    return resolved;
  },

  /**
   * Confirm an import — marks the document as confirmed.
   */
  async confirmImport(documentId: string): Promise<void> {
    await documentV2Repository.updateImportStatus(documentId, 'confirmed');
  },

  /**
   * Get full import state for a document.
   */
  async getImportState(documentId: string) {
    const [doc, waypoints, tracks] = await Promise.all([
      documentV2Repository.findById(documentId),
      waypointRepository.findByDocument(documentId),
      documentTrackRepository.findByDocument(documentId),
    ]);
    return { document: doc, waypoints, tracks };
  },
};
