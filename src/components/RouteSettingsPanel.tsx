import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { X, Save, Loader2, Route as RouteIcon, RefreshCw, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RouteEngineSettings } from '@/components/RouteEngineSettings';
import { EngineConfig, DEFAULT_ENGINE_CONFIG } from '@/lib/route-engine';
import { useAuth } from '@/domains/identity';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { EffectBadge } from '@/shared/components/ui/effect-badge';

interface ServiceStatus {
  id: string;
  name: string;
  description: string;
  icon: string;
  status: 'connected' | 'error' | 'not_configured';
  message: string;
  latencyMs?: number;
}

interface RouteSettingsPanelProps {
  onClose: () => void;
}

function ServiceStatusIcon({ status }: { status: ServiceStatus['status'] }) {
  switch (status) {
    case 'connected':
      return <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />;
    case 'error':
      return <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />;
    case 'not_configured':
      return <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />;
  }
}

function ServiceStatusBadge({ status }: { status: ServiceStatus['status'] }) {
  switch (status) {
    case 'connected':
      return <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-emerald-500/10 text-emerald-600 border-emerald-500/30">Conectado</Badge>;
    case 'error':
      return <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-red-500/10 text-red-600 border-red-500/30">Error</Badge>;
    case 'not_configured':
      return <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-amber-500/10 text-amber-600 border-amber-500/30">No configurado</Badge>;
  }
}

