import { useState, useEffect, useRef, useCallback } from 'react';
import { Peer, DataConnection, MediaConnection } from 'peerjs';
import { Region, ReactionType } from '../types';
import { useSession } from '../context/SessionContext';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

// --- Types ---
type WebRTCStatus = 'idle' | 'generating_id' | 'matching' | 'connecting' | 'connected' | 'disconnected' | 'error';

// --- Constants ---
const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ],
  iceCandidatePoolSize: 0,
};

export const useWebRTC = (
  region: Region,
  onReactionReceived: (type: ReactionType) => void,
  onMessageReceived: (text: string) => void,
  gender?: string,       
  interests?: string[]
) => {
  const { session } = useSession();
  
  // --- State ---
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [status, setStatusState] = useState<WebRTCStatus>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [remotePeerId, setRemotePeerId] = useState<string | null>(null);

  // --- Refs ---
  const peerRef = useRef<Peer | null>(null);
  const callRef = useRef<MediaConnection | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  
  // Firestore Unsubscribe Refs
  const matchListenerRef = useRef<(() => void) | null>(null);
  const ticketRef = useRef<firebase.firestore.DocumentReference | null>(null);
  
  const lockRef = useRef<string | null>(null); 
  const isClosingRef = useRef(false);
  const myIdRef = useRef<string | null>(null);

  // 🔥 Ref to hold connectSignaling to break circular dependency
  const connectSignalingRef = useRef<((myId: string, stream: MediaStream) => void) | null>(null);

  // --- Helpers ---
  const updateStatus = useCallback((newStatus: WebRTCStatus) => {
    setStatusState(newStatus);
  }, []);

  const cleanup = useCallback(async () => {
    console.log("[YOLO] Cleanup: Releasing resources.");
    lockRef.current = null;
    setRemotePeerId(null);

    // Stop Firestore Listeners
    if (matchListenerRef.current) {
      matchListenerRef.current();
      matchListenerRef.current = null;
    }
    
    // Delete Matchmaking Ticket
    if (ticketRef.current) {
      try {
        await ticketRef.current.delete();
      } catch (e) { console.warn("Failed to delete ticket", e); }
      ticketRef.current = null;
    }

    if (callRef.current) { callRef.current.close(); callRef.current = null; }
    if (connRef.current) { connRef.current.close(); connRef.current = null; }
    setRemoteStream(null);
  }, []);

  const skip = useCallback((shouldBlacklist: boolean = false) => {
    // 1️⃣ Hard guard: skip owns the reconnect
    isClosingRef.current = true;
    lockRef.current = null;

    // 2️⃣ Cleanup P2P & Firestore
    cleanup().then(() => {
      updateStatus('matching');

      // 3️⃣ Reconnect signaling safely (next tick)
      setTimeout(() => {
        isClosingRef.current = false;
        const myId = myIdRef.current;
        if (myId && localStream) {
          connectSignalingRef.current?.(myId, localStream);
        }
      }, 500);
    });
  }, [cleanup, updateStatus, localStream]);

  const revealIdentity = useCallback(() => {
    if (connRef.current?.open) {
      console.log("[YOLO] Revealing Identity...");
      connRef.current.send({ type: 'reveal-identity', user: (session as any)?.user });
    }
  }, [session]);

  // --- Handlers ---
  const setupCallHandlers = useCallback((call: MediaConnection) => {
    call.on('stream', (remote) => {
      console.log("[YOLO] WebRTC: Stream Established.");
      // Stop listening for matches once we are connected
      if (matchListenerRef.current) matchListenerRef.current();
      if (ticketRef.current) ticketRef.current.delete().catch(() => {});
      
      setRemoteStream(remote);
      setRemotePeerId(call.peer);
      updateStatus('connected');
    });
    call.on('close', () => skip(false));
    call.on('error', () => skip(true));
    callRef.current = call;
  }, [skip, updateStatus]);

  const setupDataHandlers = useCallback((conn: DataConnection) => {
    conn.on('data', (data: any) => {
      if (data.type === 'chat') onMessageReceived?.(data.text);
      if (data.type === 'reaction') onReactionReceived?.(data.value);
    });
    conn.on('close', () => skip(false));
    conn.on('error', () => skip(false));
    connRef.current = conn;
  }, [skip, onMessageReceived, onReactionReceived]);

  const initiateP2P = useCallback((remoteId: string, stream: MediaStream) => {
    console.log(`[YOLO] P2P: Initiating PeerJS Call to ${remoteId}`);
    updateStatus('connecting');
    setRemotePeerId(remoteId);
    
    // Slight delay to ensure PeerJS routing tables propagate if needed
    setTimeout(() => {
      if (!peerRef.current || peerRef.current.destroyed) return;
      try {
        const call = peerRef.current.call(remoteId, stream);
        const conn = peerRef.current.connect(remoteId, { reliable: true });
        if (call) setupCallHandlers(call);
        if (conn) setupDataHandlers(conn);
      } catch (err) {
        console.error("[YOLO] PeerJS Call Failed:", err);
        skip(true);
      }
    }, 500);
  }, [setupCallHandlers, setupDataHandlers, skip, updateStatus]);

  // --- Firestore Signaling Logic ---
  const connectSignaling = useCallback(async (myId: string, stream: MediaStream) => {
    if (isClosingRef.current) return;
    updateStatus('matching');

    const db = firebase.firestore();
    const collection = db.collection('matchmaking');

    // 1. Create a ticket
    const myTicket = {
      peerId: myId,
      region,
      status: 'waiting',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      gender: gender || 'any',
      interests: interests || []
    };

    try {
      const docRef = await collection.add(myTicket);
      ticketRef.current = docRef;

      // 2. Listen for older tickets (FIFO Queue)
      // We look for someone who has been waiting longer than us (createdAt < nowish)
      // Since Firestore ordering can be tricky with timestamps on client, we just look for 'waiting'
      const unsubscribe = collection
        .where('region', '==', region)
        .where('status', '==', 'waiting')
        .orderBy('createdAt', 'asc')
        .limit(10)
        .onSnapshot(async (snapshot) => {
           if (isClosingRef.current || lockRef.current) return;

           // Find a candidate that is NOT me
           const candidateDoc = snapshot.docs.find(d => d.data().peerId !== myId);
           
           if (candidateDoc) {
             const candidateData = candidateDoc.data();
             const candidateId = candidateData.peerId;

             // Tie-breaker: The one with the older ticket (lower createdAt) calls the newer one.
             // OR: We just aggressively try to lock. 
             // Simplest: If I see someone else, I initiate if my ID > their ID to avoid collision? 
             // Actually, the "waiting" status is key.
             
             // Attempt to lock
             lockRef.current = candidateId;
             
             // Optimistically initiate
             // In a real prod app, we would use a Transaction to atomically set 'status'='matched'
             // For this teaching app, we will just start the call. PeerJS handles the busy state.
             
             // We delete our ticket so no one else calls us
             if (ticketRef.current) {
                await ticketRef.current.delete();
                ticketRef.current = null;
             }
             
             // Initiate
             initiateP2P(candidateId, stream);
           }
        });
      
      matchListenerRef.current = unsubscribe;

    } catch (err) {
      console.error("[YOLO] Signaling Error:", err);
      updateStatus('error');
    }

  }, [region, gender, interests, initiateP2P, updateStatus]);

  // 🔥 Update the ref whenever connectSignaling changes
  useEffect(() => {
    connectSignalingRef.current = connectSignaling;
  }, [connectSignaling]);

  // --- Init Effect ---
  useEffect(() => {
    let mounted = true;
    const init = async () => {
      if (!session?.id) return;
      updateStatus('generating_id');
      
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { max: 30 } }, 
          audio: true 
        });
        
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }
        setLocalStream(stream);

        const uniqueId = `yolo_${session.id.substring(0,6)}_${Math.random().toString(36).substring(7)}`;
        const peer = new Peer(uniqueId, { debug: 1, config: ICE_CONFIG, secure: true });
        peerRef.current = peer;

        peer.on('open', (id) => {
          myIdRef.current = id;
          if (mounted) connectSignaling(id, stream);
        });

        // Handle incoming calls (Passive Mode)
        peer.on('call', async (incoming) => {
          // If we receive a call, we must stop looking for matches
          if (matchListenerRef.current) matchListenerRef.current();
          if (ticketRef.current) await ticketRef.current.delete();
          ticketRef.current = null;

          stopProposal(); // Clear any intervals if legacy exists
          updateStatus('connecting');
          setRemotePeerId(incoming.peer);
          
          incoming.answer(stream);
          setupCallHandlers(incoming);
        });

        peer.on('connection', (conn) => {
           setupDataHandlers(conn);
        });

        peer.on('error', (err) => {
          if (['peer-unavailable', 'network', 'webrtc'].includes(err.type)) {
            // peer unavailable likely means they disconnected before we called
            skip(true); 
          }
        });
      } catch (err) {
        if (mounted) updateStatus('error');
      }
    };

    init();

    return () => {
      mounted = false;
      isClosingRef.current = true;
      cleanup();
      if (peerRef.current) peerRef.current.destroy();
      if (localStream) localStream.getTracks().forEach(t => t.stop());
    };
  }, [session?.id, cleanup, connectSignaling, setupCallHandlers, setupDataHandlers, skip, updateStatus]);

  // Legacy helper to satisfy dependency array if needed, though unused now
  const stopProposal = () => {}; 

  // --- Return Object ---
  return {
    localStream, 
    remoteStream, 
    status,
    remotePeerId,    
    revealIdentity,  
    sendMessage: (text: string) => { if (connRef.current?.open) connRef.current.send({ type: 'chat', text }); },
    sendReaction: (value: ReactionType) => { if (connRef.current?.open) connRef.current.send({ type: 'reaction', value }); },
    skip: () => skip(false), 
    isMuted, 
    isVideoOff, 
    toggleMute: () => {
      if (localStream) {
        const track = localStream.getAudioTracks()[0];
        if (track) {
          track.enabled = isMuted;
          setIsMuted(!isMuted);
        }
      }
    },
    toggleVideo: () => {
      if (localStream) {
        const track = localStream.getVideoTracks()[0];
        if (track) {
          track.enabled = isVideoOff;
          setIsVideoOff(!isVideoOff);
        }
      }
    }
  };
};