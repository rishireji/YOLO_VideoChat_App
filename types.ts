export type Region = 'global' | 'us-east' | 'us-west' | 'europe' | 'asia' | 'south-america' | 'africa' | 'oceania';

export type ReactionType = 'like' | 'laugh' | 'hug' | 'heart' | 'wow';

export type RevealRule = 'mutual' | 'time' | 'manual';

import firebase from 'firebase/compat/app';

export interface FriendRequest {
  uid: string;
  name: string;
  photoURL: string | null;
  status: 'pending';
  createdAt: firebase.firestore.Timestamp | null;
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
}

export interface UserFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
  storagePath: string;
  createdAt: firebase.firestore.Timestamp | null;
  notes: string;
  aiSummary: string;
}


export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  Profile_photo: string | null;
  Display_Pic1: string | null;
  Display_Pic2: string | null;
  Display_Pic3: string | null;
  bio: string;
  allowFriendRequests: boolean;
  revealPhotosToFriendsOnly: boolean;
  revealRule: RevealRule;
  revealTimeMinutes: number;
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

import { Timestamp } from 'firebase/firestore';

export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  timestamp: Timestamp | null;
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