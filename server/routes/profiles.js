import express from 'express';
import { userQueries } from '../db.js';
import { sessions, onlineUsers } from '../index.js';

const router = express.Router();

function getSession(req) {
  const sessionId = req.cookies?.session || req.headers['x-session-id'];
  return sessions.get(sessionId);
}

// GET /api/profile/:username
router.get('/:username', (req, res) => {
  const user = userQueries.findByUsername.get(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const online = onlineUsers.has(user.id);
  const onlineData = onlineUsers.get(user.id);

  res.json({
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    bio: user.bio,
    away_message: onlineData?.awayMessage || user.away_message,
    avatar_color: user.avatar_color,
    avatar_emoji: user.avatar_emoji,
    status: onlineData?.status || 'offline',
    online,
  });
});

// PUT /api/profile
router.put('/', (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  const { display_name, bio, away_message, avatar_color, avatar_emoji } = req.body;
  const user = userQueries.findById.get(session.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  userQueries.updateProfile.run(
    display_name || user.display_name,
    bio || user.bio,
    away_message || user.away_message,
    avatar_color || user.avatar_color,
    avatar_emoji || user.avatar_emoji,
    session.userId
  );

  res.json({ ok: true });
});

// GET /api/profile/search/:query
router.get('/search/:query', (req, res) => {
  const results = userQueries.searchByUsername.all(`%${req.params.query}%`);
  res.json(results);
});

export default router;
