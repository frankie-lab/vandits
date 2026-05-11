/**
 * Hook único para leer el valor *vigente* de un token:
 *   draft[path] ?? published[path] ?? leaf.baseValue
 *
 * Se suscribe al store de edición, así cualquier override en vivo
 * (durante editMode) re-renderiza el row/preview que lo use.
 */
import { useDesignSystemEdit } from '@/design-system/runtime/edit-mode-store';
import { getLeaf } from '@/design-system/runtime/token-registry';

export function useResolvedTokenValue(path?: string): string | number | undefined {
  const draftVal = useDesignSystemEdit((s) => (path ? s.draft[path] : undefined));
  const publishedVal = useDesignSystemEdit((s) => (path ? s.published[path] : undefined));
  if (!path) return undefined;
  if (draftVal !== undefined) return draftVal;
  if (publishedVal !== undefined) return publishedVal;
  return getLeaf(path)?.baseValue;
}
