import React, { useState, useEffect } from 'react';
import { Users, ChevronLeft, ChevronRight, Search, MapPin, Shield, Crown, Edit3, Eye, UserCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

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
  onToggle: () => void;
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
  master: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  admin: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  editor: 'bg-green-500/20 text-green-300 border-green-500/30',
  moderator: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  supervisor: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  user: 'bg-muted text-muted-foreground border-border',
};

export function UsersSidebar({ isOpen, onToggle, onUserClick }: UsersSidebarProps) {
  const [users, setUsers] = useState<UserWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

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

      // Fetch location counts per user (via documents)
      const { data: documents, error: docsError } = await supabase
        .from('documents')
        .select('user_id');

      if (docsError) throw docsError;

      // Count documents per user
      const docCounts: Record<string, number> = {};
      documents?.forEach(doc => {
        if (doc.user_id) {
          docCounts[doc.user_id] = (docCounts[doc.user_id] || 0) + 1;
        }
      });

      // Get location counts
      const { data: locationCounts, error: locError } = await supabase
        .from('locations')
        .select('document_id, id');

      // Map locations to users via documents
      const userLocationCounts: Record<string, number> = {};
      
      if (locationCounts && documents) {
        const docToUser: Record<string, string> = {};
        documents.forEach(doc => {
          if (doc.user_id) {
            // We need document IDs, let's fetch them properly
          }
        });
      }

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
    <div
      className={cn(
        'fixed left-0 top-0 h-full z-[1000] transition-all duration-300 ease-in-out',
        'bg-card/95 backdrop-blur-md border-r border-border shadow-xl',
        isOpen ? 'w-72' : 'w-12'
      )}
    >
      {/* Toggle Button */}
      <button
        onClick={onToggle}
        className={cn(
          'absolute -right-3 top-1/2 -translate-y-1/2 z-10',
          'w-6 h-12 bg-primary rounded-r-lg',
          'flex items-center justify-center',
          'hover:bg-primary/90 transition-colors',
          'shadow-lg'
        )}
      >
        {isOpen ? (
          <ChevronLeft className="w-4 h-4 text-primary-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-primary-foreground" />
        )}
      </button>

      {/* Collapsed State */}
      {!isOpen && (
        <div className="h-full flex flex-col items-center pt-4 gap-2">
          <Users className="w-5 h-5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground writing-mode-vertical rotate-180" style={{ writingMode: 'vertical-rl' }}>
            Usuarios
          </span>
        </div>
      )}

      {/* Expanded State */}
      {isOpen && (
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-5 h-5 text-primary" />
              <h2 className="font-semibold text-foreground">Usuarios</h2>
              <Badge variant="secondary" className="ml-auto">
                {users.length}
              </Badge>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar usuario..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
          </div>

          {/* User List */}
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {loading ? (
                // Skeleton loading
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-2">
                    <Skeleton className="w-8 h-8 rounded-full" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-24 mb-1" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                ))
              ) : filteredUsers.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-8">
                  No se encontraron usuarios
                </div>
              ) : (
                filteredUsers.map((user) => {
                  const primaryRole = getPrimaryRole(user.roles);
                  return (
                    <button
                      key={user.id}
                      onClick={() => onUserClick?.(user.id)}
                      className={cn(
                        'w-full flex items-center gap-3 p-2 rounded-lg',
                        'hover:bg-accent/50 transition-colors text-left',
                        'group'
                      )}
                    >
                      {/* Avatar */}
                      <div className="relative">
                        {user.avatar_url ? (
                          <img
                            src={user.avatar_url}
                            alt={user.username}
                            className="w-8 h-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                            <span className="text-xs font-medium text-muted-foreground">
                              {user.username.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                        {/* Role indicator */}
                        <div className="absolute -bottom-0.5 -right-0.5 bg-card rounded-full p-0.5">
                          {roleIcons[primaryRole] || <Users className="w-3 h-3 text-muted-foreground" />}
                        </div>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="text-sm font-medium text-foreground truncate">
                            {user.display_name || user.username}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="truncate">@{user.username}</span>
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="flex flex-col items-end gap-1">
                        <Badge
                          variant="outline"
                          className={cn('text-[10px] px-1.5 py-0', roleColors[primaryRole])}
                        >
                          {primaryRole}
                        </Badge>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="w-3 h-3" />
                          <span>{user.locationCount}</span>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>

          {/* Footer Stats */}
          <div className="p-3 border-t border-border bg-muted/30">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Total puntos:</span>
              <span className="font-medium text-foreground">
                {users.reduce((acc, u) => acc + u.locationCount, 0)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
