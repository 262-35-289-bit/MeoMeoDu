import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import crypto from 'crypto';

const app = express();
app.use(cors());
app.get('/', (_req, res) => res.json({ app: 'Meo Meo Du', status: 'ok' }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_ORIGIN?.split(',') || '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 6e6
});

const rooms = new Map();
const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_MESSAGES = 100;

function cleanCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
}
function roomCodeForSocket(socket) {
  return socket.data.roomCode;
}
function roomFor(code) {
  const room = rooms.get(code);
  if (room && Date.now() - room.createdAt > ROOM_TTL_MS && room.members.size === 0) {
    rooms.delete(code);
    return null;
  }
  return room;
}
function publicMessage(msg) {
  return { id: msg.id, name: msg.name, text: msg.text, image: msg.image, time: msg.time, mine: false };
}

io.on('connection', socket => {
  socket.on('room:join', ({ code: rawCode, name, create } = {}) => {
    const code = cleanCode(rawCode);
    if (code.length < 6) return socket.emit('room:error', { message: 'Invalid room code.' });

    let room = roomFor(code);
    if (create) {
      if (room && room.members.size > 0) {
        return socket.emit('room:error', { message: 'That code is already in use. Create a new room.' });
      }
      room = { code, createdAt: Date.now(), members: new Map(), messages: [] };
      rooms.set(code, room);
    } else if (!room) {
      return socket.emit('room:error', { message: 'Room not found or expired. Ask your friend to create a new room.' });
    }

    if (room.members.size >= 2) return socket.emit('room:error', { message: 'This room already has two people.' });
    if ([...room.members.keys()].includes(socket.id)) return;
    room.members.set(socket.id, { name: String(name || 'Meo friend').slice(0, 24) });
    socket.data.roomCode = code;
    socket.join(code);
    socket.emit('room:joined', { code, count: room.members.size, messages: room.messages.map(publicMessage) });
    io.to(code).emit('room:presence', { count: room.members.size });
  });

  socket.on('chat:message', ({ code: rawCode, text, image, name } = {}) => {
    const code = cleanCode(rawCode);
    const room = rooms.get(code);
    if (!room || !room.members.has(socket.id) || room.members.size !== 2) return;
    const safeText = String(text || '').slice(0, 2000);
    const safeImage = typeof image === 'string' && image.startsWith('data:image/') && image.length <= 5 * 1024 * 1024 ? image : null;
    if (!safeText.trim() && !safeImage) return;
    const msg = {
      id: crypto.randomUUID(),
      name: String(name || room.members.get(socket.id).name).slice(0, 24),
      text: safeText, image: safeImage, time: Date.now()
    };
    room.messages.push(msg);
    if (room.messages.length > MAX_MESSAGES) room.messages.shift();
    socket.to(code).emit('chat:message', publicMessage(msg));
  });

  socket.on('call:signal', ({ code: rawCode, payload } = {}) => {
    const code = cleanCode(rawCode);
    const room = rooms.get(code);
    if (!room || !room.members.has(socket.id) || room.members.size !== 2 || !payload) return;
    const allowed = ['offer', 'answer', 'ice', 'hangup', 'decline'];
    if (!allowed.includes(payload.kind)) return;
    socket.to(code).emit('call:signal', payload);
  });

  socket.on('room:leave', ({ code: rawCode } = {}) => {
    const code = cleanCode(rawCode || roomCodeForSocket(socket));
    const room = rooms.get(code);
    if (!room) return;
    room.members.delete(socket.id);
    socket.leave(code);
    socket.data.roomCode = null;
    io.to(code).emit('room:presence', { count: room.members.size });
    if (room.members.size === 0) rooms.delete(code);
  });

  socket.on('disconnect', () => {
    const code = roomCodeForSocket(socket);
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;
    room.members.delete(socket.id);
    io.to(code).emit('room:presence', { count: room.members.size });
    if (room.members.size === 0) rooms.delete(code);
  });
});

const port = process.env.PORT || 3001;
server.listen(port, '0.0.0.0', () => console.log(`Meo Meo Du server listening on ${port}`));
