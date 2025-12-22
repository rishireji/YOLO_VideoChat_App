import { useState, useEffect, useRef, useCallback } from 'react';
import { Peer, DataConnection, MediaConnection } from 'peerjs';
import { Region, ReactionType } from '../types';
import { useSession } from '../context/SessionContext';

type WebRTCStatus = 'idle' | 'generating_id' | 'matching' | 'connecting' | 'connected' | 'disconnected' | 'error' | 'signaling_offline' | 'reconnecting';

/**
 * PIESOCKET DEMO CONFIGURATION
 */
const SIGNALING_API_KEY = 'VCX6vjaGNoz9grHtfD2vshCwIr9p8f7p9M80jWq6';
const PIESOCKET_CLUSTER = 'demo.piesocket.com';

const REGION_CHANNEL_MAP: Record<Region, string> = {
  'global': 'yolo_v21_gl',
  'us-east': 'yolo_v21_na_e',
  'us-west': 'yolo_v21_na_w',
  'europe': 'yolo_v21_eu',
  'asia': 'yolo_v21_as',
  'south-america': 'yolo_v21_sa',
  'africa': 'yolo_v21_af',
  'oceania': 'yolo_v21_oc'
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

  /**
   * SIGNALING PUBLISHER
   * Forces an announcement to the channel.
   */
  const publishAnnouncement = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN && peerRef.current?.id) {
      const payload = JSON.stringify({
        type: 'client-announce',
        id: peerRef.current.id,
        status: statusRef.current,
        timestamp: Date.now()
      });
      ws.send(payload);
    }
  }, []);

  const skip = useCallback(() => {
    cleanup();
    console.info("[YOLO] SKIP: Hunting for new peer...");
    if (statusRef.current !== 'error' && statusRef.current !== 'idle') {
      setStatus('matching');
    }
    // Immediate broadcast on skip to alert others we are free
    setTimeout(publishAnnouncement, 50);
  }, [cleanup, publishAnnouncement]);

  const setupCallHandlers = useCallback((call: MediaConnection) => {
    call.on('stream', (remote) => {
      console.info("[YOLO] WebRTC: Stream Handshake Complete.");
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

  /**
   * INITIATE CALL
   * Triggered by receiving a client-announce from another peer.
   */
  const initiateOffer = useCallback((remoteId: string, stream: MediaStream) => {
    if (statusRef.current !== 'matching') return;
    
    console.info(`[YOLO] Role: Caller. Target: ${remoteId}`);
    setStatus('connecting');

    const call = peerRef.current?.call(remoteId, stream);
    const conn = peerRef.current?.connect(remoteId, { reliable: true });

    if (call) setupCallHandlers(call);
    if (conn) setupDataHandlers(conn);

    // Watchdog to prevent hanging in "connecting" state
    setTimeout(() => {
      if (statusRef.current === 'connecting') {
        console.warn("[YOLO] Connection timed out. Skipping...");
        skip();
      }
    }, 15000);
  }, [setupCallHandlers, setupDataHandlers, skip]);

  const connectSignaling = useCallback((myId: string, stream: MediaStream) => {
    if (isClosingRef.current) return;

    const channel = REGION_CHANNEL_MAP[region] || REGION_CHANNEL_MAP.global;
    const endpoint = `wss://${PIESOCKET_CLUSTER}/v3/${channel}?api_key=${SIGNALING_API_KEY}`;
    
    const ws = new WebSocket(endpoint);
    wsRef.current = ws;
    
    ws.onopen = () => {
      console.info("[YOLO] Signaling Channel Connected.");
      if (statusRef.current === 'signaling_offline') setStatus('matching');
      
      // FORCE ANNOUNCEMENT: Trigger immediate discovery for everyone else in room
      publishAnnouncement();
      
      // Periodic announcement to catch anyone who missed the initial join
      if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
      heartbeatRef.current = window.setInterval(publishAnnouncement, 8000);
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        
        // LISTEN FOR ANNOUNCEMENT: Trigger WebRTC offer creation
        if (msg.type === 'client-announce' && msg.id !== myId) {
          const peerIsAvailable = msg.status === 'matching';
          const iAmAvailable = statusRef.current === 'matching';
          
          if (iAmAvailable && peerIsAvailable) {
            /**
             * POLITE PEER ARBITRATION
             * Ensures only one peer initiates the call (smaller ID wins).
             */
            if (myId < msg.id) {
              initiateOffer(msg.id, stream);
            } else {
              // We are the "answering" peer, we wait for their incoming call event
              console.log("[YOLO] Role: Listener. Awaiting incoming offer...");
            }
          }
        }
      } catch (err) {}
    };

    ws.onclose = () => {
      if (isClosingRef.current) return;
      console.warn("[YOLO] Signaling Disconnected. Retrying...");
      setStatus('signaling_offline');
      setTimeout(() => connectSignaling(myId, stream), 5000);
    };

    ws.onerror = () => ws.close();
  }, [region, publishAnnouncement, initiateOffer]);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      if (!session?.id) return;
      
      setStatus('generating_id');
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
          if (mounted) {
            console.info("[YOLO] Peer Node Ready:", id);
            setStatus('matching');
            connectSignaling(id, stream);
          }
        });

        peer.on('call', (call) => {
          console.log("[YOLO] Incoming Call Detected.");
          if (statusRef.current === 'matching' || statusRef.current === 'connecting') {
            setStatus('connecting');
            call.answer(stream);
            setupCallHandlers(call);
          } else {
            call.close();
          }
        });

        peer.on('connection', (conn) => {
          console.info("[YOLO] Data Channel Secured.");
          setupDataHandlers(conn);
        });

        peer.on('error', (err) => {
          console.warn("[YOLO] Peer Error:", err.type);
          if (['peer-unavailable', 'disconnected', 'network'].includes(err.type)) {
            skip();
          }
        });

      } catch (err) {
        if (mounted) {
          console.error("[YOLO] Media Error:", err);
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