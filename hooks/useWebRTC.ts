import { useState, useEffect, useRef, useCallback } from 'react';
import { Peer, DataConnection, MediaConnection } from 'peerjs';
import { Region, ReactionType } from '../types';
import { useSession } from '../context/SessionContext';

type WebRTCStatus = 'idle' | 'generating_id' | 'matching' | 'connecting' | 'connected' | 'disconnected' | 'error' | 'signaling_offline' | 'reconnecting';

/**
 * PIESOCKET CONFIGURATION
 * The key 'VCX6vjaGNoz9grHtfD2vshCwIr9p8f7p9M80jWq6' is the public demo key.
 * This key ONLY works on the 'demo.piesocket.com' cluster.
 */
const SIGNALING_API_KEY = 'VCX6vjaGNoz9grHtfD2vshCwIr9p8f7p9M80jWq6';
const PIESOCKET_CLUSTER = 'demo.piesocket.com';

const REGION_CHANNEL_MAP: Record<Region, string> = {
  'global': 'yolo_v15_gl',
  'us-east': 'yolo_v14_na_e',
  'us-west': 'yolo_v14_na_w',
  'europe': 'yolo_v14_eu',
  'asia': 'yolo_v14_as',
  'south-america': 'yolo_v14_sa',
  'africa': 'yolo_v14_af',
  'oceania': 'yolo_v14_oc'
};

/**
 * PRODUCTION ICE CONFIGURATION
 * STUN: Used for basic NAT traversal.
 * TURN: Mandatory for Vercel/Production. Without a paid TURN server, 
 * ~20-30% of calls (especially mobile) will fail to establish a video stream.
 */
const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    // Public TURN placeholder (Open Relay Project)
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
  
  // Refs for stable state access in event handlers
  const peerRef = useRef<Peer | null>(null);
  const callRef = useRef<MediaConnection | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const statusRef = useRef<WebRTCStatus>('idle');
  const presenceIntervalRef = useRef<number | null>(null);
  const isClosingRef = useRef(false);

  // Sync ref with state
  useEffect(() => { statusRef.current = status; }, [status]);

  /**
   * CLEANUP
   * Closes all active P2P connections and clears remote streams.
   */
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
   * SIGNALING BROADCAST
   * Announces our PeerID to the regional lobby.
   */
  const broadcastPresence = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN && peerRef.current?.id) {
      try {
        ws.send(JSON.stringify({
          type: 'presence',
          peerId: peerRef.current.id,
          region,
          status: statusRef.current,
          timestamp: Date.now()
        }));
      } catch (e) {
        console.debug("[YOLO] Presence broadcast skipped.");
      }
    }
  }, [region]);

  /**
   * SKIP / NEXT ROOM
   * Resets the matching process.
   */
  const skip = useCallback(() => {
    cleanup();
    console.info("[YOLO] Finding next available peer...");
    if (statusRef.current !== 'error' && statusRef.current !== 'idle') {
      setStatus('matching');
    }
    broadcastPresence();
  }, [cleanup, broadcastPresence]);

  /**
   * CALL HANDLERS
   */
  const setupCallHandlers = useCallback((call: MediaConnection) => {
    call.on('stream', (remote) => {
      console.info("[YOLO] Media connection established.");
      setRemoteStream(remote);
      setStatus('connected');
    });
    call.on('close', skip);
    call.on('error', (err) => {
      console.warn("[YOLO] Call negotiation failed:", err.type);
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
   * CONNECT SIGNALING RELAY (WebSocket)
   */
  const connectRelay = useCallback((myPeerId: string, stream: MediaStream) => {
    if (isClosingRef.current) return;

    const channel = REGION_CHANNEL_MAP[region] || REGION_CHANNEL_MAP.global;
    // Standard PieSocket v3 URL construction for the demo cluster
    const endpoint = `wss://${PIESOCKET_CLUSTER}/v3/${channel}?api_key=${SIGNALING_API_KEY}`;
    
    console.log(`[YOLO] Connecting to ${region} Lobby via PieSocket...`);
    
    const ws = new WebSocket(endpoint);
    wsRef.current = ws;
    
    ws.onopen = () => {
      console.info("[YOLO] Signaling Relay: CONNECTED.");
      if (statusRef.current === 'reconnecting' || statusRef.current === 'signaling_offline') {
        setStatus('matching');
      }
      broadcastPresence();
      
      if (presenceIntervalRef.current) window.clearInterval(presenceIntervalRef.current);
      presenceIntervalRef.current = window.setInterval(broadcastPresence, 2000);
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        
        // Matchmaking Logic
        if (msg.type === 'presence' && msg.peerId !== myPeerId && msg.region === region) {
          const isPeerAvailable = msg.status === 'matching';
          const iAmMatching = statusRef.current === 'matching';
          
          /**
           * POLITE PEER HANDSHAKE
           * If both users are matching, the user with the smaller ID initiates.
           */
          if (iAmMatching && isPeerAvailable && myPeerId < msg.peerId) {
            console.info(`[YOLO] Slot found. Initiating P2P link with: ${msg.peerId}`);
            setStatus('connecting');
            
            // Short delay to allow network stabilization
            setTimeout(() => {
              if (statusRef.current === 'connecting' && peerRef.current) {
                const call = peerRef.current.call(msg.peerId, stream);
                const conn = peerRef.current.connect(msg.peerId, { reliable: true });
                if (call) setupCallHandlers(call);
                if (conn) setupDataHandlers(conn);
              }
            }, 300);
          }
        }
      } catch (err) {}
    };

    ws.onclose = () => {
      if (isClosingRef.current) return;
      console.warn("[YOLO] Signaling Relay: DISCONNECTED.");
      setStatus('signaling_offline');
      // Exponential backoff retry
      setTimeout(() => {
        if (!isClosingRef.current) connectRelay(myPeerId, stream);
      }, 10000);
    };

    ws.onerror = () => ws.close();
  }, [region, broadcastPresence, setupCallHandlers, setupDataHandlers]);

  /**
   * INITIALIZATION
   */
  useEffect(() => {
    let mounted = true;
    const init = async () => {
      if (!session?.id) return;
      
      setStatus('generating_id');
      console.info("[YOLO] PeerCore: Initializing Media Node...");
      
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

        // Initialize PeerJS
        const peer = new Peer(session.id, { 
          debug: 1, 
          config: ICE_CONFIG,
          secure: true
        });
        peerRef.current = peer;

        peer.on('open', (id) => {
          console.info("[YOLO] PeerCore ID Verified:", id);
          if (mounted) {
            setStatus('matching');
            connectRelay(id, stream);
          }
        });

        peer.on('call', (call) => {
          console.log("[YOLO] Incoming link request detected.");
          if (statusRef.current === 'matching' || statusRef.current === 'connecting') {
            setStatus('connecting');
            call.answer(stream);
            setupCallHandlers(call);
          } else {
            console.log("[YOLO] Rejecting incoming call (User Busy).");
            call.close();
          }
        });

        peer.on('connection', (conn) => {
          console.log("[YOLO] Data channel established.");
          setupDataHandlers(conn);
        });

        peer.on('error', (err) => {
          console.warn(`[YOLO] PeerCore Error: ${err.type}`);
          if (['peer-unavailable', 'disconnected', 'network'].includes(err.type)) {
            skip();
          }
        });

      } catch (err) {
        console.error("[YOLO] Hardware Access Error:", err);
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
  }, [session?.id, skip, connectRelay, setupCallHandlers, setupDataHandlers]);

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