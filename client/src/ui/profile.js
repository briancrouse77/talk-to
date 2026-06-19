const API = window.location.origin;

export class ProfileModal {
  constructor({ user, sessionId, onUpdate }) {
    this.user = user;
    this.sessionId = sessionId;
    this.onUpdate = onUpdate;
    this.el = null;
  }

  open(targetUser = null) {
    const isOwn = !targetUser || targetUser.id === this.user.id;
    const profile = isOwn ? this.user : targetUser;
    this.showModal(profile, isOwn);
  }

  showModal(profile, isEditable) {
    this.close();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'profile-modal-overlay';

    const status = profile.online ? (profile.status || 'online') : 'offline';
    const color = profile.avatar_color || profile.avatarColor || '#f5a623';
    const emoji = profile.avatar_emoji || profile.avatarEmoji || '😊';
    const name = profile.display_name || profile.displayName || profile.username;

    overlay.innerHTML = `
      <div class="modal" id="profile-modal">
        <div class="modal-header">
          <span class="modal-title">${isEditable ? 'My Profile' : 'Profile'}</span>
          <button class="modal-close" id="profile-close">✕</button>
        </div>

        <!-- Profile header -->
        <div class="profile-header">
          <div class="avatar avatar-xl ${status}" style="background:${color}" id="profile-avatar">${emoji}</div>
          <div class="profile-header-info">
            <div class="profile-username">${escapeHtml(profile.username)}</div>
            <div class="profile-display-name">${escapeHtml(name)}</div>
            <div class="profile-status-row">
              <div class="status-dot ${status}"></div>
              <span class="profile-status-text ${status}">
                ${status === 'offline' ? 'Offline' : status === 'away' ? 'Away' : 'Online'}
              </span>
            </div>
          </div>
        </div>

        ${isEditable ? this.renderEditForm(profile) : this.renderViewMode(profile)}

        <div id="profile-error" class="alert alert-error hidden" style="margin-top:12px"></div>
        <div id="profile-success" class="alert alert-success hidden" style="margin-top:12px">Profile updated!</div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.el = overlay;

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });
    overlay.querySelector('#profile-close').addEventListener('click', () => this.close());

    if (isEditable) {
      this.bindEditEvents(overlay, profile);
    }
  }

  renderEditForm(profile) {
    const EMOJIS = ['😊','😎','🤠','👾','🦊','🐱','🐸','🦁','🐼','🐧','🦋','🌟','🔥','⚡','🎮','🎵','🚀','💎','🌈','👻'];
    const COLORS = ['#f5a623','#00d4aa','#7c3aed','#ec4899','#ef4444','#3b82f6','#10b981','#f59e0b','#8b5cf6','#06b6d4'];

    const currentEmoji = profile.avatar_emoji || '😊';
    const currentColor = profile.avatar_color || '#f5a623';

    return `
      <div class="profile-form">
        <div class="form-group">
          <label class="form-label">Display Name</label>
          <input class="form-input" id="profile-display-name" value="${escapeHtml(profile.display_name || profile.username)}" />
        </div>
        <div class="form-group">
          <label class="form-label">Bio</label>
          <textarea class="form-input" id="profile-bio" rows="2" placeholder="Tell people about yourself…">${escapeHtml(profile.bio || '')}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Away Message</label>
          <input class="form-input" id="profile-away" value="${escapeHtml(profile.away_message || '')}" placeholder="BRB, grabbing a snack…" />
        </div>

        <!-- Avatar editor -->
        <div class="form-group">
          <label class="form-label">Avatar</label>
          <div style="display:flex;gap:12px;align-items:flex-start">
            <div class="avatar avatar-md" id="profile-avatar-preview" style="background:${currentColor};border:2px solid var(--amber)">${currentEmoji}</div>
            <div style="flex:1">
              <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px" id="profile-emoji-grid">
                ${EMOJIS.map(e => `<button type="button" class="emoji-btn ${e === currentEmoji ? 'selected' : ''}" data-emoji="${e}">${e}</button>`).join('')}
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:4px" id="profile-color-grid">
                ${COLORS.map(c => `<button type="button" class="color-btn ${c === currentColor ? 'selected' : ''}" data-color="${c}" style="background:${c}"></button>`).join('')}
              </div>
            </div>
          </div>
        </div>

        <button class="btn btn-primary w-full" id="profile-save">Save Profile</button>
      </div>
    `;
  }

  renderViewMode(profile) {
    return `
      <div class="profile-view">
        ${profile.bio ? `
          <div class="profile-section">
            <div class="profile-section-label">About</div>
            <div class="profile-bio-text">${escapeHtml(profile.bio)}</div>
          </div>
        ` : ''}
        <div class="profile-section">
          <div class="profile-section-label">Away Message</div>
          <div class="profile-away-text">${escapeHtml(profile.liveAwayMessage || profile.away_message || 'No away message set')}</div>
        </div>
      </div>
    `;
  }

  bindEditEvents(overlay, profile) {
    let selectedEmoji = profile.avatar_emoji || '😊';
    let selectedColor = profile.avatar_color || '#f5a623';

    const updatePreview = () => {
      const preview = overlay.querySelector('#profile-avatar-preview');
      const mainAvatar = overlay.querySelector('#profile-avatar');
      if (preview) { preview.style.background = selectedColor; preview.textContent = selectedEmoji; }
      if (mainAvatar) { mainAvatar.style.background = selectedColor; mainAvatar.textContent = selectedEmoji; }
    };

    overlay.querySelectorAll('.emoji-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedEmoji = btn.dataset.emoji;
        overlay.querySelectorAll('.emoji-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        updatePreview();
      });
    });

    overlay.querySelectorAll('.color-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedColor = btn.dataset.color;
        overlay.querySelectorAll('.color-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        updatePreview();
      });
    });

    overlay.querySelector('#profile-save')?.addEventListener('click', async () => {
      const display_name = overlay.querySelector('#profile-display-name')?.value.trim();
      const bio = overlay.querySelector('#profile-bio')?.value.trim();
      const away_message = overlay.querySelector('#profile-away')?.value.trim();
      const errEl = overlay.querySelector('#profile-error');
      const successEl = overlay.querySelector('#profile-success');

      errEl.classList.add('hidden');
      successEl.classList.add('hidden');

      try {
        const res = await fetch(`${API}/api/profile`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'x-session-id': this.sessionId },
          body: JSON.stringify({ display_name, bio, away_message, avatar_color: selectedColor, avatar_emoji: selectedEmoji }),
          credentials: 'include',
        });

        if (!res.ok) throw new Error('Failed to save');

        successEl.classList.remove('hidden');

        const updatedUser = { ...this.user, display_name, bio, away_message, avatar_color: selectedColor, avatar_emoji: selectedEmoji };
        this.user = updatedUser;
        this.onUpdate?.(updatedUser);
        localStorage.setItem('user', JSON.stringify(updatedUser));

        setTimeout(() => successEl.classList.add('hidden'), 2000);
      } catch {
        errEl.textContent = 'Failed to save profile.';
        errEl.classList.remove('hidden');
      }
    });
  }

  close() {
    this.el?.remove();
    this.el = null;
  }
}

function escapeHtml(s = '') {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
