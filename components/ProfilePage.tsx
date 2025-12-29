import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSession } from '../context/SessionContext';
import { Brand } from './Brand';

interface ProfilePageProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({ isOpen, onClose }) => {
  const { profile, updateProfile, logout, deleteAccount } = useAuth();
  const { session } = useSession();
  const [activeTab, setActiveTab] = useState<'identity' | 'wallet' | 'privacy'>('identity');
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen || !profile) return null;

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && profile.photos.length < 3) {
      const reader = new FileReader();
      reader.onloadend = () => {
        updateProfile({ photos: [...profile.photos, reader.result as string] });
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

  return (
    <div className="fixed inset-0 z-[250] flex flex-col bg-black overflow-y-auto">
      {/* Dynamic Background */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-20 perspective-grid">
         <div className="absolute inset-[-100%] animate-grid" style={{ backgroundImage: `linear-gradient(to right, #333 1px, transparent 1px), linear-gradient(to bottom, #333 1px, transparent 1px)`, backgroundSize: '60px 60px', transform: 'rotateX(60deg)' }}></div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-2xl border-b border-white/5 px-8 py-6 flex items-center justify-between">
        <Brand size="sm" />
        <button onClick={onClose} className="p-3 bg-zinc-900 hover:bg-zinc-800 rounded-2xl border border-white/5 text-zinc-400 hover:text-white transition-all group">
          <svg className="w-6 h-6 group-hover:rotate-90 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </header>

      <main className="relative z-10 flex-1 max-w-5xl mx-auto w-full px-6 py-12 grid lg:grid-cols-[280px_1fr] gap-12">
        {/* Navigation */}
        <nav className="flex flex-col gap-2">
          {[
            { id: 'identity', label: 'Identity Core', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
            { id: 'wallet', label: 'Energy Vault', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
            { id: 'privacy', label: 'Signal Stealth', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-4 px-6 py-4 rounded-2xl font-bold uppercase tracking-tight text-sm transition-all text-left ${
                activeTab === tab.id ? 'bg-red-600 text-white shadow-xl shadow-red-600/20' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={tab.icon}/></svg>
              {tab.label}
            </button>
          ))}
          
          <div className="mt-auto pt-8 flex flex-col gap-3">
             <button onClick={logout} className="px-6 py-4 bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-white rounded-2xl font-bold text-xs uppercase tracking-widest transition-all">Sign Out</button>
             <button onClick={() => setIsDeleting(true)} className="px-6 py-4 text-red-900 hover:text-red-500 text-xs font-black uppercase tracking-widest transition-all">Purge Node Data</button>
          </div>
        </nav>

        {/* Content Area */}
        <section className="bg-zinc-950/50 backdrop-blur-3xl border border-white/5 rounded-[48px] p-8 md:p-12 shadow-2xl">
          {activeTab === 'identity' && (
            <div className="space-y-12 animate-in fade-in slide-in-from-right-4 duration-500">
               <div>
                 <h3 className="text-2xl font-outfit font-bold text-white mb-2">Visual Decoy Management</h3>
                 <p className="text-zinc-500 text-sm">Upload up to 3 identity photos. These are only visible to confirmed friend connections.</p>
               </div>

               <div className="grid grid-cols-3 gap-4">
                 {[0, 1, 2].map((i) => (
                   <div key={i} className="aspect-[3/4] rounded-3xl bg-zinc-900 border border-zinc-800 relative group overflow-hidden">
                      {profile.photos[i] ? (
                        <>
                          <img src={profile.photos[i]} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                             <button onClick={() => updateProfile({ primaryPhotoIndex: i })} className={`px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest ${profile.primaryPhotoIndex === i ? 'bg-red-600' : 'bg-white text-black'}`}>
                               {profile.primaryPhotoIndex === i ? 'Primary' : 'Set Main'}
                             </button>
                             <button onClick={() => removePhoto(i)} className="text-red-500 text-[10px] font-black uppercase">Delete</button>
                          </div>
                        </>
                      ) : (
                        <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-zinc-800/50 transition-colors">
                          <svg className="w-8 h-8 text-zinc-700 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>
                          <span className="text-[8px] font-black uppercase text-zinc-600 tracking-widest">Upload Frame</span>
                          <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                        </label>
                      )}
                   </div>
                 ))}
               </div>

               <div className="space-y-4">
                 <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">Identity Brief (Bio)</label>
                 <textarea
                   value={profile.bio}
                   onChange={(e) => updateProfile({ bio: e.target.value })}
                   placeholder="Enter a short bio for your future connections..."
                   className="w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-6 text-white text-sm outline-none focus:border-red-500/50 min-h-[140px] resize-none transition-all"
                   maxLength={160}
                 />
                 <div className="text-right text-[10px] font-bold text-zinc-700 uppercase">{profile.bio.length} / 160</div>
               </div>
            </div>
          )}

          {activeTab === 'wallet' && (
            <div className="space-y-12 animate-in fade-in slide-in-from-right-4 duration-500">
               <div>
                 <h3 className="text-2xl font-outfit font-bold text-white mb-2">Energy Reserves</h3>
                 <p className="text-zinc-500 text-sm">Your node's power for establishing secure links across the global network.</p>
               </div>

               <div className="grid md:grid-cols-2 gap-6">
                 <div className="p-8 bg-zinc-900/50 border border-white/5 rounded-[40px] space-y-4">
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Daily Allowance</span>
                    <div className="text-4xl font-outfit font-bold text-white">{session?.coins} <span className="text-sm text-zinc-600 uppercase">YC</span></div>
                    <p className="text-[9px] text-zinc-700 font-bold uppercase tracking-widest leading-relaxed">Resets back to 250 every 24 hours.</p>
                 </div>
                 <div className="p-8 bg-red-600/5 border border-red-500/20 rounded-[40px] space-y-4 shadow-[inset_0_0_40px_rgba(220,38,38,0.05)]">
                    <span className="text-[10px] font-black uppercase tracking-widest text-red-500">Persistent Energy</span>
                    <div className="text-4xl font-outfit font-bold text-red-500">{session?.purchasedCoins} <span className="text-sm text-red-900 uppercase">YC</span></div>
                    <p className="text-[9px] text-red-900 font-bold uppercase tracking-widest leading-relaxed">Does not expire. Used after daily allowance is depleted.</p>
                 </div>
               </div>
            </div>
          )}

          {activeTab === 'privacy' && (
            <div className="space-y-12 animate-in fade-in slide-in-from-right-4 duration-500">
               <div>
                 <h3 className="text-2xl font-outfit font-bold text-white mb-2">Stealth Protocols</h3>
                 <p className="text-zinc-500 text-sm">Control how your node interacts with other operators in the ecosystem.</p>
               </div>

               <div className="space-y-4">
                 {[
                   { id: 'allowFriendRequests', label: 'Inbound Connection Proposals', desc: 'Enable or disable receiving new friend requests during sessions.', value: profile.allowFriendRequests },
                   { id: 'revealPhotosToFriendsOnly', label: 'Identity Reveal Masking', desc: 'When enabled, your profile photos and bio are only shared with confirmed friends.', value: profile.revealPhotosToFriendsOnly },
                 ].map((setting) => (
                   <div key={setting.id} className="flex items-center justify-between p-8 bg-zinc-900/50 border border-white/5 rounded-[32px] hover:border-zinc-700 transition-all">
                      <div className="max-w-md">
                        <span className="font-bold text-white block mb-1">{setting.label}</span>
                        <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wide leading-relaxed">{setting.desc}</p>
                      </div>
                      <button 
                        onClick={() => updateProfile({ [setting.id]: !setting.value } as any)}
                        className={`w-14 h-8 rounded-full p-1 transition-all flex items-center ${setting.value ? 'bg-red-600 justify-end' : 'bg-zinc-800 justify-start'}`}
                      >
                         <div className="w-6 h-6 bg-white rounded-full shadow-lg"></div>
                      </button>
                   </div>
                 ))}
               </div>
            </div>
          )}
        </section>
      </main>

      {/* Delete Confirmation Modal */}
      {isDeleting && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-xl" onClick={() => setIsDeleting(false)}></div>
          <div className="relative w-full max-w-md bg-zinc-950 border border-red-500/20 rounded-[40px] p-10 text-center animate-in zoom-in-95 duration-200 shadow-[0_0_100px_rgba(220,38,38,0.1)]">
             <div className="w-20 h-20 bg-red-600/10 border border-red-500/30 rounded-full flex items-center justify-center mx-auto mb-8 text-red-500">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
             </div>
             <h4 className="text-2xl font-outfit font-bold text-white mb-4">Confirm Terminal Purge?</h4>
             <p className="text-zinc-500 text-sm mb-10 leading-relaxed">This will permanently delete your node identity, purchased energy, and all friend links. This action cannot be undone.</p>
             <div className="flex gap-4">
                <button onClick={() => setIsDeleting(false)} className="flex-1 py-4 bg-zinc-900 hover:bg-zinc-800 rounded-2xl font-bold text-zinc-500 hover:text-white transition-all">Cancel</button>
                <button onClick={deleteAccount} className="flex-1 py-4 bg-red-600 hover:bg-red-500 rounded-2xl font-black uppercase tracking-widest text-white shadow-xl shadow-red-600/20">Delete Forever</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};