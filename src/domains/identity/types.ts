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

export type AppRole = 'master' | 'admin' | 'moderator' | 'editor' | 'supervisor' | 'user' | 'curator';

export type AppPermission =
  | 'manage_users'
  | 'manage_criteria'
  | 'run_global_enrichment'
  | 'view_all_locations'
  | 'edit_all_locations'
  | 'delete_any_location'
  | 'manage_documents'
  | 'view_analytics'
  | 'moderate_content'
  | 'upload_files'
  | 'add_locations';
