import React from 'react';
import { Search, Globe2, Flag, MapPin, Layers, X, Tag, Sparkles, CheckCircle, Building2 } from 'lucide-react';
import { useLocationsStore } from '@/store/locations-store';
import { Input } from '@/components/ui/input';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { PLACE_TYPE_LABELS, PlaceType } from '@/types/location';

export function FilterBar() {
  const { 
    filters, 
    setFilters, 
    getUniqueValues,
    getUniqueTags,
    getEnrichedStats,
    selectedLocations,
    selectAllLocations,
    clearSelection,
    getFilteredLocations,
    selectByFilter,
    selectedDocument,
  } = useLocationsStore();
  
  const continents = getUniqueValues('continent');
  const countries = getUniqueValues('country');
  const regions = getUniqueValues('region');
  const zones = getUniqueValues('zone');
  const placeTypes = getUniqueValues('placeType') as PlaceType[];
  const tags = getUniqueTags();
  const stats = getEnrichedStats();
  
  const filteredCount = getFilteredLocations().length;
  const selectedCount = selectedLocations.size;

  const activeFiltersCount = [
    filters.continent,
    filters.country,
    filters.region,
    filters.zone,
    filters.searchTerm,
    filters.placeType,
    filters.tag,
    filters.onlyEnriched,
    filters.verified,
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setFilters({});
  };

  // Count items per filter value
  const countByValue = (field: keyof typeof filters, value: string) => {
    if (!selectedDocument) return 0;
    return selectedDocument.locations.filter(loc => {
      // Apply other filters first
      if (field !== 'continent' && filters.continent && loc.continent !== filters.continent) return false;
      if (field !== 'country' && filters.country && loc.country !== filters.country) return false;
      if (field !== 'region' && filters.region && loc.region !== filters.region) return false;
      if (field !== 'zone' && filters.zone && loc.zone !== filters.zone) return false;
      if (field !== 'placeType' && filters.placeType && loc.placeType !== filters.placeType) return false;
      // Check the specific value
      return loc[field as keyof typeof loc] === value;
    }).length;
  };

  const countByTag = (tag: string) => {
    if (!selectedDocument) return 0;
    return selectedDocument.locations.filter(loc => {
      if (filters.continent && loc.continent !== filters.continent) return false;
      if (filters.country && loc.country !== filters.country) return false;
      if (filters.placeType && loc.placeType !== filters.placeType) return false;
      return loc.enrichedData?.etiquetas?.some(t => 
        t.toLowerCase().replace('#', '') === tag.toLowerCase()
      );
    }).length;
  };

  return (
    <div className="space-y-4">
      {/* Enriched stats */}
      {stats.total > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-2">
          <div className="flex items-center gap-1">
            <span className="font-medium text-foreground">{stats.total}</span> total
          </div>
          <span>•</span>
          <div className="flex items-center gap-1 text-amber-600">
            <Sparkles className="w-3 h-3" />
            <span className="font-medium">{stats.enriched}</span> enriquecidos
          </div>
          {stats.verified > 0 && (
            <>
              <span>•</span>
              <div className="flex items-center gap-1 text-green-600">
                <CheckCircle className="w-3 h-3" />
                <span className="font-medium">{stats.verified}</span> verificados
              </div>
            </>
          )}
        </div>
      )}

      {/* Quick filters - enriched toggle */}
      <div className="flex items-center justify-between gap-4 p-2 bg-muted/30 rounded-lg">
        <div className="flex items-center gap-2">
          <Switch
            id="only-enriched"
            checked={filters.onlyEnriched || false}
            onCheckedChange={(checked) => setFilters({ ...filters, onlyEnriched: checked || undefined })}
          />
          <Label htmlFor="only-enriched" className="text-sm flex items-center gap-1 cursor-pointer">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            Solo enriquecidos
          </Label>
        </div>
        {filters.onlyEnriched && stats.verified > 0 && (
          <div className="flex items-center gap-2">
            <Switch
              id="only-verified"
              checked={filters.verified || false}
              onCheckedChange={(checked) => setFilters({ ...filters, verified: checked || undefined })}
            />
            <Label htmlFor="only-verified" className="text-sm flex items-center gap-1 cursor-pointer">
              <CheckCircle className="w-3.5 h-3.5 text-green-500" />
              Verificados
            </Label>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar en nombre, descripción, etiquetas..."
          value={filters.searchTerm || ''}
          onChange={(e) => setFilters({ ...filters, searchTerm: e.target.value })}
          className="pl-10 pr-10"
        />
        {filters.searchTerm && (
          <button
            onClick={() => setFilters({ ...filters, searchTerm: '' })}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      
      {/* Filter selects - Geography */}
      <div className="grid grid-cols-2 gap-2">
        {/* Continent */}
        <Select
          value={filters.continent || 'all'}
          onValueChange={(value) => setFilters({ 
            ...filters, 
            continent: value === 'all' ? undefined : value 
          })}
        >
          <SelectTrigger className={cn(
            "w-full",
            filters.continent && "border-primary bg-accent"
          )}>
            <Globe2 className="w-4 h-4 mr-2 text-muted-foreground shrink-0" />
            <span className="truncate">
              {filters.continent || 'Continente'}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos ({selectedDocument?.locations.length || 0})</SelectItem>
            {continents.map((c) => (
              <SelectItem key={c} value={c}>
                {c} ({countByValue('continent', c)})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Country */}
        <Select
          value={filters.country || 'all'}
          onValueChange={(value) => setFilters({ 
            ...filters, 
            country: value === 'all' ? undefined : value 
          })}
        >
          <SelectTrigger className={cn(
            "w-full",
            filters.country && "border-primary bg-accent"
          )}>
            <Flag className="w-4 h-4 mr-2 text-muted-foreground shrink-0" />
            <span className="truncate">
              {filters.country || 'País'}
            </span>
          </SelectTrigger>
          <SelectContent>
            <ScrollArea className="h-56">
              <SelectItem value="all">Todos</SelectItem>
              {countries.map((c) => (
                <SelectItem key={c} value={c}>
                  {c} ({countByValue('country', c)})
                </SelectItem>
              ))}
            </ScrollArea>
          </SelectContent>
        </Select>

        {/* Region */}
        <Select
          value={filters.region || 'all'}
          onValueChange={(value) => setFilters({ 
            ...filters, 
            region: value === 'all' ? undefined : value 
          })}
        >
          <SelectTrigger className={cn(
            "w-full",
            filters.region && "border-primary bg-accent"
          )}>
            <MapPin className="w-4 h-4 mr-2 text-muted-foreground shrink-0" />
            <span className="truncate">
              {filters.region || 'Región'}
            </span>
          </SelectTrigger>
          <SelectContent>
            <ScrollArea className="h-56">
              <SelectItem value="all">Todas</SelectItem>
              {regions.map((r) => (
                <SelectItem key={r} value={r}>
                  {r} ({countByValue('region', r)})
                </SelectItem>
              ))}
            </ScrollArea>
          </SelectContent>
        </Select>
        
        {/* Zone */}
        <Select
          value={filters.zone || 'all'}
          onValueChange={(value) => setFilters({ 
            ...filters, 
            zone: value === 'all' ? undefined : value 
          })}
        >
          <SelectTrigger className={cn(
            "w-full",
            filters.zone && "border-primary bg-accent"
          )}>
            <Layers className="w-4 h-4 mr-2 text-muted-foreground shrink-0" />
            <span className="truncate">
              {filters.zone || 'Zona'}
            </span>
          </SelectTrigger>
          <SelectContent>
            <ScrollArea className="h-56">
              <SelectItem value="all">Todas</SelectItem>
              {zones.map((z) => (
                <SelectItem key={z} value={z}>
                  {z} ({countByValue('zone', z)})
                </SelectItem>
              ))}
            </ScrollArea>
          </SelectContent>
        </Select>
      </div>

      {/* Enriched data filters */}
      {(placeTypes.length > 0 || tags.length > 0) && (
        <div className="grid grid-cols-2 gap-2">
          {/* Place Type */}
          {placeTypes.length > 0 && (
            <Select
              value={filters.placeType || 'all'}
              onValueChange={(value) => setFilters({ 
                ...filters, 
                placeType: value === 'all' ? undefined : value as PlaceType
              })}
            >
              <SelectTrigger className={cn(
                "w-full",
                filters.placeType && "border-amber-500 bg-amber-50"
              )}>
                <Building2 className="w-4 h-4 mr-2 text-amber-500 shrink-0" />
                <span className="truncate">
                  {filters.placeType ? PLACE_TYPE_LABELS[filters.placeType] : 'Tipo de lugar'}
                </span>
              </SelectTrigger>
              <SelectContent>
                <ScrollArea className="h-56">
                  <SelectItem value="all">Todos los tipos</SelectItem>
                  {placeTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {PLACE_TYPE_LABELS[type] || type} ({countByValue('placeType', type)})
                    </SelectItem>
                  ))}
                </ScrollArea>
              </SelectContent>
            </Select>
          )}

          {/* Tags */}
          {tags.length > 0 && (
            <Select
              value={filters.tag || 'all'}
              onValueChange={(value) => setFilters({ 
                ...filters, 
                tag: value === 'all' ? undefined : value 
              })}
            >
              <SelectTrigger className={cn(
                "w-full",
                filters.tag && "border-purple-500 bg-purple-50"
              )}>
                <Tag className="w-4 h-4 mr-2 text-purple-500 shrink-0" />
                <span className="truncate">
                  {filters.tag ? `#${filters.tag}` : 'Etiqueta'}
                </span>
              </SelectTrigger>
              <SelectContent>
                <ScrollArea className="h-56">
                  <SelectItem value="all">Todas las etiquetas</SelectItem>
                  {tags.map((tag) => (
                    <SelectItem key={tag} value={tag}>
                      #{tag} ({countByTag(tag)})
                    </SelectItem>
                  ))}
                </ScrollArea>
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {/* Active filters display */}
      {activeFiltersCount > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          {filters.onlyEnriched && (
            <Badge variant="secondary" className="gap-1 pr-1 bg-amber-100 text-amber-700">
              <Sparkles className="w-3 h-3" /> Enriquecidos
              <button 
                onClick={() => setFilters({ ...filters, onlyEnriched: undefined, verified: undefined })}
                className="ml-1 hover:bg-amber-200 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {filters.verified && (
            <Badge variant="secondary" className="gap-1 pr-1 bg-green-100 text-green-700">
              <CheckCircle className="w-3 h-3" /> Verificados
              <button 
                onClick={() => setFilters({ ...filters, verified: undefined })}
                className="ml-1 hover:bg-green-200 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {filters.placeType && (
            <Badge variant="secondary" className="gap-1 pr-1 bg-amber-100 text-amber-700">
              <Building2 className="w-3 h-3" /> {PLACE_TYPE_LABELS[filters.placeType]}
              <button 
                onClick={() => setFilters({ ...filters, placeType: undefined })}
                className="ml-1 hover:bg-amber-200 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {filters.tag && (
            <Badge variant="secondary" className="gap-1 pr-1 bg-purple-100 text-purple-700">
              <Tag className="w-3 h-3" /> #{filters.tag}
              <button 
                onClick={() => setFilters({ ...filters, tag: undefined })}
                className="ml-1 hover:bg-purple-200 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {filters.continent && (
            <Badge variant="secondary" className="gap-1 pr-1 bg-blue-100 text-blue-700">
              🌍 {filters.continent}
              <button 
                onClick={() => setFilters({ ...filters, continent: undefined })}
                className="ml-1 hover:bg-blue-200 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {filters.country && (
            <Badge variant="secondary" className="gap-1 pr-1 bg-green-100 text-green-700">
              🏳️ {filters.country}
              <button 
                onClick={() => setFilters({ ...filters, country: undefined })}
                className="ml-1 hover:bg-green-200 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {filters.region && (
            <Badge variant="secondary" className="gap-1 pr-1">
              📍 {filters.region}
              <button 
                onClick={() => setFilters({ ...filters, region: undefined })}
                className="ml-1 hover:bg-muted rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {filters.zone && (
            <Badge variant="secondary" className="gap-1 pr-1">
              🗂️ {filters.zone}
              <button 
                onClick={() => setFilters({ ...filters, zone: undefined })}
                className="ml-1 hover:bg-muted rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAllFilters}
            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Limpiar todo
          </Button>
        </div>
      )}
      
      {/* Selection controls */}
      <div className="flex items-center justify-between text-sm pt-2 border-t">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">
            <span className="font-medium text-foreground">{selectedCount}</span> de {filteredCount}
          </span>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={selectAllLocations}
            className="text-xs h-7"
          >
            Seleccionar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearSelection}
            className="text-xs h-7"
            disabled={selectedCount === 0}
          >
            Limpiar
          </Button>
        </div>
      </div>

      {/* Quick select by filter */}
      {activeFiltersCount > 0 && filteredCount > 0 && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => selectByFilter(filters)}
          className="w-full text-xs"
        >
          Seleccionar {filteredCount} puntos filtrados
        </Button>
      )}
    </div>
  );
}