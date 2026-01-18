import React, { useState, useEffect } from 'react';
import { Users, X, Search, MapPin, Shield, Crown, Edit3, Eye, UserCheck, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface UserWithStats {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  roles: string[];
  locationCount: number;
}

interface UsersSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onUserClick?: (userId: string) => void;
}

const roleIcons: Record<string, React.ReactNode> = {
  master: <Crown className="w-3 h-3 text-amber-500" />,
  admin: <Shield className="w-3 h-3 text-blue-500" />,
  editor: <Edit3 className="w-3 h-3 text-green-500" />,
  moderator: <UserCheck className="w-3 h-3 text-purple-500" />,
  supervisor: <Eye className="w-3 h-3 text-orange-500" />,
};

const roleColors: Record<string, string> = {
  master: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  admin: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  editor: 'bg-green-500/20 text-green-400 border-green-500/30',
  moderator: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  supervisor: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  user: 'bg-muted text-muted-foreground border-border',
};

export function UsersSidebar({ isOpen, onClose, onUserClick }: UsersSidebarProps) {
  const [users, setUsers] = useState<UserWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
    }
  }, [isOpen]);

  const fetchUsers = async () => {
    try {
      setLoading(true);

      // Fetch profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch user roles
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      // Fetch documents with IDs
      const { data: docsWithIds } = await supabase
        .from('documents')
        .select('id, user_id');

      const docToUser: Record<string, string> = {};
      docsWithIds?.forEach(doc => {
        if (doc.user_id) {
          docToUser[doc.id] = doc.user_id;
        }
      });

      // Get location counts
      const { data: locationCounts } = await supabase
        .from('locations')
        .select('document_id, id');

      const userLocationCounts: Record<string, number> = {};
      locationCounts?.forEach(loc => {
        if (loc.document_id && docToUser[loc.document_id]) {
          const userId = docToUser[loc.document_id];
          userLocationCounts[userId] = (userLocationCounts[userId] || 0) + 1;
        }
      });

      // Build roles map
      const rolesMap: Record<string, string[]> = {};
      rolesData?.forEach(r => {
        if (!rolesMap[r.user_id]) rolesMap[r.user_id] = [];
        rolesMap[r.user_id].push(r.role);
      });

      // Combine data
      const usersWithStats: UserWithStats[] = (profiles || []).map(profile => ({
        id: profile.id,
        username: profile.username,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        roles: rolesMap[profile.id] || ['user'],
        locationCount: userLocationCounts[profile.id] || 0,
      }));

      // Sort by location count descending
      usersWithStats.sort((a, b) => b.locationCount - a.locationCount);

      setUsers(usersWithStats);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(user => {
    const term = searchTerm.toLowerCase();
    return (
      user.username.toLowerCase().includes(term) ||
      (user.display_name?.toLowerCase().includes(term) ?? false)
    );
  });

  const getPrimaryRole = (roles: string[]): string => {
    const priority = ['master', 'admin', 'moderator', 'supervisor', 'editor', 'user'];
    for (const role of priority) {
      if (roles.includes(role)) return role;
    }
    return 'user';
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[1500]"
          />

          {/* Panel */}
          <motion.div
            initial={{ x: -320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -320, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={cn(
              'fixed left-4 top-20 bottom-20 w-80 z-[1501]',
              'bg-card/95 backdrop-blur-xl rounded-2xl',
              'border border-border/50 shadow-2xl',
              'flex flex-col overflow-hidden'
            )}
          >
            {/* Header */}
            <div className="p-4 border-b border-border/50">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-foreground">Usuarios</h2>
                    <p className="text-xs text-muted-foreground">{users.length} registrados</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="h-8 w-8 rounded-full"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar usuario..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-9 bg-muted/50 border-0 rounded-xl"
                />
              </div>
            </div>

            {/* User List */}
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-1">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl">
                      <Skeleton className="w-10 h-10 rounded-full" />
                      <div className="flex-1">
                        <Skeleton className="h-4 w-28 mb-1.5" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                      <Skeleton className="h-5 w-12 rounded-full" />
                    </div>
                  ))
                ) : filteredUsers.length === 0 ? (
                  <div className="text-center text-muted-foreground text-sm py-12">
                    <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p>No se encontraron usuarios</p>
                  </div>
                ) : (
                  filteredUsers.map((user, index) => {
                    const primaryRole = getPrimaryRole(user.roles);
                    return (
                      <motion.button
                        key={user.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.03 }}
                        onClick={() => onUserClick?.(user.id)}
                        className={cn(
                          'w-full flex items-center gap-3 p-3 rounded-xl',
                          'hover:bg-accent/50 active:scale-[0.98] transition-all text-left',
                          'group'
                        )}
                      >
                        {/* Avatar */}
                        <div className="relative shrink-0">
                          {user.avatar_url ? (
                            <img
                              src={user.avatar_url}
                              alt={user.username}
                              className="w-10 h-10 rounded-full object-cover ring-2 ring-border/50"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center ring-2 ring-border/50">
                              <span className="text-sm font-semibold text-primary">
                                {(user.display_name || user.username).charAt(0).toUpperCase()}
                              </span>
                            </div>
                          )}
                          {/* Role badge */}
                          <div className="absolute -bottom-0.5 -right-0.5 bg-card rounded-full p-0.5 shadow-sm">
                            {roleIcons[primaryRole] || <Users className="w-3 h-3 text-muted-foreground" />}
                          </div>
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-foreground truncate">
                            {user.display_name || user.username}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            @{user.username}
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <Badge
                            variant="outline"
                            className={cn('text-[10px] px-2 py-0.5 rounded-full capitalize', roleColors[primaryRole])}
                          >
                            {primaryRole}
                          </Badge>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="w-3 h-3" />
                            <span>{user.locationCount}</span>
                          </div>
                        </div>

                        {/* Arrow */}
                        <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-foreground transition-colors shrink-0" />
                      </motion.button>
                    );
                  })
                )}
              </div>
            </ScrollArea>

            {/* Footer Stats */}
            <div className="p-4 border-t border-border/50 bg-muted/20">
              <div className="flex justify-between items-center">
                <div className="text-xs text-muted-foreground">
                  Total de puntos
                </div>
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-primary" />
                  <span className="font-semibold text-foreground">
                    {users.reduce((acc, u) => acc + u.locationCount, 0).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
