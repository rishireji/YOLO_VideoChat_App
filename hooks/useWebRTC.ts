import { useState, useEffect, useRef, useCallback } from 'react';
import { Peer, DataConnection, MediaConnection } from 'peerjs';
import { Region, ReactionType } from '../types';
import { useSession } from '../context/SessionContext';

type WebRTCStatus = 'idle' | 'generating_id' | 'matching' | 'connecting' | 'connected' | 'disconnected' | 'error' | 'signaling_offline' | 'reconnecting';

/**
 * PIESOCKET V3 CONFIGURATION
 * Using the standard demo cluster and key. 
 */
const SIGNALING_API_KEY = 'VCX6vjaGNoz9grHtfD2vshCwIr9p8f7p9M80jWq6';
const PIESOCKET_CLUSTER = 'demo.piesocket.com';

const REGION_CHANNEL_MAP: Record<Region, string> = {
  'global': 'yolo_v16_gl',
  'us-east': 'yolo_v16_na_e',
  'us-west': 'yolo_v16_na_w',
  'europe': 'yolo_v16_eu',
  'asia': 'yolo_v16_as',
  'south-america': 'yolo_v16_sa',
  'africa': 'yolo_v16_af',
  'oceania': 'yolo_v16_oc'
};

/**
 * PRODUCTION ICE CONFIGURATION (NAT Traversal)
 * Essential for Vercel deployments. 
 * Includes multiple STUN servers and a reliable TURN relay.
 */
const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
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
   * BROADCAST PRESENCE
   * Sends our ID and status to the regional signaling lobby.
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
        console.warn("[YOLO] Discovery broadcast failed.");
      }
    }
  }, [region]);

  const skip = useCallback(() => {
    cleanup();
    console.info("[YOLO] SKIP: Resetting matchmaking state...");
    if (statusRef.current !== 'error' && statusRef.current !== 'idle') {
      setStatus('matching');
    }
    // Proactive broadcast on skip
    setTimeout(broadcastPresence, 100);
  }, [cleanup, broadcastPresence]);

  const setupCallHandlers = useCallback((call: MediaConnection) => {
    call.on('stream', (remote) => {
      console.info("[YOLO] Handshake COMPLETE: Remote stream received.");
      setRemoteStream(remote);
      setStatus('connected');
    });
    call.on('close', skip);
    call.on('error', (err) => {
      console.error("[YOLO] Media Link Error:", err.type);
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
   * INITIATE CALL
   * Logical entry point for the "Polite Peer" to start the WebRTC handshake.
   */
  const initiateCall = useCallback((remotePeerId: string, stream: MediaStream) => {
    if (statusRef.current !== 'matching') return;
    
    console.info(`[YOLO] INITIATOR: Attempting link with ${remotePeerId}`);
    setStatus('connecting');

    const call = peerRef.current?.call(remotePeerId, stream);
    const conn = peerRef.current?.connect(remotePeerId, { reliable: true });

    if (call) setupCallHandlers(call);
    if (conn) setupDataHandlers(conn);

    // Watchdog: If connection doesn't happen in 15s, reset
    setTimeout(() => {
      if (statusRef.current === 'connecting') {
        console.warn("[YOLO] Watchdog: Handshake timeout. Retrying...");
        skip();
      }
    }, 15000);
  }, [setupCallHandlers, setupDataHandlers, skip]);

  const connectRelay = useCallback((myPeerId: string, stream: MediaStream) => {
    if (isClosingRef.current) return;

    const channel = REGION_CHANNEL_MAP[region] || REGION_CHANNEL_MAP.global;
    const endpoint = `wss://${PIESOCKET_CLUSTER}/v3/${channel}?api_key=${SIGNALING_API_KEY}`;
    
    console.log(`[YOLO] Connecting to ${region} Lobby...`);
    
    const ws = new WebSocket(endpoint);
    wsRef.current = ws;
    
    ws.onopen = () => {
      console.info("[YOLO] Signaling Relay: CONNECTED.");
      if (statusRef.current === 'reconnecting' || statusRef.current === 'signaling_offline') {
        setStatus('matching');
      }
      
      // Proactive: Tell everyone I'm here immediately
      broadcastPresence();
      
      if (presenceIntervalRef.current) window.clearInterval(presenceIntervalRef.current);
      presenceIntervalRef.current = window.setInterval(broadcastPresence, 2000);
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        
        // Matchmaking Logic
        if (msg.type === 'presence' && msg.peerId !== myPeerId && msg.region === region) {
          const isPeerMatching = msg.status === 'matching';
          const iAmMatching = statusRef.current === 'matching';
          
          /**
           * POLITE PEER LOGIC
           * If both users are in the 'matching' state, the one with the 
           * lexicographically smaller Peer ID initiates the call.
           */
          if (iAmMatching && isPeerMatching && myPeerId < msg.peerId) {
            initiateCall(msg.peerId, stream);
          }
        }
      } catch (err) {
        console.error("[YOLO] Signaling parser error", err);
      }
    };

    ws.onclose = () => {
      if (isClosingRef.current) return;
      console.warn("[YOLO] Signaling Relay: DISCONNECTED. Failover in 5s...");
      setStatus('signaling_offline');
      setTimeout(() => {
        if (!isClosingRef.current) connectRelay(myPeerId, stream);
      }, 5000);
    };

    ws.onerror = () => {
      console.error("[YOLO] Signaling Socket Error.");
      ws.close();
    };
  }, [region, broadcastPresence, initiateCall]);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      if (!session?.id) return;
      
      setStatus('generating_id');
      console.info("[YOLO] Initializing PeerCore...");
      
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
          console.info("[YOLO] PeerCore Node ACTIVE:", id);
          if (mounted) {
            setStatus('matching');
            connectRelay(id, stream);
          }
        });

        peer.on('call', (call) => {
          console.log("[YOLO] ANSWERER: Receiving incoming link request...");
          if (statusRef.current === 'matching' || statusRef.current === 'connecting') {
            setStatus('connecting');
            call.answer(stream);
            setupCallHandlers(call);
          } else {
            console.warn("[YOLO] System Busy: Incoming link rejected.");
            call.close();
          }
        });

        peer.on('connection', (conn) => {
          console.info("[YOLO] Data link established.");
          setupDataHandlers(conn);
        });

        peer.on('error', (err) => {
          console.warn(`[YOLO] PeerCore Event Error: ${err.type}`);
          if (['peer-unavailable', 'disconnected', 'network'].includes(err.type)) {
            skip();
          }
        });

      } catch (err) {
        console.error("[YOLO] Critical Device Error:", err);
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
  }, [session?.id, skip, connectRelay, setupCallHandlers, setupDataHandlers, cleanup]);

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