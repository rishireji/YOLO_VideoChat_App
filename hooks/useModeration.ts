
import { useEffect, useRef } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { useSession } from '../context/SessionContext';

const MODERATION_INTERVAL = 10000; // Check every 10 seconds

export const useModeration = (stream: MediaStream | null) => {
  const { updateSession } = useSession();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!stream) return;

    // Set up hidden elements for frame capture
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.play();
    videoRef.current = video;

    const canvas = document.createElement('canvas');
    canvasRef.current = canvas;

    const checkCompliance = async () => {
      if (!videoRef.current || !canvasRef.current) return;

      const canvas = canvasRef.current;
      const video = videoRef.current;
      
      canvas.width = 320; // Low res for faster processing
      canvas.height = 180;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const base64Data = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];

      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: {
            parts: [
              {
                inlineData: {
                  data: base64Data,
                  mimeType: 'image/jpeg'
                }
              },
              {
                text: "Analyze this video frame from a random one-to-one chat. Determine if it contains nudity, sexual acts, excessive vulgarity, or graphic violence. Return your verdict in JSON format."
              }
            ]
          },
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                is_safe: { 
                  type: Type.BOOLEAN,
                  description: "True if the content is safe for public video chat, false if it contains nudity, vulgar acts, or violence."
                },
                reason: { 
                  type: Type.STRING,
                  description: "A brief reason for the safety verdict."
                }
              },
              required: ["is_safe", "reason"]
            }
          }
        });

        const result = JSON.parse(response.text);
        if (result.is_safe === false) {
          console.error("[YOLO Compliance] Violations detected:", result.reason);
          updateSession({ isModerated: true });
        }
      } catch (err) {
        console.warn("[YOLO Compliance] Analysis failed:", err);
      }
    };

    intervalRef.current = window.setInterval(checkCompliance, MODERATION_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      video.srcObject = null;
    };
  }, [stream]);
};
