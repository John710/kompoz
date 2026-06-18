const NetworkIcons = (() => {
  const icons = {
    router: '<circle cx="12" cy="12" r="3"/><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/><path d="M12 6v6l4 2"/>',
    switch: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 12h8M8 8h8M8 16h8"/>',
    server: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 8h10M7 12h10M7 16h5"/>',
    nas: '<path d="M4 20h16v-8H4z"/><path d="M4 12h16V8H4z"/><circle cx="8" cy="16" r="1"/><circle cx="8" cy="10" r="1"/>',
    camera: '<rect x="4" y="6" width="14" height="10" rx="2"/><circle cx="11" cy="11" r="3"/><path d="M18 10l2-1v4l-2-1"/>',
    printer: '<rect x="5" y="10" width="14" height="8" rx="1"/><path d="M7 10V6h10v4"/><path d="M8 14h8"/>',
    pc: '<rect x="4" y="3" width="16" height="12" rx="1"/><path d="M8 7h8M8 10h5"/><path d="M9 15v4h6v-4"/>',
    mobile: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M12 18h.01"/>',
    iot: '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',
    firewall: '<path d="M12 22s8-4 8-10V4l-8-2-8 2v8c0 6 8 10 8 10z"/>',
    vm: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/>',
    lxc: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 4v16M16 4v16M4 8h16M4 16h16"/>',
    unknown: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  };

  function get(name) {
    return icons[name] || icons.unknown;
  }

  function getAll() {
    return Object.keys(icons);
  }

  return { get, getAll };
})();
