
# YOLO: Production WebRTC Architecture

## 1. The Signaling Phase (WSS)
WebRTC cannot find peers on its own. Production signaling requires:
- **WebSocket (wss://)**: Encrypted, bidirectional communication.
- **Protocol**: JSON messages for `offer`, `answer`, and `ice-candidate`.
- **Identity**: Map Socket IDs to Session IDs in Redis.

## 2. ICE Traversal (NAT Bypass)
Standard home routers use NAT. 
- **STUN (80% of cases)**: Asks a server "What is my public IP?". 
- **TURN (20% of cases)**: When STUN fails (Symmetric NAT), the TURN server acts as a proxy. 
- **Recommendation**: Deploy 3x global TURN nodes (US, EU, ASIA) via CoTurn on AWS/GCP.

## 3. Production Connectivity Checklist

### Network
- [ ] **HTTPS Only**: `getUserMedia` and WebRTC are disabled on insecure origins.
- [ ] **TURN Servers**: Configured with short-lived credentials (TTL).
- [ ] **UDP Ports**: Ensure ports 49152–65535 are open on your TURN server.

### Signaling
- [ ] **Candidate Trickling**: Send candidates as they are generated; do not wait for the SDP.
- [ ] **Perfect Negotiation**: Implement a "polite/impolite" peer logic to handle simultaneous offers (Glare).

### Privacy & Security
- [ ] **IP Leakage**: Use `iceTransportPolicy: 'relay'` if you want to completely hide user IP addresses from peers (at the cost of server bandwidth).
- [ ] **Encryption**: DTLS/SRTP is handled automatically by the browser but requires valid certs.

## 4. Debugging Tooling
- **Chrome**: `chrome://webrtc-internals`
- **Firefox**: `about:webrtc`
- **Ice Test**: Use [trickle-ice](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/) to verify your TURN credentials work.
