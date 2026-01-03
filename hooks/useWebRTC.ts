import { useState, useEffect, useRef, useCallback } from "react";
import { Peer, DataConnection, MediaConnection } from "peerjs";
import { Region, ReactionType } from "../types";
import { useSession } from "../context/SessionContext";
import { useAuth } from "../context/AuthContext";

type WebRTCStatus =
  | "idle"
  | "generating_id"
  | "matching"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

type MatchMode = "public" | "private";

const SIGNALING_API_KEY = "PJ5tqEc0E390uQ7Tdot6trHD9XJ5tRclV7gnAV3r";
const PIESOCKET_CLUSTER = "s15607.nyc1.piesocket.com";

const REGION_CHANNEL_MAP: Record<Region, string> = {
  global: "yolo_v24_gl",
  "us-east": "yolo_v24_na_e",
  "us-west": "yolo_v24_na_w",
  europe: "yolo_v24_eu",
  asia: "yolo_v24_as",
  "south-america": "yolo_v24_sa",
  africa: "yolo_v24_af",
  oceania: "yolo_v24_oc",
};

const ICE_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:global.stun.twilio.com:3478" },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
};

const shouldInitiate = (myId: string, remoteId: string) => myId < remoteId;

export const useWebRTC = (
  region: Region,
  mode: MatchMode = "public",
  targetUid?: string,
  onMessage?: (msg: string) => void,
  onReaction?: (reaction: ReactionType) => void
) => {
  const { session } = useSession();
  const { user } = useAuth();

  const [status, setStatus] = useState<WebRTCStatus>("idle");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [remotePeerId, setRemotePeerId] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  const peerRef = useRef<Peer | null>(null);
  const callRef = useRef<MediaConnection | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const lockRef = useRef<string | null>(null);

  /* -------------------- CLEANUP -------------------- */
  const cleanup = useCallback(() => {
    callRef.current?.close();
    connRef.current?.close();
    wsRef.current?.close();
    callRef.current = null;
    connRef.current = null;
    wsRef.current = null;
    lockRef.current = null;
    setRemoteStream(null);
    setRemotePeerId(null);
    setStatus("disconnected");
  }, []);

  /* -------------------- MEDIA -------------------- */
  const initMedia = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    setLocalStream(stream);
    return stream;
  };

  /* -------------------- P2P SETUP -------------------- */
  const setupCallHandlers = (call: MediaConnection) => {
    call.on("stream", (stream) => {
      setRemoteStream(stream);
      setRemotePeerId(call.peer);
      setStatus("connected");
    });
    call.on("close", cleanup);
    call.on("error", cleanup);
    callRef.current = call;
  };

  const setupDataHandlers = (conn: DataConnection) => {
    conn.on("data", (data: any) => {
      if (data.type === "chat") onMessage?.(data.text);
      if (data.type === "reaction") onReaction?.(data.value);
      if (data.type === "identity") {
        // identity received ONLY after consent
        onMessage?.(`[IDENTITY] ${JSON.stringify(data)}`);
      }
    });
    conn.on("close", cleanup);
    connRef.current = conn;
  };

  const initiateP2P = (remoteId: string) => {
    if (!peerRef.current || !localStream) return;

    if (shouldInitiate(peerRef.current.id, remoteId)) {
      const call = peerRef.current.call(remoteId, localStream);
      const conn = peerRef.current.connect(remoteId, { reliable: true });
      setupCallHandlers(call);
      setupDataHandlers(conn);
    }
  };

  /* -------------------- SIGNALING -------------------- */
  const connectPublicSignaling = (peerId: string) => {
    const channel = REGION_CHANNEL_MAP[region];
    const ws = new WebSocket(
      `wss://${PIESOCKET_CLUSTER}/v3/${channel}?api_key=${SIGNALING_API_KEY}&presence=true`
    );
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("matching");
      ws.send(JSON.stringify({ type: "presence", peerId }));
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "presence" && msg.peerId !== peerId && !lockRef.current) {
        lockRef.current = msg.peerId;
        ws.send(
          JSON.stringify({
            type: "match-accept",
            targetId: msg.peerId,
            fromId: peerId,
          })
        );
      }
      if (msg.type === "match-accept" && msg.targetId === peerId) {
        setStatus("connecting");
        initiateP2P(msg.fromId);
      }
    };
  };

  /* -------------------- PEER INIT -------------------- */
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      setStatus("generating_id");
      const stream = await initMedia();
      if (!mounted) return;

      const peer = new Peer(crypto.randomUUID(), {
        config: ICE_CONFIG,
        secure: true,
      });

      peerRef.current = peer;

      peer.on("open", (id) => {
        if (mode === "public") connectPublicSignaling(id);
      });

      peer.on("call", (call) => {
        if (!shouldInitiate(peer.id, call.peer)) {
          call.answer(stream);
          setupCallHandlers(call);
        } else {
          call.close();
        }
      });

      peer.on("connection", (conn) => {
        if (!shouldInitiate(peer.id, conn.peer)) {
          setupDataHandlers(conn);
        } else {
          conn.close();
        }
      });
    };

    init();
    return () => {
      mounted = false;
      cleanup();
      peerRef.current?.destroy();
      localStream?.getTracks().forEach((t) => t.stop());
    };
  }, [region, mode]);

  /* -------------------- PUBLIC API -------------------- */
  const sendMessage = (text: string) => {
    connRef.current?.open && connRef.current.send({ type: "chat", text });
  };

  const sendReaction = (value: ReactionType) => {
    connRef.current?.open &&
      connRef.current.send({ type: "reaction", value });
  };

  const revealIdentity = () => {
    if (!user || !connRef.current?.open) return;
    connRef.current.send({
      type: "identity",
      uid: user.uid,
      displayName: user.displayName,
    });
  };
const toggleMute = useCallback(() => {
  if (!localStream) return;

  const audioTrack = localStream.getAudioTracks()[0];
  if (!audioTrack) return;

  audioTrack.enabled = !audioTrack.enabled;
  setIsMuted(!audioTrack.enabled);
}, [localStream]);

const toggleVideo = useCallback(() => {
  if (!localStream) return;

  const videoTrack = localStream.getVideoTracks()[0];
  if (!videoTrack) return;

  videoTrack.enabled = !videoTrack.enabled;
  setIsVideoOff(!videoTrack.enabled);
}, [localStream]);

return {
  status,
  localStream,
  remoteStream,
  remotePeerId,

  // messaging
  sendMessage,
  sendReaction,

  // identity
  revealIdentity,

  // controls (RESTORED)
  isMuted,
  isVideoOff,
  toggleMute,
  toggleVideo,
  skip,
  cleanup,
};
};
