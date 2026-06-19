import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb } from './db.js';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profiles.js';
import buddyRoutes from './routes/buddies.js';
import roomRoutes from './routes/rooms.js';
import { setupSocketHandlers } from './socket/chat.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3001;

// ─── In-Memory Stores ─────────────────────────────────────────────────────────
// sessions: sessionId → { userId, username }
export const sessions = new Map();

// onlineUsers: userId → { socketId, username, status, awayMessage, avatarColor, avatarEmoji, displayName }
export const onlineUsers = new Map();

// ─── DB Init ──────────────────────────────────────────────────────────────────
initDb();

// ─── Express App ──────────────────────────────────────────────────────────────
const app = express();
const httpServer = createServer(app);

const ALLOWED_ORIGINS = ['http://localhost:5173', 'http://localhost:4173', 'http://localhost:3000'];

app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/buddies', buddyRoutes);
app.use('/api/rooms', roomRoutes);

// Health check
app.get('/api/health', (_, res) => res.json({ ok: true, uptime: process.uptime() }));

// ─── Socket.io ────────────────────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: { origin: ALLOWED_ORIGINS, credentials: true },
});

// Socket auth middleware — validate session cookie/header
io.use((socket, next) => {
  const sessionId =
    socket.handshake.auth?.sessionId ||
    socket.handshake.headers?.cookie
      ?.split(';')
      .find((c) => c.trim().startsWith('session='))
      ?.split('=')[1];

  const session = sessions.get(sessionId);
  if (!session) return next(new Error('Authentication required'));

  socket.user = session;
  next();
});

setupSocketHandlers(io);

// Serve built frontend assets in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
  
  // Wildcard routes to serve the proper html pages
  app.get('/app.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/app.html'));
  });
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

// ─── Start ────────────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`\n🚀 Talk To server running at http://localhost:${PORT}`);
  console.log(`   Press Ctrl+C to stop\n`);
});
