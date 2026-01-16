import React from 'react';
import { Search, Globe2, Flag, MapPin, Layers, X } from 'lucide-react';
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
import { cn } from '@/lib/utils';

export function FilterBar() {
  const { 
    filters, 
    setFilters, 
    getUniqueValues,
    selectedLocations,
    selectAllLocations,
    clearSelection,
    getFilteredLocations,
    selectByFilter,
  } = useLocationsStore();
  
  const continents = getUniqueValues('continent');
  const countries = getUniqueValues('country');
  const regions = getUniqueValues('region');
  const zones = getUniqueValues('zone');
  
  const filteredCount = getFilteredLocations().length;
  const selectedCount = selectedLocations.size;

  const activeFiltersCount = [
    filters.continent,
    filters.country,
    filters.region,
    filters.zone,
    filters.searchTerm,
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setFilters({});
  };

  // Count items per filter value
  const { selectedDocument } = useLocationsStore();
  const countByValue = (field: keyof typeof filters, value: string) => {
    if (!selectedDocument) return 0;
    return selectedDocument.locations.filter(loc => {
      // Apply other filters first
      if (field !== 'continent' && filters.continent && loc.continent !== filters.continent) return false;
      if (field !== 'country' && filters.country && loc.country !== filters.country) return false;
      if (field !== 'region' && filters.region && loc.region !== filters.region) return false;
      if (field !== 'zone' && filters.zone && loc.zone !== filters.zone) return false;
      // Check the specific value
      return loc[field as keyof typeof loc] === value;
    }).length;
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre o descripción..."
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
      
      {/* Filter selects */}
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

      {/* Active filters display */}
      {activeFiltersCount > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
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
