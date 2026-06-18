// rightpanel.js — right panel: networks, env vars, secrets

const RightPanel = (() => {

  function _parseNetworks() {
    const bySource = {};
    State.openTabs.forEach(tab => {
      const nets = _extractNetworks(tab.content, tab.name);
      if (nets.length) bySource[tab.name] = nets;
    });
    return bySource;
  }

  function _extractNetworks(yaml, sourceName) {
    const nets = [];
    const lines = yaml.split('\n');
    let inNets = false, cur = null;

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const trimmed = raw.trimStart();
      const indent = raw.length - trimmed.length;
      if (!trimmed || trimmed.startsWith('#')) continue;

      if (indent === 0 && trimmed === 'networks:') { inNets = true; cur = null; continue; }
      if (inNets && indent === 0 && trimmed !== 'networks:') {
        if (cur) nets.push(cur);
        inNets = false; cur = null; continue;
      }
      if (!inNets) continue;

      if (indent === 2 && trimmed.endsWith(':') && !trimmed.startsWith('-')) {
        if (cur) nets.push(cur);
        cur = { name: trimmed.slice(0,-1).trim(), sourceName, driver: null, internal: false, external: false, subnet: null };
        continue;
      }
      if (cur && indent === 4) {
        if (trimmed.startsWith('driver:'))  cur.driver   = trimmed.replace('driver:','').trim();
        if (trimmed.includes('internal: true')) cur.internal = true;
        if (trimmed.includes('external: true')) cur.external = true;
      }
      if (cur && indent === 10 && trimmed.startsWith('subnet:'))
        cur.subnet = trimmed.replace('subnet:','').trim();
    }
    if (inNets && cur) nets.push(cur);
    return nets;
  }

  function _parseEnvVars() {
    const vars = [];
    State.openTabs.filter(t => t.type === 'env').forEach(tab => {
      tab.content.split('\n').forEach(line => {
        const t = line.trim();
        if (!t || t.startsWith('#')) return;
        const eq = t.indexOf('=');
        if (eq < 0) return;
        const key = t.slice(0, eq).trim();
        const val = t.slice(eq+1).trim();
        if (key) vars.push({ key, val, source: tab.name });
      });
    });
    return vars;
  }

  function _parseSecrets() {
    return State.allFiles.filter(f => f.type === 'secret').map(f => ({
      name: f.name,
      path: f.path,
    }));
  }

  async function render() {
    _renderTabs();
    const tab = State.rightPanelTab;
    if (tab === 'networks') await _renderNetworks();
    else if (tab === 'env') await _renderEnv();
    else if (tab === 'secrets') _renderSecrets();
  }

  function _renderTabs() {
    const tabs = [
      { id: 'networks', label: I18N.t('networks'), icon: '🔗' },
      { id: 'env',      label: I18N.t('env'),        icon: '⚙' },
      { id: 'secrets',  label: I18N.t('secrets'),   icon: '🔑' },
    ];
    const bar = document.getElementById('rightPanelTabs');
    bar.innerHTML = tabs.map(t =>
      `<div class="rp-tab ${t.id === State.rightPanelTab ? 'active' : ''}"
        onclick="RightPanel.switchTab('${t.id}')">
        <span>${t.icon}</span> ${t.label}
      </div>`
    ).join('');
  }

  function switchTab(id) {
    State.rightPanelTab = id;
    render();
  }

  async function _renderNetworks() {
    const container = document.getElementById('rightPanelBody');

    // Collect all YAML files from project
    const yamlFiles = (State.allFiles || []).filter(f =>
      f.type === 'root' || f.type === 'compose' || f.name.endsWith('.yml') || f.name.endsWith('.yaml')
    );
    const openYamlTabs = (State.openTabs || []).filter(t =>
      t.type === 'root' || t.type === 'compose' || t.name.endsWith('.yml') || t.name.endsWith('.yaml')
    );
    const allPaths = new Map();
    yamlFiles.forEach(f => allPaths.set(f.path, f.name));
    openYamlTabs.forEach(t => allPaths.set(t.path, t.name));

    if (!allPaths.size) {
      container.innerHTML = `<div class="rp-empty">${I18N.t('rpNetworksEmpty')}<br><code style="color:var(--green)">networks:</code></div>`;
      return;
    }

    // Load contents and parse networks
    const netsByFile = [];
    for (const [path, name] of allPaths) {
      let content = '';
      const openTab = State.openTabs.find(t => t.path === path);
      if (openTab) {
        content = openTab.content;
      } else if (State.currentProject) {
        try {
          const data = await API.readFile(State.currentProject, path);
          content = data.content || '';
        } catch(e) { content = ''; }
      }
      const nets = _extractNetworks(content, name);
      if (nets.length) netsByFile.push({ name, nets });
    }

    if (!netsByFile.length) {
      container.innerHTML = `<div class="rp-empty">${I18N.t('rpNetworksEmpty')}<br><code style="color:var(--green)">networks:</code></div>`;
      return;
    }

    let html = '';
    netsByFile.forEach((file, idx) => {
      if (idx > 0) html += '<div class="rp-file-sep"></div>';
      html += `<div class="rp-group-label">${file.name}</div>`;
      file.nets.forEach(net => {
        const badges = [];
        if (net.external) badges.push('<span class="rp-badge ext">external</span>');
        if (net.internal) badges.push('<span class="rp-badge int">internal</span>');
        if (net.driver)   badges.push(`<span class="rp-badge">${net.driver}</span>`);
        html += `<div class="rp-item" onclick="RightPanel.insertNetwork('${_esc(net.name)}')" title="${I18N.t('insertHint')}">
          <div class="rp-item-row">
            <div class="rp-dot net"></div>
            <span class="rp-item-name">${net.name}</span>
            ${badges.join('')}
          </div>
          ${net.subnet ? `<div class="rp-item-sub">${net.subnet}</div>` : ''}
          <div class="rp-item-hint">${I18N.t('insertHint')}</div>
        </div>`;
      });
    });
    container.innerHTML = html;
  }

  async function _renderEnv() {
    const container = document.getElementById('rightPanelBody');

    // Collect .env files from project (both opened tabs and all files)
    const envFiles = (State.allFiles || []).filter(f => f.type === 'env' || f.name.endsWith('.env'));
    const openEnvTabs = (State.openTabs || []).filter(t => t.type === 'env' || t.name.endsWith('.env'));
    const allEnvPaths = new Map();
    envFiles.forEach(f => allEnvPaths.set(f.path, f.name));
    openEnvTabs.forEach(t => allEnvPaths.set(t.path, t.name));

    if (!allEnvPaths.size) {
      container.innerHTML = `<div class="rp-empty">${I18N.t('rpEnvEmpty')}<br><code style="color:var(--yellow)">.env</code> ${I18N.t('orCreateNewEnv')}</div>
        <div style="padding:8px">
          <button class="rp-create-btn" onclick="RightPanel.createEnvFile()">${I18N.t('createEnv')}</button>
        </div>`;
      return;
    }

    // Load contents
    const varsByFile = [];
    for (const [path, name] of allEnvPaths) {
      let content = '';
      const openTab = State.openTabs.find(t => t.path === path);
      if (openTab) {
        content = openTab.content;
      } else if (State.currentProject) {
        try {
          const data = await API.readFile(State.currentProject, path);
          content = data.content || '';
        } catch(e) { content = ''; }
      }
      const vars = [];
      content.split('\n').forEach(line => {
        const t = line.trim();
        if (!t || t.startsWith('#')) return;
        const eq = t.indexOf('=');
        if (eq < 0) return;
        const key = t.slice(0, eq).trim();
        const val = t.slice(eq + 1).trim();
        if (key) vars.push({ key, val });
      });
      if (vars.length) varsByFile.push({ name, vars });
    }

    if (!varsByFile.length) {
      container.innerHTML = `<div class="rp-empty">${I18N.t('rpEnvEmpty')}<br><code style="color:var(--yellow)">.env</code> ${I18N.t('orCreateNewEnv')}</div>
        <div style="padding:8px">
          <button class="rp-create-btn" onclick="RightPanel.createEnvFile()">${I18N.t('createEnv')}</button>
        </div>`;
      return;
    }

    let html = '';
    varsByFile.forEach((file, idx) => {
      if (idx > 0) html += '<div class="rp-file-sep"></div>';
      html += `<div class="rp-group-label">${file.name}</div>`;
      file.vars.forEach(v => {
        html += `<div class="rp-item" onclick="RightPanel.insertEnvVar('${_esc(v.key)}')" title="${I18N.t('insertHint')} $${v.key}">
          <div class="rp-item-row">
            <div class="rp-dot env"></div>
            <span class="rp-item-name">$${v.key}</span>
          </div>
          ${v.val ? `<div class="rp-item-sub">${v.val.slice(0,28)}${v.val.length>28?'…':''}</div>` : ''}
          <div class="rp-item-hint">${I18N.t('insertHint')}</div>
        </div>`;
      });
    });
    container.innerHTML = html;
  }

  function _renderSecrets() {
    const container = document.getElementById('rightPanelBody');
    const secrets = _parseSecrets();

    if (!secrets.length) {
      container.innerHTML = `<div class="rp-empty">${I18N.t('rpSecretsEmpty')}<br><code style="color:var(--red)">secrets/</code></div>
        <div style="padding:8px">
          <button class="rp-create-btn" onclick="Modals.openNewFile('secret')">${I18N.t('createSecret')}</button>
        </div>`;
      return;
    }

    let html = `<div class="rp-group-label">${I18N.t('clickToInsert')}</div>`;
    secrets.forEach(s => {
      html += `<div class="rp-item" onclick="RightPanel.insertSecret('${_esc(s.name)}')" title="${I18N.t('insertHint')}">
        <div class="rp-item-row">
          <div class="rp-dot secret"></div>
          <span class="rp-item-name">${s.name}</span>
        </div>
        <div class="rp-item-hint">${I18N.t('insertIntoService')}</div>
      </div>`;
    });
    container.innerHTML = html;
  }

  function insertNetwork(netName) {
    if (!State.activeTab) { Toast.show(I18N.t('openFileFirst'), 'error'); return; }
    Editor.insertAtCursor(`- ${netName}`);
    Toast.show(`${I18N.t('insertedToast')}: - ${netName}`, 'info');
  }

  function insertEnvVar(key) {
    if (!State.activeTab) { Toast.show(I18N.t('openFileFirst'), 'error'); return; }
    Editor.insertAtCursor(`$${key}`);
    Toast.show(`${I18N.t('insertedToast')}: $${key}`, 'info');
  }

  function insertSecret(secretName) {
    if (!State.activeTab) { Toast.show(I18N.t('openFileFirst'), 'error'); return; }
    Editor.insertAtCursor(`- ${secretName}`);
    Toast.show(`${I18N.t('insertedToast')}: - ${secretName}`, 'info');
  }

  async function createEnvFile() {
    if (!State.currentProject) return;
    try {
      const data = await API.createFile(State.currentProject, '.env', Templates.env());
      if (data.error) throw new Error(data.error);
      Toast.show(I18N.t('createEnv'), 'success');
      await App.loadFiles();
      await App.openFile('.env', '.env', 'env');
    } catch(e) {
      Toast.show(I18N.t('errorDelete') + ': ' + e.message, 'error');
    }
  }

  function _esc(s) { return s.replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }

  return { render, switchTab, insertNetwork, insertEnvVar, insertSecret, createEnvFile };
})();
