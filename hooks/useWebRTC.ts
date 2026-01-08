import { useState, useEffect, useRef, useCallback } from 'react';
import { Peer, DataConnection, MediaConnection } from 'peerjs';
import { Region, ReactionType } from '../types';
import { useSession } from '../context/SessionContext';

// --- Types ---
type WebRTCStatus = 'idle' | 'generating_id' | 'matching' | 'connecting' | 'connected' | 'disconnected' | 'error' | 'signaling_offline';

// --- Constants ---
const SIGNALING_API_KEY = 'PJ5tqEc0E390uQ7Tdot6trHD9XJ5tRclV7gnAV3r';
const PIESOCKET_CLUSTER = 's15607.nyc1.piesocket.com';

const REGION_CHANNEL_MAP: Record<Region, string> = {
  'global': 'yolo_v24_gl',
  'us-east': 'yolo_v24_na_e',
  'us-west': 'yolo_v24_na_w',
  'europe': 'yolo_v24_eu',
  'asia': 'yolo_v24_as',
  'south-america': 'yolo_v24_sa',
  'africa': 'yolo_v24_af',
  'oceania': 'yolo_v24_oc'
};

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
  const wsRef = useRef<WebSocket | null>(null);
  const pendingMessagesRef = useRef<string[]>([]);

  const proposalIntervalRef = useRef<any>(null);
  const handshakeTimeoutRef = useRef<any>(null);
  const blacklistRef = useRef<Set<string>>(new Set());
  const lockRef = useRef<string | null>(null); 
  const isClosingRef = useRef(false);
  const isInitiator = myId < msg.peerId;


  // --- Helpers ---
  const updateStatus = useCallback((newStatus: WebRTCStatus) => {
    setStatusState(newStatus);
  }, []);

