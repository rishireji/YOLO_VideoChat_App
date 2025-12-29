import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Brand } from './Brand';

interface SignInModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SignInModal: React.FC<SignInModalProps> = ({ isOpen, onClose }) => {
  const { signIn, signUp } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(''); // Kept for UI logic, though mock doesn't use it
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isSignUp) {
        await signUp(email);
      } else {
        await signIn(email);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      await signIn('google_user@example.com');
      onClose();
    } catch (err: any) {
      setError('Google sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose}></div>
      <div className="relative w-full max-w-md bg-zinc-950 border border-white/5 rounded-[40px] p-8 md:p-12 shadow-[0_50px_100px_rgba(0,0,0,0.8)] flex flex-col items-center animate-in zoom-in-95 duration-300">
        
        <Brand size="md" className="mb-8" />
        <h2 className="text-3xl font-outfit font-bold text-white mb-2 tracking-tight">
          {isSignUp ? 'Create Node' : 'Initialize Access'}
        </h2>
        <p className="text-zinc-500 text-sm mb-8 text-center leading-relaxed">
          Unlock persistent connections, friend requests, and profile customization while remaining anonymous to the lobby.
        </p>

        <form onSubmit={handleAuth} className="w-full space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Identity Email"
            className="w-full bg-zinc-900 border border-zinc-800 focus:border-red-500/50 text-white px-6 py-4 rounded-2xl outline-none transition-all placeholder:text-zinc-700"
            required
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Secure Password"
            className="w-full bg-zinc-900 border border-zinc-800 focus:border-red-500/50 text-white px-6 py-4 rounded-2xl outline-none transition-all placeholder:text-zinc-700"
            required
          />

          {error && <p className="text-red-500 text-[10px] font-black uppercase tracking-widest text-center animate-pulse">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-5 bg-red-600 hover:bg-red-500 text-white font-black uppercase tracking-widest rounded-2xl transition-all active:scale-95 disabled:opacity-50"
          >
            {loading ? 'Processing...' : (isSignUp ? 'Establish Node' : 'Confirm Link')}
          </button>
        </form>

        <div className="w-full flex items-center gap-4 my-8">
          <div className="h-px flex-1 bg-white/5"></div>
          <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">or</span>
          <div className="h-px flex-1 bg-white/5"></div>
        </div>

        <button
          onClick={handleGoogleSignIn}
          className="w-full py-4 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 font-bold rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-95"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#EA4335" d="M12 5.04c1.9 0 3.53.68 4.67 1.77l3.5-3.5C17.97 1.2 15.22 0 12 0 7.31 0 3.32 2.69 1.39 6.61l4.09 3.17c.96-2.88 3.66-5.04 6.52-5.04z"/>
            <path fill="#4285F4" d="M23.49 12.27c0-.85-.07-1.67-.21-2.45H12v4.64h6.44c-.28 1.48-1.11 2.74-2.37 3.58l3.69 2.87c2.16-2 3.42-4.94 3.42-8.64z"/>
            <path fill="#FBBC05" d="M5.48 14.22c-.25-.74-.39-1.53-.39-2.35 0-.82.14-1.61.39-2.35L1.39 6.61C.5 8.43 0 10.46 0 12.63c0 2.17.5 4.2 1.39 6.02l4.09-4.43z"/>
            <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.69-2.87c-1.12.75-2.55 1.19-4.26 1.19-3.26 0-6.03-2.2-7.02-5.17l-4.09 3.17C3.32 21.31 7.31 24 12 24z"/>
          </svg>
          Google Auth
        </button>

        <p className="mt-8 text-zinc-600 text-[10px] font-bold uppercase tracking-widest cursor-pointer hover:text-red-500 transition-colors" onClick={() => setIsSignUp(!isSignUp)}>
          {isSignUp ? 'Already linked? Sign In' : 'New operator? Create Account'}
        </p>
      </div>
    </div>
  );
};