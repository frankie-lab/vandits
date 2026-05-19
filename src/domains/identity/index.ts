// Domain: Identity — public API
export { useAuth } from './hooks/use-auth';
export { usePermissions, useHasPermission, useHasRole, useCapability } from './hooks/use-permissions';
export { CAPABILITIES, CAPABILITY_LABELS, type Capability } from './capabilities';
export type { UserProfile, AppRole, AppPermission } from './types';
