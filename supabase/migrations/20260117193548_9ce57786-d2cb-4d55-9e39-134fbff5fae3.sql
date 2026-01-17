-- 1. Añadir nuevos valores al enum app_role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'moderator';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'editor';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'viewer';

-- 2. Crear enum para permisos específicos
CREATE TYPE public.app_permission AS ENUM (
  'manage_users',
  'manage_criteria',
  'run_global_enrichment',
  'view_all_locations',
  'edit_all_locations',
  'delete_any_location',
  'manage_documents',
  'view_analytics',
  'moderate_content'
);

-- 3. Crear tabla de permisos por rol
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role app_role NOT NULL,
  permission app_permission NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(role, permission)
);

-- Habilitar RLS
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Política: todos pueden leer permisos
CREATE POLICY "Anyone can read role permissions"
ON public.role_permissions FOR SELECT
USING (true);

-- Política: solo masters pueden modificar permisos
CREATE POLICY "Masters can manage role permissions"
ON public.role_permissions FOR ALL
USING (has_role(auth.uid(), 'master'));

-- 4. Insertar permisos para roles EXISTENTES (master, admin, user)
INSERT INTO public.role_permissions (role, permission) VALUES
  ('master', 'manage_users'),
  ('master', 'manage_criteria'),
  ('master', 'run_global_enrichment'),
  ('master', 'view_all_locations'),
  ('master', 'edit_all_locations'),
  ('master', 'delete_any_location'),
  ('master', 'manage_documents'),
  ('master', 'view_analytics'),
  ('master', 'moderate_content'),
  ('admin', 'manage_criteria'),
  ('admin', 'run_global_enrichment'),
  ('admin', 'view_all_locations'),
  ('admin', 'edit_all_locations'),
  ('admin', 'manage_documents'),
  ('admin', 'view_analytics'),
  ('admin', 'moderate_content');

-- 5. Crear función para verificar permisos
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission app_permission)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON ur.role = rp.role
    WHERE ur.user_id = _user_id
      AND rp.permission = _permission
  )
$$;

-- 6. Crear función para obtener todos los permisos de un usuario
CREATE OR REPLACE FUNCTION public.get_user_permissions(_user_id uuid)
RETURNS SETOF app_permission
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT rp.permission
  FROM public.user_roles ur
  JOIN public.role_permissions rp ON ur.role = rp.role
  WHERE ur.user_id = _user_id
$$;

-- 7. Crear función para obtener roles de un usuario
CREATE OR REPLACE FUNCTION public.get_user_roles(_user_id uuid)
RETURNS SETOF app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id
$$;