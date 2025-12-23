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
  'global': 'yolo_v22_gl',
  'us-east': 'yolo_v22_na_e',
  'us-west': 'yolo_v22_na_w',
  'europe': 'yolo_v22_eu',
  'asia': 'yolo_v22_as',
  'south-america': 'yolo_v22_sa',
  'africa': 'yolo_v22_af',
  'oceania': 'yolo_v22_oc'
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
   * 1. MANUAL TRIGGER: BROADCAST IDENTITY
   * This function sends our PeerID and Status to the PieSocket channel.
   */
  const announcePresence = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN && peerRef.current?.id) {
      console.log("[YOLO] Signaling: Sending 'client-announce'...");
      const signal = JSON.stringify({
        event: 'client-announce',
        peerId: peerRef.current.id,
        status: statusRef.current,
        timestamp: Date.now()
      });
      ws.send(signal);
    }
  }, []);

  const skip = useCallback(() => {
    cleanup();
    console.info("[YOLO] Skipping... Resetting match state.");
    if (statusRef.current !== 'error' && statusRef.current !== 'idle') {
      setStatus('matching');
    }
    // Proactive announcement to find someone new immediately
    setTimeout(announcePresence, 100);
  }, [cleanup, announcePresence]);

  const setupCallHandlers = useCallback((call: MediaConnection) => {
    call.on('stream', (remote) => {
      console.info("[YOLO] WebRTC: Remote stream linked successfully.");
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
   * 3. THE HANDSHAKE: INITIATION
   * Triggered when discovery occurs.
   */
  const initiateCall = useCallback((remoteId: string, stream: MediaStream) => {
    if (statusRef.current !== 'matching') return;
    
    console.info(`[YOLO] Handshake: Initiating call to peer ${remoteId}`);
    setStatus('connecting');

    const call = peerRef.current?.call(remoteId, stream);
    const conn = peerRef.current?.connect(remoteId, { reliable: true });

    if (call) setupCallHandlers(call);
    if (conn) setupDataHandlers(conn);

    // Timeout guard for stalled handshakes
    setTimeout(() => {
      if (statusRef.current === 'connecting') {
        console.warn("[YOLO] Handshake timed out. Recycling...");
        skip();
      }
    }, 15000);
  }, [setupCallHandlers, setupDataHandlers, skip]);

  const connectSignaling = useCallback((myId: string, stream: MediaStream) => {
    if (isClosingRef.current) return;

    const channel = REGION_CHANNEL_MAP[region] || REGION_CHANNEL_MAP.global;
    const endpoint = `wss://${PIESOCKET_CLUSTER}/v3/${channel}?api_key=${SIGNALING_API_KEY}`;
    
    console.log(`[YOLO] Signaling: Connecting to ${endpoint}...`);
    
    const ws = new WebSocket(endpoint);
    wsRef.current = ws;
    
    ws.onopen = () => {
      console.info("[YOLO] Signaling Link: OPEN.");
      if (statusRef.current === 'signaling_offline') setStatus('matching');
      
      // REQUIREMENT 1: 1s Delay before manual announcement
      setTimeout(() => {
        announcePresence();
      }, 1000);
      
      // REQUIREMENT 4: Heartbeat for cleanup/demo persistency
      if (heartbeatIntervalRef.current) window.clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = window.setInterval(announcePresence, 8000);
    };

    /**
     * 2. NEW LISTENER: Custom 'client-announce' handler
     */
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        
        // Filter out my own messages and listen for others
        if (msg.event === 'client-announce' && msg.peerId !== myId) {
          console.log(`[YOLO] Discovery: Peer ${msg.peerId} announced availability.`);
          
          const iAmMatching = statusRef.current === 'matching';
          const peerIsMatching = msg.status === 'matching';
          
          if (iAmMatching && peerIsMatching) {
            /**
             * DETERMINISTIC HANDSHAKE (POLITE PEER)
             * Only one peer initiates to prevent collisions.
             */
            if (myId < msg.peerId) {
              console.log("[YOLO] Role: Initiator. Starting call...");
              initiateCall(msg.peerId, stream);
            } else {
              console.log("[YOLO] Role: Receiver. Waiting for incoming call...");
              // We reply with our announce so they definitely see us if they missed the first one
              announcePresence();
            }
          }
        }
      } catch (err) {
        // Handle non-JSON or malformed messages
      }
    };

    ws.onclose = () => {
      if (isClosingRef.current) return;
      console.warn("[YOLO] Signaling Link: LOST. Attempting failover...");
      setStatus('signaling_offline');
      setTimeout(() => connectSignaling(myId, stream), 5000);
    };

    ws.onerror = (err) => {
      console.error("[YOLO] Signaling Socket Error:", err);
      ws.close();
    };
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
            console.log("[YOLO] Peer Node Ready:", id);
            setStatus('matching');
            connectSignaling(id, stream);
          }
        });

        peer.on('call', (incomingCall) => {
          console.info("[YOLO] Incoming call detected from remote peer.");
          if (statusRef.current === 'matching' || statusRef.current === 'connecting') {
            setStatus('connecting');
            incomingCall.answer(stream);
            setupCallHandlers(incomingCall);
          } else {
            console.warn("[YOLO] Rejecting call: Busy or already connected.");
            incomingCall.close();
          }
        });

        peer.on('connection', (conn) => {
          console.info("[YOLO] Peer Data Channel secured.");
          setupDataHandlers(conn);
        });

        peer.on('error', (err) => {
          console.warn("[YOLO] PeerJS Error:", err.type);
          if (['peer-unavailable', 'disconnected', 'network', 'webrtc'].includes(err.type)) {
            skip();
          }
        });

      } catch (err) {
        if (mounted) {
          console.error("[YOLO] Media/Device access error:", err);
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