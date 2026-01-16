import React, { useMemo, useState } from 'react';
import { Tag, ChevronRight, ChevronDown, Hash, MapPin, Sparkles } from 'lucide-react';
import { useLocationsStore } from '@/store/locations-store';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

interface TagNode {
  name: string;
  count: number;
  isGeographic?: boolean;
  children?: TagNode[];
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
    icon: <span>🌿</span>,
    keywords: ['naturaleza', 'playa', 'montaña', 'bosque', 'río', 'lago', 'cascada', 'costa', 'mar', 'océano', 'isla', 'volcán', 'desierto', 'selva', 'fauna', 'flora', 'biodiversidad', 'paisaje', 'acantilado', 'cueva', 'geología', 'parque', 'reserva', 'biosfera', 'humedal', 'laguna', 'natural'],
    priority: 1
  },
  { 
    name: 'Patrimonio', 
    icon: <span>🏛️</span>,
    keywords: ['historia', 'patrimonio', 'unesco', 'monumento', 'castillo', 'palacio', 'catedral', 'iglesia', 'museo', 'arte', 'arquitectura', 'romano', 'medieval', 'barroco', 'gótico', 'renacimiento', 'arqueología', 'ruinas', 'histórico', 'conjunto', 'artístico'],
    priority: 2
  },
  { 
    name: 'Geología', 
    icon: <span>🪨</span>,
    keywords: ['geología', 'geológico', 'calcáreo', 'flysch', 'estratigrafía', 'formación', 'roca', 'mineral', 'fósil', 'paleontología', 'cárstico', 'volcánico'],
    priority: 3
  },
  { 
    name: 'Espacios Protegidos', 
    icon: <span>🛡️</span>,
    keywords: ['parquenacional', 'parquenatural', 'reserva', 'protegido', 'protección', 'espacioprotegido', 'monumentonatural', 'ramsar', 'red natura'],
    priority: 4
  },
  { 
    name: 'Turismo', 
    icon: <span>📷</span>,
    keywords: ['turismo', 'mirador', 'senderismo', 'ruta', 'excursión', 'viaje', 'destino', 'fotografía', 'panorámica', 'escapada', 'aventura', 'camping', 'buceo', 'surf', 'kayak', 'ciclismo'],
    priority: 5
  },
  { 
    name: 'Gastronomía', 
    icon: <span>🍷</span>,
    keywords: ['gastronomía', 'restaurante', 'vino', 'tapas', 'cocina', 'mercado', 'producto', 'mariscos', 'pescado', 'carne', 'queso', 'dulce', 'bodega'],
    priority: 6
  },
  { 
    name: 'Poblaciones', 
    icon: <span>🏘️</span>,
    keywords: ['ciudad', 'urbano', 'capital', 'pueblo', 'villa', 'aldea', 'municipio', 'casco', 'centro', 'barrio', 'plaza', 'costero', 'rural'],
    priority: 7
  },
  { 
    name: 'Religión', 
    icon: <span>⛪</span>,
    keywords: ['religioso', 'sagrado', 'santuario', 'ermita', 'monasterio', 'convento', 'peregrinación', 'camino', 'santiago', 'templo', 'cátaro'],
    priority: 8
  },
];

