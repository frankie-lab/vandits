// Domain: Content — realtime location updates
// Re-export from the canonical implementation under src/hooks/.
// (The implementation lives there because it's tightly coupled to the
// global Supabase realtime channel; the domain barrel is the public API.)
export { useRealtimeLocations } from '@/hooks/use-realtime-locations';
