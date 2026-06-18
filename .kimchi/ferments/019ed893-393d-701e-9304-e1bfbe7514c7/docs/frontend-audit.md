# Frontend Audit Notes — Step 2

## Issue 1: CRITICAL — XSS via innerHTML in Container Map tooltip
- **File**: `public/map.html` (inside `showTip` and `showPortTip` functions)
- **Details**: `tt.innerHTML = html` renders raw HTML containing `d.name`, `d.image`, `d.ports`, `d.networks`, `d.sourceFile` parsed from user-authored YAML files. A malicious service name like `<img src=x onerror=alert(document.cookie)>` will execute arbitrary JavaScript.
- **Fix**: Use DOM creation instead of HTML strings:
  ```js
  const title = document.createElement('div'); title.className = 'tt-title'; title.textContent = d.name;
  tt.innerHTML = ''; tt.appendChild(title);
  // append other rows with textContent
  ```

## Issue 2: HIGH — XSS via innerHTML in profile avatar
- **File**: `public/editor.html` (inside `loadUser` function)
- **Details**: `av.innerHTML = \`<img src="${d.user.avatar}" ...>\`` — if the server returns a `javascript:` URL for avatar, code execution occurs.
- **Fix**: Create image element via DOM and validate the protocol:
  ```js
  const img = document.createElement('img');
  if (/^https?:\/\//.test(d.user.avatar)) img.src = d.user.avatar;
  av.appendChild(img);
  ```

## Issue 3: HIGH — XSS in Sidebar file list via _esc escaping
- **File**: `public/js/sidebar.js:37-52` (function `_item`)
- **Details**: `_esc(f.path)` only escapes backslashes and single quotes. It does NOT escape HTML metacharacters (`<`, `>`, `"`). If a project contains a file named `test<img src=x onerror=alert(1)>.yml`, the rendered sidebar will execute the payload.
- **Fix**: Add HTML entity escaping or switch to DOM-based construction:
  ```js
  function _escHtml(s) {
    const div = document.createElement('div'); div.textContent = s; return div.innerHTML;
  }
  ```

## Issue 4: MEDIUM — Toast notifications use innerHTML with API messages
- **File**: `public/js/toast.js:6`
- **Details**: `el.innerHTML = \`<span>...</span><span>${msg}</span>\`` — `msg` may come from API error responses (`data.error`) which could contain HTML.
- **Fix**: Use `textContent` for the message span or escape HTML before insertion.

## Issue 5: MEDIUM — Inline event handlers prevent CSP adoption
- **File**: `public/editor.html` (throughout) and `public/map.html` (throughout)
- **Details**: Dozens of `onclick="App.toggleProjectDropdown()"`, `onmouseenter="showLegend()"`, etc. inline handlers make a strict Content-Security-Policy impossible and increase XSS surface area.
- **Fix**: Migrate to `addEventListener` in JS modules after DOM load.

## Issue 6: MEDIUM — API wrapper assumes JSON without checking
- **File**: `public/js/api.js`
- **Details**: All methods call `(await fetch(...)).json()` unconditionally. If the server returns a 500 HTML page or empty body, `.json()` throws an unhandled rejection.
- **Fix**: Wrap each call to check `r.ok` and content-type:
  ```js
  async function _json(r) {
    if (!r.ok) { const t = await r.text(); throw new Error(t || r.statusText); }
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('application/json')) throw new Error('Unexpected response type');
    return r.json();
  }
  ```

## Issue 7: LOW — map.html uses confirm() with i18n string before navigation
- **File**: `public/map.html` (inside D3 node click handler)
- **Details**: `confirm(I18N.t('openInEditor'))` uses a string that could theoretically be manipulated if the locale JSON is compromised (though unlikely). The `location.href` is safe due to `encodeURIComponent`.
- **Fix**: Validate `project` against the allowed name regex before navigation.

## Issue 8: LOW — No explicit CSRF protection on state-changing POSTs
- **File**: `public/js/api.js` (all POST/DELETE methods)
- **Details**: API requests use cookie auth but do not include CSRF tokens or custom headers. While `SameSite=Strict` mitigates cross-site POSTs, older browsers or same-site subdomains may still allow CSRF.
- **Fix**: Require a custom header (`X-Requested-With: Kompoz`) on all API calls and reject API requests without it server-side.
