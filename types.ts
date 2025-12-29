export type Region = 'global' | 'us-east' | 'us-west' | 'europe' | 'asia' | 'south-america' | 'africa' | 'oceania';

export type ReactionType = 'like' | 'laugh' | 'hug' | 'heart' | 'wow';

export interface UserProfile {
  uid: string;
  photos: string[]; // base64 or URL
  primaryPhotoIndex: number;
  bio: string;
  allowFriendRequests: boolean;
  revealPhotosToFriendsOnly: boolean;
  friends: string[]; // UIDs
}

export interface UserSession {
  id: string;
  token: string;
  region: Region;
  isModerated: boolean;
  expiresAt: number;
  preferredLanguage: string;
  coins: number;
  purchasedCoins: number;
  lastResetAt: number;
  uid?: string; // Firebase UID if signed in
}

export interface SignalingMessage {
  type: 'presence' | 'match_request' | 'match_accept' | 'offer' | 'answer' | 'candidate' | 'disconnect' | 'friend_request' | 'friend_accept';
  senderId: string;
  targetId?: string;
  region?: Region;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  payload?: any;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  timestamp: number;
  translatedText?: string;
  detectedLanguage?: string;
  isOriginalShown?: boolean;
  isTranslating?: boolean;
}

export enum AppState {
  IDLE = 'IDLE',
  MATCHMAKING = 'MATCHMAKING',
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  EXHAUSTED = 'EXHAUSTED'
}

export const REGION_LABELS: Record<Region, string> = {
  'global': 'Global Match',
  'us-east': 'North America (East)',
  'us-west': 'North America (West)',
  'europe': 'Europe',
  'asia': 'Asia Pacific',
  'south-america': 'South America',
  'africa': 'Africa',
  'oceania': 'Oceania'
};

export const REACTION_EMOJIS: Record<ReactionType, string> = {
  like: '👍',
  laugh: '😂',
  hug: '🫂',
  heart: '❤️',
  wow: '😮'
};

export const REPORT_REASONS = [
  { id: 'nudity', label: 'Nudity or Sexual Content' },
  { id: 'violence', label: 'Violence or Gore' },
  { id: 'harassment', label: 'Harassment or Bullying' },
  { id: 'hate', label: 'Hate Speech' },
  { id: 'spam', label: 'Spam or Scam' },
  { id: 'other', label: 'Other' }
];

export const COST_PER_CALL = 10;
export const DAILY_ALLOWANCE = 250;