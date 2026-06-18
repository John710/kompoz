const Sidebar = (() => {
  const TYPE_COLOR = {
    root: 'var(--root-tag)', compose: 'var(--comp-tag)',
    env: 'var(--yellow)', appdata: 'var(--purple)', secret: 'var(--red)'
  };
  const TYPE_LABEL = {
    root: 'Root', compose: 'compose/', env: '.env',
    appdata: 'appdata/', secret: 'secrets/'
  };
  const GROUP_ORDER = ['root','env','compose','appdata','secret'];

  function renderFiles(files) {
    const groups = {};
    GROUP_ORDER.forEach(t => { groups[t] = []; });
    files.forEach(f => { if (groups[f.type]) groups[f.type].push(f); });

    let html = '';
    GROUP_ORDER.forEach(type => {
      const list = groups[type];
      if (!list.length) return;
      html += `<div class="file-group">
        <div class="file-group-label">
          <div class="fg-dot" style="background:${TYPE_COLOR[type]}"></div>
          ${TYPE_LABEL[type]}
          <span class="count">${list.length}</span>
        </div>`;
      list.forEach(f => { html += _item(f); });
      html += '</div>';
    });

    if (!files.length) {
      html = `<div class="sidebar-empty" data-i18n-html="noFiles">Нет файлов.<br>Создайте первый файл.</div>`;
    }

    document.getElementById('fileList').innerHTML = html;
    I18N.refresh();
    updateActive();
  }

  function _escHtml(s) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return s.replace(/[&<>"']/g, c => map[c]);
  }

  function _item(f) {
    const tab = State.openTabs.find(t => t.path === f.path);
    const isActive   = State.activeTab === f.path;
    const isModified = tab && tab.modified;
    const ep = _escHtml(_esc(f.path));
    const en = _escHtml(_esc(f.name));
    return `<div class="file-item ${isActive?'active':''} ${isModified?'modified':''}"
      onclick="App.openFile('${ep}','${en}','${f.type}')" data-path="${_escHtml(f.path)}">
      <div class="file-tag" style="background:${TYPE_COLOR[f.type]||'var(--text3)'}"></div>
      <div class="file-name">${_escHtml(f.name)}</div>
      <div class="file-actions">
        <button class="file-action-btn danger"
          onclick="event.stopPropagation();App.confirmDeleteFile('${ep}')" title="${_escHtml(I18N.t('deleteFileTitle'))}">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
            <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/>
          </svg>
        </button>
      </div>
    </div>`;
  }

  function updateActive() {
    document.querySelectorAll('.file-item').forEach(el => {
      const p = el.dataset.path;
      el.classList.toggle('active', p === State.activeTab);
      const tab = State.openTabs.find(t => t.path === p);
      el.classList.toggle('modified', !!(tab && tab.modified));
    });
  }

  function setLoading() {
    document.getElementById('fileList').innerHTML =
      `<div class="loading"><div class="spinner"></div><span data-i18n="loading">${I18N.t('loading')}</span></div>`;
  }

  function setFileCount(n) {
    document.getElementById('fileCount').textContent = `${n} ${I18N.t('fileCount')}`;
  }

  function _esc(s) { return s.replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }

  return { renderFiles, updateActive, setLoading, setFileCount };
})();
