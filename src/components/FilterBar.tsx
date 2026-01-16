import React from 'react';
import { Search, Globe2, Flag, MapPin, Layers } from 'lucide-react';
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

export function FilterBar() {
  const { 
    filters, 
    setFilters, 
    getUniqueValues,
    selectedLocations,
    selectAllLocations,
    clearSelection,
    getFilteredLocations,
  } = useLocationsStore();
  
  const continents = getUniqueValues('continent');
  const countries = getUniqueValues('country');
  const regions = getUniqueValues('region');
  const zones = getUniqueValues('zone');
  
  const filteredCount = getFilteredLocations().length;
  const selectedCount = selectedLocations.size;

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar ubicaciones..."
          value={filters.searchTerm || ''}
          onChange={(e) => setFilters({ ...filters, searchTerm: e.target.value })}
          className="pl-10"
        />
      </div>
      
      {/* Filters */}
      <div className="grid grid-cols-2 gap-2">
        <Select
          value={filters.continent || 'all'}
          onValueChange={(value) => setFilters({ 
            ...filters, 
            continent: value === 'all' ? undefined : value 
          })}
        >
          <SelectTrigger className="w-full">
            <Globe2 className="w-4 h-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Continente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {continents.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Select
          value={filters.country || 'all'}
          onValueChange={(value) => setFilters({ 
            ...filters, 
            country: value === 'all' ? undefined : value 
          })}
        >
          <SelectTrigger className="w-full">
            <Flag className="w-4 h-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="País" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {countries.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Select
          value={filters.region || 'all'}
          onValueChange={(value) => setFilters({ 
            ...filters, 
            region: value === 'all' ? undefined : value 
          })}
        >
          <SelectTrigger className="w-full">
            <MapPin className="w-4 h-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Región" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {regions.map((r) => (
              <SelectItem key={r} value={r}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Select
          value={filters.zone || 'all'}
          onValueChange={(value) => setFilters({ 
            ...filters, 
            zone: value === 'all' ? undefined : value 
          })}
        >
          <SelectTrigger className="w-full">
            <Layers className="w-4 h-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Zona" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {zones.map((z) => (
              <SelectItem key={z} value={z}>{z}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      {/* Selection controls */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {selectedCount} de {filteredCount} seleccionados
        </span>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={selectAllLocations}
            className="text-xs"
          >
            Seleccionar todo
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearSelection}
            className="text-xs"
          >
            Limpiar
          </Button>
        </div>
      </div>
    </div>
  );
}
