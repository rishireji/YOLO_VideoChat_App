import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, ChatMessage, REGION_LABELS, ReactionType, REACTION_EMOJIS, COST_PER_CALL } from '../types';
import { VideoFeed } from './VideoFeed';
import { Controls } from './Controls';
import { Sidebar } from './Sidebar';
import { MatchmakingOverlay } from './MatchmakingOverlay';
import { ReportModal } from './ReportModal';
import { useWebRTC } from '../hooks/useWebRTC';
import { useSession } from '../context/SessionContext';
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
  const { translateText } = useTranslation();
  const [appState, setAppState] = useState<AppState>(AppState.MATCHMAKING);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [activeReactions, setActiveReactions] = useState<FloatingReaction[]>([]);
  const [isUserActive, setIsUserActive] = useState(true);
  const hasDeductedRef = useRef<string | null>(null);

  const handleReactionReceived = useCallback((type: ReactionType) => {
    const id = Math.random().toString(36).substring(7);
    const x = 10 + Math.random() * 80;
    const rotation = -30 + Math.random() * 60;
    setActiveReactions(prev => [...prev, { id, type, x, rotation, isLocal: false }]);
    
    setTimeout(() => {
      setActiveReactions(prev => prev.filter(r => r.id !== id));
    }, 2500);
  }, []);

  const handleMessageReceived = useCallback(async (text: string) => {
    const messageId = Math.random().toString(36).substring(7);
    const msg: ChatMessage = {
      id: messageId,
      senderId: 'stranger',
      text,
      timestamp: Date.now(),
      isTranslating: true
    };
    
    setMessages(prev => [...prev, msg]);

    const targetLang = session?.preferredLanguage || 'English';
    const translationResult = await translateText(text, targetLang);

    if (translationResult) {
      setMessages(prev => prev.map(m => m.id === messageId ? {
        ...m,
        translatedText: translationResult.translatedText,
        detectedLanguage: translationResult.detectedLanguage,
        isTranslating: false,
        isOriginalShown: translationResult.detectedLanguage.toLowerCase() === targetLang.toLowerCase()
      } : m));
    } else {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, isTranslating: false } : m));
    }
  }, [session?.preferredLanguage, translateText]);

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
    remotePeerId 
  } = useWebRTC(session?.region || 'global', handleReactionReceived, handleMessageReceived);

  useModeration(localStream);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch(e.code) {
        case 'Space':
          e.preventDefault();
          if (appState !== AppState.EXHAUSTED) skip();
          break;
        case 'Escape':
          e.preventDefault();
          onExit();
          break;
        case 'KeyM':
          toggleMute();
          break;
        case 'KeyV':
          toggleVideo();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [skip, onExit, toggleMute, toggleVideo, appState]);

  // Activity detection
  useEffect(() => {
    let timeout: number;
    const handleActivity = () => {
      setIsUserActive(true);
      clearTimeout(timeout);
      timeout = window.setTimeout(() => setIsUserActive(false), 3000);
    };

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('touchstart', handleActivity);
    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (appState === AppState.EXHAUSTED) return;

    switch (status) {
      case 'matching':
      case 'connecting':
      case 'generating_id':
      case 'signaling_offline':
        setAppState(AppState.MATCHMAKING);
        break;
      case 'connected':
        setAppState(AppState.CONNECTED);
        
        // DEDUCT COINS ON SUCCESSFUL CONNECTION
        if (remotePeerId && hasDeductedRef.current !== remotePeerId) {
          console.log("[YOLO] Connection established. Charging energy.");
          const success = deductCoins(COST_PER_CALL);
          if (success) {
            hasDeductedRef.current = remotePeerId;
          } else {
            setAppState(AppState.EXHAUSTED);
          }
        }

        setMessages([{
          id: 'system-' + Date.now(),
          senderId: 'system',
          text: "You are now chatting with a random stranger. Say hi!",
          timestamp: Date.now()
        }]);
        break;
      case 'disconnected':
        setAppState(AppState.DISCONNECTED);
        break;
      case 'error':
        setAppState(AppState.MATCHMAKING);
        break;
    }
  }, [status, remotePeerId, deductCoins, appState]);

  // Check coins before skipping
  const handleSkip = useCallback(() => {
    if (!session) return;
    const total = session.coins + session.purchasedCoins;
    if (total < COST_PER_CALL) {
      setAppState(AppState.EXHAUSTED);
    } else {
      skip();
    }
  }, [session, skip]);

  const handleSendMessage = (text: string) => {
    const msg: ChatMessage = { id: Date.now().toString(), senderId: 'me', text, timestamp: Date.now() };
    setMessages(prev => [...prev, msg]);
    sendMessage(text);
  };

  const handleToggleTranslation = (messageId: string) => {
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, isOriginalShown: !m.isOriginalShown } : m));
  };

  const handleSendReaction = (type: ReactionType) => {
    if (appState !== AppState.CONNECTED) return;
    sendReaction(type);
    const id = Math.random().toString(36).substring(7);
    const x = 10 + Math.random() * 80;
    const rotation = -30 + Math.random() * 60;
    setActiveReactions(prev => [...prev, { id, type, x, rotation, isLocal: true }]);
    setTimeout(() => setActiveReactions(prev => prev.filter(r => r.id !== id)), 2500);
  };

  return (
    <div className="flex flex-col lg:flex-row h-screen w-full bg-zinc-950 overflow-hidden relative font-inter">
      <ReportModal isOpen={isReportModalOpen} onClose={() => setIsReportModalOpen(false)} onSubmit={() => skip()} />

      {/* Main Video Area */}
      <div className="flex-1 flex flex-col relative h-[50vh] lg:h-full p-2 md:p-6 lg:p-8">
        <div className={`flex-1 relative rounded-[40px] md:rounded-[56px] overflow-hidden bg-black border border-white/5 shadow-[0_0_100px_rgba(0,0,0,0.5)] transition-all duration-700 ${appState === AppState.CONNECTED ? 'scale-100' : 'scale-[0.98]'}`}>
          {appState === AppState.MATCHMAKING && (
            <MatchmakingOverlay 
              regionName={REGION_LABELS[session?.region || 'global']} 
              status={status}
            />
          )}

          {appState === AppState.EXHAUSTED && (
            <MatchmakingOverlay 
              isExhausted={true}
              onCancel={onExit}
            />
          )}
          
          <VideoFeed stream={remoteStream} isRemote label="Stranger" />

          {/* Incoming Reactions Overlay */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
            {activeReactions.filter(r => !r.isLocal).map(reaction => (
              <div key={reaction.id} className="absolute bottom-0 text-5xl md:text-8xl animate-[floatUpEnhanced_2.5s_ease-out_forwards]" style={{ left: `${reaction.x}%`, '--rotation': `${reaction.rotation}deg` } as any}>
                {REACTION_EMOJIS[reaction.type]}
              </div>
            ))}
          </div>
          
          {/* Local PiP */}
          <div className="absolute top-6 left-6 w-32 md:w-56 aspect-video bg-zinc-950 rounded-2xl md:rounded-[32px] overflow-hidden shadow-2xl border border-white/10 z-30 group/pip transition-all hover:scale-105 active:scale-95 cursor-move">
            <VideoFeed stream={localStream} isRemote={false} label="You" isMuted={true} />
            <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
              {activeReactions.filter(r => r.isLocal).map(reaction => (
                <div key={reaction.id} className="absolute bottom-0 text-2xl md:text-4xl animate-[floatUpEnhanced_2.5s_ease-out_forwards]" style={{ left: `${reaction.x}%`, '--rotation': `${reaction.rotation}deg` } as any}>
                  {REACTION_EMOJIS[reaction.type]}
                </div>
              ))}
            </div>
          </div>

          {/* Floating Action Cockpit */}
          <div className={`absolute bottom-8 left-1/2 -translate-x-1/2 z-50 transition-all duration-500 ${isUserActive || appState === AppState.MATCHMAKING ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
            <Controls 
              appState={appState} 
              onNext={handleSkip} 
              onExit={onExit}
              isMuted={isMuted}
              isVideoOff={isVideoOff}
              onToggleMute={toggleMute}
              onToggleVideo={toggleVideo}
              onReport={() => setIsReportModalOpen(true)}
              onSendReaction={handleSendReaction}
            />
          </div>
        </div>
      </div>

      <Sidebar 
        messages={messages} 
        onSendMessage={handleSendMessage} 
        onToggleTranslation={handleToggleTranslation}
        isConnected={appState === AppState.CONNECTED}
        region={session?.region || 'global'}
      />
    </div>
  );
};