// editor.js — CodeMirror editor with YAML lint

const Editor = (() => {
  let _cm = null;
  let _changeCb = null;
  let _ignoreChange = false;

  function init(onChangeCb) {
    _changeCb = onChangeCb;

    _cm = CodeMirror.fromTextArea(document.getElementById('codeEditor'), {
      mode: 'yaml',
      theme: 'ce-dark',
      lineNumbers: true,
      indentUnit: 2,
      tabSize: 2,
      indentWithTabs: false,
      lineWrapping: false,
      matchBrackets: true,
      autoCloseBrackets: true,
      styleActiveLine: true,
      gutters: ['CodeMirror-lint-markers'],
      lint: false,
      extraKeys: {
        'Tab':    cm => cm.execCommand('insertSoftTab'),
        'Ctrl-S': () => App.saveCurrentFile(),
        'Cmd-S':  () => App.saveCurrentFile(),
      },
    });

    _cm.getWrapperElement().style.height = '100%';
    _cm.getWrapperElement().style.fontSize = '13px';

    _cm.on('change', (cm, change) => {
      if (_ignoreChange) return;
      if (_changeCb) _changeCb(cm.getValue());
    });
  }

  function setValue(text) {
    if (!_cm) return;
    _ignoreChange = true;
    _cm.setValue(text || '');
    _cm.clearHistory();
    Promise.resolve().then(() => {
      _ignoreChange = false;
      _cm.refresh();
    });
  }

  function getValue() {
    return _cm ? _cm.getValue() : '';
  }

  function setMode(filePath) {
    if (!_cm) return;
    let mode = 'yaml';
    let lint = false;

    if (filePath === '.env') {
      mode = 'properties';
    } else if (filePath.endsWith('.json')) {
      mode = { name: 'javascript', json: true };
    } else if (filePath.match(/\.(yml|yaml)$/)) {
      mode = 'yaml';
      lint = _dclintFunc();
    } else {
      mode = 'text/plain';
    }

    _cm.setOption('mode', mode);
    _cm.setOption('lint', lint ? { getAnnotations: lint, async: true } : false);
  }

  function _dclintFunc() {
    let _pending = null;
    return function(text, updateLinting, options, cm) {
      if (_pending) clearTimeout(_pending);
      _pending = setTimeout(async () => {
        _pending = null;
        if (!State.currentProject || !State.activeTab) {
          updateLinting([]);
          return;
        }
        try {
          const r = await fetch('/api/files/lint', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              project: State.currentProject,
              filePath: State.activeTab,
              content: text,
            }),
          });
          const data = await r.json();
          if (data.error) { updateLinting([]); return; }

          const annotations = (data.messages || []).map(m => ({
            from: CodeMirror.Pos((m.line || 1) - 1, (m.column || 1) - 1),
            to:   CodeMirror.Pos((m.line || 1) - 1, 999),
            message: `[${m.rule}] ${I18N.translateDclint(m.rule, m.message)}`,
            severity: m.type === 'error' ? 'error' : 'warning',
          }));
          updateLinting(annotations);
        } catch {
          updateLinting([]);
        }
      }, 600);
    };
  }

  function insertAtCursor(text) {
    if (!_cm) return;
    const doc    = _cm.getDoc();
    const cursor = doc.getCursor();
    const line   = doc.getLine(cursor.line) || '';
    const indent = (line.match(/^(\s*)/) || ['', ''])[1];
    const isEmpty = line.trim() === '';
    const insert  = isEmpty ? (indent + text) : ('\n' + indent + text);
    doc.replaceRange(insert, cursor);
    _cm.focus();
  }

  function showEditor(show) {
    document.getElementById('editorWrap').style.display     = show ? '' : 'none';
    document.getElementById('emptyState').style.display     = show ? 'none' : '';
    document.getElementById('editorToolbar').style.display  = show ? '' : 'none';
    document.getElementById('statusBar').style.display      = show ? '' : 'none';
    if (show && _cm) setTimeout(() => _cm.refresh(), 20);
  }

  function updateStatusBar(modified, content) {
    const c = content || '';
    const lines = c.split('\n').length;
    document.getElementById('statusLines').textContent = `${lines} ${I18N.t('lines')}`;
    document.getElementById('statusChars').textContent = `${c.length} ${I18N.t('chars')}`;
    const el = document.getElementById('statusModified');
    if (modified) { el.className = 'statusbar-item warn'; el.textContent = I18N.t('unsaved'); }
    else          { el.className = 'statusbar-item ok';   el.textContent = I18N.t('savedStatus'); }
  }

  function updateToolbarPath(type, name) {
    const colors = {
      root: 'var(--root-tag)', compose: 'var(--comp-tag)',
      env: 'var(--yellow)', appdata: 'var(--purple)', secret: 'var(--red)'
    };
    const labels = {
      root: 'root', compose: 'compose/', env: '.env',
      appdata: 'appdata/', secret: 'secrets/'
    };
    document.getElementById('toolbarPath').innerHTML =
      `<span style="color:${colors[type] || 'var(--text2)'}">${labels[type] || type}</span>&nbsp;${name}`;
  }

  function updateLineNumbers() {}
  function syncScroll() {}
  function handleKeydown() {}

  return {
    init, setValue, getValue, setMode, insertAtCursor,
    showEditor, updateStatusBar, updateToolbarPath,
    updateLineNumbers, syncScroll, handleKeydown,
  };
})();
