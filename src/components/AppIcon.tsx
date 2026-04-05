import React, { lazy, Suspense } from 'react';
import { LucideProps } from 'lucide-react';
import dynamicIconImports from 'lucide-react/dynamicIconImports';
import { useIconLibrary, IconLibrary } from '@/contexts/IconLibraryContext';

// Mapping from canonical (lucide) icon names to other library CDN URLs
// For non-lucide libraries we render an SVG from a CDN sprite
const CDN_BASES: Record<Exclude<IconLibrary, 'lucide'>, string> = {
  fontawesome: 'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6/svgs/solid',
  heroicons: 'https://cdn.jsdelivr.net/npm/heroicons@2/24/outline',
  phosphor: 'https://cdn.jsdelivr.net/npm/@phosphor-icons/core@2/assets/regular',
  tabler: 'https://cdn.jsdelivr.net/npm/@tabler/icons@3/icons/outline',
};

// Map lucide icon names → equivalent names in other libraries
const CROSS_LIB_MAP: Record<string, Partial<Record<Exclude<IconLibrary, 'lucide'>, string>>> = {
  'footprints': { fontawesome: 'shoe-prints', heroicons: 'user', phosphor: 'footprints', tabler: 'walk' },
  'bike': { fontawesome: 'bicycle', heroicons: 'truck', phosphor: 'bicycle', tabler: 'bike' },
  'car': { fontawesome: 'car', heroicons: 'truck', phosphor: 'car', tabler: 'car' },
  'car-front': { fontawesome: 'car', heroicons: 'truck', phosphor: 'car', tabler: 'car' },
  'caravan': { fontawesome: 'caravan', heroicons: 'truck', phosphor: 'van', tabler: 'camper' },
  'sailboat': { fontawesome: 'sailboat', heroicons: 'paper-airplane', phosphor: 'sailboat', tabler: 'sailboat' },
  'plane': { fontawesome: 'plane', heroicons: 'paper-airplane', phosphor: 'airplane', tabler: 'plane' },
  'bus-front': { fontawesome: 'bus', heroicons: 'truck', phosphor: 'bus', tabler: 'bus' },
  'train': { fontawesome: 'train', heroicons: 'truck', phosphor: 'train-simple', tabler: 'train' },
  'ship': { fontawesome: 'ship', heroicons: 'paper-airplane', phosphor: 'boat', tabler: 'ship' },
  'tram-front': { fontawesome: 'train-tram', heroicons: 'truck', phosphor: 'train', tabler: 'tram' },
  'map-pin': { fontawesome: 'location-dot', heroicons: 'map-pin', phosphor: 'map-pin', tabler: 'map-pin' },
  'compass': { fontawesome: 'compass', heroicons: 'map', phosphor: 'compass', tabler: 'compass' },
  'mountain': { fontawesome: 'mountain', heroicons: 'globe-alt', phosphor: 'mountains', tabler: 'mountain' },
  'star': { fontawesome: 'star', heroicons: 'star', phosphor: 'star', tabler: 'star' },
  'home': { fontawesome: 'house', heroicons: 'home', phosphor: 'house', tabler: 'home' },
  'shuffle': { fontawesome: 'shuffle', heroicons: 'arrows-right-left', phosphor: 'shuffle', tabler: 'arrows-shuffle' },
  'anchor': { fontawesome: 'anchor', heroicons: 'link', phosphor: 'anchor', tabler: 'anchor' },
  'dollar-sign': { fontawesome: 'dollar-sign', heroicons: 'currency-dollar', phosphor: 'currency-dollar', tabler: 'currency-dollar' },
  'clock': { fontawesome: 'clock', heroicons: 'clock', phosphor: 'clock', tabler: 'clock' },
  'sofa': { fontawesome: 'couch', heroicons: 'home', phosphor: 'armchair', tabler: 'armchair' },
  'sunrise': { fontawesome: 'sun', heroicons: 'sun', phosphor: 'sun-horizon', tabler: 'sunrise' },
  'shield': { fontawesome: 'shield', heroicons: 'shield-check', phosphor: 'shield', tabler: 'shield' },
  'settings': { fontawesome: 'gear', heroicons: 'cog-6-tooth', phosphor: 'gear', tabler: 'settings' },
  'eye': { fontawesome: 'eye', heroicons: 'eye', phosphor: 'eye', tabler: 'eye' },
  'eye-off': { fontawesome: 'eye-slash', heroicons: 'eye-slash', phosphor: 'eye-slash', tabler: 'eye-off' },
  'camera': { fontawesome: 'camera', heroicons: 'camera', phosphor: 'camera', tabler: 'camera' },
  'search': { fontawesome: 'magnifying-glass', heroicons: 'magnifying-glass', phosphor: 'magnifying-glass', tabler: 'search' },
  'globe': { fontawesome: 'globe', heroicons: 'globe-alt', phosphor: 'globe', tabler: 'world' },
  'globe-2': { fontawesome: 'globe', heroicons: 'globe-alt', phosphor: 'globe', tabler: 'world' },
};

interface AppIconProps extends Omit<LucideProps, 'ref'> {
  /** Lucide icon name in kebab-case */
  name: string;
  /** Override library for this specific icon */
  library?: IconLibrary;
}

// Lucide dynamic renderer
function LucideIcon({ name, ...props }: { name: string } & Omit<LucideProps, 'ref'>) {
  const importKey = name as keyof typeof dynamicIconImports;
  if (!dynamicIconImports[importKey]) {
    // Fallback to map-pin
    const Fallback = lazy(dynamicIconImports['map-pin']);
    return (
      <Suspense fallback={<span className={props.className} />}>
        <Fallback {...props} />
      </Suspense>
    );
  }
  const Icon = lazy(dynamicIconImports[importKey]);
  return (
    <Suspense fallback={<span className={props.className} />}>
      <Icon {...props} />
    </Suspense>
  );
}

// CDN-based SVG icon for non-lucide libraries
function CdnIcon({ library, name, className, size = 24, color }: {
  library: Exclude<IconLibrary, 'lucide'>;
  name: string;
  className?: string;
  size?: number;
  color?: string;
}) {
  const mappedName = CROSS_LIB_MAP[name]?.[library] || name;
  const base = CDN_BASES[library];
  const src = `${base}/${mappedName}.svg`;

  return (
    <img
      src={src}
      alt={mappedName}
      width={size}
      height={size}
      className={className}
      style={{
        filter: color ? undefined : 'var(--icon-filter, none)',
        width: size,
        height: size,
        display: 'inline-block',
      }}
      loading="lazy"
      onError={(e) => {
        // On error, hide the broken image
        (e.target as HTMLImageElement).style.display = 'none';
      }}
    />
  );
}

export function AppIcon({ name, library: overrideLibrary, size, className, color, ...rest }: AppIconProps) {
  const { iconLibrary } = useIconLibrary();
  const activeLib = overrideLibrary || iconLibrary;

  if (activeLib === 'lucide') {
    return <LucideIcon name={name} size={size} className={className} color={color} {...rest} />;
  }

  // Parse size from className if not explicit
  const resolvedSize = (typeof size === 'number' ? size : undefined) || (className?.includes('w-4') ? 16 : className?.includes('w-5') ? 20 : className?.includes('w-6') ? 24 : 24);

  return <CdnIcon library={activeLib} name={name} className={className} size={resolvedSize} color={color} />;
}

export default AppIcon;
