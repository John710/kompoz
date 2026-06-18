const NetworkSidebar = (() => {
  let callbacks = {};

  function init(cb) {
    callbacks = cb || {};
    document.getElementById('btnScan').addEventListener('click', () => {
      const cidr = document.getElementById('scanCidr').value.trim();
      if (callbacks.onScan) callbacks.onScan(cidr);
    });
    document.getElementById('btnCheckStatus').addEventListener('click', () => {
      if (callbacks.onCheckStatus) callbacks.onCheckStatus();
    });
    document.getElementById('btnClearPending').addEventListener('click', () => {
      if (callbacks.onClearPending) callbacks.onClearPending();
    });
    const btnClearMap = document.getElementById('btnClearMap');
    if (btnClearMap) {
      btnClearMap.addEventListener('click', () => {
        if (callbacks.onClearMap) callbacks.onClearMap();
      });
    }
    const btnAddDevice = document.getElementById('btnAddDevice');
    if (btnAddDevice) {
      btnAddDevice.addEventListener('click', () => {
        if (callbacks.onAddDevice) callbacks.onAddDevice();
      });
    }
    document.getElementById('btnSaveDevice').addEventListener('click', () => {
      const id = document.getElementById('detailIp').dataset.id;
      const mac = document.getElementById('detailMac').value.trim();
      if (mac && !/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(mac)) {
        toast(I18N.t('invalidMacFormat'), 'error');
        return;
      }
      const data = {
        id,
        name: document.getElementById('detailName').value.trim(),
        device_type: document.getElementById('detailType').dataset.value,
        status: 'mapped',
        ip: document.getElementById('detailIp').value,
        mac: mac || null,
        ports: document.getElementById('detailPorts').value.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0)
      };
      if (callbacks.onSaveDevice) callbacks.onSaveDevice(data);
    });
    document.getElementById('btnDeleteDevice').addEventListener('click', () => {
      const id = document.getElementById('detailIp').dataset.id;
      if (callbacks.onDeleteDevice) callbacks.onDeleteDevice(id);
    });
    document.getElementById('btnExport').addEventListener('click', () => {
      if (callbacks.onExport) callbacks.onExport();
    });
    document.getElementById('btnImport').addEventListener('click', () => {
      document.getElementById('importFile').click();
    });
    document.getElementById('importFile').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          if (callbacks.onImport) callbacks.onImport(data);
        } catch (err) { toast(I18N.t('invalidJson'), 'error'); }
      };
      reader.readAsText(file);
      e.target.value = '';
    });
    document.getElementById('filterType').addEventListener('change', () => {
      if (callbacks.onFilter) callbacks.onFilter();
    });
    document.getElementById('filterStatus').addEventListener('change', () => {
      if (callbacks.onFilter) callbacks.onFilter();
    });
    document.getElementById('btnToggleHistory').addEventListener('click', () => {
      const el = document.getElementById('historyPanel');
      el.style.display = el.style.display === 'none' ? 'block' : 'none';
      if (el.style.display === 'block' && callbacks.onLoadHistory) callbacks.onLoadHistory();
    });

    const typeSelect = document.getElementById('detailType');
    const filterType = document.getElementById('filterType');
    const typeOpts = typeSelect.querySelector('.custom-options');
    const filterOpts = filterType.querySelector('.custom-options');
    typeOpts.innerHTML = '';
    filterOpts.innerHTML = '<div class="custom-option selected" data-value="all">' + I18N.t('allTypes', {fallback: 'All Types'}) + '</div>';
    NetworkIcons.getAll().forEach(t => {
      const label = I18N.t('deviceType_' + t, { fallback: t.charAt(0).toUpperCase() + t.slice(1) });
      const opt = document.createElement('div');
      opt.className = 'custom-option';
      opt.dataset.value = t;
      opt.textContent = label;
      typeOpts.appendChild(opt);
      const opt2 = document.createElement('div');
      opt2.className = 'custom-option';
      opt2.dataset.value = t;
      opt2.textContent = label;
      filterOpts.appendChild(opt2);
    });
    // Init click handlers for all custom selects
    document.querySelectorAll('.custom-select').forEach(sel => {
      const trigger = sel.querySelector('.custom-select-trigger');
      const opts = sel.querySelector('.custom-options');
      if (!trigger || !opts) return;
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.custom-select').forEach(s => { if (s !== sel) s.classList.remove('open'); });
        sel.classList.toggle('open');
        if (sel.classList.contains('open')) {
          const rect = opts.getBoundingClientRect();
          const parentRect = sel.getBoundingClientRect();
          if (rect.bottom > window.innerHeight - 8) {
            opts.style.top = 'auto';
            opts.style.bottom = (parentRect.height + 4) + 'px';
          } else {
            opts.style.top = '';
            opts.style.bottom = '';
          }
        }
      });
      opts.querySelectorAll('.custom-option').forEach(opt => {
        opt.addEventListener('click', () => {
          sel.dataset.value = opt.dataset.value;
          trigger.textContent = opt.textContent;
          opts.querySelectorAll('.custom-option').forEach(o => o.classList.remove('selected'));
          opt.classList.add('selected');
          sel.classList.remove('open');
          sel.dispatchEvent(new Event('change'));
        });
      });
    });
    // Close dropdowns on outside click
    document.addEventListener('click', () => {
      document.querySelectorAll('.custom-select').forEach(s => s.classList.remove('open'));
    });
  }

  function getFilters() {
    return {
      type: document.getElementById('filterType').dataset.value,
      status: document.getElementById('filterStatus').dataset.value
    };
  }

  function setScanProgress(current, total) {
    const el = document.getElementById('scanProgress');
    const fill = document.getElementById('progressFill');
    const text = document.getElementById('progressText');
    if (total > 0) {
      el.classList.add('active');
      const pct = Math.round((current / total) * 100);
      fill.style.width = pct + '%';
      text.textContent = `${current} / ${total} (${pct}%)`;
    } else {
      el.classList.remove('active');
      fill.style.width = '0%';
      text.textContent = '0 / 0';
    }
  }

  function setPending(list) {
    const container = document.getElementById('pendingList');
    if (!list || !list.length) {
      container.innerHTML = '<div class="pending-empty">' + I18N.t('noPendingDevices') + '</div>';
      return;
    }
    container.innerHTML = '';
    list.forEach(d => {
      const item = document.createElement('div');
      item.className = 'pending-item';
      item.innerHTML = `
        <div class="status-dot ${d.online ? 'online' : d.online === false ? 'offline' : ''}"></div>
        <div style="flex:1;min-width:0;">
          <div class="ip">${d.name || d.ip}</div>
          <div class="mac">${d.ip} \u2014 ${d.mac || I18N.t('unknownMac')}${d.vendor ? ' \u2014 ' + d.vendor : ''}</div>
        </div>
        <div class="actions">
          <button class="btn btn-primary btn-sm" data-action="add" data-id="${d.id}">+</button>
          <button class="btn btn-secondary btn-sm" data-action="remove" data-id="${d.id}">\u00d7</button>
        </div>
      `;
      item.querySelector('[data-action="add"]').addEventListener('click', (e) => {
        e.stopPropagation();
        if (callbacks.onAddPending) callbacks.onAddPending(d);
      });
      item.querySelector('[data-action="remove"]').addEventListener('click', (e) => {
        e.stopPropagation();
        if (callbacks.onRemovePending) callbacks.onRemovePending(d.id);
      });
      item.addEventListener('click', () => {
        if (callbacks.onSelectPending) callbacks.onSelectPending(d);
      });
      container.appendChild(item);
    });
  }

  function showDetail(device, isCreate) {
    const panel = document.getElementById('detailPanel');
    if (!device && !isCreate) { panel.style.display = 'none'; return; }
    panel.style.display = 'block';
    if (isCreate) {
      document.getElementById('detailIp').value = '';
      document.getElementById('detailIp').readOnly = false;
      document.getElementById('detailIp').dataset.id = 'new';
      document.getElementById('detailMac').value = '';
      document.getElementById('detailVendor').value = '';
      document.getElementById('detailName').value = '';
      const dt = document.getElementById('detailType');
      dt.dataset.value = 'unknown';
      const defOpt = dt.querySelector('.custom-option[data-value="unknown"]');
      dt.querySelector('.custom-select-trigger').textContent = defOpt ? defOpt.textContent : I18N.t('deviceType_unknown');
      document.getElementById('detailPorts').value = '';
    } else {
      document.getElementById('detailIp').value = device.ip || '';
      document.getElementById('detailIp').readOnly = true;
      document.getElementById('detailIp').dataset.id = device.id;
      document.getElementById('detailMac').value = device.mac || '';
      document.getElementById('detailVendor').value = device.vendor || '';
      document.getElementById('detailName').value = device.name || '';
      const dt = document.getElementById('detailType');
      const devType = device.device_type || device.type || 'unknown';
      dt.dataset.value = devType;
      const dtOpt = dt.querySelector('.custom-option[data-value="' + devType + '"]');
      dt.querySelector('.custom-select-trigger').textContent = dtOpt ? dtOpt.textContent : devType;
      document.getElementById('detailPorts').value = (device.ports || []).join(', ') || '';
    }
  }

  function setHistory(list) {
    const container = document.getElementById('historyList');
    if (!list || !list.length) {
      container.innerHTML = '<div class="pending-empty">' + I18N.t('noScanHistory') + '</div>';
      return;
    }
    container.innerHTML = '';
    list.forEach(h => {
      const item = document.createElement('div');
      item.className = 'pending-item';
      const date = new Date(h.started_at).toLocaleString(I18N.getLang(), { dateStyle: 'short', timeStyle: 'medium' });
      item.innerHTML = `
        <div style="flex:1;min-width:0;">
          <div class="ip">${h.cidr}</div>
          <div class="mac">${date} \u2014 ${I18N.t('foundCount', { count: h.found_count || 0 })}</div>
        </div>
      `;
      container.appendChild(item);
    });
  }

  function toast(msg, type = 'success') {
    const container = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  return { init, setScanProgress, setPending, showDetail, setHistory, getFilters, toast };
})();
