import * as socket from '../socket.js';

const API = window.location.origin;

export class ChatRoom {
  constructor({ container, user, sessionId }) {
    this.container = container;
    this.user = user;
    this.sessionId = sessionId;
    this.rooms = [];
    this.currentRoom = null;
    this.roomUsers = {};
    this.typing = false;
    this.typingTimer = null;

    this.render();
    this.loadRooms();
    this.bindSocketEvents();
  }

  async loadRooms() {
    try {
      const res = await fetch(`${API}/api/rooms`, {
        headers: { 'x-session-id': this.sessionId },
        credentials: 'include',
      });
      if (res.ok) {
        this.rooms = await res.json();
        this.renderRoomTabs();
        if (this.rooms[0]) this.joinRoom(this.rooms[0]);
      }
    } catch {}
  }

  joinRoom(room) {
    if (this.currentRoom?.id === room.id) return;
    this.currentRoom = room;
    this.renderRoomTabs();
    this.clearMessages();
    socket.send('join-room', { roomId: room.id });
    this.updateRoomHeader();
  }

  bindSocketEvents() {
    socket.on('room-history', ({ roomId, messages }) => {
      if (roomId !== this.currentRoom?.id) return;
      this.clearMessages();
      for (const msg of messages) this.appendMessage(msg, false);
      this.scrollToBottom();
    });

    socket.on('room-message', (msg) => {
      if (msg.roomId !== this.currentRoom?.id) return;
      this.appendMessage(msg, true);
      this.scrollToBottom();
    });

    socket.on('room-users', ({ roomId, users }) => {
      if (roomId !== this.currentRoom?.id) return;
      this.roomUsers[roomId] = users;
      this.renderRoomUsers(users);
    });

    socket.on('user-joined', (data) => {
      if (!this.currentRoom) return;
      this.appendSystemMessage(`${data.displayName || data.username} joined the room`);
    });

    socket.on('user-left', (data) => {
      if (!this.currentRoom) return;
      this.appendSystemMessage(`${data.username} left the room`);
      // Remove from user list
      if (this.roomUsers[this.currentRoom.id]) {
        this.roomUsers[this.currentRoom.id] = this.roomUsers[this.currentRoom.id]
          .filter(u => u.userId !== data.userId);
        this.renderRoomUsers(this.roomUsers[this.currentRoom.id]);
      }
    });
  }

  // ─── Send message ────────────────────────────────────────
  sendMessage() {
    const input = this.container.querySelector('#chat-input');
    const content = input?.value.trim();
    if (!content || !this.currentRoom) return;

    socket.send('send-message', { roomId: this.currentRoom.id, content });
    input.value = '';
    input.focus();
    this.stopTyping();
  }

  // ─── Typing indicator ────────────────────────────────────
  onInputChange() {
    if (!this.typing) {
      this.typing = true;
    }
    clearTimeout(this.typingTimer);
    this.typingTimer = setTimeout(() => this.stopTyping(), 2000);
  }

  stopTyping() {
    this.typing = false;
    clearTimeout(this.typingTimer);
  }

