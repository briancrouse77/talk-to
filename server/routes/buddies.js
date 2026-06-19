import express from 'express';
import { buddyQueries, userQueries } from '../db.js';
import { sessions, onlineUsers } from '../index.js';

const router = express.Router();

function getSession(req) {
  const sessionId = req.cookies?.session || req.headers['x-session-id'];
  return sessions.get(sessionId);
}

// GET /api/buddies — list my buddies with online status
router.get('/', (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  const buddies = buddyQueries.list.all(session.userId);
  const enriched = buddies.map((b) => {
    const onlineData = onlineUsers.get(b.id);
    return {
      ...b,
      status: onlineData?.status || 'offline',
      online: !!onlineData,
      liveAwayMessage: onlineData?.awayMessage || b.away_message,
    };
  });

  res.json(enriched);
});

// POST /api/buddies — add a buddy by username
router.post('/', (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username is required' });

  const target = userQueries.findByUsername.get(username);
  if (!target) return res.status(404).json({ error: 'User not found' });

  if (target.id === session.userId) {
    return res.status(400).json({ error: 'You cannot add yourself' });
  }

  buddyQueries.add.run(session.userId, target.id);

  const onlineData = onlineUsers.get(target.id);
  res.json({
    id: target.id,
    username: target.username,
    display_name: target.display_name,
    bio: target.bio,
    avatar_color: target.avatar_color,
    avatar_emoji: target.avatar_emoji,
    away_message: target.away_message,
    status: onlineData?.status || 'offline',
    online: !!onlineData,
  });
});

// DELETE /api/buddies/:username — remove a buddy
router.delete('/:username', (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  const target = userQueries.findByUsername.get(req.params.username);
  if (!target) return res.status(404).json({ error: 'User not found' });

  buddyQueries.remove.run(session.userId, target.id);
  res.json({ ok: true });
});

export default router;
