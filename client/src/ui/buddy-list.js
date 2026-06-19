import * as socket from '../socket.js';

const API = window.location.origin;

export class BuddyList {
  constructor({ container, user, onOpenIM, onViewProfile, sessionId }) {
    this.container = container;
    this.user = user;
    this.onOpenIM = onOpenIM;
    this.onViewProfile = onViewProfile;
    this.sessionId = sessionId;
    this.buddies = [];
    this.contextMenu = null;

    this.render();
    this.loadBuddies();
    this.bindSocketEvents();
    this.bindEvents();
  }

  // ─── Load buddies from API ──────────────────────────────
  async loadBuddies() {
    try {
      const res = await fetch(`${API}/api/buddies`, {
        headers: { 'x-session-id': this.sessionId },
        credentials: 'include',
      });
      if (res.ok) {
        this.buddies = await res.json();
        this.renderList();
      }
    } catch {}
  }

  // ─── Socket events ──────────────────────────────────────
  bindSocketEvents() {
    socket.on('buddy-status-changed', (data) => {
      const buddy = this.buddies.find((b) => b.id === data.userId);
      if (!buddy) return;

      if (data.type === 'buddy-online') {
        buddy.status = 'online';
        buddy.online = true;
        buddy.liveAwayMessage = data.awayMessage;
        buddy.avatarColor = data.avatarColor || buddy.avatar_color;
        buddy.avatarEmoji = data.avatarEmoji || buddy.avatar_emoji;
        buddy.displayName = data.displayName || buddy.display_name;
        this.showStatusToast(buddy, 'online');
      } else if (data.type === 'buddy-offline') {
        buddy.status = 'offline';
        buddy.online = false;
        this.showStatusToast(buddy, 'offline');
      } else if (data.type === 'buddy-status') {
        buddy.status = data.status;
        buddy.liveAwayMessage = data.awayMessage;
      }

      this.renderList();
    });
  }

