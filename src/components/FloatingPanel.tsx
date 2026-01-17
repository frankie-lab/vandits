import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Minimize2, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';

// Standard width for all right-side panels (mobile-friendly max width)
export const RIGHT_PANEL_WIDTH = 'w-full max-w-sm';

interface FloatingPanelProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  isOpen: boolean;
  onClose: () => void;
  position?: 'left' | 'right';
  className?: string;
  topOffset?: string;
}

export function FloatingPanel({
  title,
  icon,
  children,
  isOpen,
  onClose,
  position = 'left',
  className,
  topOffset,
}: FloatingPanelProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const isMobile = useIsMobile();

  // Mobile: use Drawer from bottom
  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DrawerContent className="max-h-[85vh] z-[2001]">
          <DrawerHeader className="flex items-center justify-between gap-2 px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              {icon}
              <DrawerTitle className="text-sm font-medium">{title}</DrawerTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onClose}
            >
              <X className="w-4 h-4" />
            </Button>
          </DrawerHeader>
          <div className="flex-1 overflow-auto max-h-[calc(85vh-60px)]">
            {children}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  // Desktop: floating panel
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: position === 'left' ? -20 : 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: position === 'left' ? -20 : 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className={cn(
            'fixed z-[1000] bg-background/95 backdrop-blur-md shadow-2xl border border-border/50 overflow-hidden flex flex-col',
            position === 'left' && 'left-4 rounded-r-xl rounded-l-lg',
            position === 'right' && 'rounded-l-xl rounded-r-lg',
            position === 'right' && !className?.includes('right-[') && 'right-4',
            topOffset ? topOffset : 'top-16',
            'bottom-4',
            isMinimized ? 'w-12' : RIGHT_PANEL_WIDTH,
            className
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-muted/50 shrink-0">
            <div className="flex items-center gap-2">
              {icon}
              {!isMinimized && <span className="font-medium text-sm">{title}</span>}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setIsMinimized(!isMinimized)}
              >
                {isMinimized ? (
                  <Maximize2 className="w-3.5 h-3.5" />
                ) : (
                  <Minimize2 className="w-3.5 h-3.5" />
                )}
              </Button>
              {!isMinimized && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={onClose}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>

          {/* Content */}
          {!isMinimized && (
            <div className="flex-1 overflow-auto">
              {children}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
