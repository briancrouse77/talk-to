import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const db = new Database(process.env.DATABASE_PATH || join(__dirname, '..', 'chat.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

initDb();

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password TEXT NOT NULL,
      email TEXT UNIQUE,
      is_verified INTEGER DEFAULT 0,
      verification_token TEXT,
      display_name TEXT,
      bio TEXT DEFAULT '',
      away_message TEXT DEFAULT 'Available',
      avatar_color TEXT DEFAULT '#f5a623',
      avatar_emoji TEXT DEFAULT '😊',
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS buddies (
      user_id TEXT NOT NULL,
      buddy_id TEXT NOT NULL,
      PRIMARY KEY (user_id, buddy_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (buddy_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      description TEXT DEFAULT '',
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Run migrations in case database tables already exist
  try {
    db.exec("ALTER TABLE users ADD COLUMN email TEXT");
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE users ADD COLUMN is_verified INTEGER DEFAULT 0");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE users ADD COLUMN verification_token TEXT");
  } catch (e) {}

  // Seed default rooms
  const seedRooms = [
    { name: 'Lobby', description: 'The main hangout spot — say hi!' },
    { name: 'Tech Talk', description: 'Geek out about all things tech' },
    { name: 'Music & Vibes', description: 'Share what you are listening to' },
    { name: 'Gaming Zone', description: 'Games, scores, and trash talk' },
    { name: 'Random', description: 'Anything goes in here' },
  ];

  const insertRoom = db.prepare(
    `INSERT OR IGNORE INTO rooms (id, name, description) VALUES (?, ?, ?)`
  );

  for (const room of seedRooms) {
    insertRoom.run(randomUUID(), room.name, room.description);
  }

  console.log('✅ Database initialized');
}

// ─── User Queries ─────────────────────────────────────────────────────────────

export const userQueries = {
  create: db.prepare(
    `INSERT INTO users (id, username, password, email, verification_token, display_name, avatar_color, avatar_emoji)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ),
  findByUsername: db.prepare(
    `SELECT * FROM users WHERE username = ? COLLATE NOCASE`
  ),
  findByEmail: db.prepare(
    `SELECT * FROM users WHERE email = ? COLLATE NOCASE`
  ),
  findById: db.prepare(`SELECT * FROM users WHERE id = ?`),
  findByVerificationToken: db.prepare(
    `SELECT * FROM users WHERE verification_token = ?`
  ),
  verifyUser: db.prepare(
    `UPDATE users SET is_verified = 1, verification_token = NULL WHERE verification_token = ?`
  ),
  updateProfile: db.prepare(
    `UPDATE users SET display_name = ?, bio = ?, away_message = ?, avatar_color = ?, avatar_emoji = ?
     WHERE id = ?`
  ),
  searchByUsername: db.prepare(
    `SELECT id, username, display_name, bio, avatar_color, avatar_emoji, away_message
     FROM users WHERE username LIKE ? COLLATE NOCASE LIMIT 10`
  ),
  publicInfo: db.prepare(
    `SELECT id, username, display_name, bio, avatar_color, avatar_emoji, away_message
     FROM users WHERE id = ?`
  ),
};

// ─── Buddy Queries ────────────────────────────────────────────────────────────

export const buddyQueries = {
  add: db.prepare(
    `INSERT OR IGNORE INTO buddies (user_id, buddy_id) VALUES (?, ?)`
  ),
  remove: db.prepare(
    `DELETE FROM buddies WHERE user_id = ? AND buddy_id = ?`
  ),
  list: db.prepare(`
    SELECT u.id, u.username, u.display_name, u.bio, u.avatar_color, u.avatar_emoji, u.away_message
    FROM buddies b
    JOIN users u ON b.buddy_id = u.id
    WHERE b.user_id = ?
  `),
  getBuddyIds: db.prepare(
    `SELECT buddy_id FROM buddies WHERE user_id = ?`
  ),
  // Get all users who have this user as a buddy (for notifying on status change)
  getWatcherIds: db.prepare(
    `SELECT user_id FROM buddies WHERE buddy_id = ?`
  ),
};

// ─── Room Queries ─────────────────────────────────────────────────────────────

export const roomQueries = {
  all: db.prepare(`SELECT * FROM rooms ORDER BY name ASC`),
  findById: db.prepare(`SELECT * FROM rooms WHERE id = ?`),
  findByName: db.prepare(`SELECT * FROM rooms WHERE name = ? COLLATE NOCASE`),
  create: db.prepare(
    `INSERT INTO rooms (id, name, description) VALUES (?, ?, ?)`
  ),
  recentMessages: db.prepare(`
    SELECT m.id, m.content, m.created_at,
           u.id as user_id, u.username, u.display_name, u.avatar_color, u.avatar_emoji
    FROM messages m
    JOIN users u ON m.user_id = u.id
    WHERE m.room_id = ?
    ORDER BY m.created_at DESC
    LIMIT 50
  `),
  insertMessage: db.prepare(
    `INSERT INTO messages (id, room_id, user_id, content) VALUES (?, ?, ?, ?)`
  ),
};
