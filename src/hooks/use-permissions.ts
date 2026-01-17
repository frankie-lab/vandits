import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Tipos de roles y permisos (deben coincidir con el enum de la base de datos)
export type AppRole = 'master' | 'admin' | 'moderator' | 'editor' | 'viewer' | 'user';

export type AppPermission = 
  | 'manage_users'
  | 'manage_criteria'
  | 'run_global_enrichment'
  | 'view_all_locations'
  | 'edit_all_locations'
  | 'delete_any_location'
  | 'manage_documents'
  | 'view_analytics'
  | 'moderate_content';

interface PermissionsState {
  roles: AppRole[];
  permissions: AppPermission[];
  loading: boolean;
  error: string | null;
}

export function usePermissions() {
  const [state, setState] = useState<PermissionsState>({
    roles: [],
    permissions: [],
    loading: true,
    error: null,
  });

  const fetchPermissions = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setState({ roles: [], permissions: [], loading: false, error: null });
        return;
      }

      // Obtener roles del usuario
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      if (rolesError) throw rolesError;

      const roles = (rolesData || []).map(r => r.role as AppRole);

      // Si no tiene roles, asignar 'user' por defecto
      if (roles.length === 0) {
        setState({ roles: ['user'], permissions: [], loading: false, error: null });
        return;
      }

      // Obtener permisos basados en los roles
      const { data: permissionsData, error: permissionsError } = await supabase
        .from('role_permissions')
        .select('permission')
        .in('role', roles);

      if (permissionsError) throw permissionsError;

      const permissions = [...new Set((permissionsData || []).map(p => p.permission as AppPermission))];

      setState({ roles, permissions, loading: false, error: null });
    } catch (error: any) {
      console.error('Error fetching permissions:', error);
      setState(prev => ({ ...prev, loading: false, error: error.message }));
    }
  }, []);

  useEffect(() => {
    fetchPermissions();

    // Escuchar cambios de autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchPermissions();
    });

    return () => subscription.unsubscribe();
  }, [fetchPermissions]);

  // Helper para verificar si tiene un rol específico
  const hasRole = useCallback((role: AppRole): boolean => {
    return state.roles.includes(role);
  }, [state.roles]);

  // Helper para verificar si tiene un permiso específico
  const hasPermission = useCallback((permission: AppPermission): boolean => {
    return state.permissions.includes(permission);
  }, [state.permissions]);

  // Helper para verificar si tiene alguno de los permisos
  const hasAnyPermission = useCallback((permissions: AppPermission[]): boolean => {
    return permissions.some(p => state.permissions.includes(p));
  }, [state.permissions]);

  // Helper para verificar si tiene todos los permisos
  const hasAllPermissions = useCallback((permissions: AppPermission[]): boolean => {
    return permissions.every(p => state.permissions.includes(p));
  }, [state.permissions]);

  // Helper para verificar si es admin o superior
  const isAdmin = useCallback((): boolean => {
    return hasRole('master') || hasRole('admin');
  }, [hasRole]);

  // Helper para verificar si es master
  const isMaster = useCallback((): boolean => {
    return hasRole('master');
  }, [hasRole]);

  return {
    ...state,
    hasRole,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    isAdmin,
    isMaster,
    refetch: fetchPermissions,
  };
}

// Hook simplificado para verificar un permiso específico
export function useHasPermission(permission: AppPermission): boolean {
  const { hasPermission, loading } = usePermissions();
  return !loading && hasPermission(permission);
}

// Hook simplificado para verificar un rol específico
export function useHasRole(role: AppRole): boolean {
  const { hasRole, loading } = usePermissions();
  return !loading && hasRole(role);
}
