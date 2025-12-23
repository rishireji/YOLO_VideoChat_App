import { useState, useEffect, useRef, useCallback } from 'react';
import { Peer, DataConnection, MediaConnection } from 'peerjs';
import { Region, ReactionType } from '../types';
import { useSession } from '../context/SessionContext';

type WebRTCStatus = 'idle' | 'generating_id' | 'matching' | 'connecting' | 'connected' | 'disconnected' | 'error' | 'signaling_offline';

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
  iceCandidatePoolSize: 10,
};

export const useWebRTC = (
  region: Region, 
  onReactionReceived?: (type: ReactionType) => void,
  onMessageReceived?: (text: string) => void
) => {
  const { session } = useSession();
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  
  // STATUS MANAGEMENT
  const [status, setStatusState] = useState<WebRTCStatus>('idle');
  const statusRef = useRef<WebRTCStatus>('idle');

  // Helper to update both State and Ref immediately (Fixes race condition)
  const updateStatus = useCallback((newStatus: WebRTCStatus) => {
    statusRef.current = newStatus;
    setStatusState(newStatus);
  }, []);

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  
  const peerRef = useRef<Peer | null>(null);
  const callRef = useRef<MediaConnection | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  
  const proposalIntervalRef = useRef<any>(null);
  const handshakeTimeoutRef = useRef<any>(null);
  const blacklistRef = useRef<Set<string>>(new Set());
  const lockRef = useRef<string | null>(null); 
  const isClosingRef = useRef(false);

  // 1. CLEANUP UTILS
  const stopProposal = useCallback(() => {
    if (proposalIntervalRef.current) {
      clearInterval(proposalIntervalRef.current);
      proposalIntervalRef.current = null;
    }
    // We do NOT clear handshakeTimeout here immediately, 
    // because initiateP2P might need its own timeout logic.
  }, []);

  const broadcast = useCallback((payload: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  // 2. SKIP / RESET LOGIC
  const skip = useCallback((shouldBlacklist: boolean = false) => {
    console.info(`[YOLO] SKIP: Resetting. Blacklist: ${shouldBlacklist}`);
    
    stopProposal();
    if (handshakeTimeoutRef.current) {
        clearTimeout(handshakeTimeoutRef.current);
        handshakeTimeoutRef.current = null;
    }

    if (shouldBlacklist && lockRef.current) {
      blacklistRef.current.add(lockRef.current);
      const target = lockRef.current;
      // Remove from blacklist after 30s
      setTimeout(() => blacklistRef.current.delete(target), 30000);
    }
    
    // Close existing connections
    if (callRef.current) { callRef.current.close(); callRef.current = null; }
    if (connRef.current) { connRef.current.close(); connRef.current = null; }
    
    setRemoteStream(null);
    lockRef.current = null;
    
    updateStatus('matching');
    broadcast({ type: 'presence', peerId: peerRef.current?.id, status: 'matching' });
  }, [updateStatus, broadcast, stopProposal]);

  // 3. HANDLERS
  const setupCallHandlers = useCallback((call: MediaConnection) => {
    call.on('stream', (remote) => {
      console.log("[YOLO] WebRTC: Media stream connected!");
      if (handshakeTimeoutRef.current) clearTimeout(handshakeTimeoutRef.current);
      setRemoteStream(remote);
      updateStatus('connected');
    });
    call.on('close', () => skip(false));
    call.on('error', (e) => {
        console.error("Call Error:", e);
        skip(true);
    });
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

  // 4. INITIATE P2P (Caller Side)
  const initiateP2P = useCallback((remoteId: string, stream: MediaStream) => {
    if (statusRef.current === 'connected') return;
    
    console.log(`[YOLO] Handshake: Initiating Call to ${remoteId}`);
    updateStatus('connecting');
    lockRef.current = remoteId;
    stopProposal(); // Stop sending proposals

    // Small delay to ensure signaling is settled
    setTimeout(() => {
        if (!peerRef.current || peerRef.current.destroyed) return;
        
        try {
            const call = peerRef.current.call(remoteId, stream);
            const conn = peerRef.current.connect(remoteId, { reliable: true });
    
            if (call) setupCallHandlers(call);
            if (conn) setupDataHandlers(conn);
        } catch (err) {
            console.error("P2P Init Error:", err);
            skip(true);
        }
    }, 100);

    // Fail-safe: If connection doesn't stabilize in 6s, abort
    if (handshakeTimeoutRef.current) clearTimeout(handshakeTimeoutRef.current);
    handshakeTimeoutRef.current = setTimeout(() => {
      if (statusRef.current === 'connecting') {
        console.warn("[YOLO] P2P Timeout: Connection stuck. Resetting.");
        skip(true);
      }
    }, 6000);
  }, [setupCallHandlers, setupDataHandlers, skip, stopProposal, updateStatus]);

  // 5. SIGNALING LOGIC
  const connectSignaling = useCallback((myId: string, stream: MediaStream) => {
    if (isClosingRef.current) return;

    const channel = REGION_CHANNEL_MAP[region] || REGION_CHANNEL_MAP.global;
    const endpoint = `wss://${PIESOCKET_CLUSTER}/v3/${channel}?api_key=${SIGNALING_API_KEY}&notify_self=1&presence=true`;
    
    const ws = new WebSocket(endpoint);
    wsRef.current = ws;
    
    ws.onopen = () => {
      console.log("Signaling Connected");
      if (['signaling_offline', 'generating_id', 'idle'].includes(statusRef.current)) {
        updateStatus('matching');
      }
      broadcast({ type: 'presence', peerId: myId, status: 'matching' });
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        
        // System Events
        if (msg.type === 'system:member_joined' && statusRef.current === 'matching') {
          // Re-announce our presence so the new member sees us
          broadcast({ type: 'presence', peerId: myId, status: 'matching' });
        }

        if (msg.type === 'system:member_left') {
          if (lockRef.current && (msg.uuid === lockRef.current || lockRef.current.includes(msg.uuid))) {
             skip(false);
          }
        }

        // Peer Logic
        if (msg.peerId && msg.peerId !== myId) {
          if (blacklistRef.current.has(msg.peerId)) return;

          // A. MATCHING: Deciding who calls who
          if (msg.type === 'presence' && msg.status === 'matching' && statusRef.current === 'matching') {
            // Strict tie-breaker: Only the ID strictly "greater" initiates
            const isInitiator = msg.peerId > myId; 
            
            if (isInitiator) {
              console.log(`[YOLO] Match found: ${msg.peerId}. I am Initiator.`);
              lockRef.current = msg.peerId;
              
              // Start Proposal Loop
              const attemptProposal = () => {
                if (statusRef.current !== 'matching' && statusRef.current !== 'connecting') {
                    stopProposal();
                    return;
                }
                console.log(`[YOLO] Sending Proposal -> ${msg.peerId}`);
                broadcast({ type: 'match-propose', targetId: msg.peerId, fromId: myId });
              };
              
              stopProposal(); // Clear any old loops
              attemptProposal(); // Send first immediately
              proposalIntervalRef.current = setInterval(attemptProposal, 1500);

              // 5s Timeout to abort if they don't answer
              if (handshakeTimeoutRef.current) clearTimeout(handshakeTimeoutRef.current);
              handshakeTimeoutRef.current = setTimeout(() => {
                if (statusRef.current === 'matching' && lockRef.current === msg.peerId) {
                  console.warn("[YOLO] Matcher Timeout: No answer. Skipping.");
                  skip(true);
                }
              }, 5000);
            }
          }

          // B. RECEIVING PROPOSAL
          if (msg.type === 'match-propose' && msg.targetId === myId) {
             // Only accept if we are actually looking for a match
             if (statusRef.current === 'matching') {
                console.log(`[YOLO] Proposal received from ${msg.fromId}. Accepting.`);
                updateStatus('connecting');
                lockRef.current = msg.fromId;
                broadcast({ type: 'match-accept', targetId: msg.fromId, fromId: myId });
             }
          }

          // C. PROPOSAL ACCEPTED
          if (msg.type === 'match-accept' && msg.targetId === myId) {
            // We must be in 'matching' or 'connecting' (if we set it earlier)
            if (statusRef.current === 'matching' || statusRef.current === 'connecting') {
                console.log(`[YOLO] Proposal Accepted by ${msg.fromId}. Starting P2P.`);
                initiateP2P(msg.fromId, stream);
            }
          }
        }
      } catch (err) {}
    };

    ws.onclose = () => {
      if (isClosingRef.current) return;
      updateStatus('signaling_offline');
      setTimeout(() => connectSignaling(myId, stream), 3000);
    };

    ws.onerror = () => ws.close();
  }, [region, broadcast, initiateP2P, skip, stopProposal, updateStatus]);

  // 6. INITIALIZATION
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
        const peer = new Peer(uniqueId, { debug: 1, config: ICE_CONFIG });
        peerRef.current = peer;

        peer.on('open', (id) => {
          if (mounted) connectSignaling(id, stream);
        });

        // ANSWERER SIDE LOGIC
        peer.on('call', (incoming) => {
            console.log("[YOLO] WebRTC: Receiving Incoming Call...");
            stopProposal(); 
            updateStatus('connecting');
            incoming.answer(stream);
            setupCallHandlers(incoming);
        });

        peer.on('connection', (conn) => {
          console.log("[YOLO] WebRTC: Data Connection Established.");
          setupDataHandlers(conn);
        });

        peer.on('error', (err) => {
          console.error("PeerJS Error:", err.type);
          if (['peer-unavailable', 'network', 'webrtc'].includes(err.type)) {
            skip(true);
          }
        });
      } catch (err) {
        console.error("Init Error:", err);
        if (mounted) updateStatus('error');
      }
    };

    init();

    return () => {
      mounted = false;
      isClosingRef.current = true;
      cleanup(); // Use your cleanup function
      if (peerRef.current) peerRef.current.destroy();
      if (wsRef.current) wsRef.current.close();
      if (localStream) localStream.getTracks().forEach(t => t.stop());
    };
  // eslint-disable-next-line
  }, [session?.id]); // Minimal dependencies for init

  // Expose controls
  return {
    localStream, 
    remoteStream, 
    status, 
    sendMessage: (text: string) => { if (connRef.current?.open) connRef.current.send({ type: 'chat', text }); },
    sendReaction: (value: ReactionType) => { if (connRef.current?.open) connRef.current.send({ type: 'reaction', value }); },
    skip: () => skip(false), 
    isMuted, 
    isVideoOff, 
    toggleMute: () => { /* ... toggle logic ... */ },
    toggleVideo: () => { /* ... toggle logic ... */ }
  };
};