import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/domains/identity';

export interface SocialStats {
 myLocationsCount: number;
 followedLocationsCount: number;
 followingCount: number;
 followersCount: number;
 pendingFollowersCount: number;
}

export function useSocialStats() {
 const { user } = useAuth();
 const [stats, setStats] = useState<SocialStats>({
 myLocationsCount: 0,
 followedLocationsCount: 0,
 followingCount: 0,
 followersCount: 0,
 pendingFollowersCount: 0,
 });
 const [loading, setLoading] = useState(true);

 const fetchStats = useCallback(async () => {
 if (!user) {
 setStats({
 myLocationsCount: 0,
 followedLocationsCount: 0,
 followingCount: 0,
 followersCount: 0,
 pendingFollowersCount: 0,
 });
 setLoading(false);
 return;
 }

 try {
      // Fetch all stats in parallel
 const [
 myDocsResult,
 followingResult,
 followersResult,
 pendingFollowersResult,
 ] = await Promise.all([
        // My documents with location count
 supabase
 .from('documents')
 .select('id')
 .eq('user_id', user.id),
 
        // Following count (accepted)
 supabase
 .from('follows')
 .select('id', { count: 'exact', head: true })
 .eq('follower_id', user.id)
 .eq('status', 'accepted'),
 
        // Followers count (accepted)
 supabase
 .from('follows')
 .select('id', { count: 'exact', head: true })
 .eq('following_id', user.id)
 .eq('status', 'accepted'),
 
        // Pending follower requests
 supabase
 .from('follows')
 .select('id', { count: 'exact', head: true })
 .eq('following_id', user.id)
 .eq('status', 'pending'),
 ]);

      // Get my locations count
 let myLocationsCount = 0;
 if (myDocsResult.data && myDocsResult.data.length > 0) {
 const docIds = myDocsResult.data.map(d => d.id);
 const { count } = await supabase
 .from('locations')
 .select('id', { count: 'exact', head: true })
 .in('document_id', docIds);
 myLocationsCount = count || 0;
 }

      // Get followed users' locations count
 let followedLocationsCount = 0;
 if (followingResult.count && followingResult.count > 0) {
        // Get users I follow
 const { data: followedUsers } = await supabase
 .from('follows')
 .select('following_id')
 .eq('follower_id', user.id)
 .eq('status', 'accepted');
 
 if (followedUsers && followedUsers.length > 0) {
 const followedUserIds = followedUsers.map(f => f.following_id);
 
          // Get their documents
 const { data: followedDocs } = await supabase
 .from('documents')
 .select('id')
 .in('user_id', followedUserIds);
 
 if (followedDocs && followedDocs.length > 0) {
 const docIds = followedDocs.map(d => d.id);
 const { count } = await supabase
 .from('locations')
 .select('id', { count: 'exact', head: true })
 .in('document_id', docIds)
 .neq('visibility', 'private');
 followedLocationsCount = count || 0;
 }
 }
 }

 setStats({
 myLocationsCount,
 followedLocationsCount,
 followingCount: followingResult.count || 0,
 followersCount: followersResult.count || 0,
 pendingFollowersCount: pendingFollowersResult.count || 0,
 });
 } catch (error) {
 console.error('Error fetching social stats:', error);
 } finally {
 setLoading(false);
 }
 }, [user]);

 useEffect(() => {
 fetchStats();
 }, [fetchStats]);

  // Listen for realtime updates
 useEffect(() => {
 if (!user) return;

 const channel = supabase
 .channel('social-stats')
 .on(
 'postgres_changes',
 { event: '*', schema: 'public', table: 'follows' },
 () => fetchStats()
 )
 .on(
 'postgres_changes',
 { event: '*', schema: 'public', table: 'locations' },
 () => fetchStats()
 )
 .subscribe();

 return () => {
 supabase.removeChannel(channel);
 };
 }, [user, fetchStats]);

 return { stats, loading, refresh: fetchStats };
}
