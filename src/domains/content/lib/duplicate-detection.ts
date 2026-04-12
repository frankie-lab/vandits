// Domain: Content — duplicate detection utilities
export {
  calculateDistance,
  coordinateHash,
  buildCoordinateIndex,
  buildDocumentIndex,
  deduplicateLocations,
  formatDistance,
} from '@/lib/duplicate-detection';
export type { DuplicateMatch, DeduplicationResult } from '@/lib/duplicate-detection';
