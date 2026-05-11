/**
 * Shared UI primitives barrel.
 *
 * Use these instead of re-implementing tooltips, empty states, spinners and
 * skeletons in each component. They are wired to the design-system tokens
 * (src/shared/styles/tokens/*.css) so every consumer stays consistent.
 */
export { AppTooltip } from './AppTooltip';
export type { AppTooltipProps } from './AppTooltip';
export { AppEmptyState } from './AppEmptyState';
export type { AppEmptyStateProps } from './AppEmptyState';
export { AppSpinner } from './AppSpinner';
export type { AppSpinnerProps } from './AppSpinner';
export { AppSkeleton } from './AppSkeleton';
export type { AppSkeletonProps } from './AppSkeleton';
