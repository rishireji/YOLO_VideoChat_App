
import { useState, useEffect, useRef, useCallback } from 'react';
import { Peer, DataConnection, MediaConnection } from 'peerjs';
import { Region, ReactionType } from '../types';
import { useSession } from '../context/SessionContext';

// Added 'signaling_offline' to WebRTCStatus union type to match the expected statuses in ChatRoom.tsx
type WebRTCStatus = 'idle' | 'generating_id' | 'matching' | 'connecting' | 'connected' | 'disconnected' | 'error' | 'signaling_offline';

/**
 * PRODUCTION MATCHMAKING RELAY
 * This is a public, free discovery relay used solely to swap PeerIDs.
 * No video data passes through here.
 */
const DISCOVERY_RELAY = 'wss://free.piesocket.com/v3/yolo_discovery_v1?api_key=VCX6vjaGNoz9grHtfD2vshCwIr9p8f7p9M80jWq6&notify_self=0';

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
  const matchmakingIntervalRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (callRef.current) callRef.current.close();
    if (connRef.current) connRef.current.close();
    setRemoteStream(null);
  }, []);

  const skip = useCallback(() => {
    cleanup();
    setStatus('matching');
    
    // Broadcast our availability to the discovery relay
    if (discoveryWsRef.current?.readyState === WebSocket.OPEN && peerRef.current?.id) {
      discoveryWsRef.current.send(JSON.stringify({
        type: 'presence',
        peerId: peerRef.current.id,
        region,
        sessionId: session?.id
      }));
    }
  }, [cleanup, region, session?.id]);

  useEffect(() => {
    const initPeer = async () => {
      setStatus('generating_id');
      
      try {
        // Initialize Media first
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: { ideal: 1280 }, height: { ideal: 720 } }, 
          audio: true 
        });
        setLocalStream(stream);

        // Create Peer
        const peer = new Peer(session?.id || '', {
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun.cloudflare.com:3478' }
            ]
          }
        });

        peer.on('open', (id) => {
          console.log('[PeerJS] ID:', id);
          setStatus('matching');
          
          // Connect to discovery relay for matchmaking
          const ws = new WebSocket(DISCOVERY_RELAY);
          
          ws.onopen = () => {
            discoveryWsRef.current = ws;
            skip();
          };

          ws.onmessage = (e) => {
            const msg = JSON.parse(e.data);
            
            // Matchmaking logic: If we see another peer in our region
            if (msg.type === 'presence' && msg.region === region && msg.peerId !== id) {
              // Arbitration: Smaller PeerID initiates the call
              if (id < msg.peerId && status === 'matching') {
                console.log('[PeerJS] Matching with:', msg.peerId);
                setStatus('connecting');
                
                const call = peer.call(msg.peerId, stream);
                const conn = peer.connect(msg.peerId);
                
                setupCallHandlers(call);
                setupDataHandlers(conn);
              }
            }
          };

          ws.onclose = () => {
             console.warn('[Discovery] Relay connection closed');
             if (status === 'matching') setStatus('signaling_offline');
          };

          ws.onerror = (err) => {
             console.error('[Discovery] Relay error:', err);
             setStatus('error');
          };
        });

        peer.on('call', (call) => {
          console.log('[PeerJS] Incoming call...');
          setStatus('connecting');
          call.answer(stream);
          setupCallHandlers(call);
        });

        peer.on('connection', (conn) => {
          setupDataHandlers(conn);
        });

        peer.on('error', (err) => {
          console.error('[PeerJS] Error:', err);
          setStatus('error');
        });

        peerRef.current = peer;
      } catch (err) {
        console.error('[Media] Access denied or error:', err);
        setStatus('error');
      }
    };

    const setupCallHandlers = (call: MediaConnection) => {
      call.on('stream', (remoteStream) => {
        console.log('[PeerJS] Stream received');
        setRemoteStream(remoteStream);
        setStatus('connected');
      });
      call.on('close', skip);
      callRef.current = call;
    };

    const setupDataHandlers = (conn: DataConnection) => {
      conn.on('data', (data: any) => {
        if (data.type === 'chat') onMessageReceived?.(data.text);
        if (data.type === 'reaction') onReactionReceived?.(data.value);
      });
      conn.on('close', skip);
      connRef.current = conn;
    };

    initPeer();

    return () => {
      peerRef.current?.destroy();
      discoveryWsRef.current?.close();
      if (matchmakingIntervalRef.current) clearInterval(matchmakingIntervalRef.current);
    };
  }, [session?.id, region, skip, onMessageReceived, onReactionReceived]);

  return {
    localStream, remoteStream, status, 
    sendMessage: (text: string) => {
      connRef.current?.send({ type: 'chat', text });
    },
    sendReaction: (value: ReactionType) => {
      connRef.current?.send({ type: 'reaction', value });
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
