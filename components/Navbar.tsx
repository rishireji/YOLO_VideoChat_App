import React, { useState, useEffect } from 'react';
import { useSession } from '../context/SessionContext';
import { useAuth } from '../context/AuthContext';
import { Brand } from './Brand';
import { SignInModal } from './SignInModal';
import { ProfilePage } from './ProfilePage';

interface NavbarProps {
  onSignOut: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onSignOut }) => {
  const { session } = useSession();
  const { user, logout } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [isSignInOpen, setIsSignInOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const totalCoins = session ? (session.coins + session.purchasedCoins) : 0;

  return (
    <>
      <SignInModal isOpen={isSignInOpen} onClose={() => setIsSignInOpen(false)} />
      <ProfilePage isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
      
      <nav className={`fixed top-0 left-0 right-0 z-[150] transition-all duration-500 px-6 py-4 flex items-center justify-between ${
        scrolled || isMenuOpen ? 'bg-black/60 backdrop-blur-2xl border-b border-white/5' : 'bg-transparent'
      }`}>
        <Brand size="sm" className="opacity-90 hover:opacity-100 transition-opacity cursor-pointer" />

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-3 bg-zinc-900/80 border border-white/5 px-4 py-2 rounded-full shadow-2xl group cursor-default hover:border-red-500/30 transition-all">
            <div className="relative w-4 h-4">
              <div className="absolute inset-0 rounded-full border border-red-500/40 animate-radar"></div>
              <div className="absolute inset-1 bg-red-600 rounded-full shadow-[0_0_10px_rgba(220,38,38,0.5)]"></div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-[0.1em] text-zinc-500 group-hover:text-zinc-400 transition-colors">YOLO Coins</span>
              <span className="text-zinc-600 font-bold">•</span>
              <span className={`text-xs font-bold font-mono tracking-tight ${totalCoins < 20 ? 'text-red-500 animate-pulse' : 'text-zinc-100'}`}>
                {totalCoins.toLocaleString()}
              </span>
            </div>
          </div>

          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="w-10 h-10 flex flex-col items-center justify-center gap-1.5 bg-zinc-900/50 hover:bg-zinc-800 rounded-xl border border-white/5 transition-all group"
            aria-label="Toggle Menu"
          >
            <span className={`h-0.5 bg-zinc-400 rounded-full transition-all duration-300 ${isMenuOpen ? 'w-6 rotate-45 translate-y-2' : 'w-5'}`}></span>
            <span className={`h-0.5 bg-zinc-400 rounded-full transition-all duration-300 ${isMenuOpen ? 'opacity-0' : 'w-5'}`}></span>
            <span className={`h-0.5 bg-zinc-400 rounded-full transition-all duration-300 ${isMenuOpen ? 'w-6 -rotate-45 -translate-y-2' : 'w-3 self-end mr-2.5'}`}></span>
          </button>
        </div>

        <div className={`absolute top-full right-6 mt-4 w-64 bg-zinc-950/95 backdrop-blur-3xl border border-white/10 rounded-[32px] shadow-[0_40px_100px_rgba(0,0,0,0.8)] overflow-hidden transition-all duration-500 origin-top-right ${
          isMenuOpen ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-90 -translate-y-4 pointer-events-none'
        }`}>
          <div className="p-2 space-y-1">
            <div className="px-6 py-4">
              <span className="text-xs font-black uppercase text-zinc-600 tracking-widest">
                {user ? 'Linked Identity' : 'Anonymous Session'}
              </span>
              <p className="text-[10px] text-zinc-500 mt-1 uppercase">
                {user ? user.email : 'End-to-End Encrypted'}
              </p>
            </div>

            <div className="h-px bg-white/5 my-2 mx-4"></div>

            {user ? (
              <button
                onClick={() => { setIsProfileOpen(true); setIsMenuOpen(false); }}
                className="w-full flex items-center gap-4 px-6 py-4 text-white hover:bg-white/5 transition-all text-left rounded-2xl"
              >
                <svg className="w-5 h-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span className="text-sm font-bold tracking-tight uppercase">My Identity</span>
              </button>
            ) : (
              <button
                onClick={() => { setIsSignInOpen(true); setIsMenuOpen(false); }}
                className="w-full flex items-center gap-4 px-6 py-4 text-red-500 hover:bg-red-500/10 transition-all text-left rounded-2xl"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span className="text-sm font-bold tracking-tight uppercase">Sign In</span>
              </button>
            )}

            <div className="h-px bg-white/5 my-2 mx-4"></div>

            <button
              onClick={() => {
                setIsMenuOpen(false);
                onSignOut();
                logout();
              }}
              className="w-full flex items-center gap-4 px-6 py-4 text-zinc-500 hover:text-red-500 hover:bg-red-500/10 transition-all group text-left rounded-2xl"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="text-sm font-black uppercase tracking-widest">Wipe Session</span>
            </button>
          </div>
          
          <div className="bg-zinc-900/50 p-4 text-center">
            <p className="text-[8px] font-black uppercase tracking-[0.3em] text-zinc-600">
              EPHEMERAL ID: {session?.id.substring(0, 12).toUpperCase()}
            </p>
          </div>
        </div>
      </nav>
    </>
  );
};