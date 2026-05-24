/**
 * PermissionsMatrixPanel (PR-RBAC-MATRIX-1 + PR-BACKOFFICE-UX-CLOSURE-1).
 *
 * Vista canónica del modelo RBAC: matriz capability × role agrupada por
 * dominio operativo. Sustituye al accordion por rol como vista principal.
 *
 * - Eje vertical: capabilities (agrupadas por CapabilityDomain).
 * - Eje horizontal: 4 roles activos (master, admin, moderator, editor).
 *   `user`/`supervisor`/`curator` purgados del enum app_role en
 *   PR-BACKOFFICE-UX-CLOSURE-1 — ya no aparecen como columna.
 * - Celda: ✓ permitido / — denegado. Toggle requiere typed-token (canon F3).
 *
 * Filtros: búsqueda libre, master-only, destructive, internal, unused.
 * Detección visual de roles vacíos / casi vacíos (banner ámbar).
 * Cada capability expone descripción, riesgo, runtime y ownership en tooltip
 * y leyenda lateral.
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import { Loader2, Search, ChevronDown, ChevronRight, AlertTriangle, Lock, Wrench, Filter, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CAPABILITIES, CAPABILITY_LABELS, type Capability } from '@/domains/identity/capabilities';
import type { AppRole } from '@/domains/identity';
import { DestructiveConfirmDialog } from '@/shared/components/ui/destructive-confirm-dialog';
import { cn } from '@/lib/utils';
import {
  CAPABILITY_META,
  DOMAIN_LABELS,
  DOMAIN_ORDER,
  RISK_LABEL,
  RISK_TONE,
  RUNTIME_LABEL,
  type CapabilityDomain,
} from './permissions/capability-metadata';
import { EffectBadgeRow, effectsForCapability } from './EffectBadge';

const ROLES: AppRole[] = ['master', 'admin', 'moderator', 'editor'];

const ROLE_LABELS: Record<AppRole, string> = {
  master: 'Master',
  admin: 'Admin',
  moderator: 'Moderator',
  editor: 'Editor',
};

const ROLE_TONES: Record<AppRole, string> = {
  master: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30',
  admin: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
  moderator: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
  editor: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
};

interface MatrixCell {
  role: AppRole;
  cap: Capability;
  allowed: boolean;
}

interface FilterFlags {
  masterOnly: boolean;
  destructive: boolean;
  internal: boolean;
  unused: boolean;
}

export function PermissionsMatrixPanel() {
  const [loading, setLoading] = useState(true);
  const [grants, setGrants] = useState<Set<string>>(new Set()); // `${role}::${cap}`
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<CapabilityDomain>>(new Set());
  const [filters, setFilters] = useState<FilterFlags>({
    masterOnly: false,
    destructive: false,
    internal: false,
    unused: false,
  });
  const [pendingToggle, setPendingToggle] = useState<{ role: AppRole; cap: Capability; current: boolean } | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('role_permissions').select('role, permission');
      if (error) throw error;
      const set = new Set<string>();
      (data || []).forEach((row: { role: string; permission: string }) => {
        set.add(`${row.role}::${row.permission}`);
      });
      setGrants(set);
    } catch (e) {
      console.error('[PermissionsMatrix] fetch error', e);
      toast.error('Error cargando matriz RBAC');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  // Agrupación canónica.
  const byDomain = useMemo(() => {
    const map = new Map<CapabilityDomain, Capability[]>();
    DOMAIN_ORDER.forEach(d => map.set(d, []));
    CAPABILITIES.forEach(cap => {
      const meta = CAPABILITY_META[cap];
      if (!meta) return;
      map.get(meta.domain)!.push(cap);
    });
    return map;
  }, []);

  // Conteo por rol (para barra superior).
  const countsByRole = useMemo(() => {
    const c: Record<AppRole, number> = { master: 0, admin: 0, moderator: 0, editor: 0 };
    grants.forEach(k => {
      const [role] = k.split('::') as [AppRole, Capability];
      if (role in c) c[role]++;
    });
    return c;
  }, [grants]);

  const grantCount = useCallback((cap: Capability) => {
    let n = 0;
    ROLES.forEach(r => { if (grants.has(`${r}::${cap}`)) n++; });
    return n;
  }, [grants]);

  const matchesFilters = useCallback((cap: Capability): boolean => {
    const meta = CAPABILITY_META[cap];
    if (!meta) return true;
    if (search.trim()) {
      const q = search.toLowerCase();
      const hit =
        cap.toLowerCase().includes(q) ||
        (CAPABILITY_LABELS[cap] ?? '').toLowerCase().includes(q) ||
        meta.description.toLowerCase().includes(q);
      if (!hit) return false;
    }
    if (filters.masterOnly && !meta.masterOnly) return false;
    if (filters.destructive && !meta.destructive) return false;
    if (filters.internal && !meta.internal) return false;
    if (filters.unused && grantCount(cap) > 0) return false;
    return true;
  }, [search, filters, grantCount]);

  const requestToggle = (role: AppRole, cap: Capability) => {
    // PR-MASTER-BYPASS-1 — Master es supercap implícita (bypass SQL en
    // has_permission). La columna master no es editable desde la matriz:
    // todo cambio aquí sería inerte (master pasa el bypass igual) y
    // engañoso. Silently no-op; el cell ya está disabled visualmente.
    if (role === 'master') return;
    const key = `${role}::${cap}`;
    setPendingToggle({ role, cap, current: grants.has(key) });
  };

  const executeToggle = async () => {
    if (!pendingToggle) return;
    const { role, cap, current } = pendingToggle;
    const key = `${role}::${cap}`;
    setPendingToggle(null);
    setSavingCell(key);
    try {
      if (current) {
        const { error } = await supabase.from('role_permissions').delete().eq('role', role).eq('permission', cap);
        if (error) throw error;
        setGrants(prev => { const next = new Set(prev); next.delete(key); return next; });
        toast.success('Permiso revocado');
      } else {
        const { error } = await supabase.from('role_permissions').insert({ role, permission: cap });
        if (error) throw error;
        setGrants(prev => new Set(prev).add(key));
        toast.success('Permiso asignado');
      }
    } catch (e: any) {
      console.error('[PermissionsMatrix] toggle error', e);
      toast.error(e?.message ?? 'Error modificando permiso');
    } finally {
      setSavingCell(null);
    }
  };

  const toggleDomain = (d: CapabilityDomain) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Detección genérica de roles vacíos / casi vacíos.
  const emptyRoles = ROLES.filter(r => countsByRole[r] === 0);
  const sparseRoles = ROLES.filter(r => countsByRole[r] > 0 && countsByRole[r] < 2);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex-1 flex flex-col min-h-0">
        {/* Header: búsqueda + filtros */}
        <div className="shrink-0 border-b bg-muted/30 px-4 py-3 space-y-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar capability, descripción o slug..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              <FilterChip active={filters.masterOnly} onClick={() => setFilters(f => ({ ...f, masterOnly: !f.masterOnly }))} icon={<Lock className="w-3 h-3" />} label="master-only" />
              <FilterChip active={filters.destructive} onClick={() => setFilters(f => ({ ...f, destructive: !f.destructive }))} icon={<AlertTriangle className="w-3 h-3" />} label="destructive" tone="destructive" />
              <FilterChip active={filters.internal} onClick={() => setFilters(f => ({ ...f, internal: !f.internal }))} icon={<Wrench className="w-3 h-3" />} label="internal" />
              <FilterChip active={filters.unused} onClick={() => setFilters(f => ({ ...f, unused: !f.unused }))} label="unused" />
            </div>
          </div>

          {/* Barra de roles: conteo + detección de roles vacíos/casi vacíos. */}
          <div className="flex items-center gap-2 flex-wrap">
            {ROLES.map(r => {
              const count = countsByRole[r];
              const isEmpty = count === 0;
              const isSparse = !isEmpty && count < 2;
              return (
                <div key={r} className={cn('inline-flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs font-medium', ROLE_TONES[r])}>
                  <span>{ROLE_LABELS[r]}</span>
                  <span className="opacity-70">·</span>
                  <span className="tabular-nums">{count} caps</span>
                  {(isEmpty || isSparse) && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className={cn(
                          'ml-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-wide',
                          isEmpty ? 'text-destructive' : 'text-amber-700 dark:text-amber-300',
                        )}>
                          <AlertTriangle className="w-3 h-3" /> {isEmpty ? 'vacío' : 'casi vacío'}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs">
                        {isEmpty
                          ? 'Este rol no tiene ninguna capability asignada — no puede hacer nada en el sistema.'
                          : 'Rol con menos de 2 capabilities. Posible candidato a revisar (¿zombi o legacy?).'}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              );
            })}
          </div>

          {(emptyRoles.length > 0) && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-md border border-destructive/30 bg-destructive/5 text-[12px] text-destructive">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                Roles sin capabilities: <strong>{emptyRoles.map(r => ROLE_LABELS[r]).join(', ')}</strong>.
                Decide si deben recibir asignaciones o purgarse del enum.
              </span>
            </div>
          )}
        </div>


        {/* Matriz */}
        <div className="flex-1 overflow-auto overscroll-contain">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground w-[42%] min-w-[280px]">Capability</th>
                {ROLES.map(r => (
                  <th key={r} className="px-2 py-2 text-center font-medium">
                    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs border', ROLE_TONES[r])}>
                      {ROLE_LABELS[r]}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DOMAIN_ORDER.map(domain => {
                const caps = (byDomain.get(domain) ?? []).filter(matchesFilters);
                if (caps.length === 0) return null;
                const isCollapsed = collapsed.has(domain);
                const isDestructiveDomain = domain === 'destructive' || domain === 'internal';
                return (
                  <DomainRows
                    key={domain}
                    domain={domain}
                    caps={caps}
                    collapsed={isCollapsed}
                    onToggleDomain={() => toggleDomain(domain)}
                    grants={grants}
                    savingCell={savingCell}
                    onCellClick={requestToggle}
                    grantCount={grantCount}
                    isDestructive={isDestructiveDomain}
                  />
                );
              })}
            </tbody>
          </table>

          {/* Leyenda */}
          <div className="px-4 py-3 border-t bg-muted/20 text-[11px] text-muted-foreground space-y-1">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="inline-flex items-center gap-1.5"><CellMark allowed /> permitido</span>
              <span className="inline-flex items-center gap-1.5"><CellMark allowed={false} /> denegado</span>
              <span className="inline-flex items-center gap-1.5"><Lock className="w-3 h-3 text-purple-600 dark:text-purple-400" /> master: bypass implícito (no editable)</span>
              <span className="inline-flex items-center gap-1.5"><AlertTriangle className="w-3 h-3 text-destructive" /> destructive / crítico</span>
              <span className="inline-flex items-center gap-1.5"><Wrench className="w-3 h-3" /> internal tooling</span>
            </div>
            <div>
              SoT autorización = <code className="px-1 rounded bg-muted text-foreground">public.has_permission(uid, cap)</code>.
              Master es <strong>supercap implícita</strong> (bypass SQL vía <code className="px-1 rounded bg-muted text-foreground">has_role(uid,'master')</code>),
              independiente de <code className="px-1 rounded bg-muted text-foreground">role_permissions</code>. El resto de roles depende de la matriz.
              Toda mutación exige confirmación tipada (canon F3).
            </div>
          </div>
        </div>

        {/* Typed-token confirm */}
        <DestructiveConfirmDialog
          open={!!pendingToggle}
          onOpenChange={next => { if (!next) setPendingToggle(null); }}
          title={pendingToggle?.current ? '¿Revocar permiso?' : '¿Asignar permiso?'}
          description={pendingToggle ? (
            <div className="space-y-2">
              <p>
                {pendingToggle.current ? 'Vas a revocar' : 'Vas a asignar'} la capability{' '}
                <code className="px-1 py-0.5 rounded bg-muted text-foreground font-mono text-[11px]">{pendingToggle.cap}</code>{' '}
                al rol <strong>{ROLE_LABELS[pendingToggle.role]}</strong>.
              </p>
              {CAPABILITY_META[pendingToggle.cap]?.masterOnly && pendingToggle.role !== 'master' && !pendingToggle.current && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Esta capability está marcada como <strong>master-only</strong> en metadata.
                  Asignarla a otro rol rompe la convención de gobernanza.
                </p>
              )}
              {CAPABILITY_META[pendingToggle.cap]?.destructive && (
                <p className="text-xs text-destructive">
                  Capability destructive — afecta a datos o privilegios de forma irreversible.
                </p>
              )}
            </div>
          ) : null}
          token="MODIFICAR"
          confirmLabel={pendingToggle?.current ? 'Revocar permiso' : 'Asignar permiso'}
          onConfirm={executeToggle}
        />
      </div>
    </TooltipProvider>
  );
}