const broadcast = useCallback((payload: object) => {
  const ws = wsRef.current;
  const msg = JSON.stringify(payload);

  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(msg);
  } else {
    pendingMessagesRef.current.push(msg);
  }
}, []);


  const stopProposal = useCallback(() => {
    if (proposalIntervalRef.current) {
      clearInterval(proposalIntervalRef.current);
      proposalIntervalRef.current = null;
    }
    if (handshakeTimeoutRef.current) {
      clearTimeout(handshakeTimeoutRef.current);
      handshakeTimeoutRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    console.log("[YOLO] Cleanup: Releasing locks and closing connections.");
    lockRef.current = null;
    setRemotePeerId(null);
    stopProposal();
    if (callRef.current) { callRef.current.close(); callRef.current = null; }
    if (connRef.current) { connRef.current.close(); connRef.current = null; }
    setRemoteStream(null);
  }, [stopProposal]);

const skip = useCallback((shouldBlacklist = false) => {
  if (shouldBlacklist && lockRef.current) {
    const target = lockRef.current;
    blacklistRef.current.add(target);
    setTimeout(() => blacklistRef.current.delete(target), 30000);
  }

  isClosingRef.current = false;
  lockRef.current = null;

  if (wsRef.current) {
    wsRef.current.close();
    wsRef.current = null;
  }

  pendingMessagesRef.current = [];

  cleanup();
  updateStatus('matching');
}, [cleanup, updateStatus]);


  const revealIdentity = useCallback(() => {
    if (connRef.current?.open) {
      console.log("[YOLO] Revealing Identity...");
      // FIX: Cast session to any to bypass TS error
      connRef.current.send({ type: 'reveal-identity', user: (session as any)?.user });
    }
  }, [session]);

  // --- Handlers ---
  const setupCallHandlers = useCallback((call: MediaConnection) => {
    call.on('stream', (remote) => {
      console.log("[YOLO] WebRTC: Stream Established.");
      stopProposal(); 
      setRemoteStream(remote);
      setRemotePeerId(call.peer);
      updateStatus('connected');
    });
    call.on('close', () => skip(false));
    call.on('error', () => skip(true));
    callRef.current = call;
  }, [skip, stopProposal, updateStatus]);

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

  // --- Signaling Logic ---
  const connectSignaling = useCallback((myId: string, stream: MediaStream) => {
    if (isClosingRef.current) return;

    const channel = REGION_CHANNEL_MAP[region] || REGION_CHANNEL_MAP.global;
    const endpoint = `wss://${PIESOCKET_CLUSTER}/v3/${channel}?api_key=${SIGNALING_API_KEY}&notify_self=1&presence=true`;
    
    const ws = new WebSocket(endpoint);
    wsRef.current = ws;
    
ws.onopen = () => {
  console.log("[YOLO] Signaling: Online.");

  // Flush queued messages
  pendingMessagesRef.current.forEach(msg => ws.send(msg));
  pendingMessagesRef.current = [];

  updateStatus('matching');
  broadcast({
    type: 'presence',
    peerId: myId,
    status: 'matching',
    gender,
    interests
  });
};


    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        
        // 1. Presence Received
if (msg.type === 'presence' && msg.peerId !== myId) {
  if (!lockRef.current && !blacklistRef.current.has(msg.peerId)) {

    // 🔒 Deterministic rule: smaller ID proposes
    if (myId < msg.peerId) {
      console.log(`[YOLO] Matcher: Proposing to ${msg.peerId}`);
      lockRef.current = msg.peerId;

      const attemptProposal = () => {
        broadcast({
          type: 'match-propose',
          targetId: msg.peerId,
          fromId: myId
        });
      };

      stopProposal();
      attemptProposal();
      proposalIntervalRef.current = setInterval(attemptProposal, 1500);

      handshakeTimeoutRef.current = setTimeout(() => {
        if (lockRef.current === msg.peerId) skip(true);
      }, 6000);
    }
  }
}


        // 2. Proposal Received
        if (msg.type === 'match-propose' && msg.targetId === myId) {
          if (!lockRef.current) {
            lockRef.current = msg.fromId;
            stopProposal();
            updateStatus('connecting');
            broadcast({ type: 'match-accept', targetId: msg.fromId, fromId: myId });
          } else if (lockRef.current === msg.fromId) {
             // already locked on this peer, ignore
          }
        }

        // 3. Acceptance Received
if (msg.type === 'match-accept' && msg.targetId === myId) {
  // Only initiator starts the call
  if (lockRef.current === msg.fromId && myId < msg.fromId) {
    stopProposal();
    initiateP2P(msg.fromId, stream);
  }
}


        if (msg.event === 'system:member_left') {
          if (lockRef.current) skip(false);
        }

      } catch (err) {
        console.error("[YOLO] Signaling Message Error:", err);
      }
    };

ws.onclose = () => {
  if (isClosingRef.current) return;

  isClosingRef.current = true;
  pendingMessagesRef.current = [];

  updateStatus('signaling_offline');

  setTimeout(() => {
    isClosingRef.current = false;
    connectSignaling(myId, stream);
  }, 3000);
};


    ws.onerror = () => ws.close();
  }, [region, gender, interests, broadcast, initiateP2P, skip, stopProposal, updateStatus]);

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
          if (mounted) connectSignaling(id, stream);
        });

peer.on('call', (incoming) => {
  const shouldAnswer =
    lockRef.current === incoming.peer && myId > incoming.peer;

  if (shouldAnswer) {
    stopProposal();
    updateStatus('connecting');
    setRemotePeerId(incoming.peer);
    incoming.answer(stream);
    setupCallHandlers(incoming);
  } else {
    incoming.close();
  }
});


        peer.on('connection', (conn) => {
          if (lockRef.current && conn.peer === lockRef.current) {
            setupDataHandlers(conn);
          }
        });

        peer.on('error', (err) => {
          if (['peer-unavailable', 'network', 'webrtc'].includes(err.type)) {
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
      if (wsRef.current) wsRef.current.close();
      if (localStream) localStream.getTracks().forEach(t => t.stop());
    };
  }, [session?.id, cleanup, connectSignaling, setupCallHandlers, setupDataHandlers, skip, stopProposal, updateStatus]);

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