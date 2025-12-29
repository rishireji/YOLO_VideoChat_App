import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSession } from '../context/SessionContext';
import { Brand } from './Brand';
import { RevealRule } from '../types';

interface ProfilePageProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({ isOpen, onClose }) => {
  const { profile, updateProfile, logout, deleteAccount } = useAuth();
  const { session } = useSession();
  const [activeTab, setActiveTab] = useState<'identity' | 'wallet' | 'privacy'>('identity');
  const [isDeleting, setIsDeleting] = useState(false);

  // Derived Identity Status
  const identityStatus = useMemo(() => {
    if (!profile) return 'UNCONFIGURED';
    if (profile.revealRule === 'manual' && !profile.allowFriendRequests) return 'STEALTH';
    if (profile.revealRule === 'mutual') return 'MUTUAL_TRUST';
    if (profile.revealRule === 'time') return 'PROXIMITY_REVEAL';
    return 'STANDARD';
  }, [profile]);

  if (!isOpen || !profile) return null;

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>, isAvatar: boolean = false) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (isAvatar) {
          updateProfile({ primaryAvatar: reader.result as string });
        } else if (profile.photos.length < 3) {
          updateProfile({ photos: [...profile.photos, reader.result as string] });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const removePhoto = (index: number) => {
    const newPhotos = profile.photos.filter((_, i) => i !== index);
    updateProfile({ 
      photos: newPhotos, 
      primaryPhotoIndex: profile.primaryPhotoIndex >= newPhotos.length ? 0 : profile.primaryPhotoIndex 
    });
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\s/g, '').substring(0, 20);
    updateProfile({ username: value });
  };

  return (
    <div className="fixed inset-0 z-[250] flex flex-col bg-black overflow-y-auto selection:bg-red-500/30">
      {/* System Background Effect */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-20 perspective-grid">
         <div className="absolute inset-[-100%] animate-grid" style={{ backgroundImage: `linear-gradient(to right, #333 1px, transparent 1px), linear-gradient(to bottom, #333 1px, transparent 1px)`, backgroundSize: '80px 80px', transform: 'rotateX(60deg)' }}></div>
      </div>

      {/* Control Console Header */}
      <header className="sticky top-0 z-50 bg-black/90 backdrop-blur-3xl border-b border-white/5 px-8 py-4 flex items-center justify-between shadow-2xl">
        <div className="flex items-center gap-6">
          <Brand size="sm" />
          <div className="h-4 w-px bg-zinc-800"></div>
          <span className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-600">Identity Control Console</span>
        </div>
        <button onClick={onClose} className="p-3 bg-zinc-900 hover:bg-zinc-800 rounded-2xl border border-white/5 text-zinc-400 hover:text-white transition-all group">
          <svg className="w-5 h-5 group-hover:rotate-90 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </header>

      <main className="relative z-10 flex-1 max-w-6xl mx-auto w-full px-6 py-12 grid lg:grid-cols-[300px_1fr] gap-12">
        {/* Navigation Console */}
        <nav className="flex flex-col gap-3">
          {[
            { id: 'identity', label: 'Identity Core', desc: 'Who you appear as', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
            { id: 'wallet', label: 'Energy Vault', desc: 'Usage & limits', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
            { id: 'privacy', label: 'Signal Stealth', desc: 'Privacy & tracking', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`relative flex flex-col gap-1 px-8 py-5 rounded-[32px] font-bold transition-all text-left overflow-hidden group ${
                activeTab === tab.id 
                  ? 'bg-zinc-900 text-white shadow-2xl border border-white/5' 
                  : 'text-zinc-600 hover:text-zinc-400 hover:bg-zinc-900/30'
              }`}
            >
              <div className="flex items-center gap-3">
                <svg className={`w-5 h-5 ${activeTab === tab.id ? 'text-red-500' : 'text-zinc-700 group-hover:text-zinc-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d={tab.icon}/></svg>
                <span className="text-sm uppercase tracking-widest">{tab.label}</span>
              </div>
              <span className="text-[10px] font-medium opacity-60 ml-8 uppercase tracking-wider">{tab.desc}</span>
              {activeTab === tab.id && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-8 bg-red-600 rounded-r-full shadow-[4px_0_12px_rgba(220,38,38,0.5)] animate-pulse"></div>
              )}
            </button>
          ))}
          
          <div className="mt-12 pt-12 border-t border-white/5 flex flex-col gap-3">
             <button onClick={logout} className="px-8 py-4 bg-zinc-950 border border-zinc-900 text-zinc-600 hover:text-white hover:bg-zinc-900 rounded-2xl font-black text-[10px] uppercase tracking-[0.3em] transition-all">Terminate Link</button>
             <button onClick={() => setIsDeleting(true)} className="px-8 py-4 text-red-900/50 hover:text-red-600 text-[10px] font-black uppercase tracking-[0.3em] transition-all">Purge Local Node</button>
          </div>
        </nav>

        {/* Content Console Panel */}
        <section className="bg-zinc-950/40 backdrop-blur-3xl border border-white/10 rounded-[56px] p-8 md:p-14 shadow-[0_40px_100px_rgba(0,0,0,0.8)] relative overflow-hidden">
          {/* Panel Accent */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-red-600/5 rounded-full blur-[100px] pointer-events-none"></div>

          {activeTab === 'identity' && (
            <div className="space-y-14 animate-in fade-in slide-in-from-bottom-6 duration-700">
               {/* Identity Header */}
               <div className="flex flex-col md:flex-row gap-10 items-center">
                  <div className="relative group">
                    <div className="w-32 h-32 rounded-full bg-zinc-900 border-2 border-zinc-800 overflow-hidden shadow-2xl transition-all group-hover:border-red-500/50 relative">
                       {profile.primaryAvatar ? (
                         <img src={profile.primaryAvatar} className="w-full h-full object-cover" />
                       ) : (
                         <div className="w-full h-full flex items-center justify-center text-zinc-800">
                           <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                         </div>
                       )}
                       <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                          <span className="text-[10px] font-black uppercase text-white tracking-widest">Upload</span>
                          <input type="file" accept="image/*" onChange={(e) => handlePhotoUpload(e, true)} className="hidden" />
                       </label>
                    </div>
                    {/* Glow Ring */}
                    <div className="absolute -inset-2 rounded-full border border-red-500/20 border-t-red-500/60 animate-radar pointer-events-none"></div>
                  </div>

                  <div className="flex-1 space-y-4 text-center md:text-left">
                     <div className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full bg-zinc-900 border border-white/5 mb-2 shadow-inner">
                        <div className={`w-2 h-2 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)] ${identityStatus === 'STEALTH' ? 'bg-amber-500' : 'bg-red-500'}`}></div>
                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-400">Status: {identityStatus}</span>
                        <div className="group relative">
                          <svg className="w-3 h-3 text-zinc-600 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-[9px] font-bold text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none uppercase tracking-widest z-50">
                            Derived from your active stealth protocols and reveal rules.
                          </div>
                        </div>
                     </div>
                     <div className="relative max-w-xs mx-auto md:mx-0">
                       <input 
                         type="text" 
                         value={profile.username}
                         onChange={handleUsernameChange}
                         placeholder="Establish Handle"
                         className="w-full bg-transparent border-b-2 border-zinc-900 focus:border-red-600 text-3xl font-outfit font-black text-white outline-none transition-all placeholder:text-zinc-800"
                       />
                       <div className="text-[9px] font-black text-zinc-700 uppercase mt-2 tracking-widest">Handle: No spaces • Max 20 chars</div>
                     </div>
                  </div>
               </div>

               {/* Visual Decoy Frames */}
               <div className="space-y-6">
                 <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xl font-outfit font-bold text-zinc-100 mb-1 uppercase tracking-tight">Visual Decoy Management</h4>
                      <p className="text-zinc-600 text-xs font-medium uppercase tracking-wide">Configure primary visual markers for selective reveal.</p>
                    </div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                   {[0, 1, 2].map((i) => (
                     <div key={i} className="group relative aspect-[3/4] rounded-[40px] bg-zinc-950 border border-zinc-900 overflow-hidden transition-all hover:border-red-500/20 shadow-2xl">
                        {profile.photos[i] ? (
                          <>
                            <img src={profile.photos[i]} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center gap-4 backdrop-blur-sm">
                               <div className="px-4 py-2 rounded-xl bg-white text-black text-[10px] font-black uppercase tracking-widest shadow-xl">
                                 {profile.primaryPhotoIndex === i ? 'Active Decoy' : 'Frame Established'}
                               </div>
                               <div className="flex gap-2">
                                  <button onClick={() => updateProfile({ primaryPhotoIndex: i })} className="p-3 bg-zinc-900 rounded-full text-zinc-400 hover:text-white border border-white/5 transition-colors">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"/></svg>
                                  </button>
                                  <button onClick={() => removePhoto(i)} className="p-3 bg-red-600/20 rounded-full text-red-500 hover:bg-red-600 hover:text-white border border-red-500/20 transition-colors">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                  </button>
                               </div>
                            </div>
                            <div className="absolute top-6 left-6 flex items-center gap-2 px-3 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/10">
                               <span className="text-[10px] font-black text-white uppercase tracking-widest">👁️ Visible</span>
                            </div>
                          </>
                        ) : (
                          <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-zinc-900/50 transition-all group/upload">
                            <div className="w-16 h-16 rounded-[24px] bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-700 mb-4 transition-all group-hover/upload:border-red-500/50 group-hover/upload:text-red-500">
                               <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>
                            </div>
                            <span className="text-[10px] font-black uppercase text-zinc-600 tracking-[0.2em]">Queue Frame</span>
                            <input type="file" accept="image/*" onChange={(e) => handlePhotoUpload(e)} className="hidden" />
                          </label>
                        )}
                        {/* Corner Accents */}
                        <div className="absolute top-0 right-0 w-8 h-8 border-t border-r border-white/5 m-4 pointer-events-none"></div>
                        <div className="absolute bottom-0 left-0 w-8 h-8 border-b border-l border-white/5 m-4 pointer-events-none"></div>
                     </div>
                   ))}
                 </div>
               </div>

               {/* Connection Primer */}
               <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xl font-outfit font-bold text-zinc-100 mb-1 uppercase tracking-tight">Connection Primer</h4>
                      <p className="text-zinc-600 text-xs font-medium uppercase tracking-wide">Context provided to trusted links upon identity reveal.</p>
                    </div>
                  </div>

                  <div className="relative group">
                    <textarea
                      value={profile.bio}
                      onChange={(e) => updateProfile({ bio: e.target.value })}
                      placeholder="e.g. 'Here for conversations, not faces.' or 'Curious minds only.'"
                      className="w-full bg-zinc-900/50 border border-white/5 rounded-[40px] p-8 text-white text-base outline-none focus:border-red-600/50 min-h-[160px] resize-none transition-all shadow-inner"
                      maxLength={160}
                    />
                    <div className="absolute bottom-6 right-8 flex items-center gap-4">
                       <span className={`text-[11px] font-black uppercase tracking-widest ${profile.bio.length > 140 ? 'text-red-500' : 'text-zinc-600'}`}>{profile.bio.length} / 160</span>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-3 gap-4">
                    {[
                      { id: 'friends', label: 'Friends Only' },
                      { id: 'mutual', label: 'Mutual Reveal' },
                      { id: 'manual', label: 'Manual Approval' }
                    ].map((opt) => (
                      <button 
                        key={opt.id}
                        className={`py-4 px-6 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                          (opt.id === 'friends' && profile.revealPhotosToFriendsOnly) || (opt.id === 'mutual' && profile.revealRule === 'mutual') || (opt.id === 'manual' && profile.revealRule === 'manual')
                            ? 'bg-red-600 border-red-500 text-white shadow-lg'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-600 hover:border-zinc-700'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
               </div>

               {/* Reveal Rules Panel */}
               <div className="p-10 bg-zinc-950 border border-white/5 rounded-[48px] space-y-8 shadow-inner relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-2 h-full bg-red-600/20"></div>
                  <div>
                    <h4 className="text-xl font-outfit font-bold text-zinc-100 mb-1 uppercase tracking-tight">Identity Reveal Rules</h4>
                    <p className="text-zinc-600 text-xs font-medium uppercase tracking-wide">Automated logic for established P2P handshakes.</p>
                  </div>

                  <div className="space-y-4">
                    {[
                      { id: 'mutual', label: 'Conditional Handshake', desc: 'Reveal identity only when both nodes send a friend request.', value: profile.revealRule === 'mutual' },
                      { id: 'time', label: 'Proximity Disclosure', desc: `Reveal identity after ${profile.revealTimeMinutes} minutes of continuous data flow.`, value: profile.revealRule === 'time' },
                      { id: 'manual', label: 'Manual Clearance Only', desc: 'Identity remains shielded until explicitly approved via command console.', value: profile.revealRule === 'manual' },
                    ].map((rule) => (
                      <button 
                        key={rule.id}
                        onClick={() => updateProfile({ revealRule: rule.id as RevealRule })}
                        className={`w-full flex items-center justify-between p-6 rounded-3xl border transition-all text-left ${
                          profile.revealRule === rule.id 
                            ? 'bg-red-600/5 border-red-500/30 shadow-2xl' 
                            : 'bg-zinc-900/30 border-transparent hover:border-zinc-800'
                        }`}
                      >
                         <div className="max-w-md">
                           <span className={`font-bold block mb-1 uppercase tracking-widest text-sm ${profile.revealRule === rule.id ? 'text-red-500' : 'text-zinc-400'}`}>{rule.label}</span>
                           <p className="text-[10px] font-medium text-zinc-600 uppercase tracking-widest leading-relaxed">{rule.desc}</p>
                         </div>
                         <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${profile.revealRule === rule.id ? 'bg-red-600 border-red-600' : 'border-zinc-800'}`}>
                           {profile.revealRule === rule.id && <div className="w-2 h-2 bg-white rounded-full"></div>}
                         </div>
                      </button>
                    ))}
                  </div>
               </div>
            </div>
          )}

          {activeTab === 'wallet' && (
            <div className="space-y-12 animate-in fade-in slide-in-from-bottom-6 duration-700">
               <div>
                 <h3 className="text-4xl font-outfit font-bold text-white mb-2 uppercase tracking-tight italic">Energy Vault</h3>
                 <p className="text-zinc-600 text-xs font-bold uppercase tracking-[0.2em]">Current Node Propulsion Reserves</p>
               </div>

               <div className="grid md:grid-cols-2 gap-8">
                 <div className="p-10 bg-zinc-950 border border-white/5 rounded-[48px] space-y-6 shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-full h-1 bg-zinc-800 group-hover:bg-red-600 transition-colors"></div>
                    <span className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-700">Daily Allowance</span>
                    <div className="text-5xl font-outfit font-black text-white">{session?.coins} <span className="text-base text-zinc-700 uppercase">YC</span></div>
                    <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden">
                       <div className="h-full bg-red-600 animate-pulse" style={{ width: `${(session?.coins || 0) / 2.5}%` }}></div>
                    </div>
                    <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest leading-relaxed">Automatic restoration every 24h cycle.</p>
                 </div>
                 <div className="p-10 bg-red-600/5 border border-red-500/20 rounded-[48px] space-y-6 shadow-[inset_0_0_60px_rgba(220,38,38,0.08)] group relative">
                    <div className="absolute top-0 left-0 w-full h-1 bg-red-600 shadow-[0_0_15px_rgba(220,38,38,1)]"></div>
                    <span className="text-[10px] font-black uppercase tracking-[0.4em] text-red-500">Premium Reserves</span>
                    <div className="text-5xl font-outfit font-black text-red-600">{session?.purchasedCoins} <span className="text-base text-red-900/50 uppercase">YC</span></div>
                    <p className="text-[9px] text-red-900/60 font-bold uppercase tracking-widest leading-relaxed">Permanent energy. Consumed only after daily allowance exhaustion.</p>
                 </div>
               </div>
               
               <div className="p-12 bg-zinc-900/30 border border-white/5 rounded-[56px] text-center space-y-8">
                  <div className="inline-flex items-center gap-4 px-6 py-2 rounded-full bg-zinc-950 border border-white/5 text-[10px] font-black uppercase text-zinc-500 tracking-widest">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                    Secure Payment Protocol Enabled
                  </div>
                  <h4 className="text-2xl font-outfit font-bold text-white uppercase tracking-tight">Refill Propulsion Core</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mx-auto">
                    {[100, 250, 500, 1000].map(amount => (
                      <button key={amount} className="p-6 bg-zinc-950 border border-white/5 rounded-3xl hover:border-red-500/50 hover:bg-zinc-900 transition-all group">
                        <span className="text-sm font-black text-zinc-500 group-hover:text-red-500 block mb-1">{amount} YC</span>
                        <span className="text-[10px] font-bold text-zinc-800 uppercase tracking-widest">${(amount/100).toFixed(2)}</span>
                      </button>
                    ))}
                  </div>
               </div>
            </div>
          )}

          {activeTab === 'privacy' && (
            <div className="space-y-12 animate-in fade-in slide-in-from-bottom-6 duration-700">
               <div>
                 <h3 className="text-4xl font-outfit font-bold text-white mb-2 uppercase tracking-tight italic">Signal Stealth</h3>
                 <p className="text-zinc-600 text-xs font-bold uppercase tracking-[0.2em]">Node Visibility & Encryption Protocols</p>
               </div>

               <div className="space-y-4">
                 {[
                   { id: 'allowFriendRequests', label: 'Signal Broadcast', desc: 'Allow other nodes to propose persistent friend handshakes during sessions.', value: profile.allowFriendRequests },
                   { id: 'revealPhotosToFriendsOnly', label: 'Visual Masking', desc: 'Obfuscate decoy frames and primer bio until trust is established.', value: profile.revealPhotosToFriendsOnly },
                 ].map((setting) => (
                   <div key={setting.id} className="flex items-center justify-between p-10 bg-zinc-950/50 border border-white/5 rounded-[48px] hover:border-zinc-800 transition-all group">
                      <div className="max-w-md">
                        <span className="text-lg font-bold text-white block mb-1 uppercase tracking-tight">{setting.label}</span>
                        <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-[0.2em] leading-relaxed">{setting.desc}</p>
                      </div>
                      <button 
                        onClick={() => updateProfile({ [setting.id]: !setting.value } as any)}
                        className={`w-16 h-9 rounded-full p-1.5 transition-all flex items-center shadow-inner ${setting.value ? 'bg-red-600 justify-end' : 'bg-zinc-900 justify-start'}`}
                      >
                         <div className="w-6 h-6 bg-white rounded-full shadow-2xl"></div>
                      </button>
                   </div>
                 ))}
               </div>

               <div className="p-10 bg-zinc-900/20 border border-white/5 rounded-[48px] flex items-start gap-8">
                  <div className="w-14 h-14 bg-indigo-600/10 border border-indigo-500/20 rounded-2xl flex items-center justify-center text-indigo-500 shrink-0">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                  </div>
                  <div>
                    <h5 className="text-lg font-bold text-zinc-300 uppercase tracking-tight mb-2">Metadata Encryption</h5>
                    <p className="text-xs text-zinc-600 font-medium uppercase tracking-wide leading-relaxed">
                      All connection handshakes are encrypted with local key pairs. YOLO never stores plaintext identity metadata.
                    </p>
                  </div>
               </div>
            </div>
          )}
        </section>
      </main>

      {/* Terminal Purge Confirmation */}
      {isDeleting && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/98 backdrop-blur-2xl" onClick={() => setIsDeleting(false)}></div>
          <div className="relative w-full max-w-md bg-zinc-950 border border-red-900/30 rounded-[56px] p-12 text-center animate-in zoom-in-95 duration-300 shadow-[0_0_100px_rgba(220,38,38,0.1)]">
             <div className="w-24 h-24 bg-red-600/10 border border-red-600/20 rounded-full flex items-center justify-center mx-auto mb-10 text-red-500">
                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
             </div>
             <h4 className="text-3xl font-outfit font-black text-white mb-4 uppercase italic">Terminal Purge?</h4>
             <p className="text-zinc-600 text-[10px] font-black uppercase tracking-widest mb-12 leading-loose">This will permanently destroy your node identity, propulsion energy, and all friend handshakes. Data is not recoverable.</p>
             <div className="flex flex-col gap-4">
                <button onClick={() => setIsDeleting(false)} className="py-5 bg-zinc-900 hover:bg-zinc-800 rounded-3xl font-black text-[10px] uppercase tracking-[0.4em] text-zinc-500 hover:text-white transition-all">Abort</button>
                <button onClick={deleteAccount} className="py-5 bg-red-600 hover:bg-red-500 rounded-3xl font-black text-[10px] uppercase tracking-[0.4em] text-white shadow-2xl shadow-red-600/40">Execute Purge</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};