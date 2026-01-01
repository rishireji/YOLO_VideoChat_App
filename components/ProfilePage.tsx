
import React, { useState, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSession } from '../context/SessionContext';
import { Brand } from './Brand';
import { UserProfile, UserFile } from '../types';

interface ProfilePageProps {
  isOpen: boolean;
  onClose: () => void;
}

const FriendProfilePopup: React.FC<{ friend: UserProfile; onClose: () => void }> = ({ friend, onClose }) => {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-xl animate-in fade-in duration-300" onClick={onClose}></div>
      <div className="relative w-full max-w-lg bg-zinc-950 border border-white/10 rounded-[56px] p-10 shadow-[0_50px_150px_rgba(0,0,0,0.9)] overflow-hidden animate-in zoom-in-95 duration-500">
        <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/10 rounded-full blur-[60px]"></div>
        
        <header className="flex flex-col items-center mb-10">
          <div className="relative group mb-6">
            <div className="w-32 h-32 rounded-full bg-zinc-900 border-2 border-zinc-800 overflow-hidden shadow-2xl relative">
              {friend.Profile_photo ? (
                <img src={friend.Profile_photo} className="w-full h-full object-cover" alt={friend.name} />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-800">
                  <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                </div>
              )}
            </div>
            <div className="absolute -inset-2 rounded-full border border-red-500/20 border-t-red-500/60 animate-radar pointer-events-none"></div>
          </div>
          
          <h2 className="text-4xl font-outfit font-black text-white tracking-tight uppercase italic">{friend.name}</h2>
          <div className="mt-2 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-zinc-900 border border-white/5">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            <span className="text-[10px] font-black uppercase text-zinc-400 tracking-widest">P2P Handshake Verified</span>
          </div>
        </header>

        <div className="space-y-6">
          <div className="bg-zinc-900/40 border border-white/5 rounded-3xl p-6">
            <span className="text-[9px] font-black uppercase text-zinc-600 tracking-widest block mb-2">Technical Dossier</span>
            <p className="text-sm text-zinc-400 leading-relaxed font-medium italic">
              {friend.bio || "No data broadcasted. This operative remains in the shadows."}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-zinc-950 border border-white/5 p-4 rounded-3xl text-center">
              <span className="text-[8px] font-black uppercase tracking-widest text-zinc-700 block mb-1">Status</span>
              <span className="text-xs font-bold text-indigo-400">READY</span>
            </div>
            <div className="bg-zinc-950 border border-white/5 p-4 rounded-3xl text-center">
              <span className="text-[8px] font-black uppercase tracking-widest text-zinc-700 block mb-1">Trust Level</span>
              <span className="text-xs font-bold text-red-500">OMEGA</span>
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-4">
            <button className="w-full py-5 bg-red-600 hover:bg-red-500 text-white font-black uppercase tracking-widest rounded-2xl transition-all active:scale-95 shadow-xl shadow-red-600/20 flex items-center justify-center gap-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
              Establish Video Link
            </button>
            <button className="w-full py-5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white font-black uppercase tracking-widest rounded-2xl transition-all border border-white/5 active:scale-95 flex items-center justify-center gap-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>
              Secure Message
            </button>
          </div>
        </div>

        <button onClick={onClose} className="absolute top-8 right-8 p-3 bg-zinc-900 hover:bg-zinc-800 rounded-2xl border border-white/5 text-zinc-400 hover:text-white transition-all">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
    </div>
  );
};

