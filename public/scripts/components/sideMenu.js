// Build a shared side menu with a unified menu-header and items
document.addEventListener("DOMContentLoaded", function () {
  const sideMenu = document.getElementById("sideMenu");
  if (!sideMenu) return;

  const pathname = (location.pathname || "").split("/").pop();
  const isAdminPanel = pathname === "admin-panel.html";
  const isBotCommands = pathname === "bot-commands.html";
  const isBotDashboard = pathname === "bot-dashboard.html";
  const isSendPrivateMessage = pathname === "send-private-message.html";

  const botCommandsPath = (window.CONFIG && window.CONFIG.BOT_COMMANDS_PATH) || "/bot-commands.html";

  const items = [];
  if (isBotDashboard) {
    items.push({ href: "/admin-panel.html", icon: "fas fa-arrow-left", label: " Quay lại" });
  }

  items.push({ href: "/admin-panel.html", icon: "fas fa-home", label: " Trang Chủ", active: isAdminPanel });
  items.push({ href: botCommandsPath, icon: "fas fa-terminal", label: " Commands List", active: isBotCommands });
  items.push({ href: "/send-private-message.html", icon: "fas fa-envelope", label: " Gửi tin nhắn riêng", active: isSendPrivateMessage });

  const interfaceSubmenu = `
    <li class="has-submenu">
      <a href="#" id="interfaceModeToggle"><i class="fas fa-paint-brush"></i><span class="menu-label"> Color Theme</span></a>
      <ul class="submenu">
        <li><a href="#" id="btnThemeLight"><i class="fas fa-sun"></i><span class="menu-label"> Light mode</span></a></li>
        <li><a href="#" id="btnThemeDark"><i class="fas fa-moon"></i><span class="menu-label"> Dark mode</span></a></li>
        <li><a href="#" id="btnThemeGradient"><i class="fas fa-adjust"></i><span class="menu-label"> Gradient mode</span></a></li>
      </ul>
    </li>`;

  const logoutItem = { href: "#", id: "logoutBtn", icon: "fas fa-sign-out-alt", label: " Đăng Xuất" };

  sideMenu.innerHTML = `
    <div class="menu-header">
      <h3>Menu</h3>
    </div>
    <ul>
      ${items
        .map(
          (it) => `
          <li>
            <a href="${it.href}" ${it.id ? `id="${it.id}"` : ""} ${it.active ? 'class="active"' : ""}>
              <i class="${it.icon}"></i><span class="menu-label">${it.label}</span>
            </a>
          </li>`
        )
        .join("")}
      ${interfaceSubmenu}
      <li>
        <a href="${logoutItem.href}" id="${logoutItem.id}"><i class="${logoutItem.icon}"></i><span class="menu-label">${
    logoutItem.label
  }</span></a>
      </li>
    </ul>
  `;

  const toggle = document.getElementById("interfaceModeToggle");
  if (toggle) {
    toggle.addEventListener("click", function (e) {
      e.preventDefault();
      const li = toggle.parentElement;
      if (li) li.classList.toggle("open");
    });
  }

  if (window.Common && typeof window.Common.attachLogout === 'function') {
    window.Common.attachLogout('logoutBtn');
  }
});
