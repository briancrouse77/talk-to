import './style/index.css';
import * as socket from './socket.js';
import { BuddyList } from './ui/buddy-list.js';
import { ChatRoom } from './ui/chat-room.js';
import { openIM } from './ui/im-window.js';
import { ProfileModal } from './ui/profile.js';

const API = window.location.origin;

// ─── Auth guard ───────────────────────────────────────────────────────────────
const sessionId = localStorage.getItem('sessionId');
let user = null;

try {
  user = JSON.parse(localStorage.getItem('user'));
} catch {}

if (!sessionId || !user) {
  window.location.href = '/';
}

// ─── Connect to socket ────────────────────────────────────────────────────────
socket.connect(sessionId);

// ─── App shell ────────────────────────────────────────────────────────────────
function render() {
  const avatarColor = user.avatar_color || '#f5a623';
  const avatarEmoji = user.avatar_emoji || '😊';
  const displayName = user.display_name || user.username;

  document.getElementById('app').innerHTML = `
    <div class="app-shell bg-animated bg-grid">

      <!-- Top bar -->
      <header class="topbar">
        <div class="topbar-brand">
          <span class="topbar-logo">💬</span>
          <span class="topbar-name font-brand glow-amber">Talk To</span>
        </div>

        <div class="topbar-center">
          <div class="connection-indicator" id="conn-indicator">
            <div class="status-dot online" id="conn-dot"></div>
            <span id="conn-label">Connected</span>
          </div>
        </div>

        <div class="topbar-right">
          <!-- Status selector -->
          <div class="status-selector" id="status-selector">
            <div class="status-dot online" id="my-status-dot"></div>
            <select class="status-select" id="status-select">
              <option value="online">Online</option>
              <option value="away">Away</option>
            </select>
          </div>

          <!-- My profile button -->
          <button class="topbar-avatar-btn" id="profile-btn" title="Edit Profile">
            <div class="avatar avatar-sm online" id="my-avatar" style="background:${avatarColor}">
              ${avatarEmoji}
            </div>
            <span class="topbar-username">${escapeHtml(displayName)}</span>
          </button>

          <!-- Sign off -->
          <button class="btn btn-ghost btn-sm" id="signoff-btn" title="Sign Off" data-tooltip="Sign Off">
            ⏻
          </button>
        </div>
      </header>

      <!-- Main layout -->
      <div class="app-body">

        <!-- Buddy list sidebar -->
        <aside class="buddy-sidebar" id="buddy-sidebar">
          <div id="buddy-list-container"></div>
        </aside>

        <!-- Chat area -->
        <main class="chat-main-area" id="chat-room-container"></main>
      </div>

      <!-- Away message bar (shown when away) -->
      <div class="away-bar hidden" id="away-bar">
        <span>🟡 Away:</span>
        <span id="away-message-display"></span>
        <button class="btn btn-ghost btn-sm" id="away-bar-back">Back to Online</button>
      </div>
    </div>

    <!-- IM container (floating windows) -->
    <div id="im-container"></div>

    <!-- Toast container -->
    <div id="toast-container" class="toast-container"></div>
  `;

  injectStyles();
  initComponents();
  bindTopbarEvents();
}

// ─── Initialize sub-components ────────────────────────────────────────────────
let buddyList, chatRoom, profileModal;

function initComponents() {
  buddyList = new BuddyList({
    container: document.getElementById('buddy-list-container'),
    user,
    sessionId,
    onOpenIM: (buddy) => openIM({ buddy, user, onClose: () => {} }),
    onViewProfile: (buddy) => profileModal.open(buddy),
  });

  chatRoom = new ChatRoom({
    container: document.getElementById('chat-room-container'),
    user,
    sessionId,
  });

  profileModal = new ProfileModal({
    user,
    sessionId,
    onUpdate: (updatedUser) => {
      user = updatedUser;
      // Update topbar avatar
      const myAvatar = document.getElementById('my-avatar');
      if (myAvatar) {
        myAvatar.style.background = updatedUser.avatar_color;
        myAvatar.textContent = updatedUser.avatar_emoji;
      }
      const myName = document.querySelector('.topbar-username');
      if (myName) myName.textContent = escapeHtml(updatedUser.display_name || updatedUser.username);
    },
  });
}

