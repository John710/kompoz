const Tabs = (() => {
  function render() {
    const bar = document.getElementById('tabBar');
    const tabs = State.openTabs;
    const active = State.activeTab;
    const typeColors = { root:'var(--root-tag)', compose:'var(--comp-tag)',
                         env:'var(--yellow)', appdata:'var(--purple)', secret:'var(--red)' };
    bar.innerHTML = '';
    tabs.forEach(t => {
      const isActive = active === t.path;
      const color = typeColors[t.type] || 'var(--text3)';
      const tab = document.createElement('div');
      tab.className = 'tab' + (isActive ? ' active' : '');
      tab.dataset.path = t.path;
      const dot = document.createElement('div');
      dot.className = 'tab-dot';
      dot.style.background = color;
      tab.appendChild(dot);
      const nameSpan = document.createElement('span');
      nameSpan.textContent = t.name;
      tab.appendChild(nameSpan);
      if (t.modified) {
        const modified = document.createElement('span');
        modified.className = 'tab-modified';
        modified.textContent = '●';
        tab.appendChild(modified);
      }
      const closeBtn = document.createElement('button');
      closeBtn.className = 'tab-close';
      closeBtn.textContent = '×';
      closeBtn.title = I18N.t('closeTab');
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        App.closeTab(t.path);
      });
      tab.appendChild(closeBtn);
      tab.addEventListener('click', () => App.setActiveTab(t.path));
      bar.appendChild(tab);
    });
    const addBtn = document.createElement('div');
    addBtn.className = 'tab-add';
    addBtn.textContent = '+';
    addBtn.title = I18N.t('newFileTooltip');
    addBtn.addEventListener('click', () => Modals.openNewFile());
    bar.appendChild(addBtn);
  }
  return { render };
})();
