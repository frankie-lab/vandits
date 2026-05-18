/**
 * AdminGate — declarative capability gate for admin surfaces.
 *
 * Canon RBAC PR-ADMIN-AUDIT Step 3: cualquier pantalla, tab o acción admin
 * que necesite gating en cliente DEBE usar este componente con `capability`.
 * Prohibido nuevo código con `isMaster()`/`isAdmin()` para gating UX.
 *
 * Server-side el predicado canónico es `public.has_permission(uid, cap)` —
 * este componente es el espejo cliente. NO sustituye RLS ni edge gates.
 */

import { type ReactNode } from 'react';
import { Loader2, Shield } from 'lucide-react';
import { useCapability, type Capability } from '@/domains/identity';

interface AdminGateProps {
  capability: Capability;
  /** Optional: render nothing while loading (default = inline spinner). */
  silentLoading?: boolean;
  /** Optional: custom fallback for denied state (default = `null`). */
  fallback?: ReactNode;
  children: ReactNode;
}

export function AdminGate({ capability, silentLoading, fallback = null, children }: AdminGateProps) {
  const { allowed, loading } = useCapability(capability);

  if (loading) {
    if (silentLoading) return null;
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!allowed) return <>{fallback}</>;

  return <>{children}</>;
}

/**
 * AdminGateDenied — opinionated denied state for top-level admin panels
 * (full modal body). Use as `fallback` when you want to show a friendly
 * "access denied" UI instead of silently hiding.
 */
export function AdminGateDenied({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <Shield className="w-12 h-12 text-destructive mb-3" />
      <h3 className="text-base font-semibold mb-1">Acceso denegado</h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        {message ?? 'No tienes la capability requerida para esta sección.'}
      </p>
    </div>
  );
}
