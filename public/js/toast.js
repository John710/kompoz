// toast.js — notifications

const Toast = (() => {
  function show(msg, type = 'info') {
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = '';
    const iconSpan = document.createElement('span');
    iconSpan.textContent = icons[type] || '·';
    const msgSpan = document.createElement('span');
    msgSpan.textContent = msg;
    el.appendChild(iconSpan);
    el.appendChild(msgSpan);
    document.getElementById('toastContainer').appendChild(el);
    setTimeout(() => {
      el.classList.add('removing');
      setTimeout(() => el.remove(), 300);
    }, 3000);
  }
  return { show };
})();
