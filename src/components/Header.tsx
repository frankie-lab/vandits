import React from 'react';
import { motion } from 'framer-motion';
import { Globe2, Map, List, Columns, FileUp, Trash2, RotateCcw } from 'lucide-react';
import { useLocationsStore } from '@/store/locations-store';
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

interface HeaderProps {
  onUploadClick: () => void;
}

export function Header({ onUploadClick }: HeaderProps) {
  const { 
    documents, 
    selectedDocument, 
    selectDocument, 
    removeDocument, 
    viewMode, 
    setViewMode,
    clearAllDocuments,
  } = useLocationsStore();

  const handleReset = () => {
    clearAllDocuments();
  };

  const handleRemoveCurrentDocument = () => {
    if (selectedDocument) {
      removeDocument(selectedDocument.id);
    }
  };

  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel sticky top-0 z-50 border-b"
    >
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="p-2 ocean-gradient rounded-lg">
              <Globe2 className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-display font-bold text-xl text-foreground">
                GeoData Manager
              </h1>
              <p className="text-xs text-muted-foreground">
                Gestión de ubicaciones KML
              </p>
            </div>
          </div>

          {/* Document selector */}
          <div className="flex-1 max-w-md flex items-center gap-2">
            {documents.length > 0 && (
              <>
                <Select
                  value={selectedDocument?.id || ''}
                  onValueChange={(value) => selectDocument(value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecciona un documento" />
                  </SelectTrigger>
                  <SelectContent>
                    {documents.map((doc) => (
                      <SelectItem key={doc.id} value={doc.id}>
                        <div className="flex items-center gap-2">
                          <span>{doc.name}</span>
                          <Badge variant="secondary" className="text-xs">
                            {doc.locations.length}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Delete current document */}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="icon" className="shrink-0">
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Eliminar documento?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Se eliminará "{selectedDocument?.name}" con todas sus ubicaciones. Esta acción no se puede deshacer.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={handleRemoveCurrentDocument} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Eliminar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* View mode toggle */}
            {selectedDocument && (
              <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
                <Button
                  variant={viewMode === 'map' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('map')}
                  className="h-8 w-8 p-0"
                  title="Solo mapa"
                >
                  <Map className="w-4 h-4" />
                </Button>
                <Button
                  variant={viewMode === 'split' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('split')}
                  className="h-8 w-8 p-0"
                  title="Vista dividida"
                >
                  <Columns className="w-4 h-4" />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  className="h-8 w-8 p-0"
                  title="Solo lista"
                >
                  <List className="w-4 h-4" />
                </Button>
              </div>
            )}

            {/* Reset button */}
            {documents.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <RotateCcw className="w-4 h-4" />
                    <span className="hidden sm:inline">Reiniciar</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Volver al inicio?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Se eliminarán todos los documentos y ubicaciones cargados. Esta acción no se puede deshacer.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleReset} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Reiniciar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            <Button
              onClick={onUploadClick}
              size="sm"
              className="gap-2 ocean-gradient"
            >
              <FileUp className="w-4 h-4" />
              Subir KML
            </Button>
          </div>
        </div>
      </div>
    </motion.header>
  );
}
