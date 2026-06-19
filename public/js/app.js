const App = (() => {

  async function init() { await I18N.init();
    Themes.init();
    Editor.init(onEditorChange);
    Modals.init();
    I18N.refresh();
    window.addEventListener('i18n-change', () => {
      Tabs.render();
      RightPanel.render();
      if (State.allFiles) {
        Sidebar.renderFiles(State.allFiles);
        Sidebar.setFileCount(State.allFiles.length);
      }
      _renderProjectSelector();
      const tab = State.getTab(State.activeTab);
      if (tab) {
        Editor.updateStatusBar(tab.modified, tab.content);
        Editor.updateToolbarPath(tab.type, tab.name);
      }
      updateLintStatus();
    });
    await _loadProjects();
  }

  // ── Projects ─────────────────────────────────────────
  async function _loadProjects(autoSwitch = true) {
    const urlProject = new URLSearchParams(location.search).get('project');
    if (urlProject) localStorage.setItem('lastProject', urlProject);
    try {
      const data = await API.getProjects();
      State.allProjects = data.projects || [];
      State.canCreate   = data.canCreate || false;
      _renderProjectSelector();
      if (autoSwitch && State.allProjects.length > 0) {
        const saved = localStorage.getItem('lastProject');
        const found = State.allProjects.find(p => p.name === saved);
        await switchProject(found ? saved : State.allProjects[0].name);
      } else {
        Sidebar.renderFiles([]);
        Sidebar.setFileCount(0);
        Editor.showEditor(false);
        RightPanel.render();
      }
    } catch(e) { Toast.show(I18N.t('errorLoadProjects'), 'error'); }
  }

  async function switchProject(name) {
    State.currentProject = name;
    State.openTabs = [];
    State.activeTab = null;
    localStorage.setItem('lastProject', name);
    _renderProjectSelector();
    Tabs.render();
    Editor.showEditor(false);
    await loadFiles();
    RightPanel.render();
    const urlFile = new URLSearchParams(location.search).get('file');
    if (urlFile) {
      const f = State.allFiles.find(x => x.path === urlFile);
      if (f) openFile(f.path, f.name, f.type);
    }
  }

  function _renderProjectSelector() {
    document.getElementById('projectSelectorName').textContent = State.currentProject || I18N.t('selectProject');
  }

  function toggleProjectDropdown() {
    const existing = document.getElementById('projDropdown');
    if (existing) { existing.remove(); return; }

    const btn = document.getElementById('projectSelector');
    const rect = btn.getBoundingClientRect();

    let html = '';
    State.allProjects.forEach(p => {
      const isActive = p.name === State.currentProject;
      const badge = p.direct
        ? `<span style="font-size:9px;padding:1px 4px;border-radius:3px;background:rgba(61,255,160,.15);color:var(--green);margin-left:4px">direct</span>`
        : '';
      html += `<div class="proj-dropdown-item ${isActive?'active':''}"
        onclick="App.switchProject('${_esc(p.name)}');document.getElementById('projDropdown')?.remove()">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <span>${p.name}</span>${badge}
        <span class="proj-count">${p.fileCount} ${I18N.pluralize(p.fileCount, 'fileCount')}</span>
      </div>`;
    });

    if (State.canCreate) {
      if (State.allProjects.length) html += '<div class="proj-dropdown-sep"></div>';
      html += `<div class="proj-dropdown-new"
        onclick="document.getElementById('projDropdown')?.remove();Modals.openNewProject()">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
        ${I18N.t('newProjectTitle')}
      </div>`;
    }

    const dd = document.createElement('div');
    dd.id = 'projDropdown';
    dd.className = 'proj-dropdown';
    dd.style.top   = (rect.bottom + 4) + 'px';
    dd.style.left  = rect.left + 'px';
    dd.style.width = Math.max(rect.width, 220) + 'px';
    dd.innerHTML = html;
    document.body.appendChild(dd);

    setTimeout(() => {
      document.addEventListener('click', function h(e) {
        if (!dd.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
          dd.remove(); document.removeEventListener('click', h);
        }
      });
    }, 0);
  }

  function toggleLangDropdown() {
    window.toggleLangDropdown();
  }

  async function confirmDeleteProject() {
    if (!State.currentProject) return;
    Modals.confirmWithPassword(I18N.t('deleteProjectTitle'),
      `${I18N.t('deleteProjectMsg')} "${State.currentProject}". ${I18N.t('allFilesWillBeDeleted')}`,
      async () => {
        try {
          const data = await API.deleteProject(State.currentProject);
          if (data.error) throw new Error(data.errorKey ? I18N.t(data.errorKey) : data.error);
          Toast.show(I18N.t('projectDeleted'), 'info');
          State.currentProject = null; State.openTabs = []; State.activeTab = null;
          localStorage.removeItem("lastProject");
          await _loadProjects(false);
        } catch(e) { Toast.show(I18N.t('errorDelete') + ': ' + e.message, 'error'); }
      }, I18N.t('deleteProject'));
  }

  async function deleteProject(name) {
    if (!name) return;
    Modals.confirmWithPassword(I18N.t('deleteProjectTitle'),
      `${I18N.t('deleteProjectMsg')} "${name}". ${I18N.t('allFilesWillBeDeleted')}`,
      async () => {
        try {
          const data = await API.deleteProject(name);
          if (data.error) throw new Error(data.errorKey ? I18N.t(data.errorKey) : data.error);
          Toast.show(I18N.t('projectDeleted'), 'info');
          if (State.currentProject === name) {
            State.currentProject = null; State.openTabs = []; State.activeTab = null;
            localStorage.removeItem("lastProject");
          }
          await _loadProjects(false);
        } catch(e) { Toast.show(I18N.t('errorDelete') + ': ' + e.message, 'error'); }
      }, I18N.t('deleteProject'));
  }

  // ── Files ─────────────────────────────────────────────
  async function loadFiles() {
    if (!State.currentProject) return;
    Sidebar.setLoading();
    try {
      const data = await API.getFiles(State.currentProject);
      State.allFiles = data.files || [];
      Sidebar.renderFiles(State.allFiles);
      Sidebar.setFileCount(State.allFiles.length);
    } catch(e) { Toast.show(I18N.t('errorLoadFiles'), 'error'); }
  }

  function filterFiles(q) {
    if (!q) { Sidebar.renderFiles(State.allFiles); return; }
    Sidebar.renderFiles(State.allFiles.filter(f => f.name.toLowerCase().includes(q.toLowerCase())));
  }

  async function openFile(filePath, fileName, fileType) {
    if (!State.currentProject) return;
    const existing = State.getTab(filePath);
    if (existing) { setActiveTab(filePath); return; }
    try {
      const data = await API.readFile(State.currentProject, filePath);
      if (data.error) throw new Error(data.errorKey ? I18N.t(data.errorKey) : data.error);
      State.setTab({ path: filePath, name: fileName, type: fileType,
                     content: data.content, original: data.content, modified: false });
      setActiveTab(filePath);
    } catch(e) { Toast.show(I18N.t('errorOpenFile') + ': ' + e.message, 'error'); }
  }

  function setActiveTab(filePath) {
    State.activeTab = filePath;
    const tab = State.getTab(filePath);
    Tabs.render();
    Sidebar.updateActive();

    if (!tab) {
      Editor.showEditor(false);
      document.getElementById('saveBtn').disabled = true;
      RightPanel.render();
      return;
    }

    Editor.showEditor(true);
    Editor.setValue(tab.content);
    Editor.setMode(tab.path);
    Editor.updateToolbarPath(tab.type, tab.name);
    Editor.updateStatusBar(tab.modified, tab.content);
    document.getElementById('saveBtn').disabled = !tab.modified;
    RightPanel.render();
  }

  function closeTab(filePath) {
    const tab = State.getTab(filePath);
    if (tab && tab.modified) {
      Modals.confirm(I18N.t('closeWithoutSave'),
        `"${tab.name}" ${I18N.t('hasUnsavedChanges')}.`,
        () => _doCloseTab(filePath), I18N.t('close'));
    } else { _doCloseTab(filePath); }
  }

  function _doCloseTab(filePath) {
    const idx = State.openTabs.findIndex(t => t.path === filePath);
    State.removeTab(filePath);
    if (State.activeTab === filePath) {
      const next = State.openTabs[Math.min(idx, State.openTabs.length - 1)];
      setActiveTab(next ? next.path : null);
    }
    Tabs.render(); Sidebar.updateActive(); RightPanel.render();
  }

  // ── Editor change ──
  function onEditorChange(value) {
    if (!State.activeTab) return;
    const tab = State.getTab(State.activeTab);
    if (!tab) return;
    tab.content = value;
    tab.modified = tab.content !== tab.original;
    document.getElementById('saveBtn').disabled = !tab.modified;
    Editor.updateStatusBar(tab.modified, value);
    Tabs.render();
    Sidebar.updateActive();
    RightPanel.render();
  }

  // ── Save ─────────────────────────────────────────────
  async function saveCurrentFile() {
    if (!State.activeTab || !State.currentProject) return;
    const tab = State.getTab(State.activeTab);
    if (!tab || !tab.modified) return;
    try {
      const data = await API.saveFile(State.currentProject, tab.path, tab.content);
      if (data.error) throw new Error(data.errorKey ? I18N.t(data.errorKey) : data.error);
      tab.original = tab.content; tab.modified = false;
      document.getElementById('saveBtn').disabled = true;
      Tabs.render(); Sidebar.updateActive();
      Editor.updateStatusBar(false, tab.content);
      Toast.show(`${I18N.t('savedToast')}: ${tab.name}`, 'success');
    } catch(e) { Toast.show(I18N.t('errorSave') + ': ' + e.message, 'error'); }
  }

  async function restoreBackup() {
    const tab = State.getTab(State.activeTab);
    if (!tab) return;
    Modals.confirm(I18N.t('restoreTitle'), `${I18N.t('restoreMsg')} "${tab.name}"?`, async () => {
      try {
        const data = await API.restoreFile(State.currentProject, tab.path);
        if (data.error) throw new Error(data.errorKey ? I18N.t(data.errorKey) : data.error);
        tab.content = data.content; tab.original = data.content; tab.modified = false;
        Editor.setValue(data.content);
        Editor.updateStatusBar(false, data.content);
        Tabs.render(); Sidebar.updateActive(); RightPanel.render();
        Toast.show(I18N.t('restoredToast'), 'success');
      } catch(e) { Toast.show(I18N.t('errorDelete') + ': ' + e.message, 'error'); }
    }, I18N.t('restore'));
  }

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(Editor.getValue());
      Toast.show(I18N.t('copiedToast') + '!', 'info');
    } catch(e) { Toast.show(I18N.t('errorCopy'), 'error'); }
  }

  async function confirmDeleteFile(filePath) {
    const f = State.allFiles.find(f => f.path === filePath);
    Modals.confirm(I18N.t('deleteFileTitle'),
      `"${f ? f.name : filePath}" ${I18N.t('deleteFileMsg')}`,
      async () => {
        try {
          const data = await API.deleteFile(State.currentProject, filePath);
          if (data.error) throw new Error(data.errorKey ? I18N.t(data.errorKey) : data.error);
          _doCloseTab(filePath);
          await loadFiles();
          Toast.show(I18N.t('fileDeleted'), 'info');
        } catch(e) { Toast.show(I18N.t('errorDelete') + ': ' + e.message, 'error'); }
      }, I18N.t('deleteFileTitle'));
  }

  function openMap() {
    if (!State.currentProject) { Toast.show(I18N.t('selectProjectFirst'), 'error'); return; }
    window.location.href = `/map.html?project=${encodeURIComponent(State.currentProject)}`;
  }

  function openNetworkMap() {
    window.location.href = `/homelab.html`;
  }

  function _esc(s) { return s.replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }

  return {
    init, switchProject, toggleProjectDropdown, toggleLangDropdown, confirmDeleteProject, deleteProject,
    loadFiles, filterFiles, openFile, setActiveTab, closeTab,
    saveCurrentFile, restoreBackup, copyAll, confirmDeleteFile, openMap, openNetworkMap,
    onEditorChange
  };
})();

document.addEventListener('DOMContentLoaded', App.init);
