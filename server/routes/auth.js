import express from 'express';
import { randomUUID, createHash } from 'crypto';
import { userQueries } from '../db.js';
import { sessions } from '../index.js';

const router = express.Router();

function hashPassword(password) {
  return createHash('sha256').update(password + 'aol-chat-salt-2024').digest('hex');
}

// POST /api/auth/register
router.post('/register', (req, res) => {
  const { username, password, email, avatarColor, avatarEmoji } = req.body;

  if (!username || !password || !email) {
    return res.status(400).json({ error: 'Username, password, and email address are required' });
  }
  if (username.length < 3 || username.length > 20) {
    return res.status(400).json({ error: 'Username must be 3–20 characters' });
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  const existing = userQueries.findByUsername.get(username);
  if (existing) {
    return res.status(409).json({ error: 'Screen name already taken' });
  }

  const existingEmail = userQueries.findByEmail.get(email);
  if (existingEmail) {
    return res.status(409).json({ error: 'Email address already registered' });
  }

  const id = randomUUID();
  const passwordHash = hashPassword(password);
  const verificationToken = randomUUID();
  const color = avatarColor || '#f5a623';
  const emoji = avatarEmoji || '😊';

  try {
    userQueries.create.run(id, username, passwordHash, email, verificationToken, username, color, emoji);

    const verifyUrl = `http://localhost:3001/api/auth/verify?token=${verificationToken}`;
    console.log(`
┌────────────────────────────────────────────────────────┐
│ 📧 MOCK EMAIL SENT                                     │
├────────────────────────────────────────────────────────┤
│ To:      ${email}                                      
│ Subject: Verify your Talk To Account                    
│ Link:    ${verifyUrl}                                  
└────────────────────────────────────────────────────────┘
    `);

    res.json({
      message: 'Verification link sent to server console!',
    });
  } catch (err) {
    console.error('Registration failed:', err);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const user = userQueries.findByUsername.get(username);
  if (!user) {
    return res.status(401).json({ error: 'Invalid screen name or password' });
  }

  const passwordHash = hashPassword(password);
  if (user.password !== passwordHash) {
    return res.status(401).json({ error: 'Invalid screen name or password' });
  }

  if (!user.is_verified) {
    return res.status(403).json({ error: 'Please verify your email address first. We printed the link to the server console!' });
  }

  const sessionId = randomUUID();
  sessions.set(sessionId, { userId: user.id, username: user.username });

  res.cookie('session', sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({
    user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      bio: user.bio,
      away_message: user.away_message,
      avatar_color: user.avatar_color,
      avatar_emoji: user.avatar_emoji,
    },
    sessionId,
  });
});

// GET /api/auth/verify
router.get('/verify', (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).send('<h1>Verification Failed</h1><p>Verification token is missing.</p>');
  }

  const user = userQueries.findByVerificationToken.get(token);
  if (!user) {
    return res.status(400).send('<h1>Verification Failed</h1><p>Invalid or expired verification token.</p>');
  }

  try {
    userQueries.verifyUser.run(token);
    res.redirect('http://localhost:5173/?verified=true');
  } catch (err) {
    console.error('Verification query failed:', err);
    res.status(500).send('<h1>Verification Failed</h1><p>Internal server error during verification.</p>');
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const sessionId = req.cookies?.session || req.headers['x-session-id'];
  if (sessionId) sessions.delete(sessionId);
  res.clearCookie('session');
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  const sessionId = req.cookies?.session || req.headers['x-session-id'];
  const session = sessions.get(sessionId);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });

  const user = userQueries.findById.get(session.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  res.json({
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    bio: user.bio,
    away_message: user.away_message,
    avatar_color: user.avatar_color,
    avatar_emoji: user.avatar_emoji,
  });
});

export default router;
