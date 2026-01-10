import React, { createContext, useContext, useState, useEffect } from 'react';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import 'firebase/compat/storage';
import { UserProfile, UserFile, FriendRequest } from '../types';
import { aiService } from '../services/aiService';

const firebaseConfig = {
  apiKey: "AIzaSyDgVumOW56U2NeWWJjHPr7gdya6KWSvnDI",
  authDomain: "yolo-videochat.firebaseapp.com",
  projectId: "yolo-videochat",
  storageBucket: "gs://yolo-videochat.firebasestorage.app",
  messagingSenderId: "437252324088",
  appId: "1:437252324088:web:2681b9faee9ac95fc1990d",
  measurementId: "G-80GD9TKFDL"
};

// Lazy-load Firebase instances to prevent evaluation-time crashes
let firebaseApp: firebase.app.App | null = null;
const getFirebase = () => {
  if (!firebaseApp) {
    if (!firebase.apps.length) {
      firebaseApp = firebase.initializeApp(firebaseConfig);
    } else {
      firebaseApp = firebase.app();
    }
  }
  return firebaseApp;
};

const getAuth = () => getFirebase().auth();
const getDb = () => getFirebase().firestore();
const getStorage = () => getFirebase().storage('gs://yolo-videochat.firebasestorage.app');

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
    const db = getDb();
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

    // Safety wrapper for listeners
    const safeSubscribe = (ref: any, callback: (snap: any) => void) => {
      return ref.onSnapshot(callback, (err: any) => {
        console.warn("[YOLO Auth] Listener permission error suppressed:", err.code);
      });
    };

    const unsubFriends = safeSubscribe(userDocRef.collection('friends'), async (snap: any) => {
      const uids = snap.docs.map((d: any) => d.id);
      if (uids.length === 0) {
        setFriendProfiles([]);
        return;
      }
      const resolved: UserProfile[] = [];
      try {
        const q = await db.collection('Users')
          .where(firebase.firestore.FieldPath.documentId(), 'in', uids.slice(0, 30))
          .get();
        q.forEach(d => resolved.push(d.data() as UserProfile));
      } catch (err) {
        console.warn('[YOLO Auth] Friend fetch error:', err);
      }
      setFriendProfiles(resolved);
    });

    const unsubSent = safeSubscribe(userDocRef.collection('sentRequests'), (snap: any) => {
      setSentRequests(snap.docs.map((d: any) => ({ ...d.data(), uid: d.id } as FriendRequest)));
    });

    const unsubReceived = safeSubscribe(userDocRef.collection('receivedRequests'), (snap: any) => {
      setReceivedRequests(snap.docs.map((d: any) => ({ ...d.data(), uid: d.id } as FriendRequest)));
    });

    const unsubFiles = safeSubscribe(userDocRef.collection('files').orderBy('createdAt', 'desc'), (snap: any) => {
      setFiles(snap.docs.map((d: any) => d.data() as UserFile));
    });

    return () => { unsubFriends(); unsubSent(); unsubReceived(); unsubFiles(); };
  };

