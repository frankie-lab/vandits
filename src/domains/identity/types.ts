// Domain: Identity — Auth, profile, roles, sessions, global preferences

export interface UserProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_private: boolean;
  duplicate_threshold_meters: number;
  created_at: string;
  updated_at: string;
}

// Canon RBAC (PR-BACKOFFICE-UX-CLOSURE-1): 4 roles activos. Final.
// Purgados del enum `public.app_role`: `user`, `supervisor`, `curator` (Sec. 5 del PR).
// El SoT es el enum SQL — este tipo es el espejo cliente. Cambiar uno exige cambiar el otro.
export type AppRole = 'master' | 'admin' | 'moderator' | 'editor';

// AppPermission: re-exportado desde el hook para mantener un único catálogo
// (mirror del enum `public.app_permission`). Ver `use-permissions.ts`.
export type { AppPermission } from './hooks/use-permissions';
