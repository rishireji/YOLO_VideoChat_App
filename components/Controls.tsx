
import React from 'react';
import { AppState, ReactionType, REACTION_EMOJIS } from '../types';

interface ControlsProps {
  appState: AppState;
  onNext: () => void;
  onExit: () => void;
  isMuted: boolean;
  isVideoOff: boolean;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onReport: () => void;
  onSendReaction: (type: ReactionType) => void;
}

export const Controls: React.FC<ControlsProps> = ({ 
  appState, onNext, onExit, isMuted, isVideoOff, onToggleMute, onToggleVideo, onReport, onSendReaction
}) => {
  const isMatching = appState === AppState.MATCHMAKING;
  const isConnected = appState === AppState.CONNECTED;

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-4">
      {/* Reactions Bar */}
      {isConnected && (
        <div className="flex justify-center items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {(Object.entries(REACTION_EMOJIS) as [ReactionType, string][]).map(([type, emoji]) => (
            <button
              key={type}
              onClick={() => onSendReaction(type)}
              className="w-12 h-12 flex items-center justify-center bg-zinc-900/80 backdrop-blur-xl border border-white/5 rounded-full text-2xl hover:bg-zinc-800 hover:scale-125 hover:-translate-y-1 transition-all active:scale-95 shadow-xl"
              title={type}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        {/* Left Side: Media Controls */}
        <div className="flex gap-2.5">
          <button
            onClick={onToggleMute}
            className={`p-3.5 rounded-2xl transition-all active:scale-90 shadow-lg border border-white/5 ${isMuted ? 'bg-red-600 text-white' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white'}`}
            title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
          >
            {isMuted ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3l18 18" /></svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
            )}
          </button>
          <button
            onClick={onToggleVideo}
            className={`p-3.5 rounded-2xl transition-all active:scale-90 shadow-lg border border-white/5 ${isVideoOff ? 'bg-red-600 text-white' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white'}`}
            title={isVideoOff ? "Start Camera" : "Stop Camera"}
          >
            {isVideoOff ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3l18 18" /></svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            )}
          </button>
        </div>

        {/* Center/Right Side: Main Actions */}
        <div className="flex gap-4 flex-1 justify-end">
          <button
            onClick={onExit}
            className="px-8 py-3.5 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-black uppercase tracking-widest transition-all transform active:scale-95 shadow-[0_0_20px_rgba(220,38,38,0.3)] flex items-center gap-2 group"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
            Exit
          </button>
          
          <button
            onClick={onNext}
            disabled={isMatching}
            className={`px-12 py-3.5 rounded-2xl font-black uppercase tracking-widest transition-all transform active:scale-95 flex items-center gap-2 group ${
              isMatching 
                ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed border border-zinc-700' 
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_20px_rgba(79,70,229,0.4)]'
            }`}
          >
            {isMatching ? (
              <div className="w-5 h-5 border-2 border-zinc-600 border-t-zinc-400 rounded-full animate-spin"></div>
            ) : (
              <>
                Next Room
                <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg>
              </>
            )}
          </button>
        </div>

        {/* Report Button */}
        <button 
          onClick={onReport}
          className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-red-500 hover:bg-red-500/10 transition-all group shadow-inner" 
          title="Report Abuse"
        >
          <svg className="w-6 h-6 group-hover:rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
        </button>
      </div>
    </div>
  );
};
