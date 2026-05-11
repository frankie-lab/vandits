/**
 * EditableTokenSurface — wrapper único.
 *
 *  - editMode=OFF : renderiza `children` tal cual (decorativo).
 *  - editMode=ON  : envuelve `children` en un `<button>` con Popover que abre
 *    el editor del token (HEX/RGB/HSL para colores, slider/select para el resto).
 *
 * Acepta un token (path dotted). Lee el `TokenLeaf` del registry para saber el
 * `type` y `baseValue`. Usa `setDraft` del store para emitir cambios.
 */
import { useState, type ReactNode } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/design-system/primitives/popover';
import { useDesignSystemEdit } from '@/design-system/runtime/edit-mode-store';
import { getLeaf } from '@/design-system/runtime/token-registry';
import { TokenValueEditor } from './TokenEditors';
import { useResolvedTokenValue } from './useResolvedTokenValue';

interface Props {
  /** Dotted path del token a editar. Si falta o no existe, no se envuelve. */
  path?: string;
  /** Etiqueta visible en el popover (ej.: "Modo claro"). */
  label?: string;
  /** Para `aria-label` y `title`. */
  title?: string;
  /** Decorativo si !editMode o sin path. */
  children: ReactNode;
  /** className aplicado al botón trigger (envoltorio). */
  className?: string;
  /** Forzar fallback no-editable (e.g. preview meramente ilustrativo). */
  disabled?: boolean;
}

export function EditableTokenSurface({
  path,
  label,
  title,
  children,
  className,
  disabled,
}: Props) {
  const setDraft = useDesignSystemEdit((s) => s.setDraft);
  const value = useResolvedTokenValue(path);
  const [open, setOpen] = useState(false);

  const leaf = path ? getLeaf(path) : undefined;

  if (!leaf || disabled) {
    return <>{children}</>;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={title ?? `Editar ${label ?? leaf.path}`}
          aria-label={title ?? `Editar ${label ?? leaf.path}`}
          className={
            'group/edit relative cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-token-sm transition-shadow hover:ring-2 hover:ring-ring/40 ' +
            (className ?? '')
          }
          onClick={(e) => {
            // Evita que el toggle expandir/colapsar del row reciba el click.
            e.stopPropagation();
          }}
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[22rem]"
        align="end"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-3">
          {label && (
            <div className="text-xs font-medium text-muted-foreground">{label}</div>
          )}
          <TokenValueEditor
            type={leaf.type}
            value={value ?? leaf.baseValue}
            baseValue={leaf.baseValue}
            onChange={(next) => setDraft(leaf.path, next)}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
