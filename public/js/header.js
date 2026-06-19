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
    return `<div class="github-wrap" id="githubWrap" style="position:relative;">
      <button class="header-icon-btn" id="githubBtn" onclick="Header.toggleGithubMenu()" data-i18n="githubTooltip" data-i18n-attr="data-tooltip" aria-label="GitHub">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
        </svg>
      </button>
      <div class="github-dropdown" id="githubDropdown" style="display:none;position:absolute;top:calc(100% + 8px);right:0;width:220px;background:var(--bg3);border:1px solid var(--border);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.4);z-index:100;overflow:hidden;animation:fadeDown .15s ease;">
        <div class="gh-row" style="padding:9px 12px;font-size:12px;font-weight:600;color:var(--text);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12..."/></svg>
          Kompoz <span id="ghVersionVal" style="color:var(--text3);font-weight:500;"></span>
        </div>
        <a href="https://github.com/John710/kompoz/issues" target="_blank" rel="noopener" class="gh-item" style="display:flex;align-items:center;gap:8px;padding:9px 12px;font-size:13px;color:var(--text);text-decoration:none;transition:background .1s;"
          onmouseenter="this.style.background='var(--bg4)'" onmouseleave="this.style.background=''">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Report an issue
        </a>
        <a href="https://github.com/John710/kompoz" target="_blank" rel="noopener" class="gh-item" style="display:flex;align-items:center;gap:8px;padding:9px 12px;font-size:13px;color:var(--text);text-decoration:none;transition:background .1s;"
          onmouseenter="this.style.background='var(--bg4)'" onmouseleave="this.style.background=''">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          Star on GitHub
        </a>
      </div>
    </div>`;
  }

  function _makeProfile() {
    return `<button class="header-profile" id="profileBlock" onclick="toggleProfileDropdown()" aria-haspopup="true" aria-expanded="false">
      <span class="profile-avatar" id="profileAvatar">U</span>
      <span class="profile-name" id="profileName"><span class="skeleton-text">&nbsp;</span></span>
      <svg class="profile-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
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
      const res = await fetch('/api/me', { cache: 'no-store', credentials: 'same-origin' });
      if (!res.ok) return;
      const d = await res.json();
      const nameEl = document.getElementById('profileName');
      const avatarEl = document.getElementById('profileAvatar');
      if (d.enabled && d.user) {
        currentUser = d.user;
        if (nameEl) nameEl.textContent = d.user.name || d.user.username || 'User';
        if (avatarEl) {
          if (d.user.avatar) {
            avatarEl.innerHTML = `<img src="${d.user.avatar}" style="width:22px;height:22px;border-radius:50%;object-fit:cover;">`;
          } else {
            avatarEl.textContent = (d.user.name || d.user.username || 'U').charAt(0).toUpperCase();
          }
        }
      } else {
        if (nameEl) nameEl.textContent = 'User';
        if (avatarEl) avatarEl.textContent = 'U';
      }
    } catch (e) {
      // silently ignore
    }
  }

  async function loadVersion() {
    try {
      const r = await fetch('/api/version', { cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      const el = document.getElementById('ghVersionVal');
      if (el && d.version) el.textContent = 'v' + d.version;
    } catch {}
  }

  async function logout() {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
    } catch (e) {}
    window.location.href = '/';
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

  function toggleGithubMenu() {
    const dd = document.getElementById('githubDropdown');
    if (!dd) return;
    const willShow = dd.style.display === 'none';
    dd.style.display = willShow ? 'block' : 'none';
  }

  function hideGithubMenuOnClickOutside(e) {
    const wrap = document.getElementById('githubWrap');
    const dd = document.getElementById('githubDropdown');
    if (!dd || dd.style.display === 'none') return;
    if (wrap && wrap.contains(e.target)) return;
    dd.style.display = 'none';
  }

  function init({ center = '', extraActions = '', showLang = false, showTheme = true, showGitHub = false, showProfile = true, container = null } = {}) {
    render({ center, extraActions, showLang, showTheme, showGitHub, showProfile, container });
    loadUser();
    loadVersion();
    document.addEventListener('click', hideGithubMenuOnClickOutside);
  }


  return { init, render, loadUser, logout, toggleTheme, toggleLangDropdown, toggleGithubMenu, get currentUser() { return currentUser; } };
})();
