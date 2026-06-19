// header.js — shared header renderer and utilities

const Header = (function () {
  let currentUser = null;

  function _makeLogo() {
    return `<a href="/" class="header-logo" data-tooltip="Home" aria-label="Home">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
      <span>Kompoz</span>
    </a>`;
  }

  function _makeThemeToggle() {
    return `<button class="header-icon-btn theme-btn" onclick="Header.toggleTheme()" data-tooltip="Toggle theme" aria-label="Toggle theme">
      <svg class="theme-icon-dark" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      <svg class="theme-icon-light" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
    </button>`;
  }

  function _makeProfile() {
    return `<button class="header-profile" id="headerProfile" onclick="Header.toggleProfileDropdown()" aria-haspopup="true" aria-expanded="false">
      <span class="profile-avatar" id="profileAvatar"></span>
      <span class="profile-name" id="profileName"></span>
      <svg class="profile-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      <div class="profile-dropdown" id="profileDropdown" style="position:absolute;top:100%;right:0;margin-top:6px;background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:6px;box-shadow:0 8px 24px rgba(0,0,0,.4);z-index:100;display:none;">
        <button class="profile-dropdown-item" id="headerLangBtn" style="width:100%;text-align:left;padding:8px 12px;border-radius:6px;border:none;background:transparent;color:var(--text);font-family:var(--display);font-size:13px;cursor:pointer;transition:background .15s;">
          <span data-i18n="languageLabel">Language</span>: <strong id="headerLangVal"></strong>
        </button>
        <button class="profile-dropdown-item" id="headerLogoutBtn" onclick="Header.logout()" style="width:100%;text-align:left;padding:8px 12px;border-radius:6px;border:none;background:transparent;color:var(--text);font-family:var(--display);font-size:13px;cursor:pointer;transition:background .15s;" data-i18n="logout">Logout</button>
      </div>
    </button>`;
  }

  function render({ center = '', extraActions = '', showProfile = true }) {
    const header = document.createElement('header');
    header.className = 'header';
    header.innerHTML = `
      ${_makeLogo()}
      <div class="hcenter">${center}</div>
      <div class="header-actions">
        ${extraActions}
        ${_makeThemeToggle()}
        ${showProfile ? _makeProfile() : ''}
      </div>
    `;
    document.body.prepend(header);
  }

  async function loadUser() {
    try {
      const res = await fetch('/api/profile', { credentials: 'same-origin' });
      if (!res.ok) return;
      const user = await res.json();
      currentUser = user;
      const nameEl = document.getElementById('profileName');
      const avatarEl = document.getElementById('profileAvatar');
      if (nameEl) nameEl.textContent = user.name || user.username || 'User';
      if (avatarEl) avatarEl.textContent = (user.name || user.username || 'U').charAt(0).toUpperCase();
    } catch (e) {
      // silently ignore
    }
  }

  async function logout() {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
    } catch (e) {}
    window.location.href = '/';
  }

  function toggleProfileDropdown() {
    const dd = document.getElementById('profileDropdown');
    if (!dd) return;
    const isVisible = dd.style.display !== 'none';
    dd.style.display = isVisible ? 'none' : 'block';
    const btn = document.getElementById('headerProfile');
    if (btn) btn.setAttribute('aria-expanded', String(!isVisible));
  }

  function toggleTheme() {
    if (typeof Themes !== 'undefined' && Themes.toggle) {
      Themes.toggle();
    }
  }

  function hideProfileDropdownOnClickOutside(e) {
    const dd = document.getElementById('profileDropdown');
    const btn = document.getElementById('headerProfile');
    if (!dd || dd.style.display === 'none') return;
    if (btn && btn.contains(e.target)) return;
    if (dd.contains(e.target)) return;
    dd.style.display = 'none';
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function init({ center = '', extraActions = '', showProfile = true } = {}) {
    render({ center, extraActions, showProfile });
    document.addEventListener('click', hideProfileDropdownOnClickOutside);
    loadUser();
  }

  return { init, render, loadUser, logout, toggleProfileDropdown, toggleTheme, get currentUser() { return currentUser; } };
})();