interface DomainRowsProps {
  domain: CapabilityDomain;
  caps: Capability[];
  collapsed: boolean;
  onToggleDomain: () => void;
  grants: Set<string>;
  savingCell: string | null;
  onCellClick: (role: AppRole, cap: Capability) => void;
  grantCount: (cap: Capability) => number;
  isDestructive: boolean;
}

function DomainRows({ domain, caps, collapsed, onToggleDomain, grants, savingCell, onCellClick, grantCount, isDestructive }: DomainRowsProps) {
  return (
    <>
      <tr className="bg-muted/40 border-y sticky">
        <td colSpan={ROLES.length + 1} className="px-4 py-1.5">
          <button onClick={onToggleDomain} className="w-full flex items-center gap-2 text-left">
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            <span className={cn('text-xs font-semibold uppercase tracking-wider', isDestructive ? 'text-destructive' : 'text-foreground/80')}>
              {DOMAIN_LABELS[domain]}
            </span>
            <span className="text-[10px] text-muted-foreground">· {caps.length}</span>
            {isDestructive && <AlertTriangle className="w-3 h-3 text-destructive" />}
          </button>
        </td>
      </tr>
      {!collapsed && caps.map(cap => {
        const meta = CAPABILITY_META[cap];
        const labels = CAPABILITY_LABELS[cap];
        const totalGrants = grantCount(cap);
        return (
          <tr key={cap} className="border-b hover:bg-muted/20">
            <td className="px-4 py-2 align-top">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="cursor-help">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{labels}</span>
                      {meta?.masterOnly && <Lock className="w-3 h-3 text-purple-600 dark:text-purple-400" />}
                      {meta?.destructive && <AlertTriangle className="w-3 h-3 text-destructive" />}
                      {meta?.internal && <Wrench className="w-3 h-3 text-slate-500" />}
                      {totalGrants === 0 && (
                        <Badge variant="outline" className="h-4 px-1 text-[9px] uppercase tracking-wide text-muted-foreground">unused</Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono mt-0.5">{cap}</div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-sm space-y-1">
                  <p className="text-sm">{meta?.description ?? 'Sin descripción.'}</p>
                  {meta && (
                    <div className="text-[11px] flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>Dominio: <strong>{DOMAIN_LABELS[meta.domain]}</strong></span>
                      <span>Riesgo: <strong className={RISK_TONE[meta.risk]}>{RISK_LABEL[meta.risk]}</strong></span>
                      <span>Runtime: <strong>{RUNTIME_LABEL[meta.runtime]}</strong></span>
                    </div>
                  )}
                  {meta?.masterOnly && <p className="text-[11px] text-purple-600 dark:text-purple-400">Master-only.</p>}
                </TooltipContent>
              </Tooltip>
            </td>
            {ROLES.map(r => {
              const key = `${r}::${cap}`;
              const allowed = grants.has(key);
              const saving = savingCell === key;
              const masterOnlyViolation = meta?.masterOnly && r !== 'master' && allowed;
              // PR-MASTER-BYPASS-1 — Master = supercap implícita. Render
              // read-only: siempre permitido, no clicable, ícono Lock.
              if (r === 'master') {
                return (
                  <td key={r} className="px-2 py-2 text-center">
                    <div
                      role="img"
                      aria-label="Master: bypass implícito (no editable)"
                      title="Master tiene bypass implícito en has_permission(). No depende de role_permissions y no es editable."
                      className="inline-flex items-center justify-center w-7 h-7 rounded text-purple-600 dark:text-purple-400 opacity-90"
                    >
                      <Lock className="w-3.5 h-3.5" />
                    </div>
                  </td>
                );
              }
              return (
                <td key={r} className="px-2 py-2 text-center">
                  <button
                    onClick={() => onCellClick(r, cap)}
                    disabled={saving}
                    className={cn(
                      'inline-flex items-center justify-center w-7 h-7 rounded transition-colors',
                      'hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      saving && 'opacity-50',
                      masterOnlyViolation && 'ring-1 ring-amber-500/50',
                    )}
                    title={
                      masterOnlyViolation
                        ? `Inconsistencia: capability master-only asignada a ${ROLE_LABELS[r]}`
                        : allowed
                          ? `Revocar ${cap} a ${ROLE_LABELS[r]}`
                          : `Asignar ${cap} a ${ROLE_LABELS[r]}`
                    }
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CellMark allowed={allowed} />}
                  </button>
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}

function CellMark({ allowed }: { allowed: boolean }) {
  if (allowed) return <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
  return <span className="text-muted-foreground/50 text-base leading-none">—</span>;
}

interface FilterChipProps {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
  tone?: 'default' | 'destructive';
}

function FilterChip({ active, onClick, label, icon, tone = 'default' }: FilterChipProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] transition-colors',
        active
          ? tone === 'destructive'
            ? 'bg-destructive/15 text-destructive border-destructive/40'
            : 'bg-primary/15 text-primary border-primary/40'
          : 'border-border text-muted-foreground hover:bg-muted',
      )}
    >
      {icon}
      {label}
    </button>
  );
}