  // ─── DOM events ─────────────────────────────────────────
  bindEvents() {
    // Close context menu on click elsewhere
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.context-menu')) this.closeContextMenu();
    });
  }

  // ─── Add buddy ──────────────────────────────────────────
  async addBuddy(username) {
    const input = this.container.querySelector('#add-buddy-input');
    const err = this.container.querySelector('#buddy-add-error');
    err.classList.add('hidden');

    try {
      const res = await fetch(`${API}/api/buddies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-session-id': this.sessionId },
        body: JSON.stringify({ username }),
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      this.buddies.push(data);
      this.renderList();
      if (input) input.value = '';
    } catch (err_) {
      if (err) { err.textContent = err_.message; err.classList.remove('hidden'); }
    }
  }

  async removeBuddy(buddy) {
    try {
      await fetch(`${API}/api/buddies/${buddy.username}`, {
        method: 'DELETE',
        headers: { 'x-session-id': this.sessionId },
        credentials: 'include',
      });
      this.buddies = this.buddies.filter((b) => b.id !== buddy.id);
      this.renderList();
    } catch {}
  }

  // ─── Context menu ────────────────────────────────────────
  showContextMenu(e, buddy) {
    e.preventDefault();
    this.closeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.cssText = `left:${Math.min(e.clientX, window.innerWidth - 180)}px;top:${Math.min(e.clientY, window.innerHeight - 150)}px`;
    menu.innerHTML = `
      <div class="context-item" id="ctx-im">💬 Send IM</div>
      <div class="context-item" id="ctx-profile">👤 View Profile</div>
      <div class="context-divider"></div>
      <div class="context-item danger" id="ctx-remove">🗑️ Remove Buddy</div>
    `;

    menu.querySelector('#ctx-im').addEventListener('click', () => {
      this.onOpenIM(buddy);
      this.closeContextMenu();
    });
    menu.querySelector('#ctx-profile').addEventListener('click', () => {
      this.onViewProfile(buddy);
      this.closeContextMenu();
    });
    menu.querySelector('#ctx-remove').addEventListener('click', () => {
      this.removeBuddy(buddy);
      this.closeContextMenu();
    });

    document.body.appendChild(menu);
    this.contextMenu = menu;
  }

  closeContextMenu() {
    this.contextMenu?.remove();
    this.contextMenu = null;
  }

  // ─── Toast notification ──────────────────────────────────
  showStatusToast(buddy, status) {
    const toast = document.createElement('div');
    toast.className = 'buddy-toast';
    const emoji = status === 'online' ? '🟢' : '⚫';
    const name = buddy.display_name || buddy.username;
    toast.textContent = `${emoji} ${name} is ${status}`;
    document.getElementById('toast-container')?.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(110%)';
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  }

  // ─── Render ──────────────────────────────────────────────
  render() {
    this.container.innerHTML = `
      <div class="buddy-list-panel">
        <div class="buddy-list-header">
          <span class="buddy-list-title font-brand">Buddy List</span>
          <span class="buddy-count" id="buddy-online-count">0 online</span>
        </div>

        <!-- Add buddy -->
        <div class="buddy-add-section">
          <div class="buddy-add-row">
            <input class="form-input" id="add-buddy-input" placeholder="Add screen name…" />
            <button class="btn btn-primary btn-sm" id="add-buddy-btn">Add</button>
          </div>
          <div id="buddy-add-error" class="alert alert-error hidden" style="font-size:0.75rem;padding:6px 10px;"></div>
        </div>

        <!-- Lists -->
        <div class="buddy-list-body scroll-area" id="buddy-list-body">
          <div class="buddy-loading">Loading buddies…</div>
        </div>
      </div>
    `;

    this.container.querySelector('#add-buddy-btn').addEventListener('click', () => {
      const val = this.container.querySelector('#add-buddy-input').value.trim();
      if (val) this.addBuddy(val);
    });

    this.container.querySelector('#add-buddy-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = e.target.value.trim();
        if (val) this.addBuddy(val);
      }
    });
  }

  renderList() {
    const body = this.container.querySelector('#buddy-list-body');
    const countEl = this.container.querySelector('#buddy-online-count');

    const online  = this.buddies.filter((b) => b.status === 'online');
    const away    = this.buddies.filter((b) => b.status === 'away');
    const offline = this.buddies.filter((b) => b.status === 'offline' || !b.online);

    countEl.textContent = `${online.length} online`;

    if (this.buddies.length === 0) {
      body.innerHTML = `<div class="buddy-empty">No buddies yet.<br>Add someone above!</div>`;
      return;
    }

    body.innerHTML = `
      ${online.length > 0 ? this.renderGroup('Online', online, '🟢') : ''}
      ${away.length > 0   ? this.renderGroup('Away', away, '🟡') : ''}
      ${offline.length > 0 ? this.renderGroup('Offline', offline, '⚫') : ''}
    `;

    body.querySelectorAll('.buddy-item').forEach((el) => {
      const buddyId = el.dataset.buddyId;
      const buddy = this.buddies.find((b) => b.id === buddyId);
      if (!buddy) return;

      el.addEventListener('dblclick', () => this.onOpenIM(buddy));
      el.addEventListener('contextmenu', (e) => this.showContextMenu(e, buddy));
    });
  }

  renderGroup(label, buddies, icon) {
    return `
      <div class="buddy-group">
        <div class="buddy-group-header">
          <span>${icon} ${label}</span>
          <span class="buddy-group-count">${buddies.length}</span>
        </div>
        ${buddies.map((b) => this.renderBuddy(b)).join('')}
      </div>
    `;
  }

  renderBuddy(b) {
    const name = b.display_name || b.displayName || b.username;
    const color = b.avatar_color || b.avatarColor || '#f5a623';
    const emoji = b.avatar_emoji || b.avatarEmoji || '😊';
    const awayMsg = b.liveAwayMessage || b.away_message || '';
    const status = b.online ? (b.status || 'online') : 'offline';

    return `
      <div class="buddy-item" data-buddy-id="${b.id}" title="Double-click to IM">
        <div class="avatar avatar-sm ${status}" style="background:${color}">
          ${emoji}
          <div class="status-dot ${status}" style="position:absolute;bottom:-1px;right:-1px;width:8px;height:8px;border:2px solid var(--bg-secondary);border-radius:50%;"></div>
        </div>
        <div class="buddy-info">
          <div class="buddy-name">${name}</div>
          ${awayMsg && status !== 'offline' ? `<div class="buddy-away-msg">${escapeHtml(awayMsg)}</div>` : ''}
        </div>
      </div>
    `;
  }
}

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
