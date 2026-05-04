import React, { useMemo } from 'react';
import { useLocationsStore } from '@/domains/content';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { PLACE_TYPE_LABELS, PlaceType } from '@/types/location';
import { getEffectivePlaceType } from '@/domains/content/lib/effective-place-type';
import { matchesLocationFilters } from '@/domains/content/lib/location-filtering';
import { 
 Building2, 
 Mountain, 
 Landmark, 
 Eye, 
 Waves, 
 Trees, 
 GraduationCap, 
 UtensilsCrossed,
 Hotel,
 Church,
 Castle,
 Palmtree,
 MapPin,
 Route
} from 'lucide-react';

const PLACE_TYPE_ICONS: Record<PlaceType, React.ReactNode> = {
 city: <Building2 className="w-3.5 h-3.5" />,
 monument: <Landmark className="w-3.5 h-3.5" />,
 geographic_feature: <Mountain className="w-3.5 h-3.5" />,
 viewpoint: <Eye className="w-3.5 h-3.5" />,
 beach: <Waves className="w-3.5 h-3.5" />,
 mountain: <Mountain className="w-3.5 h-3.5" />,
 park: <Trees className="w-3.5 h-3.5" />,
 museum: <GraduationCap className="w-3.5 h-3.5" />,
 restaurant: <UtensilsCrossed className="w-3.5 h-3.5" />,
 hotel: <Hotel className="w-3.5 h-3.5" />,
 historical_site: <Castle className="w-3.5 h-3.5" />,
 religious_site: <Church className="w-3.5 h-3.5" />,
 natural_reserve: <Palmtree className="w-3.5 h-3.5" />,
 route: <Route className="w-3.5 h-3.5" />,
 other: <MapPin className="w-3.5 h-3.5" />,
};

const PLACE_TYPE_COLORS: Record<PlaceType, string> = {
 city: 'bg-blue-100 text-blue-700 hover:bg-blue-200',
 monument: 'bg-amber-100 text-amber-700 hover:bg-amber-200',
 geographic_feature: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200',
 viewpoint: 'bg-purple-100 text-purple-700 hover:bg-purple-200',
 beach: 'bg-cyan-100 text-cyan-700 hover:bg-cyan-200',
 mountain: 'bg-stone-100 text-stone-700 hover:bg-stone-200',
 park: 'bg-green-100 text-green-700 hover:bg-green-200',
 museum: 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200',
 restaurant: 'bg-orange-100 text-orange-700 hover:bg-orange-200',
 hotel: 'bg-rose-100 text-rose-700 hover:bg-rose-200',
 historical_site: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200',
 religious_site: 'bg-violet-100 text-violet-700 hover:bg-violet-200',
 natural_reserve: 'bg-teal-100 text-teal-700 hover:bg-teal-200',
 route: 'bg-lime-100 text-lime-700 hover:bg-lime-200',
 other: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
};

export function PlaceTypeFilter() {
 const { getAllLocations, filters, setFilters } = useLocationsStore();

 const allLocations = getAllLocations();

  const placeTypeCounts = useMemo(() => {
  if (allLocations.length === 0) return new Map<PlaceType, number>();

  // Norma "filter axes": esta faceta cuenta sobre los puntos que pasan
  // los OTROS ejes activos (Geo / Tags / Búsqueda / Legacy), autoexcluyéndose.
  const counts = new Map<PlaceType, number>();
  allLocations.forEach(loc => {
  if (!matchesLocationFilters(loc, filters, { includePlaceType: false })) return;
  const effective = getEffectivePlaceType(loc);
  if (effective) {
  counts.set(effective, (counts.get(effective) || 0) + 1);
  }
  });
  return counts;
  }, [allLocations, filters]);

 const sortedTypes = useMemo(() => {
 return Array.from(placeTypeCounts.entries())
 .sort((a, b) => b[1] - a[1])
 .map(([type]) => type);
 }, [placeTypeCounts]);

 const selectType = (type: PlaceType) => {
 if (filters.placeType === type) {
 setFilters({ ...filters, placeType: undefined });
 } else {
 setFilters({ ...filters, placeType: type });
 }
 };

 if (sortedTypes.length === 0) {
 return (
 <div className="text-center py-4 space-y-2">
 <div className="text-sm text-muted-foreground">
 No hay tipos de lugar asignados
 </div>
 <p className="text-xs text-muted-foreground/70">
 Los tipos se asignan automáticamente al enriquecer las ubicaciones con IA
 </p>
 </div>
 );
 }

 return (
 <div className="flex flex-wrap gap-1.5">
 {sortedTypes.map(type => {
 const count = placeTypeCounts.get(type) || 0;
 const isSelected = filters.placeType === type;
 
 return (
 <button
 key={type}
 onClick={() => selectType(type)}
 className={cn(
 "inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-all",
 isSelected
 ? "ring-2 ring-primary ring-offset-1 font-medium"
 : PLACE_TYPE_COLORS[type]
 )}
 >
 {PLACE_TYPE_ICONS[type]}
 <span>{PLACE_TYPE_LABELS[type]}</span>
 <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 ml-0.5 border-current/30">
 {count}
 </Badge>
 </button>
 );
 })}
 </div>
 );
}