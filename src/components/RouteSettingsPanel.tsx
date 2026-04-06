import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Save, Loader2, Route as RouteIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RouteEngineSettings } from '@/components/RouteEngineSettings';
import { EngineConfig, DEFAULT_ENGINE_CONFIG } from '@/lib/route-engine';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface RouteSettingsPanelProps {
  onClose: () => void;
}

export function RouteSettingsPanel({ onClose }: RouteSettingsPanelProps) {
  const { user } = useAuth();
  const [config, setConfig] = useState<EngineConfig>({ ...DEFAULT_ENGINE_CONFIG });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

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
              <p className="text-xs text-muted-foreground">Configuración global para todos los itinerarios</p>
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
