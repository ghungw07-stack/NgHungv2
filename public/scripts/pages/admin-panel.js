document.addEventListener("DOMContentLoaded", function () {
  const socket = io();
  let selectedBotId = null;
  let botsList = [];
  let infoIntervalId = null;

  const STATUS_LABEL = {
    active: "Hoạt động",
    pending: "Chờ duyệt",
    reject: "Từ chối",
    inactive: "Đã tắt",
  };

  function statusKeyOf(status) {
    return ["active", "pending", "reject"].includes(status) ? status : "inactive";
  }

  socket.on("connect", () => {
    console.log("Đã kết nối tới máy chủ");
    loadBotsList();
  });

  function loadBotsList() {
    renderLoading();
    socket.emit("getBotsList");
  }

  socket.on("botsList", (bots) => {
    botsList = bots;
    renderBotsList(bots);
  });

  socket.on("groupsList", (groups, botIdReturn) => {
    const targetId = botIdReturn || selectedBotId;
    const bot = botsList.find((b) => b.id === targetId);
    if (bot) {
      bot.groupCount = groups?.length || 0;
    }
  });

  socket.on("friendsList", (friends, botIdReturn) => {
    const targetId = botIdReturn || selectedBotId;
    const bot = botsList.find((b) => b.id === targetId);
    if (bot) {
      bot.friendCount = friends?.length || 0;
    }
  });

  function buildMenuHtml(bot) {
    let buttonActionFirst = "",
      buttonManagerTimeBot = "";

    switch (bot.status) {
      case "active":
        if (!bot.isMainBot)
          buttonActionFirst += `<button class="menu-btn stop" data-action="stop" data-bot-id="${bot.id}"><i class="fas fa-stop-circle"></i> Tắt Bot</button>`;
        buttonActionFirst += `<button class="menu-btn restart" data-action="restart" data-bot-id="${bot.id}"><i class="fas fa-redo-alt"></i> Khởi động lại</button>`;
        buttonActionFirst += `<button class="menu-btn manage" data-action="manage" data-bot-id="${bot.id}"><i class="fas fa-cogs"></i> Giao Diện Tin Nhắn</button>`;
        break;
      case "pending":
        buttonActionFirst += `<button class="menu-btn approve" data-action="approve" data-bot-id="${bot.id}"><i class="fas fa-check"></i> Phê Duyệt Bot</button>`;
        buttonActionFirst += `<button class="menu-btn reject" data-action="reject" data-bot-id="${bot.id}"><i class="fas fa-times"></i> Từ Chối Phê Duyệt Bot</button>`;
        break;
      case "reject":
        buttonActionFirst += `<button class="menu-btn approve" data-action="approve" data-bot-id="${bot.id}"><i class="fas fa-check"></i> Phê Duyệt Lại Bot</button>`;
        break;
      default:
        buttonActionFirst += `<button class="menu-btn start" data-action="start" data-bot-id="${bot.id}"><i class="fas fa-play-circle"></i> Bật Bot</button>`;
        break;
    }

    if (!bot.isMainBot) {
      switch (bot.status) {
        case "active":
        case "inactive":
          buttonManagerTimeBot += `<button class="menu-btn addtime" data-action="addtime" data-bot-id="${bot.id}"><i class="fas fa-plus-circle"></i> Thêm thời gian</button>`;
          buttonManagerTimeBot += `<button class="menu-btn subtime" data-action="subtime" data-bot-id="${bot.id}"><i class="fas fa-minus-circle"></i> Giảm thời gian</button>`;
          buttonManagerTimeBot += `<button class="menu-btn settime" data-action="settime" data-bot-id="${bot.id}"><i class="fas fa-clock"></i> Đặt thời gian</button>`;
          buttonManagerTimeBot += `<button class="menu-btn remove" data-action="remove" data-bot-id="${bot.id}"><i class="fas fa-trash-alt"></i> Xóa Bot</button>`;
          break;
        case "pending":
        case "reject":
          buttonManagerTimeBot += `<button class="menu-btn remove" data-action="remove" data-bot-id="${bot.id}"><i class="fas fa-trash-alt"></i> Xóa Bot</button>`;
          break;
      }
    }

    return buttonActionFirst + buttonManagerTimeBot;
  }

  function renderBotsList(bots, isSearch = false) {
    const container = document.getElementById("botListContainer");
    const botCount = document.getElementById("botCount");

    if (!bots || bots.length === 0) {
      if (isSearch) {
        container.innerHTML = '<div class="no-bots">Không tìm thấy bot nào</div>';
      } else {
        container.innerHTML = '<div class="no-bots">Không có bot nào hoạt động</div>';
      }
      botCount.textContent = "0 bot";
      return;
    }

    botCount.textContent = `${bots.length} bot`;
    container.innerHTML = "";

    const listFragment = document.createDocumentFragment();

    bots.slice().forEach((bot) => {
      const statusKey = statusKeyOf(bot.status);
      const statusLabel = STATUS_LABEL[statusKey];
      const menuHtml = buildMenuHtml(bot);

      const rowElement = document.createElement("div");
      rowElement.className = `bot-row status-${statusKey} ${selectedBotId === bot.id ? "active" : ""}`;
      rowElement.dataset.botId = bot.id;

      rowElement.innerHTML = `
        <img src="${bot.avatar || "/images/default-avatar.png"}" class="bot-row-avatar" alt="${bot.name || "Bot"}">
        <div class="bot-row-main">
          <div class="bot-row-name">${bot.name || "Bot không tên"}</div>
          <div class="bot-row-id">ID ${bot.id}</div>
        </div>
        <span class="status-pill status-${statusKey}">${statusLabel}</span>
        <button class="kebab-btn" title="Tác vụ" data-bot-id="${bot.id}"><i class="fas fa-ellipsis-vertical"></i></button>
      `;

      const ownerAvatar = bot.ownerData && bot.ownerData.avatar;
      if (ownerAvatar) {
        rowElement.classList.add("has-owner-bg");
        rowElement.style.setProperty("--owner-bg", `url("${ownerAvatar}")`);
      }

      rowElement.addEventListener("click", () => selectBot(bot.id));
      const kebabBtn = rowElement.querySelector(".kebab-btn");
      kebabBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openActionSheet(bot, menuHtml);
      });

      listFragment.appendChild(rowElement);
    });

    container.appendChild(listFragment);
  }

  function renderLoading() {
    const container = document.getElementById("botListContainer");
    container.innerHTML = `
      <div class="skeleton-list">
        <div class="skeleton-item"></div>
        <div class="skeleton-item"></div>
        <div class="skeleton-item"></div>
      </div>
    `;
  }

  const botSearch = document.getElementById("botSearch");
  const refreshBotsBtn = document.getElementById("refreshBotsBtn");
  refreshBotsBtn.addEventListener("click", loadBotsList);
  botSearch.addEventListener("input", () => {
    const q = botSearch.value.trim().toLowerCase();
    const filtered = q ? botsList.filter((b) => `${b.name || ""} ${b.id}`.toLowerCase().includes(q)) : botsList;
    renderBotsList(filtered, true);
  });

  function selectBot(botId) {
    selectedBotId = botId;

    socket.emit("getAllGroups", { botId: botId });
    socket.emit("getAllFriends", { botId: botId });

    document.querySelectorAll(".bot-row").forEach((item) => {
      item.classList.toggle("active", item.dataset.botId === botId);
    });

    const bot = botsList.find((b) => b.id === botId);

    if (bot) {
      if (infoIntervalId) {
        clearInterval(infoIntervalId);
        infoIntervalId = null;
      }

      renderBotInfo(bot);

      infoIntervalId = setInterval(() => {
        const current = botsList.find((b) => b.id === selectedBotId);
        if (current) renderBotInfo(current);
      }, 1000);
    }
  }

  function renderBotInfo(bot) {
    const container = document.getElementById("botInfoContainer");
    const statusKey = statusKeyOf(bot.status);
    const statusText = STATUS_LABEL[statusKey];

    const uptimeText =
      bot.status === "active" ? (window.Common ? Common.formatUptime : formatUptime)(Date.now() - bot.timeStart) : "—";

    const remainingText =
      bot.timeRemaining === -1
        ? "Vô thời hạn"
        : bot.timeRemaining > 0
        ? bot.status === "active"
          ? formatSeconds(Math.floor((bot.timeExpired - Date.now()) / 1000))
          : formatSeconds(Math.floor(bot.timeRemaining / 1000))
        : "Hết hạn";

    const detailRows = bot.botData
      ? [
          bot.botData.createdBy &&
            `<div class="info-item"><span class="info-label">Người tạo</span><span class="info-value">${bot.botData.createdBy}</span></div>`,
          bot.botData.createdAt &&
            `<div class="info-item"><span class="info-label">Ngày tạo</span><span class="info-value">${formatDate(bot.botData.createdAt)}</span></div>`,
          bot.botData.typePlatform &&
            `<div class="info-item"><span class="info-label">Type Platform</span><span class="info-value">${bot.botData.typePlatform}</span></div>`,
          bot.botData.infoOwner?.description &&
            `<div class="info-item"><span class="info-label">Mô tả</span><span class="info-value">${bot.botData.infoOwner.description}</span></div>`,
          bot.botData.infoOwner?.botInfo &&
            `<div class="info-item"><span class="info-label">Thông tin Bot</span><span class="info-value">${bot.botData.infoOwner.botInfo}</span></div>`,
          bot.botData.infoOwner?.nameServer &&
            `<div class="info-item"><span class="info-label">Tên Đại Diện</span><span class="info-value">${bot.botData.infoOwner.nameServer}</span></div>`,
          bot.botData.approvedBy &&
            `<div class="info-item"><span class="info-label">Phê Duyệt Bởi ID</span><span class="info-value">${bot.botData.approvedBy}</span></div>`,
        ]
          .filter(Boolean)
          .join("")
      : "";

    container.innerHTML = `
      <div class="profile-header">
        <img src="${bot.avatar || "/images/default-avatar.png"}" class="profile-avatar" alt="${bot.name || "Bot"}">
        <div class="profile-meta">
          <div class="profile-name">${bot.name || "Bot không tên"}</div>
          <div class="profile-id">ID ${bot.id}</div>
        </div>
        <span class="status-pill status-${statusKey}">${statusText}</span>
      </div>

      <div class="metric-grid">
        <div class="metric-tile">
          <div class="metric-value">${bot.groupCount || 0}</div>
          <div class="metric-label">Số nhóm</div>
        </div>
        <div class="metric-tile">
          <div class="metric-value">${bot.friendCount || 0}</div>
          <div class="metric-label">Số bạn bè</div>
        </div>
        <div class="metric-tile">
          <div class="metric-value">${uptimeText}</div>
          <div class="metric-label">Đang chạy</div>
        </div>
        <div class="metric-tile">
          <div class="metric-value">${remainingText}</div>
          <div class="metric-label">Còn lại</div>
        </div>
      </div>

      <div class="info-group">
        <h3>Thông tin cơ bản</h3>
        <div class="info-item">
          <span class="info-label">Zalo Đăng Ký Bot</span>
          <span class="info-value">${bot.name || "Không có tên"}</span>
        </div>
        ${
          bot.botData?.nameBot
            ? `<div class="info-item"><span class="info-label">Tên Zalo Bot</span><span class="info-value">${bot.botData.nameBot}</span></div>`
            : ""
        }
        <div class="info-item">
          <span class="info-label">Số Điện Thoại</span>
          <span class="info-value">${bot.info.phone}</span>
        </div>
      </div>

      ${detailRows ? `<div class="info-group"><h3>Thông tin chi tiết</h3>${detailRows}</div>` : ""}
    `;
  }

  function handleActionClick(event) {
    event.stopPropagation();
    const action = event.currentTarget.dataset.action;
    const botId = event.currentTarget.dataset.botId || selectedBotId;

    if (!botId) return;

    const bot = botsList.find((b) => b.id === botId);
    if (!bot) return;

    switch (action) {
      case "approve":
        showTimeAdjustDialog("Phê Duyệt Bot: Nhập Thời Hạn Cấp Cho Bot", (seconds) => {
          socket.emit("botAction", { action, botId, value: seconds });
        });
        break;

      case "reject":
        showConfirmDialog("Từ Chối Bot", `Xác nhận từ chối phê duyệt bot "${bot.name}"?`, () => {
          socket.emit("botAction", { action, botId });
        });
        break;

      case "addtime":
        showTimeAdjustDialog("Thêm thời gian cho bot", (seconds) => {
          socket.emit("botAction", { action, botId, value: seconds });
        });
        break;

      case "subtime":
        showTimeAdjustDialog("Giảm thời gian của bot", (seconds) => {
          socket.emit("botAction", { action, botId, value: seconds });
        });
        break;

      case "settime":
        showSetTimeDialog("Đặt thời gian cho bot", (seconds) => {
          socket.emit("botAction", { action, botId, value: seconds });
        });
        break;

      case "remove":
        showConfirmDialog("Xóa Bot", `Bạn có chắc muốn xóa bot "${bot.name}"?`, () => {
          socket.emit("botAction", { action, botId });
        });
        break;

      case "stop":
        showConfirmDialog("Xác Nhận Tắt Bot", `Bạn có chắc chắn muốn tắt bot "${bot.name}" không?`, () => {
          socket.emit("botAction", { action, botId });
        });
        break;

      case "restart":
        showConfirmDialog(
          "Xác Nhận Khởi Động Lại",
          `Bạn có chắc chắn muốn khởi động lại bot "${bot.name}" không?`,
          () => {
            socket.emit("botAction", { action, botId });
          }
        );
        break;

      case "start":
        showConfirmDialog("Xác Nhận Bật Bot", `Bạn có chắc chắn muốn bật bot "${bot.name}" không?`, () => {
          socket.emit("botAction", { action, botId });
        });
        break;

      case "manage":
        window.location.href = `/bot-dashboard.html?id=${botId}`;
        break;
    }

    closeActionSheet();
  }

  socket.on("botActionResult", (result) => {
    if (result && result.status === "info") {
      showActionResultPopup(result.message || "Đang xử lý...", { status: "info" });
      return;
    }
    if (result && result.success) {
      showActionResultPopup(result.message || "Thao tác đã được xử lý thành công.", { status: "success" });
      loadBotsList();
    } else if (result && !result.success) {
      showActionResultPopup(`Lỗi: ${result.message}`, { status: "error" });
    } else {
      showActionResultPopup(`${result.message}`, { status: "info" });
    }
  });

  // ── Bottom sheet tác vụ ────────────────────────────────────────────
  const actionSheet = document.getElementById("actionSheet");
  const actionSheetBackdrop = document.getElementById("actionSheetBackdrop");
  const actionSheetBody = document.getElementById("actionSheetBody");
  const actionSheetHeader = document.getElementById("actionSheetHeader");

  function openActionSheet(bot, menuHtml) {
    actionSheetHeader.textContent = bot.name || "Tác vụ bot";
    actionSheetBody.innerHTML = menuHtml;
    actionSheetBody.querySelectorAll(".menu-btn").forEach((btn) => {
      btn.addEventListener("click", handleActionClick);
    });
    actionSheet.classList.add("open");
  }

  function closeActionSheet() {
    actionSheet.classList.remove("open");
  }

  function closeAllMenus() {
    closeActionSheet();
  }

  actionSheetBackdrop.addEventListener("click", closeActionSheet);

  function showConfirmDialog(title, message, onConfirm) {
    const dialog = document.getElementById("confirmDialog");
    const titleEl = document.getElementById("confirmTitle");
    const messageEl = document.getElementById("confirmMessage");
    const yesBtn = document.getElementById("confirmYes");
    const noBtn = document.getElementById("confirmNo");

    titleEl.textContent = title;
    messageEl.textContent = message;

    dialog.style.display = "block";

    yesBtn.onclick = () => {
      dialog.style.display = "none";
      onConfirm();
    };

    noBtn.onclick = () => {
      dialog.style.display = "none";
    };
  }

  function formatUptime(ms) {
    if (!ms) return "N/A";

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}n ${hours % 24}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}p`;
    } else if (minutes > 0) {
      return `${minutes}p ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  function formatDate(timestamp) {
    if (!timestamp) return "N/A";

    const date = new Date(timestamp);
    return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
  }

  function formatSeconds(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    const parts = [];
    if (days > 0) {
      parts.push(`${days}d`);
    }
    if (hours > 0 || days > 0) {
      parts.push(`${hours}h`);
    }
    if (minutes > 0 || hours > 0 || days > 0) {
      parts.push(`${minutes}p`);
    }
    parts.push(`${remainingSeconds}s`);

    return parts.join(" ");
  }

  // Dialog chọn thời gian (ngày/giờ/phút)
  function showTimeAdjustDialog(title, onConfirm) {
    const html = `
      <div id="timeAdjustDialog" class="popup" style="display: none">
        <div class="popup-content">
          <h2>${title}</h2>
          <div style="display:flex; gap:8px; align-items:center; margin-top:8px;">
            <label>Ngày</label>
            <input id="adjDays" type="number" min="0" value="0" style="width:80px;">
            <label>Giờ</label>
            <input id="adjHours" type="number" min="0" value="0" style="width:80px;">
            <label>Phút</label>
            <input id="adjMinutes" type="number" min="0" value="0" style="width:80px;">
          </div>
          <div class="confirm-buttons" style="margin-top:12px;">
            <button id="timeAdjOk">Xác nhận</button>
            <button id="timeAdjCancel">Hủy</button>
          </div>
        </div>
      </div>`;

    let dialog = document.getElementById("timeAdjustDialog");
    if (!dialog) {
      const wrap = document.createElement("div");
      wrap.innerHTML = html;
      document.body.appendChild(wrap.firstElementChild);
      dialog = document.getElementById("timeAdjustDialog");
    }

    const titleEl = dialog.querySelector(".popup-content h2");
    if (titleEl) titleEl.textContent = title;
    const daysEl = dialog.querySelector("#adjDays");
    const hoursEl = dialog.querySelector("#adjHours");
    const minutesEl = dialog.querySelector("#adjMinutes");
    if (daysEl) daysEl.value = "0";
    if (hoursEl) hoursEl.value = "0";
    if (minutesEl) minutesEl.value = "0";

    dialog.style.display = "block";
    const okBtn = dialog.querySelector("#timeAdjOk");
    const cancelBtn = dialog.querySelector("#timeAdjCancel");

    okBtn.onclick = () => {
      const days = parseInt(daysEl?.value || "0", 10);
      const hours = parseInt(hoursEl?.value || "0", 10);
      const minutes = parseInt(minutesEl?.value || "0", 10);

      const seconds = days * 86400 + hours * 3600 + minutes * 60;
      dialog.style.display = "none";
      if (typeof onConfirm === "function") onConfirm(seconds);
    };

    cancelBtn.onclick = () => {
      dialog.style.display = "none";
    };
  }

  // Dialog đặt thời gian theo số + đơn vị, hỗ trợ Vô thời hạn (-1)
  function showSetTimeDialog(title, onConfirm) {
    const html = `
      <div id="setTimeDialog" class="modal" style="display: none">
        <div class="modal-content">
          <h2>${title}</h2>
          <div class="modal-row">
            <input id="setAmount" type="number" min="0" value="30">
            <select id="setUnit">
              <option value="s">Giây</option>
              <option value="m">Phút</option>
              <option value="h">Giờ</option>
              <option value="d" selected>Ngày</option>
              <option value="mo">Tháng</option>
              <option value="y">Năm</option>
              <option value="inf">Vô thời hạn</option>
            </select>
          </div>
          <div class="confirm-buttons">
            <button id="setTimeOk" class="menu-btn approve">Xác nhận</button>
            <button id="setTimeCancel" class="menu-btn reject">Hủy</button>
          </div>
        </div>
      </div>`;

    let dialog = document.getElementById("setTimeDialog");
    if (!dialog) {
      const wrap = document.createElement("div");
      wrap.innerHTML = html;
      document.body.appendChild(wrap.firstElementChild);
      dialog = document.getElementById("setTimeDialog");
    }

    const amountEl = dialog.querySelector("#setAmount");
    const unitEl = dialog.querySelector("#setUnit");
    const okBtn = dialog.querySelector("#setTimeOk");
    const cancelBtn = dialog.querySelector("#setTimeCancel");

    amountEl.disabled = false;
    if (amountEl.value === "" || Number(amountEl.value) < 0) amountEl.value = "30";
    unitEl.value = "d";

    const handleUnitChange = () => {
      if (unitEl.value === "inf") {
        amountEl.value = "-1";
        amountEl.disabled = true;
      } else {
        if (Number(amountEl.value) < 0) amountEl.value = "0";
        amountEl.disabled = false;
      }
    };

    unitEl.onchange = handleUnitChange;
    handleUnitChange();

    dialog.style.display = "flex";

    okBtn.onclick = () => {
      let seconds;
      if (unitEl.value === "inf") {
        seconds = -1;
      } else {
        const n = parseInt(amountEl.value || "0", 10);
        if (isNaN(n) || n < 0) {
          alert("Giá trị không hợp lệ");
          return;
        }
        const factorMap = { s: 1, m: 60, h: 3600, d: 86400, mo: 30 * 86400, y: 365 * 86400 };
        const factor = factorMap[unitEl.value] || 1;
        seconds = n * factor;
      }
      dialog.style.display = "none";
      if (typeof onConfirm === "function") onConfirm(seconds);
    };

    cancelBtn.onclick = () => {
      dialog.style.display = "none";
    };
  }

  // Popup kết quả tự đóng sau 15s hoặc khi người dùng tắt
  function showActionResultPopup(message, options = {}) {
    const { status = "success", duration = 15000 } = options;
    let container = document.getElementById("toastContainer");
    if (!container) {
      container = document.createElement("div");
      container.id = "toastContainer";
      container.className = "toast-container";
      document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    const typeClass = status === "error" ? "error" : status === "info" ? "info" : "success";
    toast.className = `toast ${typeClass}`;

    const icon = document.createElement("div");
    icon.className = "toast-icon";
    icon.innerHTML =
      status === "error"
        ? '<i class="fas fa-times-circle"></i>'
        : status === "info"
        ? '<i class="fas fa-info-circle"></i>'
        : '<i class="fas fa-check-circle"></i>';

    const content = document.createElement("div");
    content.className = "toast-content";
    content.innerHTML = `
      <div class="toast-title">${status === "error" ? "Thất bại" : status === "info" ? "Thông báo" : "Thành công"}</div>
      <div class="toast-message">${message}</div>
    `;

    const closeBtn = document.createElement("button");
    closeBtn.className = "toast-close";
    closeBtn.setAttribute("aria-label", "Đóng");
    closeBtn.innerHTML = "&times;";
    closeBtn.onclick = () => {
      clearTimeout(timerId);
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    };

    const progress = document.createElement("div");
    progress.className = "toast-progress";
    const bar = document.createElement("span");
    bar.className = "bar";
    bar.style.animationDuration = `${duration}ms`;
    progress.appendChild(bar);

    toast.appendChild(icon);
    toast.appendChild(content);
    toast.appendChild(closeBtn);
    toast.appendChild(progress);

    container.appendChild(toast);

    const timerId = setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, duration);
  }
});