function categorizeTag(tag: string): { category: string; isGeographic: boolean } {
  const lowerTag = tag.toLowerCase().replace(/[#\s]/g, '');
  
  // Check if it's a geographic tag (typically capitalized location names)
  const geographicPatterns = ['españa', 'spain', 'france', 'francia', 'portugal', 'italia', 'italy', 'alemania', 'germany', 
    'galicia', 'asturias', 'cantabria', 'cataluña', 'catalunya', 'andalucía', 'andalucia', 'valencia', 'madrid', 
    'aragón', 'aragon', 'navarra', 'euskadi', 'vasco', 'vasca', 'castilla', 'extremadura', 'murcia', 'rioja', 'baleares', 'canarias',
    'coruña', 'pontevedra', 'lugo', 'ourense', 'barcelona', 'sevilla', 'málaga', 'malaga', 'granada', 'córdoba', 'cordoba',
    'huesca', 'teruel', 'zaragoza', 'lleida', 'girona', 'tarragona', 'alicante', 'castellón', 'almería', 'jaén', 'huelva', 'cádiz',
    'pirineos', 'pyrenees', 'picos', 'sierra', 'mallorca', 'menorca', 'ibiza', 'tenerife', 'lanzarote',
    'occitania', 'hérault', 'herault', 'minervois', 'languedoc'];
  
  const isGeographic = geographicPatterns.some(pattern => lowerTag.includes(pattern));
  
  // Find matching category
  for (const cat of TAG_CATEGORIES) {
    if (cat.keywords.some(kw => lowerTag.includes(kw.toLowerCase().replace(/\s/g, '')) || kw.toLowerCase().replace(/\s/g, '').includes(lowerTag))) {
      return { category: cat.name, isGeographic };
    }
  }
  
  return { category: 'Otros', isGeographic };
}

export function TagsTree() {
  const { selectedDocument, filters, setFilters } = useLocationsStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['Naturaleza', 'Patrimonio', 'Geología']));

  // Build categorized tags from locations
  const { categories, geographicTags, allTagsCount } = useMemo(() => {
    if (!selectedDocument) return { categories: [], geographicTags: [], allTagsCount: 0 };

    const tagCounts = new Map<string, { count: number; isGeographic: boolean }>();
    
    selectedDocument.locations.forEach(loc => {
      if (loc.enrichedData?.etiquetas) {
        loc.enrichedData.etiquetas.forEach(tag => {
          const cleanTag = tag.replace('#', '').trim();
          if (cleanTag) {
            const existing = tagCounts.get(cleanTag.toLowerCase());
            const { isGeographic } = categorizeTag(cleanTag);
            tagCounts.set(cleanTag.toLowerCase(), {
              count: (existing?.count || 0) + 1,
              isGeographic: existing?.isGeographic || isGeographic
            });
          }
        });
      }
    });

    // Separate geographic and thematic tags
    const geographicTags: TagNode[] = [];
    const thematicTags: Map<string, TagNode[]> = new Map();

    Array.from(tagCounts.entries()).forEach(([name, { count, isGeographic }]) => {
      const { category } = categorizeTag(name);
      const node: TagNode = { name, count, isGeographic };

      if (isGeographic) {
        geographicTags.push(node);
      } else {
        if (!thematicTags.has(category)) {
          thematicTags.set(category, []);
        }
        thematicTags.get(category)!.push(node);
      }
    });

    // Sort geographic tags by count
    geographicTags.sort((a, b) => b.count - a.count);

    // Build category list ordered by priority
    const categories = TAG_CATEGORIES
      .map(cat => {
        const tags = thematicTags.get(cat.name) || [];
        tags.sort((a, b) => b.count - a.count);
        return {
          name: cat.name,
          icon: cat.icon,
          tags,
          count: tags.reduce((sum, t) => sum + t.count, 0),
          priority: cat.priority
        };
      })
      .filter(cat => cat.tags.length > 0);

    // Add "Otros" category
    const otrosTags = thematicTags.get('Otros') || [];
    if (otrosTags.length > 0) {
      otrosTags.sort((a, b) => b.count - a.count);
      categories.push({
        name: 'Otros',
        icon: <span>📌</span>,
        tags: otrosTags,
        count: otrosTags.reduce((sum, t) => sum + t.count, 0),
        priority: 99
      });
    }

    categories.sort((a, b) => a.priority - b.priority);

    return { 
      categories, 
      geographicTags, 
      allTagsCount: tagCounts.size 
    };
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

  if (!selectedDocument || allTagsCount === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4">
        <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p>No hay etiquetas disponibles</p>
        <p className="text-xs mt-1">Enriquece ubicaciones para generar etiquetas</p>
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
            className="bg-purple-100 text-purple-700 cursor-pointer hover:bg-purple-200 transition-colors"
            onClick={() => setFilters({ ...filters, tag: undefined })}
          >
            <Tag className="w-3 h-3 mr-1" />
            #{filters.tag}
            <span className="ml-1 opacity-60">×</span>
          </Badge>
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
                  {filteredGeographicTags.slice(0, 15).map(tag => (
                    <button
                      key={tag.name}
                      onClick={() => selectTag(tag.name)}
                      className={cn(
                        "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full transition-colors",
                        filters.tag === tag.name
                          ? "bg-blue-500 text-white"
                          : "bg-blue-50 hover:bg-blue-100 text-blue-700"
                      )}
                    >
                      📍 {tag.name}
                      <span className="opacity-60">({tag.count})</span>
                    </button>
                  ))}
                  {filteredGeographicTags.length > 15 && (
                    <span className="text-xs text-muted-foreground px-2 self-center">
                      +{filteredGeographicTags.length - 15} más
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
                    {category.tags.slice(0, 15).map(tag => (
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
                    {category.tags.length > 15 && (
                      <span className="text-xs text-muted-foreground px-2 self-center">
                        +{category.tags.length - 15} más
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
        <span className="font-medium text-foreground">{allTagsCount}</span> etiquetas únicas • 
        <span className="text-blue-600 ml-1">{geographicTags.length} geográficas</span>
      </div>
    </div>
  );
}
