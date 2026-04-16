// Domain: Discovery — map aggregation, filters, search, exploration

// Components — re-exports from src/components/
export { LocationMap } from '@/components/LocationMap';
export { FilterBar } from '@/components/FilterBar';
export { SemanticSearch } from '@/components/SemanticSearch';
export { FloatingToolbar } from '@/components/FloatingToolbar';
export { GalleryView } from '@/components/GalleryView';
export { FloatingPanel } from '@/components/FloatingPanel';

// Types
export type {
  FilterCriteria,
  OwnershipFilter,
  VisitedFilter,
  EnrichmentStatusFilter,
} from '@/types/location';

// Hooks (will be populated as we migrate)
