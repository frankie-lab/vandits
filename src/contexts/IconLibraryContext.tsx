import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type IconLibrary = 'lucide' | 'fontawesome' | 'heroicons' | 'phosphor' | 'tabler';

interface IconLibraryContextType {
  iconLibrary: IconLibrary;
  setIconLibrary: (lib: IconLibrary) => void;
}

const IconLibraryContext = createContext<IconLibraryContextType>({
  iconLibrary: 'lucide',
  setIconLibrary: () => {},
});

export function IconLibraryProvider({ children }: { children: React.ReactNode }) {
  const [iconLibrary, setIconLibraryState] = useState<IconLibrary>(() => {
    const stored = localStorage.getItem('vandits-icon-library');
    return (stored as IconLibrary) || 'lucide';
  });

  // Load global setting from DB
  useEffect(() => {
    supabase
      .from('app_settings' as any)
      .select('value')
      .eq('key', 'icon_library')
      .maybeSingle()
      .then(({ data }) => {
        if (data && (data as any).value) {
          const lib = (data as any).value as IconLibrary;
          setIconLibraryState(lib);
          localStorage.setItem('vandits-icon-library', lib);
        }
      });
  }, []);

  const setIconLibrary = useCallback((lib: IconLibrary) => {
    setIconLibraryState(lib);
    localStorage.setItem('vandits-icon-library', lib);
    window.dispatchEvent(new CustomEvent('icon-library-changed', { detail: { library: lib } }));
  }, []);

  // Listen for external changes
  useEffect(() => {
    const handler = (e: Event) => {
      const lib = (e as CustomEvent).detail?.library as IconLibrary;
      if (lib) setIconLibraryState(lib);
    };
    window.addEventListener('icon-library-changed', handler);
    return () => window.removeEventListener('icon-library-changed', handler);
  }, []);

  return (
    <IconLibraryContext.Provider value={{ iconLibrary, setIconLibrary }}>
      {children}
    </IconLibraryContext.Provider>
  );
}

export function useIconLibrary() {
  return useContext(IconLibraryContext);
}

export const ICON_LIBRARY_OPTIONS: { value: IconLibrary; label: string; description: string }[] = [
  { value: 'lucide', label: 'Lucide', description: 'Iconos de línea minimalistas (por defecto)' },
  { value: 'fontawesome', label: 'Font Awesome', description: 'Galería clásica con miles de iconos' },
  { value: 'heroicons', label: 'Heroicons', description: 'Iconos del equipo de Tailwind CSS' },
  { value: 'phosphor', label: 'Phosphor', description: 'Galería flexible con múltiples estilos' },
  { value: 'tabler', label: 'Tabler', description: 'Más de 5000 iconos de línea' },
];
