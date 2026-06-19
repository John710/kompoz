// themes.js — light/dark theme switcher

const Themes = (() => {
  const STORAGE_KEY = 'ce-theme';
  const DEFAULT_THEME = 'dark';

  const themes = {
    dark: {
      '--bg': '#0d0f14',
      '--bg2': '#13161e',
      '--bg3': '#1a1e2a',
      '--bg4': '#222736',
      '--text': '#e2e8f8',
      '--text2': '#8892aa',
      '--text3': '#4a5468',
      '--border': '#2a3045',
      '--accent': '#5b8cff',
      '--accent2': '#3d6aff',
      '--green': '#3dffa0',
      '--yellow': '#ffd95b',
      '--red': '#ff5b5b',
      '--purple': '#c084fc',
      '--root-tag': '#ff9d5c',
      '--comp-tag': '#5b8cff',
      '--net-tag': '#ff9d5c',
      '--vol-tag': '#5b8cff',
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
      '--accent': '#037aee',
      '--accent2': '#0358b0',
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
