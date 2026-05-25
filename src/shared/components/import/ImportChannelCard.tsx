/**
 * ImportChannelCard — Tarjeta grande de una vía de importación canónica.
 *
 * Reglas:
 * - Es la primera experiencia del hub: cada card es 100% interactiva.
 * - Sin tabs. Sin diagnóstico. Sin botones fake.
 * - Slots semánticos: título, qué acepta (chips), qué crea, cuándo usarlo, CTA.
 *
 * Ver `mem://logic/import/import-canon` y `docs/contracts/import-canon.md`.
 */
import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface ImportChannelCardProps {
  channelId: 'file' | 'web' | 'onedrive';
  icon: ReactNode;
  title: string;
  accepts: string[];
  creates: string;
  whenToUse: string;
  ctaLabel?: string;
  onSelect: () => void;
  badge?: string;
  disabled?: boolean;
}

export function ImportChannelCard({
  channelId,
  icon,
  title,
  accepts,
  creates,
  whenToUse,
  ctaLabel = 'Empezar',
  onSelect,
  badge,
  disabled,
}: ImportChannelCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      data-import-channel-card={channelId}
      className={cn(
        'group w-full text-left rounded-2xl border bg-card p-5 transition-all',
        'hover:border-primary/40 hover:shadow-md focus-visible:outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:opacity-50 disabled:cursor-not-allowed',
      )}
    >
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-2xl bg-primary/10 text-primary shrink-0 group-hover:bg-primary/15 transition-colors">
          {icon}
        </div>
        <div className="flex-1 min-w-0 space-y-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-foreground">{title}</h3>
            {badge && (
              <Badge variant="outline" className="text-[10px]">
                {badge}
              </Badge>
            )}
          </div>

          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Qué acepta
            </p>
            <div className="flex flex-wrap gap-1">
              {accepts.map((item) => (
                <span
                  key={item}
                  className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground text-[11px] font-medium"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Qué crea
              </p>
              <p className="text-xs text-foreground/90 leading-snug">{creates}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Cuándo usarlo
              </p>
              <p className="text-xs text-foreground/90 leading-snug">{whenToUse}</p>
            </div>
          </div>

          <div className="pt-1">
            <Button
              type="button"
              size="sm"
              className="pointer-events-none"
              tabIndex={-1}
            >
              {ctaLabel}
              <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
            </Button>
          </div>
        </div>
      </div>
    </button>
  );
}
