const State = {
  currentProject: null,
  allProjects: [],
  allFiles: [],
  openTabs: [],
  activeTab: null,
  rightPanelTab: 'networks',
  canCreate: false,

  getTab(path) { return this.openTabs.find(t => t.path === path) || null; },
  setTab(tab) {
    const idx = this.openTabs.findIndex(t => t.path === tab.path);
    if (idx >= 0) this.openTabs[idx] = tab; else this.openTabs.push(tab);
  },
  removeTab(path) { this.openTabs = this.openTabs.filter(t => t.path !== path); }
};
