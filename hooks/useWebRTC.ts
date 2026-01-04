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

    callRef.current?.close();
    connRef.current?.close();

    callRef.current = null;
    connRef.current = null;
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
      setStatus('matching');

      broadcast({
        type: 'presence',
        peerId: peerRef.current?.id,
        status: 'matching',
      });
    },
    [cleanup, broadcast]
  );

  /* -------------------- P2P -------------------- */

  const setupCallHandlers = useCallback(
    (call: MediaConnection) => {
      call.on('stream', (remote) => {
        stopProposal();
        setRemoteStream(remote);
        setStatus('connected');
      });

      call.on('close', () => skip(false));
      call.on('error', () => skip(true));

      callRef.current = call;
    },
    [skip, stopProposal]
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

      setTimeout(() => {
        if (!peerRef.current || peerRef.current.destroyed) return;

        try {
          const call = peerRef.current.call(remoteId, stream);
          const conn = peerRef.current.connect(remoteId, { reliable: true });

          if (call) setupCallHandlers(call);
          if (conn) setupDataHandlers(conn);
        } catch {
          skip(true);
        }
      }, 200);
    },
    [setupCallHandlers, setupDataHandlers, skip]
  );

  /* -------------------- SIGNALING -------------------- */

  const connectSignaling = useCallback(
    (myId: string, stream: MediaStream) => {
      const channel = REGION_CHANNEL_MAP[region];
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

        // Presence → propose
        if (msg.type === 'presence' && msg.peerId !== myId) {
          if (!lockRef.current && !blacklistRef.current.has(msg.peerId)) {
            lockRef.current = msg.peerId;

            const propose = () =>
              broadcast({
                type: 'match-propose',
                targetId: msg.peerId,
                fromId: myId,
              });

            stopProposal();
            propose();
            proposalIntervalRef.current = setInterval(propose, 1500);

            handshakeTimeoutRef.current = setTimeout(() => {
              if (lockRef.current === msg.peerId) {
                skip(true);
              }
            }, 6000);
          }
        }

        // Proposal received
        if (msg.type === 'match-propose' && msg.targetId === myId) {
          if (!lockRef.current) {
            lockRef.current = msg.fromId;
            stopProposal();
            setStatus('connecting');

            broadcast({
              type: 'match-accept',
              targetId: msg.fromId,
              fromId: myId,
            });
          }
        }

        // Accepted → start WebRTC
        if (msg.type === 'match-accept' && msg.targetId === myId) {
          if (lockRef.current === msg.fromId) {
            stopProposal();
            initiateP2P(msg.fromId, stream);
          }
        }

        // Peer left
        if (msg.event === 'system:member_left' && lockRef.current) {
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

      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      if (!mounted) return;

      setLocalStream(stream);

      const peer = new Peer(`yolo_${session.id}_${Math.random()}`, {
        config: ICE_CONFIG,
        secure: true,
      });

      peerRef.current = peer;

      peer.on('open', (id) => connectSignaling(id, stream));

      peer.on('call', (incoming) => {
        if (lockRef.current === incoming.peer) {
          incoming.answer(stream);
          setupCallHandlers(incoming);
        } else {
          incoming.close();
        }
      });

      peer.on('connection', (conn) => {
        if (lockRef.current === conn.peer) {
          setupDataHandlers(conn);
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
      localStream?.getTracks().forEach((t) => t.stop());
    };
  }, [session?.id]);

  /* -------------------- API -------------------- */

  return {
    localStream,
    remoteStream,
    status,
    skip: () => skip(false),
    sendMessage: (text: string) =>
      connRef.current?.open && connRef.current.send({ type: 'chat', text }),
    sendReaction: (value: ReactionType) =>
      connRef.current?.open &&
      connRef.current.send({ type: 'reaction', value }),
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
