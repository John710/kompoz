// themes.js — light/dark theme switcher

const Themes = (() => {
  const DEFAULT_THEME = 'dark';
  let currentTheme = DEFAULT_THEME;

  const themes = {
    dark: {
      '--bg': '#0d1117',
      '--bg2': '#161b22',
      '--bg3': '#21262d',
      '--bg4': '#222736',
      '--text': '#c9d1d9',
      '--text2': '#8b949e',
      '--text3': '#6e7681',
      '--border': '#30363d',
      '--accent': '#58a6ff',
      '--accent2': '#1f6feb',
      '--green': '#3fb950',
      '--yellow': '#d29922',
      '--red': '#f85149',
      '--purple': '#a371f7',
      '--root-tag': '#ffd95b',
      '--comp-tag': '#5b8cff',
      '--net-tag': '#ff9b5b',
      '--vol-tag': '#5bff9b',
    },
    light: {
      '--bg': '#ffffff',
      '--bg2': '#f6f8fa',
      '--bg3': '#eaeef2',
      '--bg4': '#e1e4e8',
      '--text': '#24292f',
      '--text2': '#57606a',
      '--text3': '#8c959f',
      '--border': '#d0d7de',
      '--accent': '#0969da',
      '--accent2': '#0550ae',
      '--green': '#1a7f37',
      '--yellow': '#9a6700',
      '--red': '#cf222e',
      '--purple': '#8250df',
      '--root-tag': '#bf8700',
      '--comp-tag': '#0969da',
      '--net-tag': '#bc4c00',
      '--vol-tag': '#1a7f37',
    }
  };

  function _updateIcons() {
    const darkIcon = document.querySelector('.theme-icon-dark');
    const lightIcon = document.querySelector('.theme-icon-light');
    if (darkIcon) darkIcon.style.display = currentTheme === 'dark' ? '' : 'none';
    if (lightIcon) lightIcon.style.display = currentTheme === 'dark' ? 'none' : '';
  }

  function _applyTheme(themeName) {
    const t = themes[themeName];
    if (!t) return;
    currentTheme = themeName;
    const root = document.documentElement;
    Object.entries(t).forEach(([k, v]) => root.style.setProperty(k, v));
    root.setAttribute('data-theme', themeName);
    _updateIcons();
  }

  async function apply(themeName) {
    _applyTheme(themeName);
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { theme: themeName } })
      });
    } catch (e) {
      console.error('Failed to save theme to server:', e);
    }
  }

  function toggle() {
    apply(currentTheme === 'dark' ? 'light' : 'dark');
  }

  function get() { return currentTheme; }

  async function init() {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.settings && data.settings.theme) {
        currentTheme = data.settings.theme;
      }
    } catch (e) {
      console.error('Failed to load theme from server:', e);
    }
    _applyTheme(currentTheme);
  }

  return { init, apply, toggle, get };
})();
