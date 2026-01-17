import React, { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, Layers, Building2, MapPin, Mountain, TreePine } from 'lucide-react';
import { useLocationsStore } from '@/store/locations-store';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ClassificationNode {
  code: string;
  name: string;
  count: number;
  children: ClassificationNode[];
}

// Árbol de clasificación estático
const CLASSIFICATION_TREE = {
  '1': 'Asentamientos humanos',
  '1.1': 'Ciudad',
  '1.2': 'Villa / Pueblo',
  '1.3': 'Aldea / Núcleo rural',
  '1.4': 'Barrio / Distrito urbano',
  '1.5': 'Área habitada dispersa',
  '2': 'Entidades construidas',
  '2.1': 'Edificio',
  '2.1.1': 'Monumento',
  '2.1.2': 'Edificio histórico',
  '2.1.3': 'Edificio religioso',
  '2.1.4': 'Edificio residencial singular',
  '2.2': 'Establecimiento',
  '2.2.1': 'Restaurante / Bar',
  '2.2.2': 'Hotel / Alojamiento',
  '2.2.3': 'Comercio',
  '2.2.4': 'Empresa',
  '2.2.5': 'Servicio público',
  '2.3': 'Infraestructura puntual',
  '2.3.1': 'Faro',
  '2.3.2': 'Torre / Antena',
  '2.3.3': 'Presa',
  '2.3.4': 'Estación',
  '2.3.5': 'Subestación',
  '2.4': 'Infraestructura lineal',
  '2.4.1': 'Carretera',
  '2.4.2': 'Vía férrea',
  '2.4.3': 'Canal / Acueducto',
  '2.4.4': 'Muralla',
  '2.5': 'Complejo / Recinto',
  '2.5.1': 'Campus',
  '2.5.2': 'Puerto',
  '2.5.3': 'Aeropuerto',
  '2.5.4': 'Parque industrial',
  '2.5.5': 'Recinto histórico',
  '3': 'Lugares de interés',
  '3.1': 'Lugar cultural',
  '3.2': 'Lugar histórico',
  '3.3': 'Lugar turístico',
  '3.4': 'Lugar simbólico',
  '3.5': 'Mirador',
  '4': 'Accidentes geográficos',
  '4.1': 'Accidente mayor',
  '4.1.1': 'Montaña',
  '4.1.2': 'Sierra',
  '4.1.3': 'Río',
  '4.1.4': 'Lago',
  '4.1.5': 'Isla',
  '4.1.6': 'Desierto',
  '4.2': 'Accidente menor',
  '4.2.1': 'Valle',
  '4.2.2': 'Playa',
  '4.2.3': 'Cabo',
  '4.2.4': 'Acantilado',
  '4.2.5': 'Cueva',
  '4.2.6': 'Cascada',
  '5': 'Espacios naturales',
  '5.1': 'Parque nacional',
  '5.2': 'Parque natural',
  '5.3': 'Reserva natural',
  '5.4': 'Espacio protegido local',
  '5.5': 'Espacio natural no protegido',
};

