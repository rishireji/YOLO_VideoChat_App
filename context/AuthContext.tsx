import React, { createContext, useContext, useState, useEffect } from 'react';
// Use compatibility imports to resolve missing modular export errors in specific build environments
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import 'firebase/compat/storage';
import { UserProfile, UserFile } from '../types';
import { GoogleGenAI } from "@google/genai";

// YOLO Production Firebase Configuration
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
  if (err.code === 'failed-precondition') {
    console.warn('[YOLO Auth] Firestore persistence failed: Multiple tabs open');
  } else if (err.code === 'unimplemented') {
    console.warn('[YOLO Auth] Firestore persistence is not available in this browser');
  }
});

const optimizeImage = (base64Str: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_SIZE = 512; 
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
      } else {
        if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      } else {
        resolve(base64Str);
      }
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
  user: { 
    email: string; 
    uid: string; 
    displayName: string | null; 
    photoURL: string | null; 
    emailVerified: boolean;
  } | null;
  profile: UserProfile | null;
  friendProfiles: UserProfile[];
  files: UserFile[];
  loading: boolean;
  signIn: (email: string, pass: string) => Promise<void>;
  signUp: (email: string, pass: string, displayName: string, photo: string | null) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  logout: () => void;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  addFriend: (userA: string, userB: string) => Promise<void>;
  deleteAccount: () => void;
  uploadVaultFile: (file: File, notes?: string) => Promise<void>;
  deleteVaultFile: (fileId: string, storagePath: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthContextType['user'] | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [friendProfiles, setFriendProfiles] = useState<UserProfile[]>([]);
  const [files, setFiles] = useState<UserFile[]>([]);
  const [loading, setLoading] = useState(true);

  // Friend sync using subcollection
  useEffect(() => {
    if (!user?.uid) {
      setFriendProfiles([]);
      return;
    }

    const unsubscribe = db
      .collection('Users')
      .doc(user.uid)
      .collection('friends')
      .onSnapshot(async (snap) => {
        const friendUids = snap.docs.map(doc => doc.id);

        if (friendUids.length === 0) {
          setFriendProfiles([]);
          return;
        }

        try {
          const resolved: UserProfile[] = [];
          // Firestore limits "in" queries to 30 items
          const chunks: string[][] = [];
          for (let i = 0; i < friendUids.length; i += 30) {
            chunks.push(friendUids.slice(i, i + 30));
          }

          for (const chunk of chunks) {
            if (chunk.length === 0) continue;
            const q = await db
              .collection('Users')
              .where(firebase.firestore.FieldPath.documentId(), 'in', chunk)
              .get();

            q.forEach(doc => resolved.push(doc.data() as UserProfile));
          }

          setFriendProfiles(resolved);
        } catch (err: any) {
          console.error("[YOLO Auth] Friend profile resolution failed:", err.message);
        }
      }, (err) => {
        console.warn('[YOLO Auth] Friend listener error:', err.message);
      });

    return () => unsubscribe();
  }, [user?.uid]);

  const syncUserWithFirestore = async (uid: string, email: string, initialData?: Partial<UserProfile>) => {
    try {
      const userDocRef = db.collection('Users').doc(uid);
      
      let doc;
      try {
        doc = await userDocRef.get();
      } catch (getErr: any) {
        if (getErr.code === 'permission-denied') {
          console.warn("[YOLO Auth] Profile read permission denied for UID:", uid);
          return;
        }
        throw getErr;
      }
      
      if (!doc.exists) {
        const newProfile: UserProfile = {
          uid, email,
          name: initialData?.name || `Anon_${uid.substring(0, 4).toUpperCase()}`,
          Profile_photo: initialData?.Profile_photo || null,
          Display_Pic1: null, Display_Pic2: null, Display_Pic3: null,
          bio: '', allowFriendRequests: true, revealPhotosToFriendsOnly: true,
          revealRule: 'manual', revealTimeMinutes: 5
        };
        await userDocRef.set(newProfile);
        setProfile(newProfile);
      } else {
        const data = doc.data() as UserProfile;
        setProfile(data);
      }

      const unsubFiles = userDocRef.collection('files').orderBy('createdAt', 'desc').onSnapshot(
        (snap: firebase.firestore.QuerySnapshot) => {
          const fileList: UserFile[] = [];
          snap.forEach((d: firebase.firestore.QueryDocumentSnapshot) => {
            fileList.push(d.data() as UserFile);
          });
          setFiles(fileList);
        },
        (err: firebase.firestore.FirestoreError) => {
          console.warn("[YOLO Auth] File Snapshot Listener Error:", err.message);
        }
      );

      return unsubFiles;
    } catch (error) {
      console.error("[YOLO Auth] Error syncing Firestore profile:", error);
    }
  };

  useEffect(() => {
    let unsubFiles: (() => void) | undefined;

    const unsubscribeAuth = auth.onAuthStateChanged(async (firebaseUser: firebase.User | null) => {
      if (firebaseUser && firebaseUser.email && firebaseUser.emailVerified) {
        setUser({ 
          email: firebaseUser.email, 
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
          emailVerified: firebaseUser.emailVerified
        });
        unsubFiles = await syncUserWithFirestore(firebaseUser.uid, firebaseUser.email);
      } else {
        setUser(null);
        setProfile(null);
        setFriendProfiles([]);
        setFiles([]);
        if (unsubFiles) unsubFiles();
      }
      setLoading(false);
    });

    return () => {
      unsubscribeAuth();
      if (unsubFiles) unsubFiles();
    };
  }, []);

  const uploadVaultFile = async (file: File, notes: string = '') => {
    if (!user) return;
    const fileId = crypto.randomUUID();
    const storagePath = `user_uploads/${user.uid}/${fileId}_${file.name}`;
    const storageRef = storage.ref(storagePath);
    await storageRef.put(file);
    const downloadURL = await storageRef.getDownloadURL();

    let aiSummary = "Processing intelligence...";
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Provide a concise, technical summary for a file named "${file.name}" of type "${file.type}". If this looks like a sensitive document, warn the user to encrypt it. Context: This is part of an anonymous ephemeral vault.`,
      });
      aiSummary = response.text || "No summary could be generated.";
    } catch (err) {
      aiSummary = "Summary temporarily unavailable.";
    }

    const fileData: UserFile = {
      id: fileId,
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      url: downloadURL,
      storagePath: storagePath,
      createdAt: Date.now(),
      notes,
      aiSummary
    };

    await db.collection('Users').doc(user.uid).collection('files').doc(fileId).set(fileData);
  };

  const deleteVaultFile = async (fileId: string, storagePath: string) => {
    if (!user) return;
    try { await storage.ref(storagePath).delete(); } catch (err) {}
    await db.collection('Users').doc(user.uid).collection('files').doc(fileId).delete();
  };

  const signIn = async (email: string, pass: string) => {
    const credential = await auth.signInWithEmailAndPassword(email, pass);
    const u = credential.user;
    if (u && u.email) {
      if (!u.emailVerified) {
        await u.sendEmailVerification();
        await auth.signOut();
        const error = new Error("EMAIL_NOT_VERIFIED");
        (error as any).email = u.email;
        throw error;
      }
      setUser({ email: u.email, uid: u.uid, displayName: u.displayName, photoURL: u.photoURL, emailVerified: u.emailVerified });
      await syncUserWithFirestore(u.uid, u.email);
    }
  };

  const signUp = async (email: string, pass: string, displayName: string, photo: string | null) => {
    const credential = await auth.createUserWithEmailAndPassword(email, pass);
    const u = credential.user;
    if (u) {
      let photoURL = null;
      if (photo) { photoURL = await uploadUserImage(u.uid, photo, 'profile_identity.jpg'); }
      await u.updateProfile({ displayName: displayName || `Anon_${u.uid.substring(0, 4)}`, photoURL: photoURL });
      await syncUserWithFirestore(u.uid, email, { name: displayName, Profile_photo: photoURL });
      await u.sendEmailVerification();
      await auth.signOut();
      const error = new Error("EMAIL_NOT_VERIFIED");
      (error as any).email = email;
      throw error;
    }
  };

  const sendPasswordReset = async (email: string) => { await auth.sendPasswordResetEmail(email); };

  const logout = async () => {
    await auth.signOut();
    setUser(null);
    setProfile(null);
    setFriendProfiles([]);
    setFiles([]);
  };

  const addFriend = async (userA: string, userB: string) => {
    const batch = db.batch();
    const refA = db.collection('Users').doc(userA).collection('friends').doc(userB);
    const refB = db.collection('Users').doc(userB).collection('friends').doc(userA);
    const data = { connectedAt: Date.now() };
    batch.set(refA, data);
    batch.set(refB, data);
    await batch.commit();
  };

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!profile || !user || !auth.currentUser) return;
    try {
      let firestoreUpdates: any = { ...updates };
      const imageFields = ['Profile_photo', 'Display_Pic1', 'Display_Pic2', 'Display_Pic3'];
      for (const field of imageFields) {
        const val = updates[field as keyof UserProfile];
        if (typeof val === 'string' && val.startsWith('data:')) {
          const fileName = `${field.toLowerCase()}.jpg`;
          const url = await uploadUserImage(user.uid, val, fileName);
          firestoreUpdates[field] = url;
          if (field === 'Profile_photo') {
            await auth.currentUser.updateProfile({ photoURL: url });
            setUser(prev => prev ? ({ ...prev, photoURL: url }) : null);
          }
        }
      }
      if (updates.name !== undefined) {
        await auth.currentUser.updateProfile({ displayName: updates.name });
        setUser(prev => prev ? ({ ...prev, displayName: updates.name || null }) : null);
      }
      const newProfile = { ...profile, ...firestoreUpdates };
      setProfile(newProfile);
      await db.collection('Users').doc(user.uid).update(firestoreUpdates);
    } catch (error: any) {
      console.error("[YOLO Auth] Update Profile Error:", error);
      throw error;
    }
  };

  const deleteAccount = async () => {
    if (!user || !auth.currentUser) return;
    const uid = user.uid;
    try {
      const fileSnap = await db.collection('Users').doc(uid).collection('files').get();
      for (const f of fileSnap.docs) {
        const fileData = f.data() as UserFile;
        await storage.ref(fileData.storagePath).delete().catch(() => {});
        await f.ref.delete();
      }
      const imageFields = ['profile_identity.jpg', 'profile_photo.jpg', 'display_pic1.jpg', 'display_pic2.jpg', 'display_pic3.jpg'];
      for (const img of imageFields) { await storage.ref(`user_uploads/${uid}/${img}`).delete().catch(() => {}); }
      await db.collection('Users').doc(uid).delete();
      await auth.currentUser.delete();
      await logout();
    } catch (err) { throw new Error("Purge failed. Re-authenticate to delete records."); }
  };

  return (
    <AuthContext.Provider value={{ 
      user, profile, friendProfiles, files, loading, signIn, signUp, sendPasswordReset, logout, updateProfile, addFriend, deleteAccount,
      uploadVaultFile, deleteVaultFile
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