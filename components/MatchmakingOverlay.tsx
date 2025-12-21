
import React from 'react';

interface MatchmakingOverlayProps {
  regionName?: string;
  onCancel?: () => void;
  status?: string;
}

export const MatchmakingOverlay: React.FC<MatchmakingOverlayProps> = ({ 
  regionName = 'Global', 
  onCancel,
  status = 'matching'
}) => {
  const isGenerating = status === 'generating_id';
  const isConnecting = status === 'connecting';
  const isError = status === 'error';

  const getStatusText = () => {
    switch(status) {
      case 'generating_id': return 'Initializing Peer Engine...';
      case 'connecting': return 'Handshaking...';
      case 'error': return 'Connection Error';
      default: return 'Searching for Humans...';
    }
  };

  const getStatusDesc = () => {
    switch(status) {
      case 'generating_id': return 'Assigning unique secure ID for this session.';
      case 'connecting': return 'Found a match! Establishing secure P2P tunnel.';
      case 'error': return 'Could not connect. Please check your camera permissions.';
      default: return `Scanning ${regionName} for available peers.`;
    }
  };

  return (
    <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-black/90 backdrop-blur-3xl px-6 transition-all duration-500 overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute inset-0 pointer-events-none">
        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full blur-[120px] transition-colors duration-1000 ${
          isError ? 'bg-red-500/10' : isConnecting ? 'bg-indigo-500/10' : 'bg-red-500/10'
        }`}></div>
      </div>

      <div className="relative">
        {/* Core Spinner */}
        <div className="relative w-40 h-40 md:w-52 md:h-52 flex items-center justify-center">
            <div className="absolute inset-0 border-[1px] border-zinc-800 rounded-full"></div>
            <div className={`absolute inset-0 border-t-2 rounded-full animate-spin ${
              isError ? 'border-red-600' : isConnecting ? 'border-indigo-400' : 'border-red-500'
            }`} style={{ animationDuration: '0.8s' }}></div>
            
            <div className={`relative w-24 h-24 md:w-32 md:h-32 rounded-[40px] flex items-center justify-center shadow-2xl transition-all duration-700 ${
              isError ? 'bg-red-950 border border-red-500/30' :
              isConnecting ? 'bg-indigo-950 border border-indigo-400/30' : 
              'bg-zinc-900 border border-white/5'
            }`}>
               <svg className={`w-10 h-10 md:w-14 md:h-14 transition-colors ${
                 isError ? 'text-red-500' : isConnecting ? 'text-indigo-400' : 'text-red-500'
               }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13 10V3L4 14h7v7l9-11h-7z"/>
               </svg>
            </div>
        </div>
      </div>
      
      <div className="mt-12 text-center space-y-4 max-w-sm">
        <h3 className="text-3xl md:text-4xl font-outfit font-bold tracking-tight text-white">
          {getStatusText()}
        </h3>
        <p className={`text-sm font-medium tracking-wide leading-relaxed ${
          isError ? 'text-red-400' : isConnecting ? 'text-indigo-400' : 'text-zinc-500'
        }`}>
          {getStatusDesc()}
        </p>
      </div>

      <div className="mt-16 flex flex-col items-center gap-8">
          <div className="flex gap-3">
            <div className="px-4 py-2 bg-zinc-900/50 border border-zinc-800 rounded-full flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${isError ? 'bg-red-600' : 'bg-red-500'} animate-pulse`}></span>
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{regionName}</span>
            </div>
            <div className="px-4 py-2 bg-zinc-900/50 border border-zinc-800 rounded-full flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">P2P PeerJS</span>
            </div>
          </div>

          {onCancel && (
            <button 
              onClick={onCancel}
              className="px-10 py-4 bg-zinc-900 hover:bg-zinc-800 border border-white/5 rounded-2xl text-[11px] font-bold uppercase tracking-[0.3em] text-zinc-500 hover:text-white transition-all active:scale-95"
            >
              Disconnect
            </button>
          )}
      </div>
    </div>
  );
};
