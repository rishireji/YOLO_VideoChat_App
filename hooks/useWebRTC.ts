
import { useState, useEffect, useRef, useCallback } from 'react';
import { Region, ReactionType } from '../types';

type WebRTCStatus = 'idle' | 'matching' | 'connecting' | 'connected' | 'disconnected' | 'error';

export const useWebRTC = (
  region: Region, 
  onReactionReceived?: (type: ReactionType) => void,
  onMessageReceived?: (text: string) => void
) => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<WebRTCStatus>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const reactionCallbackRef = useRef(onReactionReceived);
  const messageCallbackRef = useRef(onMessageReceived);

  useEffect(() => {
    reactionCallbackRef.current = onReactionReceived;
  }, [onReactionReceived]);

  useEffect(() => {
    messageCallbackRef.current = onMessageReceived;
  }, [onMessageReceived]);

  // STUN servers are used to bypass NAT for P2P connections
  const rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ]
  };

  const createPeerConnection = useCallback(() => {
    if (pcRef.current) pcRef.current.close();

    const pc = new RTCPeerConnection(rtcConfig);

    // Add local tracks to the peer connection
    localStreamRef.current?.getTracks().forEach(track => {
      if (localStreamRef.current) {
        pc.addTrack(track, localStreamRef.current);
      }
    });

    // Handle incoming remote streams from a real peer
    pc.ontrack = (event) => {
      console.log('[YOLO] Received remote track from peer');
      setRemoteStream(event.streams[0]);
      setStatus('connected');
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        // In production, send this to the signaling server
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        setStatus('disconnected');
        setRemoteStream(null);
      }
    };

    pcRef.current = pc;
    return pc;
  }, []);

  const initiateOffer = async () => {
    const pc = createPeerConnection();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    setStatus('connecting');
  };

  const skip = useCallback(async () => {
    console.log('[YOLO] Searching for new peer...');
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setRemoteStream(null);
    setStatus('matching');

    // Simulate Matchmaking Delay
    setTimeout(() => {
      initiateOffer();
      
      setTimeout(() => {
        setStatus('connected');
        console.log('[YOLO] Connected. Simulating chat dynamics...');
        
        // MOCK: Simulate peer occasionally sending a reaction or greeting in different languages
        const randomGreetingChance = Math.random();
        if (randomGreetingChance > 0.4) {
          setTimeout(() => {
            const greetings = [
              "Hola! ¿Cómo estás?",
              "Bonjour, enchanté!",
              "こんにちは、元気ですか？",
              "Hello there!",
              "Hallo, wie geht's?",
              "Ciao! Tutto bene?"
            ];
            const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
            messageCallbackRef.current?.(randomGreeting);
          }, 1500);
        }

        if (Math.random() > 0.6) {
          setTimeout(() => {
            const reactions: ReactionType[] = ['like', 'laugh', 'hug', 'heart', 'wow'];
            const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];
            reactionCallbackRef.current?.(randomReaction);
          }, 4000);
        }
      }, 1000);
    }, 2000 + Math.random() * 2000);
  }, [createPeerConnection]);

  useEffect(() => {
    const initMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720, frameRate: 30 },
          audio: true
        });
        setLocalStream(stream);
        localStreamRef.current = stream;
        skip();
      } catch (err) {
        console.error("[YOLO] Media access denied.", err);
        setStatus('error');
      }
    };

    initMedia();

    return () => {
      pcRef.current?.close();
      localStreamRef.current?.getTracks().forEach(track => track.stop());
    };
  }, []);

  const toggleMute = () => {
    if (localStreamRef.current) {
      const newState = !isMuted;
      localStreamRef.current.getAudioTracks().forEach(t => t.enabled = !newState);
      setIsMuted(newState);
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const newState = !isVideoOff;
      localStreamRef.current.getVideoTracks().forEach(t => t.enabled = !newState);
      setIsVideoOff(newState);
    }
  };

  const sendMessage = (text: string) => {
    console.log('[YOLO] Sending text:', text);
  };

  const sendReaction = (type: ReactionType) => {
    console.log('[YOLO] Sending reaction:', type);
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
