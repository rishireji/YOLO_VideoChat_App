import { useState, useEffect, useRef, useCallback } from 'react';
import { Peer, DataConnection, MediaConnection } from 'peerjs';
import { Region, ReactionType } from '../types';
import { useSession } from '../context/SessionContext';

type WebRTCStatus = 'idle' | 'generating_id' | 'matching' | 'connecting' | 'connected' | 'disconnected' | 'error' | 'signaling_offline' | 'reconnecting';

const SIGNALING_API_KEY = 'VCX6vjaGNoz9grHtfD2vshCwIr9p8f7p9M80jWq6';
const PIESOCKET_CLUSTER = 'demo.piesocket.com';

const REGION_CHANNEL_MAP: Record<Region, string> = {
  'global': 'yolo_v22_final_gl',
  'us-east': 'yolo_v22_final_na_e',
  'us-west': 'yolo_v22_final_na_w',
  'europe': 'yolo_v22_final_eu',
  'asia': 'yolo_v22_final_as',
  'south-america': 'yolo_v22_final_sa',
  'africa': 'yolo_v22_final_af',
  'oceania': 'yolo_v22_final_oc'
};

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
  const discoveryIntervalRef = useRef<number | null>(null);
  const connectionLockedRef = useRef<boolean>(false);
  const isClosingRef = useRef(false);

  useEffect(() => { statusRef.current = status; }, [status]);

  const cleanup = useCallback(() => {
    connectionLockedRef.current = false;
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

  const announcePresence = useCallback(() => {
    // If we are already connected or trying to connect, don't broadcast availability
    if (statusRef.current !== 'matching' && statusRef.current !== 'signaling_offline') return;
    
    const ws = wsRef.current;
    const myId = peerRef.current?.id;
    if (ws && ws.readyState === WebSocket.OPEN && myId) {
      const payload = JSON.stringify({
        type: 'client-announce',
        peerId: myId,
        status: 'matching',
        timestamp: Date.now()
      });
      ws.send(payload);
    }
  }, []);

  const skip = useCallback(() => {
    console.log("[YOLO] Recycling Peer Connection...");
    cleanup();
    setStatus('matching');
    // Rapid shout after skip to catch anyone waiting
    setTimeout(announcePresence, 100);
    setTimeout(announcePresence, 500);
  }, [cleanup, announcePresence]);

  const setupCallHandlers = useCallback((call: MediaConnection) => {
    call.on('stream', (remote) => {
      console.log("[YOLO] WebRTC: Stream Received.");
      setRemoteStream(remote);
      setStatus('connected');
      connectionLockedRef.current = true; // Lock out other discovery
    });
    call.on('close', skip);
    call.on('error', skip);
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

  const initiateCall = useCallback((remoteId: string, stream: MediaStream) => {
    if (statusRef.current !== 'matching' || connectionLockedRef.current) return;
    
    console.info(`[YOLO] Initiating P2P Handshake with: ${remoteId}`);
    setStatus('connecting');
    connectionLockedRef.current = true;

    const call = peerRef.current?.call(remoteId, stream);
    const conn = peerRef.current?.connect(remoteId, { reliable: true });

    if (call) setupCallHandlers(call);
    if (conn) setupDataHandlers(conn);

    // If handshake doesn't complete in 10s, unlock and skip
    setTimeout(() => {
      if (statusRef.current === 'connecting') {
        console.warn("[YOLO] Handshake timeout. Returning to lobby.");
        skip();
      }
    }, 10000);
  }, [setupCallHandlers, setupDataHandlers, skip]);

  const connectSignaling = useCallback((myId: string, stream: MediaStream) => {
    if (isClosingRef.current) return;

    const channel = REGION_CHANNEL_MAP[region] || REGION_CHANNEL_MAP.global;
    const endpoint = `wss://${PIESOCKET_CLUSTER}/v3/${channel}?api_key=${SIGNALING_API_KEY}`;
    
    console.log("[YOLO] Signaling: Linking to Lobby...");
    const ws = new WebSocket(endpoint);
    wsRef.current = ws;
    
    ws.onopen = () => {
      console.log("[YOLO] Signaling: Lobby Joined.");
      if (statusRef.current === 'signaling_offline') setStatus('matching');
      
      // Initial shouts
      setTimeout(announcePresence, 500);
      setTimeout(announcePresence, 1500);
      
      // High frequency discovery interval while matching
      if (discoveryIntervalRef.current) window.clearInterval(discoveryIntervalRef.current);
      discoveryIntervalRef.current = window.setInterval(announcePresence, 3000);
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'client-announce' && msg.peerId !== myId) {
          
          const iAmAvailable = statusRef.current === 'matching' && !connectionLockedRef.current;
          const peerIsAvailable = msg.status === 'matching';
          
          if (iAmAvailable && peerIsAvailable) {
            // "Polite Peer" Logic: Smaller ID initiates, Larger ID waits.
            // This prevents "Glaring" where both laptops call each other simultaneously.
            if (myId < msg.peerId) {
              initiateCall(msg.peerId, stream);
            } else {
              // I am the receiver. I shout back once to ensure the initiator sees me.
              announcePresence();
            }
          }
        }
      } catch (err) {}
    };

    ws.onclose = () => {
      if (isClosingRef.current) return;
      console.warn("[YOLO] Signaling: WebSocket closed. Retrying...");
      setStatus('signaling_offline');
      setTimeout(() => connectSignaling(myId, stream), 3000);
    };

    ws.onerror = () => ws.close();
  }, [region, announcePresence, initiateCall]);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      if (!session?.id) return;
      
      setStatus('generating_id');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: 30 }, 
          audio: true 
        });
        
        if (!mounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        setLocalStream(stream);

        // We append a random suffix to the session ID to ensure Laptop A and B 
        // NEVER have the same PeerJS ID, even if local storage is synced.
        const uniqueId = `${session.id}_${Math.random().toString(36).substring(7)}`;

        const peer = new Peer(uniqueId, { 
          debug: 1, 
          config: ICE_CONFIG,
          secure: true
        });
        peerRef.current = peer;

        peer.on('open', (id) => {
          if (mounted) {
            console.log("[YOLO] PeerJS: Node Ready ->", id);
            setStatus('matching');
            connectSignaling(id, stream);
          }
        });

        peer.on('call', (incomingCall) => {
          if (statusRef.current === 'matching' || statusRef.current === 'connecting') {
            console.log("[YOLO] PeerJS: Incoming Call Received. Answering...");
            connectionLockedRef.current = true;
            setStatus('connecting');
            incomingCall.answer(stream);
            setupCallHandlers(incomingCall);
          } else {
            console.log("[YOLO] PeerJS: Busy, rejecting incoming call.");
            incomingCall.close();
          }
        });

        peer.on('connection', (conn) => {
          console.log("[YOLO] PeerJS: Data Channel Linked.");
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
          console.error("[YOLO] Camera/Mic access failed.");
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
      if (discoveryIntervalRef.current) window.clearInterval(discoveryIntervalRef.current);
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