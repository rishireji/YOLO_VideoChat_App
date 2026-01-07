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
    <div className="flex flex-col items-center gap-3">
      {/* Reactions Sub-Bar (only when connected) */}
      {isConnected && (
        <div className="flex gap-1.5 p-1.5 bg-zinc-950/40 backdrop-blur-3xl border border-white/5 rounded-full mb-1 animate-in fade-in zoom-in duration-300">
          {(Object.entries(REACTION_EMOJIS) as [ReactionType, string][]).map(([type, emoji]) => (
            <button
              key={type}
              onClick={() => onSendReaction(type)}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/10 hover:scale-125 transition-all text-lg"
              title={type}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Main Command Bar */}
      <div className="flex items-center gap-2.5 p-2.5 bg-zinc-950/80 backdrop-blur-[40px] border border-white/10 rounded-[28px] shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
        
        {/* RED EXIT BUTTON */}
        <button
          onClick={onExit}
          className="flex items-center gap-2 px-5 py-3 bg-red-600 hover:bg-red-500 text-white rounded-[20px] transition-all active:scale-90 group shadow-lg shadow-red-600/20"
          title="Exit Session (Esc)"
        >
          <svg className="w-4 h-4 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
          </svg>
          <span className="text-[11px] font-black uppercase tracking-widest hidden md:inline">Exit</span>
        </button>

        <div className="w-[1px] h-7 bg-white/10 mx-0.5"></div>

        {/* MEDIA TOGGLES */}
        <div className="flex gap-2">
          <button
            onClick={onToggleMute}
            className={`w-10 h-10 flex items-center justify-center rounded-2xl transition-all active:scale-90 border border-white/5 ${isMuted ? 'bg-red-600/20 text-red-500 border-red-500/20' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}
            title={isMuted ? "Unmute Mic (M)" : "Mute Mic (M)"}
          >
            {isMuted ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3l18 18" /></svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
            )}
          </button>
          
          <button
            onClick={onToggleVideo}
            className={`w-10 h-10 flex items-center justify-center rounded-2xl transition-all active:scale-90 border border-white/5 ${isVideoOff ? 'bg-red-600/20 text-red-500 border-red-500/20' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}
            title={isVideoOff ? "Start Video (V)" : "Stop Video (V)"}
          >
            {isVideoOff ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3l18 18" /></svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            )}
          </button>
        </div>

        <div className="w-[1px] h-7 bg-white/10 mx-0.5"></div>

        {/* NEXT ROOM ACTION */}
        <button
          onClick={onNext}
          disabled={isMatching}
          className={`group flex items-center gap-2 px-6 py-3 rounded-[20px] transition-all active:scale-95 ${isMatching ? 'bg-zinc-800 text-zinc-600 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30'}`}
          title="Next Stranger (Space)"
        >
          {isMatching ? (
            <div className="w-4 h-4 border-2 border-zinc-600 border-t-zinc-400 rounded-full animate-spin"></div>
          ) : (
            <>
              <span className="text-[11px] font-black uppercase tracking-widest">Next Room</span>
              <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 5l7 7-7 7M5 5l7 7-7 7"/>
              </svg>
            </>
          )}
        </button>

        {/* Report Button Mini */}
        <button 
          onClick={onReport}
          className="w-10 h-10 flex items-center justify-center rounded-2xl bg-zinc-950/50 text-red-500/60 hover:text-red-500 hover:bg-red-500/10 transition-all border border-white/5 ml-0.5"
          title="Report Abuse"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
        </button>
      </div>
      
      {/* Shortcut Tooltip */}
      <div className="flex gap-4 opacity-25 text-[8px] font-bold uppercase tracking-[0.2em] text-zinc-400">
         <span className="flex items-center gap-1"><kbd className="bg-zinc-800 px-1 rounded">Space</kbd> Next</span>
         <span className="flex items-center gap-1"><kbd className="bg-zinc-800 px-1 rounded">Esc</kbd> Exit</span>
         <span className="flex items-center gap-1"><kbd className="bg-zinc-800 px-1 rounded">M</kbd> Mute</span>
      </div>
    </div>
  );
};