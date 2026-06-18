document.addEventListener('DOMContentLoaded', async () => {
  if (typeof I18N !== 'undefined') await I18N.init();
  if (typeof Themes !== 'undefined') Themes.init();
  if (typeof loadUser === 'function') loadUser();

  let scanPoll = null;
  let allMapped = [];
  let allLinks = [];

  function normalizeDevice(d) {
    if (!d) return d;
    return { ...d, device_type: d.device_type || d.type || 'unknown' };
  }

  async function api(path, opts = {}) {
    const isGet = !opts.method || opts.method === 'GET';
    const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, cache: isGet ? 'no-store' : undefined, ...opts });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  function getVisibleIds() {
    const filters = NetworkSidebar.getFilters();
    let visible = new Set(allMapped.map(d => d.id));
    if (filters.type && filters.type !== 'all') {
      visible = new Set(allMapped.filter(d => (d.device_type || d.type) === filters.type).map(d => d.id));
    }
    if (filters.status && filters.status !== 'all') {
      if (filters.status === 'online') {
        visible = new Set(allMapped.filter(d => d.online === true).map(d => d.id));
      } else if (filters.status === 'offline') {
        visible = new Set(allMapped.filter(d => d.online === false).map(d => d.id));
      }
    }
    return visible;
  }

  async function loadDevices() {
    try {
      const [mappedRes, pending] = await Promise.all([
        api('/api/network/devices?status=mapped'),
        api('/api/network/devices?status=pending')
      ]);
      allMapped = (mappedRes.devices || mappedRes).map(normalizeDevice).filter(d => d.status === 'mapped');
      const linksRes = await api('/api/network/links');
      allLinks = linksRes.links || [];
      NetworkCanvas.render(allMapped, allLinks, getVisibleIds());
      NetworkSidebar.setPending((pending.devices || pending).map(normalizeDevice));
    } catch (e) { NetworkSidebar.toast(e.message, 'error'); }
  }

  function refreshCanvas() {
    NetworkCanvas.render(allMapped, allLinks, getVisibleIds());
  }

  function startScanPoll() {
    if (scanPoll) return;
    scanPoll = setInterval(async () => {
      try {
        const st = await api('/api/network/scan-status');
        NetworkSidebar.setScanProgress(st.done || 0, st.total || 0);
        if (!st.running) {
          clearInterval(scanPoll); scanPoll = null;
          NetworkSidebar.setScanProgress(0, 0);
          loadDevices();
        }
      } catch (e) { clearInterval(scanPoll); scanPoll = null; NetworkSidebar.setScanProgress(0, 0); }
    }, 1000);
  }

  function showLinkTypeModal(sourceId, targetId) {
    const modal = document.getElementById('linkTypeModal');
    const select = document.getElementById('linkTypeSelect');
    const labelInput = document.getElementById('linkLabelInput');
    if (labelInput) labelInput.value = '';
    modal.style.display = 'flex';
    select.dataset.value = 'ethernet';
    select.querySelector('.custom-select-trigger').textContent = I18N.t('linkType_ethernet');
    select.querySelectorAll('.custom-option').forEach(o=>o.classList.remove('selected'));
    const defOpt = select.querySelector('.custom-option[data-value=ethernet]');
    if(defOpt) defOpt.classList.add('selected');
    document.getElementById('btnConfirmLink').onclick = async () => {
      modal.style.display = 'none';
      const type = select.dataset.value;
      const label = (labelInput && labelInput.value.trim()) || type;
      // Optimistic
      const newLink = { id: 'temp_' + Date.now(), source_id: sourceId, target_id: targetId, type, label };
      allLinks.push(newLink);
      refreshCanvas();
      try {
        await api('/api/network/links', {
          method: 'POST',
          body: JSON.stringify({ source_id: sourceId, target_id: targetId, type, label })
        });
        await loadDevices();
        NetworkSidebar.toast(I18N.t('toastLinkCreated'));
      } catch (e) {
        allLinks = allLinks.filter(l => l.id !== newLink.id);
        refreshCanvas();
        NetworkSidebar.toast(e.message, 'error');
      }
    };
    document.getElementById('btnCancelLink').onclick = () => { modal.style.display = 'none'; };
  }

  NetworkSidebar.init({
    onScan: async (cidr) => {
      try {
        await api('/api/network/scan', { method: 'POST', body: JSON.stringify({ cidr }) });
        NetworkSidebar.toast(I18N.t('toastScanStarted'));
        startScanPoll();
      } catch (e) { NetworkSidebar.toast(e.message, 'error'); }
    },
    onCheckStatus: async () => {
      try {
        await api('/api/network/check-status', { method: 'POST' });
        NetworkSidebar.toast(I18N.t('toastStatusCheckStarted'));
        await loadDevices();
      }
      catch (e) { NetworkSidebar.toast(e.message, 'error'); }
    },
    onClearPending: async () => {
      try {
        const pending = await api('/api/network/devices?status=pending');
        const list = pending.devices || pending;
        await Promise.all(list.map(d => api(`/api/network/devices/${d.id}`, { method: 'DELETE' })));
        loadDevices();
        NetworkSidebar.toast(I18N.t('toastPendingCleared'));
      } catch (e) { NetworkSidebar.toast(e.message, 'error'); }
    },
    onClearMap: async () => {
      try {
        if (!confirm(I18N.t('toastConfirmClearMap'))) return;
        await api('/api/network/clear-map', { method: 'POST' });
        allMapped = [];
        allLinks = [];
        refreshCanvas();
        NetworkSidebar.showDetail(null);
        NetworkSidebar.toast(I18N.t('toastMapCleared'));
      } catch (e) { NetworkSidebar.toast(e.message, 'error'); }
    },
    onAddPending: async (device) => {
      const normalized = normalizeDevice(device);
      const x = 50 + Math.random() * 300;
      const y = 50 + Math.random() * 200;
      const newDevice = { ...normalized, status: 'mapped', x, y };
      allMapped.push(newDevice);
      refreshCanvas();
      try {
        await api('/api/network/devices', {
          method: 'POST',
          body: JSON.stringify(newDevice)
        });
        await loadDevices();
        NetworkSidebar.toast(I18N.t('toastDeviceAdded'));
      } catch (e) {
        allMapped = allMapped.filter(d => d.id !== newDevice.id);
        refreshCanvas();
        NetworkSidebar.toast(e.message, 'error');
      }
    },
    onRemovePending: async (id) => {
      try { await api(`/api/network/devices/${id}`, { method: 'DELETE' }); loadDevices(); }
      catch (e) { NetworkSidebar.toast(e.message, 'error'); }
    },
    onSelectPending: (device) => { NetworkSidebar.showDetail(device); },
    onSaveDevice: async (data) => {
      const isNew = !data.id || data.id === 'new';
      let optimisticDevice = null;
      if (isNew) {
        optimisticDevice = normalizeDevice({ ...data, id: 'temp_' + Date.now(), x: 100 + Math.random() * 300, y: 100 + Math.random() * 200, status: 'mapped' });
        allMapped.push(optimisticDevice);
        refreshCanvas();
      } else {
        const idx = allMapped.findIndex(d => d.id == data.id);
        if (idx !== -1) {
          allMapped[idx] = { ...allMapped[idx], ...normalizeDevice(data) };
          refreshCanvas();
        }
      }
      try {
        let payload;
        if (isNew) {
          payload = { ...data, status: 'mapped', x: optimisticDevice.x, y: optimisticDevice.y };
          delete payload.id;
        } else {
          const node = NetworkCanvas.getNode(data.id);
          payload = { ...node, ...data, status: 'mapped' };
        }
        await api('/api/network/devices', { method: 'POST', body: JSON.stringify(payload) });
        await loadDevices();
        NetworkSidebar.toast(I18N.t('toastSaved'));
      }
      catch (e) {
        if (isNew && optimisticDevice) {
          allMapped = allMapped.filter(d => d.id !== optimisticDevice.id);
          refreshCanvas();
        }
        await loadDevices();
        NetworkSidebar.toast(e.message, 'error');
      }
    },
    onDeleteDevice: async (id) => {
      allMapped = allMapped.filter(d => d.id !== id);
      allLinks = allLinks.filter(l => l.source_id !== id && l.target_id !== id);
      refreshCanvas();
      NetworkSidebar.showDetail(null);
      try {
        await api(`/api/network/devices/${id}`, { method: 'DELETE' });
        await loadDevices();
        NetworkSidebar.toast(I18N.t('toastDeleted'));
      }
      catch (e) {
        await loadDevices();
        NetworkSidebar.toast(e.message, 'error');
      }
    },
    onExport: () => {
      const data = NetworkCanvas.exportMap();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'network-map.json';
      a.click();
      URL.revokeObjectURL(url);
      NetworkSidebar.toast(I18N.t('toastMapExported'));
    },
    onImport: async (data) => {
      try {
        if (!data.nodes || !Array.isArray(data.nodes)) throw new Error(I18N.t('invalidFormat'));
        for (const n of data.nodes) {
          await api('/api/network/devices', { method: 'POST', body: JSON.stringify({
            id: n.id, x: n.x, y: n.y, name: n.name, device_type: n.type, status: 'mapped'
          }) });
        }
        if (data.edges) {
          for (const e of data.edges) {
            await api('/api/network/links', { method: 'POST', body: JSON.stringify(e) });
          }
        }
        loadDevices();
        NetworkSidebar.toast(I18N.t('toastMapImported'));
      } catch (e) { NetworkSidebar.toast(e.message, 'error'); }
    },
    onFilter: () => { refreshCanvas(); },
    onAddDevice: () => {
      NetworkSidebar.showDetail(null, true);
    },
    onLoadHistory: async () => {
      try {
        const res = await api('/api/network/scan-history');
        NetworkSidebar.setHistory(res.history || []);
      } catch (e) { NetworkSidebar.toast(e.message, 'error'); }
    }
  });

  NetworkCanvas.init({
    onSelectNode: (node) => { NetworkSidebar.showDetail(node); },
    onNodeMove: async (node) => {
      const idx = allMapped.findIndex(d => d.id === node.id);
      if (idx !== -1) { allMapped[idx].x = node.x; allMapped[idx].y = node.y; }
      try { await api('/api/network/devices', { method: 'POST', body: JSON.stringify({ id: node.id, x: node.x, y: node.y }) }); }
      catch (e) { console.error(e); }
    },
    onCreateLink: (sourceId, targetId) => {
      showLinkTypeModal(sourceId, targetId);
    },
    onLinkEdit: async (link) => {
      const idx = allLinks.findIndex(l => l.id === link.id);
      if (idx !== -1) { allLinks[idx] = { ...allLinks[idx], ...link }; refreshCanvas(); }
      try {
        await api('/api/network/links', { method: 'POST', body: JSON.stringify(link) });
        await loadDevices();
        NetworkSidebar.toast(I18N.t('toastSaved'));
      } catch (e) {
        await loadDevices();
        NetworkSidebar.toast(e.message, 'error');
      }
    },
    onContextMenu: (e, node) => {
      const menu = document.getElementById('contextMenu');
      menu.style.display = 'block';
      menu.style.left = e.pageX + 'px';
      menu.style.top = e.pageY + 'px';
      menu.innerHTML = `
        <div class="context-menu-item" data-action="edit">${I18N.t('contextMenuEdit')}</div>
        <div class="context-menu-item" data-action="link">${I18N.t('contextMenuLink')}</div>
        <div class="context-menu-sep"></div>
        <div class="context-menu-item" data-action="delete" style="color:var(--red)">${I18N.t('contextMenuDelete')}</div>
      `;
      menu.querySelectorAll('.context-menu-item').forEach(el => {
        el.addEventListener('click', () => {
          const action = el.dataset.action;
          menu.style.display = 'none';
          if (action === 'edit') NetworkSidebar.showDetail(node);
          if (action === 'delete') {
            allMapped = allMapped.filter(d => d.id !== node.id);
            allLinks = allLinks.filter(l => l.source_id !== node.id && l.target_id !== node.id);
            refreshCanvas();
            NetworkSidebar.showDetail(null);
            api(`/api/network/devices/${node.id}`, { method: 'DELETE' })
              .then(() => { loadDevices(); NetworkSidebar.toast(I18N.t('toastDeleted')); })
              .catch(err => NetworkSidebar.toast(err.message, 'error'));
          }
          if (action === 'link') { NetworkCanvas.setTool('link'); NetworkCanvas.selectNode(node.id); }
        });
      });
    }
  });

  document.getElementById('btnZoomIn').addEventListener('click', () => NetworkCanvas.zoomIn());
  document.getElementById('btnZoomOut').addEventListener('click', () => NetworkCanvas.zoomOut());
  document.getElementById('btnZoomFit').addEventListener('click', () => NetworkCanvas.zoomFit());
  document.getElementById('btnToggleGrid').addEventListener('click', () => {
    const on = NetworkCanvas.toggleGrid();
    document.getElementById('btnToggleGrid').classList.toggle('active', on);
  });
  const btnToggleLabels = document.getElementById('btnToggleLabels');
  if (btnToggleLabels) {
    btnToggleLabels.addEventListener('click', () => {
      const on = NetworkCanvas.toggleLinkLabels();
      btnToggleLabels.classList.toggle('active', on);
    });
  }
  document.getElementById("btnCloseDetail").addEventListener("click", () => { NetworkSidebar.showDetail(null); });

  // Hide context menu on click elsewhere
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.context-menu')) document.getElementById('contextMenu').style.display = 'none';
  });

  await loadDevices();
});
