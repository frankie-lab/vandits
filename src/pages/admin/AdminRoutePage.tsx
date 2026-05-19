/**
 * AdminRoutePage — renderiza el body de un tab `routeMode='route'` (PR-BACKOFFICE-UX-CANON-3).
 *
 * Mecánica:
 *   1. Lee `:tab` de la URL.
 *   2. Resuelve el spec en `ADMIN_TABS`. Si no existe o no es routeMode='route',
 *      redirige al index del shell (`/admin`).
 *   3. Aplica `AdminGate` con la capability del spec — mismo gate que el modal.
 *   4. Carga lazy el componente y lo monta en el área principal.
 *
 * NO cambia lógica funcional: cada Component es el mismo binario que se
 * cargaba en el modal AdminPanel.
 */

import { Suspense } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AdminGate, AdminGateDenied } from '@/components/admin/AdminGate';
import { getAdminTab, isRouteModeTab, type AdminTabKey } from '@/components/admin/admin-tabs';
import { PanelEffectHeader } from '@/components/admin/PanelEffectHeader';

export function AdminRoutePage() {
  const { tab } = useParams<{ tab: AdminTabKey }>();
  const spec = getAdminTab(tab);

  if (!spec || !isRouteModeTab(spec) || !spec.Component) {
    return <Navigate to="/admin" replace />;
  }

  const Body = spec.Component;

  return (
    <AdminGate
      capability={spec.capability}
      fallback={
        <AdminGateDenied
          message={`Necesitas la capability "${spec.capability}" para acceder a "${spec.label}".`}
        />
      }
    >
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
          <PanelEffectHeader capability={spec.capability} label={spec.label} />
          <Body />
        </div>
      </Suspense>
    </AdminGate>
  );
}
