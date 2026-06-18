// i18n.js - internationalization with external JSON locales
// Loads translations from /locales/ folder only

const I18N = (() => {
  const DEFAULT_LANG = "en";
  let currentLang = DEFAULT_LANG;
  let dict = {};
  let loaded = {};
  let availableLangs = [];
  let initialized = false;

  // Apply translation to element
  const applyTranslation = (el, useDict = true) => {
    if (!el.dataset) return;
    
    if (el.dataset.i18n) {
      const key = el.dataset.i18n;
      const attr = el.dataset.i18nAttr;
      let val = key;
      
      if (useDict && dict[currentLang]) {
        val = dict[currentLang][key] ?? dict[DEFAULT_LANG]?.[key] ?? key;
      }
      
      if (attr) {
        el.setAttribute(attr, val);
      } else if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
        if (el.placeholder !== undefined) el.placeholder = val;
      } else {
        el.textContent = val;
      }
    }
    
    if (el.dataset.i18nHtml) {
      const key = el.dataset.i18nHtml;
      let val = key;
      
      if (useDict && dict[currentLang]) {
        val = dict[currentLang][key] ?? dict[DEFAULT_LANG]?.[key] ?? key;
      }
      
      el.innerHTML = val;
    }
    
    // Apply to children
    if (el.querySelectorAll) {
      el.querySelectorAll("[data-i18n], [data-i18n-html]").forEach(child => {
        applyTranslation(child, useDict);
      });
    }
  };

  // Apply to entire document
  const applyToDocument = () => {
    document.querySelectorAll("[data-i18n], [data-i18n-html]").forEach(el => {
      applyTranslation(el);
    });
  };

  // MutationObserver to catch dynamically added elements
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) { // Element node
          applyTranslation(node);
        }
      });
    });
  });

  // Start observing when body is ready
  const startObserver = () => {
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    } else {
      document.addEventListener("DOMContentLoaded", () => {
        observer.observe(document.body, { childList: true, subtree: true });
      });
    }
  };

  // Fetch available locales from API
  async function _fetchLocales() {
    try {
      const res = await fetch("/api/locales", { cache: "no-store" });
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      availableLangs = data.locales || [];
    } catch (e) {
      console.warn("Failed to load locale list, using fallback");
      availableLangs = [
        { code: "en", name: "English" },
        { code: "ru", name: "Русский" }
      ];
    }
  }

  // Load specific locale from /locales/{lang}.json
  async function _loadLang(lang) {
    if (loaded[lang]) return dict[lang];
    
    try {
      const res = await fetch(`/locales/${lang}.json`, { cache: "no-store" });
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      dict[lang] = data;
      loaded[lang] = true;
      
      // Extract available langs from meta if present
      if (data._meta && !availableLangs.find(l => l.code === lang)) {
        availableLangs.push({ code: lang, name: data._meta.name || lang });
      }
      
      return data;
    } catch (e) {
      console.warn(`Failed to load locale ${lang}`);
      dict[lang] = {};
      loaded[lang] = true;
      return dict[lang];
    }
  }

  // Initialize: load saved language and apply translations
  async function init() {
    if (initialized) return;
    
    await _fetchLocales();
    
    // Load language from server settings
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.settings && data.settings.lang) {
        currentLang = data.settings.lang;
      }
    } catch (e) {
      console.warn("Failed to load lang from server, using default");
    }
    
    // Load default lang first
    await _loadLang(DEFAULT_LANG);
    
    // Load user's lang
    if (currentLang !== DEFAULT_LANG) {
      await _loadLang(currentLang);
    }
    
    // Set document language
    document.documentElement.lang = currentLang;
    
    // Apply translations
    applyToDocument();
    
    // Show body if it was hidden to prevent flicker
    if (document.body) {
      document.body.style.visibility = "visible";
    }
    
    startObserver();
    initialized = true;
  }

  // Get translated text with placeholders
  function t(key, placeholders = {}) {
    const str = dict[currentLang]?.[key] ?? dict[DEFAULT_LANG]?.[key] ?? key;
    return str.replace(/\{([^}]+)\}/g, (_, name) => placeholders[name] ?? `{${name}}`);
  }

  // Switch language
  async function setLang(lang) {
    if (!dict[lang] && !loaded[lang]) {
      await _loadLang(lang);
    }
    if (!dict[lang]) return;
    
    // Save to server
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { lang } })
      });
    } catch (e) {
      console.warn('Failed to save lang to server:', e);
    }
    
    currentLang = lang;
    document.documentElement.lang = lang;
    applyToDocument();
    _emitChange();
  }

  function getLang() { return currentLang; }
  function getAvailableLangs() { return availableLangs; }

  // Re-translate entire DOM
  function _translateDOM() {
    applyToDocument();
  }

  function _emitChange() {
    window.dispatchEvent(new CustomEvent("i18n-change", { detail: { lang: currentLang } }));
  }

  // Translate dclint messages
  function translateDclint(rule, message) {
    const messages = dict[currentLang]?.dclintMessages || {};
    if (messages[message]) return messages[message];
    
    for (const [en, translated] of Object.entries(messages)) {
      const placeholderNames = [...en.matchAll(/\{([^}]+)\}/g)].map(m => m[1]);
      if (placeholderNames.length === 0) continue;
      
      let pattern = "^" + en.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
      pattern = pattern.replace(/\\"\{[^}]+\}\\"/g, '\\"([^"]*)\\"');
      pattern = pattern.replace(/\{[^}]+\}/g, "(.+)");
      
      try {
        const regex = new RegExp(pattern);
        const match = message.match(regex);
        if (match) {
          let result = translated;
          for (let i = 0; i < placeholderNames.length; i++) {
            result = result.replace(`{${placeholderNames[i]}}`, match[i + 1] ?? `{${placeholderNames[i]}}`);
          }
          return result;
        }
      } catch {}
    }
    
    if (rule === "invalid-yaml") {
      return dict[currentLang]?.dclintMessages?.["YAML syntax error"] ?? dict[DEFAULT_LANG]?.dclintMessages?.["YAML syntax error"] ?? message;
    }
    return message;
  }

  return { init, t, setLang, getLang, getAvailableLangs, translateDclint, refresh: _translateDOM };
})();

// Global helper for rendering language dropdown
function toggleLangDropdown() { 
  const existing = document.getElementById("langDropdown");
  if (existing) { existing.remove(); return; }

  const btn = document.getElementById("langBtn");
  if (!btn) return;
  const rect = btn.getBoundingClientRect();
  const langs = I18N.getAvailableLangs();
  const current = I18N.getLang();

  let html = "";
  langs.forEach(l => {
    html += `<div class="proj-dropdown-item ${current === l.code ? 'active' : ''}"
      onclick="I18N.setLang('${l.code}');document.getElementById('langDropdown')?.remove()">
      ${l.name}
    </div>`;
  });

  const dd = document.createElement("div");
  dd.id = "langDropdown";
  dd.className = "proj-dropdown";
  dd.style.top = (rect.bottom + 4) + "px";
  const ddWidth = Math.max(rect.width, 140);
  dd.style.width = ddWidth + "px";
  if (rect.left + ddWidth > window.innerWidth - 8) {
    dd.style.left = "auto";
    dd.style.right = (window.innerWidth - rect.right) + "px";
  } else {
    dd.style.left = rect.left + "px";
    dd.style.right = "auto";
  }
  dd.innerHTML = html;
  document.body.appendChild(dd);

  setTimeout(() => {
    document.addEventListener("click", function h(e) {
      if (!dd.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
        dd.remove(); document.removeEventListener("click", h);
      }
    });
  }, 0);
}
