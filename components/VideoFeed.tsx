import React, { useEffect, useRef } from 'react';

interface VideoFeedProps {
  stream: MediaStream | null;
  isRemote: boolean;
  label: string;
  isMuted?: boolean;
}

export const VideoFeed: React.FC<VideoFeedProps> = ({ stream, isRemote, label, isMuted = false }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isVideoOff = stream ? !stream.getVideoTracks()[0]?.enabled : true;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (stream) {
      video.srcObject = stream;
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          if (error.name !== 'AbortError') {
            console.warn(`[VideoFeed] Playback failed for ${label}:`, error);
          }
        });
      }
    } else {
      video.srcObject = null;
    }

    return () => {
      video.srcObject = null;
    };
  }, [stream, label]);

  return (
    <div className="w-full h-full relative overflow-hidden bg-zinc-950">
      <video
        ref={videoRef}
        playsInline
        muted={isMuted}
        className={`w-full h-full object-cover transition-all duration-1000 transform ${stream && !isVideoOff ? 'opacity-100 scale-100 grayscale-0' : 'opacity-0 scale-110 grayscale blur-3xl'}`}
      />
      
      {/* Video Privacy Mode Overlay */}
      {stream && isVideoOff && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-3xl scanline-effect">
          <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-500">
             <div className="w-20 h-20 rounded-[32px] bg-red-600/10 border border-red-500/20 flex items-center justify-center text-red-500 shadow-[0_0_40px_rgba(239,68,68,0.2)]">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3l18 18" />
                </svg>
             </div>
             <div className="text-center">
               <p className="text-[11px] font-black uppercase tracking-[0.4em] text-white">Privacy Mode</p>
               <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500 mt-1">Camera Feed Suspended</p>
             </div>
          </div>
        </div>
      )}

      {/* Loading State Overlay */}
      {!stream && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/90 backdrop-blur-3xl scanline-effect">
           <div className="flex flex-col items-center relative z-10">
              <div className="relative w-24 h-24 mb-8">
                <div className="absolute inset-0 rounded-full border-[1px] border-zinc-800"></div>
                <div className="absolute inset-0 rounded-full border-t-2 border-indigo-500 animate-spin"></div>
                <div className="absolute inset-4 rounded-full border-b-2 border-red-500/30 animate-spin-reverse opacity-50" style={{ animationDuration: '1.5s' }}></div>
              </div>
              <div className="flex flex-col items-center gap-2">
                <p className="text-white text-xs font-black uppercase tracking-[0.4em] animate-pulse">Linking</p>
                <p className="text-zinc-600 text-[10px] font-bold uppercase tracking-[0.2em]">P2P Protocol Negotiating</p>
              </div>
           </div>
        </div>
      )}

      {/* Corner UI Accents */}
      <div className="absolute top-0 left-0 w-12 h-12 border-t-[1px] border-l-[1px] border-white/5 m-6 pointer-events-none z-20"></div>
      <div className="absolute top-0 right-0 w-12 h-12 border-t-[1px] border-r-[1px] border-white/5 m-6 pointer-events-none z-20"></div>
      <div className="absolute bottom-0 left-0 w-12 h-12 border-b-[1px] border-l-[1px] border-white/5 m-6 pointer-events-none z-20"></div>
      <div className="absolute bottom-0 right-0 w-12 h-12 border-b-[1px] border-r-[1px] border-white/5 m-6 pointer-events-none z-20"></div>

      {/* Label Badge */}
      <div className="absolute top-6 right-6 z-30">
        <div className="px-4 py-1.5 rounded-full bg-black/40 backdrop-blur-3xl border border-white/10 flex items-center gap-2 shadow-2xl">
          <div className={`w-1.5 h-1.5 rounded-full ${stream ? 'bg-indigo-500 animate-pulse' : 'bg-zinc-700'}`}></div>
          <span className="text-[10px] font-black tracking-[0.2em] uppercase text-zinc-300">
            {label}
          </span>
        </div>
      </div>
    </div>
  );
};