// ─── Topbar events ────────────────────────────────────────────────────────────
function bindTopbarEvents() {
  // Profile button
  document.getElementById('profile-btn').addEventListener('click', () => {
    profileModal.open();
  });

  // Sign off
  document.getElementById('signoff-btn').addEventListener('click', async () => {
    await fetch(`${API}/api/auth/logout`, {
      method: 'POST',
      headers: { 'x-session-id': sessionId },
      credentials: 'include',
    });
    localStorage.clear();
    socket.disconnect();
    window.location.href = '/';
  });

  // Status selector
  document.getElementById('status-select').addEventListener('change', (e) => {
    const status = e.target.value;
    const awayMsg = user.away_message || 'Away';

    socket.send('set-status', { status, awayMessage: status === 'away' ? awayMsg : 'Available' });

    const dot = document.getElementById('my-status-dot');
    if (dot) {
      dot.className = `status-dot ${status}`;
    }

    const awayBar = document.getElementById('away-bar');
    const awayDisplay = document.getElementById('away-message-display');
    if (status === 'away') {
      awayDisplay.textContent = awayMsg;
      awayBar.classList.remove('hidden');
    } else {
      awayBar.classList.add('hidden');
    }
  });

  // Back to online from away bar
  document.getElementById('away-bar-back').addEventListener('click', () => {
    document.getElementById('status-select').value = 'online';
    socket.send('set-status', { status: 'online', awayMessage: 'Available' });
    const dot = document.getElementById('my-status-dot');
    if (dot) dot.className = 'status-dot online';
    document.getElementById('away-bar').classList.add('hidden');
  });

  // Socket connection events
  socket.on('internal:connected', () => {
    const dot = document.getElementById('conn-dot');
    const label = document.getElementById('conn-label');
    if (dot) dot.className = 'status-dot online';
    if (label) label.textContent = 'Connected';
  });

  socket.on('internal:disconnected', () => {
    const dot = document.getElementById('conn-dot');
    const label = document.getElementById('conn-label');
    if (dot) dot.className = 'status-dot offline';
    if (label) label.textContent = 'Reconnecting…';
  });

  // Incoming IM — open window if not already open
  socket.on('im-message', (data) => {
    // The IM window handles its own messages; this handler is for auto-opening
    // Check if a window for this user is already open (handled in im-window.js)
    // We need to auto-open the window if not already open
    const { fromUserId, fromUsername, fromDisplayName, fromAvatarColor, fromAvatarEmoji } = data;

    // Check if IM window is open for this buddy
    const { getActiveWindows } = window.__imWindows__ || {};

    // Import dynamically to check
    import('./ui/im-window.js').then(({ getActiveWindows }) => {
      if (!getActiveWindows().has(fromUserId)) {
        // Auto-open IM window
        openIM({
          buddy: {
            id: fromUserId,
            username: fromUsername,
            display_name: fromDisplayName,
            avatar_color: fromAvatarColor,
            avatar_emoji: fromAvatarEmoji,
            status: 'online',
            online: true,
          },
          user,
          onClose: () => {},
        });
      }
    });
  });
}

