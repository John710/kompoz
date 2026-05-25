// themes.js — light/dark theme switcher

const Themes = (() => {
  const STORAGE_KEY = 'ce-theme';
  const DEFAULT_THEME = 'dark';

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

  let currentTheme = localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME;

  function _updateIcons() {
    const darkIcon = document.querySelector('.theme-icon-dark');
    const lightIcon = document.querySelector('.theme-icon-light');
    if (darkIcon) darkIcon.style.display = currentTheme === 'dark' ? '' : 'none';
    if (lightIcon) lightIcon.style.display = currentTheme === 'dark' ? 'none' : '';
  }

  function apply(themeName) {
    const t = themes[themeName];
    if (!t) return;
    currentTheme = themeName;
    localStorage.setItem(STORAGE_KEY, themeName);
    const root = document.documentElement;
    Object.entries(t).forEach(([k, v]) => root.style.setProperty(k, v));
    root.setAttribute('data-theme', themeName);
    _updateIcons();
  }

  function toggle() {
    apply(currentTheme === 'dark' ? 'light' : 'dark');
  }

  function get() { return currentTheme; }

  function init() {
    apply(currentTheme);
  }

  return { init, apply, toggle, get };
})();
