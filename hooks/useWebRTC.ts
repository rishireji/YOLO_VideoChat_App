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
const shouldPropose = (myId: string, remoteId: string) => {
  return myId < remoteId;
};

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
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersInRoomRef = useRef<Set<string>>(new Set());


 /* -------------------- CLEANUP -------------------- */
const cleanup = useCallback(() => {
  callRef.current?.close();
  connRef.current?.close();

  callRef.current = null;
  connRef.current = null;

  lockRef.current = null;
  setRemoteStream(null);
  setRemotePeerId(null);
  setStatus("disconnected");
}, []);
const skip = useCallback(() => {
  cleanup();

  const myId = peerRef.current?.id;
  if (myId && wsRef.current?.readyState === WebSocket.OPEN) {
    wsRef.current.send(JSON.stringify({ type: "presence", peerId: myId }));
  }

  setStatus("matching");
}, [cleanup]);


  /* -------------------- MEDIA -------------------- */
  const initMedia = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    setLocalStream(stream);
    localStreamRef.current = stream;
    return stream;
  };

  /* -------------------- P2P SETUP -------------------- */
  const setupCallHandlers = (call: MediaConnection) => {
    call.on("stream", (stream) => {
      console.log("[WEBRTC] stream received");
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
  const peer = peerRef.current;
  const stream = localStreamRef.current;

  if (!peer || !stream) return;

  if (shouldInitiate(peer.id, remoteId)) {
    console.log("[WEBRTC] calling →", remoteId);
    const call = peer.call(remoteId, stream);
    const conn = peer.connect(remoteId, { reliable: true });
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
    peersInRoomRef.current.clear();
    setStatus("matching");
    ws.send(JSON.stringify({ type: "presence", peerId }));
  };

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);

    // 1️⃣ Track peers
    if (msg.type === "presence") {
      peersInRoomRef.current.add(msg.peerId);
      return;
    }

    // 2️⃣ Exactly two peers → proposer
    if (msg.event === "system:member_joined") {
      const members = msg.data?.members ?? [];
      if (members.length !== 2) return;

      const myId = peerRef.current?.id;
      if (!myId) return;

const peers = Array.from(peersInRoomRef.current);
const remoteId = peers.find(id => id !== myId);
if (!remoteId || remoteId === myId) return;



      if (lockRef.current) return;
      if (!shouldPropose(myId, remoteId)) return;

      lockRef.current = remoteId;

      console.log("[SIGNAL] propose →", remoteId);

      ws.send(JSON.stringify({
        type: "match-propose",
        targetId: remoteId,
        fromId: myId,
      }));
       setTimeout(() => {
    if (lockRef.current === remoteId) {
      console.warn("[SIGNAL] handshake timeout");
      lockRef.current = null;
      setStatus("matching");

      const myId = peerRef.current?.id;
      if (myId && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "presence", peerId: myId }));
      }
    }
  }, 6000);
      return;
    }

    // 3️⃣ Receive proposal
    if (msg.type === "match-propose" && msg.targetId === peerRef.current?.id) {
      if (lockRef.current) return;

      lockRef.current = msg.fromId;

      console.log("[SIGNAL] accept →", msg.fromId);

      ws.send(JSON.stringify({
        type: "match-accept",
        targetId: msg.fromId,
        fromId: peerRef.current!.id,
      }));
      return;
    }

    // 4️⃣ Accepted → start WebRTC
    if (msg.type === "match-accept" && msg.targetId === peerRef.current?.id) {
      if (lockRef.current !== msg.fromId) return;

      console.log("[WEBRTC] calling →", msg.fromId);
      setStatus("connecting");
      initiateP2P(msg.fromId);
      return;
    }

    // 5️⃣ Peer left
    if (msg.event === "system:member_left") {
  console.warn("[SIGNAL] peer left");
  lockRef.current = null;
  peersInRoomRef.current.clear();
  setStatus("matching");

  const myId = peerRef.current?.id;
  if (myId && wsRef.current?.readyState === WebSocket.OPEN) {
    wsRef.current.send(JSON.stringify({ type: "presence", peerId: myId }));
  }
}
  };

ws.onclose = () => {
  lockRef.current = null;
  peersInRoomRef.current.clear();
  setStatus("matching");

  const myId = peerRef.current?.id;
  if (myId && wsRef.current?.readyState === WebSocket.OPEN) {
    wsRef.current.send(JSON.stringify({ type: "presence", peerId: myId }));
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

    // ✅ MOVE THIS INSIDE init
peer.on("call", (incoming) => {
  if (!lockRef.current || incoming.peer !== lockRef.current) {
    incoming.close();
    return;
  }

  const stream = localStreamRef.current;
  if (!stream) {
    incoming.close();
    return;
  }

  setStatus("connecting");
  incoming.answer(stream);
  setupCallHandlers(incoming);
});

    // ✅ MOVE THIS INSIDE init
 peer.on("connection", (conn) => {
  if (!lockRef.current || conn.peer !== lockRef.current) {
    conn.close();
    return;
  }

  setupDataHandlers(conn);
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
