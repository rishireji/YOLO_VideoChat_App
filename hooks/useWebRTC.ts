import { useState, useEffect, useRef, useCallback } from 'react';
import { Peer, DataConnection, MediaConnection } from 'peerjs';
import { Region, ReactionType } from '../types';
import { useSession } from '../context/SessionContext';

type WebRTCStatus =
  | 'idle'
  | 'generating_id'
  | 'matching'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error'
  | 'signaling_offline';

const SIGNALING_API_KEY = 'PJ5tqEc0E390uQ7Tdot6trHD9XJ5tRclV7gnAV3r';
const PIESOCKET_CLUSTER = 's15607.nyc1.piesocket.com';

const REGION_CHANNEL_MAP: Record<Region, string> = {
  global: 'yolo_v24_gl',
  'us-east': 'yolo_v24_na_e',
  'us-west': 'yolo_v24_na_w',
  europe: 'yolo_v24_eu',
  asia: 'yolo_v24_as',
  'south-america': 'yolo_v24_sa',
  africa: 'yolo_v24_af',
  oceania: 'yolo_v24_oc',
};

// Google STUN servers are the most reliable for free usage
const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
};

const BLACKLIST_TTL = 30_000; // 30 seconds

export const useWebRTC = (
  region: Region,
  mode: 'public' | 'private' = 'public',
  targetUid?: string,
  onMessageReceived?: (msg: string) => void,
  onReactionReceived?: (type: ReactionType) => void
) => {
  const { session } = useSession();

  // --- STATE ---
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<WebRTCStatus>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  // --- REFS ---
  const peerRef = useRef<Peer | null>(null);
  const callRef = useRef<MediaConnection | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const remotePeerIdRef = useRef<string | null>(null);
  
  // Logic Control Refs
  const lockRef = useRef<string | null>(null);
  const blacklistRef = useRef<Set<string>>(new Set());
  const isInitializingRef = useRef(false); // Prevents React Strict Mode double-init
  
  // Timers
  const proposalIntervalRef = useRef<any>(null);
  const handshakeTimeoutRef = useRef<any>(null);
  const connectionTimeoutRef = useRef<any>(null);

  /* -------------------- CLEANUP & HELPERS -------------------- */

  const broadcast = useCallback((payload: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const stopTimers = useCallback(() => {
    if (proposalIntervalRef.current) clearInterval(proposalIntervalRef.current);
    if (handshakeTimeoutRef.current) clearTimeout(handshakeTimeoutRef.current);
    if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
    
    proposalIntervalRef.current = null;
    handshakeTimeoutRef.current = null;
    connectionTimeoutRef.current = null;
  }, []);

  const cleanup = useCallback(() => {
    lockRef.current = null;
    stopTimers();

    if (callRef.current) {
      callRef.current.close();
      callRef.current = null;
    }
    if (connRef.current) {
      connRef.current.close();
      connRef.current = null;
    }
    
    setRemoteStream(null);
  }, [stopTimers]);

  const skip = useCallback((shouldBlacklist: boolean = false) => {
    console.log(`Skipping... (Blacklist: ${shouldBlacklist})`);
    
    if (shouldBlacklist && lockRef.current) {
      const target = lockRef.current;
      blacklistRef.current.add(target);
      setTimeout(() => blacklistRef.current.delete(target), BLACKLIST_TTL);
    }

    cleanup();
    setStatus('matching');

    // Re-broadcast presence immediately to find next peer
    if (peerRef.current?.id) {
      broadcast({
        type: 'presence',
        peerId: peerRef.current.id,
        status: 'matching',
      });
    }
  }, [cleanup, broadcast]);

  /* -------------------- WEBRTC HANDLERS -------------------- */

  const setupCallHandlers = useCallback((call: MediaConnection) => {
    call.on('stream', (remote) => {
      console.log('Video Stream Received');
      stopTimers(); // Connection successful, stop fail-safes
      remotePeerIdRef.current = call.peer;
      setRemoteStream(remote);
      setStatus('connected');
    });

    call.on('close', () => skip(false));
    call.on('error', (err) => {
      console.error('Call Error:', err);
      skip(true);
    });

    callRef.current = call;
  }, [skip, stopTimers]);

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
    console.log(`Initiating Call to: ${remoteId}`);
    setStatus('connecting');

    // Fail-safe: If not connected in 10s, retry
    if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
    connectionTimeoutRef.current = setTimeout(() => {
      if (status !== 'connected') {
        console.warn('Connection Timeout');
        skip(true);
      }
    }, 10000);

    // Small delay to ensure signaling is stable
    setTimeout(() => {
      if (!peerRef.current || peerRef.current.destroyed) return;

      try {
        // 1. Data Channel
        const conn = peerRef.current.connect(remoteId, { reliable: true });
        if (conn) setupDataHandlers(conn);

        // 2. Video Call
        const call = peerRef.current.call(remoteId, stream);
        if (call) setupCallHandlers(call);
      } catch (e) {
        console.error('P2P Error:', e);
        skip(true);
      }
    }, 500);
  }, [setupCallHandlers, setupDataHandlers, skip, status]);

  /* -------------------- SIGNALING (PIESOCKET) -------------------- */

  const connectSignaling = useCallback((myId: string, stream: MediaStream) => {
    const channel = REGION_CHANNEL_MAP[region];
    const wsUrl = `wss://${PIESOCKET_CLUSTER}/v3/${channel}?api_key=${SIGNALING_API_KEY}&presence=true`;
    
    console.log(`Connecting to Signaling: ${channel}`);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('matching');
      broadcast({ type: 'presence', peerId: myId });
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.peerId === myId) return; // Ignore self

      // 1. MATCH FOUND (Presence)
      if (msg.type === 'presence') {
        if (!lockRef.current && !blacklistRef.current.has(msg.peerId)) {
          console.log(`Found Peer: ${msg.peerId}`);
          lockRef.current = msg.peerId;

          const propose = () =>
            broadcast({
              type: 'match-propose',
              targetId: msg.peerId,
              fromId: myId,
            });

          stopTimers();
          propose();
          proposalIntervalRef.current = setInterval(propose, 1000);

          // Give handshake 5s to complete
          handshakeTimeoutRef.current = setTimeout(() => {
            if (lockRef.current === msg.peerId) {
              console.log('Handshake Timeout');
              skip(true);
            }
          }, 5000);
        }
      }

      // 2. PROPOSAL RECEIVED
      if (msg.type === 'match-propose' && msg.targetId === myId) {
        // Accept if we are free OR if we are locked to THEM (Simultaneous lock fix)
        if (!lockRef.current || lockRef.current === msg.fromId) {
          lockRef.current = msg.fromId;
          stopTimers();
          setStatus('connecting');

          broadcast({
            type: 'match-accept',
            targetId: msg.fromId,
            fromId: myId,
          });

          // Watchdog for stuck connections
          connectionTimeoutRef.current = setTimeout(() => {
             console.log('Stuck in connecting state...');
             skip(true);
          }, 8000);
        }
      }

      // 3. ACCEPTANCE RECEIVED
  // Inside connectSignaling -> ws.onmessage -> match-accept

if (msg.type === 'match-accept' && msg.targetId === myId) {
  if (lockRef.current === msg.fromId) {
    stopTimers();
    
    // TIE-BREAKER LOGIC
    if (myId > msg.fromId) {
      // Case 1: I am the Caller (Higher ID) -> I start the call
      console.log('I am the caller (Higher ID)');
      initiateP2P(msg.fromId, stream);
    } else {
      // Case 2: I am the Callee (Lower ID) -> I wait for their call
      console.log('Waiting for incoming call (I have lower ID)...');
      
      // --- THE FIX: ADD THIS TIMEOUT ---
      // If the other person crashed and didn't call, don't wait forever.
      connectionTimeoutRef.current = setTimeout(() => {
        console.warn('Caller failed to start call (Timeout). Skipping...');
        skip(true); // Dump them and find a new partner
      }, 10000); // 10 seconds max wait
      // -------------------------------
    }
  }
}
      // 4. PEER LEFT
      if (msg.event === 'system:member_left' && lockRef.current === msg.peerId) {
        skip(false);
      }
    };

    ws.onclose = () => {
      // Reconnect signaling if it drops
      if (!isInitializingRef.current && status !== 'error') {
        console.log('Signaling offline, reconnecting...');
        setTimeout(() => connectSignaling(myId, stream), 3000);
      }
    };
  }, [region, broadcast, initiateP2P, skip, stopTimers, status]);

  /* -------------------- INITIALIZATION -------------------- */

  useEffect(() => {
    // SINGLETON PATTERN: Prevent double-init in React Strict Mode
    if (isInitializingRef.current || !session?.id) return;
    
    isInitializingRef.current = true;
    setStatus('generating_id');
    console.log('Starting WebRTC Session...');

    let stream: MediaStream;

    const init = async () => {
      try {
        // 1. Get User Media
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        setLocalStream(stream);

        // 2. Create Peer (With Keep-Alive)
        const peerId = `yolo_${session.id}_${Math.random().toString(36).substr(2, 6)}`;
        const peer = new Peer(peerId, {
          config: ICE_CONFIG,
          secure: true,
          debug: 1, 
          pingInterval: 5000, // Keep-alive heartbeat
        });

        peerRef.current = peer;

        peer.on('open', (id) => {
          console.log('Peer Server Connected. ID:', id);
          connectSignaling(id, stream);
        });

        // 3. Handle Incoming Calls (Passive Side)
        peer.on('call', (incoming) => {
          if (lockRef.current === incoming.peer) {
            console.log('Answering Call...');
            incoming.answer(stream);
            setupCallHandlers(incoming);
          } else {
            console.warn('Rejected call from unknown peer');
            incoming.close();
          }
        });

        peer.on('connection', (conn) => {
          if (lockRef.current === conn.peer) {
            setupDataHandlers(conn);
          } else {
            conn.close();
          }
        });

        // 4. Handle Disconnects/Errors
        peer.on('disconnected', () => {
          console.warn('Peer Disconnected from Cloud. Reconnecting...');
          peer.reconnect();
        });

        peer.on('error', (err) => {
          console.error('PeerJS Error:', err);
          if (err.type === 'peer-unavailable' || err.type === 'network') {
             // Try to recover
             peer.reconnect();
          }
        });

      } catch (err) {
        console.error('Initialization Failed:', err);
        setStatus('error');
        isInitializingRef.current = false;
      }
    };

    init();

    // CLEANUP ON UNMOUNT
    return () => {
      isInitializingRef.current = false;
      stopTimers();
      cleanup();
      
      if (peerRef.current) {
        peerRef.current.destroy();
        peerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [session?.id, region]); // Re-run only if Region changes

  /* -------------------- API EXPORT -------------------- */

  return {
    localStream,
    remoteStream,
    remotePeerId: remotePeerIdRef.current,
    status,
    sendMessage: (text: string) => 
      connRef.current?.open && connRef.current.send({ type: 'chat', text }),
      
    sendReaction: (value: ReactionType) => 
      connRef.current?.open && connRef.current.send({ type: 'reaction', value }),
      
    revealIdentity: () => {
      if (connRef.current?.open && session) {
        connRef.current.send({ type: 'identity', uid: session.id });
      }
    },
    
    skip: () => skip(false),
    
    isMuted,
    isVideoOff,
    
    toggleMute: () => {
      if (localStream) {
        const t = localStream.getAudioTracks()[0];
        if (t) {
          t.enabled = isMuted;
          setIsMuted(!isMuted);
        }
      }
    },
    
    toggleVideo: () => {
      if (localStream) {
        const t = localStream.getVideoTracks()[0];
        if (t) {
          t.enabled = isVideoOff;
          setIsVideoOff(!isVideoOff);
        }
      }
    },
  };
};