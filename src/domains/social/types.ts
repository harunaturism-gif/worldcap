export interface Profile {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  avatarSeed: string;
  verifiedHuman: boolean;
  createdAt: string;
}

export type PostKind = 'member' | 'purchase_activity' | 'winner_activity' | 'jackpot_milestone';

export interface Post {
  id: string;
  profileId: string;
  kind: PostKind;
  body: string;
  referenceId: string | null;
  createdAt: string;
}

export interface Follow {
  id: string;
  followerProfileId: string;
  followedProfileId: string;
  createdAt: string;
}

export interface Reaction {
  id: string;
  postId: string;
  profileId: string;
  kind: 'celebrate';
  createdAt: string;
}

