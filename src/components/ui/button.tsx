import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Button — design system v1
 *
 * Variantes canónicas:
 *   default               primario sólido (bg-primary)
 *   secondary             muted/secondary
 *   outline               borde + transparente
 *   ghost                 sin chrome, hover muted
 *   link                  texto subrayado
 *   destructive           accion destructiva sólida
 *   cta                   gradiente primario para llamadas a accion principales
 *   toolbar               icono/accion en barra (ghost ajustado, hover sutil)
 *   filter-chip           chip seleccionable (estado neutro)
 *   filter-chip-active    chip seleccionado (primary)
 *   destructive-confirm   confirmacion destructiva (outline destructive)
 *
 * Tamanios (alineados con density tokens):
 *   xs    h-7    chips internos
 *   sm    h-control-sm (32px)  toolbar / chips
 *   md    h-control-md (36px)  default
 *   lg    h-control-lg (44px)  CTA / inputs panel
 *   xl    h-control-xl (56px)  filas grandes
 *   icon-sm  32x32
 *   icon-md  36x36
 *   icon-lg  44x44
 *
 * Aliases (compatibilidad):
 *   default = md, icon = icon-md
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-token-md text-sm font-medium ring-offset-background transition-colors duration-base ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        cta: "bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-sm hover:from-primary/90 hover:to-primary/70 hover:shadow-md",
        toolbar:
          "text-foreground/80 hover:text-foreground hover:bg-muted/70 data-[active=true]:bg-muted data-[active=true]:text-foreground",
        "filter-chip":
          "rounded-full border border-border bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
        "filter-chip-active":
          "rounded-full border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20",
        "destructive-confirm":
          "border border-destructive/40 bg-destructive/5 text-destructive hover:bg-destructive hover:text-destructive-foreground",
      },
      size: {
        xs: "h-7 px-2 text-xs rounded-token-sm [&_svg]:size-3.5",
        sm: "h-control-sm px-3 text-xs",
        md: "h-control-md px-4",
        lg: "h-control-lg px-6",
        xl: "h-control-xl px-8 text-base",
        "icon-sm": "h-control-sm w-control-sm",
        "icon-md": "h-control-md w-control-md",
        "icon-lg": "h-control-lg w-control-lg",
        // Aliases para retrocompatibilidad
        default: "h-control-md px-4",
        icon: "h-control-md w-control-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
