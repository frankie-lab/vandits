import React, { useMemo, useState } from 'react';
import { Tag, ChevronRight, ChevronDown, Hash, MapPin, Sparkles, Info, TreePine, Landmark, Mountain, ShieldCheck, Camera, UtensilsCrossed, Building2, Church } from 'lucide-react';
import { useLocationsStore } from '@/store/locations-store';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

interface TagNode {
 name: string;
 count: number;
 totalCount: number;
 isGeographic?: boolean;
}

interface TagCategory {
 name: string;
 icon: React.ReactNode;
 keywords: string[];
 priority: number;
}

// Categorías ordenadas de más genérica a más específica
const TAG_CATEGORIES: TagCategory[] = [
 { 
  name: 'Naturaleza', 
  icon: <TreePine className="w-3.5 h-3.5" />,
  keywords: ['naturaleza', 'playa', 'montaña', 'bosque', 'río', 'lago', 'cascada', 'costa', 'mar', 'océano', 'isla', 'volcán', 'desierto', 'selva', 'fauna', 'flora', 'biodiversidad', 'paisaje', 'acantilado', 'cueva', 'geología', 'parque', 'reserva', 'biosfera', 'humedal', 'laguna', 'natural'],
  priority: 1
 },
 { 
  name: 'Patrimonio', 
  icon: <Landmark className="w-3.5 h-3.5" />,
  keywords: ['historia', 'patrimonio', 'unesco', 'monumento', 'castillo', 'palacio', 'catedral', 'iglesia', 'museo', 'arte', 'arquitectura', 'romano', 'medieval', 'barroco', 'gótico', 'renacimiento', 'arqueología', 'ruinas', 'histórico', 'conjunto', 'artístico'],
  priority: 2
 },
 { 
  name: 'Geología', 
  icon: <Mountain className="w-3.5 h-3.5" />,
  keywords: ['geología', 'geológico', 'calcáreo', 'flysch', 'estratigrafía', 'formación', 'roca', 'mineral', 'fósil', 'paleontología', 'cárstico', 'volcánico'],
  priority: 3
 },
 { 
  name: 'Espacios Protegidos', 
  icon: <ShieldCheck className="w-3.5 h-3.5" />,
  keywords: ['parquenacional', 'parquenatural', 'reserva', 'protegido', 'protección', 'espacioprotegido', 'monumentonatural', 'ramsar', 'red natura'],
  priority: 4
 },
 { 
  name: 'Turismo', 
  icon: <Camera className="w-3.5 h-3.5" />,
  keywords: ['turismo', 'mirador', 'senderismo', 'ruta', 'excursión', 'viaje', 'destino', 'fotografía', 'panorámica', 'escapada', 'aventura', 'camping', 'buceo', 'surf', 'kayak', 'ciclismo'],
  priority: 5
 },
 { 
  name: 'Gastronomía', 
  icon: <UtensilsCrossed className="w-3.5 h-3.5" />,
  keywords: ['gastronomía', 'restaurante', 'vino', 'tapas', 'cocina', 'mercado', 'producto', 'mariscos', 'pescado', 'carne', 'queso', 'dulce', 'bodega'],
  priority: 6
 },
 { 
  name: 'Poblaciones', 
  icon: <Building2 className="w-3.5 h-3.5" />,
  keywords: ['ciudad', 'urbano', 'capital', 'pueblo', 'villa', 'aldea', 'municipio', 'casco', 'centro', 'barrio', 'plaza', 'costero', 'rural'],
  priority: 7
 },
 { 
  name: 'Religión', 
  icon: <Church className="w-3.5 h-3.5" />,
  keywords: ['religioso', 'sagrado', 'santuario', 'ermita', 'monasterio', 'convento', 'peregrinación', 'camino', 'santiago', 'templo', 'cátaro'],
  priority: 8
 },
];