export function ClassificationTree() {
  const { getAllLocations, filters, setFilters } = useLocationsStore();
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['1', '2', '3', '4', '5']));

  const allLocations = getAllLocations();

  // Count locations by classification code
  const classificationCounts = useMemo(() => {
    if (allLocations.length === 0) return new Map<string, number>();
    
    const counts = new Map<string, number>();
    
    allLocations.forEach(loc => {
      const code = loc.enrichedData?.clasificacion?.codigo;
      if (!code) return;
      
      // Count exact code
      counts.set(code, (counts.get(code) || 0) + 1);
      
      // Count parent codes (for aggregation)
      const parts = code.split('.');
      for (let i = 1; i < parts.length; i++) {
        const parentCode = parts.slice(0, i).join('.');
        counts.set(parentCode, (counts.get(parentCode) || 0) + 1);
      }
    });
    
    return counts;
  }, [allLocations]);

  // Build tree structure
  const tree = useMemo(() => {
    const nodes: ClassificationNode[] = [];
    
    // Create main categories (1-5)
    ['1', '2', '3', '4', '5'].forEach(mainCode => {
      const mainNode: ClassificationNode = {
        code: mainCode,
        name: CLASSIFICATION_TREE[mainCode as keyof typeof CLASSIFICATION_TREE] || mainCode,
        count: classificationCounts.get(mainCode) || 0,
        children: [],
      };
      
      // Find subcategories
      Object.keys(CLASSIFICATION_TREE)
        .filter(code => code.startsWith(mainCode + '.') && code.split('.').length === 2)
        .forEach(subCode => {
          const subNode: ClassificationNode = {
            code: subCode,
            name: CLASSIFICATION_TREE[subCode as keyof typeof CLASSIFICATION_TREE] || subCode,
            count: classificationCounts.get(subCode) || 0,
            children: [],
          };
          
          // Find specific types
          Object.keys(CLASSIFICATION_TREE)
            .filter(code => code.startsWith(subCode + '.') && code.split('.').length === 3)
            .forEach(typeCode => {
              subNode.children.push({
                code: typeCode,
                name: CLASSIFICATION_TREE[typeCode as keyof typeof CLASSIFICATION_TREE] || typeCode,
                count: classificationCounts.get(typeCode) || 0,
                children: [],
              });
            });
          
          mainNode.children.push(subNode);
        });
      
      nodes.push(mainNode);
    });
    
    return nodes;
  }, [classificationCounts]);

  // Count unclassified
  const unclassifiedCount = useMemo(() => {
    if (allLocations.length === 0) return 0;
    return allLocations.filter(
      loc => loc.enrichedData && !loc.enrichedData.clasificacion?.codigo
    ).length;
  }, [allLocations]);

  const toggleExpand = (code: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(code)) {
      newExpanded.delete(code);
    } else {
      newExpanded.add(code);
    }
    setExpandedNodes(newExpanded);
  };

  const selectCode = (code: string) => {
    setFilters({ 
      ...filters, 
      classificationCode: filters.classificationCode === code ? undefined : code 
    });
  };

  const getCategoryIcon = (code: string) => {
    const main = code.split('.')[0];
    switch (main) {
      case '1': return <Building2 className="w-4 h-4 text-amber-500" />;
      case '2': return <Layers className="w-4 h-4 text-purple-500" />;
      case '3': return <MapPin className="w-4 h-4 text-rose-500" />;
      case '4': return <Mountain className="w-4 h-4 text-blue-500" />;
      case '5': return <TreePine className="w-4 h-4 text-green-500" />;
      default: return <Layers className="w-4 h-4 text-gray-500" />;
    }
  };

  const renderNode = (node: ClassificationNode, depth: number = 0) => {
    const isExpanded = expandedNodes.has(node.code);
    const hasChildren = node.children.length > 0;
    const isSelected = filters.classificationCode === node.code;
    const isInPath = filters.classificationCode?.startsWith(node.code);
    
    // Skip nodes with no count at any level
    if (node.count === 0 && !hasChildren) return null;

    return (
      <div key={node.code}>
        <div
          className={cn(
            "flex items-center gap-1.5 py-1 px-2 rounded-md cursor-pointer hover:bg-muted/50 transition-colors",
            isSelected && "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-medium ring-1 ring-indigo-300",
            isInPath && !isSelected && "text-indigo-600 dark:text-indigo-400"
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(node.code);
              }}
              className="p-0.5 hover:bg-muted rounded shrink-0"
            >
              {isExpanded ? (
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
              )}
            </button>
          ) : (
            <span className="w-4" />
          )}
          
          <button
            onClick={() => selectCode(node.code)}
            className="flex items-center gap-1.5 flex-1 text-left min-w-0"
          >
            {depth === 0 && getCategoryIcon(node.code)}
            <span className="text-xs font-mono text-muted-foreground w-8 shrink-0">{node.code}</span>
            <span className="truncate flex-1 text-xs">{node.name}</span>
            
            {node.count > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge 
                    variant="secondary" 
                    className="text-[10px] px-1.5 py-0 h-4 font-semibold min-w-[20px] text-center border-0 shrink-0 bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300"
                  >
                    {node.count}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="left" className="text-xs">
                  {node.count} ubicaciones clasificadas
                </TooltipContent>
              </Tooltip>
            )}
          </button>
        </div>
        
        {isExpanded && hasChildren && (
          <div>
            {node.children.filter(c => c.count > 0 || c.children.some(cc => cc.count > 0)).map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (allLocations.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4">
        No hay ubicaciones cargadas
      </div>
    );
  }

  const totalClassified = Array.from(classificationCounts.values()).reduce((a, b) => a + b, 0) / 2; // Approximate

  if (classificationCounts.size === 0) {
    return (
      <div className="text-sm text-center py-4 space-y-2">
        <div className="text-muted-foreground">
          No hay puntos clasificados aún
        </div>
        <p className="text-xs text-muted-foreground">
          Enriquece las ubicaciones para obtener su clasificación
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Current selection */}
      {filters.classificationCode && (
        <div className="flex items-center gap-1 text-xs bg-indigo-50 dark:bg-indigo-950/50 rounded-md px-2 py-1.5">
          <span className="text-indigo-700 dark:text-indigo-300">
            Filtro: <strong>{filters.classificationCode}</strong> {CLASSIFICATION_TREE[filters.classificationCode as keyof typeof CLASSIFICATION_TREE]}
          </span>
          <button
            onClick={() => setFilters({ ...filters, classificationCode: undefined })}
            className="ml-auto text-indigo-500 hover:text-indigo-700"
          >
            ✕
          </button>
        </div>
      )}
      
      <ScrollArea className="h-[220px]">
        <div className="pr-2 space-y-0.5">
          {tree.filter(node => node.count > 0 || node.children.some(c => c.count > 0)).map(node => renderNode(node))}
          
          {unclassifiedCount > 0 && (
            <div className="pt-2 mt-2 border-t">
              <button
                onClick={() => selectCode('__unclassified__')}
                className={cn(
                  "flex items-center gap-2 w-full py-1 px-2 rounded-md text-xs hover:bg-muted/50",
                  filters.classificationCode === '__unclassified__' && "bg-amber-100 dark:bg-amber-950 text-amber-700"
                )}
              >
                <span className="text-amber-500">⚠️</span>
                <span>Sin clasificar</span>
                <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0 h-4 bg-amber-100 text-amber-700">
                  {unclassifiedCount}
                </Badge>
              </button>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
