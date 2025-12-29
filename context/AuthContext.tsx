import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { UserProfile } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => void;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        // Load profile from "backend" (simulated with localStorage)
        const savedProfile = localStorage.getItem(`YOLO_PROFILE_${firebaseUser.uid}`);
        if (savedProfile) {
          setProfile(JSON.parse(savedProfile));
        } else {
          // Initialize default profile
          const newProfile: UserProfile = {
            uid: firebaseUser.uid,
            photos: [],
            primaryPhotoIndex: 0,
            bio: '',
            allowFriendRequests: true,
            revealPhotosToFriendsOnly: true,
            friends: []
          };
          setProfile(newProfile);
          localStorage.setItem(`YOLO_PROFILE_${firebaseUser.uid}`, JSON.stringify(newProfile));
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const updateProfile = (updates: Partial<UserProfile>) => {
    if (!user || !profile) return;
    const updated = { ...profile, ...updates };
    setProfile(updated);
    localStorage.setItem(`YOLO_PROFILE_${user.uid}`, JSON.stringify(updated));
  };

  const logout = async () => {
    await signOut(auth);
  };

  const deleteAccount = async () => {
    if (!user) return;
    localStorage.removeItem(`YOLO_PROFILE_${user.uid}`);
    localStorage.removeItem(`YOLO_COINS_${user.uid}`); // Clean up persistent coins too
    await user.delete();
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, logout, updateProfile, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};