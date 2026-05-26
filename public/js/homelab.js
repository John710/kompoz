document.addEventListener('DOMContentLoaded', async () => {
  // I18n
  if (typeof initI18n === 'function') await initI18n();

  // Theme
  if (typeof applyTheme === 'function') applyTheme(localStorage.getItem('theme') || 'dark');

  // User profile
  if (typeof loadUser === 'function') loadUser();

  // Scan progress polling
  let scanPoll = null;

  async function api(path, opts = {}) {
    const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async function loadDevices() {
    try {
      const [mapped, pending] = await Promise.all([
        api('/api/network/devices?status=mapped'),
        api('/api/network/devices?status=pending')
      ]);
      const links = await api('/api/network/links');
      NetworkCanvas.render(mapped, links);
      NetworkSidebar.setPending(pending);
    } catch (e) { NetworkSidebar.toast(e.message, 'error'); }
  }

  function startScanPoll() {
    if (scanPoll) return;
    scanPoll = setInterval(async () => {
      try {
        const st = await api('/api/network/scan-status');
        NetworkSidebar.setScanProgress(st.scanned || 0, st.total || 0);
        if (st.status === 'idle') {
          clearInterval(scanPoll); scanPoll = null;
          loadDevices();
        }
      } catch (e) { clearInterval(scanPoll); scanPoll = null; }
    }, 1000);
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
      // Simple approach: delete all pending one by one
      try {
        const pending = await api('/api/network/devices?status=pending');
        await Promise.all(pending.map(d => api(`/api/network/devices/${d.id}`, { method: 'DELETE' })));
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
    }
  });

  NetworkCanvas.init({
    onSelectNode: (node) => { NetworkSidebar.showDetail(node); },
    onNodeMove: async (node) => {
      try { await api('/api/network/devices', { method: 'POST', body: JSON.stringify({ id: node.id, x: node.x, y: node.y }) }); }
      catch (e) { console.error(e); }
    },
    onCreateLink: async (sourceId, targetId) => {
      try {
        await api('/api/network/links', { method: 'POST', body: JSON.stringify({ source_id: sourceId, target_id: targetId, type: 'ethernet' }) });
        loadDevices();
        NetworkSidebar.toast('Link created');
      } catch (e) { NetworkSidebar.toast(e.message, 'error'); }
    },
    onContextMenu: (e, node) => {
      const menu = document.getElementById('contextMenu');
      menu.style.display = 'block';
      menu.style.left = e.pageX + 'px';
      menu.style.top = e.pageY + 'px';
      menu.innerHTML = `
        <div class="context-menu-item" data-action="edit">Edit</div>
        <div class="context-menu-item" data-action="link">Link to...</div>
        <div class="context-menu-sep"></div>
        <div class="context-menu-item" data-action="delete" style="color:var(--red)">Delete</div>
      `;
      menu.querySelectorAll('.context-menu-item').forEach(el => {
        el.addEventListener('click', () => {
          const action = el.dataset.action;
          menu.style.display = 'none';
          if (action === 'edit') NetworkSidebar.showDetail(node);
          if (action === 'delete') NetworkSidebar.init({}).onDeleteDevice(node.id);
          if (action === 'link') { NetworkCanvas.setTool('link'); NetworkCanvas.selectNode(node.id); }
        });
      });
    }
  });

  // Toolbar
  document.getElementById('toolPan').addEventListener('click', () => {
    NetworkCanvas.setTool('pan');
    document.querySelectorAll('.mini-toolbar button').forEach(b => b.classList.remove('active'));
    document.getElementById('toolPan').classList.add('active');
  });
  document.getElementById('toolSelect').addEventListener('click', () => {
    NetworkCanvas.setTool('select');
    document.querySelectorAll('.mini-toolbar button').forEach(b => b.classList.remove('active'));
    document.getElementById('toolSelect').classList.add('active');
  });
  document.getElementById('toolLink').addEventListener('click', () => {
    NetworkCanvas.setTool('link');
    document.querySelectorAll('.mini-toolbar button').forEach(b => b.classList.remove('active'));
    document.getElementById('toolLink').classList.add('active');
  });
  document.getElementById('btnZoomIn').addEventListener('click', () => NetworkCanvas.zoomIn());
  document.getElementById('btnZoomOut').addEventListener('click', () => NetworkCanvas.zoomOut());
  document.getElementById('btnZoomFit').addEventListener('click', () => NetworkCanvas.zoomFit());

  // Hide context menu on click elsewhere
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.context-menu')) document.getElementById('contextMenu').style.display = 'none';
  });

  await loadDevices();
});
