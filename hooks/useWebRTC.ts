import { useState, useEffect, useRef, useCallback } from 'react';
import { Peer, DataConnection, MediaConnection } from 'peerjs';
import { Region, ReactionType } from '../types';
import { useSession } from '../context/SessionContext';

type WebRTCStatus =
  | 'idle'
  | 'generating_id'
  | 'matching'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error'
  | 'signaling_offline';

const SIGNALING_API_KEY = 'PJ5tqEc0E390uQ7Tdot6trHD9XJ5tRclV7gnAV3r';
const PIESOCKET_CLUSTER = 's15607.nyc1.piesocket.com';

const REGION_CHANNEL_MAP: Record<Region, string> = {
  global: 'yolo_v24_gl',
  'us-east': 'yolo_v24_na_e',
  'us-west': 'yolo_v24_na_w',
  europe: 'yolo_v24_eu',
  asia: 'yolo_v24_as',
  'south-america': 'yolo_v24_sa',
  africa: 'yolo_v24_af',
  oceania: 'yolo_v24_oc',
};

const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
};

const BLACKLIST_TTL = 30_000; // Reduced to 30s for faster retries during dev

export const useWebRTC = (
  region: Region,
  mode: 'public' | 'private' = 'public',
  targetUid?: string,
  onMessageReceived?: (msg: string) => void,
  onReactionReceived?: (type: ReactionType) => void
) => {
  const { session } = useSession();

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<WebRTCStatus>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  // Refs
  const peerRef = useRef<Peer | null>(null);
  const callRef = useRef<MediaConnection | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const remotePeerIdRef = useRef<string | null>(null);

  const lockRef = useRef<string | null>(null);
  const blacklistRef = useRef<Set<string>>(new Set());
  const proposalIntervalRef = useRef<any>(null);
  const handshakeTimeoutRef = useRef<any>(null);
  const connectionTimeoutRef = useRef<any>(null); // New timeout for "Connecting" hang
  const isClosingRef = useRef(false);

  /* -------------------- HELPERS -------------------- */

  const broadcast = useCallback((payload: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const stopTimers = useCallback(() => {
    if (proposalIntervalRef.current) {
      clearInterval(proposalIntervalRef.current);
      proposalIntervalRef.current = null;
    }
    if (handshakeTimeoutRef.current) {
      clearTimeout(handshakeTimeoutRef.current);
      handshakeTimeoutRef.current = null;
    }
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    lockRef.current = null;
    stopTimers();

    if (callRef.current) {
      callRef.current.close();
      callRef.current = null;
    }
    if (connRef.current) {
      connRef.current.close();
      connRef.current = null;
    }
    
    setRemoteStream(null);
  }, [stopTimers]);

  const skip = useCallback(
    (shouldBlacklist: boolean = false) => {
      console.log('Skipping... Blacklist:', shouldBlacklist);
      
      if (shouldBlacklist && lockRef.current) {
        const target = lockRef.current;
        blacklistRef.current.add(target);
        setTimeout(() => blacklistRef.current.delete(target), BLACKLIST_TTL);
      }

      cleanup();
      setStatus('matching');

      // Re-announce presence
      if (peerRef.current?.id) {
        broadcast({
          type: 'presence',
          peerId: peerRef.current.id,
          status: 'matching',
        });
      }
    },
    [cleanup, broadcast]
  );

  /* -------------------- P2P HANDLERS -------------------- */

  const setupCallHandlers = useCallback(
    (call: MediaConnection) => {
      console.log('Setting up call handlers for:', call.peer);
      
      call.on('stream', (remote) => {
        console.log('Stream received!');
        stopTimers(); // Success! Stop the fail-safe timers
        remotePeerIdRef.current = call.peer;
        setRemoteStream(remote);
        setStatus('connected');
      });

      call.on('close', () => skip(false));
      call.on('error', (e) => {
        console.error('Call error:', e);
        skip(true);
      });

      callRef.current = call;
    },
    [skip, stopTimers]
  );

  const setupDataHandlers = useCallback(
    (conn: DataConnection) => {
      conn.on('data', (data: any) => {
        if (data.type === 'chat') onMessageReceived?.(data.text);
        if (data.type === 'reaction') onReactionReceived?.(data.value);
      });
      conn.on('close', () => skip(false));
      conn.on('error', () => skip(false));
      connRef.current = conn;
    },
    [skip, onMessageReceived, onReactionReceived]
  );

  const initiateP2P = useCallback(
    (remoteId: string, stream: MediaStream) => {
      setStatus('connecting');
      
      // Safety: If connection doesn't succeed in 10s, abort and skip
      if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = setTimeout(() => {
        if (status !== 'connected') {
          console.warn('Connection timeout - WebRTC failed to establish');
          skip(true);
        }
      }, 10000);

      setTimeout(() => {
        if (!peerRef.current || peerRef.current.destroyed) return;

        try {
          const conn = peerRef.current.connect(remoteId, { reliable: true });
          if (conn) setupDataHandlers(conn);

          const call = peerRef.current.call(remoteId, stream);
          if (call) setupCallHandlers(call);
        } catch (e) {
          console.error('P2P Init Error:', e);
          skip(true);
        }
      }, 500); // Small delay to let PeerJS stabilize
    },
    [setupCallHandlers, setupDataHandlers, skip, status]
  );

  /* -------------------- SIGNALING -------------------- */

  const connectSignaling = useCallback(
    (myId: string, stream: MediaStream) => {
      const channel = REGION_CHANNEL_MAP[region];
      console.log(`Connecting to Signaling Channel: ${channel} (${region})`);
      
      const ws = new WebSocket(
        `wss://${PIESOCKET_CLUSTER}/v3/${channel}?api_key=${SIGNALING_API_KEY}&presence=true`
      );

      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('matching');
        broadcast({ type: 'presence', peerId: myId });
      };

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.peerId === myId) return;

        // 1. PRESENCE (Discovery)
        if (msg.type === 'presence') {
          if (!lockRef.current && !blacklistRef.current.has(msg.peerId)) {
            console.log('Found peer:', msg.peerId);
            lockRef.current = msg.peerId;

            const propose = () =>
              broadcast({
                type: 'match-propose',
                targetId: msg.peerId,
                fromId: myId,
              });

            stopTimers();
            propose();
            proposalIntervalRef.current = setInterval(propose, 1000);

            // Fail-safe: If handshake takes > 5s, unlock and retry
            handshakeTimeoutRef.current = setTimeout(() => {
              if (lockRef.current === msg.peerId) {
                console.log('Handshake timed out');
                skip(true);
              }
            }, 5000);
          }
        }

        // 2. PROPOSE
        if (msg.type === 'match-propose' && msg.targetId === myId) {
          // Double-Lock Fix: Accept if we are free OR if we are locked to *them*
          if (!lockRef.current || lockRef.current === msg.fromId) {
            lockRef.current = msg.fromId;
            stopTimers();
            setStatus('connecting');

            broadcast({
              type: 'match-accept',
              targetId: msg.fromId,
              fromId: myId,
            });
            
            // Set a timeout for the connecting phase here too
             connectionTimeoutRef.current = setTimeout(() => {
                console.log('Stuck in connecting state (responder)... skipping');
                skip(true);
             }, 8000);
          }
        }

        // 3. ACCEPT
        if (msg.type === 'match-accept' && msg.targetId === myId) {
          if (lockRef.current === msg.fromId) {
            stopTimers();
            // Tie-Breaker: Higher ID initiates the call
            if (myId > msg.fromId) {
              console.log('I am the caller (Higher ID)');
              initiateP2P(msg.fromId, stream);
            } else {
              console.log('I am the callee (Lower ID) - Waiting for stream...');
            }
          }
        }
      };

      ws.onclose = () => {
        if (!isClosingRef.current) {
          setStatus('signaling_offline');
          setTimeout(() => connectSignaling(myId, stream), 3000);
        }
      };
    },
    [region, broadcast, initiateP2P, skip, stopTimers]
  );

  /* -------------------- INIT -------------------- */

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      if (!session?.id) return;
      
      console.log('Initializing WebRTC for Region:', region);
      setStatus('generating_id');

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        if (!mounted) return;
        setLocalStream(stream);
      } catch (err) {
        console.error('Media Error:', err);
        setStatus('error');
        return;
      }

      // Generate Peer ID
      const peerId = `yolo_${session.id}_${Math.random().toString(36).substr(2, 6)}`;
      const peer = new Peer(peerId, { config: ICE_CONFIG });
      peerRef.current = peer;

      peer.on('open', (id) => {
        console.log('My Peer ID:', id);
        if (mounted) connectSignaling(id, stream);
      });

      peer.on('call', (incoming) => {
        if (lockRef.current === incoming.peer) {
          console.log('Answering incoming call...');
          incoming.answer(stream);
          setupCallHandlers(incoming);
        } else {
          console.warn('Blocked call from unknown peer');
          incoming.close();
        }
      });

      peer.on('connection', (conn) => {
        if (lockRef.current === conn.peer) {
          setupDataHandlers(conn);
        } else {
          conn.close();
        }
      });
      
      peer.on('error', (err) => {
          console.error('Peer Error:', err);
          if(err.type === 'peer-unavailable') skip(true);
      });
    };

    init();

    return () => {
      mounted = false;
      isClosingRef.current = true;
      cleanup();
      peerRef.current?.destroy();
      wsRef.current?.close();
      setLocalStream(prev => {
        prev?.getTracks().forEach(t => t.stop());
        return null;
      });
    };
  }, [session?.id, region]); // Re-init if region changes

  // ... (API returns same as before)
  return {
    localStream,
    remoteStream,
    remotePeerId: remotePeerIdRef.current,
    status,
    sendMessage: (text: string) => connRef.current?.open && connRef.current.send({ type: 'chat', text }),
    sendReaction: (value: ReactionType) => connRef.current?.open && connRef.current.send({ type: 'reaction', value }),
    revealIdentity: () => {
      if (connRef.current?.open && session) {
        connRef.current.send({ type: 'identity', uid: session.id });
      }
    },
    skip: () => skip(false),
    isMuted,
    isVideoOff,
    toggleMute: () => {
        if (localStream) {
            const t = localStream.getAudioTracks()[0];
            if(t) { t.enabled = isMuted; setIsMuted(!isMuted); }
        }
    },
    toggleVideo: () => {
        if (localStream) {
            const t = localStream.getVideoTracks()[0];
            if(t) { t.enabled = isVideoOff; setIsVideoOff(!isVideoOff); }
        }
    }
  };
};