function categorizeTag(tag: string): { category: string; isGeographic: boolean } {
 const lowerTag = tag.toLowerCase().replace(/[#\s]/g, '');
 
 const geographicPatterns = ['españa', 'spain', 'france', 'francia', 'portugal', 'italia', 'italy', 'alemania', 'germany', 
 'galicia', 'asturias', 'cantabria', 'cataluña', 'catalunya', 'andalucía', 'andalucia', 'valencia', 'madrid', 
 'aragón', 'aragon', 'navarra', 'euskadi', 'vasco', 'vasca', 'castilla', 'extremadura', 'murcia', 'rioja', 'baleares', 'canarias',
 'coruña', 'pontevedra', 'lugo', 'ourense', 'barcelona', 'sevilla', 'málaga', 'malaga', 'granada', 'córdoba', 'cordoba',
 'huesca', 'teruel', 'zaragoza', 'lleida', 'girona', 'tarragona', 'alicante', 'castellón', 'almería', 'jaén', 'huelva', 'cádiz',
 'pirineos', 'pyrenees', 'picos', 'sierra', 'mallorca', 'menorca', 'ibiza', 'tenerife', 'lanzarote',
 'occitania', 'hérault', 'herault', 'minervois', 'languedoc', 'europa', 'europe', 'africa', 'asia', 'america'];
 
 const isGeographic = geographicPatterns.some(pattern => lowerTag.includes(pattern));
 
 for (const cat of TAG_CATEGORIES) {
 if (cat.keywords.some(kw => lowerTag.includes(kw.toLowerCase().replace(/\s/g, '')) || kw.toLowerCase().replace(/\s/g, '').includes(lowerTag))) {
 return { category: cat.name, isGeographic };
 }
 }
 
 return { category: 'Otros', isGeographic };
}

export function TagsTree() {
 const { getAllLocations, getFilteredLocations, filters, setFilters } = useLocationsStore();
 const [searchTerm, setSearchTerm] = useState('');
 const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['Naturaleza', 'Patrimonio', 'Geología']));

  // Get all locations and filtered locations
 const allLocations = getAllLocations();
 
  // Check if there are geography filters active
 const hasGeoFilters = useMemo(() => {
 return !!(filters.continent || filters.country || filters.region || filters.zone);
 }, [filters]);

  // Get selected tags array (for filtering visible tags)
 const currentSelectedTags = useMemo(() => {
 const tagsArray = filters.tags || [];
 if (filters.tag && !tagsArray.includes(filters.tag)) {
 return [...tagsArray, filters.tag];
 }
 return tagsArray;
 }, [filters.tag, filters.tags]);

  // Get locations filtered by geography, enriched status, search, AND current tags
  // This ensures we only show tags that coexist with already selected tags
 const filteredLocations = useMemo(() => {
 if (allLocations.length === 0) return [];
 
 return allLocations.filter(loc => {
 const { continent, country, region, zone, onlyEnriched, verified, searchTerm: search, placeType } = filters;
 
      // Apply geography filters
 if (continent && loc.continent !== continent) return false;
 if (country && loc.country !== country) return false;
 if (region && loc.region !== region) return false;
 if (zone && loc.zone !== zone) return false;
 
      // Apply other filters
 if (placeType && loc.placeType !== placeType) return false;
 if (onlyEnriched && !loc.enrichedData) return false;
 if (verified !== undefined && loc.enrichedData?.verified !== verified) return false;
 
 if (search) {
 const s = search.toLowerCase();
 const matchesName = loc.name.toLowerCase().includes(s);
 const matchesDesc = loc.description?.toLowerCase().includes(s);
 const matchesEnrichedName = loc.enrichedData?.nombre_lugar?.toLowerCase().includes(s);
 const matchesEnrichedDesc = loc.enrichedData?.descripcion?.toLowerCase().includes(s);
 const matchesTags = loc.enrichedData?.etiquetas?.some(t => t.toLowerCase().includes(s));
 
 if (!matchesName && !matchesDesc && !matchesEnrichedName && !matchesEnrichedDesc && !matchesTags) return false;
 }
 
      // Apply tag filters - location must have ALL selected tags
 if (currentSelectedTags.length > 0) {
 const locationTags = loc.enrichedData?.etiquetas?.map(t => t.replace('#', '').toLowerCase()) || [];
 const hasAllTags = currentSelectedTags.every(selectedTag => 
 locationTags.some(locTag => locTag === selectedTag.toLowerCase())
 );
 if (!hasAllTags) return false;
 }
 
 return true;
 });
 }, [allLocations, filters, currentSelectedTags]);

  // Get total counts (from all locations with enriched data)
 const totalTagCounts = useMemo(() => {
 if (allLocations.length === 0) return new Map<string, number>();
 
 const counts = new Map<string, number>();
 allLocations.forEach(loc => {
 if (loc.enrichedData?.etiquetas) {
 loc.enrichedData.etiquetas.forEach(tag => {
 const cleanTag = tag.replace('#', '').trim().toLowerCase();
 if (cleanTag) {
 counts.set(cleanTag, (counts.get(cleanTag) || 0) + 1);
 }
 });
 }
 });
 return counts;
 }, [allLocations]);

  // Build categorized tags from ALL locations (to show all available options)
  // but track filtered counts to show relevance
 const { categories, geographicTags, allTagsCount, totalTagsCount, filteredTagsCount } = useMemo(() => {
 if (allLocations.length === 0) return { categories: [], geographicTags: [], allTagsCount: 0, totalTagsCount: 0, filteredTagsCount: 0 };

    // Get tag counts from ALL locations
 const allTagCounts = new Map<string, { totalCount: number; filteredCount: number; isGeographic: boolean }>();
 
    // First pass: count from all locations
 allLocations.forEach(loc => {
 if (loc.enrichedData?.etiquetas) {
 loc.enrichedData.etiquetas.forEach(tag => {
 const cleanTag = tag.replace('#', '').trim();
 if (cleanTag) {
 const key = cleanTag.toLowerCase();
 const existing = allTagCounts.get(key);
 const { isGeographic } = categorizeTag(cleanTag);
 allTagCounts.set(key, {
 totalCount: (existing?.totalCount || 0) + 1,
 filteredCount: existing?.filteredCount || 0,
 isGeographic: existing?.isGeographic || isGeographic
 });
 }
 });
 }
 });

    // Second pass: count from filtered locations
 const filteredLocationIds = new Set(filteredLocations.map(l => l.id));
 allLocations.forEach(loc => {
 if (filteredLocationIds.has(loc.id) && loc.enrichedData?.etiquetas) {
 loc.enrichedData.etiquetas.forEach(tag => {
 const cleanTag = tag.replace('#', '').trim();
 if (cleanTag) {
 const key = cleanTag.toLowerCase();
 const existing = allTagCounts.get(key);
 if (existing) {
 allTagCounts.set(key, {
 ...existing,
 filteredCount: existing.filteredCount + 1
 });
 }
 }
 });
 }
 });

    // Separate geographic and thematic tags
    // When tags are selected, only show tags that have results (coexist with selected tags)
 const hasSelectedTags = currentSelectedTags.length > 0;
 const geographicTags: TagNode[] = [];
 const thematicTags: Map<string, TagNode[]> = new Map();
 let filteredTagsWithResults = 0;

 Array.from(allTagCounts.entries()).forEach(([name, { totalCount, filteredCount, isGeographic }]) => {
      // Skip tags with no results when we have filters active (including selected tags)
 if (hasSelectedTags && filteredCount === 0) return;
 
 const { category } = categorizeTag(name);
 const node: TagNode = { 
 name, 
 count: filteredCount, 
 totalCount, 
 isGeographic 
 };

 if (filteredCount > 0) filteredTagsWithResults++;

 if (isGeographic) {
 geographicTags.push(node);
 } else {
 if (!thematicTags.has(category)) {
 thematicTags.set(category, []);
 }
 thematicTags.get(category)!.push(node);
 }
 });

    // Sort geographic tags by filtered count first, then total
 geographicTags.sort((a, b) => {
 if (b.count !== a.count) return b.count - a.count;
 return b.totalCount - a.totalCount;
 });

    // Build category list ordered by priority
 const categories = TAG_CATEGORIES
 .map(cat => {
 const tags = thematicTags.get(cat.name) || [];
 tags.sort((a, b) => {
 if (b.count !== a.count) return b.count - a.count;
 return b.totalCount - a.totalCount;
 });
 return {
 name: cat.name,
 icon: cat.icon,
 tags,
 count: tags.reduce((sum, t) => sum + t.count, 0),
 totalCount: tags.reduce((sum, t) => sum + t.totalCount, 0),
 priority: cat.priority
 };
 })
 .filter(cat => cat.tags.length > 0);

    // Add "Otros" category
 const otrosTags = thematicTags.get('Otros') || [];
 if (otrosTags.length > 0) {
 otrosTags.sort((a, b) => {
 if (b.count !== a.count) return b.count - a.count;
 return b.totalCount - a.totalCount;
 });
 categories.push({
 name: 'Otros',
 icon: <span></span>,
 tags: otrosTags,
 count: otrosTags.reduce((sum, t) => sum + t.count, 0),
 totalCount: otrosTags.reduce((sum, t) => sum + t.totalCount, 0),
 priority: 99
 });
 }

 categories.sort((a, b) => a.priority - b.priority);

 return { 
 categories, 
 geographicTags, 
 allTagsCount: allTagCounts.size,
 totalTagsCount: totalTagCounts.size,
 filteredTagsCount: filteredTagsWithResults,
 };
 }, [allLocations, filteredLocations, totalTagCounts, currentSelectedTags]);

 const toggleCategory = (name: string) => {
 const newExpanded = new Set(expandedCategories);
 if (newExpanded.has(name)) {
 newExpanded.delete(name);
 } else {
 newExpanded.add(name);
 }
 setExpandedCategories(newExpanded);
 };

  // Alias for consistency in UI
 const selectedTags = currentSelectedTags;

 const isTagSelected = (tagName: string) => {
 return selectedTags.some(t => t.toLowerCase() === tagName.toLowerCase());
 };

 const toggleTag = (tagName: string) => {
 const normalizedTag = tagName.toLowerCase();
 const currentTags = [...selectedTags];
 const tagIndex = currentTags.findIndex(t => t.toLowerCase() === normalizedTag);
 
 if (tagIndex >= 0) {
      // Remove tag
 currentTags.splice(tagIndex, 1);
 } else {
      // Add tag - clear geography filters on first tag selection for inverse behavior
 currentTags.push(normalizedTag);
 }
 
    // Use new 'tags' array and clear legacy 'tag'
 if (currentTags.length === 0) {
 setFilters({ 
 ...filters, 
 tag: undefined,
 tags: undefined,
 });
 } else if (currentTags.length === 1 && selectedTags.length === 0) {
      // First tag added - clear geography filters
 setFilters({ 
 ...filters, 
 tag: undefined,
 tags: currentTags,
 continent: undefined,
 country: undefined,
 region: undefined,
 zone: undefined,
 });
 } else {
 setFilters({ 
 ...filters, 
 tag: undefined,
 tags: currentTags,
 });
 }
 };

 const clearAllTags = () => {
 setFilters({ 
 ...filters, 
 tag: undefined,
 tags: undefined,
 });
 };

  // Filter by search
 const filteredCategories = useMemo(() => {
 if (!searchTerm) return categories;
 
 const search = searchTerm.toLowerCase();
 return categories
 .map(cat => ({
 ...cat,
 tags: cat.tags.filter(t => t.name.includes(search)),
 }))
 .filter(cat => cat.tags.length > 0);
 }, [categories, searchTerm]);

 const filteredGeographicTags = useMemo(() => {
 if (!searchTerm) return geographicTags;
 const search = searchTerm.toLowerCase();
 return geographicTags.filter(t => t.name.includes(search));
 }, [geographicTags, searchTerm]);

 if (allLocations.length === 0) {
 return (
 <div className="text-sm text-muted-foreground text-center py-4">
 <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-30" />
 <p>No hay ubicaciones cargadas</p>
 </div>
 );
 }

 if (totalTagsCount === 0) {
 return (
 <div className="text-sm text-muted-foreground text-center py-4">
 <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-30" />
 <p>No hay etiquetas disponibles</p>
 <p className="text-xs mt-1">Enriquece ubicaciones para generar etiquetas</p>
 </div>
 );
 }

 const hasActiveFilters = hasGeoFilters || !!filters.searchTerm;

 return (
 <div className="space-y-2">
 {/* Info when filters affect results */}
 {hasActiveFilters && filteredTagsCount < allTagsCount && (
 <div className="flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 rounded-md px-2 py-1.5">
 <Info className="w-3.5 h-3.5 shrink-0" />
 <span>{filteredTagsCount} etiquetas con resultados (de {allTagsCount} total)</span>
 </div>
 )}

 {/* Search */}
 <div className="relative">
 <Hash className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
 <Input
 placeholder="Buscar etiqueta..."
 value={searchTerm}
 onChange={(e) => setSearchTerm(e.target.value)}
 className="h-8 pl-7 text-sm"
 />
 </div>

 {/* Selected tags */}
 {selectedTags.length > 0 && (
 <div className="flex flex-wrap items-center gap-1.5">
 {selectedTags.map(tagName => (
 <Badge 
 key={tagName}
 variant="secondary" 
 className="bg-purple-100 text-purple-700 cursor-pointer hover:bg-purple-200 transition-colors"
 onClick={() => toggleTag(tagName)}
 >
 <Tag className="w-3 h-3 mr-1" />
 #{tagName}
 <span className="ml-1 opacity-60">×</span>
 </Badge>
 ))}
 {selectedTags.length > 1 && (
 <button 
 onClick={clearAllTags}
 className="text-xs text-muted-foreground hover:text-foreground transition-colors"
 >
 Limpiar
 </button>
 )}
 </div>
 )}

 <ScrollArea className="h-[200px]">
 <div className="pr-2 space-y-1">
 {/* Geographic tags section */}
 {filteredGeographicTags.length > 0 && (
 <div>
 <button
 onClick={() => toggleCategory('Geografía')}
 className="flex items-center gap-1.5 w-full py-1.5 px-1 rounded hover:bg-muted/50 text-left"
 >
 {expandedCategories.has('Geografía') ? (
 <ChevronDown className="w-3.5 h-3.5 text-blue-500" />
 ) : (
 <ChevronRight className="w-3.5 h-3.5 text-blue-500" />
 )}
 <MapPin className="w-3.5 h-3.5 text-blue-500" />
 <span className="text-sm font-medium flex-1 text-blue-700">Geografía</span>
 <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-blue-200 text-blue-600">
 {filteredGeographicTags.length}
 </Badge>
 </button>
 
 {expandedCategories.has('Geografía') && (
 <div className="ml-5 flex flex-wrap gap-1 py-1">
 {filteredGeographicTags.slice(0, 20).map(tag => {
 const hasResults = tag.count > 0;
 const showFiltered = hasGeoFilters || filters.searchTerm;
 return (
 <button
 key={tag.name}
 onClick={() => toggleTag(tag.name)}
 className={cn(
 "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full transition-colors",
 isTagSelected(tag.name)
 ? "bg-blue-500 text-white"
 : hasResults
 ? "bg-blue-50 hover:bg-blue-100 text-blue-700"
 : "bg-gray-100 hover:bg-gray-200 text-gray-400"
 )}
 >
 {tag.name}
 <span className="opacity-60">
 {showFiltered && hasResults ? `(${tag.count}/${tag.totalCount})` : `(${tag.totalCount})`}
 </span>
 </button>
 );
 })}
 {filteredGeographicTags.length > 20 && (
 <span className="text-xs text-muted-foreground px-2 self-center">
 +{filteredGeographicTags.length - 20} más
 </span>
 )}
 </div>
 )}
 </div>
 )}

 {/* Thematic categories */}
 {filteredCategories.map(category => {
 const isExpanded = expandedCategories.has(category.name);
 
 return (
 <div key={category.name}>
 <button
 onClick={() => toggleCategory(category.name)}
 className="flex items-center gap-1.5 w-full py-1.5 px-1 rounded hover:bg-muted/50 text-left"
 >
 {isExpanded ? (
 <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
 ) : (
 <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
 )}
 <span className="text-sm">{category.icon}</span>
 <span className="text-sm font-medium flex-1">{category.name}</span>
 <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
 {category.tags.length}
 </Badge>
 </button>
 
 {isExpanded && (
 <div className="ml-5 flex flex-wrap gap-1 py-1">
 {category.tags.slice(0, 20).map(tag => {
 const hasResults = tag.count > 0;
 const showFiltered = hasGeoFilters || filters.searchTerm;
 return (
 <button
 key={tag.name}
 onClick={() => toggleTag(tag.name)}
 className={cn(
 "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full transition-colors",
 isTagSelected(tag.name)
 ? "bg-purple-500 text-white"
 : hasResults
 ? "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"
 : "bg-gray-100 hover:bg-gray-200 text-gray-300"
 )}
 >
 #{tag.name}
 <span className="opacity-60">
 {showFiltered && hasResults ? `(${tag.count}/${tag.totalCount})` : `(${tag.totalCount})`}
 </span>
 </button>
 );
 })}
 {category.tags.length > 20 && (
 <span className="text-xs text-muted-foreground px-2 self-center">
 +{category.tags.length - 20} más
 </span>
 )}
 </div>
 )}
 </div>
 );
 })}
 </div>
 </ScrollArea>

 {/* Stats */}
 <div className="pt-2 border-t text-xs text-muted-foreground">
 <span className="font-medium text-foreground">{allTagsCount}</span> etiquetas disponibles
 {hasActiveFilters && filteredTagsCount > 0 && (
 <span className="text-green-600"> • {filteredTagsCount} con resultados</span>
 )}
 {''}• <span className="text-blue-600">{geographicTags.length} geográficas</span>
 </div>
 </div>
 );
}