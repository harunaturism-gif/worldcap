export interface User {
  id: string;
  username: string;
  createdAt: string;
}

export interface WorldIdentity {
  id: string;
  userId: string;
  rpId: string;
  verificationLevel: 'proof_of_human';
  lastVerifiedAt: string;
}

export interface AppSession {
  user: Pick<User, 'id' | 'username'>;
  mode: 'development' | 'world-id';
}

