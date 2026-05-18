// Domain: Identity — public API
export { useAuth } from './hooks/use-auth';
export { usePermissions, useHasPermission, useHasRole, useCapability } from './hooks/use-permissions';
export type { Capability } from './hooks/use-permissions';
export type { UserProfile, AppRole, AppPermission } from './types';
