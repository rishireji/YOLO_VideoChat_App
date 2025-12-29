import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { UserSession, Region, DAILY_ALLOWANCE } from '../types';
import { auth } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

interface SessionContextType {
  session: UserSession | null;
  createSession: (region: Region) => void;
  updateSession: (updates: Partial<UserSession>) => void;
  clearSession: () => void;
  deductCoins: (amount: number) => boolean;
  purchaseCoins: (amount: number) => void;
  isLoading: boolean;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

const SESSION_KEY = 'YOLO_SESSION_V3';
const SESSION_DURATION = 24 * 60 * 60 * 1000;
const RESET_CYCLE = 24 * 60 * 60 * 1000;

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkAndResetCoins = useCallback((sess: UserSession): UserSession => {
    const now = Date.now();
    if (now - sess.lastResetAt >= RESET_CYCLE) {
      console.log("[YOLO] Daily reset triggered. Restoring coins.");
      return {
        ...sess,
        coins: DAILY_ALLOWANCE,
        lastResetAt: now
      };
    }
    return sess;
  }, []);

  // Sync session with Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setSession(prev => {
          if (!prev) return null;
          // When signing in, we might want to load persistent purchased coins
          const persistentCoins = localStorage.getItem(`YOLO_COINS_${firebaseUser.uid}`);
          const purchased = persistentCoins ? parseInt(persistentCoins) : prev.purchasedCoins;
          
          const updated = { ...prev, uid: firebaseUser.uid, purchasedCoins: purchased };
          localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
          return updated;
        });
      } else {
        setSession(prev => {
          if (!prev) return null;
          const { uid, ...rest } = prev;
          const updated = { ...rest };
          localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
          return updated;
        });
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const savedSession = localStorage.getItem(SESSION_KEY);
    if (savedSession) {
      try {
        let parsed: UserSession = JSON.parse(savedSession);
        if (Date.now() < parsed.expiresAt) {
          parsed = checkAndResetCoins(parsed);
          setSession(parsed);
          localStorage.setItem(SESSION_KEY, JSON.stringify(parsed));
        } else {
          localStorage.removeItem(SESSION_KEY);
        }
      } catch (e) {
        localStorage.removeItem(SESSION_KEY);
      }
    }
    setIsLoading(false);
  }, [checkAndResetCoins]);

  const createSession = (region: Region) => {
    const now = Date.now();
    const expiresAt = now + SESSION_DURATION;
    const currentUser = auth.currentUser;
    
    // Load persistent coins if user is already signed in
    let initialPurchased = 0;
    if (currentUser) {
      const saved = localStorage.getItem(`YOLO_COINS_${currentUser.uid}`);
      if (saved) initialPurchased = parseInt(saved);
    }

    const newSession: UserSession = {
      id: crypto.randomUUID?.() || Math.random().toString(36).substring(2) + now.toString(36),
      token: `jwt_anon_${Math.random().toString(36).substring(2)}`,
      region,
      isModerated: false,
      expiresAt,
      preferredLanguage: 'English',
      coins: DAILY_ALLOWANCE,
      purchasedCoins: initialPurchased,
      lastResetAt: now,
      uid: currentUser?.uid
    };
    
    setSession(newSession);
    localStorage.setItem(SESSION_KEY, JSON.stringify(newSession));
  };

  const deductCoins = (amount: number): boolean => {
    if (!session) return false;
    
    const totalAvailable = session.coins + session.purchasedCoins;
    if (totalAvailable < amount) return false;

    setSession(prev => {
      if (!prev) return null;
      let newCoins = prev.coins;
      let newPurchased = prev.purchasedCoins;

      if (newCoins >= amount) {
        newCoins -= amount;
      } else {
        const remainder = amount - newCoins;
        newCoins = 0;
        newPurchased -= remainder;
      }

      const updated = { ...prev, coins: newCoins, purchasedCoins: newPurchased };
      localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
      
      // Persist purchased coins if signed in
      if (prev.uid) {
        localStorage.setItem(`YOLO_COINS_${prev.uid}`, newPurchased.toString());
      }
      
      return updated;
    });

    return true;
  };

  const purchaseCoins = (amount: number) => {
    setSession(prev => {
      if (!prev) return null;
      const updatedPurchased = prev.purchasedCoins + amount;
      const updated = { ...prev, purchasedCoins: updatedPurchased };
      localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
      
      if (prev.uid) {
        localStorage.setItem(`YOLO_COINS_${prev.uid}`, updatedPurchased.toString());
      }
      
      return updated;
    });
  };

  const updateSession = (updates: Partial<UserSession>) => {
    setSession(prev => {
      if (!prev) return null;
      const updated = { ...prev, ...updates };
      localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const clearSession = () => {
    setSession(null);
    localStorage.removeItem(SESSION_KEY);
  };

  return (
    <SessionContext.Provider value={{ session, createSession, updateSession, clearSession, deductCoins, purchaseCoins, isLoading }}>
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used within SessionProvider');
  return context;
};