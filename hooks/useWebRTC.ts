import { useState, useEffect, useRef, useCallback } from 'react';
import { Peer, DataConnection, MediaConnection } from 'peerjs';
import { Region, ReactionType } from '../types';
import { useSession } from '../context/SessionContext';

type WebRTCStatus = 'idle' | 'generating_id' | 'matching' | 'connecting' | 'connected' | 'disconnected' | 'error' | 'signaling_offline' | 'reconnecting';

/**
 * PIESOCKET V3 CONFIGURATION
 * Optimized for the public demo cluster.
 */
const SIGNALING_API_KEY = 'VCX6vjaGNoz9grHtfD2vshCwIr9p8f7p9M80jWq6';
const PIESOCKET_CLUSTER = 'demo.piesocket.com';

const REGION_CHANNEL_MAP: Record<Region, string> = {
  'global': 'yolo_v17_gl',
  'us-east': 'yolo_v17_na_e',
  'us-west': 'yolo_v17_na_w',
  'europe': 'yolo_v17_eu',
  'asia': 'yolo_v17_as',
  'south-america': 'yolo_v17_sa',
  'africa': 'yolo_v17_af',
  'oceania': 'yolo_v17_oc'
};

/**
 * PRODUCTION ICE CONFIGURATION
 */
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
  const presenceIntervalRef = useRef<number | null>(null);
  const isClosingRef = useRef(false);

  // Synchronize ref for event handlers to avoid stale closures
  useEffect(() => { statusRef.current = status; }, [status]);

  const cleanup = useCallback(() => {
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

  /**
   * BROADCAST PRESENCE (The "I'm Here" Shout)
   */
  const broadcastPresence = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN && peerRef.current?.id) {
      try {
        ws.send(JSON.stringify({
          type: 'ready_to_call',
          peerId: peerRef.current.id,
          region,
          status: statusRef.current,
          timestamp: Date.now()
        }));
      } catch (e) {
        console.debug("[YOLO] Signaling broadcast deferred.");
      }
    }
  }, [region]);

  const skip = useCallback(() => {
    cleanup();
    console.info("[YOLO] SKIP: Searching for new match...");
    if (statusRef.current !== 'error' && statusRef.current !== 'idle') {
      setStatus('matching');
    }
    // Instant broadcast to alert potential peers that a slot just opened up
    setTimeout(broadcastPresence, 100);
  }, [cleanup, broadcastPresence]);

  const setupCallHandlers = useCallback((call: MediaConnection) => {
    call.on('stream', (remote) => {
      console.info("[YOLO] Media Handshake Successful.");
      setRemoteStream(remote);
      setStatus('connected');
    });
    call.on('close', skip);
    call.on('error', (err) => {
      console.warn("[YOLO] Media Error:", err.type);
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

  /**
   * INITIATE HANDSHAKE
   * Triggered when a compatible peer is discovered via signaling.
   */
  const initiateHandshake = useCallback((remoteId: string, stream: MediaStream) => {
    // Safety check: Don't call if we're already busy or connecting
    if (statusRef.current !== 'matching') return;

    console.info(`[YOLO] Initiating Offer to Peer: ${remoteId}`);
    setStatus('connecting');

    const call = peerRef.current?.call(remoteId, stream);
    const conn = peerRef.current?.connect(remoteId, { reliable: true });

    if (call) setupCallHandlers(call);
    if (conn) setupDataHandlers(conn);

    // Watchdog: If we stay in "connecting" too long, the ICE likely failed or peer vanished
    setTimeout(() => {
      if (statusRef.current === 'connecting') {
        console.warn("[YOLO] Watchdog: Connection timeout. Skipping...");
        skip();
      }
    }, 12000);
  }, [setupCallHandlers, setupDataHandlers, skip]);

  const connectSignaling = useCallback((myId: string, stream: MediaStream) => {
    if (isClosingRef.current) return;

    const channel = REGION_CHANNEL_MAP[region] || REGION_CHANNEL_MAP.global;
    const endpoint = `wss://${PIESOCKET_CLUSTER}/v3/${channel}?api_key=${SIGNALING_API_KEY}`;
    
    console.log(`[YOLO] Connecting Signaling Room: ${channel}`);
    
    const ws = new WebSocket(endpoint);
    wsRef.current = ws;
    
    ws.onopen = () => {
      console.info("[YOLO] Signaling Relay: ONLINE.");
      if (statusRef.current === 'reconnecting' || statusRef.current === 'signaling_offline') {
        setStatus('matching');
      }
      
      // CRITICAL: Immediate announcement upon joining the room
      broadcastPresence();
      
      // Fallback heartbeat for persistent discovery
      if (presenceIntervalRef.current) window.clearInterval(presenceIntervalRef.current);
      presenceIntervalRef.current = window.setInterval(broadcastPresence, 3000);
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        
        // Listen for "ready_to_call" messages from others
        if (msg.type === 'ready_to_call' && msg.peerId !== myId && msg.region === region) {
          const peerIsReady = msg.status === 'matching';
          const iAmReady = statusRef.current === 'matching';
          
          /**
           * ARBITRATION LOGIC (The "Polite Peer")
           * To avoid race conditions where both peers call each other simultaneously,
           * we only initiate the offer if our ID is lexicographically smaller.
           */
          if (iAmReady && peerIsReady && myId < msg.peerId) {
            initiateHandshake(msg.peerId, stream);
          }
        }
      } catch (err) {
        console.error("[YOLO] Signaling Message Error", err);
      }
    };

    ws.onclose = () => {
      if (isClosingRef.current) return;
      console.warn("[YOLO] Signaling Relay: OFFLINE. Re-establishing link...");
      setStatus('signaling_offline');
      setTimeout(() => {
        if (!isClosingRef.current) connectSignaling(myId, stream);
      }, 5000);
    };

    ws.onerror = () => ws.close();
  }, [region, broadcastPresence, initiateHandshake]);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      if (!session?.id) return;
      
      setStatus('generating_id');
      console.info("[YOLO] Booting Media Node...");
      
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, 
          audio: true 
        });
        
        if (!mounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        setLocalStream(stream);

        const peer = new Peer(session.id, { 
          debug: 1, 
          config: ICE_CONFIG,
          secure: true
        });
        peerRef.current = peer;

        peer.on('open', (id) => {
          console.info("[YOLO] PeerCore READY:", id);
          if (mounted) {
            setStatus('matching');
            connectSignaling(id, stream);
          }
        });

        peer.on('call', (call) => {
          console.log("[YOLO] Received Incoming Call Offer.");
          // Only answer if we are looking for a match
          if (statusRef.current === 'matching' || statusRef.current === 'connecting') {
            setStatus('connecting');
            call.answer(stream);
            setupCallHandlers(call);
          } else {
            console.log("[YOLO] Node Busy. Incoming Offer Rejected.");
            call.close();
          }
        });

        peer.on('connection', (conn) => {
          console.log("[YOLO] Data Channel Opened.");
          setupDataHandlers(conn);
        });

        peer.on('error', (err) => {
          console.warn(`[YOLO] P2P Node Error: ${err.type}`);
          if (['peer-unavailable', 'disconnected', 'network'].includes(err.type)) {
            skip();
          }
        });

      } catch (err) {
        console.error("[YOLO] Device Access Denied:", err);
        if (mounted) setStatus('error');
      }
    };

    init();

    return () => {
      mounted = false;
      isClosingRef.current = true;
      cleanup();
      if (peerRef.current) peerRef.current.destroy();
      if (wsRef.current) wsRef.current.close();
      if (presenceIntervalRef.current) window.clearInterval(presenceIntervalRef.current);
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