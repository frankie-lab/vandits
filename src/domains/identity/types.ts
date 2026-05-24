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

export type AppRole = 'master' | 'admin' | 'moderator' | 'editor';

export type AppPermission =
  | 'manage_users'
  | 'manage_editorial_criteria'
  | 'run_global_enrichment'
  | 'delete_any_location'
  | 'moderate_content'
  | 'manage_permissions'
  | 'manage_marker_config'
  | 'manage_route_engine'
  | 'manage_icon_library'
  | 'manage_enrichment_config'
  | 'view_audit_log'
  | 'manage_data_sources'
  | 'run_image_recovery'
  | 'inspect_design_system'
  | 'purge_user'
  | 'open_back_office'
  | 'assign_master'
  | 'run_internal_tooling'
  | 'view_geo_maintenance'
  | 'run_geo_backfill'
  | 'run_geo_canonicalize';
