/**
 * InternalToolsPanel — Surface explícita para `run_internal_tooling`.
 *
 * Objetivo (PR-BACKOFFICE-UX-CANON-5):
 *   - Cerrar la capability huérfana `run_internal_tooling` con ownership UX claro.
 *   - Listar TODAS las edge tools internas disponibles, su estado de wiring,
 *     y desde dónde se invocan (UI o cron). Sin esconderlas en URLs sueltas.
 *
 * Inventario actual (rev. 2026-05-19):
 *   - create-test-users          → fixtures E2E (capability gated).
 *   - canonicalize-admin-areas   → ver `/admin/geography` · one-shot prominente.
 *   - purge-user                 → invocado desde `Gestión de usuarios`.
 *   - geocoding-job-tick         → cron interno; no UI directa.
 *
 * Toda nueva tool interna debe declararse aquí o quedarse fuera del backoffice
 * (script directo). NO se permiten edges runtime sin ownership UX.
 */
import { useState } from 'react';
import { Terminal, Play, Loader2, ExternalLink, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { EffectBadge } from '@/shared/components/ui/effect-badge';

interface ToolSpec {
  id: string;
  title: string;
  description: string;
  /** Where the tool is operated from. */
  ownership:
    | { kind: 'panel'; label: string; path?: string }
    | { kind: 'inline'; label: string }
    | { kind: 'cron'; label: string }
    | { kind: 'here'; runner: () => Promise<void> };
  effect: 'immediate' | 'deferred' | 'future-only';
}

export function InternalToolsPanel() {
  const [busy, setBusy] = useState<string | null>(null);

  const runCreateTestUsers = async () => {
    setBusy('create-test-users');
    try {
      const { error } = await supabase.functions.invoke('create-test-users', { body: {} });
      if (error) throw error;
      toast.success('create-test-users completado');
    } catch (e) {
      console.error('[internal-tools]', e);
      toast.error('No se pudo ejecutar create-test-users');
    } finally {
      setBusy(null);
    }
  };

  const tools: ToolSpec[] = [
    {
      id: 'create-test-users',
      title: 'create-test-users',
      description: 'Crea fixtures E2E (sandbox-agent + cuentas auxiliares). Solo entornos de prueba.',
      ownership: { kind: 'here', runner: runCreateTestUsers },
      effect: 'immediate',
    },
    {
      id: 'canonicalize-admin-areas',
      title: 'canonicalize-admin-areas',
      description: 'Deduplica y re-puntera admin_areas. One-shot destructivo.',
      ownership: { kind: 'panel', label: 'Mantenimiento geográfico', path: '/admin/geography' },
      effect: 'deferred',
    },
    {
      id: 'purge-user',
      title: 'purge-user',
      description: 'Borra usuario y todos sus datos derivados. Last-master guard.',
      ownership: { kind: 'panel', label: 'Gestión de usuarios' },
      effect: 'immediate',
    },
    {
      id: 'geocoding-job-tick',
      title: 'geocoding-job-tick',
      description: 'Procesa lotes pendientes de geocoding. Disparado por cron interno.',
      ownership: { kind: 'cron', label: 'cron interno · cada minuto' },
      effect: 'deferred',
    },
    {
      id: 'image-recovery-job-tick',
      title: 'image-recovery-job-tick',
      description: 'Procesa lotes de recuperación de imágenes. Disparado por cron.',
      ownership: { kind: 'cron', label: 'cron interno' },
      effect: 'deferred',
    },
  ];

  return (
    <div
      data-internal-registry="v1"
      className="flex-1 min-h-0 flex flex-col gap-3 overflow-y-auto bg-muted/30 p-4"
    >
      {/* Registry table — sin card introductoria; el PanelEffectHeader ya marca
          "internal / read-only" arriba. Densidad técnica deliberada. */}
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 px-1 flex items-center gap-2">
        <span>Tool registry</span>
        <span className="font-mono">· {tools.length} entries</span>
      </div>
      <ul className="rounded border border-border/60 bg-card/60 divide-y divide-border/50 font-mono text-[11px]">
        {tools.map((t) => (
          <li key={t.id} className="px-3 py-2 hover:bg-muted/40">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="font-semibold text-foreground">{t.title}</code>
                  <EffectBadge kind={t.effect} />
                </div>
                <p className="font-sans text-[11px] text-muted-foreground mt-1 leading-snug">{t.description}</p>
                <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground/80">
                  <Info className="w-3 h-3" />
                  <span className="font-sans">owner:</span>
                  {t.ownership.kind === 'panel' && (
                    t.ownership.path ? (
                      <Link to={t.ownership.path} className="font-sans text-primary hover:underline inline-flex items-center gap-1">
                        {t.ownership.label} <ExternalLink className="w-2.5 h-2.5" />
                      </Link>
                    ) : (
                      <span className="font-sans text-foreground/80">{t.ownership.label}</span>
                    )
                  )}
                  {t.ownership.kind === 'inline' && <span className="font-sans text-foreground/80">{t.ownership.label}</span>}
                  {t.ownership.kind === 'cron' && <span className="font-sans text-foreground/80">{t.ownership.label}</span>}
                  {t.ownership.kind === 'here' && <span className="font-sans text-foreground/80">runnable here</span>}
                </div>
              </div>
              {t.ownership.kind === 'here' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => t.ownership.kind === 'here' && t.ownership.runner()}
                  disabled={busy === t.id}
                  className="font-sans text-xs shrink-0"
                >
                  {busy === t.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Play className="w-3 h-3 mr-1" />}
                  Ejecutar
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="text-[10px] text-muted-foreground/70 px-1 leading-snug">
        Catálogo técnico interno. Toda edge tool runtime debe registrarse aquí o quedarse fuera
        del BackOffice como script directo.
      </p>
    </div>
  );
}
