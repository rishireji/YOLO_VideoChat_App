import { useState, useEffect, useRef, useCallback } from 'react';
import { Peer, DataConnection, MediaConnection } from 'peerjs';
import { Region, ReactionType } from '../types';
import { useSession } from '../context/SessionContext';

type WebRTCStatus = 'idle' | 'generating_id' | 'matching' | 'connecting' | 'connected' | 'disconnected' | 'error' | 'signaling_offline' | 'reconnecting';

const SIGNALING_API_KEY = 'VCX6vjaGNoz9grHtfD2vshCwIr9p8f7p9M80jWq6';
const PIESOCKET_CLUSTER = 'demo.piesocket.com';

const REGION_CHANNEL_MAP: Record<Region, string> = {
  'global': 'yolo_v22_prod_gl',
  'us-east': 'yolo_v22_prod_na_e',
  'us-west': 'yolo_v22_prod_na_w',
  'europe': 'yolo_v22_prod_eu',
  'asia': 'yolo_v22_prod_as',
  'south-america': 'yolo_v22_prod_sa',
  'africa': 'yolo_v22_prod_af',
  'oceania': 'yolo_v22_prod_oc'
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
  const heartbeatRef = useRef<number | null>(null);
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

  const announcePresence = useCallback(() => {
    const ws = wsRef.current;
    const myId = peerRef.current?.id;
    if (ws && ws.readyState === WebSocket.OPEN && myId) {
      const payload = JSON.stringify({
        type: 'client-announce',
        peerId: myId,
        status: statusRef.current,
        timestamp: Date.now()
      });
      ws.send(payload);
    }
  }, []);

  const skip = useCallback(() => {
    cleanup();
    console.log("[YOLO] SKIP: Resetting search...");
    if (statusRef.current !== 'error' && statusRef.current !== 'idle') {
      setStatus('matching');
      // Shout immediately on skip
      setTimeout(announcePresence, 200);
    }
  }, [cleanup, announcePresence]);

  const setupCallHandlers = useCallback((call: MediaConnection) => {
    call.on('stream', (remote) => {
      setRemoteStream(remote);
      setStatus('connected');
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
    if (statusRef.current !== 'matching') return;
    
    console.info(`[YOLO] Role: Initiator. Calling: ${remoteId}`);
    setStatus('connecting');

    const call = peerRef.current?.call(remoteId, stream);
    const conn = peerRef.current?.connect(remoteId, { reliable: true });

    if (call) setupCallHandlers(call);
    if (conn) setupDataHandlers(conn);

    setTimeout(() => {
      if (statusRef.current === 'connecting') {
        console.warn("[YOLO] Handshake timeout. Skipping...");
        skip();
      }
    }, 12000);
  }, [setupCallHandlers, setupDataHandlers, skip]);

  const connectSignaling = useCallback((myId: string, stream: MediaStream) => {
    if (isClosingRef.current) return;

    const channel = REGION_CHANNEL_MAP[region] || REGION_CHANNEL_MAP.global;
    const endpoint = `wss://${PIESOCKET_CLUSTER}/v3/${channel}?api_key=${SIGNALING_API_KEY}`;
    
    const ws = new WebSocket(endpoint);
    wsRef.current = ws;
    
    ws.onopen = () => {
      console.log("[YOLO] Signaling: WebSocket Connected.");
      if (statusRef.current === 'signaling_offline') setStatus('matching');
      
      // REQUIREMENT 1: 1s Delay before manual announcement
      setTimeout(announcePresence, 1000);
      
      // REQUIREMENT 4: Heartbeat for persistence
      if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
      heartbeatRef.current = window.setInterval(announcePresence, 8000);
    };

    // REQUIREMENT 2: Listener for 'client-announce'
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'client-announce' && msg.peerId !== myId) {
          
          const iAmAvailable = statusRef.current === 'matching';
          const peerIsAvailable = msg.status === 'matching';
          
          if (iAmAvailable && peerIsAvailable) {
            // REQUIREMENT 3: The Handshake check
            // POLITE PEER: Smaller ID calls, Larger ID waits
            if (myId < msg.peerId) {
              initiateCall(msg.peerId, stream);
            } else {
              // I am the receiver, but I announce back so the initiator definitely sees me
              announcePresence();
            }
          }
        }
      } catch (err) {}
    };

    ws.onclose = () => {
      if (isClosingRef.current) return;
      setStatus('signaling_offline');
      setTimeout(() => connectSignaling(myId, stream), 5000);
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
          video: { width: { ideal: 1280 }, height: { ideal: 720 } }, 
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
          if (mounted) {
            console.log("[YOLO] PeerJS: Identity assigned", id);
            setStatus('matching');
            // Connect to signaling ONLY after Peer is ready
            connectSignaling(id, stream);
          }
        });

        peer.on('call', (incomingCall) => {
          if (statusRef.current === 'matching' || statusRef.current === 'connecting') {
            console.log("[YOLO] Role: Receiver. Answering call...");
            setStatus('connecting');
            incomingCall.answer(stream);
            setupCallHandlers(incomingCall);
          } else {
            incomingCall.close();
          }
        });

        peer.on('connection', (conn) => {
          setupDataHandlers(conn);
        });

        peer.on('error', (err) => {
          if (['peer-unavailable', 'disconnected', 'network'].includes(err.type)) {
            skip();
          }
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
      if (wsRef.current) wsRef.current.close();
      if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
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