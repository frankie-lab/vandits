import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

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

  const setIconLibrary = useCallback((lib: IconLibrary) => {
    setIconLibraryState(lib);
    localStorage.setItem('vandits-icon-library', lib);
    window.dispatchEvent(new CustomEvent('icon-library-changed', { detail: { library: lib } }));
  }, []);

  // Listen for external changes (e.g. profile load)
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
