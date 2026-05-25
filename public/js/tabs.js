const Tabs = (() => {
  function render() {
    const bar = document.getElementById('tabBar');
    const tabs = State.openTabs;
    const active = State.activeTab;
    const typeColors = { root:'var(--root-tag)', compose:'var(--comp-tag)',
                         env:'var(--yellow)', appdata:'var(--purple)', secret:'var(--red)' };
    let html = '';
    tabs.forEach(t => {
      const isActive = active === t.path;
      const color = typeColors[t.type] || 'var(--text3)';
      html += `<div class="tab ${isActive?'active':''}" onclick="App.setActiveTab('${_esc(t.path)}')" data-path="${_esc(t.path)}">
        <div class="tab-dot" style="background:${color}"></div>
        <span>${t.name}</span>
        ${t.modified ? '<span class="tab-modified">●</span>' : ''}
        <button class="tab-close" onclick="event.stopPropagation();App.closeTab('${_esc(t.path)}')" title="${I18N.t('closeTab')}">×</button>
      </div>`;
    });
    html += `<div class="tab-add" onclick="Modals.openNewFile()" title="${I18N.t('newFileTooltip')}">+</div>`;
    bar.innerHTML = html;
  }
  function _esc(s) { return s.replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }
  return { render };
})();
