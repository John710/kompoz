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
    document.getElementById('btnSaveDevice').addEventListener('click', () => {
      const id = document.getElementById('detailIp').dataset.id;
      const data = {
        id,
        name: document.getElementById('detailName').value.trim(),
        device_type: document.getElementById('detailType').value,
        status: 'mapped'
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
        } catch (err) { toast('Invalid JSON', 'error'); }
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
    NetworkIcons.getAll().forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = I18N.t('deviceType_' + t);
      opt.dataset.i18n = 'deviceType_' + t;
      typeSelect.appendChild(opt);
      const opt2 = document.createElement('option');
      opt2.value = t;
      opt2.textContent = I18N.t('deviceType_' + t);
      opt2.dataset.i18n = 'deviceType_' + t;
      filterType.appendChild(opt2);
    });
  }

  function getFilters() {
    return {
      type: document.getElementById('filterType').value,
      status: document.getElementById('filterStatus').value
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
          <div class="ip">${d.ip}</div>
          <div class="mac">${d.mac || 'Unknown MAC'}</div>
        </div>
        <div class="actions">
          <button class="btn btn-primary btn-sm" data-action="add" data-id="${d.id}">+</button>
          <button class="btn btn-secondary btn-sm" data-action="remove" data-id="${d.id}">×</button>
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

  function showDetail(device) {
    const panel = document.getElementById('detailPanel');
    if (!device) { panel.style.display = 'none'; return; }
    panel.style.display = 'block';
    document.getElementById('detailIp').value = device.ip || '';
    document.getElementById('detailIp').dataset.id = device.id;
    document.getElementById('detailMac').value = device.mac || '';
    document.getElementById('detailName').value = device.name || '';
    document.getElementById('detailType').value = device.device_type || 'unknown';
    document.getElementById('detailPorts').value = (device.ports || []).join(', ') || '';
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
      const date = new Date(h.started_at).toLocaleString();
      item.innerHTML = `
        <div style="flex:1;min-width:0;">
          <div class="ip">${h.cidr}</div>
          <div class="mac">${date} — ${h.devices_found || 0} found</div>
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
