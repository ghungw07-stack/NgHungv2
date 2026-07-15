// Common helpers used across multiple pages
(function () {
  function attachLogout(btnId = 'logoutBtn') {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const res = await fetch('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        if (res.ok) window.location.href = '/login.html';
      } catch (err) {
        console.error('Lỗi khi đăng xuất:', err);
      }
    });
  }

  function showConfirmDialog(title, message, onConfirm) {
    const dialog = document.getElementById('confirmDialog');
    const titleEl = document.getElementById('confirmTitle');
    const messageEl = document.getElementById('confirmMessage');
    const yesBtn = document.getElementById('confirmYes');
    const noBtn = document.getElementById('confirmNo');
    if (!dialog || !titleEl || !messageEl || !yesBtn || !noBtn) {
      if (confirm(message)) onConfirm && onConfirm();
      return;
    }
    titleEl.textContent = title;
    messageEl.textContent = message;
    dialog.style.display = 'block';
    yesBtn.onclick = () => { dialog.style.display = 'none'; onConfirm && onConfirm(); };
    noBtn.onclick = () => { dialog.style.display = 'none'; };
  }

  function formatUptime(ms) {
    if (!ms) return 'N/A';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days} ngày ${hours % 24} giờ`;
    if (hours > 0) return `${hours} giờ ${minutes % 60} phút`;
    if (minutes > 0) return `${minutes} phút ${seconds % 60} giây`;
    return `${seconds} giây`;
  }

  function formatDate(ts) {
    if (!ts) return 'N/A';
    const d = new Date(ts);
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  window.Common = { attachLogout, showConfirmDialog, formatUptime, formatDate };
})();