useEffect(() => {
  const auth = getAuth();

  const unsubscribeAuth = auth.onAuthStateChanged(async (u) => {
    try {
      if (u && u.email && u.emailVerified) {
        setUser({
          email: u.email,
          uid: u.uid,
          displayName: u.displayName,
          photoURL: u.photoURL,
          emailVerified: u.emailVerified,
        });

        await syncUserWithFirestore(u.uid, u.email);
      } else {
        setUser(null);
        setProfile(null);
      }
    } catch (err) {
      console.error('[Auth] Init failed:', err);
      setUser(null);
    } finally {
      // ✅ ALWAYS RUN
      setLoading(false);
    }
  });

  return () => unsubscribeAuth();
}, []);

  const signIn = async (e: string, p: string) => {
    const cred = await getAuth().signInWithEmailAndPassword(e, p);
    if (cred.user && !cred.user.emailVerified) {
      await cred.user.sendEmailVerification();
      await getAuth().signOut();
      return Promise.reject(new Error("EMAIL_NOT_VERIFIED"));
    }
  };

  const signUp = async (e: string, p: string, dn: string, ph: string | null) => {
    const cred = await getAuth().createUserWithEmailAndPassword(e, p);
    if (cred.user) {
      let photoURL = null;
      if (ph) {
        const response = await fetch(ph);
        const blob = await response.blob();
        const ref = getStorage().ref(`user_uploads/${cred.user.uid}/profile_identity.jpg`);
        await ref.put(blob);
        photoURL = await ref.getDownloadURL();
      }
      await cred.user.updateProfile({ displayName: dn, photoURL });
      await syncUserWithFirestore(cred.user.uid, e, { name: dn, Profile_photo: photoURL });
      await cred.user.sendEmailVerification();
      await getAuth().signOut();
      return Promise.reject(new Error("EMAIL_NOT_VERIFIED"));
    }
  };

  const uploadVaultFile = async (file: File, notes: string = '') => {
    if (!user) return;
    const id = crypto.randomUUID();
    const path = `user_uploads/${user.uid}/${id}_${file.name}`;
    const ref = getStorage().ref(path);
    
    // Step 1: Upload the file
    await ref.put(file);
    const url = await ref.getDownloadURL();
    
    // Step 2: Attempt AI summary (Non-blocking crash-safe)
    let aiSummary = "Processing summary...";
    try {
      aiSummary = await aiService.generateFileSummary(file.name, file.type);
    } catch (e) {
      aiSummary = "Summary failed.";
    }

    const fileData: UserFile = {
      id,
      name: file.name,
      mimeType: file.type || 'app/octet-stream',
      size: file.size,
      url,
      storagePath: path,
      createdAt: firebase.firestore.Timestamp.now(),
      notes,
      aiSummary
    };
    
    await getDb().collection('Users').doc(user.uid).collection('files').doc(id).set(fileData);
  };

  const sendFriendRequest = async (targetUid: string) => {
    if (!user || !profile || user.uid === targetUid) return;
    const batch = getDb().batch();
    batch.set(getDb().collection('Users').doc(user.uid).collection('sentRequests').doc(targetUid), { status: 'pending', createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    batch.set(getDb().collection('Users').doc(targetUid).collection('receivedRequests').doc(user.uid), { fromUid: user.uid, name: profile.name, photoURL: profile.Profile_photo || null, status: 'pending', createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    await batch.commit();
  };

  const acceptFriendRequest = async (targetUid: string) => {
    if (!user || !profile) return;
    const batch = getDb().batch();
    batch.delete(getDb().collection('Users').doc(user.uid).collection('receivedRequests').doc(targetUid));
    batch.delete(getDb().collection('Users').doc(targetUid).collection('sentRequests').doc(user.uid));
    const timestamp = firebase.firestore.FieldValue.serverTimestamp();
    batch.set(getDb().collection('Users').doc(user.uid).collection('friends').doc(targetUid), { connectedAt: timestamp });
    batch.set(getDb().collection('Users').doc(targetUid).collection('friends').doc(user.uid), { connectedAt: timestamp });
    await batch.commit();
  };

  const declineFriendRequest = async (targetUid: string) => {
    if (!user) return;
    const batch = getDb().batch();
    batch.delete(getDb().collection('Users').doc(user.uid).collection('receivedRequests').doc(targetUid));
    batch.delete(getDb().collection('Users').doc(targetUid).collection('sentRequests').doc(user.uid));
    await batch.commit();
  };

  const logout = () => getAuth().signOut();
  const sendPasswordReset = (email: string) => getAuth().sendPasswordResetEmail(email);

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!profile || !user) return;
    await getDb().collection('Users').doc(user.uid).update(updates);
    setProfile(prev => prev ? ({ ...prev, ...updates }) : null);
  };

  const deleteVaultFile = async (id: string, path: string) => {
    if (!user) return;
    try { await getStorage().ref(path).delete(); } catch {}
    await getDb().collection('Users').doc(user.uid).collection('files').doc(id).delete();
  };

  const deleteAccount = async () => {
    if (!user || !getAuth().currentUser) return;
    await getDb().collection('Users').doc(user.uid).delete();
    await getAuth().currentUser?.delete();
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