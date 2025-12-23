import { useState, useEffect, useRef, useCallback } from 'react';
import { Peer, DataConnection, MediaConnection } from 'peerjs';
import { Region, ReactionType } from '../types';
import { useSession } from '../context/SessionContext';

type WebRTCStatus = 'idle' | 'generating_id' | 'matching' | 'connecting' | 'connected' | 'disconnected' | 'error' | 'signaling_offline';

/**
 * PRIVATE PIESOCKET CLUSTER CONFIG
 * Using dedicated resources for ultra-low latency signaling.
 */
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
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
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
  const [status, setStatus] = useState<WebRTCStatus>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  
  const peerRef = useRef<Peer | null>(null);
  const callRef = useRef<MediaConnection | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  
  const statusRef = useRef<WebRTCStatus>('idle');
  const lockRef = useRef<string | null>(null); 
  const isClosingRef = useRef(false);

  useEffect(() => { statusRef.current = status; }, [status]);

  const cleanup = useCallback(() => {
    lockRef.current = null;
    if (callRef.current) {
      callRef.current.close();
      callRef.current = null;
    }
    if (connRef.current) {
      connRef.current.close();
      connRef.current = null;
    }
    setRemoteStream(null);
  }, []);

  const broadcast = useCallback((payload: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  const skip = useCallback(() => {
    console.info("[YOLO] SKIP: Resetting connection state...");
    cleanup();
    setStatus('matching');
    // Announce availability on the new cluster channel
    broadcast({
      type: 'presence',
      peerId: peerRef.current?.id,
      status: 'matching'
    });
  }, [cleanup, broadcast]);

  const setupCallHandlers = useCallback((call: MediaConnection) => {
    call.on('stream', (remote) => {
      console.log("[YOLO] WebRTC: Media stream verified.");
      setRemoteStream(remote);
      setStatus('connected');
    });
    call.on('close', skip);
    call.on('error', (err) => {
      console.error("[YOLO] Stream Error:", err);
      skip();
    });
    callRef.current = call;
  }, [skip]);

  const setupDataHandlers = useCallback((conn: DataConnection) => {
    conn.on('data', (data: any) => {
      if (data.type === 'chat') onMessageReceived?.(data.text);
      if (data.type === 'reaction') onReactionReceived?.(data.value);
    });
    conn.on('close', skip);
    conn.on('error', skip);
    connRef.current = conn;
  }, [skip, onMessageReceived, onReactionReceived]);

  const initiateP2P = useCallback((remoteId: string, stream: MediaStream) => {
    if (statusRef.current !== 'matching') return;
    
    console.log(`[YOLO] Handshake: Calling target peer ${remoteId}`);
    setStatus('connecting');
    lockRef.current = remoteId;

    const call = peerRef.current?.call(remoteId, stream);
    const conn = peerRef.current?.connect(remoteId, { reliable: true });

    if (call) setupCallHandlers(call);
    if (conn) setupDataHandlers(conn);

    setTimeout(() => {
      if (statusRef.current === 'connecting' && lockRef.current === remoteId) {
        console.warn("[YOLO] P2P Timeout: Peer unreachable.");
        skip();
      }
    }, 12000);
  }, [setupCallHandlers, setupDataHandlers, skip]);

  const connectSignaling = useCallback((myId: string, stream: MediaStream) => {
    if (isClosingRef.current) return;

    const channel = REGION_CHANNEL_MAP[region] || REGION_CHANNEL_MAP.global;
    // Private Cluster Endpoint with Presence enabled
    const endpoint = `wss://${PIESOCKET_CLUSTER}/v3/${channel}?api_key=${SIGNALING_API_KEY}&notify_self=1&presence=true`;
    
    console.log("[YOLO] Signaling: Connecting to Private Cluster...");
    const ws = new WebSocket(endpoint);
    wsRef.current = ws;
    
    ws.onopen = () => {
      console.log("Connected to Private Cluster: s15607.nyc1");
      if (statusRef.current === 'signaling_offline') setStatus('matching');
      
      // Notify the channel of our Peer ID
      broadcast({ type: 'presence', peerId: myId, status: 'matching' });
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        
        // Handle native PieSocket Presence Events
        if (msg.type === 'system:member_joined') {
          console.log("[YOLO] Signaling: New member joined cluster. Broadcasting identity...");
          // When someone new joins, we broadcast our presence so they know our PeerJS ID
          if (statusRef.current === 'matching') {
            broadcast({ type: 'presence', peerId: myId, status: 'matching' });
          }
        }

        if (msg.type === 'system:member_left') {
          if (lockRef.current === msg.uuid) {
             console.log("[YOLO] Signaling: Current partner left cluster.");
             skip();
          }
        }

        // Custom Handshake Discovery
        if (msg.peerId && msg.peerId !== myId) {
          if (msg.type === 'presence' && msg.status === 'matching' && statusRef.current === 'matching') {
            // Polite Peer Logic: The peer with the lexicographically smaller ID initiates
            if (myId < msg.peerId) {
              console.log(`[YOLO] Matcher: Proposing P2P to ${msg.peerId}`);
              broadcast({ type: 'match-propose', targetId: msg.peerId, fromId: myId });
            }
          }

          if (msg.type === 'match-propose' && msg.targetId === myId && statusRef.current === 'matching') {
            console.log(`[YOLO] Matcher: Proposal received from ${msg.fromId}.`);
            setStatus('connecting');
            lockRef.current = msg.fromId;
            broadcast({ type: 'match-accept', targetId: msg.fromId, fromId: myId });
          }

          if (msg.type === 'match-accept' && msg.targetId === myId && statusRef.current === 'matching') {
            initiateP2P(msg.fromId, stream);
          }
        }
      } catch (err) {}
    };

    ws.onclose = () => {
      if (isClosingRef.current) return;
      console.warn("[YOLO] Signaling: Cluster connection lost.");
      setStatus('signaling_offline');
      setTimeout(() => connectSignaling(myId, stream), 3000);
    };

    ws.onerror = () => ws.close();
  }, [region, broadcast, initiateP2P, skip]);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      if (!session?.id) return;
      
      setStatus('generating_id');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { max: 30 } }, 
          audio: true 
        });
        
        if (!mounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        setLocalStream(stream);

        // Generate a unique, session-scoped Peer ID
        const uniqueId = `yolo_${session.id.substring(0,6)}_${Math.random().toString(36).substring(7)}`;

        const peer = new Peer(uniqueId, { 
          debug: 1, 
          config: ICE_CONFIG,
          secure: true
        });
        peerRef.current = peer;

        peer.on('open', (id) => {
          if (mounted) {
            console.log("[YOLO] PeerJS Core Ready:", id);
            setStatus('matching');
            connectSignaling(id, stream);
          }
        });

        peer.on('call', (incoming) => {
          if (statusRef.current === 'matching' || statusRef.current === 'connecting') {
            console.log("[YOLO] WebRTC: Accepting incoming call...");
            setStatus('connecting');
            incoming.answer(stream);
            setupCallHandlers(incoming);
          } else {
            incoming.close();
          }
        });

        peer.on('connection', (conn) => {
          console.log("[YOLO] WebRTC: Data channel active.");
          setupDataHandlers(conn);
        });

        peer.on('error', (err) => {
          console.error("[YOLO] PeerJS Error:", err.type);
          if (['peer-unavailable', 'disconnected', 'network', 'webrtc'].includes(err.type)) {
            skip();
          }
        });

      } catch (err) {
        if (mounted) {
          console.error("[YOLO] Media failed:", err);
          setStatus('error');
        }
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
  }, [session?.id, skip, connectSignaling, setupCallHandlers, setupDataHandlers, cleanup]);

  return {
    localStream, remoteStream, status, 
    sendMessage: (text: string) => {
      if (connRef.current?.open) connRef.current.send({ type: 'chat', text });
    },
    sendReaction: (value: ReactionType) => {
      if (connRef.current?.open) connRef.current.send({ type: 'reaction', value });
    },
    skip, isMuted, isVideoOff, 
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