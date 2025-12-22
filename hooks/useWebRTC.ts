import { useState, useEffect, useRef, useCallback } from 'react';
import { Peer, DataConnection, MediaConnection } from 'peerjs';
import { Region, ReactionType } from '../types';
import { useSession } from '../context/SessionContext';

type WebRTCStatus = 'idle' | 'generating_id' | 'matching' | 'connecting' | 'connected' | 'disconnected' | 'error' | 'signaling_offline' | 'reconnecting';

/**
 * PIESOCKET DEMO CREDENTIALS
 */
const SIGNALING_API_KEY = 'VCX6vjaGNoz9grHtfD2vshCwIr9p8f7p9M80jWq6';
const PIESOCKET_CLUSTER = 'demo.piesocket.com';

const REGION_CHANNEL_MAP: Record<Region, string> = {
  'global': 'yolo_live_gl',
  'us-east': 'yolo_live_na_e',
  'us-west': 'yolo_live_na_w',
  'europe': 'yolo_live_eu',
  'asia': 'yolo_live_as',
  'south-america': 'yolo_live_sa',
  'africa': 'yolo_live_af',
  'oceania': 'yolo_live_oc'
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
  const heartbeatIntervalRef = useRef<number | null>(null);
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
   * SIGNALING: BROADCAST IDENTITY
   * This is the 'Force Announcement' requested.
   */
  const announcePresence = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN && peerRef.current?.id) {
      const signal = JSON.stringify({
        event: 'client-announce',
        peerId: peerRef.current.id,
        status: statusRef.current,
        region: region,
        timestamp: Date.now()
      });
      ws.send(signal);
    }
  }, [region]);

  const skip = useCallback(() => {
    cleanup();
    console.info("[YOLO] Match Ended. Finding next available peer...");
    if (statusRef.current !== 'error' && statusRef.current !== 'idle') {
      setStatus('matching');
    }
    // Proactive announcement to find someone new immediately
    setTimeout(announcePresence, 100);
  }, [cleanup, announcePresence]);

  const setupCallHandlers = useCallback((call: MediaConnection) => {
    call.on('stream', (remote) => {
      console.log("[YOLO] WebRTC: Remote stream linked.");
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
   * HANDSHAKE INITIATION
   * Using the 'Polite Peer' pattern: the peer with the smaller ID initiates.
   */
  const initiateCall = useCallback((remoteId: string, stream: MediaStream) => {
    if (statusRef.current !== 'matching') return;
    
    console.info(`[YOLO] Initiating call to: ${remoteId}`);
    setStatus('connecting');

    const call = peerRef.current?.call(remoteId, stream);
    const conn = peerRef.current?.connect(remoteId, { reliable: true });

    if (call) setupCallHandlers(call);
    if (conn) setupDataHandlers(conn);

    // Timeout guard for failed handshakes
    setTimeout(() => {
      if (statusRef.current === 'connecting') {
        console.warn("[YOLO] Handshake timed out. Restarting match...");
        skip();
      }
    }, 12000);
  }, [setupCallHandlers, setupDataHandlers, skip]);

  const connectSignaling = useCallback((myId: string, stream: MediaStream) => {
    if (isClosingRef.current) return;

    const channel = REGION_CHANNEL_MAP[region] || REGION_CHANNEL_MAP.global;
    const endpoint = `wss://${PIESOCKET_CLUSTER}/v3/${channel}?api_key=${SIGNALING_API_KEY}`;
    
    console.log(`[YOLO] Signaling: Linking to ${channel}...`);
    
    const ws = new WebSocket(endpoint);
    wsRef.current = ws;
    
    ws.onopen = () => {
      console.info("[YOLO] Signaling: Channel Subscribed.");
      if (statusRef.current === 'signaling_offline') setStatus('matching');
      
      // Step 1: Force immediate announcement
      announcePresence();
      
      // Step 2: Set heartbeat to keep the demo socket alive
      if (heartbeatIntervalRef.current) window.clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = window.setInterval(announcePresence, 10000);
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        
        // Step 3: Listen for other announcements
        if (msg.event === 'client-announce' && msg.peerId !== myId) {
          const bothMatching = msg.status === 'matching' && statusRef.current === 'matching';
          
          if (bothMatching) {
            /**
             * POLITE PEER LOGIC
             * If we are both matching, the one with the smaller ID initiates.
             * This prevents race conditions where both try to call at once.
             */
            if (myId < msg.peerId) {
              initiateCall(msg.peerId, stream);
            } else {
              // I am the 'Answerer', I wait for their incoming call event.
              // I also respond with my own announce to make sure they see me too.
              announcePresence();
            }
          }
        }
      } catch (err) {}
    };

    ws.onclose = () => {
      if (isClosingRef.current) return;
      console.warn("[YOLO] Signaling: Disconnected. Re-routing...");
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
            console.log("[YOLO] PeerID Verified:", id);
            setStatus('matching');
            connectSignaling(id, stream);
          }
        });

        peer.on('call', (incomingCall) => {
          console.log("[YOLO] Role: Answerer. Incoming call detected.");
          if (statusRef.current === 'matching' || statusRef.current === 'connecting') {
            setStatus('connecting');
            incomingCall.answer(stream);
            setupCallHandlers(incomingCall);
          } else {
            incomingCall.close();
          }
        });

        peer.on('connection', (conn) => {
          console.log("[YOLO] Data Link Established.");
          setupDataHandlers(conn);
        });

        peer.on('error', (err) => {
          if (['peer-unavailable', 'disconnected', 'network', 'webrtc'].includes(err.type)) {
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
      if (heartbeatIntervalRef.current) window.clearInterval(heartbeatIntervalRef.current);
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