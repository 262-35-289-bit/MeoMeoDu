# Meo Meo Du 🐾

A responsive private two-person chat-room starter project with secret codes, emoji, image sharing, and a WebRTC voice-call prototype.

## What is included
- Responsive React/Vite frontend for phone and desktop
- Create a private room and generate a random secret code
- Join an existing room with its code
- Server-side two-person room limit
- Real-time text messages and emoji picker
- Image sharing (frontend limit: 3.5 MB per image to fit Socket.IO payload limits)
- Download/open shared image
- Voice-call signaling using Socket.IO + WebRTC (microphone mute and hang up)
- Incoming-call vibration attempt on supported browsers/devices
- Basic room cleanup when both people leave; empty rooms are ephemeral
- In-memory backend, so active rooms/messages are not durable and reset if the server restarts

## Requirements
- Node.js 20 or newer recommended
- Internet connection for installing dependencies
- HTTPS in production is required for microphone access on phones (localhost works for development)

## Run locally

### 1) Start the backend
Open a terminal:
```bash
cd server
npm install
npm start
```
Backend health check: `http://localhost:3001/`

### 2) Start the frontend
Open a second terminal in the project root:
```bash
npm install
```
Create `.env.local` in the project root:
```env
VITE_SERVER_URL=http://localhost:3001
```
Then run:
```bash
npm run dev
```
Open the local URL Vite prints, usually `http://localhost:5173`.

## Testing across a phone and PC
Both devices need to reach the same backend and frontend URLs. `localhost` on a phone means the phone itself, not your PC. For same Wi-Fi testing, use your PC's local LAN IP for `VITE_SERVER_URL`, and open Vite using the PC LAN IP. Allow the ports through your firewall if prompted. For use over the internet, deploy frontend and backend separately and set `VITE_SERVER_URL` to the deployed backend HTTPS URL, then rebuild/redeploy the frontend.

## Deploying
- Frontend: deploy the project root as a Vite app; build command `npm run build`, output folder `dist`.
- Backend: deploy the `server` folder as a Node service; start command `npm start`.
- Set backend `CLIENT_ORIGIN` to the deployed frontend origin(s), comma-separated. If omitted, CORS allows any origin; set it for production.
- Set frontend `VITE_SERVER_URL` to the backend HTTPS origin. Vite environment values are baked into the frontend build, so rebuild after changing it.

## Important limitations / security notes
- This is a starter MVP, not a fully audited production messaging app.
- The room code is an invitation secret, not user authentication. Anyone who gets the code may try to join while a seat is free.
- Rooms and messages live in server memory; restart loses them. No persistent database or durable image storage is configured.
- Image data travels through the server and is not end-to-end encrypted. For production, use object storage with private access and upload validation.
- WebRTC uses a public STUN server only. Some mobile/carrier/corporate networks need a TURN server for reliable calls; add a managed TURN service for production reliability.
- Browser vibration is not guaranteed, especially when a tab is backgrounded, the browser is closed, or on iOS.
- For reliable incoming calls when the app is closed, you need push notifications and/or a native app.
- Add rate limits, abuse reporting, secure room-code handling, HTTPS, monitoring, and privacy terms before public launch.
