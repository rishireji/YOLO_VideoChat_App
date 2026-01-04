import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AppState, ChatMessage, REGION_LABELS, ReactionType, REACTION_EMOJIS, COST_PER_CALL } from '../types';
import { VideoFeed } from './VideoFeed';
import { Controls } from './Controls';
import { Sidebar } from './Sidebar';
import { MatchmakingOverlay } from './MatchmakingOverlay';
import { ReportModal } from './ReportModal';
import { useWebRTC } from '../hooks/useWebRTC';
import { useSession } from '../context/SessionContext';
import { useAuth } from '../context/AuthContext';
import { useModeration } from '../hooks/useModeration';
import { useTranslation } from '../hooks/useTranslation';

interface ChatRoomProps {
  onExit: () => void;
}

interface FloatingReaction {
  id: string;
  type: ReactionType;
  x: number;
  rotation: number;
  isLocal: boolean;
}

export const ChatRoom: React.FC<ChatRoomProps> = ({ onExit }) => {
  const { session, deductCoins } = useSession();
  const { user, profile, friendProfiles, sentRequests, receivedRequests, sendFriendRequest, acceptFriendRequest } = useAuth();
  const { translateText } = useTranslation();
  const [appState, setAppState] = useState<AppState>(AppState.MATCHMAKING);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [activeReactions, setActiveReactions] = useState<FloatingReaction[]>([]);
  const [isUserActive, setIsUserActive] = useState(true);
  const [remoteUid, setRemoteUid] = useState<string | null>(null);
  const hasDeductedRef = useRef<string | null>(null);

  const handleReactionReceived = useCallback((type: ReactionType) => {
    const id = Math.random().toString(36).substring(7);
    const x = 10 + Math.random() * 80;
    const rotation = -30 + Math.random() * 60;
    setActiveReactions(prev => [...prev, { id, type, x, rotation, isLocal: false }]);
    setTimeout(() => setActiveReactions(prev => prev.filter(r => r.id !== id)), 2500);
  }, []);

  const handleMessageReceived = useCallback(async (text: string) => {
    // 🔥 HANDLE IDENTITY MESSAGE
    try {
      const parsed = JSON.parse(text);
      if (parsed?.type === 'identity' && parsed?.uid) {
        console.log('[YOLO] Remote Firebase UID received:', parsed.uid);
        setRemoteUid(parsed.uid);
        return;
      }
    } catch {
      // not identity, continue as chat
    }

    const messageId = Math.random().toString(36).substring(7);
    const msg: ChatMessage = {
      id: messageId,
      senderId: 'stranger',
      text,
      timestamp: null,
      isTranslating: true
    };

    setMessages(prev => [...prev, msg]);

    const targetLang = session?.preferredLanguage || 'English';
    const translationResult = await translateText(text, targetLang);

    if (translationResult) {
      setMessages(prev =>
        prev.map(m =>
          m.id === messageId
            ? {
                ...m,
                translatedText: translationResult.translatedText,
                detectedLanguage: translationResult.detectedLanguage,
                isTranslating: false,
                isOriginalShown:
                  translationResult.detectedLanguage.toLowerCase() ===
                  targetLang.toLowerCase()
              }
            : m
        )
      );
    } else {
      setMessages(prev =>
        prev.map(m =>
          m.id === messageId ? { ...m, isTranslating: false } : m
        )
      );
    }
  }, [session?.preferredLanguage, translateText]);

  // --- FIX APPLIED HERE: ARGS REORDERED ---
  const {
    localStream,
    remoteStream,
    status,
    sendMessage,
    sendReaction,
    skip,
    isMuted,
    isVideoOff,
    toggleMute,
    toggleVideo,
    remotePeerId,
    revealIdentity,
  } = useWebRTC(
    session?.region || 'global',     // Arg 1: Region
    handleReactionReceived,          // Arg 2: Reaction Callback (Corrected)
    handleMessageReceived,           // Arg 3: Message Callback (Corrected)
    session?.gender,                 // Arg 4: Gender Filter (Passed correctly)
    session?.interests               // Arg 5: Interests Filter (Passed correctly)
  );

  const friendStatus = useMemo(() => {
    if (!remoteUid) return 'none';
    if (friendProfiles.some(f => f.uid === remoteUid)) return 'accepted';
    if (sentRequests.some(r => r.uid === remoteUid)) return 'sent';
    if (receivedRequests.some(r => r.uid === remoteUid)) return 'received';
    return 'none';
  }, [remoteUid, friendProfiles, sentRequests, receivedRequests]);

  useModeration(localStream);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') { e.preventDefault(); if (appState !== AppState.EXHAUSTED) skip(); }
      else if (e.code === 'Escape') { e.preventDefault(); onExit(); }
      else if (e.code === 'KeyM') toggleMute();
      else if (e.code === 'KeyV') toggleVideo();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [skip, onExit, toggleMute, toggleVideo, appState]);

  useEffect(() => {
    if (appState === AppState.EXHAUSTED) return;
    switch (status) {
      case 'matching':
      case 'connecting':
      case 'generating_id':
        setAppState(AppState.MATCHMAKING);
        break;
      case 'connected':
        setAppState(AppState.CONNECTED);
        if (remotePeerId && hasDeductedRef.current !== remotePeerId) {
          if (deductCoins(COST_PER_CALL)) hasDeductedRef.current = remotePeerId;
          else setAppState(AppState.EXHAUSTED);
        }
        setMessages([{ id: 'system-' + Date.now(), senderId: 'system', text: "Chat connected. Protocol secured.", timestamp: null }]);
        break;
      case 'disconnected': setAppState(AppState.DISCONNECTED); break;
    }
  }, [status, remotePeerId, deductCoins, appState]);

  const handleSocialAction = async () => {
    if (!user || !remoteUid) return;

    try {
      if (friendStatus === 'none') {
        // 🔑 reveal identity FIRST
        revealIdentity();
        // then persist request
        await sendFriendRequest(remoteUid);
      } else if (friendStatus === 'received') {
        await acceptFriendRequest(remoteUid);
      }
    } catch (err) {
      console.error("[YOLO Social] Social action failed:", err);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-screen w-full bg-zinc-950 overflow-hidden relative font-inter pt-20">
      <ReportModal isOpen={isReportModalOpen} onClose={() => setIsReportModalOpen(false)} onSubmit={() => skip()} />
      <div className="flex-1 flex flex-col relative h-[50vh] lg:h-full p-2 md:p-6 lg:p-8">
        <div className={`flex-1 relative rounded-[40px] md:rounded-[56px] overflow-hidden bg-black border border-white/5 shadow-[0_0_100px_rgba(0,0,0,0.5)] transition-all duration-700 ${appState === AppState.CONNECTED ? 'scale-100' : 'scale-[0.98]'}`}>
          {appState === AppState.MATCHMAKING && <MatchmakingOverlay regionName={REGION_LABELS[session?.region || 'global']} status={status} />}
          {appState === AppState.EXHAUSTED && <MatchmakingOverlay isExhausted={true} onCancel={onExit} />}
          <VideoFeed stream={remoteStream} isRemote label="Stranger" />
          
          <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
            {activeReactions.filter(r => !r.isLocal).map(reaction => (
              <div key={reaction.id} className="absolute bottom-0 text-5xl md:text-8xl animate-[floatUpEnhanced_2.5s_ease-out_forwards]" style={{ left: `${reaction.x}%`, '--rotation': `${reaction.rotation}deg` } as any}>
                {REACTION_EMOJIS[reaction.type]}
              </div>
            ))}
          </div>
          
          <div className="absolute top-6 left-6 w-32 md:w-56 aspect-video bg-zinc-950 rounded-2xl md:rounded-[32px] overflow-hidden shadow-2xl border border-white/10 z-30 group/pip transition-all hover:scale-105 active:scale-95">
            <VideoFeed stream={localStream} isRemote={false} label="You" isMuted={true} />
            <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
              {activeReactions.filter(r => r.isLocal).map(reaction => (
                <div key={reaction.id} className="absolute bottom-0 text-2xl md:text-4xl animate-[floatUpEnhanced_2.5s_ease-out_forwards]" style={{ left: `${reaction.x}%`, '--rotation': `${reaction.rotation}deg` } as any}>
                  {REACTION_EMOJIS[reaction.type]}
                </div>
              ))}
            </div>
          </div>

          {appState === AppState.CONNECTED && user && remoteUid && (
            <div className="absolute top-6 right-24 z-40 animate-in fade-in slide-in-from-right-2 duration-500">
               {friendStatus === 'none' && (
                 <button onClick={handleSocialAction} className="bg-white text-black px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-200 transition-all active:scale-95 shadow-2xl">
                    Request Friend
                 </button>
               )}
               {friendStatus === 'sent' && (
                 <div className="bg-zinc-900 border border-zinc-800 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-500">
                    Request Pending
                 </div>
               )}
               {friendStatus === 'received' && (
                 <button onClick={handleSocialAction} className="bg-green-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-green-500 transition-all active:scale-95 shadow-2xl animate-pulse">
                    Accept Handshake
                 </button>
               )}
               {friendStatus === 'accepted' && (
                 <div className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-2xl">
                    Trusted Node
                 </div>
               )}
            </div>
          )}

          <div className={`absolute bottom-8 left-1/2 -translate-x-1/2 z-50 transition-all duration-500 ${isUserActive || appState === AppState.MATCHMAKING ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
            <Controls appState={appState} onNext={skip} onExit={onExit} isMuted={isMuted} isVideoOff={isVideoOff} onToggleMute={toggleMute} onToggleVideo={toggleVideo} onReport={() => setIsReportModalOpen(true)} onSendReaction={(type) => { if (appState === AppState.CONNECTED) { sendReaction(type); handleReactionReceived(type); } }} />
          </div>
        </div>
      </div>
      <Sidebar messages={messages} onSendMessage={(text) => { const msg: ChatMessage = { id: Date.now().toString(), senderId: 'me', text, timestamp: null }; setMessages(prev => [...prev, msg]); sendMessage(text); }} onToggleTranslation={(id) => setMessages(prev => prev.map(m => m.id === id ? { ...m, isOriginalShown: !m.isOriginalShown } : m))} isConnected={appState === AppState.CONNECTED} region={session?.region || 'global'} />
    </div>
  );
};