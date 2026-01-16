import React, { useCallback } from 'react';
import { Upload, FileUp, Globe2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { parseKML } from '@/lib/kml-parser';
import { useLocationsStore } from '@/store/locations-store';
import { saveDocumentToDatabase } from '@/hooks/use-database-sync';
import { toast } from 'sonner';

interface FileUploadZoneProps {
  onUploadComplete?: () => void;
}

export function FileUploadZone({ onUploadComplete }: FileUploadZoneProps) {
  const addDocument = useLocationsStore(state => state.addDocument);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.kml')) {
      toast.error('Por favor, sube un archivo KML válido');
      return;
    }

    setIsProcessing(true);
    
    try {
      const content = await file.text();
      const document = parseKML(content, file.name);
      
      // Save to database first
      const saved = await saveDocumentToDatabase(document);
      
      if (saved) {
        addDocument(document);
        toast.success(`Guardado: ${document.locations.length} ubicaciones en base de datos`);
        onUploadComplete?.();
      }
    } catch (error) {
      console.error('Error parsing KML:', error);
      toast.error('Error al procesar el archivo KML');
    } finally {
      setIsProcessing(false);
    }
  }, [addDocument, onUploadComplete]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-2xl mx-auto"
    >
      <label
        className={`
          relative flex flex-col items-center justify-center w-full h-64 
          border-2 border-dashed rounded-xl cursor-pointer
          transition-all duration-300 ease-out
          ${isDragging 
            ? 'border-primary bg-accent/50 scale-[1.02]' 
            : 'border-border bg-card hover:border-primary/50 hover:bg-muted/50'
          }
          ${isProcessing ? 'pointer-events-none opacity-70' : ''}
        `}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept=".kml"
          className="hidden"
          onChange={handleFileInput}
          disabled={isProcessing}
        />
        
        <motion.div
          animate={isDragging ? { scale: 1.1, y: -5 } : { scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="flex flex-col items-center gap-4"
        >
          <div className={`
            p-4 rounded-full transition-colors duration-300
            ${isDragging ? 'ocean-gradient text-primary-foreground' : 'bg-muted text-muted-foreground'}
          `}>
            {isProcessing ? (
              <Globe2 className="w-10 h-10 animate-spin" />
            ) : isDragging ? (
              <FileUp className="w-10 h-10" />
            ) : (
              <Upload className="w-10 h-10" />
            )}
          </div>
          
          <div className="text-center space-y-2">
            <p className="text-lg font-medium text-foreground">
              {isProcessing 
                ? 'Procesando archivo...' 
                : isDragging 
                  ? 'Suelta el archivo aquí' 
                  : 'Arrastra tu archivo KML aquí'
              }
            </p>
            <p className="text-sm text-muted-foreground">
              o haz clic para seleccionar
            </p>
          </div>
        </motion.div>
        
        {/* Animated border effect */}
        {isDragging && (
          <motion.div
            className="absolute inset-0 rounded-xl border-2 border-primary"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        )}
      </label>
    </motion.div>
  );
}
