import React, { useMemo, useState } from 'react';
import { Tag, ChevronRight, ChevronDown, Hash } from 'lucide-react';
import { useLocationsStore } from '@/store/locations-store';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

interface TagCategory {
  name: string;
  tags: { name: string; count: number }[];
  count: number;
}

// Categorías predefinidas para agrupar etiquetas
const TAG_CATEGORIES: Record<string, string[]> = {
  'Naturaleza': ['naturaleza', 'playa', 'montaña', 'bosque', 'río', 'lago', 'cascada', 'parque', 'costa', 'mar', 'océano', 'isla', 'volcán', 'desierto', 'selva', 'fauna', 'flora', 'biodiversidad', 'paisaje', 'acantilado', 'cueva', 'geología'],
  'Historia y Cultura': ['historia', 'patrimonio', 'unesco', 'monumento', 'castillo', 'palacio', 'catedral', 'iglesia', 'museo', 'arte', 'arquitectura', 'romano', 'medieval', 'barroco', 'gótico', 'renacimiento', 'arqueología', 'ruinas', 'tradición', 'folklore'],
  'Turismo': ['turismo', 'mirador', 'senderismo', 'ruta', 'excursión', 'viaje', 'destino', 'fotografía', 'panorámica', 'escapada', 'aventura', 'camping', 'buceo', 'surf', 'kayak', 'ciclismo'],
  'Gastronomía': ['gastronomía', 'restaurante', 'vino', 'tapas', 'cocina', 'mercado', 'producto', 'local', 'mariscos', 'pescado', 'carne', 'queso', 'dulce', 'bodega'],
  'Ciudades': ['ciudad', 'urbano', 'capital', 'pueblo', 'villa', 'aldea', 'casco', 'histórico', 'centro', 'barrio', 'plaza', 'calle'],
  'Religión': ['religioso', 'sagrado', 'santuario', 'ermita', 'monasterio', 'convento', 'peregrinación', 'camino', 'santiago', 'templo', 'mezquita', 'sinagoga'],
  'Ocio': ['ocio', 'diversión', 'familia', 'niños', 'parque', 'temático', 'zoo', 'acuario', 'espectáculo', 'festival', 'feria', 'evento', 'fiesta', 'nocturno'],
};

function categorizeTag(tag: string): string {
  const lowerTag = tag.toLowerCase();
  for (const [category, keywords] of Object.entries(TAG_CATEGORIES)) {
    if (keywords.some(kw => lowerTag.includes(kw) || kw.includes(lowerTag))) {
      return category;
    }
  }
  return 'Otros';
}

export function TagsTree() {
  const { selectedDocument, filters, setFilters } = useLocationsStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['Naturaleza', 'Historia y Cultura']));

  // Build categorized tags from locations
  const { categories, allTags } = useMemo(() => {
    if (!selectedDocument) return { categories: [], allTags: [] };

    const tagCounts = new Map<string, number>();
    
    selectedDocument.locations.forEach(loc => {
      if (loc.enrichedData?.etiquetas) {
        loc.enrichedData.etiquetas.forEach(tag => {
          const cleanTag = tag.replace('#', '').toLowerCase().trim();
          if (cleanTag) {
            tagCounts.set(cleanTag, (tagCounts.get(cleanTag) || 0) + 1);
          }
        });
      }
    });

    const allTags = Array.from(tagCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // Group by category
    const categoryMap = new Map<string, TagCategory>();
    
    allTags.forEach(tag => {
      const categoryName = categorizeTag(tag.name);
      if (!categoryMap.has(categoryName)) {
        categoryMap.set(categoryName, {
          name: categoryName,
          tags: [],
          count: 0,
        });
      }
      const category = categoryMap.get(categoryName)!;
      category.tags.push(tag);
      category.count += tag.count;
    });

    // Sort categories by total count
    const categories = Array.from(categoryMap.values())
      .sort((a, b) => b.count - a.count);

    return { categories, allTags };
  }, [selectedDocument]);

  const toggleCategory = (name: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(name)) {
      newExpanded.delete(name);
    } else {
      newExpanded.add(name);
    }
    setExpandedCategories(newExpanded);
  };

  const selectTag = (tagName: string) => {
    if (filters.tag === tagName) {
      setFilters({ ...filters, tag: undefined });
    } else {
      setFilters({ ...filters, tag: tagName });
    }
  };

  // Filter tags by search
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

  if (!selectedDocument || allTags.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4">
        No hay etiquetas disponibles
      </div>
    );
  }

  return (
    <div className="space-y-2">
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

      {/* Selected tag */}
      {filters.tag && (
        <div className="flex items-center gap-2">
          <Badge 
            variant="secondary" 
            className="bg-purple-100 text-purple-700 cursor-pointer"
            onClick={() => setFilters({ ...filters, tag: undefined })}
          >
            <Tag className="w-3 h-3 mr-1" />
            #{filters.tag}
            <span className="ml-1 opacity-60">×</span>
          </Badge>
        </div>
      )}

      <ScrollArea className="h-[180px]">
        <div className="pr-2 space-y-1">
          {filteredCategories.map(category => {
            const isExpanded = expandedCategories.has(category.name);
            
            return (
              <div key={category.name}>
                <button
                  onClick={() => toggleCategory(category.name)}
                  className="flex items-center gap-1.5 w-full py-1 px-1 rounded hover:bg-muted/50 text-left"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium flex-1">{category.name}</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                    {category.tags.length}
                  </Badge>
                </button>
                
                {isExpanded && (
                  <div className="ml-4 flex flex-wrap gap-1 py-1">
                    {category.tags.slice(0, 20).map(tag => (
                      <button
                        key={tag.name}
                        onClick={() => selectTag(tag.name)}
                        className={cn(
                          "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full transition-colors",
                          filters.tag === tag.name
                            ? "bg-purple-500 text-white"
                            : "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"
                        )}
                      >
                        #{tag.name}
                        <span className="opacity-60">({tag.count})</span>
                      </button>
                    ))}
                    {category.tags.length > 20 && (
                      <span className="text-xs text-muted-foreground px-2">
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

      {/* Quick popular tags */}
      {allTags.length > 0 && !searchTerm && (
        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground mb-1.5">Más populares:</p>
          <div className="flex flex-wrap gap-1">
            {allTags.slice(0, 8).map(tag => (
              <button
                key={tag.name}
                onClick={() => selectTag(tag.name)}
                className={cn(
                  "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full transition-colors",
                  filters.tag === tag.name
                    ? "bg-purple-500 text-white"
                    : "bg-purple-100 text-purple-700 hover:bg-purple-200"
                )}
              >
                #{tag.name}
                <span className="opacity-60">({tag.count})</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}