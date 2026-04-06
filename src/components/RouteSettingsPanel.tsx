import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Save, Loader2, Route as RouteIcon, RefreshCw, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RouteEngineSettings } from '@/components/RouteEngineSettings';
import { EngineConfig, DEFAULT_ENGINE_CONFIG } from '@/lib/route-engine';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';

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

export function RouteSettingsPanel({ onClose }: RouteSettingsPanelProps) {
  const { user } = useAuth();
  const [config, setConfig] = useState<EngineConfig>({ ...DEFAULT_ENGINE_CONFIG });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Services status
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [checkingServices, setCheckingServices] = useState(false);
  const [servicesChecked, setServicesChecked] = useState(false);

  // Load saved defaults
  useEffect(() => {
    if (!user) return;
    supabase.from('profiles')
      .select('route_engine_defaults')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if ((data as any)?.route_engine_defaults) {
          setConfig(prev => ({ ...prev, ...(data as any).route_engine_defaults }));
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
      toast.success('Configuración de rutas guardada');
      onClose();
    } catch (e) {
      toast.error('Error al guardar la configuración');
    } finally {
      setSaving(false);
    }
  };

  const connectedCount = services.filter(s => s.status === 'connected').length;
  const totalCount = services.length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-card rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden border"
      >
        {/* Header */}
        <div className="p-5 pb-3 flex items-center justify-between flex-shrink-0 border-b">
          <div className="flex items-center gap-2">
            <RouteIcon className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-base font-semibold">Motor de rutas</h2>
              <p className="text-xs text-muted-foreground">Configuración global y servicios conectados</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* ── Services Section ── */}
              <div className="space-y-3 mb-5">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Servicios del motor</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] gap-1"
                    onClick={checkServices}
                    disabled={checkingServices}
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
                  <div className="rounded-xl border border-dashed border-muted-foreground/30 p-4 text-center">
                    <p className="text-xs text-muted-foreground">
                      Pulsa "Verificar conexiones" para comprobar el estado de todos los servicios que usa el motor de rutas.
                    </p>
                  </div>
                )}

                {checkingServices && (
                  <div className="rounded-xl border border-dashed border-muted-foreground/30 p-6 text-center">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">Verificando servicios...</p>
                  </div>
                )}

                {servicesChecked && !checkingServices && (
                  <div className="space-y-2">
                    {/* Summary */}
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50">
                      <div className={`w-2 h-2 rounded-full ${connectedCount === totalCount ? 'bg-emerald-500' : connectedCount > 0 ? 'bg-amber-500' : 'bg-red-500'}`} />
                      <span className="text-xs font-medium">
                        {connectedCount}/{totalCount} servicios operativos
                      </span>
                    </div>

                    {/* Service list */}
                    {services.map((service) => (
                      <div
                        key={service.id}
                        className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
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
              </div>

              <Separator className="mb-5" />

              {/* ── Engine config section ── */}
              <p className="text-xs text-muted-foreground mb-4">
                Estos valores se aplicarán como predeterminados en todos los itinerarios nuevos. Puedes sobreescribirlos individualmente en cada ruta.
              </p>
              <RouteEngineSettings
                config={config}
                onChange={(partial) => setConfig(prev => ({ ...prev, ...partial }))}
              />
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 pt-3 border-t flex-shrink-0">
          <Button onClick={handleSave} disabled={saving || loading} className="w-full h-11 gap-2">
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Guardar configuración
              </>
            )}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
