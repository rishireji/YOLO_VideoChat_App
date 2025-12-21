
export type Region = 'global' | 'us-east' | 'us-west' | 'europe' | 'asia' | 'south-america' | 'africa' | 'oceania';

export type ReactionType = 'like' | 'laugh' | 'hug' | 'heart' | 'wow';

export interface UserSession {
  id: string;
  token: string;
  region: Region;
  isModerated: boolean;
  expiresAt: number;
  preferredLanguage: string;
}

export interface SignalingMessage {
  type: 'offer' | 'answer' | 'candidate' | 'match_found';
  senderId: string;
  targetId?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
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
  DISCONNECTED = 'DISCONNECTED'
}

export interface ReportReason {
  id: string;
  label: string;
}

export const REPORT_REASONS: ReportReason[] = [
  { id: 'nudity', label: 'Nudity or Sexual Content' },
  { id: 'harassment', label: 'Harassment or Bullying' },
  { id: 'hate', label: 'Hate Speech' },
  { id: 'spam', label: 'Spam or Bot' },
  { id: 'other', label: 'Other' }
];

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
