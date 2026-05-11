/**
 * AppTooltip — Tooltip canónico para TODA la app.
 *
 * Envoltorio de Radix Tooltip (vía shadcn) que aplica los tokens de
 * tipografía/motion/z-index del sistema. Misma flecha, sombra, radio y
 * espaciado en cualquier superficie (toolbar, panel, lista, mapa).
 *
 * Para tooltips de markers Leaflet, ver `src/components/map/map-tooltip.ts`
 * (usa las mismas vars `--poi-tooltip-bg/fg`).
 *
 * Uso:
 *   <AppTooltip content="Abrir filtros">
 *     <Button variant="ghost" size="icon"><Filter /></Button>
 *   </AppTooltip>
 */
import * as React from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface AppTooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  /** ms before the tooltip appears. Default 200. */
  delayDuration?: number;
  /** Render asChild so the trigger inherits the wrapped element semantics. */
  asChild?: boolean;
  className?: string;
  /** Disable the tooltip without unmounting children. */
  disabled?: boolean;
}

export function AppTooltip({
  content,
  children,
  side = 'top',
  align = 'center',
  delayDuration = 200,
  asChild = true,
  className,
  disabled,
}: AppTooltipProps) {
  if (disabled || !content) {
    return <>{children}</>;
  }
  return (
    <TooltipProvider delayDuration={delayDuration}>
      <Tooltip>
        <TooltipTrigger asChild={asChild}>{children}</TooltipTrigger>
        <TooltipContent
          side={side}
          align={align}
          className={cn(
            // Typography from token scale
            'text-caption font-medium',
            // Density / radius from tokens
            'rounded-token-sm',
            // Visual = card surface (auto adapts to dark mode via semantic tokens)
            'bg-popover text-popover-foreground border border-border shadow-medium',
            // Spacing
            'px-2.5 py-1.5 max-w-[260px]',
            className,
          )}
        >
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