export const ProfilePage: React.FC<ProfilePageProps> = ({ isOpen, onClose }) => {
  const { user, profile, friendProfiles, files, updateProfile, logout, deleteAccount, uploadVaultFile, deleteVaultFile } = useAuth();
  const { session } = useSession();
  const [activeTab, setActiveTab] = useState<'identity' | 'social' | 'files' | 'wallet' | 'privacy'>('identity');
  const [selectedFriend, setSelectedFriend] = useState<UserProfile | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const identityStatus = useMemo(() => {
    if (!profile) return 'UNCONFIGURED';
    if (profile.revealRule === 'manual' && !profile.allowFriendRequests) return 'STEALTH';
    if (profile.revealRule === 'mutual') return 'MUTUAL_TRUST';
    if (profile.revealRule === 'time') return 'PROXIMITY_REVEAL';
    return 'STANDARD';
  }, [profile]);

  if (!isOpen || !profile || !user) return null;

  const handleVaultUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploading(true);
      try { await uploadVaultFile(file); } catch (err) { console.error("[YOLO Vault] Upload failed:", err); } finally { setUploading(false); }
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'Profile_photo' | 'Display_Pic1' | 'Display_Pic2' | 'Display_Pic3') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => { updateProfile({ [field]: reader.result as string }); };
      reader.readAsDataURL(file);
    }
  };

  const removePhoto = (field: 'Display_Pic1' | 'Display_Pic2' | 'Display_Pic3') => { updateProfile({ [field]: null }); };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleDeletePurge = async () => {
    if (window.confirm("CRITICAL: This will permanently purge your identity and all Firestore/Storage records. Continue?")) {
      try { await deleteAccount(); onClose(); } catch (err: any) { alert(err.message); }
    }
  };

  return (
    <div className="fixed inset-0 z-[250] flex flex-col bg-black overflow-y-auto selection:bg-red-500/30">
      {selectedFriend && <FriendProfilePopup friend={selectedFriend} onClose={() => setSelectedFriend(null)} />}
      
      <div className="fixed inset-0 z-0 pointer-events-none opacity-20 perspective-grid">
         <div className="absolute inset-[-100%] animate-grid" style={{ backgroundImage: `linear-gradient(to right, #333 1px, transparent 1px), linear-gradient(to bottom, #333 1px, transparent 1px)`, backgroundSize: '80px 80px', transform: 'rotateX(60deg)' }}></div>
      </div>

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
        <nav className="flex flex-col gap-3">
          {[
            { id: 'identity', label: 'Identity Core', desc: 'Who you appear as', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
            { id: 'social', label: 'Social Link', desc: 'Connected nodes', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
            { id: 'files', label: 'Storage Vault', desc: 'Encrypted archives', icon: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4' },
            { id: 'wallet', label: 'Energy Vault', desc: 'Usage & limits', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
            { id: 'privacy', label: 'Signal Stealth', desc: 'Privacy & tracking', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`relative flex flex-col gap-1 px-8 py-5 rounded-[32px] font-bold transition-all text-left overflow-hidden group ${
                activeTab === tab.id ? 'bg-zinc-900 text-white shadow-2xl border border-white/5' : 'text-zinc-600 hover:text-zinc-400 hover:bg-zinc-900/30'
              }`}
            >
              <div className="flex items-center gap-3">
                <svg className={`w-5 h-5 ${activeTab === tab.id ? 'text-red-500' : 'text-zinc-700 group-hover:text-zinc-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d={tab.icon}/></svg>
                <span className="text-sm uppercase tracking-widest">{tab.label}</span>
              </div>
              <span className="text-[10px] font-medium opacity-60 ml-8 uppercase tracking-wider">{tab.desc}</span>
              {activeTab === tab.id && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-8 bg-red-600 rounded-r-full shadow-[4px_0_12px_rgba(220,38,38,0.5)] animate-pulse"></div>}
            </button>
          ))}
          <div className="mt-12 pt-12 border-t border-white/5 flex flex-col gap-3">
             <button onClick={logout} className="px-8 py-4 bg-zinc-950 border border-zinc-900 text-zinc-600 hover:text-white hover:bg-zinc-900 rounded-2xl font-black text-[10px] uppercase tracking-[0.3em] transition-all">Terminate Link</button>
             <button onClick={handleDeletePurge} className="px-8 py-4 text-red-900/50 hover:text-red-600 text-[10px] font-black uppercase tracking-[0.3em] transition-all">Purge Identity</button>
          </div>
        </nav>

        <section className="bg-zinc-950/40 backdrop-blur-3xl border border-white/10 rounded-[56px] p-8 md:p-14 shadow-[0_40px_100px_rgba(0,0,0,0.8)] relative overflow-hidden min-h-[600px]">
          <div className="absolute top-0 right-0 w-64 h-64 bg-red-600/5 rounded-full blur-[100px] pointer-events-none"></div>

          {activeTab === 'identity' && (
            <div className="space-y-14 animate-in fade-in slide-in-from-bottom-6 duration-700">
               <div className="flex flex-col md:flex-row gap-10 items-center">
                  <div className="relative group">
                    <div className="w-32 h-32 rounded-full bg-zinc-900 border-2 border-zinc-800 overflow-hidden shadow-2xl transition-all group-hover:border-red-500/50 relative">
                       {profile.Profile_photo ? (
                         <img src={profile.Profile_photo} className="w-full h-full object-cover" alt="Profile" />
                       ) : (
                         <div className="w-full h-full flex items-center justify-center text-zinc-800">
                           <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                         </div>
                       )}
                       <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                          <span className="text-[10px] font-black uppercase text-white tracking-widest">Update</span>
                          <input type="file" accept="image/*" onChange={(e) => handlePhotoUpload(e, 'Profile_photo')} className="hidden" />
                       </label>
                    </div>
                    <div className="absolute -inset-2 rounded-full border border-red-500/20 border-t-red-500/60 animate-radar pointer-events-none"></div>
                  </div>
                  <div className="flex-1 space-y-4 text-center md:text-left">
                     <div className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full bg-zinc-900 border border-white/5 mb-2 shadow-inner">
                        <div className={`w-2 h-2 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)] ${identityStatus === 'STEALTH' ? 'bg-amber-500' : 'bg-red-500'}`}></div>
                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Vault UID: {profile.uid.substring(0,8)}</span>
                     </div>
                     <div className="relative max-w-xs mx-auto md:mx-0">
                       <input 
                         type="text" 
                         value={profile.name}
                         onChange={(e) => updateProfile({ name: e.target.value.substring(0, 30) })}
                         className="w-full bg-transparent border-b-2 border-zinc-900 focus:border-red-600 text-3xl font-outfit font-black text-white outline-none transition-all placeholder:text-zinc-800"
                       />
                       <div className="text-[9px] font-black text-zinc-700 uppercase mt-2 tracking-widest">Identity: {profile.email}</div>
                     </div>
                  </div>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                 {['Display_Pic1', 'Display_Pic2', 'Display_Pic3'].map((field) => {
                   const photo = profile[field as keyof UserProfile] as string | null;
                   return (
                     <div key={field} className="group relative aspect-[3/4] rounded-[40px] bg-zinc-950 border border-zinc-900 overflow-hidden transition-all hover:border-red-500/20 shadow-2xl">
                        {photo ? (
                          <>
                            <img src={photo} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center gap-4 backdrop-blur-sm">
                               <button onClick={() => removePhoto(field as any)} className="p-3 bg-red-600/20 rounded-full text-red-500 hover:bg-red-600 hover:text-white border border-red-500/20 transition-colors">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                               </button>
                            </div>
                          </>
                        ) : (
                          <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-zinc-900/50 transition-all group/upload">
                            <div className="w-16 h-16 rounded-[24px] bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-700 mb-4 transition-all group-hover/upload:border-red-500/50 group-hover/upload:text-red-500">
                               <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>
                            </div>
                            <input type="file" accept="image/*" onChange={(e) => handlePhotoUpload(e, field as any)} className="hidden" />
                          </label>
                        )}
                     </div>
                   );
                 })}
               </div>
            </div>
          )}

          {activeTab === 'social' && (
            <div className="space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-700">
               <h3 className="text-4xl font-outfit font-black text-white italic uppercase tracking-tighter">Social Links</h3>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 {friendProfiles.length === 0 ? (
                   <div className="col-span-full flex flex-col items-center justify-center py-20 text-center opacity-30 border-2 border-dashed border-zinc-800 rounded-[48px]">
                      <svg className="w-20 h-20 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                      <p className="font-black uppercase tracking-[0.3em] text-[10px]">No Social Links Established</p>
                   </div>
                 ) : (
                   friendProfiles.map(friend => (
                     <button 
                       key={friend.uid} 
                       onClick={() => setSelectedFriend(friend)}
                       className="group flex items-center gap-6 p-6 bg-zinc-900/40 border border-white/5 rounded-[32px] hover:bg-zinc-900 hover:border-red-500/20 transition-all text-left shadow-2xl"
                     >
                       <div className="w-16 h-16 rounded-full bg-zinc-950 border border-zinc-800 overflow-hidden relative">
                          {friend.Profile_photo ? (
                            <img src={friend.Profile_photo} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-800">
                              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                            </div>
                          )}
                          <div className="absolute inset-0 border border-indigo-500/20 rounded-full"></div>
                       </div>
                       <div className="flex-1">
                          <h4 className="text-xl font-outfit font-bold text-white tracking-tight">{friend.name}</h4>
                          <div className="flex items-center gap-2 mt-1">
                             <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div>
                             <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Established Protocol</span>
                          </div>
                       </div>
                       <svg className="w-5 h-5 text-zinc-800 group-hover:text-red-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7"/></svg>
                     </button>
                   ))
                 )}
               </div>
            </div>
          )}

          {activeTab === 'files' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-700">
               <div className="flex items-center justify-between">
                  <h3 className="text-4xl font-outfit font-black text-white italic uppercase tracking-tighter">Archive Vault</h3>
                  <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="flex items-center gap-3 px-8 py-4 bg-white text-black font-black uppercase tracking-widest rounded-2xl hover:bg-zinc-200 transition-all active:scale-95 disabled:opacity-50">
                    {uploading ? <div className="w-5 h-5 border-2 border-zinc-600 border-t-zinc-950 rounded-full animate-spin"></div> : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4"/></svg>}
                    <span>{uploading ? 'Archiving...' : 'Secure Upload'}</span>
                    <input type="file" ref={fileInputRef} onChange={handleVaultUpload} className="hidden" />
                  </button>
               </div>
               <div className="space-y-4">
                 {files.length === 0 ? (
                   <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
                      <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
                      <p className="font-black uppercase tracking-widest text-[10px]">Vault Empty • No Archives Found</p>
                   </div>
                 ) : (
                   files.map(file => (
                     <div key={file.id} className="bg-zinc-900/40 border border-white/5 p-8 rounded-[40px] group transition-all hover:bg-zinc-900/60 hover:border-red-500/20 shadow-2xl">
                        <div className="flex flex-col md:flex-row gap-8">
                           <div className="flex-1 space-y-4">
                              <div className="flex items-center gap-4">
                                 <div className="w-12 h-12 bg-zinc-950 rounded-2xl flex items-center justify-center text-red-500 shadow-inner">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                                 </div>
                                 <div>
                                    <h4 className="text-xl font-outfit font-bold text-white tracking-tight">{file.name}</h4>
                                    <div className="flex items-center gap-3 text-[10px] font-black uppercase text-zinc-500 tracking-widest mt-1">
                                       <span>{file.mimeType}</span>
                                       <span className="w-1 h-1 rounded-full bg-zinc-800"></span>
                                       <span>{formatSize(file.size)}</span>
                                       <span className="w-1 h-1 rounded-full bg-zinc-800"></span>
                                      <span>{file.createdAt? file.createdAt.toDate().toLocaleDateString(): ''}
</span>

                                    </div>
                                 </div>
                              </div>
                              <div className="p-5 bg-zinc-950/80 rounded-[28px] border border-white/5 relative">
                                 <div className="absolute top-4 right-4"><span className="text-[8px] font-black uppercase text-red-500/50 tracking-widest">Gemini AI Summary</span></div>
                                 <p className="text-xs text-zinc-400 leading-relaxed italic pr-12">"{file.aiSummary}"</p>
                              </div>
                           </div>
                           <div className="flex md:flex-col gap-2 justify-center">
                              <a href={`${file.url}`} download={file.name} target="_blank" rel="noopener noreferrer" className="p-4 bg-zinc-950 border border-white/5 text-zinc-400 hover:text-white rounded-2xl transition-all"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg></a>
                              <button onClick={() => deleteVaultFile(file.id, file.storagePath)} className="p-4 bg-red-600/10 border border-red-500/10 text-red-500 hover:bg-red-600 hover:text-white rounded-2xl transition-all"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
                           </div>
                        </div>
                     </div>
                   ))
                 )}
               </div>
            </div>
          )}

          {activeTab === 'wallet' && (
            <div className="space-y-12 animate-in fade-in slide-in-from-bottom-6 duration-700">
               <h3 className="text-4xl font-outfit font-black text-white italic uppercase tracking-tighter">Energy Vault</h3>
               <div className="grid md:grid-cols-2 gap-8">
                 <div className="p-10 bg-zinc-950 border border-white/5 rounded-[48px] shadow-2xl">
                    <span className="text-[10px] font-black uppercase text-zinc-700 tracking-widest">Available Energy</span>
                    <div className="text-5xl font-outfit font-black text-white mt-4">{session?.coins} <span className="text-sm">YC</span></div>
                 </div>
               </div>
            </div>
          )}

          {activeTab === 'privacy' && (
            <div className="space-y-12 animate-in fade-in slide-in-from-bottom-6 duration-700">
               <h3 className="text-4xl font-outfit font-black text-white italic uppercase tracking-tighter">Signal Stealth</h3>
               <div className="space-y-4">
                 {[
                   { id: 'allowFriendRequests', label: 'Signal Broadcast', desc: 'Allow nodes to propose persistent handshakes.', value: profile.allowFriendRequests },
                   { id: 'revealPhotosToFriendsOnly', label: 'Visual Masking', desc: 'Hide decoy frames until trust is established.', value: profile.revealPhotosToFriendsOnly },
                 ].map((setting) => (
                   <div key={setting.id} className="flex items-center justify-between p-10 bg-zinc-950/50 border border-white/5 rounded-[48px]">
                      <div className="max-w-md">
                        <span className="text-lg font-bold text-white block uppercase tracking-tight">{setting.label}</span>
                        <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">{setting.desc}</p>
                      </div>
                      <button onClick={() => updateProfile({ [setting.id]: !setting.value } as any)} className={`w-16 h-9 rounded-full p-1.5 transition-all flex items-center ${setting.value ? 'bg-red-600 justify-end' : 'bg-zinc-900 justify-start'}`}><div className="w-6 h-6 bg-white rounded-full"></div></button>
                   </div>
                 ))}
               </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};
