import React from 'react';
import { Search, X, Sparkles, CheckCircle, MapPin, Tag, Building2, Filter } from 'lucide-react';
import { useLocationsStore } from '@/store/locations-store';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { PLACE_TYPE_LABELS } from '@/types/location';
import { GeographyTree } from './filters/GeographyTree';
import { TagsTree } from './filters/TagsTree';
import { PlaceTypeFilter } from './filters/PlaceTypeFilter';

export function FilterBar() {
  const { 
    filters, 
    setFilters, 
    getEnrichedStats,
    selectedLocations,
    selectAllLocations,
    clearSelection,
    getFilteredLocations,
    selectByFilter,
  } = useLocationsStore();
  
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

  return (
    <div className="space-y-3">
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

      {/* Tabbed filters */}
      <Tabs defaultValue="geography" className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-8">
          <TabsTrigger value="geography" className="text-xs gap-1">
            <MapPin className="w-3 h-3" />
            Geografía
          </TabsTrigger>
          <TabsTrigger value="tags" className="text-xs gap-1">
            <Tag className="w-3 h-3" />
            Etiquetas
          </TabsTrigger>
          <TabsTrigger value="types" className="text-xs gap-1">
            <Building2 className="w-3 h-3" />
            Tipos
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="geography" className="mt-2">
          <GeographyTree />
        </TabsContent>
        
        <TabsContent value="tags" className="mt-2">
          <TagsTree />
        </TabsContent>
        
        <TabsContent value="types" className="mt-2">
          <PlaceTypeFilter />
        </TabsContent>
      </Tabs>

      {/* Active filters display */}
      {activeFiltersCount > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center pt-2 border-t">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          {filters.onlyEnriched && (
            <Badge variant="secondary" className="gap-1 pr-1 bg-amber-100 text-amber-700 text-[10px]">
              <Sparkles className="w-2.5 h-2.5" /> Enriquecidos
              <button 
                onClick={() => setFilters({ ...filters, onlyEnriched: undefined, verified: undefined })}
                className="ml-0.5 hover:bg-amber-200 rounded-full p-0.5"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </Badge>
          )}
          {filters.verified && (
            <Badge variant="secondary" className="gap-1 pr-1 bg-green-100 text-green-700 text-[10px]">
              <CheckCircle className="w-2.5 h-2.5" /> Verificados
              <button 
                onClick={() => setFilters({ ...filters, verified: undefined })}
                className="ml-0.5 hover:bg-green-200 rounded-full p-0.5"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </Badge>
          )}
          {filters.placeType && (
            <Badge variant="secondary" className="gap-1 pr-1 bg-amber-100 text-amber-700 text-[10px]">
              <Building2 className="w-2.5 h-2.5" /> {PLACE_TYPE_LABELS[filters.placeType]}
              <button 
                onClick={() => setFilters({ ...filters, placeType: undefined })}
                className="ml-0.5 hover:bg-amber-200 rounded-full p-0.5"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </Badge>
          )}
          {filters.tag && (
            <Badge variant="secondary" className="gap-1 pr-1 bg-purple-100 text-purple-700 text-[10px]">
              <Tag className="w-2.5 h-2.5" /> #{filters.tag}
              <button 
                onClick={() => setFilters({ ...filters, tag: undefined })}
                className="ml-0.5 hover:bg-purple-200 rounded-full p-0.5"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </Badge>
          )}
          {filters.continent && (
            <Badge variant="secondary" className="gap-1 pr-1 bg-blue-100 text-blue-700 text-[10px]">
              🌍 {filters.continent}
              {filters.country && ` › ${filters.country}`}
              {filters.region && ` › ${filters.region}`}
              {filters.zone && ` › ${filters.zone}`}
              <button 
                onClick={() => setFilters({ ...filters, continent: undefined, country: undefined, region: undefined, zone: undefined })}
                className="ml-0.5 hover:bg-blue-200 rounded-full p-0.5"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAllFilters}
            className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
          >
            Limpiar
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