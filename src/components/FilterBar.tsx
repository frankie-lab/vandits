import React, { useState } from 'react';
import { Search, Globe2, Flag, MapPin, Layers, SlidersHorizontal, X, Check } from 'lucide-react';
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Checkbox } from '@/components/ui/checkbox';
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

  const [continentOpen, setContinentOpen] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);

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
      
      {/* Quick filter chips */}
      <div className="flex flex-wrap gap-2">
        {/* Continent selector with search */}
        <Popover open={continentOpen} onOpenChange={setContinentOpen}>
          <PopoverTrigger asChild>
            <Button
              variant={filters.continent ? "default" : "outline"}
              size="sm"
              className="h-8 gap-1.5"
            >
              <Globe2 className="w-3.5 h-3.5" />
              {filters.continent || 'Continente'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-0" align="start">
            <Command>
              <CommandInput placeholder="Buscar continente..." />
              <CommandList>
                <CommandEmpty>No encontrado</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    onSelect={() => {
                      setFilters({ ...filters, continent: undefined });
                      setContinentOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", !filters.continent ? "opacity-100" : "opacity-0")} />
                    Todos
                  </CommandItem>
                  {continents.map((c) => (
                    <CommandItem
                      key={c}
                      onSelect={() => {
                        setFilters({ ...filters, continent: c });
                        setContinentOpen(false);
                      }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", filters.continent === c ? "opacity-100" : "opacity-0")} />
                      {c}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Country selector with search */}
        <Popover open={countryOpen} onOpenChange={setCountryOpen}>
          <PopoverTrigger asChild>
            <Button
              variant={filters.country ? "default" : "outline"}
              size="sm"
              className="h-8 gap-1.5"
            >
              <Flag className="w-3.5 h-3.5" />
              {filters.country || 'País'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-0" align="start">
            <Command>
              <CommandInput placeholder="Buscar país..." />
              <CommandList>
                <CommandEmpty>No encontrado</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    onSelect={() => {
                      setFilters({ ...filters, country: undefined });
                      setCountryOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", !filters.country ? "opacity-100" : "opacity-0")} />
                    Todos
                  </CommandItem>
                  {countries.map((c) => (
                    <CommandItem
                      key={c}
                      onSelect={() => {
                        setFilters({ ...filters, country: c });
                        setCountryOpen(false);
                      }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", filters.country === c ? "opacity-100" : "opacity-0")} />
                      {c}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Region */}
        {regions.length > 0 && (
          <Select
            value={filters.region || 'all'}
            onValueChange={(value) => setFilters({ 
              ...filters, 
              region: value === 'all' ? undefined : value 
            })}
          >
            <SelectTrigger className={cn(
              "w-auto h-8 gap-1.5",
              filters.region && "bg-primary text-primary-foreground border-primary"
            )}>
              <MapPin className="w-3.5 h-3.5" />
              <SelectValue placeholder="Región" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las regiones</SelectItem>
              {regions.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        
        {/* Zone */}
        {zones.length > 0 && (
          <Select
            value={filters.zone || 'all'}
            onValueChange={(value) => setFilters({ 
              ...filters, 
              zone: value === 'all' ? undefined : value 
            })}
          >
            <SelectTrigger className={cn(
              "w-auto h-8 gap-1.5",
              filters.zone && "bg-primary text-primary-foreground border-primary"
            )}>
              <Layers className="w-3.5 h-3.5" />
              <SelectValue placeholder="Zona" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las zonas</SelectItem>
              {zones.map((z) => (
                <SelectItem key={z} value={z}>{z}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Clear filters */}
        {activeFiltersCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAllFilters}
            className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
            Limpiar ({activeFiltersCount})
          </Button>
        )}
      </div>

      {/* Active filters display */}
      {activeFiltersCount > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {filters.continent && (
            <Badge variant="secondary" className="gap-1 pr-1">
              🌍 {filters.continent}
              <button 
                onClick={() => setFilters({ ...filters, continent: undefined })}
                className="ml-1 hover:bg-muted rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {filters.country && (
            <Badge variant="secondary" className="gap-1 pr-1">
              🏳️ {filters.country}
              <button 
                onClick={() => setFilters({ ...filters, country: undefined })}
                className="ml-1 hover:bg-muted rounded-full p-0.5"
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
        </div>
      )}
      
      {/* Selection controls */}
      <div className="flex items-center justify-between text-sm pt-2 border-t">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">
            <span className="font-medium text-foreground">{selectedCount}</span> de {filteredCount} seleccionados
          </span>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={selectAllLocations}
            className="text-xs h-7"
          >
            Seleccionar todo
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearSelection}
            className="text-xs h-7"
            disabled={selectedCount === 0}
          >
            Limpiar selección
          </Button>
        </div>
      </div>

      {/* Quick select by filter */}
      {activeFiltersCount > 0 && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => selectByFilter(filters)}
          className="w-full text-xs"
        >
          Seleccionar los {filteredCount} puntos filtrados
        </Button>
      )}
    </div>
  );
}
