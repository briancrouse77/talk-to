import express from 'express';
import { randomUUID } from 'crypto';
import { roomQueries } from '../db.js';
import { sessions, onlineUsers } from '../index.js';

const router = express.Router();

function getSession(req) {
  const sessionId = req.cookies?.session || req.headers['x-session-id'];
  return sessions.get(sessionId);
}

// GET /api/rooms — list all rooms
router.get('/', (_, res) => {
  const rooms = roomQueries.all.all();
  res.json(rooms);
});

// GET /api/rooms/:id/messages — recent messages in a room
router.get('/:id/messages', (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  const messages = roomQueries.recentMessages.all(req.params.id).reverse();
  res.json(messages);
});

// POST /api/rooms — create a new room
router.post('/', (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  const { name, description } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Room name is required' });

  const existing = roomQueries.findByName.get(name.trim());
  if (existing) return res.status(409).json({ error: 'A room with that name already exists' });

  const id = randomUUID();
  roomQueries.create.run(id, name.trim(), description?.trim() || '');
  res.json({ id, name: name.trim(), description: description?.trim() || '' });
});

export default router;
