function renderHeader(config = {}) {
  const header = document.createElement('header');
  header.className = 'header';
  
  let centerHtml = '';
  
  if (config.showBack) {
    centerHtml += `<a href="${config.showBack.href}" class="btn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg><span data-i18n="${config.showBack.i18n}"></span></a>`;
  }
  if (config.showProjectSelector) {
    centerHtml += `<div class="project-selector" id="projectSelector" onclick="App.toggleProjectDropdown()"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg><span class="proj-name" id="projectSelectorName"></span><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></div>`;
  }
  if (config.hcenter) {
    centerHtml += `<div class="hcenter"><span class="proj-label" data-i18n="${config.hcenter.labelI18n}"></span><span class="proj-name" id="${config.hcenter.valueId}">—</span></div>`;
  }
  if (config.navButtons) {
    config.navButtons.forEach(b => {
      const activeClass = b.active ? ' active' : '';
      const action = b.onclick ? `onclick="${b.onclick}"` : `href="${b.href}"`;
      centerHtml += `<a class="btn${activeClass}" ${action}>${b.icon}<span data-i18n="${b.i18n}"></span></a>`;
    });
  }
  
  header.innerHTML = `
    <div class="header-logo">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="m8 21 8 0M12 17v4"/><path d="m7 8 2 2-2 2M11 12h4"/></svg>
      <span data-i18n="appTitle"></span>
    </div>
    <div class="header-center">${centerHtml}</div>
    <div class="header-actions">
      <div class="header-icon-btn" id="langBtn" onclick="toggleLangDropdown()" data-i18n="langLabel" data-i18n-attr="title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></div>
      <div class="header-icon-btn" id="themeBtn" onclick="Themes.toggle()" data-i18n="themeLabel" data-i18n-attr="title"><svg class="theme-icon-dark" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg><svg class="theme-icon-light" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg></div>
      <a class="header-icon-btn" href="https://github.com/John710/kompoz" target="_blank" rel="noopener" data-i18n="githubTooltip" data-i18n-attr="data-tooltip"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg></a>
      <div class="header-profile" id="profileBlock" onclick="toggleProfileDropdown()">
        <div class="profile-avatar" id="profileAvatar">U</div>
        <span class="profile-name" id="profileName"><span class="skeleton-text" style="display:inline-block;width:60px;height:14px;background:linear-gradient(90deg,var(--bg3) 25%,var(--bg4) 50%,var(--bg3) 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:4px;">&nbsp;</span></span>
        <svg class="profile-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
    </div>
  `;
  
  const firstChild = document.body.firstChild;
  if (firstChild) {
    document.body.insertBefore(header, firstChild);
  } else {
    document.body.appendChild(header);
  }
  
  // Immediate localStorage read to prevent flicker
  const savedName = localStorage.getItem('ce-user-name');
  const savedAvatar = localStorage.getItem('ce-user-avatar');
  const profileNameEl = document.getElementById('profileName');
  const profileAvatarEl = document.getElementById('profileAvatar');
  if (profileNameEl && savedName) profileNameEl.textContent = savedName;
  if (profileAvatarEl) {
    if (savedAvatar) {
      profileAvatarEl.style.display = '';
      profileAvatarEl.innerHTML = `<img src="${savedAvatar}" style="width:22px;height:22px;border-radius:50%;object-fit:cover;">`;
    } else if (savedName) {
      profileAvatarEl.style.display = 'none';
    }
  }
  
  loadUser();
}

function toggleProfileDropdown() {
  const existing = document.getElementById('profileDropdown');
  if (existing) { existing.remove(); return; }
  const btn = document.getElementById('profileBlock');
  if (!btn) return;
  const rect = btn.getBoundingClientRect();
  const ddWidth = Math.max(rect.width, 140);
  let left = rect.left;
  let right = 'auto';
  if (rect.left + ddWidth > window.innerWidth - 8) {
    left = 'auto';
    right = (window.innerWidth - rect.right) + 'px';
  }
  const dd = document.createElement('div');
  dd.id = 'profileDropdown';
  dd.className = 'proj-dropdown';
  dd.style.cssText = `top:${rect.bottom + 4}px;left:${left}px;right:${right};width:${ddWidth}px;`;
  dd.innerHTML = `<div class="proj-dropdown-item" onclick="logout();document.getElementById('profileDropdown')?.remove()">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
    ${I18N.t('logout')}
  </div>`;
  document.body.appendChild(dd);
  requestAnimationFrame(() => {
    document.addEventListener('click', function close(e) {
      if (!dd.contains(e.target) && e.target !== btn) { dd.remove(); document.removeEventListener('click', close); }
    });
  });
}

async function logout() {
  try { await fetch('/api/logout', { method: 'POST' }); } catch {}
  localStorage.removeItem('ce-user-name');
  localStorage.removeItem('ce-user-avatar');
  window.location.href = '/login.html';
}

async function loadUser() {
  const savedName = localStorage.getItem('ce-user-name');
  const savedAvatar = localStorage.getItem('ce-user-avatar');
  if (savedName) {
    const el = document.getElementById('profileName');
    if (el) el.textContent = savedName;
  }
  const av = document.getElementById('profileAvatar');
  if (av) {
    if (savedAvatar) {
      av.style.display = '';
      av.innerHTML = `<img src="${savedAvatar}" style="width:22px;height:22px;border-radius:50%;object-fit:cover;">`;
    } else if (savedName) {
      av.style.display = 'none';
    }
  }
  try {
    const r = await fetch('/api/me', { cache: 'no-store' });
    if (!r.ok) return;
    const d = await r.json();
    if (d.enabled && d.user) {
      localStorage.setItem('ce-user-name', d.user.name || '');
      localStorage.setItem('ce-user-avatar', d.user.avatar || '');
      const el = document.getElementById('profileName');
      if (el) el.textContent = d.user.name;
      if (av) {
        if (d.user.avatar) {
          av.style.display = '';
          av.innerHTML = `<img src="${d.user.avatar}" style="width:22px;height:22px;border-radius:50%;object-fit:cover;">`;
        } else {
          av.style.display = 'none';
        }
      }
    } else {
      // Auth disabled — show fallback
      const el = document.getElementById('profileName');
      if (el) el.textContent = 'User';
    }
  } catch {}
}