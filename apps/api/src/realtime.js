// Live campaign progress over Socket.IO. Each socket joins its organisation's
// room; campaign updates (from the dialer, possibly in another process via
// Redis) are forwarded there. The app falls back to polling if this fails.
import { Server } from 'socket.io';
import { verifyAccessToken } from './services/tokens.js';
import { subscribe } from './lib/events.js';

export function attachRealtime(httpServer) {
  const io = new Server(httpServer, { path: '/socket.io', cors: { origin: false } });

  io.use((socket, next) => {
    try {
      const p = verifyAccessToken(socket.handshake.auth?.token);
      socket.data.user = { id: p.sub, orgId: p.org, role: p.role };
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`org:${socket.data.user.orgId}`);
  });

  subscribe((msg) => {
    if (msg.type === 'campaign.updated' && msg.payload?.orgId) {
      io.to(`org:${msg.payload.orgId}`).emit('campaign:update', msg.payload.campaign);
    }
  });

  return io;
}
