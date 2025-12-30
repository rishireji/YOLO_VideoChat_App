import React, { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Brand } from './Brand';

interface SignInModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SignInModal: React.FC<SignInModalProps> = ({ isOpen, onClose }) => {
  const { signIn, signUp, sendPasswordReset } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isSignUp) {
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        return;
      }
      if (password.length < 6) {
        setError("Password must be at least 6 characters");
        return;
      }
    }

    setLoading(true);
    try {
      if (isSignUp) {
        await signUp(email, password, displayName, photo);
      } else {
        await signIn(email, password);
      }
      onClose();
    } catch (err: any) {
      if (err.message === 'EMAIL_NOT_VERIFIED') {
        setVerificationEmail(err.email || email);
        setShowVerification(true);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email) {
      setError("Email address is required.");
      return;
    }
    setLoading(true);
    try {
      await sendPasswordReset(email);
      setResetEmailSent(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Verification Screen View
  if (showVerification) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose}></div>
        <div className="relative w-full max-w-md bg-zinc-950 border border-white/5 rounded-[40px] p-8 md:p-12 shadow-[0_50px_100px_rgba(0,0,0,0.8)] flex flex-col items-center animate-in zoom-in-95 duration-300">
          <Brand size="md" className="mb-8" />
          <div className="w-20 h-20 bg-indigo-600/10 border border-indigo-500/20 rounded-full flex items-center justify-center mb-8">
            <svg className="w-10 h-10 text-indigo-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-2xl font-outfit font-bold text-white mb-4 text-center">Verify Identity</h2>
          <p className="text-zinc-400 text-sm mb-10 text-center leading-relaxed">
            We have sent you a verification email to <span className="text-white font-bold">{verificationEmail}</span>. verify it and log in.
          </p>
          
          <button
            onClick={() => {
              setShowVerification(false);
              setIsSignUp(false);
              setError('');
            }}
            className="w-full py-5 bg-white text-black font-black uppercase tracking-widest rounded-2xl hover:bg-zinc-200 transition-all active:scale-95 shadow-xl"
          >
            Login
          </button>
          
          <p className="mt-8 text-zinc-800 text-[8px] font-bold uppercase tracking-[0.3em] leading-relaxed text-center">
            Verification Protocol v2.1<br/>Check your spam folder if not received
          </p>
        </div>
      </div>
    );
  }

  // Forgot Password Screen View
  if (showForgotPassword) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose}></div>
        <div className="relative w-full max-w-md bg-zinc-950 border border-white/5 rounded-[40px] p-8 md:p-12 shadow-[0_50px_100px_rgba(0,0,0,0.8)] flex flex-col items-center animate-in zoom-in-95 duration-300">
          <Brand size="md" className="mb-8" />
          
          {resetEmailSent ? (
            <div className="w-full flex flex-col items-center text-center animate-in fade-in duration-500">
              <div className="w-20 h-20 bg-green-600/10 border border-green-500/20 rounded-full flex items-center justify-center mb-8">
                <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-outfit font-bold text-white mb-4">Reset Link Dispatched</h2>
              <p className="text-zinc-400 text-sm mb-10 leading-relaxed">
                We sent you a password change link to <span className="text-white font-bold">{email}</span>.
              </p>
              <button
                onClick={() => {
                  setShowForgotPassword(false);
                  setResetEmailSent(false);
                  setError('');
                }}
                className="w-full py-5 bg-white text-black font-black uppercase tracking-widest rounded-2xl hover:bg-zinc-200 transition-all active:scale-95 shadow-xl"
              >
                Back to Sign In
              </button>
            </div>
          ) : (
            <div className="w-full flex flex-col items-center animate-in slide-in-from-bottom-4 duration-300">
              <h2 className="text-2xl font-outfit font-bold text-white mb-2 text-center uppercase tracking-tight">Recover Vault Access</h2>
              <p className="text-zinc-500 text-[10px] mb-8 text-center uppercase tracking-widest font-bold">Initialize password reset protocol.</p>
              
              <form onSubmit={handleForgotPassword} className="w-full space-y-4">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Identity Email"
                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-red-500/50 text-white px-6 py-4 rounded-2xl outline-none transition-all placeholder:text-zinc-700"
                  required
                />
                
                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl text-red-500 text-[10px] font-black uppercase tracking-widest text-center">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest rounded-2xl transition-all active:scale-95 shadow-lg shadow-indigo-600/20"
                >
                  {loading ? 'Dispatched Reset...' : 'Get Reset Link'}
                </button>
              </form>

              <button
                onClick={() => {
                  setShowForgotPassword(false);
                  setError('');
                }}
                className="mt-8 text-zinc-600 text-[10px] font-black uppercase tracking-widest hover:text-white transition-colors"
              >
                Remembered? Sign In
              </button>
            </div>
          )}
          
          <p className="mt-8 text-zinc-800 text-[8px] font-bold uppercase tracking-[0.3em] leading-relaxed text-center">
            Security Override Protocol<br/>Multi-Factor Validation Enabled
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose}></div>
      <div className={`relative w-full max-w-md bg-zinc-950 border border-white/5 rounded-[40px] p-8 md:p-12 shadow-[0_50px_100px_rgba(0,0,0,0.8)] flex flex-col items-center animate-in zoom-in-95 duration-300 transition-all ${isSignUp ? 'max-h-[90vh] overflow-y-auto' : ''}`}>
        
        <Brand size="md" className="mb-6" />
        <h2 className="text-3xl font-outfit font-bold text-white mb-2 tracking-tight text-center">
          {isSignUp ? 'Establish Node' : 'Initialize Access'}
        </h2>
        <p className="text-zinc-500 text-[11px] mb-8 text-center leading-relaxed uppercase tracking-widest font-bold">
          {isSignUp 
            ? 'Create a secure identity for persistent links.' 
            : 'Access your encrypted vault and friends.'}
        </p>

        <form onSubmit={handleAuth} className="w-full space-y-4">
          {isSignUp && (
            <div className="flex flex-col items-center space-y-4 mb-6">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="w-24 h-24 rounded-full bg-zinc-900 border-2 border-dashed border-zinc-800 flex items-center justify-center overflow-hidden cursor-pointer hover:border-red-500/50 transition-all group relative"
              >
                {photo ? (
                  <img src={photo} className="w-full h-full object-cover" alt="Preview" />
                ) : (
                  <svg className="w-8 h-8 text-zinc-700 group-hover:text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <span className="text-[8px] font-black text-white uppercase tracking-tighter">Choose Photo</span>
                </div>
              </div>
              <input type="file" ref={fileInputRef} onChange={handlePhotoUpload} className="hidden" accept="image/*" />
              
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Display Name (Required)"
                className="w-full bg-zinc-900 border border-zinc-800 focus:border-red-500/50 text-white px-6 py-4 rounded-2xl outline-none transition-all placeholder:text-zinc-700 text-center font-bold"
                required={isSignUp}
              />
            </div>
          )}

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

          {isSignUp && (
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat Password"
              className="w-full bg-zinc-900 border border-zinc-800 focus:border-red-500/50 text-white px-6 py-4 rounded-2xl outline-none transition-all placeholder:text-zinc-700"
              required={isSignUp}
            />
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl text-red-500 text-[10px] font-black uppercase tracking-widest text-center animate-pulse">
              {error}
            </div>
          )}

          {!isSignUp && (
            <div className="flex justify-end px-2">
              <button
                type="button"
                onClick={() => {
                  setShowForgotPassword(true);
                  setError('');
                }}
                className="text-zinc-600 text-[10px] font-bold uppercase tracking-widest hover:text-red-500 transition-colors"
              >
                Forgot password?
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-5 bg-red-600 hover:bg-red-500 text-white font-black uppercase tracking-widest rounded-2xl transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-red-600/20"
          >
            {loading ? 'Establishing Connection...' : (isSignUp ? 'Establish Node' : 'Confirm Link')}
          </button>
        </form>

        <div className="w-full flex items-center gap-4 my-8">
          <div className="h-px flex-1 bg-white/5"></div>
          <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">or</span>
          <div className="h-px flex-1 bg-white/5"></div>
        </div>

        <button
          onClick={() => {
            setIsSignUp(!isSignUp);
            setError('');
          }}
          className="text-zinc-600 text-[10px] font-black uppercase tracking-widest cursor-pointer hover:text-red-500 transition-colors"
        >
          {isSignUp ? 'Already linked? Sign In' : 'New operator? Establish Node'}
        </button>
        
        <p className="mt-8 text-zinc-800 text-[8px] font-bold uppercase tracking-[0.3em] leading-relaxed text-center">
          Verified Firebase Auth Protocol<br/>End-to-End Encryption Enabled
        </p>
      </div>
    </div>
  );
};