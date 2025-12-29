import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile } from '../types';

interface AuthContextType {
  user: { email: string; uid: string } | null;
  profile: UserProfile | null;
  isLoading: boolean;
  signIn: (email: string) => Promise<void>;
  signUp: (email: string) => Promise<void>;
  logout: () => void;
  updateProfile: (updates: Partial<UserProfile>) => void;
  deleteAccount: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_STORAGE_KEY = 'YOLO_MOCK_AUTH_V1';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<{ email: string; uid: string } | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const savedAuth = localStorage.getItem(AUTH_STORAGE_KEY);
    if (savedAuth) {
      try {
        const data = JSON.parse(savedAuth);
        setUser({ email: data.email, uid: data.uid });
        setProfile(data.profile);
      } catch (e) {
        localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  const saveAuth = (email: string, uid: string, prof: UserProfile) => {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ email, uid, profile: prof }));
    setUser({ email, uid });
    setProfile(prof);
  };

  const signIn = async (email: string) => {
    // In mock mode, we just check if this email exists in our simple simulated store
    // For now, we'll just treat any email as "found" or "created"
    const uid = `mock_uid_${Math.random().toString(36).substring(7)}`;
    const newProfile: UserProfile = {
      uid,
      email,
      photos: [],
      primaryPhotoIndex: 0,
      bio: '',
      allowFriendRequests: true,
      revealPhotosToFriendsOnly: true,
      friends: []
    };
    saveAuth(email, uid, newProfile);
  };

  const signUp = async (email: string) => {
    await signIn(email); // Mock signUp behaves the same as signIn
  };

  const logout = () => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setUser(null);
    setProfile(null);
  };

  const updateProfile = (updates: Partial<UserProfile>) => {
    if (!profile || !user) return;
    const newProfile = { ...profile, ...updates };
    setProfile(newProfile);
    saveAuth(user.email, user.uid, newProfile);
  };

  const deleteAccount = () => {
    logout();
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      isLoading, 
      signIn, 
      signUp, 
      logout, 
      updateProfile, 
      deleteAccount 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};