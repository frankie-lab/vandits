/**
 * @vandits/design-system/primitives/button — canonical Button primitive.
 *
 * Phase 3 scaffold: re-exports the existing shadcn Button from
 * `@/components/ui/button`. The implementation is already wired to design
 * tokens (variants/sizes read from CSS vars + density tokens).
 *
 * Future phases may relocate the implementation here. Consumers SHOULD
 * already import from this path to stabilize the public surface:
 *
 *   import { Button, buttonVariants } from '@/design-system/primitives/button';
 */
export { Button, buttonVariants } from '@/components/ui/button';
export type { ButtonProps } from '@/components/ui/button';
