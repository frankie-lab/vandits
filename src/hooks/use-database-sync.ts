// Re-export proxy — maintains backward compatibility
export { useDatabaseSync } from '@/domains/content/hooks/use-database-sync';
export type { SyncPhase } from '@/domains/content/hooks/use-database-sync';
export {
  saveDocumentToDatabase,
  updateLocationInDatabase,
  deleteDocumentFromDatabase,
  deleteAllUserDocuments,
  batchUpdateLocations,
  loadLocationsFromDatabase,
  loadAllLocationsFromDatabase,
} from '@/domains/content/lib/db-operations';
