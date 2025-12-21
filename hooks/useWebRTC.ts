
import { useState, useEffect, useRef, useCallback } from 'react';
import { Peer, DataConnection, MediaConnection } from 'peerjs';
import { Region, ReactionType } from '../types';
import { useSession } from '../context/SessionContext';

type WebRTCStatus = 'idle' | 'generating_id' | 'matching' | 'connecting' | 'connected' | 'disconnected' | 'error' | 'signaling_offline' | 'reconnecting';

const SIGNALING_API_KEY = 'VCX6vjaGNoz9grHtfD2vshCwIr9p8f7p9M80jWq6';
const RELAY_CLUSTERS = [
  'yolo_v3_shard_1',
  'yolo_v3_shard_2',
  'yolo_v3_shard_3',
  'yolo_v3_shard_4',
  'yolo_v3_shard_5'
];

const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ],
  iceCandidatePoolSize: 12
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
  const heartbeatIntervalRef = useRef<number | null>(null);
  const wsKeepAliveIntervalRef = useRef<number | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const clusterIdxRef = useRef(Math.floor(Math.random() * RELAY_CLUSTERS.length));
  const isClosingRef = useRef(false);
  const retryCountRef = useRef(0);
  
  const statusRef = useRef<WebRTCStatus>('idle');
  const onMsgRef = useRef(onMessageReceived);
  const onReactRef = useRef(onReactionReceived);

  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { onMsgRef.current = onMessageReceived; }, [onMessageReceived]);
  useEffect(() => { onReactRef.current = onReactionReceived; }, [onReactionReceived]);

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
      try {
        ws.send(JSON.stringify({
          type: 'presence',
          peerId: peerRef.current.id,
          region,
          sessionId: session?.id,
          timestamp: Date.now()
        }));
      } catch (e) {}
    }
  }, [region, session?.id]);

  const skip = useCallback(() => {
    cleanup();
    if (statusRef.current === 'connected' || statusRef.current === 'connecting') {
      setStatus('matching');
    }
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
      if (data.type === 'chat') onMsgRef.current?.(data.text);
      if (data.type === 'reaction') onReactRef.current?.(data.value);
    });
    conn.on('close', skip);
    conn.on('error', skip);
    connRef.current = conn;
  }, [skip]);

  const connectSignaling = useCallback((peerId: string, stream: MediaStream) => {
    if (isClosingRef.current) return;

    if (discoveryWsRef.current) {
      discoveryWsRef.current.onclose = null;
      discoveryWsRef.current.onerror = null;
      discoveryWsRef.current.close();
    }

    // Toggle between free and demo hosts to bypass cluster-specific blocks
    const host = retryCountRef.current % 2 === 0 ? 'free.piesocket.com' : 'demo.piesocket.com';
    const cluster = RELAY_CLUSTERS[clusterIdxRef.current % RELAY_CLUSTERS.length];
    const endpoint = `wss://${host}/v3/${cluster}?api_key=${SIGNALING_API_KEY}`;
    
    const ws = new WebSocket(endpoint);
    discoveryWsRef.current = ws;
    
    ws.onopen = () => {
      retryCountRef.current = 0;
      if (statusRef.current === 'reconnecting' || statusRef.current === 'signaling_offline') {
        setStatus('matching');
      }
      broadcastPresence();
      
      if (heartbeatIntervalRef.current) window.clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = window.setInterval(broadcastPresence, 3000);

      if (wsKeepAliveIntervalRef.current) window.clearInterval(wsKeepAliveIntervalRef.current);
      wsKeepAliveIntervalRef.current = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.send(JSON.stringify({ type: 'ping' })); } catch(e) {}
        }
      }, 7000);
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'presence' && msg.region === region && msg.peerId !== peerId) {
          if (peerId < msg.peerId && statusRef.current === 'matching') {
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
      clusterIdxRef.current++;
      retryCountRef.current++;
      
      if (reconnectTimeoutRef.current) window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = window.setTimeout(() => {
        if (!isClosingRef.current) connectSignaling(peerId, stream);
      }, 1000 + Math.random() * 500);
    };

    ws.onerror = () => {
      if (ws.readyState !== WebSocket.CLOSED) ws.close();
    };
  }, [region, broadcastPresence, setupCallHandlers, setupDataHandlers]);

  useEffect(() => {
    let mounted = true;
    isClosingRef.current = false;

    const startPeerEngine = (id: string, stream: MediaStream) => {
      if (!mounted) return;
      
      const peer = new Peer(id, { 
        debug: 1, 
        config: ICE_CONFIG,
        secure: true
      });
      peerRef.current = peer;

      peer.on('open', (peerId) => {
        if (!mounted) return;
        setStatus('matching');
        connectSignaling(peerId, stream);
      });

      peer.on('call', (call) => {
        if (!mounted) return;
        if (statusRef.current === 'matching' || statusRef.current === 'connecting') {
          setStatus('connecting');
          call.answer(stream);
          setupCallHandlers(call);
        } else {
          call.close();
        }
      });

      peer.on('connection', (conn) => {
        if (!mounted) return;
        setupDataHandlers(conn);
      });

      peer.on('disconnected', () => {
        if (!isClosingRef.current) peer.reconnect();
      });

      peer.on('error', (err) => {
        if (['network', 'socket-error', 'socket-closed', 'signaling'].includes(err.type)) {
          if (!isClosingRef.current && mounted) {
            peer.destroy();
            setTimeout(() => { if (mounted) startPeerEngine(id, stream); }, 4000);
          }
        } else if (err.type === 'browser-incompatible' || err.type === 'unavailable-id') {
          if (mounted) setStatus('error');
        }
      });
    };

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
        startPeerEngine(session.id, stream);
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
      if (discoveryWsRef.current) {
        discoveryWsRef.current.onclose = null;
        discoveryWsRef.current.close();
      }
      if (heartbeatIntervalRef.current) window.clearInterval(heartbeatIntervalRef.current);
      if (wsKeepAliveIntervalRef.current) window.clearInterval(wsKeepAliveIntervalRef.current);
      if (reconnectTimeoutRef.current) window.clearTimeout(reconnectTimeoutRef.current);
      if (localStream) localStream.getTracks().forEach(track => track.stop());
    };
  }, [session?.id, cleanup, connectSignaling, setupCallHandlers, setupDataHandlers]);

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
        const t = localStream.getAudioTracks()[0];
        if (t) { t.enabled = isMuted; setIsMuted(!isMuted); }
      }
    },
    toggleVideo: () => {
      if (localStream) {
        const t = localStream.getVideoTracks()[0];
        if (t) { t.enabled = isVideoOff; setIsVideoOff(!isVideoOff); }
      }
    }
  };
};
