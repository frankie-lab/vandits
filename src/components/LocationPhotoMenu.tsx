import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Camera, Upload, Search, ImageIcon, X, Cloud } from 'lucide-react';
import { LocationPhotoUpload } from './LocationPhotoUpload';
import { LocationPhotoSearch } from './LocationPhotoSearch';
import { OneDrivePhotoBrowser } from './OneDrivePhotoBrowser';
import { cn } from '@/lib/utils';

interface LocationPhotoMenuProps {
 locationId: string;
 locationName: string;
 locationCoordinates: { lat: number; lng: number };
 hasUserImage: boolean;
 isAdminOrMaster: boolean;
 onPhotoUpdated: (imageUrl?: string) => void;
 defaultVisibility?: string;
}

export function LocationPhotoMenu({
 locationId,
 locationName,
 locationCoordinates,
 hasUserImage,
 isAdminOrMaster,
 onPhotoUpdated,
 defaultVisibility = 'private',
}: LocationPhotoMenuProps) {
 const [showMenu, setShowMenu] = useState(true); // Open by default
  const [showUpload, setShowUpload] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showOneDrive, setShowOneDrive] = useState(false);
  const [searchMode, setSearchMode] = useState<'user' | 'admin'>('user');

 const handleUploadComplete = (imageUrl: string) => {
 onPhotoUpdated(imageUrl);
 };

 const handleSearchSelect = (imageUrl: string) => {
 onPhotoUpdated(imageUrl);
 };

 const openUpload = () => {
 setShowMenu(false);
 setShowUpload(true);
 };

 const openSearchAsUser = () => {
 setSearchMode('user');
 setShowMenu(false);
 setShowSearch(true);
 };

 const openSearchAsAdmin = () => {
 setSearchMode('admin');
 setShowMenu(false);
 setShowSearch(true);
 };

 const handleClose = () => {
 setShowMenu(false);
    // Will trigger parent to clear photoUploadLocation
 onPhotoUpdated();
 };

 const handleUploadClose = () => {
 setShowUpload(false);
    // Return to menu or close entirely
 handleClose();
 };

 const handleSearchClose = () => {
 setShowSearch(false);
 handleClose();
 };

 return (
 <>
 {/* Main Menu Dialog */}
 <Dialog open={showMenu} onOpenChange={(open) => !open && handleClose()}>
 <DialogContent className="sm:max-w-sm z-[2001]">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Camera className="w-5 h-5" />
 Foto de {locationName}
 </DialogTitle>
 </DialogHeader>

 <div className="space-y-2">
 {/* Upload own photo */}
 <button
 onClick={openUpload}
 className={cn(
 'w-full flex items-center gap-3 p-4 rounded-xl',
 'bg-muted/50 hover:bg-muted transition-colors text-left'
 )}
 >
 <div className="p-2 bg-primary/10 rounded-lg">
 <Upload className="w-5 h-5 text-primary" />
 </div>
 <div>
 <p className="font-medium text-sm">Subir mi foto</p>
 <p className="text-xs text-muted-foreground">
 Elige visibilidad: privada, seguidores o pública
 </p>
 </div>
 </button>

 {/* Search Wikimedia for personal use */}
 <button
 onClick={openSearchAsUser}
 className={cn(
 'w-full flex items-center gap-3 p-4 rounded-xl',
 'bg-muted/50 hover:bg-muted transition-colors text-left'
 )}
 >
 <div className="p-2 bg-blue-500/10 rounded-lg">
 <Search className="w-5 h-5 text-blue-500" />
 </div>
 <div>
 <p className="font-medium text-sm">Buscar fotos del lugar</p>
 <p className="text-xs text-muted-foreground">
 Solo tú verás la imagen seleccionada
 </p>
 </div>
 </button>

 {/* Admin option: Set official image */}
 {isAdminOrMaster && (
 <button
 onClick={openSearchAsAdmin}
 className={cn(
 'w-full flex items-center gap-3 p-4 rounded-xl',
 'bg-amber-500/10 hover:bg-amber-500/20 transition-colors text-left',
 'border border-amber-500/30'
 )}
 >
 <div className="p-2 bg-amber-500/20 rounded-lg">
 <ImageIcon className="w-5 h-5 text-amber-600" />
 </div>
 <div>
 <p className="font-medium text-sm text-amber-700 dark:text-amber-400">
 Establecer imagen oficial
 </p>
 <p className="text-xs text-amber-600/70 dark:text-amber-500/70">
 Visible para todos los usuarios (Admin)
 </p>
 </div>
 </button>
 )}
 </div>
 </DialogContent>
 </Dialog>

 {/* Upload Dialog */}
 <LocationPhotoUpload
 locationId={locationId}
 locationName={locationName}
 locationCoordinates={locationCoordinates}
 isOpen={showUpload}
 onClose={handleUploadClose}
 onPhotoUploaded={handleUploadComplete}
 defaultVisibility={defaultVisibility}
 />

 {/* Search Dialog */}
 <LocationPhotoSearch
 locationId={locationId}
 locationName={locationName}
 locationCoordinates={locationCoordinates}
 isOpen={showSearch}
 onClose={handleSearchClose}
 onPhotoSelected={handleSearchSelect}
 isAdminMode={searchMode === 'admin'}
 />
 </>
 );
}
