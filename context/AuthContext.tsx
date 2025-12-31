import React, { createContext, useContext, useState, useEffect } from 'react';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import 'firebase/compat/storage';
import { UserProfile, UserFile, FriendRequest } from '../types';
import { GoogleGenAI } from "@google/genai";

const firebaseConfig = {
  apiKey: "AIzaSyDgVumOW56U2NeWWJjHPr7gdya6KWSvnDI",
  authDomain: "yolo-videochat.firebaseapp.com",
  projectId: "yolo-videochat",
  storageBucket: "gs://yolo-videochat.firebasestorage.app",
  messagingSenderId: "437252324088",
  appId: "1:437252324088:web:2681b9faee9ac95fc1990d",
  measurementId: "G-80GD9TKFDL"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.app().storage('gs://yolo-videochat.firebasestorage.app');

db.enablePersistence({ synchronizeTabs: true }).catch((err: firebase.firestore.FirestoreError) => {
  if (err.code === 'failed-precondition') console.warn('[YOLO Auth] Persistence failed');
});

const optimizeImage = (base64Str: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_SIZE = 512; 
      let width = img.width, height = img.height;
      if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } }
      else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) { ctx.drawImage(img, 0, 0, width, height); resolve(canvas.toDataURL('image/jpeg', 0.8)); }
      else resolve(base64Str);
    };
    img.onerror = () => resolve(base64Str);
  });
};

const uploadUserImage = async (uid: string, base64: string, fileName: string): Promise<string> => {
  const optimized = await optimizeImage(base64);
  const response = await fetch(optimized);
  const blob = await response.blob();
  const ref = storage.ref(`user_uploads/${uid}/${fileName}`);
  await ref.put(blob);
  return await ref.getDownloadURL();
};

