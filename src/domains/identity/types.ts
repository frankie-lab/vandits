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

// Canon RBAC (PR-ADMIN-AUDIT-3 Fase A): 4 roles activos + supervisor en revisión.
// 'curator' y 'user' purgados del catálogo UI (zombi: 0 titulares, 0 capabilities).
// Aún viven en el enum `public.app_role` — se purgarán en Fase B (migración destructiva).
export type AppRole = 'master' | 'admin' | 'moderator' | 'editor' | 'supervisor';

// AppPermission: re-exportado desde el hook para mantener un único catálogo
// (mirror del enum `public.app_permission`). Ver `use-permissions.ts`.
export type { AppPermission } from './hooks/use-permissions';
