// Domain: Social — relationships, follows, stats

export interface SocialStats {
  myLocationsCount: number;
  followedLocationsCount: number;
  followingCount: number;
  followersCount: number;
  pendingFollowersCount: number;
}

export type FollowStatus = 'pending' | 'accepted' | 'rejected';
