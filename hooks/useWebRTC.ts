
import { useState, useEffect, useRef, useCallback } from 'react';
import { Peer, DataConnection, MediaConnection } from 'peerjs';
import { Region, ReactionType } from '../types';
import { useSession } from '../context/SessionContext';

type WebRTCStatus = 'idle' | 'generating_id' | 'matching' | 'connecting' | 'connected' | 'disconnected' | 'error' | 'signaling_offline' | 'reconnecting';

/**
 * PRODUCTION CONNECTIVITY CONFIG
 * Using PieSocket for discovery and PeerJS for the WebRTC stack.
 */
const SIGNALING_API_KEY = 'VCX6vjaGNoz9grHtfD2vshCwIr9p8f7p9M80jWq6';

// FIX 1: Deterministic Sharding
// Ensures users in the same region ALWAYS land in the same signaling room.
const REGION_CHANNEL_MAP: Record<Region, string> = {
  'global': 'yolo_v3_global_lobby',
  'us-east': 'yolo_v3_na_east',
  'us-west': 'yolo_v3_na_west',
  'europe': 'yolo_v3_eu_central',
  'asia': 'yolo_v3_asia_pac',
  'south-america': 'yolo_v3_latam',
  'africa': 'yolo_v3_africa',
  'oceania': 'yolo_v3_oceania'
};

// FIX 2: ICE Configuration (STUN + TURN)
// TURN is mandatory for Vercel/Production to bypass strict firewalls (Symmetric NAT).
const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ],
  iceCandidatePoolSize: 10
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
  const discoveryWsRef = useRef<WebSocket | null>(null);
  const connectionTimeoutRef = useRef<number | null>(null);
  const presenceIntervalRef = useRef<number | null>(null);
  const isClosingRef = useRef(false);
  
  // Refs for state access inside callbacks to avoid stale closures
  const statusRef = useRef<WebRTCStatus>('idle');
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
    if (connectionTimeoutRef.current) window.clearTimeout(connectionTimeoutRef.current);
    setRemoteStream(null);
  }, []);

  const broadcastPresence = useCallback(() => {
    const ws = discoveryWsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN && peerRef.current?.id) {
      ws.send(JSON.stringify({
        type: 'presence',
        peerId: peerRef.current.id,
        region,
        status: statusRef.current, // FIX: Tell others if we are ready to match
        timestamp: Date.now()
      }));
    }
  }, [region]);

  const skip = useCallback(() => {
    cleanup();
    setStatus('matching');
    broadcastPresence();
  }, [cleanup, broadcastPresence]);

  const setupCallHandlers = useCallback((call: MediaConnection) => {
    call.on('stream', (remote) => {
      if (connectionTimeoutRef.current) window.clearTimeout(connectionTimeoutRef.current);
      setRemoteStream(remote);
      setStatus('connected');
    });
    call.on('close', skip);
    call.on('error', skip);
    callRef.current = call;
    
    connectionTimeoutRef.current = window.setTimeout(() => {
      if (statusRef.current === 'connecting') skip();
    }, 15000);
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

  const connectSignaling = useCallback((peerId: string, stream: MediaStream) => {
    if (isClosingRef.current) return;

    // Use demo cluster for better stability on unverified domains
    const channel = REGION_CHANNEL_MAP[region] || REGION_CHANNEL_MAP.global;
    const endpoint = `wss://demo.piesocket.com/v3/${channel}?api_key=${SIGNALING_API_KEY}`;
    
    const ws = new WebSocket(endpoint);
    discoveryWsRef.current = ws;
    
    ws.onopen = () => {
      if (statusRef.current === 'reconnecting') setStatus('matching');
      broadcastPresence();
      if (presenceIntervalRef.current) window.clearInterval(presenceIntervalRef.current);
      presenceIntervalRef.current = window.setInterval(broadcastPresence, 3000);
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'presence' && msg.peerId !== peerId) {
          // FIX 3: Robust Handshake Arbitration
          // Only offer if we are matching AND the other peer is also matching
          // Comparison ensures only one side starts the call
          if (peerId < msg.peerId && statusRef.current === 'matching' && msg.status === 'matching') {
            setStatus('connecting');
            const call = peerRef.current?.call(msg.peerId, stream);
            const conn = peerRef.current?.connect(msg.peerId, { reliable: true });
            if (call) setupCallHandlers(call);
            if (conn) setupDataHandlers(conn);
          }
        }
      } catch (err) {}
    };

    ws.onclose = () => {
      if (isClosingRef.current) return;
      setStatus('reconnecting');
      setTimeout(() => {
        if (!isClosingRef.current) connectSignaling(peerId, stream);
      }, 3000);
    };
  }, [region, broadcastPresence, setupCallHandlers, setupDataHandlers]);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      setStatus('generating_id');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (!mounted) return;
        setLocalStream(stream);

        const peer = new Peer(session?.id || crypto.randomUUID(), { 
          debug: 1, 
          config: ICE_CONFIG,
          secure: true 
        });
        peerRef.current = peer;

        peer.on('open', (id) => {
          if (!mounted) return;
          setStatus('matching');
          connectSignaling(id, stream);
        });

        peer.on('call', (call) => {
          if (statusRef.current === 'matching' || statusRef.current === 'connecting') {
            setStatus('connecting');
            call.answer(stream);
            setupCallHandlers(call);
          } else {
            call.close();
          }
        });

        peer.on('connection', (conn) => {
          setupDataHandlers(conn);
        });

        peer.on('error', (err) => {
          if (err.type === 'peer-unavailable') skip();
          if (err.type === 'network') setStatus('reconnecting');
        });

      } catch (err) {
        if (mounted) setStatus('error');
      }
    };

    init();

    return () => {
      mounted = false;
      isClosingRef.current = true;
      cleanup();
      if (peerRef.current) peerRef.current.destroy();
      if (discoveryWsRef.current) discoveryWsRef.current.close();
      if (presenceIntervalRef.current) window.clearInterval(presenceIntervalRef.current);
      if (localStream) localStream.getTracks().forEach(t => t.stop());
    };
  }, [session?.id]);

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
        localStream.getAudioTracks()[0].enabled = isMuted;
        setIsMuted(!isMuted);
      }
    },
    toggleVideo: () => {
      if (localStream) {
        localStream.getVideoTracks()[0].enabled = isVideoOff;
        setIsVideoOff(!isVideoOff);
      }
    }
  };
};
