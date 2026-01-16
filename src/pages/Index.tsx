import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe2, MapPin, Sparkles } from 'lucide-react';
import { Header } from '@/components/Header';
import { FileUploadZone } from '@/components/FileUploadZone';
import { LocationMap } from '@/components/LocationMap';
import { LocationList } from '@/components/LocationList';
import { FilterBar } from '@/components/FilterBar';
import { ExportPanel } from '@/components/ExportPanel';
import { useLocationsStore } from '@/store/locations-store';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const Index = () => {
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const { selectedDocument, viewMode, getFilteredLocations } = useLocationsStore();

  const hasDocument = !!selectedDocument;
  const locationCount = getFilteredLocations().length;

  return (
    <div className="min-h-screen surface-gradient">
      <Header onUploadClick={() => setShowUploadDialog(true)} />

      <main className="container mx-auto px-4 py-6">
        <AnimatePresence mode="wait">
          {!hasDocument ? (
            // Welcome screen
            <motion.div
              key="welcome"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center min-h-[70vh] gap-8"
            >
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-center space-y-4"
              >
                <div className="relative inline-block">
                  <div className="p-6 ocean-gradient rounded-3xl shadow-xl">
                    <Globe2 className="w-16 h-16 text-primary-foreground" />
                  </div>
                  <motion.div
                    className="absolute -top-2 -right-2 p-2 bg-secondary rounded-full shadow-lg"
                    animate={{ rotate: [0, 10, -10, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Sparkles className="w-5 h-5 text-secondary-foreground" />
                  </motion.div>
                </div>
                
                <h2 className="font-display text-3xl font-bold text-foreground">
                  Bienvenido a GeoData Manager
                </h2>
                <p className="text-lg text-muted-foreground max-w-md">
                  Sube tus archivos KML, organiza tus ubicaciones por continente, 
                  país o región, y exporta con facilidad.
                </p>
              </motion.div>

              <FileUploadZone onUploadComplete={() => setShowUploadDialog(false)} />

              {/* Features */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8 w-full max-w-3xl"
              >
                {[
                  { icon: MapPin, title: '+2500 puntos', desc: 'Maneja miles de ubicaciones' },
                  { icon: Globe2, title: 'Organización', desc: 'Por continente, país y región' },
                  { icon: Sparkles, title: 'Exportación', desc: 'KML, CSV y JSON' },
                ].map((feature, i) => (
                  <motion.div
                    key={feature.title}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 + i * 0.1 }}
                    className="flex flex-col items-center gap-3 p-6 bg-card rounded-xl shadow-soft text-center"
                  >
                    <feature.icon className="w-8 h-8 text-primary" />
                    <h3 className="font-display font-semibold text-foreground">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground">{feature.desc}</p>
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>
          ) : (
            // Main workspace
            <motion.div
              key="workspace"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              {/* Stats bar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <h2 className="font-display text-xl font-semibold text-foreground">
                    {selectedDocument.name}
                  </h2>
                  <span className="text-sm text-muted-foreground">
                    {locationCount} ubicaciones
                  </span>
                </div>
                <ExportPanel />
              </div>

              {/* Main content area */}
              <div className="grid gap-4" style={{ 
                gridTemplateColumns: viewMode === 'split' 
                  ? '320px 1fr' 
                  : '1fr',
                height: 'calc(100vh - 200px)',
              }}>
                {/* Sidebar with filters and list */}
                {(viewMode === 'split' || viewMode === 'list') && (
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="bg-card rounded-xl shadow-soft overflow-hidden flex flex-col"
                  >
                    <div className="p-4 border-b">
                      <FilterBar />
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <LocationList />
                    </div>
                  </motion.div>
                )}

                {/* Map */}
                {(viewMode === 'split' || viewMode === 'map') && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-card rounded-xl shadow-soft overflow-hidden"
                  >
                    <LocationMap />
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-display">Subir archivo KML</DialogTitle>
          </DialogHeader>
          <FileUploadZone onUploadComplete={() => setShowUploadDialog(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Index;
