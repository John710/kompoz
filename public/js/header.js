// header.js — shared header renderer and utilities

const Header = (function () {
  let currentUser = null;

  function _makeLogo() {
    return `<a href="/" class="header-logo" data-tooltip="Home" aria-label="Home">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="m8 21 8 0M12 17v4"/><path d="m7 8 2 2-2 2M11 12h4"/></svg>
      <span>Kompoz</span>
    </a>`;
  }

  function _makeLangBtn() {
    return `<button class="header-icon-btn" id="langBtn" onclick="Header.toggleLangDropdown()" data-i18n="langLabel" data-i18n-attr="data-tooltip" aria-label="Language">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
    </button>`;
  }

  function _makeThemeToggle() {
    return `<button class="header-icon-btn theme-btn" onclick="Header.toggleTheme()" data-tooltip="Toggle theme" aria-label="Toggle theme">
      <svg class="theme-icon-dark" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      <svg class="theme-icon-light" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
    </button>`;
  }

  function _makeGithubLink() {
    return `<a class="header-icon-btn" href="https://github.com/John710/kompoz" target="_blank" rel="noopener" data-i18n="githubTooltip" data-i18n-attr="data-tooltip" aria-label="GitHub">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
      </svg>
    </a>`;
  }

  function _makeProfile() {
    return `<button class="header-profile" id="headerProfile" onclick="Header.toggleProfileDropdown()" aria-haspopup="true" aria-expanded="false">
      <span class="profile-avatar" id="profileAvatar">U</span>
      <span class="profile-name" id="profileName"><span class="skeleton-text">&nbsp;</span></span>
      <svg class="profile-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      <div class="profile-dropdown" id="profileDropdown" style="position:absolute;top:100%;right:0;margin-top:6px;background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:6px;box-shadow:0 8px 24px rgba(0,0,0,.4);z-index:100;display:none;">
        <button class="profile-dropdown-item" id="headerLangBtn" style="width:100%;text-align:left;padding:8px 12px;border-radius:6px;border:none;background:transparent;color:var(--text);font-family:var(--display);font-size:13px;cursor:pointer;transition:background .15s;">
          <span data-i18n="languageLabel">Language</span>: <strong id="headerLangVal"></strong>
        </button>
        <button class="profile-dropdown-item" id="headerLogoutBtn" onclick="Header.logout()" style="width:100%;text-align:left;padding:8px 12px;border-radius:6px;border:none;background:transparent;color:var(--text);font-family:var(--display);font-size:13px;cursor:pointer;transition:background .15s;" data-i18n="logout">Logout</button>
      </div>
    </button>`;
  }

  function render({ center = '', extraActions = '', showLang = false, showTheme = true, showGitHub = false, showProfile = true, container = null } = {}) {
    const header = document.createElement('header');
    header.className = 'header';
    header.innerHTML = `
      ${_makeLogo()}
      <div class="hcenter">${center}</div>
      <div class="header-actions">
        ${extraActions}
        ${showLang ? _makeLangBtn() : ''}
        ${showTheme ? _makeThemeToggle() : ''}
        ${showGitHub ? _makeGithubLink() : ''}
        ${showProfile ? _makeProfile() : ''}
      </div>
    `;
    const target = container || document.body;
    target.prepend(header);
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

  function toggleLangDropdown() {
    if (typeof toggleLangDropdown === 'function') {
      window.toggleLangDropdown();
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

  function init({ center = '', extraActions = '', showProfile = true, container = null } = {}) {
    render({ center, extraActions, showProfile, container });
    document.addEventListener('click', hideProfileDropdownOnClickOutside);
    loadUser();
  }

  return { init, render, loadUser, logout, toggleProfileDropdown, toggleTheme, toggleLangDropdown, get currentUser() { return currentUser; } };
})();
