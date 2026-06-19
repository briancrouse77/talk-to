import './style/index.css';

const EMOJIS = ['😊','😎','🤠','👾','🦊','🐱','🐸','🦁','🐼','🐧','🦋','🌟','🔥','⚡','🎮','🎵','🚀','💎','🌈','👻'];
const COLORS = ['#f5a623','#00d4aa','#7c3aed','#ec4899','#ef4444','#3b82f6','#10b981','#f59e0b','#8b5cf6','#06b6d4'];

const API = window.location.origin;

let selectedEmoji = EMOJIS[0];
let selectedColor = COLORS[0];

function getSession() { return localStorage.getItem('sessionId'); }

// If already logged in, redirect
const existingSession = getSession();
if (existingSession) {
  verifySession(existingSession);
}

async function verifySession(sessionId) {
  try {
    const res = await fetch(`${API}/api/auth/me`, {
      headers: { 'x-session-id': sessionId }
    });
    if (res.ok) {
      const user = await res.json();
      localStorage.setItem('user', JSON.stringify(user));
      window.location.href = '/app.html';
    } else {
      localStorage.clear();
      render();
    }
  } catch {
    render();
  }
}

function render() {
  document.getElementById('app').innerHTML = `
    <div class="login-page bg-animated bg-grid">
      <!-- Floating particles -->
      <div class="particles" id="particles"></div>

      <!-- Main card -->
      <div class="login-card glass-strong">
        <!-- Logo -->
        <div class="logo-section">
          <div class="logo-icon">
            <span class="logo-bubble">💬</span>
            <div class="logo-glow"></div>
          </div>
          <h1 class="logo-text font-brand glow-amber">Talk To</h1>
          <p class="logo-tagline">Connect. Chat. Vibe.</p>
        </div>

        <!-- Tabs -->
        <div class="auth-tabs">
          <button class="auth-tab active" id="tab-login" onclick="switchTab('login')">Sign On</button>
          <button class="auth-tab" id="tab-register" onclick="switchTab('register')">New Account</button>
        </div>

        <!-- Error -->
        <div id="auth-error" class="alert alert-error hidden"></div>

        <!-- Login Form -->
        <form id="form-login" class="auth-form" onsubmit="handleLogin(event)">
          <div class="form-group">
            <label class="form-label">Screen Name</label>
            <input class="form-input" type="text" id="login-username" placeholder="Your screen name" autocomplete="username" required />
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input class="form-input" type="password" id="login-password" placeholder="••••••••" autocomplete="current-password" required />
          </div>
          <button class="btn btn-primary btn-lg w-full" id="btn-login" type="submit">
            <span>Sign On</span>
            <span class="btn-arrow">→</span>
          </button>
        </form>

        <!-- Register Form -->
        <form id="form-register" class="auth-form hidden" onsubmit="handleRegister(event)">
          <div class="form-group">
            <label class="form-label">Choose a Screen Name</label>
            <input class="form-input" type="text" id="reg-username" placeholder="3–20 characters" autocomplete="username" required />
          </div>
          <div class="form-group">
            <label class="form-label">Email Address</label>
            <input class="form-input" type="email" id="reg-email" placeholder="you@example.com" required />
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input class="form-input" type="password" id="reg-password" placeholder="At least 4 characters" autocomplete="new-password" required />
          </div>

          <!-- Avatar picker -->
          <div class="form-group">
            <label class="form-label">Pick Your Avatar</label>
            <div class="avatar-picker">
              <div class="avatar-preview" id="avatar-preview"
                   style="background:${COLORS[0]}">
                ${EMOJIS[0]}
              </div>
              <div class="avatar-picker-panels">
                <div class="emoji-grid" id="emoji-grid">
                  ${EMOJIS.map((e, i) => `
                    <button type="button" class="emoji-btn ${i === 0 ? 'selected' : ''}"
                      onclick="selectEmoji('${e}', this)">${e}</button>
                  `).join('')}
                </div>
                <div class="color-grid" id="color-grid">
                  ${COLORS.map((c, i) => `
                    <button type="button" class="color-btn ${i === 0 ? 'selected' : ''}"
                      style="background:${c}" onclick="selectColor('${c}', this)"></button>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>

          <button class="btn btn-primary btn-lg w-full" id="btn-register" type="submit">
            <span>Create Account</span>
            <span class="btn-arrow">→</span>
          </button>
        </form>

        <p class="login-footer">
          <span class="text-muted">© 2026 Talk To</span>
          <span class="text-muted">·</span>
          <span class="text-muted">You've got chat.</span>
        </p>
      </div>
    </div>
  `;

  // Generate particles
  const container = document.getElementById('particles');
  for (let i = 0; i < 20; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.cssText = `
      left: ${Math.random() * 100}%;
      top: ${Math.random() * 100}%;
      animation-delay: ${Math.random() * 6}s;
      animation-duration: ${4 + Math.random() * 4}s;
      width: ${2 + Math.random() * 3}px;
      height: ${2 + Math.random() * 3}px;
      opacity: ${0.2 + Math.random() * 0.4};
    `;
    container.appendChild(p);
  }
}

window.switchTab = (tab) => {
  const loginForm = document.getElementById('form-login');
  const registerForm = document.getElementById('form-register');
  const tabLogin = document.getElementById('tab-login');
  const tabReg = document.getElementById('tab-register');
  const err = document.getElementById('auth-error');
  err.classList.add('hidden');

  if (tab === 'login') {
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    tabLogin.classList.add('active');
    tabReg.classList.remove('active');
  } else {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
    tabLogin.classList.remove('active');
    tabReg.classList.add('active');
  }
};

window.selectEmoji = (emoji, btn) => {
  selectedEmoji = emoji;
  document.querySelectorAll('.emoji-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  updateAvatarPreview();
};

window.selectColor = (color, btn) => {
  selectedColor = color;
  document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  updateAvatarPreview();
};

function updateAvatarPreview() {
  const preview = document.getElementById('avatar-preview');
  preview.style.background = selectedColor;
  preview.textContent = selectedEmoji;
}

window.handleLogin = async (e) => {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('btn-login');
  const err = document.getElementById('auth-error');

  err.classList.add('hidden');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div><span>Signing on...</span>';

  try {
    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');

    localStorage.setItem('sessionId', data.sessionId);
    localStorage.setItem('user', JSON.stringify(data.user));
    window.location.href = '/app.html';
  } catch (error) {
    err.textContent = error.message;
    err.classList.remove('hidden');
    btn.disabled = false;
    btn.innerHTML = '<span>Sign On</span><span class="btn-arrow">→</span>';
  }
};

window.handleRegister = async (e) => {
  e.preventDefault();
  const username = document.getElementById('reg-username').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const btn = document.getElementById('btn-register');
  const err = document.getElementById('auth-error');

  err.classList.add('hidden');
  err.className = 'alert alert-error'; // reset default alert class to error
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div><span>Creating account...</span>';

  try {
    const res = await fetch(`${API}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, email, avatarColor: selectedColor, avatarEmoji: selectedEmoji }),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');

    // Clear form inputs
    document.getElementById('reg-username').value = '';
    document.getElementById('reg-email').value = '';
    document.getElementById('reg-password').value = '';

    // Show success banner
    err.className = 'alert alert-success';
    err.innerHTML = '📬 <strong>Account Created!</strong><br/>A verification link was printed to the server console log. Please click it to verify before signing on.';
    err.classList.remove('hidden');

    btn.disabled = false;
    btn.innerHTML = '<span>Create Account</span><span class="btn-arrow">→</span>';

    // Switch view back to login
    window.switchTab('login');
  } catch (error) {
    err.textContent = error.message;
    err.classList.remove('hidden');
    btn.disabled = false;
    btn.innerHTML = '<span>Create Account</span><span class="btn-arrow">→</span>';
  }
};

