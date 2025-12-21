
# NexusVibe: System Architecture & Security Design

NexusVibe is a production-grade anonymous video chat platform designed for massive scale and extreme privacy.

## 1. High-Level Architecture

```text
[ Clients (Web/Mobile) ]
      |
      | (HTTPS/WSS - Load Balanced)
      v
[ API Gateway / Load Balancer ]
      |
      |-------------------------------------------------------|
      |                                                       |
[ Signaling Service (Node.js/Socket.io Cluster) ]   [ Auth & Matchmaking (FastAPI/Go) ]
      |                                                       |
      | (Redis Pub/Sub)                                       | (Redis Queues)
      |-------------------------------------------------------|
      |                                                       |
[ STUN/TURN Infrastructure (Coturn/Global Relay) ]    [ Compliance & Logging (Ephemeral) ]
```

## 2. Tech Stack Justification

- **Frontend**: React + TypeScript + Tailwind CSS (SPA approach).
- **Backend Signaling**: Node.js + Socket.io.
- **Matchmaking Engine**: Redis Sorted Sets.
- **Communication**: WebRTC (p2p by default, relay via TURN if needed).

## 3. Privacy vs. Moderation Trade-off

The platform implements an **AI Safety Shield** to prevent the spread of illegal or vulgar content. 

### Data Flow for Moderation:
- **Local Capture**: Frames are sampled from the user's local video stream every 10s.
- **Anonymized Inference**: Frames are sent to the Gemini API for analysis. **No user metadata, session IDs, or IP addresses are attached to these frames.**
- **Transient Analysis**: The AI service processes the frame in-memory to check for safety violations. 
- **Zero Retention**: Frames are not stored or used for model training in a production enterprise environment (standard API data privacy).

## 4. Security Implementation

- **IP Privacy**: Use `iceTransportPolicy: 'relay'` in production to force all traffic through TURN servers.
- **Bot Protection**: Cloudflare Turnstile integration.
- **E2EE**: WebRTC media is encrypted by DTLS.
- **Abuse Control**: Gemini API Vision hooks. If the confidence of NSFW content is high, the session is terminated locally.

## 5. Scalability Strategy

- **Horizontal Scaling**: All signaling servers are stateless.
- **Global TURN**: Deploy TURN servers globally to minimize latency.
- **Cost Considerations**: TURN bandwidth is expensive. AI inference costs are optimized by sampling (1 frame per 10s).

## 6. Future Enhancements

- **Interests Tagging**: Match users based on shared hashtags.
- **AR Filters**: Privacy filters (blur background) using TensorFlow.js on the client.
