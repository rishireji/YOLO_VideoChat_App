import { useState, useEffect, useRef, useCallback } from 'react';
import { Peer, DataConnection, MediaConnection } from 'peerjs';
import { Region, ReactionType, SignalingMessage } from '../types';
import { useSession } from '../context/SessionContext';
import { useAuth } from '../context/AuthContext';

type WebRTCStatus = 'idle' | 'generating_id' | 'matching' | 'connecting' | 'connected' | 'disconnected' | 'error' | 'signaling_offline';

const SIGNALING_API_KEY = 'PJ5tqEc0E390uQ7Tdot6trHD9XJ5tRclV7gnAV3r';
const PIESOCKET_CLUSTER = 's15607.nyc1.piesocket.com';

const REGION_CHANNEL_MAP: Record<Region, string> = {
  'global': 'yolo_v24_gl',
  'us-east': 'yolo_v24_na_e',
  'us-west': 'yolo_v24_na_w',
  'europe': 'yolo_v24_eu',
  'asia': 'yolo_v24_as',
  'south-america': 'yolo_v24_sa',
  'africa': 'yolo_v24_af',
  'oceania': 'yolo_v24_oc'
};

const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
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
  const { user } = useAuth();
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [status, setStatusState] = useState<WebRTCStatus>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [remotePeerId, setRemotePeerId] = useState<string | null>(null);
  
  const peerRef = useRef<Peer | null>(null);
  const callRef = useRef<MediaConnection | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  
  const proposalIntervalRef = useRef<any>(null);
  const handshakeTimeoutRef = useRef<any>(null);
  const blacklistRef = useRef<Set<string>>(new Set());
  const lockRef = useRef<string | null>(null); 
  const isClosingRef = useRef(false);

  const updateStatus = useCallback((newStatus: WebRTCStatus) => {
    setStatusState(newStatus);
  }, []);

  const broadcast = useCallback((payload: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
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
    setRemotePeerId(null);
    stopProposal();
    if (callRef.current) { callRef.current.close(); callRef.current = null; }
    if (connRef.current) { connRef.current.close(); connRef.current = null; }
    setRemoteStream(null);
  }, [stopProposal]);

  const skip = useCallback((shouldBlacklist: boolean = false) => {
    if (shouldBlacklist && lockRef.current) {
      const target = lockRef.current;
      blacklistRef.current.add(target);
      setTimeout(() => blacklistRef.current.delete(target), 30000);
    }
    cleanup();
    updateStatus('matching');
    broadcast({ type: 'presence', peerId: peerRef.current?.id, status: 'matching' });
  }, [cleanup, updateStatus, broadcast]);

  const setupCallHandlers = useCallback((call: MediaConnection) => {
    call.on('stream', (remote) => {
      stopProposal(); 
      setRemoteStream(remote);
      setRemotePeerId(call.peer);
      updateStatus('connected');
    });
    call.on('close', () => skip(false));
    call.on('error', () => skip(true));
    callRef.current = call;
  }, [skip, stopProposal, updateStatus]);

  const setupDataHandlers = useCallback((conn: DataConnection) => {
    conn.on('data', (data: any) => {
      if (data.type === 'chat') onMessageReceived?.(data.text);
      if (data.type === 'reaction') onReactionReceived?.(data.value);
    });
    conn.on('close', () => skip(false));
    conn.on('error', () => skip(false));
    connRef.current = conn;
  }, [skip, onMessageReceived, onReactionReceived]);

  const initiateP2P = useCallback((remoteId: string, stream: MediaStream) => {
    updateStatus('connecting');
    setTimeout(() => {
      if (!peerRef.current || peerRef.current.destroyed) return;
      try {
        const call = peerRef.current.call(remoteId, stream);
        const conn = peerRef.current.connect(remoteId, { reliable: true });
        if (call) setupCallHandlers(call);
        if (conn) setupDataHandlers(conn);
      } catch (err) {
        skip(true);
      }
    }, 200);
  }, [setupCallHandlers, setupDataHandlers, skip, updateStatus]);

  const connectSignaling = useCallback((myId: string, stream: MediaStream) => {
    if (isClosingRef.current) return;
    const channel = REGION_CHANNEL_MAP[region] || REGION_CHANNEL_MAP.global;
    const endpoint = `wss://${PIESOCKET_CLUSTER}/v3/${channel}?api_key=${SIGNALING_API_KEY}&notify_self=1&presence=true`;
    const ws = new WebSocket(endpoint);
    wsRef.current = ws;
    ws.onopen = () => {
      updateStatus('matching');
      broadcast({ type: 'presence', peerId: myId, status: 'matching' });
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'presence' && msg.peerId !== myId) {
          if (!lockRef.current && !blacklistRef.current.has(msg.peerId)) {
            lockRef.current = msg.peerId;
            const attemptProposal = () => broadcast({ type: 'match-propose', targetId: msg.peerId, fromId: myId });
            stopProposal();
            attemptProposal();
            proposalIntervalRef.current = setInterval(attemptProposal, 1500);
            handshakeTimeoutRef.current = setTimeout(() => { if (lockRef.current === msg.peerId) skip(true); }, 6000);
          }
        }
        if (msg.type === 'match-propose' && msg.targetId === myId) {
          if (!lockRef.current) {
            lockRef.current = msg.fromId;
            updateStatus('connecting');
            broadcast({ type: 'match-accept', targetId: msg.fromId, fromId: myId });
          }
        }
        if (msg.type === 'match-accept' && msg.targetId === myId) {
          if (lockRef.current === msg.fromId) {
            stopProposal();
            initiateP2P(msg.fromId, stream);
          }
        }
        if (msg.event === 'system:member_left' && lockRef.current) skip(false);
      } catch (err) {}
    };
    ws.onclose = () => { if (!isClosingRef.current) { updateStatus('signaling_offline'); setTimeout(() => connectSignaling(myId, stream), 3000); } };
    ws.onerror = () => ws.close();
  }, [region, broadcast, initiateP2P, skip, stopProposal, updateStatus]);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      if (!session?.id) return;
      updateStatus('generating_id');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: true });
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }
        setLocalStream(stream);
        
        // Inject Firebase UID into Peer ID: yolo_[FIREBASE_UID]_[RANDOM_SUFFIX]
        const idPrefix = user ? `yolo_${user.uid}` : `yolo_${session.id.substring(0,6)}`;
        const uniqueId = `${idPrefix}_${Math.random().toString(36).substring(7)}`;
        
        const peer = new Peer(uniqueId, { debug: 1, config: ICE_CONFIG, secure: true });
        peerRef.current = peer;
        peer.on('open', (id) => { if (mounted) connectSignaling(id, stream); });
        peer.on('call', (incoming) => { if (lockRef.current && incoming.peer === lockRef.current) { stopProposal(); updateStatus('connecting'); incoming.answer(stream); setupCallHandlers(incoming); } else incoming.close(); });
        peer.on('connection', (conn) => { if (lockRef.current && conn.peer === lockRef.current) setupDataHandlers(conn); });
        peer.on('error', (err) => { if (['peer-unavailable', 'network', 'webrtc'].includes(err.type)) skip(true); });
      } catch (err) { if (mounted) updateStatus('error'); }
    };
    init();
    return () => { mounted = false; isClosingRef.current = true; cleanup(); if (peerRef.current) peerRef.current.destroy(); if (wsRef.current) wsRef.current.close(); if (localStream) localStream.getTracks().forEach(t => t.stop()); };
  }, [session?.id, user, cleanup, connectSignaling, setupCallHandlers, setupDataHandlers, skip, stopProposal, updateStatus]);

  const toggleMute = useCallback(() => { if (localStream) { const audioTrack = localStream.getAudioTracks()[0]; if (audioTrack) audioTrack.enabled = !audioTrack.enabled; setIsMuted(!audioTrack?.enabled); } }, [localStream]);
  const toggleVideo = useCallback(() => { if (localStream) { const videoTrack = localStream.getVideoTracks()[0]; if (videoTrack) videoTrack.enabled = !videoTrack.enabled; setIsVideoOff(!videoTrack?.enabled); } }, [localStream]);

  return {
    localStream, remoteStream, status, isMuted, isVideoOff, toggleMute, toggleVideo, remotePeerId,
    sendMessage: (text: string) => { if (connRef.current?.open) connRef.current.send({ type: 'chat', text }); },
    sendReaction: (value: ReactionType) => { if (connRef.current?.open) connRef.current.send({ type: 'reaction', value }); },
    skip: () => skip(false), 
  };
};