  // ─── Create room ─────────────────────────────────────────
  async createRoom() {
    const name = prompt('Room name:')?.trim();
    if (!name) return;
    const desc = prompt('Description (optional):')?.trim() || '';

    try {
      const res = await fetch(`${API}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-session-id': this.sessionId },
        body: JSON.stringify({ name, description: desc }),
        credentials: 'include',
      });
      if (res.ok) {
        const room = await res.json();
        this.rooms.push(room);
        this.renderRoomTabs();
        this.joinRoom(room);
      }
    } catch {}
  }

  // ─── Message rendering ───────────────────────────────────
  appendMessage(msg, animate = true) {
    const feed = this.container.querySelector('#message-feed');
    if (!feed) return;

    const isOwn = msg.user_id === this.user.id || msg.userId === this.user.id;
    const username = msg.display_name || msg.displayName || msg.username;
    const color = msg.avatar_color || msg.avatarColor || '#f5a623';
    const emoji = msg.avatar_emoji || msg.avatarEmoji || '😊';
    const time = new Date((msg.created_at ? msg.created_at * 1000 : msg.timestamp)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const el = document.createElement('div');
    el.className = `message${isOwn ? ' own' : ''}${!animate ? ' no-anim' : ''}`;
    el.innerHTML = `
      <div class="avatar avatar-sm ${isOwn ? 'online' : ''}" style="background:${color};align-self:flex-start;margin-top:2px">
        ${emoji}
      </div>
      <div class="message-content-wrap">
        <div class="message-meta">
          <span class="message-author${isOwn ? ' own' : ''}">${escapeHtml(username)}${isOwn ? ' (you)' : ''}</span>
          <span class="message-time">${time}</span>
        </div>
        <div class="message-text">${escapeHtml(msg.content)}</div>
      </div>
    `;

    feed.appendChild(el);
  }

  appendSystemMessage(text) {
    const feed = this.container.querySelector('#message-feed');
    if (!feed) return;
    const el = document.createElement('div');
    el.className = 'message-system';
    el.innerHTML = `<span>${escapeHtml(text)}</span>`;
    feed.appendChild(el);
    this.scrollToBottom();
  }

  clearMessages() {
    const feed = this.container.querySelector('#message-feed');
    if (feed) feed.innerHTML = '';
  }

  scrollToBottom() {
    const area = this.container.querySelector('#messages-area');
    if (area) area.scrollTop = area.scrollHeight;
  }

  // ─── Users list ──────────────────────────────────────────
  renderRoomUsers(users) {
    const panel = this.container.querySelector('#room-users-panel');
    if (!panel) return;
    panel.innerHTML = `
      <div class="room-users-title">In Room (${users.length})</div>
      ${users.map(u => `
        <div class="room-user-item">
          <div class="avatar avatar-sm online" style="background:${u.avatarColor || '#f5a623'}">
            ${u.avatarEmoji || '😊'}
          </div>
          <span class="room-user-name${u.userId === this.user.id ? ' own' : ''}">${escapeHtml(u.displayName || u.username)}</span>
        </div>
      `).join('')}
    `;
  }

  // ─── Render ──────────────────────────────────────────────
  renderRoomTabs() {
    const tabsEl = this.container.querySelector('#room-tabs');
    if (!tabsEl) return;
    tabsEl.innerHTML = `
      ${this.rooms.map(r => `
        <button class="room-tab ${this.currentRoom?.id === r.id ? 'active' : ''}"
          data-room-id="${r.id}" title="${escapeHtml(r.description || '')}">
          # ${escapeHtml(r.name)}
        </button>
      `).join('')}
      <button class="room-tab room-tab-add" id="create-room-btn" title="Create new room">+</button>
    `;

    tabsEl.querySelectorAll('.room-tab[data-room-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const room = this.rooms.find(r => r.id === btn.dataset.roomId);
        if (room) this.joinRoom(room);
      });
    });

    tabsEl.querySelector('#create-room-btn')?.addEventListener('click', () => this.createRoom());
  }

  updateRoomHeader() {
    const header = this.container.querySelector('#room-header');
    if (!header || !this.currentRoom) return;
    header.innerHTML = `
      <div>
        <div class="room-name"># ${escapeHtml(this.currentRoom.name)}</div>
        ${this.currentRoom.description ? `<div class="room-desc">${escapeHtml(this.currentRoom.description)}</div>` : ''}
      </div>
    `;
  }

  render() {
    this.container.innerHTML = `
      <div class="chat-room-panel">
        <!-- Room tabs -->
        <div class="room-tabs-bar">
          <div class="room-tabs scroll-area" id="room-tabs"></div>
        </div>

        <div class="chat-main">
          <!-- Chat area -->
          <div class="chat-area">
            <div class="room-header" id="room-header">
              <div class="room-name"># Loading…</div>
            </div>
            <div class="messages-area scroll-area" id="messages-area">
              <div id="message-feed"></div>
            </div>
            <div class="chat-input-bar">
              <input class="form-input" id="chat-input" placeholder="Message the room…" maxlength="1000" />
              <button class="btn btn-primary btn-sm" id="send-btn">Send</button>
            </div>
          </div>

          <!-- Room users sidebar -->
          <div class="room-users-sidebar" id="room-users-panel">
            <div class="room-users-title">In Room (0)</div>
          </div>
        </div>
      </div>
    `;

    const input = this.container.querySelector('#chat-input');
    const sendBtn = this.container.querySelector('#send-btn');

    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    input?.addEventListener('input', () => this.onInputChange());
    sendBtn?.addEventListener('click', () => this.sendMessage());
  }
}

function escapeHtml(s = '') {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
