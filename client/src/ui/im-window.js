import * as socket from '../socket.js';

let windowCount = 0;
const activeWindows = new Map(); // toUserId → IMWindow instance

export class IMWindow {
  constructor({ buddy, user, onClose }) {
    if (activeWindows.has(buddy.id)) {
      const existing = activeWindows.get(buddy.id);
      existing.focus();
      return existing;
    }

    this.buddy = buddy;
    this.user = user;
    this.onClose = onClose;
    this.messages = [];
    this.el = null;
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };
    this.typing = false;
    this.typingTimer = null;
    this.unsubscribers = [];

    windowCount++;
    this.zIndex = 300 + windowCount;

    // Position each new window offset from the last
    this.startX = 60 + (windowCount % 5) * 40;
    this.startY = 80 + (windowCount % 4) * 30;

    this.mount();
    activeWindows.set(buddy.id, this);
    return this;
  }

  mount() {
    const el = document.createElement('div');
    el.className = 'im-window';
    el.style.cssText = `
      left: ${this.startX}px;
      top: ${this.startY}px;
      z-index: ${this.zIndex};
      width: 340px;
    `;

    const buddy = this.buddy;
    const status = buddy.status || (buddy.online ? 'online' : 'offline');
    const color = buddy.avatar_color || buddy.avatarColor || '#f5a623';
    const emoji = buddy.avatar_emoji || buddy.avatarEmoji || '😊';
    const name = buddy.display_name || buddy.displayName || buddy.username;

    el.innerHTML = `
      <div class="im-titlebar" id="im-titlebar-${buddy.id}">
        <div class="im-title-info">
          <div class="avatar avatar-sm ${status}" style="background:${color}">${emoji}</div>
          <div>
            <div class="im-buddy-name">${escapeHtml(name)}</div>
            <div class="im-buddy-status ${status}">${this.statusLabel(status, buddy.liveAwayMessage || buddy.away_message)}</div>
          </div>
        </div>
        <div class="im-controls">
          <button class="im-ctrl-btn" id="im-close-${buddy.id}" title="Close">✕</button>
        </div>
      </div>

      <div class="im-messages scroll-area" id="im-msgs-${buddy.id}">
        <div class="im-start-hint">Start of your conversation with <strong>${escapeHtml(name)}</strong></div>
      </div>

      <div class="im-typing-indicator hidden" id="im-typing-${buddy.id}">
        <span class="typing-dots"><span></span><span></span><span></span></span>
        <span>${escapeHtml(name)} is typing…</span>
      </div>

      <div class="im-input-bar">
        <input class="form-input im-input" id="im-input-${buddy.id}"
          placeholder="Message ${escapeHtml(buddy.username)}…" maxlength="1000" />
        <button class="btn btn-teal btn-sm" id="im-send-${buddy.id}">Send</button>
      </div>
    `;

    document.getElementById('im-container').appendChild(el);
    this.el = el;

    // Dragging
    const titlebar = el.querySelector(`#im-titlebar-${buddy.id}`);
    titlebar.addEventListener('mousedown', this.startDrag.bind(this));

    // Close
    el.querySelector(`#im-close-${buddy.id}`).addEventListener('click', () => this.close());

    // Send
    const input = el.querySelector(`#im-input-${buddy.id}`);
    el.querySelector(`#im-send-${buddy.id}`).addEventListener('click', () => this.sendMessage());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendMessage(); }
    });

    input.addEventListener('input', () => this.onType());

    // Bring to front on click
    el.addEventListener('mousedown', () => this.focus());

    // Socket events
    const unsubIM = socket.on('im-message', (data) => {
      if (data.fromUserId !== buddy.id) return;
      this.appendMessage({
        from: 'buddy',
        username: data.fromDisplayName || data.fromUsername,
        content: data.content,
        avatarColor: data.fromAvatarColor,
        avatarEmoji: data.fromAvatarEmoji,
        timestamp: data.timestamp,
      });
    });

    const unsubSent = socket.on('im-sent', (data) => {
      if (data.toUserId !== buddy.id) return;
      this.appendMessage({
        from: 'me',
        username: this.user.display_name || this.user.username,
        content: data.content,
        avatarColor: this.user.avatar_color,
        avatarEmoji: this.user.avatar_emoji,
        timestamp: data.timestamp,
      });
    });

    const unsubTyping = socket.on('buddy-typing', (data) => {
      if (data.fromUserId !== buddy.id) return;
      const indicator = el.querySelector(`#im-typing-${buddy.id}`);
      indicator?.classList.remove('hidden');
    });

    const unsubStopTyping = socket.on('buddy-stopped-typing', (data) => {
      if (data.fromUserId !== buddy.id) return;
      const indicator = el.querySelector(`#im-typing-${buddy.id}`);
      indicator?.classList.add('hidden');
    });

    const unsubStatus = socket.on('buddy-status-changed', (data) => {
      if (data.userId !== buddy.id) return;
      this.buddy.status = data.status;
      const statusEl = el.querySelector('.im-buddy-status');
      if (statusEl) {
        statusEl.className = `im-buddy-status ${data.status}`;
        statusEl.textContent = this.statusLabel(data.status, data.awayMessage);
      }
    });

    this.unsubscribers = [unsubIM, unsubSent, unsubTyping, unsubStopTyping, unsubStatus];

    // Animate in
    requestAnimationFrame(() => el.classList.add('im-window-visible'));

    input.focus();
  }

  statusLabel(status, awayMsg) {
    if (status === 'away') return awayMsg ? `Away: ${awayMsg}` : 'Away';
    if (status === 'offline') return 'Offline';
    return 'Online';
  }

  sendMessage() {
    const input = this.el.querySelector(`#im-input-${this.buddy.id}`);
    const content = input?.value.trim();
    if (!content) return;

    socket.send('send-im', { toUserId: this.buddy.id, content });
    input.value = '';
    input.focus();
    this.stopTyping();
  }

  onType() {
    if (!this.typing) {
      this.typing = true;
      socket.send('typing-start', { toUserId: this.buddy.id });
    }
    clearTimeout(this.typingTimer);
    this.typingTimer = setTimeout(() => this.stopTyping(), 2000);
  }

  stopTyping() {
    if (this.typing) {
      this.typing = false;
      socket.send('typing-stop', { toUserId: this.buddy.id });
    }
    clearTimeout(this.typingTimer);
  }

  appendMessage({ from, username, content, avatarColor, avatarEmoji, timestamp }) {
    const feed = this.el.querySelector(`#im-msgs-${this.buddy.id}`);
    if (!feed) return;

    const isMe = from === 'me';
    const color = avatarColor || (isMe ? this.user.avatar_color : this.buddy.avatar_color) || '#f5a623';
    const emoji = avatarEmoji || (isMe ? this.user.avatar_emoji : this.buddy.avatar_emoji) || '😊';
    const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const el = document.createElement('div');
    el.className = `im-message ${isMe ? 'im-message-mine' : 'im-message-theirs'}`;
    el.innerHTML = `
      <div class="avatar avatar-sm" style="background:${color};align-self:flex-end">${emoji}</div>
      <div class="im-bubble ${isMe ? 'im-bubble-mine' : 'im-bubble-theirs'}">
        <div class="im-bubble-text">${escapeHtml(content)}</div>
        <div class="im-bubble-time">${time}</div>
      </div>
    `;

    // Hide typing indicator, remove start hint
    const indicator = this.el.querySelector(`#im-typing-${this.buddy.id}`);
    indicator?.classList.add('hidden');

    const hint = feed.querySelector('.im-start-hint');
    // Keep hint but append after it

    feed.appendChild(el);
    feed.scrollTop = feed.scrollHeight;
  }

  focus() {
    windowCount++;
    this.zIndex = 300 + windowCount;
    this.el.style.zIndex = this.zIndex;
  }

  // ─── Dragging ────────────────────────────────────────────
  startDrag(e) {
    if (e.target.closest('.im-ctrl-btn')) return;
    this.focus();
    this.isDragging = true;
    const rect = this.el.getBoundingClientRect();
    this.dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    const onMove = (e) => {
      if (!this.isDragging) return;
      const x = Math.max(0, Math.min(e.clientX - this.dragOffset.x, window.innerWidth - this.el.offsetWidth));
      const y = Math.max(0, Math.min(e.clientY - this.dragOffset.y, window.innerHeight - this.el.offsetHeight));
      this.el.style.left = x + 'px';
      this.el.style.top = y + 'px';
    };

    const onUp = () => {
      this.isDragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  close() {
    this.stopTyping();
    this.unsubscribers.forEach((fn) => fn?.());
    this.el.classList.remove('im-window-visible');
    setTimeout(() => {
      this.el.remove();
      activeWindows.delete(this.buddy.id);
      this.onClose?.(this.buddy.id);
    }, 200);
  }
}

export function openIM({ buddy, user, onClose }) {
  // If already open, focus existing window
  if (activeWindows.has(buddy.id)) {
    const win = activeWindows.get(buddy.id);
    win.focus();
    return win;
  }
  return new IMWindow({ buddy, user, onClose });
}

export function getActiveWindows() {
  return activeWindows;
}

function escapeHtml(s = '') {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