// ─── Login Page Styles ────────────────────────────────────────────────────────
const style = document.createElement('style');
style.textContent = `
  .login-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    position: relative;
    overflow: hidden;
  }

  .particles { position: fixed; inset: 0; pointer-events: none; z-index: 0; }
  .particle {
    position: absolute;
    border-radius: 50%;
    background: var(--amber);
    animation: float-particle linear infinite;
  }
  @keyframes float-particle {
    0%   { transform: translateY(0) rotate(0deg); opacity: 0; }
    10%  { opacity: 1; }
    90%  { opacity: 0.5; }
    100% { transform: translateY(-100vh) rotate(360deg); opacity: 0; }
  }

  .login-card {
    position: relative;
    z-index: 1;
    width: min(440px, 96vw);
    padding: 40px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    box-shadow: var(--shadow-window), var(--shadow-glow-amber);
    border: 1px solid var(--border-amber);
  }

  .logo-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    text-align: center;
  }

  .logo-icon {
    position: relative;
    width: 72px;
    height: 72px;
    margin-bottom: 4px;
  }

  .logo-bubble {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2.5rem;
    animation: logo-bob 3s ease-in-out infinite;
  }

  .logo-glow {
    position: absolute;
    inset: -10px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(245,166,35,0.3) 0%, transparent 70%);
    animation: logo-glow-pulse 3s ease-in-out infinite;
  }

  @keyframes logo-bob {
    0%, 100% { transform: translateY(0); }
    50%       { transform: translateY(-6px); }
  }

  @keyframes logo-glow-pulse {
    0%, 100% { opacity: 0.6; transform: scale(1); }
    50%       { opacity: 1; transform: scale(1.15); }
  }

  .logo-text {
    font-size: 2rem;
    font-weight: 900;
    color: var(--amber);
    letter-spacing: 0.1em;
  }

  .logo-tagline {
    font-size: 0.8rem;
    color: var(--text-muted);
    letter-spacing: 0.15em;
    text-transform: uppercase;
  }

  .auth-tabs {
    display: flex;
    background: var(--bg-input);
    border-radius: var(--radius-md);
    padding: 4px;
    gap: 4px;
  }

  .auth-tab {
    flex: 1;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    font-weight: 600;
    font-size: 0.85rem;
    padding: 8px;
    border-radius: var(--radius-sm);
    transition: all 0.2s;
    cursor: pointer;
  }

  .auth-tab.active {
    background: var(--amber);
    color: #0d0d1e;
  }

  .auth-form { display: flex; flex-direction: column; gap: 14px; }

  /* Avatar picker */
  .avatar-picker {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }

  .avatar-preview {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.8rem;
    flex-shrink: 0;
    border: 2px solid var(--amber);
    box-shadow: 0 0 12px rgba(245,166,35,0.3);
    transition: all 0.2s;
  }

  .avatar-picker-panels { flex: 1; display: flex; flex-direction: column; gap: 6px; }

  .emoji-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .emoji-btn {
    background: var(--bg-input);
    border: 1px solid transparent;
    border-radius: 6px;
    width: 30px;
    height: 30px;
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .emoji-btn:hover { background: var(--bg-card-hover); border-color: var(--border); }
  .emoji-btn.selected { border-color: var(--amber); background: var(--amber-dim); }

  .color-grid { display: flex; flex-wrap: wrap; gap: 4px; }

  .color-btn {
    width: 22px; height: 22px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    transition: all 0.15s;
  }
  .color-btn:hover { transform: scale(1.2); }
  .color-btn.selected { border-color: white; box-shadow: 0 0 6px rgba(255,255,255,0.4); }

  .btn-arrow { font-size: 1.1rem; transition: transform 0.2s; }
  .btn:hover .btn-arrow { transform: translateX(3px); }

  .login-footer {
    text-align: center;
    font-size: 0.75rem;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
`;
document.head.appendChild(style);

render();

// Check if email was successfully verified via URL param redirect
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('verified') === 'true') {
  const err = document.getElementById('auth-error');
  if (err) {
    err.className = 'alert alert-success';
    err.textContent = 'Email verified! You can now sign on.';
    err.classList.remove('hidden');
    // Clean up url parameters without reloading the page
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}