export function RouteSettingsPanelContent() {
  const { user } = useAuth();
  const [config, setConfig] = useState<EngineConfig>({ ...DEFAULT_ENGINE_CONFIG });
  const [override, setOverride] = useState<Partial<EngineConfig> | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Services status
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [checkingServices, setCheckingServices] = useState(false);
  const [servicesChecked, setServicesChecked] = useState(false);

  // Load saved defaults (ESTE usuario — NO existe storage global)
  useEffect(() => {
    if (!user) return;
    supabase.from('profiles')
      .select('route_engine_defaults')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        const raw = (data as any)?.route_engine_defaults as Partial<EngineConfig> | null;
        if (raw) {
          setOverride(raw);
          setConfig(prev => ({ ...prev, ...raw }));
        } else {
          setOverride(null);
        }
        setLoading(false);
      });
  }, [user]);

  const checkServices = async () => {
    setCheckingServices(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-route-services');
      if (error) throw error;
      setServices(data?.services || []);
      setServicesChecked(true);
    } catch (e) {
      toast.error('Error al verificar servicios');
    } finally {
      setCheckingServices(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('profiles')
        .update({ route_engine_defaults: config } as any)
        .eq('id', user.id);
      if (error) throw error;
      localStorage.setItem('vandits-route-engine-defaults', JSON.stringify(config));
      setOverride(config);
      toast.success('Tus defaults del motor de rutas se han guardado');
    } catch (e) {
      toast.error('Error al guardar la configuración');
    } finally {
      setSaving(false);
    }
  };

  const handleClearOverride = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('profiles')
        .update({ route_engine_defaults: null } as any)
        .eq('id', user.id);
      if (error) throw error;
      localStorage.removeItem('vandits-route-engine-defaults');
      setOverride(null);
      setConfig({ ...DEFAULT_ENGINE_CONFIG });
      toast.success('Override eliminado — vuelves al default del sistema');
    } catch {
      toast.error('No se pudo eliminar el override');
    } finally {
      setSaving(false);
    }
  };

  // Stack resuelto: default → tu override → efectivo (lo que ve calculate-route para TI)
  const stackDiff = useMemo(() => {
    if (!override) return [] as Array<{ key: keyof EngineConfig; def: unknown; ov: unknown }>;
    const keys = Object.keys(DEFAULT_ENGINE_CONFIG) as Array<keyof EngineConfig>;
    return keys
      .filter(k => override[k] !== undefined && override[k] !== DEFAULT_ENGINE_CONFIG[k])
      .map(k => ({ key: k, def: DEFAULT_ENGINE_CONFIG[k], ov: override[k] }));
  }, [override]);

  const connectedCount = services.filter(s => s.status === 'connected').length;
  const totalCount = services.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">Motor de rutas — mis defaults</h3>
          <p className="text-xs text-muted-foreground truncate">Override personal · stack default → tú → por-ruta</p>
        </div>
        <div className="flex gap-2 shrink-0">
          {override && (
            <Button size="sm" variant="ghost" onClick={handleClearOverride} disabled={saving} className="text-xs">
              Quitar mi override
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />}
            Guardar
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-6">
        {/* ──────────────────────────────────────────────────────────
            SECCIÓN A · CONFIGURACIÓN PERSISTENTE
            Único bloque que escribe en BD (profiles.route_engine_defaults).
            (PR-BACKOFFICE-CLEANUP-REALITY-1 — split visual)
            ────────────────────────────────────────────────────────── */}
        <section aria-labelledby="route-config-heading" className="space-y-3">
          <div className="flex items-center justify-between border-b border-border/40 pb-1">
            <h4 id="route-config-heading" className="text-[10px] font-semibold uppercase tracking-wider text-foreground">
              Configuración persistente
            </h4>
            <EffectBadge kind="immediate" detail="Próximos cálculos de ruta del usuario actual" />
          </div>

          {stackDiff.length > 0 && (
            <details className="text-[10px] rounded border border-border/60 bg-muted/20 px-2 py-1.5">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Ver diff de tu override ({stackDiff.length})
              </summary>
              <ul className="mt-1.5 space-y-0.5 font-mono">
                {stackDiff.map(d => (
                  <li key={String(d.key)} className="flex items-center gap-2">
                    <span className="text-foreground">{String(d.key)}</span>
                    <span className="text-muted-foreground/60">{String(d.def)}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="text-primary">{String(d.ov)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <RouteEngineSettings
            config={config}
            onChange={(partial) => setConfig(prev => ({ ...prev, ...partial }))}
          />
        </section>

        {/* ──────────────────────────────────────────────────────────
            SECCIÓN B · DIAGNÓSTICO Y VERIFICACIÓN
            Read-only. No escribe. Solo lectura de salud de servicios.
            (PR-BACKOFFICE-CLEANUP-REALITY-1 — split visual)
            ────────────────────────────────────────────────────────── */}
        <section aria-labelledby="route-diag-heading" className="space-y-3">
          <div className="flex items-center justify-between border-b border-border/40 pb-1">
            <div className="flex items-center gap-1.5">
              <h4 id="route-diag-heading" className="text-[10px] font-semibold uppercase tracking-wider text-foreground">
                Diagnóstico y verificación
              </h4>
              <span className="px-1 py-px rounded text-[8.5px] font-semibold uppercase tracking-wider bg-muted text-muted-foreground border border-border/60">
                DIAG
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px] gap-1"
              onClick={checkServices}
              disabled={checkingServices}
              title="Diagnóstico (read-only): comprueba el estado de los servicios sin modificar nada."
            >
              {checkingServices ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              {servicesChecked ? 'Verificar de nuevo' : 'Verificar conexiones'}
            </Button>
          </div>

          {!servicesChecked && !checkingServices && (
            <p className="text-[10px] text-muted-foreground px-1">
              Acción read-only. Comprueba el estado de los servicios externos del motor sin modificar nada.
            </p>
          )}

          {checkingServices && (
            <div className="rounded-lg border border-dashed border-muted-foreground/30 p-4 text-center">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mx-auto mb-1.5" />
              <p className="text-[10px] text-muted-foreground">Verificando servicios...</p>
            </div>
          )}

          {servicesChecked && !checkingServices && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/50 text-xs">
                <div className={`w-2 h-2 rounded-full ${connectedCount === totalCount ? 'bg-emerald-500' : connectedCount > 0 ? 'bg-amber-500' : 'bg-red-500'}`} />
                <span className="font-medium">{connectedCount}/{totalCount} servicios operativos</span>
              </div>

              {services.map((service) => (
                <div
                  key={service.id}
                  className="flex items-start gap-2.5 px-3 py-2 rounded-md border bg-card"
                >
                  <span className="text-base mt-0.5">{service.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-xs font-medium truncate">{service.name}</span>
                      <ServiceStatusBadge status={service.status} />
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-tight">{service.description}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                      <ServiceStatusIcon status={service.status} />
                      {service.message}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export function RouteSettingsPanel({ onClose }: RouteSettingsPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-foreground/50 z-modal flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-card rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden border"
      >
        <div className="p-5 pb-3 flex items-center justify-between flex-shrink-0 border-b">
          <div className="flex items-center gap-2">
            <RouteIcon className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-base font-semibold">Motor de rutas — mis defaults</h2>
              <p className="text-xs text-muted-foreground">Override personal · stack default→tú→por-ruta</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <RouteSettingsPanelContent />
      </motion.div>
    </motion.div>
  );
}