// ─── Inject App styles ────────────────────────────────────────────────────────
function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    /* ─── App Shell ─────────────────────────────────── */
    html, body { height: 100%; overflow: hidden; }

    .app-shell {
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }

    /* ─── Topbar ─────────────────────────────────────── */
    .topbar {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 0 20px;
      height: 56px;
      flex-shrink: 0;
      background: rgba(13, 13, 30, 0.9);
      border-bottom: 1px solid var(--border);
      backdrop-filter: blur(20px);
      z-index: var(--z-overlay);
      position: relative;
    }

    .topbar-brand {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .topbar-logo { font-size: 1.4rem; }

    .topbar-name {
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--amber);
      letter-spacing: 0.08em;
    }

    .topbar-center {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .connection-indicator {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.78rem;
      color: var(--text-muted);
    }

    .topbar-right {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }

    .status-selector {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .status-select {
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      color: var(--text-primary);
      font-size: 0.8rem;
      padding: 4px 8px;
      cursor: pointer;
      outline: none;
    }

    .topbar-avatar-btn {
      background: none;
      border: none;
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: var(--radius-md);
      transition: background 0.15s;
    }
    .topbar-avatar-btn:hover { background: var(--bg-input); }

    .topbar-username {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-primary);
    }

    /* ─── App Body ───────────────────────────────────── */
    .app-body {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    /* ─── Buddy Sidebar ──────────────────────────────── */
    .buddy-sidebar {
      width: 240px;
      flex-shrink: 0;
      background: rgba(13, 13, 30, 0.7);
      border-right: 1px solid var(--border);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .buddy-list-panel {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .buddy-list-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 14px 10px;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }

    .buddy-list-title {
      font-size: 0.7rem;
      font-weight: 700;
      color: var(--amber);
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }

    .buddy-count {
      font-size: 0.7rem;
      color: var(--text-muted);
    }

    .buddy-add-section {
      padding: 10px 10px 8px;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .buddy-add-row {
      display: flex;
      gap: 6px;
    }

    .buddy-add-row .form-input { font-size: 0.78rem; padding: 6px 10px; }

    .buddy-list-body {
      flex: 1;
      padding: 6px 0;
    }

    .buddy-loading, .buddy-empty {
      padding: 20px 14px;
      font-size: 0.8rem;
      color: var(--text-muted);
      text-align: center;
      line-height: 1.6;
    }

    .buddy-group { margin-bottom: 4px; }

    .buddy-group-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 14px 2px;
      font-size: 0.68rem;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .buddy-group-count {
      background: var(--bg-input);
      border-radius: 10px;
      padding: 0 6px;
      font-size: 0.65rem;
    }

    .buddy-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      cursor: pointer;
      border-radius: 0;
      transition: background 0.1s;
      position: relative;
    }

    .buddy-item:hover { background: var(--bg-card-hover); }
    .buddy-item:hover::before {
      content: '';
      position: absolute;
      left: 0; top: 0; bottom: 0;
      width: 2px;
      background: var(--amber);
      border-radius: 0 2px 2px 0;
    }

    .buddy-info { flex: 1; min-width: 0; }

    .buddy-name {
      font-size: 0.83rem;
      font-weight: 600;
      color: var(--text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .buddy-away-msg {
      font-size: 0.7rem;
      color: var(--text-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-style: italic;
    }

    /* ─── Chat Main Area ─────────────────────────────── */
    .chat-main-area {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .chat-room-panel {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    /* Room tabs bar */
    .room-tabs-bar {
      flex-shrink: 0;
      background: rgba(8, 8, 18, 0.8);
      border-bottom: 1px solid var(--border);
    }

    .room-tabs {
      display: flex;
      gap: 2px;
      padding: 6px 12px 0;
      overflow-x: auto;
      overflow-y: hidden;
    }

    .room-tab {
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 0.8rem;
      font-weight: 500;
      padding: 6px 14px;
      border-radius: var(--radius-sm) var(--radius-sm) 0 0;
      border: 1px solid transparent;
      border-bottom: none;
      cursor: pointer;
      transition: all 0.15s;
      white-space: nowrap;
      font-family: var(--font-body);
    }

    .room-tab:hover { color: var(--text-primary); background: var(--bg-input); }

    .room-tab.active {
      color: var(--amber);
      background: rgba(13, 13, 30, 0.9);
      border-color: var(--border);
      border-bottom-color: rgba(13, 13, 30, 0.9);
      position: relative;
      bottom: -1px;
    }

    .room-tab-add {
      color: var(--text-muted);
      font-size: 1rem;
      padding: 6px 12px;
    }
    .room-tab-add:hover { color: var(--teal); background: var(--teal-dim); }

    /* Chat main layout */
    .chat-main {
      flex: 1;
      overflow: hidden;
      display: flex;
    }

    .chat-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .room-header {
      padding: 12px 20px;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
      background: rgba(13, 13, 30, 0.5);
    }

    .room-name {
      font-size: 1rem;
      font-weight: 700;
      color: var(--text-primary);
    }

    .room-desc {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 2px;
    }

    .messages-area {
      flex: 1;
      overflow-y: auto;
      padding: 8px 0;
    }

    #message-feed { display: flex; flex-direction: column; }

    /* Message no-animation */
    .message.no-anim { animation: none; }

    .chat-input-bar {
      display: flex;
      gap: 8px;
      padding: 12px 16px;
      border-top: 1px solid var(--border);
      background: rgba(13, 13, 30, 0.7);
      flex-shrink: 0;
    }

    .chat-input-bar .form-input { flex: 1; }

    /* Room users sidebar */
    .room-users-sidebar {
      width: 160px;
      flex-shrink: 0;
      border-left: 1px solid var(--border);
      background: rgba(8, 8, 18, 0.5);
      padding: 10px 0;
      overflow-y: auto;
    }

    .room-users-title {
      font-size: 0.68rem;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      padding: 0 10px 8px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 6px;
    }

    .room-user-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      font-size: 0.78rem;
      cursor: default;
    }

    .room-user-name {
      color: var(--text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .room-user-name.own { color: var(--teal); font-weight: 600; }

    /* ─── IM Windows ─────────────────────────────────── */
    #im-container { position: fixed; inset: 0; pointer-events: none; z-index: var(--z-im); }

    .im-window {
      position: absolute;
      width: 340px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-window);
      display: flex;
      flex-direction: column;
      pointer-events: all;
      overflow: hidden;
      opacity: 0;
      transform: scale(0.95) translateY(10px);
      transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .im-window.im-window-visible {
      opacity: 1;
      transform: scale(1) translateY(0);
    }

    .im-titlebar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      background: rgba(245, 166, 35, 0.08);
      border-bottom: 1px solid var(--border);
      cursor: grab;
      user-select: none;
      flex-shrink: 0;
    }
    .im-titlebar:active { cursor: grabbing; }

    .im-title-info { display: flex; align-items: center; gap: 8px; }

    .im-buddy-name { font-size: 0.85rem; font-weight: 700; color: var(--text-primary); }

    .im-buddy-status { font-size: 0.7rem; margin-top: 1px; }
    .im-buddy-status.online { color: var(--status-online); }
    .im-buddy-status.away   { color: var(--status-away); }
    .im-buddy-status.offline { color: var(--text-muted); }

    .im-controls { display: flex; gap: 4px; }

    .im-ctrl-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      font-size: 0.8rem;
      cursor: pointer;
      width: 22px; height: 22px;
      display: flex; align-items: center; justify-content: center;
      border-radius: var(--radius-sm);
      transition: all 0.15s;
    }
    .im-ctrl-btn:hover { background: rgba(239,68,68,0.2); color: #f87171; }

    .im-messages {
      flex: 1;
      min-height: 200px;
      max-height: 300px;
      padding: 10px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .im-start-hint {
      text-align: center;
      font-size: 0.72rem;
      color: var(--text-muted);
      padding: 8px 0 4px;
      font-style: italic;
    }

    .im-message {
      display: flex;
      gap: 6px;
      animation: slide-in 0.15s ease;
    }
    .im-message-mine { flex-direction: row-reverse; }

    .im-bubble {
      max-width: 75%;
      padding: 7px 10px;
      border-radius: 12px;
      font-size: 0.85rem;
      line-height: 1.4;
    }
    .im-bubble-theirs {
      background: var(--bg-tertiary);
      border: 1px solid var(--border);
      border-bottom-left-radius: 2px;
    }
    .im-bubble-mine {
      background: linear-gradient(135deg, var(--amber), #d4860a);
      color: #0d0d1e;
      border-bottom-right-radius: 2px;
    }

    .im-bubble-text { word-break: break-word; }

    .im-bubble-time {
      font-size: 0.65rem;
      margin-top: 3px;
      opacity: 0.6;
    }

    .im-typing-indicator {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      font-size: 0.72rem;
      color: var(--text-muted);
      border-top: 1px solid var(--border);
      flex-shrink: 0;
    }

    .typing-dots { display: flex; gap: 3px; align-items: center; }
    .typing-dots span {
      width: 5px; height: 5px;
      background: var(--text-muted);
      border-radius: 50%;
      animation: typing-bounce 1.2s ease infinite;
    }
    .typing-dots span:nth-child(2) { animation-delay: 0.15s; }
    .typing-dots span:nth-child(3) { animation-delay: 0.3s; }
    @keyframes typing-bounce {
      0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
      30%            { transform: translateY(-4px); opacity: 1; }
    }

    .im-input-bar {
      display: flex;
      gap: 6px;
      padding: 8px 10px;
      border-top: 1px solid var(--border);
      background: rgba(8, 8, 18, 0.4);
      flex-shrink: 0;
    }

    .im-input { font-size: 0.85rem; padding: 7px 10px; flex: 1; }

    /* ─── Toast notifications ─────────────────────────── */
    .toast-container {
      position: fixed;
      bottom: 24px;
      right: 24px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      z-index: var(--z-top);
      pointer-events: none;
    }

    .buddy-toast {
      background: var(--bg-secondary);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-md);
      padding: 10px 16px;
      font-size: 0.82rem;
      color: var(--text-primary);
      box-shadow: var(--shadow-card);
      transition: opacity 0.4s, transform 0.4s;
      animation: toast-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    @keyframes toast-in {
      from { opacity: 0; transform: translateX(60px); }
      to   { opacity: 1; transform: translateX(0); }
    }

    /* ─── Away bar ────────────────────────────────────── */
    .away-bar {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 20px;
      background: rgba(234, 179, 8, 0.08);
      border-top: 1px solid rgba(234, 179, 8, 0.2);
      font-size: 0.82rem;
      color: var(--status-away);
      flex-shrink: 0;
    }

    /* ─── Profile Modal extras ────────────────────────── */
    .profile-header {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 0 0 20px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 20px;
    }

    .profile-username {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-bottom: 2px;
    }

    .profile-display-name {
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--text-primary);
      margin-bottom: 4px;
    }

    .profile-status-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .profile-status-text {
      font-size: 0.78rem;
    }
    .profile-status-text.online { color: var(--status-online); }
    .profile-status-text.away   { color: var(--status-away); }
    .profile-status-text.offline { color: var(--text-muted); }

    .profile-form { display: flex; flex-direction: column; gap: 14px; }

    .profile-view { display: flex; flex-direction: column; gap: 16px; }

    .profile-section { display: flex; flex-direction: column; gap: 6px; }

    .profile-section-label {
      font-size: 0.7rem;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .profile-bio-text, .profile-away-text {
      font-size: 0.875rem;
      color: var(--text-secondary);
      line-height: 1.5;
    }

    /* Responsive */
    @media (max-width: 700px) {
      .buddy-sidebar { width: 180px; }
      .room-users-sidebar { display: none; }
      .im-window { width: 300px; }
    }
  `;
  document.head.appendChild(style);
}

function escapeHtml(s = '') {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

render();
