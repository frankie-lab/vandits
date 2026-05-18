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

export type AppRole = 'master' | 'admin' | 'moderator' | 'editor' | 'supervisor' | 'user';

// AppPermission: re-exportado desde el hook para mantener un único catálogo
// (mirror del enum `public.app_permission`). Ver `use-permissions.ts`.
export type { AppPermission } from './hooks/use-permissions';
