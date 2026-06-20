document.addEventListener('DOMContentLoaded', async () => {
  if (typeof I18N !== 'undefined') await I18N.init();
  if (typeof Themes !== 'undefined') Themes.init();
  if (typeof loadUser === 'function') loadUser();

  let scanPoll = null;
  let allMapped = [];

  async function api(path, opts = {}) {
    const isGet = !opts.method || opts.method === 'GET';
    const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, cache: isGet ? 'no-store' : undefined, ...opts });
    if (!res.ok) {
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        if (json.errorKey) throw new Error(I18N.t(json.errorKey));
      } catch (_) {}
      throw new Error(text);
    }
    return res.json();
  }

  async function loadDevices() {
    try {
      const filters = NetworkSidebar.getFilters();
      let url = '/api/network/devices?status=mapped';
      if (filters.type && filters.type !== 'all') url += '&type=' + encodeURIComponent(filters.type);
      if (filters.status && filters.status !== 'all') url += '&online=' + (filters.status === 'online');

      const [mappedRes, pending] = await Promise.all([
        api(url),
        api('/api/network/devices?status=pending')
      ]);
      allMapped = mappedRes.devices || mappedRes;
      const links = await api('/api/network/links');
      NetworkCanvas.render(allMapped, links);
      NetworkSidebar.setPending(pending.devices || pending);
    } catch (e) { NetworkSidebar.toast(e.message, 'error'); }
  }

  function startScanPoll() {
    if (scanPoll) return;
    scanPoll = setInterval(async () => {
      try {
        const st = await api('/api/network/scan-status');
        NetworkSidebar.setScanProgress(st.done || 0, st.total || 0);
        if (!st.running) {
          clearInterval(scanPoll); scanPoll = null;
          loadDevices();
        }
      } catch (e) { clearInterval(scanPoll); scanPoll = null; }
    }, 1000);
  }

  function showLinkTypeModal(sourceId, targetId) {
    const modal = document.getElementById('linkTypeModal');
    const select = document.getElementById('linkTypeSelect');
    modal.style.display = 'flex';
    select.value = 'ethernet';
    document.getElementById('btnConfirmLink').onclick = async () => {
      modal.style.display = 'none';
      try {
        await api('/api/network/links', {
          method: 'POST',
          body: JSON.stringify({ source_id: sourceId, target_id: targetId, type: select.value, label: select.value })
        });
        loadDevices();
        NetworkSidebar.toast('Link created');
      } catch (e) { NetworkSidebar.toast(e.message, 'error'); }
    };
    document.getElementById('btnCancelLink').onclick = () => { modal.style.display = 'none'; };
  }

  NetworkSidebar.init({
    onScan: async (cidr) => {
      try {
        await api('/api/network/scan', { method: 'POST', body: JSON.stringify({ cidr }) });
        NetworkSidebar.toast('Scan started');
        startScanPoll();
      } catch (e) { NetworkSidebar.toast(e.message, 'error'); }
    },
    onCheckStatus: async () => {
      try { await api('/api/network/check-status', { method: 'POST' }); NetworkSidebar.toast('Status check started'); }
      catch (e) { NetworkSidebar.toast(e.message, 'error'); }
    },
    onClearPending: async () => {
      try {
        const pending = await api('/api/network/devices?status=pending');
        const list = pending.devices || pending;
        await Promise.all(list.map(d => api(`/api/network/devices/${d.id}`, { method: 'DELETE' })));
        loadDevices();
        NetworkSidebar.toast('Pending cleared');
      } catch (e) { NetworkSidebar.toast(e.message, 'error'); }
    },
    onAddPending: async (device) => {
      try {
        await api('/api/network/devices', {
          method: 'POST',
          body: JSON.stringify({ ...device, status: 'mapped', x: 50 + Math.random() * 300, y: 50 + Math.random() * 200 })
        });
        loadDevices();
        NetworkSidebar.toast('Device added to map');
      } catch (e) { NetworkSidebar.toast(e.message, 'error'); }
    },
    onRemovePending: async (id) => {
      try { await api(`/api/network/devices/${id}`, { method: 'DELETE' }); loadDevices(); }
      catch (e) { NetworkSidebar.toast(e.message, 'error'); }
    },
    onSelectPending: (device) => { NetworkSidebar.showDetail(device); },
    onSaveDevice: async (data) => {
      try { await api('/api/network/devices', { method: 'POST', body: JSON.stringify(data) }); loadDevices(); NetworkSidebar.toast('Saved'); }
      catch (e) { NetworkSidebar.toast(e.message, 'error'); }
    },
    onDeleteDevice: async (id) => {
      try { await api(`/api/network/devices/${id}`, { method: 'DELETE' }); loadDevices(); NetworkSidebar.showDetail(null); NetworkSidebar.toast('Deleted'); }
      catch (e) { NetworkSidebar.toast(e.message, 'error'); }
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
      NetworkSidebar.toast('Map exported');
    },
    onImport: async (data) => {
      try {
        if (!data.nodes || !Array.isArray(data.nodes)) throw new Error('Invalid format');
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
        NetworkSidebar.toast('Map imported');
      } catch (e) { NetworkSidebar.toast(e.message, 'error'); }
    },
    onFilter: () => { loadDevices(); },
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
      try { await api('/api/network/devices', { method: 'POST', body: JSON.stringify({ id: node.id, x: node.x, y: node.y }) }); }
      catch (e) { console.error(e); }
    },
    onCreateLink: (sourceId, targetId) => {
      showLinkTypeModal(sourceId, targetId);
    },
    onContextMenu: (e, node) => {
      const menu = document.getElementById('contextMenu');
      menu.style.display = 'block';
      menu.style.left = e.pageX + 'px';
      menu.style.top = e.pageY + 'px';
      menu.innerHTML = `
        <div class="context-menu-item" data-action="edit">${I18N.t('edit')}</div>
        <div class="context-menu-item" data-action="link">${I18N.t('linkTo')}</div>
        <div class="context-menu-sep"></div>
        <div class="context-menu-item" data-action="delete" style="color:var(--red)">Delete</div>
      `;
      menu.querySelectorAll('.context-menu-item').forEach(el => {
        el.addEventListener('click', () => {
          const action = el.dataset.action;
          menu.style.display = 'none';
          if (action === 'edit') NetworkSidebar.showDetail(node);
          if (action === 'delete') {
            api(`/api/network/devices/${node.id}`, { method: 'DELETE' })
              .then(() => { loadDevices(); NetworkSidebar.showDetail(null); NetworkSidebar.toast('Deleted'); })
              .catch(err => NetworkSidebar.toast(err.message, 'error'));
          }
          if (action === 'link') { NetworkCanvas.setTool('link'); NetworkCanvas.selectNode(node.id); }
        });
      });
    }
  });

  // Toolbar
  document.getElementById('toolSelect').addEventListener('click', () => {
    NetworkCanvas.setTool('select');
    document.querySelectorAll('.mini-toolbar button').forEach(b => b.classList.remove('active'));
    document.getElementById('toolSelect').classList.add('active');
  });

  document.getElementById('btnZoomIn').addEventListener('click', () => NetworkCanvas.zoomIn());
  document.getElementById('btnZoomOut').addEventListener('click', () => NetworkCanvas.zoomOut());
  document.getElementById('btnZoomFit').addEventListener('click', () => NetworkCanvas.zoomFit());
  document.getElementById('btnToggleGrid').addEventListener('click', () => {
    const on = NetworkCanvas.toggleGrid();
    document.getElementById('btnToggleGrid').classList.toggle('active', on);
  });

  // Hide context menu on click elsewhere
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.context-menu')) document.getElementById('contextMenu').style.display = 'none';
  });

  await loadDevices();
});
