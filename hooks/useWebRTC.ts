
import { useState, useEffect, useRef, useCallback } from 'react';
import { Region, ReactionType, SignalingMessage } from '../types';
import { useSession } from '../context/SessionContext';

type WebRTCStatus = 'idle' | 'matching' | 'connecting' | 'connected' | 'disconnected' | 'error';

/**
 * PRODUCTION NOTE:
 * In a real environment, BroadcastChannel is replaced by a WebSocket (wss://) connection.
 * BroadcastChannel allows testing P2P between two tabs on the same machine/browser.
 */
const signalingChannel = new BroadcastChannel('yolo_signaling_v1');

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
  
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const remoteUserIdRef = useRef<string | null>(null);
  const iceCandidatesQueue = useRef<RTCIceCandidateInit[]>([]);

  // RTC Configuration for Production
  // 1. STUN: Helps find public IP.
  // 2. TURN: RELAYS data if P2P is blocked by firewall.
  const getRTCConfig = (): RTCConfiguration => ({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      // PRODUCTION: You MUST use a paid TURN service like Twilio, Xirsys, or self-hosted CoTurn
      // {
      //   urls: 'turn:your-turn-server.com:3478',
      //   username: 'user',
      //   credential: 'password'
      // }
    ],
    // Force relay for privacy/debugging if needed:
    // iceTransportPolicy: 'relay', 
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
  });

  const createPeerConnection = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
    }

    const pc = new RTCPeerConnection(getRTCConfig());

    // Connection State Logging (Vital for Production Debugging)
    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE State: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'connected') setStatus('connected');
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        cleanup();
        setStatus('disconnected');
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Peer Connection State: ${pc.connectionState}`);
    };

    // Candidate Gathering
    pc.onicecandidate = (event) => {
      if (event.candidate && remoteUserIdRef.current) {
        console.log('[WebRTC] Found local ICE candidate, sending to peer...');
        signalingChannel.postMessage({
          type: 'candidate',
          senderId: session?.id,
          targetId: remoteUserIdRef.current,
          candidate: event.candidate.toJSON()
        } as SignalingMessage);
      }
    };

    // Track Handling (Receiver)
    pc.ontrack = (event) => {
      console.log('[WebRTC] Received remote media track');
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
      }
    };

    // Add Local Tracks (Sender)
    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });
    }

    pcRef.current = pc;
    return pc;
  }, [localStream, session?.id]);

  const cleanup = () => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setRemoteStream(null);
    remoteUserIdRef.current = null;
    iceCandidatesQueue.current = [];
  };

  // Skip / Matchmaking Logic
  const skip = useCallback(async () => {
    cleanup();
    setStatus('matching');
    
    // Simulate announcing presence to a signaling server
    console.log('[WebRTC] Searching for peers in region:', region);
    
    // In a real app, this delay would be the time taken for the server to pair you
    setTimeout(() => {
      // Mock "I found someone" signal
      signalingChannel.postMessage({
        type: 'match_found',
        senderId: session?.id
      } as SignalingMessage);
    }, 1500);
  }, [region, session?.id]);

  // Signaling Receiver
  useEffect(() => {
    const handleSignaling = async (e: MessageEvent<SignalingMessage>) => {
      const msg = e.data;
      if (msg.senderId === session?.id) return; // Ignore own messages

      console.log(`[Signaling] Received: ${msg.type} from ${msg.senderId}`);

      switch (msg.type) {
        case 'match_found':
          // Conflict Resolution: Lower ID initiates the offer
          if (!remoteUserIdRef.current && session?.id && session.id < msg.senderId) {
            console.log('[WebRTC] Initiating offer...');
            remoteUserIdRef.current = msg.senderId;
            const pc = createPeerConnection();
            setStatus('connecting');
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            
            signalingChannel.postMessage({
              type: 'offer',
              senderId: session.id,
              targetId: msg.senderId,
              sdp: offer
            } as SignalingMessage);
          }
          break;

        case 'offer':
          if (msg.targetId === session?.id) {
            console.log('[WebRTC] Handling offer, sending answer...');
            remoteUserIdRef.current = msg.senderId;
            const pc = createPeerConnection();
            setStatus('connecting');
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp!));
            
            // Process queued candidates
            while (iceCandidatesQueue.current.length > 0) {
              const cand = iceCandidatesQueue.current.shift();
              if (cand) await pc.addIceCandidate(new RTCIceCandidate(cand));
            }

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            signalingChannel.postMessage({
              type: 'answer',
              senderId: session.id,
              targetId: msg.senderId,
              sdp: answer
            } as SignalingMessage);
          }
          break;

        case 'answer':
          if (msg.targetId === session?.id && pcRef.current) {
            console.log('[WebRTC] Finalizing SDP handshake (Answer received)');
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.sdp!));
            
            while (iceCandidatesQueue.current.length > 0) {
              const cand = iceCandidatesQueue.current.shift();
              if (cand) await pcRef.current.addIceCandidate(new RTCIceCandidate(cand));
            }
          }
          break;

        case 'candidate':
          if (msg.targetId === session?.id) {
            if (pcRef.current && pcRef.current.remoteDescription) {
              await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate!));
            } else {
              // Remote description not set yet, queue the candidate
              iceCandidatesQueue.current.push(msg.candidate!);
            }
          }
          break;
      }
    };

    signalingChannel.addEventListener('message', handleSignaling);
    return () => signalingChannel.removeEventListener('message', handleSignaling);
  }, [session?.id, createPeerConnection]);

  // Initial Media Access
  useEffect(() => {
    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720, frameRate: 30 },
          audio: true
        });
        setLocalStream(stream);
        // Start matchmaking after media is ready
        setTimeout(skip, 1000); 
      } catch (err) {
        console.error("[WebRTC] Fatal: Failed to access media.", err);
        setStatus('error');
      }
    };
    init();

    return () => {
      cleanup();
      localStream?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const toggleMute = () => {
    if (localStream) {
      const track = localStream.getAudioTracks()[0];
      if (track) {
        track.enabled = isMuted;
        setIsMuted(!isMuted);
      }
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const track = localStream.getVideoTracks()[0];
      if (track) {
        track.enabled = isVideoOff;
        setIsVideoOff(!isVideoOff);
      }
    }
  };

  const sendMessage = (text: string) => {
    // In production, send via data channel or signaling socket
    console.log('[DataChannel] Sending message:', text);
  };

  const sendReaction = (type: ReactionType) => {
    console.log('[DataChannel] Sending reaction:', type);
  };

  return {
    localStream,
    remoteStream,
    status,
    sendMessage,
    sendReaction,
    skip,
    isMuted,
    isVideoOff,
    toggleMute,
    toggleVideo
  };
};
