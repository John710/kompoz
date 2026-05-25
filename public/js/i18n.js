// i18n.js — internationalization with external JSON locales

const I18N = (() => {
  const DEFAULT_LANG = 'en';
  const STORAGE_KEY = 'ce-lang';

  // Minimal inline fallback so UI isn't blank before fetch
  const fallback = {
    appTitle: 'Kompoz', loading: 'Loading...', selectProject: 'Select project',
    refresh: 'Refresh', map: 'Map', noProjectsTitle: 'No projects',
    noProjectsHint: 'Create your first project to get started',
    projectCountLabel: 'projects', deleteProject: 'Delete project',
    save: 'Save', langLabel: 'Language', themeLabel: 'Theme',
    lightTheme: 'Light', darkTheme: 'Dark', newFile: 'New file',
    searchPlaceholder: 'Search...', noFiles: 'No files.<br>Create the first file.',
    fileCount: 'files', fileTypesTitle: 'File types',
    legendRoot: 'root — main compose', legendCompose: 'compose/ — service file',
    legendEnv: '.env — variables', legendAppdata: 'appdata/ — configs',
    legendSecret: 'secrets/ — secrets', statusTitle: 'Status',
    unsavedChanges: 'unsaved changes', selectFile: 'Select a file to edit',
    orCreateNew: 'or create a new one', rollback: 'Rollback', copy: 'Copy',
    lines: 'lines', chars: 'chars', unsaved: '● unsaved', savedStatus: '✓ saved',
    lintErrors: 'error|errors', lintWarnings: 'warnings',
    networks: 'Networks', env: 'ENV', secrets: 'Secrets',
    rpNetworksEmpty: 'Open a file with a', rpEnvEmpty: 'Open a file',
    orCreateNewEnv: 'or create a new one', createEnv: '+ Create .env',
    rpSecretsEmpty: 'No secrets.<br>Create a file in the',
    createSecret: '+ Create secret', insertHint: '↵ insert',
    insertIntoService: '↵ insert into service', clickToInsert: 'Click — inserts into service',
    rpFooter: 'Click an element<br>to insert at cursor', closeTab: 'Close',
    newFileTooltip: 'New file', newFileTitle: 'New file',
    typeLocation: 'Type / location', optionCompose: 'compose/ — service file',
    optionRoot: 'root — main docker-compose', optionEnv: '.env — environment variables',
    optionAppdata: 'appdata/ — app config', optionSecret: 'secrets/ — secret',
    fileName: 'File name', fullPath: 'Full path', cancel: 'Cancel', create: 'Create',
    newProjectTitle: 'New project', projectNameLabel: 'Name (latin, digits, _ -)',
    confirmBtn: 'Confirm', errorLoadProjects: 'Error loading projects',
    errorLoadFiles: 'Error loading files', errorOpenFile: 'Error opening file',
    errorSave: 'Error saving', errorDelete: 'Error', errorCopy: 'Failed to copy',
    selectProjectFirst: 'Select a project first', openFileFirst: 'Open a file first',
    enterFileName: 'Enter file name', enterProjectName: 'Enter project name',
    savedToast: 'Saved', createdToast: 'Created', projectCreated: 'Project created',
    projectDeleted: 'Project deleted', fileDeleted: 'File deleted',
    restoredToast: 'Restored from backup', copiedToast: 'Copied', insertedToast: 'Inserted',
    closeWithoutSave: 'Close without saving?', hasUnsavedChanges: 'has unsaved changes',
    close: 'Close', deleteProjectTitle: 'Delete project?',
    deleteProjectMsg: 'Project and all files will be deleted.', restoreTitle: 'Rollback?',
    restoreMsg: 'Restore from .bak?', restore: 'Restore', deleteFileTitle: 'Delete file?',
    deleteFileMsg: 'will be permanently deleted.', errMissingFields: 'Missing fields',
    errFileNotFound: 'File not found', errFileExists: 'File already exists',
    errNoBackup: 'No backup found',
    errNoMount: 'No available multi-mode mount point for project creation. Add an empty folder to COMPOSE_MOUNTS.',
    errInvalidName: 'Invalid name (latin, digits, _ -)', errProjectExists: 'Project already exists',
    errProjectNotFound: 'Project not found',
    errCantDeleteDirect: 'Cannot delete direct-mode project (it is a mounted folder).',
    errPathTraversal: 'Path traversal detected', back: 'Back', containerMap: 'Container Map',
    projectLabel: 'project:', service: 'service', network: 'network', volume: 'volume',
    center: 'Center', loadingMap: 'Loading...', noProject: 'No project specified',
    noYamlFiles: 'No YAML files in project', errorPrefix: 'Error:', services: 'Services',
    volumes: 'Volumes', fileLabel: 'file:', imageLabel: 'image:', portsLabel: 'ports:',
    networksLabel: 'networks:', driverLabel: 'driver:', subnetLabel: 'subnet:',
    internalLabel: 'internal', externalLabel: 'external', namedVolume: 'named volume',
    openInEditor: 'Open in editor?', openInEditorBtn: 'Open',
    confirmPasswordLabel: 'Enter password to confirm',
    enterPassword: 'Enter password',
    invalidPassword: 'Invalid password',
    deleteProjectMenu: 'Delete project',
    allFilesWillBeDeleted: 'All project files will be permanently deleted.',
    dclintDescriptions: {}, dclintMessages: {}
  };

  let dict = { [DEFAULT_LANG]: { ...fallback } };
  let currentLang = localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG;
  let loaded = {};
  let availableLangs = [];

  async function _fetchLocales() {
    try {
      const res = await fetch('/api/locales', { cache: 'no-store' });
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      availableLangs = data.locales || [];
    } catch (e) {
      console.warn('Failed to load locale list, using fallback');
      availableLangs = [
        { code: 'en', name: 'English' },
        { code: 'ru', name: 'Русский' }
      ];
    }
  }

  async function _loadLang(lang) {
    if (loaded[lang]) return dict[lang];
    try {
      const res = await fetch(`/locales/${lang}.json`, { cache: 'no-store' });
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      dict[lang] = data;
      loaded[lang] = true;
      return data;
    } catch (e) {
      console.warn(`Failed to load locale ${lang}, using fallback`);
      dict[lang] = { ...fallback };
      loaded[lang] = true;
      return dict[lang];
    }
  }

  async function init() {
    await _fetchLocales();
    await _loadLang(DEFAULT_LANG);
    if (currentLang !== DEFAULT_LANG) {
      await _loadLang(currentLang);
    }
    document.documentElement.lang = currentLang;
    _translateDOM();
  }

  function t(key, placeholders = {}) {
    const str = dict[currentLang]?.[key] ?? dict[DEFAULT_LANG]?.[key] ?? key;
    return str.replace(/\{([^}]+)\}/g, (_, name) => placeholders[name] ?? `{${name}}`);
  }

  async function setLang(lang) {
    if (!dict[lang] && !loaded[lang]) {
      await _loadLang(lang);
    }
    if (!dict[lang]) return;
    currentLang = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
    _translateDOM();
    _emitChange();
  }

  function getLang() { return currentLang; }
  function getAvailableLangs() { return availableLangs; }

  function _translateDOM() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      const attr = el.dataset.i18nAttr;
      const val = t(key);
      if (attr) el.setAttribute(attr, val);
      else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        if (el.placeholder !== undefined) el.placeholder = val;
      } else {
        el.textContent = val;
      }
    });
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      el.innerHTML = t(el.dataset.i18nHtml);
    });
  }

  function _emitChange() {
    window.dispatchEvent(new CustomEvent('i18n-change', { detail: { lang: currentLang } }));
  }

  function translateDclint(rule, message) {
    const messages = dict[currentLang]?.dclintMessages || {};
    if (messages[message]) return messages[message];
    for (const [en, translated] of Object.entries(messages)) {
      const placeholderNames = [...en.matchAll(/\{([^}]+)\}/g)].map(m => m[1]);
      if (placeholderNames.length === 0) continue;
      let pattern = '^' + en.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
      pattern = pattern.replace(/\\"\\\{[^}]+\\\}\\"/g, '"([^"]*)"');
      pattern = pattern.replace(/\\\{[^}]+\\\}/g, '(.+)');
      try {
        const regex = new RegExp(pattern);
        const match = message.match(regex);
        if (match) {
          let result = translated;
          for (let i = 0; i < placeholderNames.length; i++) {
            result = result.replace(`{${placeholderNames[i]}}`, match[i + 1] || `{${placeholderNames[i]}}`);
          }
          return result;
        }
      } catch {}
    }
    if (rule === 'invalid-yaml') {
      return dict[currentLang]?.dclintMessages?.['YAML syntax error'] || dict[DEFAULT_LANG]?.dclintMessages?.['YAML syntax error'] || message;
    }
    return message;
  }

  return { init, t, setLang, getLang, getAvailableLangs, translateDclint, refresh: _translateDOM };
})();

// Global helper for rendering language dropdown
function toggleLangDropdown() { 
  const existing = document.getElementById('langDropdown');
  if (existing) { existing.remove(); return; }

  const btn = document.getElementById('langBtn');
  if (!btn) return;
  const rect = btn.getBoundingClientRect();
  const langs = I18N.getAvailableLangs();
  const current = I18N.getLang();

  let html = '';
  langs.forEach(l => {
    html += `<div class="proj-dropdown-item ${current === l.code ? 'active' : ''}"
      onclick="I18N.setLang('${l.code}');document.getElementById('langDropdown')?.remove()">
      ${l.name}
    </div>`;
  });

  const dd = document.createElement('div');
  dd.id = 'langDropdown';
  dd.className = 'proj-dropdown';
  dd.style.top = (rect.bottom + 4) + 'px';
  const ddWidth = Math.max(rect.width, 140);
  dd.style.width = ddWidth + 'px';
  if (rect.left + ddWidth > window.innerWidth - 8) {
    dd.style.left = 'auto';
    dd.style.right = (window.innerWidth - rect.right) + 'px';
  } else {
    dd.style.left = rect.left + 'px';
    dd.style.right = 'auto';
  }
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
