import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import {
  Cat, LockKeyhole, Users, MessageCircle, ImagePlus, Download, Phone,
  PhoneOff, Mic, MicOff, Copy, Check, ArrowLeft, Send, Smile, ShieldCheck,
  Sparkles, LogOut, Wifi, WifiOff, X, Volume2, VolumeX
} from 'lucide-react';
import './style.css';

const EMOJIS = ['❤️','😘','😂','🥹','😍','🥰','😊','😭','😎','🤗','👍','👎','🔥','✨','💖','💕','🙈','😻','🎉','💋'];
const API_URL = import.meta.env.VITE_SERVER_URL || '';

function App() {
  const [screen, setScreen] = useState('home');
  const [codeInput, setCodeInput] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [name, setName] = useState(localStorage.getItem('meo_name') || '');
  const [draftName, setDraftName] = useState(localStorage.getItem('meo_name') || '');
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [connected, setConnected] = useState(false);
  const [peerCount, setPeerCount] = useState(1);
  const [socket, setSocket] = useState(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [callState, setCallState] = useState('idle');
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [callSeconds, setCallSeconds] = useState(0);
  const [incoming, setIncoming] = useState(false);
  const [remoteStream, setRemoteStream] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [isDemo, setIsDemo] = useState(false);
  const [vibrationSupported, setVibrationSupported] = useState(false);
  const messagesEnd = useRef(null);
  const fileRef = useRef(null);
  const peerRef = useRef(null);
  const pendingIceRef = useRef([]);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const socketRef = useRef(null);
  const incomingToneRef = useRef(null);
  const ringtoneTimerRef = useRef(null);

  useEffect(() => {
    setVibrationSupported(typeof navigator !== 'undefined' && 'vibrate' in navigator);
  }, []);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  useEffect(() => {
    if (callState === 'active') {
      const timer = setInterval(() => setCallSeconds(s => s + 1), 1000);
      return () => clearInterval(timer);
    }
  }, [callState]);

  useEffect(() => {
    if (remoteAudioRef.current && remoteStream) remoteAudioRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  function flash(text) {
    setNotice(text);
    window.clearTimeout(flash.timer);
    flash.timer = window.setTimeout(() => setNotice(''), 3200);
  }

  function makeCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    for (const b of bytes) out += alphabet[b % alphabet.length];
    return `${out.slice(0,4)}-${out.slice(4)}`;
  }

  async function createRoom() {
    const cleanName = draftName.trim() || 'Meo friend';
    localStorage.setItem('meo_name', cleanName);
    setName(cleanName);
    const code = makeCode();
    setRoomCode(code);
    setMessages([]);
    setScreen('room');
    setPeerCount(1);
    await joinRoom(code, cleanName, true);
  }

  async function joinExistingRoom() {
    const code = codeInput.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 6) return flash('Please enter a valid secret code.');
    const cleanName = draftName.trim() || 'Meo friend';
    localStorage.setItem('meo_name', cleanName);
    setName(cleanName);
    const normalized = code.length === 8 ? `${code.slice(0,4)}-${code.slice(4)}` : code;
    setRoomCode(normalized);
    setMessages([]);
    setScreen('room');
    await joinRoom(normalized, cleanName, false);
  }

  async function joinRoom(code, username, creating) {
    if (!API_URL) {
      setIsDemo(true);
      setConnected(true);
      setPeerCount(1);
      setMessages([{
        id: crypto.randomUUID(), system: true,
        text: creating
          ? 'Your room is ready. To chat across devices, connect the backend server first.'
          : 'Demo mode: this code is not checked by a live server yet. Connect the backend to join rooms across devices.',
        time: Date.now()
      }]);
      return;
    }
    setBusy(true);
    try {
      let shouldCreate = creating;
      const s = io(API_URL, { transports: ['websocket', 'polling'], timeout: 10000 });
      socketRef.current = s;
      setSocket(s);
      s.on('connect', () => s.emit('room:join', { code, name: username, create: shouldCreate }));
      s.on('room:joined', data => {
        shouldCreate = false;
        setConnected(true);
        setIsDemo(false);
        setPeerCount(data.count || 1);
        if (data.messages) setMessages(data.messages);
        flash('You are in your private room.');
      });
      s.on('room:error', data => {
        flash(data?.message || 'Could not join this room.');
        setConnected(false);
        s.disconnect();
        if (socketRef.current === s) {
          socketRef.current = null;
          setSocket(null);
        }
        setRoomCode('');
        setMessages([]);
        setScreen('home');
      });
      s.on('room:presence', data => {
        setPeerCount(data.count || 1);
        if (data.count === 2) flash('Your friend joined the room 💖');
      });
      s.on('chat:message', msg => setMessages(prev => [...prev, msg]));
      s.on('call:signal', async payload => {
        if (payload.kind === 'offer') {
          setIncoming(true);
          startVibration();
          window.__meoOffer = payload.offer;
        } else if (payload.kind === 'answer' && peerRef.current) {
          await peerRef.current.setRemoteDescription(new RTCSessionDescription(payload.answer));
          for (const candidate of pendingIceRef.current) {
            try { await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
          }
          pendingIceRef.current = [];
          setCallState('active');
        } else if (payload.kind === 'ice' && payload.candidate) {
          const pc = peerRef.current;
          if (!pc || !pc.remoteDescription) {
            pendingIceRef.current.push(payload.candidate);
          } else {
            try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)); } catch {}
          }
        } else if (payload.kind === 'hangup') {
          cleanupCall(false);
          flash('Call ended.');
        } else if (payload.kind === 'decline') {
          cleanupCall(false);
          flash('Call was declined.');
        }
      });
      s.on('disconnect', () => {
        setConnected(false);
        setPeerCount(0);
      });
      s.on('connect_error', () => flash('Server connection failed. Check backend setup.'));
    } catch {
      flash('Could not connect to the server.');
    } finally {
      setBusy(false);
    }
  }

  function startVibration() {
    if ('vibrate' in navigator) navigator.vibrate([250, 150, 250, 150, 500]);
  }

  function stopVibration() {
    if ('vibrate' in navigator) navigator.vibrate(0);
    clearInterval(ringtoneTimerRef.current);
  }

  function sendMessage(text = message, image = null) {
    const value = text.trim();
    if (!value && !image) return;
    if (!connected || peerCount < 2) {
      flash('Wait until your friend joins the room.');
      return;
    }
    const msg = {
      id: crypto.randomUUID(), name, text: value, image,
      time: Date.now(), mine: true
    };
    if (isDemo) {
      setMessages(prev => [...prev, msg]);
    } else {
      socketRef.current?.emit('chat:message', { code: roomCode, text: value, image, name });
      setMessages(prev => [...prev, msg]);
    }
    setMessage('');
    setEmojiOpen(false);
  }

  async function sendPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return flash('Please select an image file.');
    if (file.size > 3.5 * 1024 * 1024) return flash('Please choose an image under 3.5 MB for reliable sending.');
    const reader = new FileReader();
    reader.onload = () => sendMessage('', String(reader.result));
    reader.readAsDataURL(file);
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      flash(`Your code is ${roomCode}`);
    }
  }

  async function setupPeer() {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    peerRef.current = pc;
    pc.onicecandidate = event => {
      if (event.candidate) socketRef.current?.emit('call:signal', {
        code: roomCode, payload: { kind: 'ice', candidate: event.candidate }
      });
    };
    pc.ontrack = event => {
      const stream = event.streams[0];
      setRemoteStream(stream);
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = stream;
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setCallState('active');
      // A disconnected connection can recover on its own; a failed one cannot.
      if (pc.connectionState === 'failed' && peerRef.current === pc) {
        cleanupCall(true);
        flash('Call connection failed. Try calling again or use a different network.');
      }
    };
    return pc;
  }

  async function startCall() {
    if (incoming || callState !== 'idle') {
      flash('A call is already in progress.');
      return;
    }
    if (peerCount < 2 || !connected || isDemo) {
      flash(isDemo ? 'Voice call needs a connected backend server.' : 'Your friend must join first.');
      return;
    }
    try {
      pendingIceRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      setLocalStream(stream);
      const pc = await setupPeer();
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current?.emit('call:signal', { code: roomCode, payload: { kind: 'offer', offer } });
      setCallState('calling');
      flash('Calling your friend…');
    } catch (e) {
      cleanupCall(false);
      flash(e.name === 'NotAllowedError' ? 'Allow microphone permission to make a call.' : 'Could not start call. Use HTTPS and check microphone.');
    }
  }

  async function acceptCall() {
    stopVibration();
    setIncoming(false);
    setCallState('connecting');
    try {
      const offer = window.__meoOffer;
      if (!offer) throw new Error('Call offer expired');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      setLocalStream(stream);
      const pc = await setupPeer();
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      delete window.__meoOffer;
      for (const candidate of pendingIceRef.current) {
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
      }
      pendingIceRef.current = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketRef.current?.emit('call:signal', { code: roomCode, payload: { kind: 'answer', answer } });
      setCallState('active');
      setCallSeconds(0);
    } catch {
      cleanupCall(false);
      flash('Could not answer. Allow microphone permission and try again.');
    }
  }

  function declineCall() {
    stopVibration();
    setIncoming(false);
    socketRef.current?.emit('call:signal', { code: roomCode, payload: { kind: 'decline' } });
  }

  function cleanupCall(sendSignal = true) {
    stopVibration();
    if (sendSignal) socketRef.current?.emit('call:signal', { code: roomCode, payload: { kind: 'hangup' } });
    if (peerRef.current) { peerRef.current.ontrack = null; peerRef.current.close(); peerRef.current = null; }
    pendingIceRef.current = [];
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setIncoming(false);
    setMuted(false);
    setCallState('idle');
    setCallSeconds(0);
  }

  function toggleMute() {
    const next = !muted;
    localStreamRef.current?.getAudioTracks().forEach(track => track.enabled = !next);
    setMuted(next);
  }

  function leaveRoom() {
    cleanupCall(true);
    socketRef.current?.emit('room:leave', { code: roomCode });
    socketRef.current?.disconnect();
    socketRef.current = null;
    setSocket(null);
    setConnected(false);
    setPeerCount(1);
    setMessages([]);
    setScreen('home');
    setIsDemo(false);
    setRoomCode('');
  }

  function formatTime(ms) {
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  function formatDuration(seconds) {
    return `${Math.floor(seconds / 60).toString().padStart(2,'0')}:${(seconds % 60).toString().padStart(2,'0')}`;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => screen === 'room' ? leaveRoom() : setScreen('home')} aria-label="Meo Meo Du home">
          <span className="brand-icon"><Cat size={25}/></span>
          <span><strong>meo meo du</strong><small>little room, just us two</small></span>
        </button>
        <div className="top-safe"><ShieldCheck size={15}/> Private by design</div>
      </header>

      {screen === 'home' ? (
        <main className="home-layout">
          <section className="hero-copy">
            <div className="eyebrow"><Sparkles size={15}/> YOUR LITTLE PRIVATE SPACE</div>
            <h1>Some conversations<br/><span>are just for two.</span></h1>
            <p className="hero-sub">A cozy little room for your messages, favorite photos and voice calls. No friend list. No crowd. Just you two.</p>
            <div className="hero-points">
              <span><LockKeyhole size={16}/> Secret room code</span>
              <span><Users size={16}/> Only 2 people</span>
              <span><MessageCircle size={16}/> Live chat</span>
            </div>
            <div className="mascot-card">
              <div className="cat-art"><span className="cat-face"> ฅ^•ﻌ•^ฅ </span><span className="floating-heart">♡</span></div>
              <div><strong>A tiny room, a big feeling.</strong><p>Make a room, share your code, and say hello.</p></div>
            </div>
          </section>
          <section className="entry-card">
            <div className="card-top-icon"><LockKeyhole size={23}/></div>
            <h2>Come on in</h2>
            <p className="muted">Choose how you want to meet in your private room.</p>
            <label className="field-label" htmlFor="nickname">Your nickname</label>
            <input id="nickname" className="text-field" maxLength="24" placeholder="e.g. Noman" value={draftName} onChange={e => setDraftName(e.target.value)} />
            <button className="primary-btn" onClick={createRoom} disabled={busy}><Sparkles size={17}/> Create a private room <span>→</span></button>
            <div className="divider"><span>OR JOIN A FRIEND</span></div>
            <label className="field-label" htmlFor="secret-code">Secret room code</label>
            <input id="secret-code" className="text-field code-field" maxLength="9" placeholder="ABCD-1234" value={codeInput} onChange={e => setCodeInput(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && joinExistingRoom()} />
            <button className="secondary-btn" onClick={joinExistingRoom} disabled={busy}><LockKeyhole size={16}/> Join private room</button>
            <div className="privacy-note"><ShieldCheck size={16}/><span>Each room is designed for two people only.</span></div>
          </section>
          <div className="bottom-note">Made with <span>♥</span> for your favorite person</div>
        </main>
      ) : (
        <main className="room-layout">
          <section className="room-card">
            <div className="room-header">
              <button className="icon-btn back-btn" onClick={leaveRoom} aria-label="Leave room"><ArrowLeft size={19}/></button>
              <div className="room-avatar"><Cat size={23}/></div>
              <div className="room-heading"><h2>Your little room</h2><p><span className={`status-dot ${connected ? 'online' : ''}`}></span>{connected ? (peerCount === 2 ? 'Both of you are here' : 'Waiting for your person…') : 'Connecting…'}</p></div>
              <button className="code-chip" onClick={copyCode} title="Copy room code"><LockKeyhole size={14}/>{roomCode} {copied ? <Check size={14}/> : <Copy size={14}/>}</button>
            </div>
            {isDemo && <div className="demo-banner"><WifiOff size={15}/> Preview mode — connect the backend to chat between devices.</div>}
            <div className="room-content">
              <aside className="room-side">
                <div className="side-illustration">🐱</div>
                <h3>Just you two</h3>
                <p>Share your secret code with one person you trust.</p>
                <div className="people-status"><span className="person-dot me"></span><span>{name} <small>you</small></span><b>Here</b></div>
                <div className="people-status"><span className={`person-dot ${peerCount === 2 ? 'peer-online' : ''}`}></span><span>Your person</span><b>{peerCount === 2 ? 'Here' : 'Waiting'}</b></div>
                <button className="side-call-btn" onClick={startCall} disabled={peerCount < 2 || callState !== 'idle' || isDemo || incoming}><Phone size={16}/> Start voice call</button>
                <p className="side-hint">Keep this code private 💗</p>
              </aside>
              <section className="chat-panel">
                <div className="chat-topline"><MessageCircle size={15}/><span>your conversation</span><span className="secure-label"><LockKeyhole size={12}/> private room</span></div>
                <div className="messages" aria-live="polite">
                  <div className="day-pill">TODAY</div>
                  {messages.map(msg => (
                    <div key={msg.id} className={`message-row ${msg.system ? 'system-row' : msg.mine ? 'mine-row' : 'theirs-row'}`}>
                      {msg.system ? <div className="system-message">{msg.text}</div> : (
                        <div className={`bubble ${msg.mine ? 'mine' : 'theirs'}`}>
                          {!msg.mine && <div className="bubble-name">{msg.name || 'Your person'}</div>}
                          {msg.image && <a href={msg.image} download={`meo-photo-${msg.id}.${(msg.image.match(/^data:image\/(png|jpeg|webp|gif|bmp)/i)?.[1] || 'png').replace('jpeg','jpg')}`} className="image-wrap"><img src={msg.image} alt="Shared image"/><span><Download size={14}/> Save photo</span></a>}
                          {msg.text && <div className="bubble-text">{msg.text}</div>}
                          <div className="bubble-time">{formatTime(msg.time)} {msg.mine && <span>✓</span>}</div>
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={messagesEnd}/>
                </div>
                {callState !== 'idle' && (
                  <div className="call-banner">
                    <span className="call-pulse"><Phone size={16}/></span>
                    <div><strong>{callState === 'calling' ? 'Calling your person…' : callState === 'active' ? `Voice call · ${formatDuration(callSeconds)}` : 'Connecting call…'}</strong><small>{muted ? 'Microphone muted' : 'Your private voice call'}</small></div>
                    <button className={`call-control ${muted ? 'selected' : ''}`} onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'}>{muted ? <MicOff size={17}/> : <Mic size={17}/>}</button>
                    <button className="call-control hangup" onClick={() => cleanupCall(true)} title="End call"><PhoneOff size={17}/></button>
                  </div>
                )}
                <div className="composer-wrap">
                  {emojiOpen && <div className="emoji-tray">{EMOJIS.map(e => <button key={e} onClick={() => setMessage(m => m + e)}>{e}</button>)}</div>}
                  <div className="composer">
                    <button className="composer-icon" onClick={() => setEmojiOpen(v => !v)} aria-label="Choose emoji"><Smile size={21}/></button>
                    <input value={message} maxLength={2000} onChange={e => setMessage(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage())} placeholder={peerCount === 2 ? 'Write something sweet…' : 'Waiting for your person to join…'} disabled={peerCount < 2}/>
                    <input type="file" ref={fileRef} accept="image/*" hidden onChange={sendPhoto}/>
                    <button className="composer-icon" onClick={() => fileRef.current?.click()} aria-label="Share photo" title="Share photo"><ImagePlus size={20}/></button>
                    <button className="send-btn" onClick={() => sendMessage()} disabled={!message.trim() || peerCount < 2} aria-label="Send message"><Send size={18}/></button>
                  </div>
                  <div className="composer-foot"><span><LockKeyhole size={12}/> A private little conversation</span><span>{message.length}/2000</span></div>
                </div>
              </section>
            </div>
            <audio ref={remoteAudioRef} autoPlay playsInline />
          </section>
          <div className="room-bottom"><span>Meo Meo Du</span><span>Two seats. One little room. 🐾</span><button onClick={leaveRoom}><LogOut size={14}/> Leave room</button></div>
        </main>
      )}

      {incoming && <div className="modal-backdrop"><div className="incoming-card"><div className="incoming-avatar"><Cat size={34}/></div><p className="incoming-overline">INCOMING VOICE CALL</p><h2>Your person is calling</h2><p className="muted">Ready for a little chat?</p><div className="incoming-actions"><button className="decline-btn" onClick={declineCall}><PhoneOff size={19}/></button><button className="accept-btn" onClick={acceptCall}><Phone size={19}/></button></div><small>Tap green to answer · red to decline</small></div></div>}

      {notice && <div className="toast" role="status">{notice}</div>}
      <footer className="footer"><span>meo meo du <span className="footer-heart">♥</span></span><span>Small space, safe conversations.</span></footer>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
