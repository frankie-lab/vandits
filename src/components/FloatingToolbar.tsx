import React from 'react';
import { motion } from 'framer-motion';
import { 
  Filter, 
  List, 
  Download, 
  Wand2, 
  Globe2, 
  FileUp,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useLocationsStore } from '@/store/locations-store';

interface FloatingToolbarProps {
  onToggleFilters: () => void;
  onToggleLocations: () => void;
  onToggleExport: () => void;
  onToggleBatchEnrich: () => void;
  onUploadClick: () => void;
  filtersOpen: boolean;
  locationsOpen: boolean;
  activeFilterCount: number;
}

export function FloatingToolbar({
  onToggleFilters,
  onToggleLocations,
  onToggleExport,
  onToggleBatchEnrich,
  onUploadClick,
  filtersOpen,
  locationsOpen,
  activeFilterCount,
}: FloatingToolbarProps) {
  const { 
    documents, 
    selectedDocument, 
    selectDocument, 
    removeDocument,
    clearAllDocuments,
    getFilteredLocations,
  } = useLocationsStore();

  const locationCount = getFilteredLocations().length;
  const totalCount = selectedDocument?.locations.length || 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 bg-background/95 backdrop-blur-md rounded-full shadow-2xl border border-border/50 px-3 py-2"
    >
      {/* Logo */}
      <div className="flex items-center gap-2 pr-3 border-r border-border/50">
        <div className="p-1.5 ocean-gradient rounded-lg">
          <Globe2 className="w-4 h-4 text-primary-foreground" />
        </div>
        <span className="font-display font-bold text-sm hidden sm:inline">GeoData</span>
      </div>

      {/* Document selector */}
      {documents.length > 0 && (
        <div className="flex items-center gap-1 pr-3 border-r border-border/50">
          <Select
            value={selectedDocument?.id || ''}
            onValueChange={(value) => selectDocument(value)}
          >
            <SelectTrigger className="h-8 w-[140px] text-xs border-0 bg-transparent">
              <SelectValue placeholder="Documento" />
            </SelectTrigger>
            <SelectContent>
              {documents.map((doc) => (
                <SelectItem key={doc.id} value={doc.id}>
                  <div className="flex items-center gap-2">
                    <span className="truncate max-w-[100px]">{doc.name}</span>
                    <Badge variant="secondary" className="text-[10px] h-4">
                      {doc.locations.length}
                    </Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Delete current doc */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar documento?</AlertDialogTitle>
                <AlertDialogDescription>
                  Se eliminará "{selectedDocument?.name}" con todas sus ubicaciones.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={() => selectedDocument && removeDocument(selectedDocument.id)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Eliminar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      {/* Stats */}
      {selectedDocument && (
        <div className="flex items-center gap-1 pr-3 border-r border-border/50 text-xs">
          <span className="font-bold text-primary">{locationCount}</span>
          {locationCount !== totalCount && (
            <span className="text-muted-foreground">/ {totalCount}</span>
          )}
        </div>
      )}

      {/* Tools */}
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={filtersOpen ? 'secondary' : 'ghost'}
              size="icon"
              className="h-8 w-8 relative"
              onClick={onToggleFilters}
            >
              <Filter className="w-4 h-4" />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-foreground text-[10px] rounded-full flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Filtros</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={locationsOpen ? 'secondary' : 'ghost'}
              size="icon"
              className="h-8 w-8"
              onClick={onToggleLocations}
            >
              <List className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Lista de ubicaciones</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onToggleBatchEnrich}
            >
              <Wand2 className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Enriquecer con IA</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onToggleExport}
            >
              <Download className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Exportar</TooltipContent>
        </Tooltip>

        <div className="w-px h-6 bg-border/50 mx-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onUploadClick}
            >
              <FileUp className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Subir KML</TooltipContent>
        </Tooltip>

        {documents.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <RotateCcw className="w-4 h-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Volver al inicio?</AlertDialogTitle>
                <AlertDialogDescription>
                  Se eliminarán todos los documentos y ubicaciones.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={clearAllDocuments}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Reiniciar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </motion.div>
  );
}
