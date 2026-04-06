// Domain: Routes — route calculation, waypoints, stops, transport

// Re-export key types from existing modules for domain boundary
export type { Route, RouteWaypoint } from './hooks/use-routes';
export type { RouteStop, RouteDayStage, RouteStopType } from './hooks/use-route-stops';
export type { UseRouteCalculationOptions } from './hooks/use-route-calculation';
export type {
  EngineConfig,
  CalculationResult,
  RouteResult,
  RouteAlternative,
  RouteImpossible,
  MapSegment,
} from './lib/route-engine';
export type { TransportModeRef } from './hooks/use-travel-advisor';
