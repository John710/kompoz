document.addEventListener('DOMContentLoaded', async () => {
  if (typeof I18N !== 'undefined') await I18N.init();
  if (typeof Themes !== 'undefined') Themes.init();
  if (typeof loadUser === 'function') loadUser();

  let scanPoll = null;
  let statusCheckInterval = null;
  let allMapped = [];
  let allLinks = [];
  let allPending = [];

  function normalizeDevice(d) {
    if (!d) return d;
    return {
      ...d,
      device_type: d.device_type || d.type || 'unknown',
      name: d.name || d.ip || d.mac || '',
      ip: d.ip || '',
      mac: d.mac || '',
      vendor: d.vendor || '',
      x: d.x || 0,
      y: d.y || 0
    };
  }

  async function api(path, opts = {}) {
    const isGet = !opts.method || opts.method === 'GET';
    const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, cache: isGet ? 'no-store' : undefined, ...opts });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  function initCheckIntervalLabels() {
    const sel = document.getElementById('checkInterval');
    // Заполняем текст опций
    sel.querySelectorAll('.custom-option').forEach(opt => {
      const i18nKey = opt.dataset.i18nKey;
      if (i18nKey && typeof I18N !== 'undefined') {
        opt.textContent = I18N.t(i18nKey);
      }
    });
    // Обновляем триггер
    const interval = sel.dataset.value;
    const trigger = sel.querySelector('.custom-select-trigger');
    const opt = sel.querySelector(`.custom-option[data-value="${interval}"]`);
    if (opt) {
      const i18nKey = opt.dataset.i18nKey;
      if (i18nKey && typeof I18N !== 'undefined') {
        trigger.textContent = I18N.t(i18nKey);
      }
    }
  }

  async function loadCheckInterval() {
    try {
      const res = await api('/api/network/settings');
      const interval = res.interval || 0;
      const sel = document.getElementById('checkInterval');
      sel.dataset.value = interval;
      const trigger = sel.querySelector('.custom-select-trigger');
      const opt = sel.querySelector(`.custom-option[data-value="${interval}"]`);
      if (opt) {
        const i18nKey = opt.dataset.i18nKey;
        if (i18nKey && typeof I18N !== 'undefined') {
          trigger.textContent = I18N.t(i18nKey);
        }
        sel.querySelectorAll('.custom-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
      }
      updateStatusCheckInterval(interval);
    } catch (e) {
      console.error('Failed to load check interval:', e);
    }
  }

  async function saveCheckInterval(interval) {
    try {
      await api('/api/network/settings', {
        method: 'POST',
        body: JSON.stringify({ interval })
      });
    } catch (e) {
      NetworkSidebar.toast(e.message, 'error');
    }
  }

  function updateStatusCheckInterval(intervalMs) {
    if (statusCheckInterval) clearInterval(statusCheckInterval);
    if (intervalMs > 0) {
      statusCheckInterval = setInterval(async () => {
        try {
          await api('/api/network/check-status', { method: 'POST' });
          await loadDevices();
        } catch (e) {
          console.error('Auto status check failed:', e);
        }
      }, intervalMs);
    }
  }

  function getVisibleIds() {
    const filters = NetworkSidebar.getFilters();
    let visible = new Set(allMapped.map(d => String(d.id)));
    if (filters.type && filters.type !== 'all') {
      visible = new Set(allMapped.filter(d => (d.device_type || d.type) === filters.type).map(d => String(d.id)));
    }
    if (filters.status && filters.status !== 'all') {
      if (filters.status === 'online') {
        visible = new Set(allMapped.filter(d => d.online === true).map(d => String(d.id)));
      } else if (filters.status === 'offline') {
        visible = new Set(allMapped.filter(d => d.online === false).map(d => String(d.id)));
      }
    }
    return visible;
  }

  async function loadDevices() {
    try {
      console.log('loadDevices: Starting...');

      const [mappedRes, pending] = await Promise.all([
        api('/api/network/devices?status=mapped'), // Запрашиваем только mapped устройства
        api('/api/network/devices?status=pending')
      ]);
      console.log('loadDevices: Mapped devices from server:', mappedRes);
      
      const serverDevices = (mappedRes.devices || mappedRes);
      
      allMapped = serverDevices.filter(d => d.status === 'mapped').map(d => {
        const normalized = normalizeDevice(d);
        
        // Если нет координат, генерируем случайные и сохраняем на сервер
        if (typeof normalized.x !== 'number' || typeof normalized.y !== 'number' || !normalized.x || !normalized.y) {
          normalized.x = 50 + Math.random() * 300;
          normalized.y = 50 + Math.random() * 200;
          
          // Сохраняем новые координаты на сервер
          api('/api/network/devices', {
            method: 'POST',
            body: JSON.stringify({ id: normalized.id, x: normalized.x, y: normalized.y })
          }).catch(e => console.error('Failed to save initial coordinates:', e));
        }
        
        return normalized;
      });
      console.log('loadDevices: Final allMapped after merging:', allMapped);

      // Save pending devices
      allPending = (pending.devices || pending) || [];
      NetworkSidebar.setPending(allPending);

      const linksRes = await api('/api/network/links');
      allLinks = (linksRes.links || []).map(link => {
        let waypoints = link.waypoints;
        // If waypoints is a string (from old data), parse it
        if (typeof waypoints === 'string') {
          try { waypoints = JSON.parse(waypoints); } catch(e) { waypoints = []; }
        }
        return { ...link, waypoints: waypoints || [] }; // Ensure waypoints is always an array
      });
      console.log('loadDevices: Links from server:', allLinks);

      NetworkCanvas.render(allMapped, allLinks, getVisibleIds());
      console.log('loadDevices: Done');
    } catch (e) { console.error('loadDevices: Error:', e); NetworkSidebar.toast(e.message, 'error'); }
  }

  function refreshCanvas() {
    console.log('refreshCanvas: Called! allMapped length:', allMapped.length, 'allLinks length:', allLinks.length, 'getVisibleIds():', getVisibleIds());
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

  let tempSourceId = null;
  let tempTargetId = null;

  function showLinkTypeModal(sourceId, targetId) {
    editingLinkId = null;
    tempSourceId = sourceId;
    tempTargetId = targetId;
    const modal = document.getElementById('linkTypeModal');
    const select = document.getElementById('linkTypeSelect');
    const labelInput = document.getElementById('linkLabelInput');
    const confirmBtn = document.getElementById('btnConfirmLink');
    if (labelInput) labelInput.value = '';
    modal.style.display = 'flex';
    select.dataset.value = 'ethernet';
    select.querySelector('.custom-select-trigger').textContent = I18N.t('linkType_ethernet');
    select.querySelectorAll('.custom-option').forEach(o=>o.classList.remove('selected'));
    const defOpt = select.querySelector('.custom-option[data-value=ethernet]');
    if(defOpt) defOpt.classList.add('selected');
    // Reset button text to "Create"
    confirmBtn.textContent = I18N.t('create');
  }

  // Single confirm button handler
  document.getElementById('btnConfirmLink').onclick = async () => {
    const modal = document.getElementById('linkTypeModal');
    const select = document.getElementById('linkTypeSelect');
    const labelInput = document.getElementById('linkLabelInput');
    const type = select.dataset.value;
    const label = (labelInput && labelInput.value.trim()) || type;
    
    modal.style.display = 'none';
    
    if (editingLinkId !== null) {
      // Edit mode
      const linkIndex = allLinks.findIndex(l => String(l.id) === String(editingLinkId));
      if (linkIndex !== -1) {
        const updatedLink = { ...allLinks[linkIndex], type, label };
        allLinks[linkIndex] = updatedLink;
        refreshCanvas();
        try {
          await api('/api/network/links', { method: 'POST', body: JSON.stringify(updatedLink) });
          NetworkSidebar.toast(I18N.t('toastSaved'));
        } catch (err) {
          NetworkSidebar.toast(err.message, 'error');
        }
      }
      editingLinkId = null;
    } else if (tempSourceId !== null && tempTargetId !== null) {
      // Create mode
      // Optimistic
      const newLink = { 
        id: 'temp_' + Date.now(), 
        source_id: tempSourceId, 
        target_id: tempTargetId, 
        type, 
        label,
        sourcePos: tempSourcePos,
        targetPos: tempTargetPos
      };
      allLinks.push(newLink);
      refreshCanvas();
      try {
        const savedLink = await api('/api/network/links', {
          method: 'POST',
          body: JSON.stringify({ 
            source_id: tempSourceId, 
            target_id: tempTargetId, 
            type, 
            label,
            sourcePos: tempSourcePos,
            targetPos: tempTargetPos
          })
        });
        const idx = allLinks.findIndex(l => l.id === newLink.id);
        if (idx !== -1) {
          allLinks[idx] = { ...newLink, ...savedLink, id: savedLink.id || newLink.id };
        } else if (savedLink) {
          allLinks.push(savedLink);
        }
        refreshCanvas();
        NetworkSidebar.toast(I18N.t('toastLinkCreated'));
      } catch (e) {
        allLinks = allLinks.filter(l => l.id !== newLink.id);
        refreshCanvas();
        NetworkSidebar.toast(e.message, 'error');
      }
      tempSourceId = null;
      tempTargetId = null;
      tempSourcePos = null;
      tempTargetPos = null;
    }
  };

  document.getElementById('btnCancelLink').onclick = () => { 
    document.getElementById('linkTypeModal').style.display = 'none'; 
    editingLinkId = null;
    tempSourceId = null;
    tempTargetId = null;
  };

  function showClearModal() {
    const modal = document.getElementById('clearModal');
    modal.style.display = 'flex';

    const handleClear = async (option) => {
      modal.style.display = 'none';
      try {
        await api('/api/network/clear-map', {
          method: 'POST',
          body: JSON.stringify({ option })
        });

        // Clear localStorage if clearing all or devices
        if (option === 'all' || option === 'devices') {
          try {
            localStorage.removeItem('network-map-node-positions');
            localStorage.removeItem('network-map-zoom');
          } catch (e) {}
          allMapped = [];
          allLinks = [];
          refreshCanvas();
          NetworkSidebar.showDetail(null);
          loadDevices(); // Refresh to get pending devices
        }

        // Refresh history panel if we cleared history or all
        if (option === 'history' || option === 'all') {
          const historyPanel = document.getElementById('historyPanel');
          if (historyPanel && historyPanel.style.display !== 'none') {
            const res = await api('/api/network/scan-history');
            NetworkSidebar.setHistory(res.history || []);
          }
        }

        NetworkSidebar.toast(I18N.t('toastMapCleared'));
      } catch (e) {
        NetworkSidebar.toast(e.message, 'error');
      }
    };

    document.getElementById('btnClearDevices').onclick = () => handleClear('devices');
    document.getElementById('btnClearHistory').onclick = () => handleClear('history');
    document.getElementById('btnClearAll').onclick = () => handleClear('all');
    document.getElementById('btnCancelClear').onclick = () => { modal.style.display = 'none'; };
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
      // Clear local list first
      const originalPending = [...allPending];
      allPending = [];
      NetworkSidebar.setPending([]);
      try {
        const pending = await api('/api/network/devices?status=pending');
        const list = pending.devices || pending;
        await Promise.all(list.map(d => api(`/api/network/devices/${d.id}`, { method: 'DELETE' })));
        NetworkSidebar.toast(I18N.t('toastPendingCleared'));
      } catch (e) { 
        // Restore if failed
        allPending = originalPending;
        NetworkSidebar.setPending(allPending);
        NetworkSidebar.toast(e.message, 'error'); 
      }
    },
    onClearMap: () => {
      showClearModal();
    },
    onAddPending: async (device) => {
      console.log('onAddPending: Called with device:', device);
      // Remove device from pending list
      allPending = allPending.filter(d => String(d.id) !== String(device.id));
      NetworkSidebar.setPending(allPending);

      const normalized = normalizeDevice(device);
      const x = 50 + Math.random() * 300;
      const y = 50 + Math.random() * 200;
      const newDevice = { ...normalized, status: 'mapped', x, y };
      console.log('onAddPending: Adding optimistic device:', newDevice);
      allMapped.push(newDevice);
      refreshCanvas();

      try {
        console.log('onAddPending: Sending POST to server with:', newDevice);
        const created = await api('/api/network/devices', {
          method: 'POST',
          body: JSON.stringify(newDevice)
        });
        console.log('onAddPending: Server returned:', created);
        // Merge server response with original device data to preserve name/ip/mac/vendor
        const finalId = created.id || newDevice.id;
        const merged = { ...newDevice, ...created, id: finalId, x: newDevice.x, y: newDevice.y };
        const idx = allMapped.findIndex(d => String(d.id) === String(newDevice.id));
        if (idx !== -1) {
          allMapped[idx] = normalizeDevice(merged);
        } else {
          allMapped.push(normalizeDevice(merged));
        }

        refreshCanvas();
        NetworkSidebar.toast(I18N.t('toastDeviceAdded'));
      } catch (e) {
        console.error('onAddPending: Error:', e);
        // Restore pending device if failed
        allPending.push(device);
        NetworkSidebar.setPending(allPending);
        allMapped = allMapped.filter(d => String(d.id) !== String(newDevice.id));
        refreshCanvas();
        NetworkSidebar.toast(e.message, 'error');
      }
    },
    onRemovePending: async (id) => {
      // Remove from local list first
      allPending = allPending.filter(d => String(d.id) !== String(id));
      NetworkSidebar.setPending(allPending);
      try { 
        await api(`/api/network/devices/${id}`, { method: 'DELETE' }); 
      }
      catch (e) { 
        // Restore if failed
        const originalPending = await api('/api/network/devices?status=pending');
        allPending = (originalPending.devices || originalPending) || [];
        NetworkSidebar.setPending(allPending);
        NetworkSidebar.toast(e.message, 'error'); 
      }
    },
    onSelectPending: (device) => { NetworkSidebar.showDetail(device); },
    onSaveDevice: async (data) => {
      console.log('onSaveDevice: Called with data:', data);
      const isNew = !data.id || data.id === 'new';
      console.log('onSaveDevice: isNew?', isNew);
      let optimisticDevice = null;
      if (isNew) {
        optimisticDevice = normalizeDevice({ ...data, id: 'temp_' + Date.now(), x: 100 + Math.random() * 300, y: 100 + Math.random() * 200, status: 'mapped' });
        console.log('onSaveDevice: Adding optimistic device:', optimisticDevice);
        allMapped.push(optimisticDevice);
        refreshCanvas();
        
        // Save initial position to localStorage
        try {
          const saved = JSON.parse(localStorage.getItem('network-map-node-positions')) || {};
          const idStr = String(optimisticDevice.id);
          saved[idStr] = { x: optimisticDevice.x, y: optimisticDevice.y };
          localStorage.setItem('network-map-node-positions', JSON.stringify(saved));
        } catch (e) { console.error('onSaveDevice: Error saving initial position to localStorage:', e); }
      } else {
        // Update device without losing position or links!
        const idx = allMapped.findIndex(d => String(d.id) === String(data.id));
        if (idx !== -1) {
          // Keep original position!
          const original = allMapped[idx];
          // Make sure both type and device_type are set!
          const updatedDevice = { 
            ...original, 
            ...data, 
            type: data.type || data.device_type || original.type || original.device_type,
            device_type: data.device_type || data.type || original.device_type || original.type
          };
          allMapped[idx] = normalizeDevice(updatedDevice);
          console.log('onSaveDevice: Updated device locally:', allMapped[idx]);
          refreshCanvas();
        }
      }
      try {
        let payload;
        if (isNew) {
          payload = { ...data, status: 'mapped', x: optimisticDevice.x, y: optimisticDevice.y };
          delete payload.id;
        } else {
          const node = allMapped.find(d => String(d.id) === String(data.id));
          payload = { ...node, ...data, status: 'mapped', type: data.type || data.device_type || node.type || node.device_type };
        }
        console.log('onSaveDevice: Sending payload to server:', payload);
        const saved = await api('/api/network/devices', { method: 'POST', body: JSON.stringify(payload) });
        console.log('onSaveDevice: Server returned:', saved);
        if (isNew) {
          const finalId = saved.id || optimisticDevice.id;
          const merged = { 
            ...optimisticDevice, 
            ...saved, 
            id: finalId, 
            x: optimisticDevice.x, 
            y: optimisticDevice.y,
            type: optimisticDevice.type || optimisticDevice.device_type,
            device_type: optimisticDevice.device_type || optimisticDevice.type
          };
          const idx = allMapped.findIndex(d => String(d.id) === String(optimisticDevice.id));
          if (idx !== -1) {
            allMapped[idx] = normalizeDevice(merged);
          } else {
            allMapped.push(normalizeDevice(merged));
          }

          // Update localStorage with final id (if server changed it)
          try {
            const savedPositions = JSON.parse(localStorage.getItem('network-map-node-positions')) || {};
            const oldIdStr = String(optimisticDevice.id);
            const newIdStr = String(finalId);
            if (savedPositions[oldIdStr] && oldIdStr !== newIdStr) {
              savedPositions[newIdStr] = savedPositions[oldIdStr];
              delete savedPositions[oldIdStr];
              localStorage.setItem('network-map-node-positions', JSON.stringify(savedPositions));
            }
          } catch (e) { console.error('onSaveDevice: Error updating localStorage with final id:', e); }
        } else {
          // Update device without losing position
          const idx = allMapped.findIndex(d => String(d.id) === String(data.id));
          if (idx !== -1) {
            const original = allMapped[idx];
            const updatedDevice = { 
              ...original, 
              ...data, 
              type: data.type || data.device_type || original.type || original.device_type,
              device_type: data.device_type || data.type || original.device_type || original.type
            };
            allMapped[idx] = normalizeDevice(updatedDevice);
            console.log('onSaveDevice: Final updated device:', allMapped[idx]);
          }
        }
        refreshCanvas();
        NetworkSidebar.toast(I18N.t('toastSaved'));
      }
      catch (e) {
        console.error('onSaveDevice: Error:', e);
        if (isNew && optimisticDevice) {
          allMapped = allMapped.filter(d => String(d.id) !== String(optimisticDevice.id));
          // Remove from localStorage if we added it
          try {
            const savedPositions = JSON.parse(localStorage.getItem('network-map-node-positions')) || {};
            const idStr = String(optimisticDevice.id);
            delete savedPositions[idStr];
            localStorage.setItem('network-map-node-positions', JSON.stringify(savedPositions));
          } catch (e2) {}
          refreshCanvas();
        }
        NetworkSidebar.toast(e.message, 'error');
      }
    },
    onDeleteDevice: async (id) => {
      console.log('onDeleteDevice: Called with id:', id, 'typeof:', typeof id);
      // Remove from local state (convert to string to compare consistently)
      const initialMappedLength = allMapped.length;
      allMapped = allMapped.filter(d => String(d.id) !== String(id));
      const finalMappedLength = allMapped.length;
      console.log('onDeleteDevice: allMapped changed from', initialMappedLength, 'to', finalMappedLength);
      allLinks = allLinks.filter(l => String(l.source_id) !== String(id) && String(l.target_id) !== String(id));
      refreshCanvas();
      NetworkSidebar.showDetail(null);
      
      // Remove from localStorage
      try {
        const savedPositions = JSON.parse(localStorage.getItem('network-map-node-positions')) || {};
        delete savedPositions[id];
        delete savedPositions[String(id)];
        delete savedPositions[Number(id)];
        localStorage.setItem('network-map-node-positions', JSON.stringify(savedPositions));
      } catch (e) {}

      // Remove from server
      try {
        await api(`/api/network/devices/${id}`, { method: 'DELETE' });
        NetworkSidebar.toast(I18N.t('toastDeleted'));
      }
      catch (e) {
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
      console.log('onNodeMove: Called with node:', node);
      const idx = allMapped.findIndex(d => String(d.id) === String(node.id));
      if (idx !== -1) { allMapped[idx].x = node.x; allMapped[idx].y = node.y; }
      
      // Сохраняем на сервер
      const deviceToSave = allMapped[idx] || node;
      try { 
        console.log('onNodeMove: Saving to server device:', deviceToSave);
        await api('/api/network/devices', { method: 'POST', body: JSON.stringify({ 
          ...deviceToSave, id: node.id, x: node.x, y: node.y }) }); 
        console.log('onNodeMove: Saved to server OK');
      } catch (e) {
        console.error('onNodeMove: Error saving to server:', e);
        NetworkSidebar.toast((typeof I18N !== 'undefined' ? I18N.t('toastError') : 'Error') + ': ' + e.message, 'error');
      }
    },
    onCreateLink: (sourceId, targetId, sourcePos, targetPos) => {
      if (sourceId && targetId) {
        tempSourceId = sourceId;
        tempTargetId = targetId;
        tempSourcePos = sourcePos;
        tempTargetPos = targetPos;
        showLinkTypeModal(sourceId, targetId);
      }
    },
    onLinkEdit: async (link) => {
      const idx = allLinks.findIndex(l => String(l.id) === String(link.id));
      if (idx !== -1) { allLinks[idx] = { ...allLinks[idx], ...link }; refreshCanvas(); }
      try {
        await api('/api/network/links', { method: 'POST', body: JSON.stringify(link) });
        NetworkSidebar.toast(I18N.t('toastSaved'));
      } catch (e) {
        NetworkSidebar.toast(e.message, 'error');
      }
    },
    onLinkUpdate: async (link) => {
      const idx = allLinks.findIndex(l => String(l.id) === String(link.id));
      if (idx !== -1) { 
        allLinks[idx] = { ...allLinks[idx], waypoints: link.waypoints };
      }
      try {
        await api('/api/network/links', { method: 'POST', body: JSON.stringify(link) });
      } catch (e) {
        console.error('onLinkUpdate: Error saving waypoints:', e);
      }
    },
    onDeleteLink: async (link) => {
      // Optimistic delete
      allLinks = allLinks.filter(l => String(l.id) !== String(link.id));
      refreshCanvas();
      try {
        await api(`/api/network/links/${link.id}`, { method: 'DELETE' });
        NetworkSidebar.toast(I18N.t('toastDeleted'));
      } catch (err) {
        NetworkSidebar.toast(err.message, 'error');
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
            allMapped = allMapped.filter(d => String(d.id) !== String(node.id));
            allLinks = allLinks.filter(l => String(l.source_id) !== String(node.id) && String(l.target_id) !== String(node.id));
            refreshCanvas();
            NetworkSidebar.showDetail(null);
            api(`/api/network/devices/${node.id}`, { method: 'DELETE' })
              .then(() => { NetworkSidebar.toast(I18N.t('toastDeleted')); })
              .catch(err => NetworkSidebar.toast(err.message, 'error'));
          }
        });
      });
    }
  });

  let editingLinkId = null;

  // Show link edit modal
  function showLinkEditModal(link) {
    editingLinkId = link.id;
    const modal = document.getElementById('linkTypeModal');
    const labelInput = document.getElementById('linkLabelInput');
    const select = document.getElementById('linkTypeSelect');
    const confirmBtn = document.getElementById('btnConfirmLink');
    
    labelInput.value = link.label || '';
    
    // Set selected type
    select.dataset.value = link.type || 'ethernet';
    const trigger = select.querySelector('.custom-select-trigger');
    const optionText = (typeof I18N !== 'undefined' ? I18N.t(`linkType_${link.type}`, { fallback: link.type }) : link.type);
    trigger.textContent = optionText;
    
    // Update options
    select.querySelectorAll('.custom-option').forEach(opt => {
      opt.classList.toggle('selected', opt.dataset.value === link.type);
    });
    
    // Change button text from "Create" to "Save"
    confirmBtn.textContent = (typeof I18N !== 'undefined' ? I18N.t('toastSaved') : 'Save');
    
    modal.style.display = 'flex';
  }

  // Link context menu handling
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('linkContextMenu');
    const nodeMenu = document.getElementById('contextMenu');
    if (!e.target.closest('.context-menu')) {
      menu.style.display = 'none';
      nodeMenu.style.display = 'none';
    }
  });

  document.getElementById('linkContextMenu').addEventListener('click', async (e) => {
    const menuItem = e.target.closest('.context-menu-item');
    if (!menuItem) return;

    const menu = document.getElementById('linkContextMenu');
    const linkId = menu.dataset.linkId;
    const action = menuItem.dataset.action;
    menu.style.display = 'none';

    if (!linkId) return;

    const linkIndex = allLinks.findIndex(l => String(l.id) === String(linkId));
    const link = allLinks[linkIndex];
    if (!link) return;

    if (action === 'editLink') {
      showLinkEditModal(link);
    }

    if (action === 'deleteLink') {
      allLinks = allLinks.filter(l => String(l.id) !== String(linkId));
      refreshCanvas();
      try {
        await api(`/api/network/links/${linkId}`, { method: 'DELETE' });
        NetworkSidebar.toast(I18N.t('toastDeleted'));
      } catch (err) {
        NetworkSidebar.toast(err.message, 'error');
      }
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

  // Init check interval labels and options
  const checkIntervalSel = document.getElementById('checkInterval');
  if (checkIntervalSel) {
    // Apply translations to check interval options
    const opts = checkIntervalSel.querySelectorAll('.custom-option');
    opts.forEach(opt => {
      const key = opt.dataset.i18nKey;
      if (key && typeof I18N !== 'undefined') {
        opt.textContent = I18N.t(key);
      }
    });
  }
  
  // Add event listener for check interval change
  document.getElementById('checkInterval').addEventListener('change', async (e) => {
    const interval = parseInt(e.target.dataset.value || 0, 10);
    const sel = e.target;
    const trigger = sel.querySelector('.custom-select-trigger');
    const opt = sel.querySelector(`.custom-option[data-value="${interval}"]`);
    if (opt) {
      const i18nKey = opt.dataset.i18nKey;
      if (i18nKey && typeof I18N !== 'undefined') {
        trigger.textContent = I18N.t(i18nKey);
      } else {
        trigger.textContent = opt.textContent;
      }
    }
    updateStatusCheckInterval(interval);
    await saveCheckInterval(interval);
  });

  // Обновляем при смене языка
  if (typeof window !== 'undefined') {
    window.addEventListener('i18n-change', () => {
      initCheckIntervalLabels();
    });
  }

  await Promise.all([loadDevices(), loadCheckInterval()]);
});
