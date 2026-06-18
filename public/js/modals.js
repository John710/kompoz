const Modals = (() => {
  let _confirmCallback = null;

  function openNewFile(forceType) {
    document.getElementById('newFileName').value = '';
    const loc = forceType || 'compose';
    document.getElementById('newFileLocation').value = loc;
    _updateNewFilePath();
    _open('newFileModal');
    setTimeout(() => document.getElementById('newFileName').focus(), 100);
  }

  function _updateNewFilePath() {
    const loc = document.getElementById('newFileLocation').value;
    let name = document.getElementById('newFileName').value.trim();
    let fullPath = '';
    if (loc === 'root') {
      if (name && !/\.(yml|yaml)$/.test(name)) name += '.yml';
      fullPath = name;
    } else if (loc === 'compose') {
      if (name && !/\.(yml|yaml)$/.test(name)) name += '.yml';
      fullPath = name ? `compose/${name}` : 'compose/';
    } else if (loc === 'env') {
      fullPath = '.env';
    } else if (loc === 'appdata') {
      fullPath = name ? `appdata/${name}` : 'appdata/';
    } else if (loc === 'secret') {
      fullPath = name ? `secrets/${name}` : 'secrets/';
    }
    document.getElementById('newFilePath').value = fullPath;
  }

  async function submitNewFile() {
    if (!State.currentProject) { Toast.show(I18N.t('selectProjectFirst'), 'error'); return; }
    const loc  = document.getElementById('newFileLocation').value;
    let name   = document.getElementById('newFileName').value.trim();

    let filePath, fileType, template;

    if (loc === 'env') {
      filePath = '.env'; name = '.env'; fileType = 'env';
      template = Templates.env();
    } else if (loc === 'root') {
      if (!name) { Toast.show(I18N.t('enterFileName'), 'error'); return; }
      if (!/\.(yml|yaml)$/.test(name)) name += '.yml';
      filePath = name; fileType = 'root';
      template = Templates.root(name);
    } else if (loc === 'compose') {
      if (!name) { Toast.show(I18N.t('enterFileName'), 'error'); return; }
      if (!/\.(yml|yaml)$/.test(name)) name += '.yml';
      filePath = `compose/${name}`; fileType = 'compose';
      template = Templates.compose(name);
    } else if (loc === 'appdata') {
      if (!name) { Toast.show(I18N.t('enterFileName'), 'error'); return; }
      filePath = `appdata/${name}`; fileType = 'appdata';
      template = Templates.appdata(name);
    } else if (loc === 'secret') {
      if (!name) { Toast.show(I18N.t('enterFileName'), 'error'); return; }
      filePath = `secrets/${name}`; fileType = 'secret';
      template = Templates.secret();
    }

    try {
      const data = await API.createFile(State.currentProject, filePath, template);
      if (data.error) throw new Error(data.error);
      _close('newFileModal');
      Toast.show(`${I18N.t('createdToast')}: ${filePath}`, 'success');
      await App.loadFiles();
      await App.openFile(filePath, name, fileType);
    } catch(e) {
      Toast.show(I18N.t('errorDelete') + ': ' + e.message, 'error');
    }
  }

  function openNewProject() {
    document.getElementById('newProjectName').value = '';
    _open('newProjectModal');
    setTimeout(() => document.getElementById('newProjectName').focus(), 100);
  }

  async function submitNewProject() {
    const name = document.getElementById('newProjectName').value.trim();
    if (!name) { Toast.show(I18N.t('enterProjectName'), 'error'); return; }
    try {
      const data = await API.createProject(name);
      if (data.error) throw new Error(data.error);
      _close('newProjectModal');
      Toast.show(`${I18N.t('projectCreated')}: ${name}`, 'success');
      await App.switchProject(name);
      if (App.refreshProjects) await App.refreshProjects(false);
    } catch(e) {
      Toast.show(I18N.t('errorDelete') + ': ' + e.message, 'error');
    }
  }

  function confirm(title, message, callback, okLabel) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    document.getElementById('confirmOkBtn').textContent = okLabel || I18N.t('confirmBtn');
    _confirmCallback = callback;
    document.getElementById('confirmOverlay').classList.add('open');
  }

  function confirmWithPassword(title, message, callback, okLabel) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    document.getElementById('confirmOkBtn').textContent = okLabel || I18N.t('confirmBtn');
    const pwField = document.getElementById('confirmPasswordField');
    const pwInput = document.getElementById('confirmPasswordInput');
    if (pwField) pwField.style.display = '';
    if (pwInput) pwInput.value = '';
    _confirmCallback = async () => {
      if (pwField && pwField.style.display !== 'none') {
        const password = pwInput ? pwInput.value : '';
        if (!password) { Toast.show(I18N.t('enterPassword'), 'error'); return; }
        try {
          const r = await fetch('/api/verify-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
          });
          if (!r.ok) { Toast.show(I18N.t('invalidPassword'), 'error'); return; }
        } catch(e) { Toast.show(I18N.t('errorDelete') + ': ' + e.message, 'error'); return; }
      }
      if (pwInput) pwInput.value = '';
      if (pwField) pwField.style.display = 'none';
      callback();
    };
    document.getElementById('confirmOverlay').classList.add('open');
    if (pwInput) setTimeout(() => pwInput.focus(), 100);
  }

  function closeConfirm(ok) {
    document.getElementById('confirmOverlay').classList.remove('open');
    const pwField = document.getElementById('confirmPasswordField');
    const pwInput = document.getElementById('confirmPasswordInput');
    if (pwField) pwField.style.display = 'none';
    if (pwInput) pwInput.value = '';
    if (ok && _confirmCallback) _confirmCallback();
    _confirmCallback = null;
  }

  function _open(id)  { document.getElementById(id).classList.add('open'); }
  function _close(id) { document.getElementById(id).classList.remove('open'); }

  function init() {
    document.getElementById('newFileLocation').addEventListener('change', _updateNewFilePath);
    document.getElementById('newFileName').addEventListener('input', _updateNewFilePath);
    ['newFileModal','newProjectModal'].forEach(id => {
      document.getElementById(id).addEventListener('click', e => {
        if (e.target === e.currentTarget) _close(id);
      });
    });
    document.getElementById('confirmOverlay').addEventListener('click', e => {
      if (e.target === e.currentTarget) closeConfirm(false);
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        _close('newFileModal'); _close('newProjectModal'); closeConfirm(false);
      }
    });
  }

  return { init, openNewFile, submitNewFile, openNewProject, submitNewProject, confirm, confirmWithPassword, closeConfirm };
})();