interface AuthContextType {
  user: { email: string; uid: string; displayName: string | null; photoURL: string | null; emailVerified: boolean; } | null;
  profile: UserProfile | null;
  friendProfiles: UserProfile[];
  sentRequests: FriendRequest[];
  receivedRequests: FriendRequest[];
  files: UserFile[];
  loading: boolean;
  signIn: (email: string, pass: string) => Promise<void>;
  signUp: (email: string, pass: string, displayName: string, photo: string | null) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  logout: () => void;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  sendFriendRequest: (targetUid: string) => Promise<void>;
  acceptFriendRequest: (targetUid: string) => Promise<void>;
  declineFriendRequest: (targetUid: string) => Promise<void>;
  deleteAccount: () => void;
  uploadVaultFile: (file: File, notes?: string) => Promise<void>;
  deleteVaultFile: (fileId: string, storagePath: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthContextType['user'] | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [friendProfiles, setFriendProfiles] = useState<UserProfile[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);
  const [receivedRequests, setReceivedRequests] = useState<FriendRequest[]>([]);
  const [files, setFiles] = useState<UserFile[]>([]);
  const [loading, setLoading] = useState(true);

  const syncUserWithFirestore = async (uid: string, email: string, initialData?: Partial<UserProfile>) => {
    const userDocRef = db.collection('Users').doc(uid);
    let doc = await userDocRef.get();
    
    if (!doc.exists) {
      const newProfile: UserProfile = {
        uid, email, name: initialData?.name || `Anon_${uid.substring(0, 4).toUpperCase()}`,
        Profile_photo: initialData?.Profile_photo || null,
        Display_Pic1: null, Display_Pic2: null, Display_Pic3: null,
        bio: '', allowFriendRequests: true, revealPhotosToFriendsOnly: true,
        revealRule: 'manual', revealTimeMinutes: 5
      };
      await userDocRef.set(newProfile);
      setProfile(newProfile);
    } else {
      setProfile(doc.data() as UserProfile);
    }

    const unsubFriends = userDocRef.collection('friends').onSnapshot(async (snap) => {
      const uids = snap.docs.map(d => d.id);
      if (uids.length === 0) {
        setFriendProfiles([]);
        return;
      }
      
      const resolved: UserProfile[] = [];
      const chunks = [];
      for (let i = 0; i < uids.length; i += 30) chunks.push(uids.slice(i, i + 30));
      
      for (const chunk of chunks) {
        try {
          const q = await db.collection('Users')
            .where(firebase.firestore.FieldPath.documentId(), 'in', chunk)
            .get();
          q.forEach(d => resolved.push(d.data() as UserProfile));
        } catch (err) {
          console.warn('[YOLO Auth] Restricted profile read prevented by security rules.', err);
        }
      }
      setFriendProfiles(resolved);
    });

    const unsubSent = userDocRef.collection('sentRequests').onSnapshot(snap => {
      setSentRequests(snap.docs.map(d => ({ ...d.data(), uid: d.id } as FriendRequest)));
    }, err => console.debug('[YOLO Auth] sentRequests listener blocked', err));

    const unsubReceived = userDocRef.collection('receivedRequests').onSnapshot(snap => {
      setReceivedRequests(snap.docs.map(d => ({ ...d.data(), uid: d.id } as FriendRequest)));
    }, err => console.debug('[YOLO Auth] receivedRequests listener blocked', err));

    const unsubFiles = userDocRef.collection('files').orderBy('createdAt', 'desc').onSnapshot(snap => {
      setFiles(snap.docs.map(d => d.data() as UserFile));
    });

    return () => { unsubFriends(); unsubSent(); unsubReceived(); unsubFiles(); };
  };

  useEffect(() => {
    let unsub: (() => void) | undefined;
    const unsubscribeAuth = auth.onAuthStateChanged(async (u) => {
      if (u && u.email && u.emailVerified) {
        setUser({ email: u.email, uid: u.uid, displayName: u.displayName, photoURL: u.photoURL, emailVerified: u.emailVerified });
        unsub = await syncUserWithFirestore(u.uid, u.email);
      } else {
        setUser(null); setProfile(null); setFriendProfiles([]); setSentRequests([]); setReceivedRequests([]); setFiles([]);
        if (unsub) unsub();
      }
      setLoading(false);
    });
    return () => { unsubscribeAuth(); if (unsub) unsub(); };
  }, []);

  const sendFriendRequest = async (targetUid: string) => {
    if (!user || !profile) return;
    const batch = db.batch();
    const sentRef = db.collection('Users').doc(user.uid).collection('sentRequests').doc(targetUid);
    const receivedRef = db.collection('Users').doc(targetUid).collection('receivedRequests').doc(user.uid);
    
    batch.set(sentRef, { status: 'pending', createdAt: Date.now() });
    batch.set(receivedRef, { 
      status: 'pending', 
      name: profile.name, 
      photoURL: profile.Profile_photo, 
      createdAt: Date.now() 
    });
    await batch.commit();
  };

  const acceptFriendRequest = async (targetUid: string) => {
    if (!user) return;
    const batch = db.batch();
    const chatId = [user.uid, targetUid].sort().join('_');
    const myReceivedRef = db.collection('Users').doc(user.uid).collection('receivedRequests').doc(targetUid);
    const peerSentRef = db.collection('Users').doc(targetUid).collection('sentRequests').doc(user.uid);
    const myFriendRef = db.collection('Users').doc(user.uid).collection('friends').doc(targetUid);
    const peerFriendRef = db.collection('Users').doc(targetUid).collection('friends').doc(user.uid);

    batch.delete(myReceivedRef);
    batch.delete(peerSentRef);
    
    const friendData = { connectedAt: Date.now(), chatId: chatId, status: 'active' };
    batch.set(myFriendRef, friendData);
    batch.set(peerFriendRef, friendData);

    await batch.commit();
  };

  const declineFriendRequest = async (targetUid: string) => {
    if (!user) return;
    const batch = db.batch();
    batch.delete(db.collection('Users').doc(user.uid).collection('receivedRequests').doc(targetUid));
    batch.delete(db.collection('Users').doc(targetUid).collection('sentRequests').doc(user.uid));
    await batch.commit();
  };

  const signIn = async (e: string, p: string) => {
    const cred = await auth.signInWithEmailAndPassword(e, p);
    if (cred.user && !cred.user.emailVerified) { await cred.user.sendEmailVerification(); await auth.signOut(); throw new Error("EMAIL_NOT_VERIFIED"); }
  };

  const signUp = async (e: string, p: string, dn: string, ph: string | null) => {
    const cred = await auth.createUserWithEmailAndPassword(e, p);
    if (cred.user) {
      let url = null;
      if (ph) url = await uploadUserImage(cred.user.uid, ph, 'profile_identity.jpg');
      await cred.user.updateProfile({ displayName: dn, photoURL: url });
      await syncUserWithFirestore(cred.user.uid, e, { name: dn, Profile_photo: url });
      await cred.user.sendEmailVerification();
      await auth.signOut();
      throw new Error("EMAIL_NOT_VERIFIED");
    }
  };

  const sendPasswordReset = async (email: string) => { await auth.sendPasswordResetEmail(email); };
  const logout = async () => { await auth.signOut(); };

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!profile || !user || !auth.currentUser) return;
    let fsUpdates: any = { ...updates };
    for (const field of ['Profile_photo', 'Display_Pic1', 'Display_Pic2', 'Display_Pic3']) {
      const val = updates[field as keyof UserProfile];
      if (typeof val === 'string' && val.startsWith('data:')) {
        const url = await uploadUserImage(user.uid, val, `${field.toLowerCase()}.jpg`);
        fsUpdates[field] = url;
        if (field === 'Profile_photo') await auth.currentUser.updateProfile({ photoURL: url });
      }
    }
    if (updates.name) await auth.currentUser.updateProfile({ displayName: updates.name });
    await db.collection('Users').doc(user.uid).update(fsUpdates);
    setProfile(prev => prev ? ({ ...prev, ...fsUpdates }) : null);
  };

  const uploadVaultFile = async (file: File, notes: string = '') => {
    if (!user) return;
    const id = crypto.randomUUID();
    const path = `user_uploads/${user.uid}/${id}_${file.name}`;
    const ref = storage.ref(path);
    await ref.put(file);
    const url = await ref.getDownloadURL();
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const res = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Technical summary for file: ${file.name} (${file.type}).`,
    });
    const fileData: UserFile = { id, name: file.name, mimeType: file.type || 'app/octet', size: file.size, url, storagePath: path, createdAt: Date.now(), notes, aiSummary: res.text || "" };
    await db.collection('Users').doc(user.uid).collection('files').doc(id).set(fileData);
  };

  const deleteVaultFile = async (id: string, path: string) => {
    if (!user) return;
    try { await storage.ref(path).delete(); } catch {}
    await db.collection('Users').doc(user.uid).collection('files').doc(id).delete();
  };

  const deleteAccount = async () => {
    if (!user || !auth.currentUser) return;
    await db.collection('Users').doc(user.uid).delete();
    await auth.currentUser.delete();
    await logout();
  };

  return (
    <AuthContext.Provider value={{ 
      user, profile, friendProfiles, sentRequests, receivedRequests, files, loading, signIn, signUp, sendPasswordReset, logout, updateProfile, 
      sendFriendRequest, acceptFriendRequest, declineFriendRequest, deleteAccount, uploadVaultFile, deleteVaultFile 
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