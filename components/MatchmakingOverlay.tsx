
import React from 'react';

interface MatchmakingOverlayProps {
  regionName?: string;
  onCancel?: () => void;
}

export const MatchmakingOverlay: React.FC<MatchmakingOverlayProps> = ({ 
  regionName = 'Global', 
  onCancel 
}) => {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/60 backdrop-blur-2xl px-6">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-red-500/20 blur-2xl animate-pulse"></div>
        <div className="relative w-32 h-32 md:w-40 md:h-40 flex items-center justify-center">
            <div className="absolute inset-0 border-4 border-zinc-800/50 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-red-500 border-t-transparent rounded-full animate-spin"></div>
            <div className="w-16 h-16 md:w-20 md:h-20 bg-gradient-to-br from-red-500 to-orange-600 rounded-[24px] md:rounded-[28px] animate-bounce flex items-center justify-center shadow-[0_0_30px_rgba(239,68,68,0.3)]">
               <svg className="w-8 h-8 md:w-10 md:h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            </div>
        </div>
      </div>
      
      <div className="mt-8 md:mt-10 text-center space-y-3">
        <h3 className="text-2xl md:text-3xl font-outfit font-bold tracking-tight text-white">Matchmaking...</h3>
        <p className="text-zinc-400 text-xs md:text-sm font-medium tracking-wide animate-pulse">Connecting to YOLO nodes in your area</p>
      </div>

      <div className="mt-10 md:mt-16 flex flex-col items-center gap-6">
          <div className="flex gap-4">
            <div className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></span>
                <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest">{regionName}</span>
            </div>
            <div className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
                <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest">Privacy On</span>
            </div>
          </div>

          {onCancel && (
            <button 
              onClick={onCancel}
              className="px-8 py-3 bg-zinc-800/50 hover:bg-zinc-800 border border-white/5 rounded-2xl text-xs font-bold uppercase tracking-[0.2em] text-zinc-400 hover:text-white transition-all active:scale-95"
            >
              Cancel Search
            </button>
          )}
      </div>
    </div>
  );
};
