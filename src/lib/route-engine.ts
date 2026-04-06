// Re-export from domain — this file is kept for backward compatibility
export {
  DEFAULT_ENGINE_CONFIG,
  haversineDistance,
  generateGreatCircleArc,
  formatDuration,
  formatDistance,
  parseApiResponse,
  buildMapSegments,
  extractFlightLabel,
  extractPortNames,
  getRouteColor,
  TRANSPORT_CODE_TO_ROUTE_MODE,
} from '@/domains/routes/lib/route-engine';
export type {
  EngineWaypoint,
  RouteSegment,
  EngineConfig,
  CalculationResult,
  RouteResult,
  RouteAlternative,
  RouteImpossible,
  MapSegment,
} from '@/domains/routes/lib/route-engine';
