/**
 * HeroImageSkeleton — Placeholder para una imagen hero antes de cargar.
 *
 * Prop funcional: `ratio` (16/9 | 4/3 | 1/1). Sin tamaños absolutos: el
 * componente ocupa 100% del contenedor y aplica aspect-ratio.
 *
 * Ver: mem://ui/skeleton-patterns
 */
import { AppSkeleton } from '@/shared/components/ui/AppSkeleton';

export interface HeroImageSkeletonProps {
  ratio?: '16/9' | '4/3' | '1/1';
  className?: string;
}

const RATIO_CLASS: Record<NonNullable<HeroImageSkeletonProps['ratio']>, string> = {
  '16/9': 'aspect-[16/9]',
  '4/3': 'aspect-[4/3]',
  '1/1': 'aspect-square',
};

export function HeroImageSkeleton({ ratio = '16/9', className }: HeroImageSkeletonProps) {
  return (
    <div className={`w-full ${RATIO_CLASS[ratio]} ${className ?? ''}`}>
      <AppSkeleton variant="card" width="100%" height="100%" className="rounded-none" />
    </div>
  );
}
