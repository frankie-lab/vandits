/**
 * AdminShell — shell común para todas las rutas `/admin/*` (PR-BACKOFFICE-UX-CANON-3).
 *
 * Estructura:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ Header: breadcrumb (Back Office / <Sección>) + cerrar       │
 *   ├──────────────┬──────────────────────────────────────────────┤
 *   │ Sidebar nav  │ <Outlet /> → AdminRoutePage                  │
 *   │ (route tabs) │                                              │
 *   └──────────────┴──────────────────────────────────────────────┘
 *
 * Gating: la entrada al shell exige `open_back_office` OR `manage_users`
 * (idéntico al modal AdminPanel). Cada ruta hija gatea su propia capability.
 *
 * Las rutas dedicadas son las marcadas con `routeMode: 'route'` en
 * `ADMIN_TABS`. Los tabs `routeMode: 'modal'` (users, permissions, markers,
 * routes, icons) siguen viviendo en el modal AdminPanel — no se listan aquí.
 */

import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Loader2, Shield, X, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/domains/identity';
import { ADMIN_TABS, ADMIN_DOMAIN_LABELS, getAdminTab, groupAdminTabsByDomain, isRouteModeTab, type AdminTabKey } from '@/components/admin/admin-tabs';

const ROUTE_TABS = ADMIN_TABS.filter(isRouteModeTab);

export function AdminShell() {
  const { hasPermission, loading } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();

  // Resolver tab activo desde la URL (segmento después de /admin/).
  const segment = location.pathname.replace(/^\/admin\/?/, '').split('/')[0] as AdminTabKey | '';
  const currentTab = getAdminTab(segment || undefined);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Gate de entrada al shell (igual que el modal AdminPanel).
  const canEnter = hasPermission('open_back_office') || hasPermission('manage_users');
  if (!canEnter) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="bg-card rounded-xl shadow-xl p-8 max-w-md text-center">
          <Shield className="w-16 h-16 text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Acceso denegado</h2>
          <p className="text-muted-foreground mb-6">
            No tienes permisos para acceder al Back Office.
          </p>
          <Button onClick={() => navigate('/')} className="w-full">
            Volver al inicio
          </Button>
        </div>
      </div>
    );
  }

  // Filtrar nav lateral por capability — coherente con UserMenu.
  const visibleTabs = ROUTE_TABS.filter(tab => hasPermission(tab.capability));

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header con breadcrumb */}
      <header className="flex items-center justify-between px-4 py-3 border-b bg-card">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 bg-primary/10 rounded-lg shrink-0">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm min-w-0">
            <Link to="/admin" className="text-muted-foreground hover:text-foreground transition-colors">
              Back Office
            </Link>
            {currentTab && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                <span className="font-semibold truncate">{currentTab.label}</span>
              </>
            )}
          </nav>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/')}
          aria-label="Cerrar Back Office"
        >
          <X className="w-5 h-5" />
        </Button>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Sidebar nav */}
        <aside className="w-64 shrink-0 border-r bg-card/50 overflow-y-auto pb-8">
          <nav className="p-2 space-y-0.5">
            {visibleTabs.map(tab => {
              const Icon = tab.icon;
              return (
                <NavLink
                  key={tab.key}
                  to={`/admin/${tab.key}`}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                      isActive
                        ? 'bg-primary/10 text-foreground font-medium'
                        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                    }`
                  }
                >
                  <Icon className={`w-4 h-4 shrink-0 ${tab.iconClass}`} />
                  <span className="truncate">{tab.label}</span>
                </NavLink>
              );
            })}
            {visibleTabs.length === 0 && (
              <p className="px-3 py-4 text-xs text-muted-foreground">
                No tienes capabilities para ninguna sección con ruta dedicada.
              </p>
            )}
          </nav>
        </aside>

        {/* Contenido (Outlet → AdminRoutePage o Index) */}
        <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/**
 * Página por defecto `/admin` (sin tab seleccionado).
 * Renderiza una guía mínima y los tabs disponibles como cards.
 */
export function AdminShellIndex() {
  const { hasPermission } = usePermissions();
  const visibleTabs = ROUTE_TABS.filter(tab => hasPermission(tab.capability));

  return (
    <div className="flex-1 overflow-y-auto p-6 pb-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-1">Back Office</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Selecciona una sección del menú lateral o usa una de las tarjetas.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {visibleTabs.map(tab => {
            const Icon = tab.icon;
            return (
              <Link
                key={tab.key}
                to={`/admin/${tab.key}`}
                className="flex items-start gap-3 p-4 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
              >
                <div className="p-2 rounded-md bg-muted/50 shrink-0">
                  <Icon className={`w-5 h-5 ${tab.iconClass}`} />
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{tab.label}</div>
                  <code className="text-[10px] text-muted-foreground">/admin/{tab.key}</code>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
