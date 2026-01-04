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

const BLACKLIST_TTL = 60_000; // 1 minute

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

  // Refs for stable access inside callbacks
  const peerRef = useRef<Peer | null>(null);
  const callRef = useRef<MediaConnection | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const remotePeerIdRef = useRef<string | null>(null);

  const lockRef = useRef<string | null>(null);
  const blacklistRef = useRef<Set<string>>(new Set());
  const proposalIntervalRef = useRef<any>(null);
  const handshakeTimeoutRef = useRef<any>(null);
  const isClosingRef = useRef(false);

  /* -------------------- HELPERS -------------------- */

  const broadcast = useCallback((payload: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const stopProposal = useCallback(() => {
    if (proposalIntervalRef.current) {
      clearInterval(proposalIntervalRef.current);
      proposalIntervalRef.current = null;
    }
    if (handshakeTimeoutRef.current) {
      clearTimeout(handshakeTimeoutRef.current);
      handshakeTimeoutRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    lockRef.current = null;
    stopProposal();

    // Close existing connections
    if (callRef.current) {
      callRef.current.close();
      callRef.current = null;
    }
    if (connRef.current) {
      connRef.current.close();
      connRef.current = null;
    }
    
    setRemoteStream(null);
  }, [stopProposal]);

  const skip = useCallback(
    (shouldBlacklist: boolean = false) => {
      if (shouldBlacklist && lockRef.current) {
        const target = lockRef.current;
        blacklistRef.current.add(target);
        setTimeout(() => blacklistRef.current.delete(target), BLACKLIST_TTL);
      }

      cleanup();
      
      // Reset status to matching immediately
      setStatus('matching');

      // Re-broadcast presence to find new peer
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
      call.on('stream', (remote) => {
        console.log('Stream received from:', call.peer);
        remotePeerIdRef.current = call.peer;
        stopProposal();
        setRemoteStream(remote);
        setStatus('connected');
      });

      call.on('close', () => skip(false));
      call.on('error', (err) => {
        console.error('Call error:', err);
        skip(true);
      });

      callRef.current = call;
    },
    [skip, stopProposal]
  );

  const setupDataHandlers = useCallback(
    (conn: DataConnection) => {
      conn.on('data', (data: any) => {
        if (data.type === 'chat') onMessageReceived?.(data.text);
        if (data.type === 'reaction') onReactionReceived?.(data.value);
        if (data.type === 'identity') console.log('Identity revealed:', data.uid);
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
      
      if (!peerRef.current || peerRef.current.destroyed) return;

      console.log('Initiating P2P Call to:', remoteId);

      // 1. Establish Data Connection (Chat/Signals)
      try {
        const conn = peerRef.current.connect(remoteId, { reliable: true });
        if (conn) setupDataHandlers(conn);
      } catch (e) {
        console.error('Data connection failed', e);
      }

      // 2. Establish Media Call
      try {
        const call = peerRef.current.call(remoteId, stream);
        if (call) setupCallHandlers(call);
      } catch (e) {
        console.error('Media call failed', e);
        skip(true);
      }
    },
    [setupCallHandlers, setupDataHandlers, skip]
  );

  /* -------------------- SIGNALING (The Fix) -------------------- */

  const connectSignaling = useCallback(
    (myId: string, stream: MediaStream) => {
      const channel = REGION_CHANNEL_MAP[region];
      const ws = new WebSocket(
        `wss://${PIESOCKET_CLUSTER}/v3/${channel}?api_key=${SIGNALING_API_KEY}&presence=true`
      );

      wsRef.current = ws;

      ws.onopen = () => {
        console.log('Signaling Connected');
        setStatus('matching');
        broadcast({ type: 'presence', peerId: myId });
      };

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if(msg.peerId === myId) return; // Ignore own messages

        // 1. PRESENCE: Found a potential match
        if (msg.type === 'presence') {
          // Only lock if we are free and they are not blacklisted
          if (!lockRef.current && !blacklistRef.current.has(msg.peerId)) {
            lockRef.current = msg.peerId;

            // Start sending proposals
            const propose = () =>
              broadcast({
                type: 'match-propose',
                targetId: msg.peerId,
                fromId: myId,
              });

            stopProposal();
            propose();
            proposalIntervalRef.current = setInterval(propose, 1000);

            // Give up if no handshake after 6s
            handshakeTimeoutRef.current = setTimeout(() => {
              if (lockRef.current === msg.peerId) {
                console.log('Handshake timeout, skipping...');
                skip(true);
              }
            }, 6000);
          }
        }

        // 2. PROPOSAL RECEIVED
        if (msg.type === 'match-propose' && msg.targetId === myId) {
          // Logic: We accept if we are free OR if we are locked to *this specific user* (Collision fix)
          const isFree = !lockRef.current;
          const isLockedToSender = lockRef.current === msg.fromId;

          if (isFree || isLockedToSender) {
            // Ensure we are locked to them now
            lockRef.current = msg.fromId;
            stopProposal(); 
            setStatus('connecting');

            // Send acceptance
            broadcast({
              type: 'match-accept',
              targetId: msg.fromId,
              fromId: myId,
            });
          }
        }

        // 3. ACCEPTANCE RECEIVED
        if (msg.type === 'match-accept' && msg.targetId === myId) {
          if (lockRef.current === msg.fromId) {
            stopProposal();
            
            // TIE-BREAKER: To prevent both sides calling each other and failing,
            // only the user with the "larger" PeerID initiates the call.
            // The other user waits for the incoming call event.
            if (myId > msg.fromId) {
              initiateP2P(msg.fromId, stream);
            } else {
              console.log('Waiting for peer to call (I have lower ID)...');
            }
          }
        }

        // 4. REMOTE DISCONNECT
        if (msg.event === 'system:member_left' && lockRef.current === msg.peerId) {
          skip(false);
        }
      };

      ws.onclose = () => {
        if (!isClosingRef.current) {
          setStatus('signaling_offline');
          setTimeout(() => connectSignaling(myId, stream), 3000);
        }
      };
    },
    [region, broadcast, initiateP2P, skip, stopProposal]
  );

  /* -------------------- INIT -------------------- */

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      if (!session?.id) return;

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
        console.error('Failed to get user media', err);
        setStatus('error');
        return;
      }

      const peer = new Peer(`yolo_${session.id}_${Math.random().toString(36).substr(2, 9)}`, {
        config: ICE_CONFIG,
        secure: true,
      });

      peerRef.current = peer;

      peer.on('open', (id) => {
        if (mounted) connectSignaling(id, stream);
      });

      // ANSWERING LOGIC (Passive Side)
      peer.on('call', (incoming) => {
        console.log('Incoming call from:', incoming.peer);
        // Only answer if this is the person we locked onto
        if (lockRef.current === incoming.peer) {
          incoming.answer(stream);
          setupCallHandlers(incoming);
        } else {
          console.warn('Rejected call from unknown peer:', incoming.peer);
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
        console.error('PeerJS error:', err);
        // Only skip if the error is fatal for the connection
        if (err.type === 'peer-unavailable' || err.type === 'network') {
            skip(true);
        }
      });
    };

    init();

    return () => {
      mounted = false;
      isClosingRef.current = true;
      cleanup();
      peerRef.current?.destroy();
      wsRef.current?.close();
      
      // Stop all tracks on unmount
      setLocalStream(prev => {
        prev?.getTracks().forEach(t => t.stop());
        return null;
      });
    };
  }, [session?.id]); // Only re-run if session ID changes

  const revealIdentity = useCallback(() => {
    if (!connRef.current?.open || !session) return;
    connRef.current.send({ type: 'identity', uid: session.id });
  }, [session]);

  return {
    localStream,
    remoteStream,
    remotePeerId: remotePeerIdRef.current,
    status,
    sendMessage: (text: string) => connRef.current?.open && connRef.current.send({ type: 'chat', text }),
    sendReaction: (value: ReactionType) => connRef.current?.open && connRef.current.send({ type: 'reaction', value }),
    revealIdentity,
    skip: () => skip(false),
    isMuted,
    isVideoOff,
    toggleMute: () => {
      if (localStream) {
        const t = localStream.getAudioTracks()[0];
        if (t) {
          t.enabled = isMuted;
          setIsMuted(!isMuted);
        }
      }
    },
    toggleVideo: () => {
      if (localStream) {
        const t = localStream.getVideoTracks()[0];
        if (t) {
          t.enabled = isVideoOff;
          setIsVideoOff(!isVideoOff);
        }
      }
    },
  };
};