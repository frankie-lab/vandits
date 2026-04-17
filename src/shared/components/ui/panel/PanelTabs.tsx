/**
 * PanelTabs — Wrapper sobre Radix Tabs con estilos uniformes.
 *
 * Soporta agrupación visual (Fuentes/Biblioteca) sin romper la accesibilidad
 * de Radix: internamente cada `PanelTabs.Group` renderiza su propio `TabsList`
 * pero TODOS los grupos viven dentro del MISMO `Tabs` controlado, por lo que
 * un único valor activo cruza grupos (igual que el patrón ya validado en
 * `ImportedContentPanel` original).
 *
 * API:
 *   <PanelTabs value={...} onValueChange={...}>
 *     <PanelTabs.Group label="Fuentes">
 *       <PanelTabs.Trigger value="upload" icon={<Upload/>}>Archivos</PanelTabs.Trigger>
 *     </PanelTabs.Group>
 *     <PanelTabs.Content value="upload">...</PanelTabs.Content>
 *   </PanelTabs>
 */
import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

interface PanelTabsRootProps extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root> {
  children: React.ReactNode;
}

function PanelTabsRoot({ className, children, ...props }: PanelTabsRootProps) {
  return (
    <TabsPrimitive.Root
      className={cn('flex flex-col h-full min-h-0', className)}
      {...props}
    >
      {children}
    </TabsPrimitive.Root>
  );
}

interface PanelTabsGroupProps {
  /** Label visible de la agrupación (uppercase pequeña). */
  label?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * Grupo visual de tabs. Renderiza su propio TabsList pero comparte estado
 * con el Root padre. Útil para jerarquías como Fuentes vs Biblioteca.
 */
function PanelTabsGroup({ label, className, children }: PanelTabsGroupProps) {
  // Calculamos columnas según número de hijos para grid uniforme.
  const count = React.Children.count(children);
  const gridCols = count <= 1 ? 'grid-cols-1' : count === 2 ? 'grid-cols-2' : count === 3 ? 'grid-cols-3' : 'grid-cols-4';

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
          {label}
        </p>
      )}
      <TabsPrimitive.List
        className={cn(
          'grid w-full bg-muted/60 p-1 rounded-[var(--panel-tabs-radius)]',
          'h-auto', // se ajusta al contenido (40px efectivos por trigger)
          gridCols,
        )}
      >
        {children}
      </TabsPrimitive.List>
    </div>
  );
}

interface PanelTabsHeaderProps {
  className?: string;
  children: React.ReactNode;
}

/**
 * Wrapper opcional que agrupa varios `PanelTabs.Group` con el padding y
 * separador inferior canónicos. Si tu panel solo tiene un grupo, puedes
 * omitir Header y poner el Group directo.
 */
function PanelTabsHeader({ className, children }: PanelTabsHeaderProps) {
  return (
    <div
      className={cn(
        'shrink-0 px-[var(--panel-padding-x)] pt-3 pb-2 border-b bg-muted/30 space-y-2',
        className,
      )}
    >
      {children}
    </div>
  );
}

interface PanelTabsTriggerProps extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> {
  icon?: React.ReactNode;
}

function PanelTabsTrigger({ className, icon, children, ...props }: PanelTabsTriggerProps) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap',
        'rounded-[calc(var(--panel-tabs-radius)-4px)] px-3 text-xs font-medium',
        'h-[calc(var(--panel-tabs-h)-8px)]', // 32px (40 - 8 padding del list)
        'ring-offset-background transition-all',
        'data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
        'text-muted-foreground hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </TabsPrimitive.Trigger>
  );
}

const PanelTabsContent = TabsPrimitive.Content;

export const PanelTabs = Object.assign(PanelTabsRoot, {
  Header: PanelTabsHeader,
  Group: PanelTabsGroup,
  Trigger: PanelTabsTrigger,
  Content: PanelTabsContent,
});
