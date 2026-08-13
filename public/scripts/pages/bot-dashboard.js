document.addEventListener("DOMContentLoaded", function () {
  const socket = io();
  if (window.Common) Common.attachLogout("logoutBtn");
  let currentBotId = null;
  let isBulkMessageActive = false;
  let selectedGroups = {};
  let selectedFriends = {};
  let currentListType = "group";
  let cachedFriends = null;
  let cachedGroups = null;
  const GROUP_WINDOW_MS = 120000;
  const allLogs = [];
  let currentLogFilter = null;
  let resetLogFilterBtn = null;
  let lastBubbleData = null;

  const urlParams = new URLSearchParams(window.location.search);
  currentBotId = urlParams.get("id");

  if (!currentBotId) {
    window.location.href = "/admin-panel.html";
    return;
  }

  socket.on("connect", () => {
    socket.emit("registerBotDashboard", { botId: currentBotId });
    getBotInfo();
    socket.emit("getAllGroups", { botId: currentBotId });
    socket.emit("getAllFriends", { botId: currentBotId });
    socket.emit("getSelectedData", { botId: currentBotId });
  });

  function getBotInfo() {
    socket.emit("getBotInfo", { botId: currentBotId });
  }

  socket.on("botInfo", (info) => {
    if (info) {
      document.getElementById("botTitle").textContent = `NGH - ${info.name || "Bot"} - Bảng điều khiển`;
      document.title = `NGH - ${info.name || "Bot"} - Bảng điều khiển`;
    }
  });

  socket.on("friendsList", (friends) => {
    cachedFriends = friends;
    displayList("friend", friends);
    updateSelectedCount();
  });

  socket.on("groupsList", (groups) => {
    cachedGroups = groups;
    displayList("group", groups);
    updateSelectedCount();
  });

  socket.on("initialLogs", (logs) => {
    try {
      if (!Array.isArray(logs)) return;
      logs.forEach((entry) => updateLogs(entry));
    } catch {}
  });

  socket.on("newMessage", (messageData) => {
    updateTicker(messageData);
    updateLogs(messageData);
  });

  const groupsBtn = document.getElementById("groupsBtn");
  const friendsBtn = document.getElementById("friendsBtn");
  const groupList = document.querySelector(".group-list");
  const friendList = document.querySelector(".friend-list");
  const listTitle = document.querySelector(".list-title");
  const selectAllBtn = document.getElementById("selectAllBtn");
  const unselectAllBtn = document.getElementById("unselectAllBtn");
  const selectedCountSpan = document.querySelector(".selected-count");
  const refreshBtn = document.getElementById("refreshBtn");

  const logsHeaderTitle = document.querySelector(".grid-item.logs h2");
  (function enforceViewportScaleMobile() {
    const TARGET_W = 1200;
    const overlay = document.getElementById("rotateOverlay");

    function isMobileDevice() {
      const ua = navigator.userAgent || navigator.vendor || window.opera || "";
      const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
      return /Android|iPhone|iPad|iPod/i.test(ua) || coarse;
    }

    function resetScale() {
      const body = document.body;
      const html = document.documentElement;
      body.style.transformOrigin = "";
      body.style.transform = "";
      body.style.width = "";
      body.style.height = "";
      body.style.position = "";
      body.style.left = "";
      body.style.top = "";
      html.style.overflow = "";
      body.style.overflow = "";
    }

    function applyScale() {
      const body = document.body;
      const html = document.documentElement;

      if (!isMobileDevice()) {
        resetScale();
        if (overlay) overlay.style.display = "none";
        return;
      }

      const scale = Math.max(0.1, Math.min(1, window.innerWidth / TARGET_W));
      const targetHeightPx = Math.ceil(window.innerHeight / scale);

      body.style.transformOrigin = "top left";
      body.style.transform = `scale(${scale})`;
      body.style.width = TARGET_W + "px";
      body.style.height = targetHeightPx + "px";
      body.style.position = "";
      body.style.left = "";
      body.style.top = "";
      html.style.overflow = "auto";
      body.style.overflow = "auto";

      if (overlay) overlay.style.display = "none";
    }

    window.addEventListener("resize", applyScale);
    window.addEventListener("orientationchange", applyScale);
    applyScale();
  })();
  if (logsHeaderTitle) {
    resetLogFilterBtn = document.createElement("button");
    resetLogFilterBtn.id = "resetLogFilterBtn";
    resetLogFilterBtn.className = "btn-reset-filter";
    resetLogFilterBtn.innerHTML = `
      <span class="icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none">
          <path d="M4 4v6h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M20 20v-6h-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M9 20a8 8 0 0 1-5-7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M15 4a8 8 0 0 1 5 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </span>
      <span>Bỏ lọc</span>`;
    resetLogFilterBtn.style.display = "none";
    resetLogFilterBtn.addEventListener("click", () => {
      currentLogFilter = null;
      if (resetLogFilterBtn) resetLogFilterBtn.style.display = "none";
      renderLogs();
    });
    logsHeaderTitle.appendChild(resetLogFilterBtn);
  }

  function recomputeNameVisibilityFor(container) {
    if (!container) return;
    container.querySelectorAll(".item-info").forEach((infoEl) => {
      const nameEl = infoEl.querySelector(".item-name");
      const actionsEl = infoEl.parentElement?.querySelector(".item-actions");
      if (!nameEl || !actionsEl) return;
      const available = infoEl.clientWidth - 120;
      const tenChPx = 5 * 8;
      if (available < tenChPx) infoEl.classList.add("name-hidden");
      else infoEl.classList.remove("name-hidden");
    });
  }
  function getMediaGridKeyFrom(media) {
    if (!media) return "unknown";
    return media.kind === "photo" && isWebpMedia(media) ? "webp" : media.kind;
  }
  function ensureMediaGridFor(segment, key) {
    if (!segment || !key) return null;
    let grid = segment.mediaGrids[key];
    if (!grid) {
      grid = document.createElement("div");
      grid.className = `media-grid media-grid--${key}`;
      segment.container.appendChild(grid);
      segment.mediaGrids[key] = grid;
    }
    return grid;
  }
  function appendMediaToSegment(segment, media) {
    if (!segment || !media) return;
    const key = getMediaGridKeyFrom(media);
    const grid = ensureMediaGridFor(segment, key);
    if (!grid) return;
    const frame = createMediaFrame(media);
    if (frame) grid.appendChild(frame);
  }
  function appendTimedText(segment, timeStr, text) {
    if (!segment || !segment.textEl) return;
    const add = (text || "").trim();
    if (!add) return;
    const el = segment.textEl;
    el.textContent = (el.textContent || "").replace(/[\t \u00A0]+$/gm, "").replace(/\n+$/, "").trimEnd();
    el.textContent += `\n[${timeStr}] ${add}`;
  }
  function buildHeaderLine(entry) {
    return `${entry.isGroup ? "[Tin Nhắn Nhóm]" : "[Tin Nhắn Riêng]"} ${
      entry.isGroup ? `>>> ${entry.targetName} <--> ${entry.sourceName}` : `>> ${entry.sourceName} --> ${entry.targetName}`
    }`;
  }
  function applyLogEntry(entry) {
    const logContent = document.querySelector(".log-content");
    if (!logContent) return;
    if (!matchesCurrentFilter(entry)) return;

    const timestamp = new Date(entry.ts).toLocaleTimeString();
    const samePhotoGroup =
      lastBubbleData &&
      entry?.media?.kind === "photo" &&
      lastBubbleData?.media?.kind === "photo" &&
      entry?.media?.groupLayoutId &&
      lastBubbleData?.media?.groupLayoutId &&
      entry.media.groupLayoutId === lastBubbleData.media.groupLayoutId;

    const canMerge =
      lastBubbleData &&
      sameConversation(entry, lastBubbleData) &&
      entry.senderName === lastBubbleData.senderName &&
      (entry.ts - lastBubbleData.lastTs <= GROUP_WINDOW_MS || samePhotoGroup);

    if (canMerge) {
      const curTimeStr = timestamp;
      const needsCaption = lastBubbleData.lastTimeStr !== curTimeStr;
      const addLine = entry.isGroup ? `${entry.contentText}` : `${entry.contentText}`;
      const addLineTrim = (addLine || "").trim();

      if (needsCaption) {
        const segEl = document.createElement("div");
        segEl.className = "bubble-segment";
        const segText = document.createElement("div");
        segText.className = "bubble-text";
        segText.textContent = addLineTrim ? `[${curTimeStr}] ${addLineTrim}` : `[${curTimeStr}]`;
        segEl.appendChild(segText);
        lastBubbleData.bubble.appendChild(segEl);

        const seg = { timeStr: curTimeStr, container: segEl, textEl: segText, mediaGrids: {} };
        lastBubbleData.segments.push(seg);
        lastBubbleData.activeSegment = seg;
        lastBubbleData.lastTimeStr = curTimeStr;
      } else {
        if (addLineTrim) appendTimedText(lastBubbleData.activeSegment, curTimeStr, addLineTrim);
      }
      lastBubbleData.lastTs = entry.ts;

      if (entry.media && lastBubbleData.activeSegment) {
        appendMediaToSegment(lastBubbleData.activeSegment, entry.media);
      }
      return;
    }

    const logItem = document.createElement("div");
    logItem.className = "log-item";

    const avatars = document.createElement("div");
    avatars.className = "log-avatars";
    avatars.innerHTML = `${getAvatarHtml(entry.targetAvatar, 52)}${getAvatarHtml(entry.sourceAvatar, 36)}`;

    const body = document.createElement("div");
    body.className = "log-body";
    const bubble = document.createElement("div");
    bubble.className = "log-bubble";

    const segEl = document.createElement("div");
    segEl.className = "bubble-segment";
    const segText = document.createElement("div");
    segText.className = "bubble-text";
    const headerLine = buildHeaderLine(entry);
    const contentLine = entry.isGroup ? `${entry.contentText}` : `${entry.contentText}`;
    const contentTrim = (contentLine || "").trim();
    const hasMedia = !!entry.media;
    segText.textContent = contentTrim || hasMedia
      ? `${headerLine}\n[${timestamp}]${contentTrim ? " " + contentTrim : ""}`
      : headerLine;
    segEl.appendChild(segText);
    bubble.appendChild(segEl);

    const firstSeg = { timeStr: timestamp, container: segEl, textEl: segText, mediaGrids: {} };
    if (entry.media) {
      appendMediaToSegment(firstSeg, entry.media);
    }

    body.appendChild(bubble);
    logItem.appendChild(avatars);
    logItem.appendChild(body);
    logContent.appendChild(logItem);

    lastBubbleData = {
      ...entry,
      bubble,
      lastTs: entry.ts,
      lastTimeStr: timestamp,
      mediaGridAppended: !!entry.media,
      segments: [firstSeg],
      activeSegment: firstSeg,
    };
  }

  window.addEventListener("resize", () => {
    requestAnimationFrame(() => {
      recomputeNameVisibilityFor(groupList);
      recomputeNameVisibilityFor(friendList);
    });
  });

  groupsBtn.addEventListener("click", () => {
    groupList.style.display = "block";
    friendList.style.display = "none";
    listTitle.textContent = "Danh sách nhóm";
    groupsBtn.classList.add("active");
    friendsBtn.classList.remove("active");
    currentListType = "group";
    updateSelectedCount();
    requestAnimationFrame(() => recomputeNameVisibilityFor(groupList));
  });

  friendsBtn.addEventListener("click", () => {
    groupList.style.display = "none";
    friendList.style.display = "block";
    listTitle.textContent = "Danh sách bạn bè";
    friendsBtn.classList.add("active");
    groupsBtn.classList.remove("active");
    currentListType = "friend";
    updateSelectedCount();
    requestAnimationFrame(() => recomputeNameVisibilityFor(friendList));
  });

  refreshBtn.addEventListener("click", () => {
    if (currentListType === "group") {
      socket.emit("getAllGroups", { botId: currentBotId });
    } else {
      socket.emit("getAllFriends", { botId: currentBotId });
    }
  });

  function displayList(type, items) {
    const container = type === "group" ? groupList : friendList;
    container.innerHTML = "";

    if (!items || items.length === 0) {
      container.innerHTML = `<div class="no-items">Không có ${type === "group" ? "nhóm" : "bạn bè"} nào</div>`;
      return;
    }

    items.forEach((item) => {
      const div = document.createElement("div");
      div.className = `${type}-item`;
      const id = item.groupId || item.userId;
      const name = item.name || item.displayName;
      const avatar = item.avatar || item.avt;
      const avatarHtml = avatar
        ? `<img src="${avatar}" class="avatar" alt="Avatar">`
        : `<div class="avatar placeholder" aria-label="avatar">H H H</div>`;
      const isChecked = type === "group" ? selectedGroups[id] : selectedFriends[id];

      div.setAttribute("data-id", id);
      div.setAttribute("data-type", type);
      div.setAttribute("data-name", name);

      div.innerHTML = `
        <div class="item-info">
          ${type === "group" ? `
            <i class="fas fa-users members-icon" data-id="${id}" data-name="${name}" title="Xem thành viên"></i>
            <i class="fas fa-cog settings-icon" data-id="${id}" data-name="${name}" title="Cài đặt"></i>
          ` : ""}
          ${avatarHtml}
          <div class="item-details">
            <div class="item-name">${name}</div>
            <div class="item-number-member">${type === "group" ? `${item.totalMember} thành viên` : ""}</div>
          </div>
        </div>
        <div class="item-actions">
          <button class="send-btn" data-id="${id}" data-type="${type}">
            <i class="fas fa-paper-plane"></i>
          </button>
          <input type="checkbox" class="item-checkbox" data-id="${id}" data-type="${type}" 
                 data-name="${name}" ${isChecked ? "checked" : ""}>
        </div>
      `;

      if (type === "group") {
        const settingsIcon = div.querySelector(".settings-icon");
        settingsIcon.addEventListener("click", (e) => {
          e.stopPropagation();
          const groupId = e.target.dataset.id;
          const groupName = e.target.dataset.name;
          showSettingsModal(groupId, groupName);
        });

        const membersIcon = div.querySelector(".members-icon");
        membersIcon.addEventListener("click", (e) => {
          e.stopPropagation();
          const groupId = e.target.dataset.id;
          const groupName = e.target.dataset.name;
          showMembersModal(groupId, groupName);
        });
      }

      container.appendChild(div);

      requestAnimationFrame(() => recomputeNameVisibilityFor(container));

      const infoClickable = div.querySelector(".item-info");
      if (infoClickable) {
        infoClickable.addEventListener("click", () => {
          setLogFilter(type, id, name);
        });
      }

      const checkbox = div.querySelector(".item-checkbox");
      checkbox.addEventListener("change", (e) => {
        const id = e.target.dataset.id;
        const itemType = e.target.dataset.type;
        const name = e.target.dataset.name;

        if (e.target.checked) {
          if (itemType === "group") selectedGroups[id] = { name: name };
          else selectedFriends[id] = { name: name };
        } else {
          if (itemType === "group") delete selectedGroups[id];
          else delete selectedFriends[id];
        }

        updateSelectedCount();
        updateSelected();
      });

      const sendBtn = div.querySelector(".send-btn");
      sendBtn.addEventListener("click", async () => {
        const message = document.getElementById("messageContent").value;
        const files = document.getElementById("fileInput").files;
        const delay = calculateDelay();

        if (!checkContentAndAttachments()) return;

        socket.emit("sendMessageToSingle", {
          botId: currentBotId,
          id,
          type,
          message,
          delay,
        });
      });
    });

    updateSelectedCount();
  }

  function setLogFilter(type, id, name) {
    currentLogFilter = { type, id: String(id), name: String(name || "") };
    if (resetLogFilterBtn) resetLogFilterBtn.style.display = "inline-flex";
    renderLogs();
  }

  function updateSelectedCount() {
    const groupCount = Object.keys(selectedGroups).length;
    const friendCount = Object.keys(selectedFriends).length;
    selectedCountSpan.textContent = `Đã Chọn: ${groupCount} Nhóm - ${friendCount} Bạn bè`;
  }

  selectAllBtn.addEventListener("click", () => {
    const selector = currentListType === "group" ? ".group-list .item-checkbox" : ".friend-list .item-checkbox";
    document.querySelectorAll(selector).forEach((checkbox) => {
      checkbox.checked = true;
      const id = checkbox.dataset.id;
      const name = checkbox.dataset.name;

      if (currentListType === "group") selectedGroups[id] = { name };
      else selectedFriends[id] = { name };
    });

    updateSelectedCount();
    updateSelected();
  });

  unselectAllBtn.addEventListener("click", () => {
    const selector = currentListType === "group" ? ".group-list .item-checkbox" : ".friend-list .item-checkbox";
    document.querySelectorAll(selector).forEach((checkbox) => {
      checkbox.checked = false;
    });

    if (currentListType === "group") selectedGroups = {};
    else selectedFriends = {};

    updateSelectedCount();
    updateSelected();
  });

  function updateSelected() {
    socket.emit("updateSelected", {
      botId: currentBotId,
      groups: selectedGroups,
      friends: selectedFriends,
    });
  }

  socket.on("selectedData", (data) => {
    selectedGroups = data.selectedGroups || {};
    selectedFriends = data.selectedFriends || {};
    updateSelectedCount();
    updateCheckboxes();
  });

  function updateCheckboxes() {
    document.querySelectorAll(".group-list .item-checkbox").forEach((checkbox) => {
      const id = checkbox.dataset.id;
      checkbox.checked = selectedGroups[id] !== undefined;
    });

    document.querySelectorAll(".friend-list .item-checkbox").forEach((checkbox) => {
      const id = checkbox.dataset.id;
      checkbox.checked = selectedFriends[id] !== undefined;
    });
  }

  const fileInput = document.getElementById("fileInput");
  const fileList = document.getElementById("fileList");

  fileInput.addEventListener("change", updateFileList);

  function getFileIconByExt(filename) {
    const ext = (filename.split(".").pop() || "").toLowerCase();
    if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(ext))
      return { type: "fa", icon: "far fa-file-image" };
    if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) return { type: "fa", icon: "far fa-file-video" };
    if (["mp3", "wav", "ogg", "flac"].includes(ext)) return { type: "fa", icon: "far fa-file-audio" };
    if (["pdf"].includes(ext)) return "far fa-file-pdf";
    if (["doc", "docx"].includes(ext)) return { type: "fa", icon: "far fa-file-word" };
    if (["xls", "xlsx"].includes(ext)) return { type: "fa", icon: "far fa-file-excel" };
    if (["ppt", "pptx"].includes(ext)) return { type: "fa", icon: "far fa-file-powerpoint" };
    if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return { type: "fa", icon: "far fa-file-archive" };
    if (["txt", "log"].includes(ext)) return { type: "badge", text: ".TXT", cls: "txt" };
    if (["js"].includes(ext)) return { type: "badge", text: "JS", cls: "js" };
    if (["py"].includes(ext)) return { type: "badge", text: "PY", cls: "py" };
    if (["md"].includes(ext)) return { type: "badge", text: "MD", cls: "" };
    return { type: "fa", icon: "far fa-file" };
  }

  function truncateName(name, max) {
    const s = String(name || "");
    return s.length > max ? s.slice(0, max) + "..." : s;
  }

  function updateFileList() {
    const current = Array.from(fileList.querySelectorAll(".attachment-item")).map((el) => el.getAttribute("data-name"));
    Array.from(fileInput.files).forEach((file) => {
      if (current.includes(file.name)) return;
      const item = document.createElement("div");
      item.className = "attachment-item";
      item.setAttribute("data-name", file.name);
      const icon = getFileIconByExt(file.name);
      let iconHtml = "";
      if (icon.type === "fa") {
        iconHtml = `<i class="attachment-icon ${icon.icon}"></i>`;
      } else {
        const cls = icon.cls ? ` ${icon.cls}` : "";
        iconHtml = `<span class="attachment-badge${cls}">${icon.text}</span>`;
      }
      item.innerHTML = `
        ${iconHtml}
        <div class="attachment-name" title="${file.name}">${truncateName(file.name, 12)}</div>
        <button class="file-remove-btn" data-name="${file.name}" aria-label="Remove">×</button>
      `;
      fileList.appendChild(item);
    });

    fileList.querySelectorAll(".file-remove-btn").forEach((btn) => {
      btn.onclick = function () {
        const name = this.getAttribute("data-name");
        const dt = new DataTransfer();
        Array.from(fileInput.files).forEach((f) => {
          if (f.name !== name) dt.items.add(f);
        });
        fileInput.files = dt.files;
        const parent = this.closest(".attachment-item");
        if (parent && parent.parentNode) parent.parentNode.removeChild(parent);
      };
    });
  }

  const sendToFriends = document.getElementById("sendToFriends");
  const sendToGroups = document.getElementById("sendToGroups");
  const sendForSelected = document.getElementById("sendForSelected");
  const sendBulkMessage = document.getElementById("sendBulkMessage");
  const messageContent = document.getElementById("messageContent");

  sendToFriends.addEventListener("click", () => {
    if (checkContentAndAttachments()) {
      showConfirmDialog("Xác nhận", "Bạn có chắc chắn muốn gửi tin nhắn đến tất cả bạn bè?", () =>
        sendMessage("DirectMessage")
      );
    }
  });

  sendToGroups.addEventListener("click", () => {
    if (checkContentAndAttachments()) {
      showConfirmDialog("Xác nhận", "Bạn có chắc chắn muốn gửi tin nhắn đến tất cả nhóm?", () =>
        sendMessage("GroupMessage")
      );
    }
  });

  sendForSelected.addEventListener("click", () => {
    if (checkContentAndAttachments()) {
      showConfirmDialog("Xác nhận", "Bạn có chắc chắn muốn gửi tin nhắn đến các mục đã chọn?", () =>
        sendMessageForSelected()
      );
    }
  });

  sendBulkMessage.addEventListener("click", () => {
    if (checkContentAndAttachments()) {
      if (!isBulkMessageActive) {
        showConfirmDialog("Xác nhận", "Bạn có chắc chắn muốn bắt đầu gửi tin nhắn liên tục?", () =>
          sendBulkMessageForSelected()
        );
      } else {
        showConfirmDialog("Xác nhận", "Bạn có chắc chắn muốn dừng gửi tin nhắn liên tục?", () =>
          sendBulkMessageForSelected(true)
        );
      }
    }
  });

  async function sendMessage(messageType) {
    const message = messageContent.value;
    const delay = calculateDelay();

    socket.emit("sendMessageAll", {
      botId: currentBotId,
      message,
      messageType,
      delay,
    });
  }

  async function sendMessageForSelected() {
    const message = messageContent.value;
    const delay = calculateDelay();

    socket.emit("sendMessageForSelected", {
      botId: currentBotId,
      message,
      delay,
    });
  }

  async function sendBulkMessageForSelected(stop = false) {
    if (stop) {
      socket.emit("stopBulkMessage", { botId: currentBotId });
      return;
    }

    const delay = calculateDelay();

    if (isNaN(delay) || delay <= 0) {
      showPopupNotification("Yêu Cầu Bổ Sung", "Bạn phải nhập số giây delay hợp lệ");
      return;
    }

    const message = messageContent.value;

    socket.emit("startBulkMessage", {
      botId: currentBotId,
      content: message,
      interval: delay,
    });

    sendBulkMessage.textContent = "Dừng gửi liên tục";
    sendBulkMessage.style.backgroundColor = "red";
    sendBulkMessage.style.color = "white";
    isBulkMessageActive = true;
  }

  socket.on("bulkMessageStatus", (status) => {
    if (status.botId === currentBotId && status.status === "stopped") {
      sendBulkMessage.textContent = "Gửi liên tục cho các đối tượng đã chọn";
      sendBulkMessage.style.backgroundColor = "";
      sendBulkMessage.style.color = "";
      isBulkMessageActive = false;
    }
  });

  const TICKER_SPEED_PX_PER_SEC = 80;
  let tickerQueue = [];
  let tickerX = 0;
  let lastTs = null;

  function renderTickerFrame(ts) {
    const el = document.querySelector(".ticker-content");
    const container = document.querySelector(".inner-footer");
    if (!el || !container) return;

    if (!lastTs) lastTs = ts;
    const dt = (ts - lastTs) / 1000;
    lastTs = ts;

    tickerX -= TICKER_SPEED_PX_PER_SEC * dt;

    if (tickerQueue.length > 0) {
      const first = tickerQueue[0];
      if (!first.width) {
        const prev = el.textContent;
        el.textContent = first.text;
        first.width = el.scrollWidth;
        el.textContent = prev;
      }
      if (-tickerX > first.width) {
        const prev = el.textContent;
        el.textContent = "\t\t";
        const gapW = el.scrollWidth;
        el.textContent = prev;
        tickerX += first.width + gapW;
        tickerQueue.shift();
      }
    }

    el.textContent = tickerQueue.map((m) => m.text).join("\t\t\t\t|\t\t\t\t");
    el.style.transform = `translateX(${Math.floor(tickerX)}px)`;
    requestAnimationFrame(renderTickerFrame);
  }

  function ensureTickerLoopStarted() {
    if (lastTs === null) requestAnimationFrame(renderTickerFrame);
  }

  function sanitizeForSingleLine(text) {
    if (text == null) return "";
    return String(text).replace(/\r?\n/g, " ");
  }

  function updateTicker(messageData) {
    const el = document.querySelector(".ticker-content");
    const container = document.querySelector(".inner-footer");
    if (!el || !container) return;

    const { message, dataSource } = messageData;
    const { type, data } = message;
    const { source, target } = dataSource;
    const { content, msgType } = data;

    const caption =
      type === 0
        ? `[Private: ${source.displayName} >> ${target.displayName}]`
        : `[Group: ${source.displayName} >> ${target.name}]`;
    let contentText = "";
    if (msgType === "webchat") {
      if (typeof content === "object" && content !== null) contentText = content.title;
      else contentText = content;
    } else if (msgType === "chat.photo") {
      contentText = `${content.title && content.title + " - "} ${content.href}`;
    } else if (msgType === "chat.video.msg") {
      contentText = `Video: ${content.title && content.title + " - "} ${content.href}`;
    } else if (msgType === "chat.sticker") {
      contentText = `Sticker: ID ${content.id} - CatID ${content.catId} - Type ${content.type}`;
    } else if (msgType === "chat.gif") {
      contentText = `Gif: ${content.title && content.title + " - "} ${content.href}`;
    } else if (msgType === "chat.voice") {
      contentText = `Voice: ${content.title && content.title + " - "} ${content.href}`;
    } else if (msgType === "chat.recommended") {
      const action = content.action;
      if (action === "recommened.link") {
        contentText = `Link: ${content.title && content.title + " - "} ${content.href}`;
      } else if (action === "recommened.user") {
        contentText = `Danh Thiếp QR: ${content.title && content.title + " - "} ${
          JSON.parse(content.description).qrCodeUrl
        }`;
      }
    } else if (msgType === "share.file") {
      contentText = `File: ${content.title && content.title + " - "} ${content.href}`;
    } else if (msgType === "chat.delete") {
    } else {
      return;
    }

    const text = sanitizeForSingleLine(`${caption}: ${contentText}`);

    if (tickerQueue.length === 0) {
      tickerX = container.clientWidth;
      lastTs = null;
      tickerQueue.push({ text, width: 0 });
    } else {
      const prevConcat = el.textContent;
      el.textContent = tickerQueue.map((m) => m.text).join("\t\t");
      const currentWidth = el.scrollWidth;
      el.textContent = "\t\t";
      const gapW = el.scrollWidth;
      el.textContent = prevConcat;

      const naturalStart = tickerX + currentWidth + gapW;
      const rightEdge = container.clientWidth;
      if (naturalStart < rightEdge) {
        el.textContent = "\t";
        const tabW = el.scrollWidth;
        el.textContent = " ";
        const spW = el.scrollWidth || 1;
        el.textContent = prevConcat;
        let need = rightEdge - naturalStart;
        let pad = "";
        if (tabW > 0) {
          const nTabs = Math.floor(need / tabW);
          pad += "\t".repeat(nTabs);
          need -= nTabs * tabW;
        }
        const nSpaces = Math.ceil(need / spW);
        pad += " ".repeat(Math.max(0, nSpaces));
        tickerQueue.push({ text: pad, width: 0 });
      }
      tickerQueue.push({ text, width: 0 });
    }
    ensureTickerLoopStarted();
  }

  function buildMediaFrom(data) {
    if (!data) return null;
    const { msgType, content } = data;
    if (!msgType) return null;
    try {
      if (msgType === "webchat") return null;
      if (msgType === "chat.photo") {
        let href = content?.href;
        const title = content?.title || "Ảnh";
        let groupLayoutId;
        if (content?.params) {
          try {
            const params = JSON.parse(content.params);
            const webpLink = params?.webp?.url || null;
            if (webpLink) href = webpLink;
            const isGroupLayout = params?.is_group_layout === 1 || params?.isGroupLayout === 1;
            const glid = params?.group_layout_id || params?.groupLayoutId;
            if (isGroupLayout && glid) groupLayoutId = String(glid);
          } catch (e) {}
        }
        return { kind: "photo", href, thumb: href, title, groupLayoutId };
      }
      if (msgType === "chat.video.msg") {
        return {
          kind: "video",
          href: content?.href,
          thumb: content?.thumb,
          title: content?.title || "Video",
        };
      }
      if (msgType === "chat.gif") {
        return { kind: "gif", href: content?.href, thumb: content?.href, title: content?.title || "GIF" };
      }
      if (msgType === "chat.voice") {
        return { kind: "audio", href: content?.href, title: content?.title || "Voice" };
      }
      if (msgType === "chat.sticker") {
        const sid = content?.id;
        if (sid) {
          const href = `https://zalo-api.zadn.vn/api/emoticon/sticker/webpc?eid=${encodeURIComponent(
            sid
          )}&size=512&version=4`;
          return { kind: "sticker", href, title: content?.title || "Sticker" };
        }
        return { kind: "sticker", title: `Sticker ID ${content?.id}` };
      }
      if (msgType === "chat.recommended") {
        const action = content?.action;
        if (action === "recommened.link") {
          return { kind: "link", href: content?.href, title: content?.title || "Link" };
        } else if (action === "recommened.user") {
          const desc = content?.description;
          let qr = "";
          try {
            qr = JSON.parse(desc || "{}").qrCodeUrl || "";
          } catch {}
          return { kind: "photo", href: qr, thumb: qr, title: content?.title || "Danh thiếp QR" };
        }
      }
      if (msgType === "share.file") {
        return { kind: "file", href: content?.href, title: content?.title || "Tệp" };
      }
    } catch {}
    return null;
  }

  function isWebpMedia(media) {
    const url = String(media?.href || media?.thumb || "").toLowerCase();
    return url.includes("webp") || url.endsWith(".webp");
  }

  function createMediaFrame(media) {
    if (!media) return null;
    const frame = document.createElement("div");
    const webp = media.kind === "photo" && isWebpMedia(media);
    frame.className = `media-frame ${media.kind}${webp ? " webp" : ""}`;
    frame.setAttribute("tabindex", "0");
    if (media.kind === "photo" || media.kind === "gif") {
      const url = media.thumb || media.href;
      const picture = document.createElement("picture");
      const source = document.createElement("source");
      source.type = "image/webp";
      source.srcset = url;
      const img = document.createElement("img");
      img.className = "media-thumb";
      img.src = url;
      img.alt = media.title || "media";
      img.loading = "lazy";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      picture.appendChild(source);
      picture.appendChild(img);
      frame.appendChild(picture);
    } else if (media.kind === "video") {
      const img = document.createElement("img");
      img.className = "media-thumb";
      img.src = media.thumb || "";
      img.alt = media.title || "video";
      frame.appendChild(img);
      frame.classList.add("video");
    } else if (media.kind === "audio") {
      const bar = document.createElement("div");
      bar.className = "voice-bar";

      const play = document.createElement("button");
      play.className = "play-btn";
      play.setAttribute("aria-label", "Play/Pause");
      play.textContent = "▶";

      const center = document.createElement("div");
      center.className = "voice-center";
      center.setAttribute("title", media.title || "Voice");
      
      const progressContainer = document.createElement("div");
      progressContainer.className = "voice-progress-container";
      
      const wave = document.createElement("div");
      wave.className = "voice-wave";

      const BAR_COUNT = 50;
      const waveBars = [];
      for (let i = 0; i < BAR_COUNT; i++) {
        const barEl = document.createElement("span");
        barEl.className = "bar";
        
        const randomHeight = Math.floor(Math.random() * 16) + 4;
        barEl.style.height = randomHeight + "px";
        
        const delay = Math.random() * 0.8;
        barEl.style.animationDelay = `${delay}s`;
        
        waveBars.push(barEl);
        wave.appendChild(barEl);
      }
      
      progressContainer.appendChild(wave);
      
      const timeDisplay = document.createElement("div");
      timeDisplay.className = "voice-time";
      timeDisplay.innerHTML = `
        <span class="current">0:00</span>
        <span class="separator">/</span>
        <span class="total">0:00</span>
      `;
      
      center.appendChild(progressContainer);
      center.appendChild(timeDisplay);

      const kebab = document.createElement("button");
      kebab.className = "kebab";
      kebab.innerHTML = "⋮";

      const menu = document.createElement("div");
      menu.className = "voice-menu";
      const btnDownload = document.createElement("button");
      btnDownload.textContent = "Tải về";
      const btnCopy = document.createElement("button");
      btnCopy.textContent = "Sao chép liên kết";
      menu.appendChild(btnDownload);
      menu.appendChild(btnCopy);

      bar.appendChild(play);
      bar.appendChild(center);
      bar.appendChild(kebab);
      frame.appendChild(bar);
      frame.appendChild(menu);

      let audio = new Audio(media.href);
      let playing = false;
      let duration = 0;

      // Format thời gian
      function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
      }

      // Cập nhật progress bar
      function updateProgress() {
        if (duration > 0) {
          const progress = audio.currentTime / duration;
          const activeBarCount = Math.floor(progress * BAR_COUNT);
          
          waveBars.forEach((barEl, index) => {
            if (index < activeBarCount) {
              barEl.classList.add("active");
            } else {
              barEl.classList.remove("active");
            }
          });
          
          // Cập nhật thời gian
          const currentSpan = timeDisplay.querySelector(".current");
          const totalSpan = timeDisplay.querySelector(".total");
          currentSpan.textContent = formatTime(audio.currentTime);
          totalSpan.textContent = formatTime(duration);
        }
      }

      function setPlayingState(on) {
        playing = !!on;
        if (playing) {
          play.textContent = "⏸";
          bar.classList.add("playing");
        } else {
          play.textContent = "▶";
          bar.classList.remove("playing");
        }
      }

      // Event listeners cho audio
      audio.addEventListener("loadedmetadata", () => {
        duration = audio.duration;
        const totalSpan = timeDisplay.querySelector(".total");
        totalSpan.textContent = formatTime(duration);
      });

      audio.addEventListener("timeupdate", updateProgress);
      audio.addEventListener("ended", () => setPlayingState(false));
      audio.addEventListener("pause", () => setPlayingState(false));
      audio.addEventListener("play", () => setPlayingState(true));

      // Click vào progress bar để tua
      progressContainer.addEventListener("click", (e) => {
        e.stopPropagation(); // Ngăn mở MediaViewer
        if (duration > 0) {
          const rect = progressContainer.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const progress = clickX / rect.width;
          const newTime = progress * duration;
          audio.currentTime = Math.max(0, Math.min(newTime, duration));
          updateProgress();
        }
      });

      play.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!playing) {
          audio
            .play()
            .then(() => setPlayingState(true))
            .catch(() => {});
        } else {
          audio.pause();
          setPlayingState(false);
        }
      });

      kebab.addEventListener("click", (e) => {
        e.stopPropagation();
        menu.classList.toggle("open");
      });
      btnDownload.addEventListener("click", (e) => {
        e.stopPropagation();
        const a = document.createElement("a");
        a.href = media.href;
        a.download = "";
        a.click();
        menu.classList.remove("open");
      });
      btnCopy.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(media.href);
        } catch {}
        menu.classList.remove("open");
      });
    } else if (media.kind === "sticker") {
      frame.classList.add("sticker");
      const img = document.createElement("img");
      img.className = "media-thumb";
      img.src = media.href || "";
      img.alt = media.title || "sticker";
      img.referrerPolicy = "no-referrer";
      img.loading = "lazy";
      img.decoding = "async";
      frame.appendChild(img);
    } else {
      const span = document.createElement("span");
      span.className = "label";
      span.textContent = media.title || media.kind.toUpperCase();
      frame.appendChild(span);
    }

    // Chỉ mở MediaViewer cho các loại media không phải audio
    if (media.kind !== "audio") {
      frame.addEventListener("click", () => openMediaViewer(media));
    }
    return frame;
  }

  function openMediaViewer(media) {
    const overlay = document.getElementById("mediaViewer");
    const body = document.getElementById("mediaViewerBody");
    const closeBtn = document.getElementById("closeMediaViewer");
    if (!overlay || !body) return;
    body.innerHTML = "";

    let node = null;
    if (media.kind === "photo" || media.kind === "gif") {
      const url = media.href;
      const picture = document.createElement("picture");
      const source = document.createElement("source");
      source.type = "image/webp";
      source.srcset = url;
      const img = document.createElement("img");
      img.src = url;
      img.alt = media.title || "media";
      img.referrerPolicy = "no-referrer";
      picture.appendChild(source);
      picture.appendChild(img);
      node = picture;
    } else if (media.kind === "video") {
      node = document.createElement("video");
      node.src = media.href;
      node.controls = true;
      node.autoplay = false;
      if (media.thumb) node.poster = media.thumb;
      node.playsInline = true;
      node.preload = "metadata";
      node.referrerPolicy = "no-referrer";
      node.crossOrigin = "anonymous";
    } else if (media.kind === "audio") {
      node = document.createElement("audio");
      node.src = media.href;
      node.controls = true;
      node.autoplay = false;
      node.referrerPolicy = "no-referrer";
      node.crossOrigin = "anonymous";
    } else if (media.kind === "link") {
      node = document.createElement("iframe");
      node.src = media.href;
      node.referrerPolicy = "no-referrer";
    } else if (media.kind === "file") {
      const a = document.createElement("a");
      a.href = media.href;
      a.textContent = media.title || media.href;
      a.target = "_blank";
      node = a;
    } else if (media.kind === "sticker") {
      const img = document.createElement("img");
      img.src = media.href || "";
      img.alt = media.title || "sticker";
      img.referrerPolicy = "no-referrer";
      img.loading = "lazy";
      img.decoding = "async";
      node = img;
    }

    if (node) body.appendChild(node);
    overlay.style.display = "block";

    function close() {
      overlay.style.display = "none";
    }
    if (closeBtn) closeBtn.onclick = close;
    overlay.onclick = (e) => {
      if (e.target === overlay) close();
    };
    document.addEventListener("keydown", function esc(e) {
      if (e.key === "Escape") {
        close();
        document.removeEventListener("keydown", esc);
      }
    });
  }

  function getAvatarHtml(src, size) {
    if (src && typeof src === "string") {
      return `<img class="avatar-${size}" src="${src}" alt="">`;
    }
    return `<div class="avatar-${size} placeholder">avatar</div>`;
  }

  function updateLogs(messageData) {
    const { message, dataSource } = messageData;
    const { type, data } = message;
    const isGroup = type === 1;
    const { content, dName } = data;
    const { source, target } = dataSource || {};

    const ts = parseInt(data.ts || Date.now());
    let contentText = "";
    if (data && data.msgType === "webchat") {
      if (typeof content === "object" && content !== null)
        contentText = (content.title || "") + `\n[Params: ${content.params}]`;
      else contentText = content;
    } else if (data.msgType === "chat.delete") {
      if (Array.isArray(content)) {
        const arr = content.map(
          (item) => `{  "clientDelMsgId": ${item.clientDelMsgId},  "globalMsgId": ${item.globalDelMsgId}  }`
        );
        contentText = `Xóa tin nhắn: [\n  ${arr.join("\n  ")}\n]`;
      } else {
        contentText = `Xóa tin nhắn: [\n  {  "clientDelMsgId": ${content.clientDelMsgId},  "globalMsgId": ${content.globalDelMsgId}  }\n]`;
      }
    } else contentText = (content && content.title) || "";
    const senderName = dName || (source && source.displayName) || (target && target.displayName) || "";

    const sourceName = (source && (source.displayName || source.name)) || "";
    const targetName = isGroup
      ? (target && (target.name || target.displayName)) || ""
      : (target && (target.displayName || target.name)) || "";

    const sourceId = (source && (source.id || source.userId || source.uid)) || sourceName;
    const targetId = (target && (target.groupId || target.id || target.userId || target.uid)) || targetName;

    function getLinkAvatar(src) {
      return src && (src.avt || src.fullAvt || src.avatar);
    }

    const entry = {
      ts,
      isGroup,
      senderName,
      contentText,
      sourceId: String(sourceId),
      sourceName: String(sourceName),
      targetId: String(targetId),
      targetName: String(targetName),
      sourceAvatar: getLinkAvatar(source),
      targetAvatar: getLinkAvatar(target),
      media: buildMediaFrom(data),
    };

    if (allLogs.length > 5000) allLogs.shift();
    allLogs.push(entry);

    appendLogEntry(entry);
  }

  function matchesCurrentFilter(entry) {
    if (!currentLogFilter) return true;
    const { type, id, name } = currentLogFilter;
    if (type === "group") {
      if (!entry.isGroup) return false;
      return entry.targetId === String(id) || entry.targetName === String(name);
    } else {
      if (entry.isGroup) return false;
      return (
        entry.sourceId === String(id) ||
        entry.targetId === String(id) ||
        entry.sourceName === String(name) ||
        entry.targetName === String(name)
      );
    }
  }

  function sameConversation(a, b) {
    if (a.isGroup !== b.isGroup) return false;
    if (a.isGroup) return a.targetId === b.targetId || a.targetName === b.targetName;
    // Private: cùng cặp người tham gia (bất kể hướng)
    const aSet = new Set([a.sourceId, a.targetId]);
    return aSet.has(b.sourceId) && aSet.has(b.targetId);
  }

  function renderLogs() {
    const logContent = document.querySelector(".log-content");
    if (!logContent) return;

    const isScrolledToBottom = logContent.scrollHeight - logContent.clientHeight - logContent.scrollTop <= 100;
    logContent.innerHTML = "";
    lastBubbleData = null;

    const filtered = allLogs.filter((e) => matchesCurrentFilter(e));

    filtered.forEach((entry) => applyLogEntry(entry));

    if (isScrolledToBottom) {
      requestAnimationFrame(() => {
        logContent.scrollTop = logContent.scrollHeight;
      });
    }
  }

  function appendLogEntry(entry) {
    const logContent = document.querySelector(".log-content");
    if (!logContent) return;
    const isScrolledToBottom = logContent.scrollHeight - logContent.clientHeight - logContent.scrollTop <= 100;
    applyLogEntry(entry);
    if (isScrolledToBottom) {
      requestAnimationFrame(() => {
        logContent.scrollTop = logContent.scrollHeight;
      });
    }
  }

  function showSettingsModal(groupId, groupName) {
    const modal = document.getElementById("settingsModal");
    const settingsGrid = document.getElementById("settingsGrid");

    socket.emit("getGroupSettings", { botId: currentBotId, groupId });

    socket.once("groupSettings", (settings) => {
      if (!settings) {
        showPopupNotification("Lỗi", "Không thể lấy cài đặt nhóm");
        return;
      }

      const settingsList = {
        activeBot: "Tương tác với thành viên",
        activeGame: "Tương tác trò chơi với thành viên",
        antiSpam: "Chống spam",
        removeLinks: "Chặn liên kết",
        antiStickerEffect: "Chặn sticker hiệu ứng",
        antiBot: "Chặn Bot trong nhóm",
        antiforward: "Chặn tin nhắn chuyển tiếp",
        autoDownload: "Nhận diện và tải nội dung",
        autoJoinGroup: "Tự động tham gia link nhóm",
        filterBadWords: "Xoá tin nhắn thô tục",
        welcomeGroup: "Chào thành viên mới",
        byeGroup: "Báo thành viên rời nhóm",
        learnEnabled: "Học máy",
        replyEnabled: "Trả lời tin nhắn nhóm",
        onlyText: "Chỉ được nhắn tin văn bản",
        memberApprove: "Phê duyệt thành viên mới",
        antiNude: "Chống gửi ảnh nhạy cảm",
        antiUndo: "Chống thu hồi tin nhắn",
        sendTask: "Gửi nội dung tự động",
        updateGroup: "Thông báo cài đặt nhóm",
        antiMediaFile: "Xóa media file chỉ định",
        antiVoice: "Chặn voice",
        antiTag: "Chặn tag thành viên",
        antiSticker: "Chặn sticker",
        antiPhotoVideo: "Chặn ảnh & video",
        antiPhoneNumber: "Chặn số điện thoại",
        antigif: "Chặn gửi gif",
        antiFile: "Chặn gửi file",
      };

      settingsGrid.innerHTML = Object.entries(settingsList)
        .map(
          ([key, label]) => `
            <div class="setting-item">
              <span>${label}</span>
              <label class="switch">
                <input type="checkbox" class="setting-toggle" 
                      data-setting="${key}" 
                      data-group-id="${groupId}" 
                      ${settings[key] ? "checked" : ""}>
                <span class="slider round"></span>
              </label>
            </div>
          `
        )
        .join("");

      settingsGrid.querySelectorAll(".setting-toggle").forEach((toggle) => {
        toggle.addEventListener("change", (e) => {
          const command = e.target.dataset.setting;
          const groupId = e.target.dataset.groupId;
          const isEnabled = e.target.checked;

          socket.emit("updateFutureStatus", {
            botId: currentBotId,
            groupId,
            groupName,
            command,
            isActive: isEnabled,
          });
        });
      });

      modal.style.display = "block";

      const closeBtn = modal.querySelector(".close-modal");
      closeBtn.onclick = () => {
        modal.style.display = "none";
      };

      window.onclick = (e) => {
        if (e.target === modal) {
          modal.style.display = "none";
        }
      };
    });
  }

  function showMembersModal(groupId, groupName) {
    const modal = document.getElementById("membersModal");
    const membersList = document.getElementById("membersList");
    const membersCount = document.getElementById("membersCount");
    const membersModalTitle = document.getElementById("membersModalTitle");
    const searchInput = document.getElementById("membersSearchInput");

    membersModalTitle.textContent = `Thành viên nhóm: ${groupName}`;
    membersList.innerHTML = '<div class="loading-members">Đang tải...</div>';
    membersCount.textContent = "0 thành viên";
    searchInput.value = "";
    modal.style.display = "block";

    let allMembers = [];
    let groupType = 1;
    let botIsAdmin = false;
    let botId = null;
    let isAdminLevelHighest = false;
    let friendsList = [];
    let blockedUsersList = [];
    let pendingFriendRequests = [];
    let currentGroupId = groupId;
    let isSendingBulkMessages = false;
    let currentPage = 1;
    const membersPerPage = 500;
    const pendingMessages = new Map();
    
    const normalizeId = (id) => String(id || "").replace(/_0$/, "").split("_")[0];
    const memberMap = new Map();
    
    const updateMemberMap = () => {
      memberMap.clear();
      allMembers.forEach(m => {
        const id = normalizeId(m.id || m.userId || m.uid);
        if (id) memberMap.set(id, m);
      });
    };
    
    const isIdMatch = (id1, id2) => {
      const n1 = normalizeId(id1);
      const n2 = normalizeId(id2);
      return n1 === n2 || n1 === id2 || id1 === n2;
    };

    function updatePagination(totalMembers) {
      const totalPages = Math.ceil(totalMembers / membersPerPage);
      const paginationInfo = document.getElementById('paginationInfo');
      const prevBtn = document.getElementById('prevPageBtn');
      const nextBtn = document.getElementById('nextPageBtn');
      
      if (paginationInfo) {
        paginationInfo.textContent = `Trang ${currentPage} / ${totalPages || 1}`;
      }
      
      if (prevBtn) {
        prevBtn.disabled = currentPage <= 1;
      }
      
      if (nextBtn) {
        nextBtn.disabled = currentPage >= totalPages || totalPages === 0;
      }
    }

    function getCurrentPageMembers(membersToRender) {
      const startIndex = (currentPage - 1) * membersPerPage;
      const endIndex = startIndex + membersPerPage;
      return membersToRender.slice(startIndex, endIndex);
    }

    function renderMembers(membersToRender) {
      if (membersToRender.length === 0) {
        membersList.innerHTML = '<div class="no-members">Không tìm thấy thành viên nào</div>';
        updatePagination(0);
        return;
      }

      updatePagination(membersToRender.length);
      
      const currentPageMembers = getCurrentPageMembers(membersToRender);

      const fragment = document.createDocumentFragment();
      const tempDiv = document.createElement('div');
      
      tempDiv.innerHTML = currentPageMembers
        .map((member, index) => {
          const avatar = member.avatar || member.avt || member.fullAvt || member.avatarUrl || "";
          const name = member.displayName || member.name || member.dName || member.zaloName || member.nickname || "Không tên";
          const userId = member.id || member.userId || member.uid || member.uidFrom || String(member).split("_")[0] || "";
          
          const isCreator = member.isCreator;
          const isAdmin = member.isAdmin;
          const creatorLabel = groupType === 2 ? "Trưởng cộng đồng" : "Trưởng nhóm";
          const adminBadge = isCreator 
            ? `<span class="admin-badge creator-badge">${creatorLabel}</span>`
            : (isAdmin ? '<span class="admin-badge">QTV</span>' : '');
          
          const userIdStr = String(userId);
          const normalizedUserId = normalizeId(userId);
          const isFriend = friendsList.some(f => isIdMatch(f.userId || f.id, userId));
          const isBot = botId && isIdMatch(botId, userId);
          const isBlockedPrivate = blockedUsersList.some(blockedId => isIdMatch(blockedId, userId));
          const hasPendingRequest = pendingFriendRequests.some(pendingId => isIdMatch(pendingId, userId));
          const canKickBlock = botIsAdmin && !isBot && !isCreator;
          
          const avatarHtml = avatar
            ? `<img src="${avatar}" class="member-avatar" alt="Avatar" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">`
            : "";
          
          const placeholderHtml = `<div class="member-avatar placeholder" ${avatar ? 'style="display:none;"' : ''}>${name.charAt(0).toUpperCase()}</div>`;

          const menuId = `member-menu-${index}`;
          const menuOptions = [];
          
          if (isBot) {
            menuOptions.push(`<button class="menu-item danger" data-action="leave" data-user-id="${userId}">Rời nhóm</button>`);
          } else {
            if (isFriend) {
              menuOptions.push(`<button class="menu-item" data-action="unfriend" data-user-id="${userId}">Hủy kết bạn</button>`);
            } else if (hasPendingRequest) {
              menuOptions.push(`<button class="menu-item" data-action="acceptFriend" data-user-id="${userId}">Xác nhận kết bạn</button>`);
            } else {
              menuOptions.push(`<button class="menu-item" data-action="friend" data-user-id="${userId}">Kết bạn</button>`);
            }
            
            if (isBlockedPrivate) {
              menuOptions.push(`<button class="menu-item" data-action="unblockPrivate" data-user-id="${userId}">Unblock tin nhắn</button>`);
            } else {
              menuOptions.push(`<button class="menu-item danger" data-action="blockPrivate" data-user-id="${userId}">Block tin nhắn</button>`);
            }
          }
          
          if (canKickBlock) {
            menuOptions.push(`<button class="menu-item danger" data-action="kick" data-user-id="${userId}">Kick</button>`);
            menuOptions.push(`<button class="menu-item danger" data-action="block" data-user-id="${userId}">Block</button>`);
          }
          
          if (botIsAdmin && isAdminLevelHighest && !isBot && !isCreator) {
            menuOptions.push(`<button class="menu-item" data-action="keygold" data-user-id="${userId}">🔑 Phong key vàng</button>`);

            if (!isAdmin) {
              menuOptions.push(`<button class="menu-item" data-action="keysilver" data-user-id="${userId}">🔑 Phong key bạc</button>`);
            }
            
            if (isAdmin) {
              menuOptions.push(`<button class="menu-item danger" data-action="unkey" data-user-id="${userId}">🔓 Unkey</button>`);
            }
          }

          const menuHtml = menuOptions.length > 0 ? `
            <div class="member-menu-container">
              <button class="member-menu-btn" data-menu-id="${menuId}">
                <i class="fas fa-ellipsis-v"></i>
              </button>
              <div class="member-menu" id="${menuId}">
                ${menuOptions.join('')}
              </div>
            </div>
          ` : '';

          const isSelected = member._selected === true;
          
          const actionButtonsHtml = `
            <div class="member-actions">
              <button class="member-action-btn ${isSelected ? 'selected' : ''}" data-action="select" data-user-id="${userId}" data-member-name="${name}" title="Chọn thành viên">
                <i class="fas fa-check-square ${isSelected ? 'selected' : ''}"></i>
              </button>
              <button class="member-action-btn send-message-btn" data-action="sendMessage" data-user-id="${userId}" data-member-name="${name}" title="Gửi tin nhắn riêng">
                <i class="fas fa-paper-plane"></i>
              </button>
            </div>
          `;
          
          const memberItemClass = isSelected ? 'selected' : '';

          return `
            <div class="member-item ${isAdmin ? 'admin-member' : ''} ${memberItemClass}" data-user-id="${userId}">
              ${avatarHtml}
              ${placeholderHtml}
              <div class="member-info">
                <div class="member-name-row">
                  <div class="member-name">${name}</div>
                  ${adminBadge}
                </div>
                <div class="member-id">ID: ${userId}</div>
              </div>
              ${actionButtonsHtml}
              ${menuHtml}
            </div>
          `;
        })
        .join("");
      
      while (tempDiv.firstChild) {
        fragment.appendChild(tempDiv.firstChild);
      }
      
      membersList.innerHTML = '';
      membersList.appendChild(fragment);

      attachMenuListeners();
      attachActionButtonListeners();
      attachSelectAllButtons();
    }

    function attachSelectAllButtons() {
      const selectAllBtn = document.getElementById('selectAllMembersBtn');
      if (selectAllBtn) {
        const newSelectBtn = selectAllBtn.cloneNode(true);
        selectAllBtn.parentNode.replaceChild(newSelectBtn, selectAllBtn);
        
        newSelectBtn.onclick = function(e) {
          e.stopPropagation();
          e.preventDefault();
          allMembers.forEach(member => {
            member._selected = true;
          });
          
          const currentSearchTerm = searchInput.value.trim();
          if (currentSearchTerm) {
            filterMembers(currentSearchTerm);
          } else {
            renderMembers(allMembers);
          }
        };
      }

      const deselectAllBtn = document.getElementById('deselectAllMembersBtn');
      if (deselectAllBtn) {
        const newDeselectBtn = deselectAllBtn.cloneNode(true);
        deselectAllBtn.parentNode.replaceChild(newDeselectBtn, deselectAllBtn);
        
        newDeselectBtn.onclick = function(e) {
          e.stopPropagation();
          e.preventDefault();
          allMembers.forEach(member => {
            member._selected = false;
          });
          const currentSearchTerm = searchInput.value.trim();
          if (currentSearchTerm) {
            filterMembers(currentSearchTerm);
          } else {
            renderMembers(allMembers);
          }
        };
      }
    }

    function attachActionButtonListeners() {
      document.querySelectorAll('.member-action-btn[data-action="select"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const memberItem = btn.closest('.member-item');
          const userId = btn.getAttribute('data-user-id');
          
          const normalizedUserId = normalizeId(userId);
          const member = memberMap.get(normalizedUserId);
          
          if (member) {
            const isSelected = member._selected === true;
            member._selected = !isSelected;
            
            if (member._selected) {
              memberItem.classList.add('selected');
              btn.classList.add('selected');
              const icon = btn.querySelector('i');
              if (icon) {
                icon.classList.add('selected');
              }
            } else {
              memberItem.classList.remove('selected');
              btn.classList.remove('selected');
              const icon = btn.querySelector('i');
              if (icon) {
                icon.classList.remove('selected');
              }
            }
          }
        });
      });
    }

    function showSendMessageModal(userId, memberName) {
      const modal = document.getElementById('sendMessageModal');
      const recipientName = document.getElementById('messageRecipientName');
      const sendMessageContent = document.getElementById('sendMessageContent');
      
      const composerTextarea = document.querySelector('.composer #messageContent');
      const composerContent = composerTextarea ? composerTextarea.value.trim() : '';
      
      recipientName.textContent = memberName;
      sendMessageContent.value = composerContent;
      modal.style.display = 'block';

      modal.setAttribute('data-user-id', userId);

      const closeBtn = modal.querySelector('.close-modal');
      closeBtn.onclick = () => {
        modal.style.display = 'none';
      };

      const cancelBtn = document.getElementById('cancelSendMessage');
      cancelBtn.onclick = () => {
        modal.style.display = 'none';
      };
      const confirmBtn = document.getElementById('confirmSendMessage');
      confirmBtn.onclick = async () => {
        const content = sendMessageContent.value.trim();
        if (!content) {
          showPopupNotification("Lỗi", "Vui lòng nhập nội dung tin nhắn");
          return;
        }

        try {
          socket.emit("sendPrivateMessage", {
            botId: currentBotId,
            userId: userId,
            message: content,
            groupId: currentGroupId
          });
          modal.style.display = 'none';
        } catch (error) {
          showPopupNotification("Lỗi", "Không thể gửi tin nhắn");
        }
      };

      window.onclick = (e) => {
        if (e.target === modal) {
          modal.style.display = 'none';
        }
      };
    }

    function attachMenuListeners() {
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.member-menu-container')) {
          document.querySelectorAll('.member-menu').forEach(menu => {
            menu.classList.remove('show');
          });
        }
      });

      document.querySelectorAll('.member-menu-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const menuId = btn.getAttribute('data-menu-id');
          const menu = document.getElementById(menuId);
          
          document.querySelectorAll('.member-menu').forEach(m => {
            if (m.id !== menuId) m.classList.remove('show');
          });

          menu.classList.toggle('show');
        });
      });

      document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', async (e) => {
          e.stopPropagation();
          const action = item.getAttribute('data-action');
          const userId = item.getAttribute('data-user-id');
          const memberName = item.closest('.member-item').querySelector('.member-name').textContent;
          
          item.closest('.member-menu').classList.remove('show');
          
          await handleMemberAction(action, userId, memberName);
        });
      });
    }

    async function handleMemberAction(action, userId, memberName) {
      try {
        switch(action) {
          case 'friend':
            if (confirm(`Bạn có chắc muốn gửi lời mời kết bạn đến ${memberName}?`)) {
              socket.emit("sendFriendRequest", {
                botId: currentBotId,
                userId: userId,
                groupId: currentGroupId
              });
            }
            break;
          case 'acceptFriend':
            if (confirm(`Bạn có chắc muốn chấp nhận lời mời kết bạn từ ${memberName}?`)) {
              socket.emit("acceptFriendRequest", {
                botId: currentBotId,
                userId: userId,
                groupId: currentGroupId
              });
            }
            break;
          case 'unfriend':
            if (confirm(`Bạn có chắc muốn hủy kết bạn với ${memberName}?`)) {
              socket.emit("removeFriend", {
                botId: currentBotId,
                userId: userId,
                groupId: currentGroupId
              });
            }
            break;
          case 'kick':
            if (confirm(`Bạn có chắc muốn kick ${memberName} khỏi nhóm?`)) {
              socket.emit("kickMemberFromGroup", {
                botId: currentBotId,
                userId: userId,
                groupId: currentGroupId
              });
            }
            break;
          case 'block':
            if (confirm(`Bạn có chắc muốn block ${memberName} khỏi nhóm?`)) {
              socket.emit("blockMemberFromGroup", {
                botId: currentBotId,
                userId: userId,
                groupId: currentGroupId
              });
            }
            break;
          case 'leave':
            if (confirm(`Bạn có chắc muốn rời khỏi nhóm này?`)) {
              socket.emit("leaveGroup", {
                botId: currentBotId,
                groupId: currentGroupId
              });
            }
            break;
          case 'blockPrivate':
            if (confirm(`Bạn có chắc muốn block tin nhắn riêng từ ${memberName}?`)) {
              socket.emit("blockPrivateMessage", {
                botId: currentBotId,
                userId: userId,
                groupId: currentGroupId
              });
            }
            break;
          case 'unblockPrivate':
            if (confirm(`Bạn có chắc muốn unblock tin nhắn riêng từ ${memberName}?`)) {
              socket.emit("unblockPrivateMessage", {
                botId: currentBotId,
                userId: userId,
                groupId: currentGroupId
              });
            }
            break;
          case 'keygold':
            if (confirm(`Bạn có chắc muốn phong key vàng (nhường quyền trưởng nhóm) cho ${memberName}?`)) {
              socket.emit("keygold", {
                botId: currentBotId,
                userId: userId,
                groupId: currentGroupId
              });
            }
            break;
          case 'keysilver':
            if (confirm(`Bạn có chắc muốn phong key bạc (phong quản trị viên) cho ${memberName}?`)) {
              socket.emit("keysilver", {
                botId: currentBotId,
                userId: userId,
                groupId: currentGroupId
              });
            }
            break;
          case 'unkey':
            if (confirm(`Bạn có chắc muốn xóa key (gỡ quản trị viên) của ${memberName}?`)) {
              socket.emit("unkey", {
                botId: currentBotId,
                userId: userId,
                groupId: currentGroupId
              });
            }
            break;
        }
      } catch (error) {
        showPopupNotification("Lỗi", `Không thể thực hiện hành động: ${error.message}`);
      }
    }

    function filterMembers(searchTerm) {
      currentPage = 1;
      
      if (!searchTerm || !searchTerm.trim()) {
        renderMembers(allMembers);
        membersCount.textContent = `${allMembers.length} thành viên`;
        return;
      }

      const term = searchTerm.toLowerCase().trim();
      const filtered = allMembers.filter((member) => {
        const name = (member.displayName || member.name || member.dName || member.zaloName || member.nickname || "").toLowerCase();
        const userId = normalizeId(member.id || member.userId || member.uid || member.uidFrom || "");
        return name.includes(term) || userId.includes(term);
      });

      renderMembers(filtered);
      membersCount.textContent = `${filtered.length} / ${allMembers.length} thành viên`;
    }

    searchInput.addEventListener("input", (e) => {
      filterMembers(e.target.value);
    });

    function reloadMembersList() {
      socket.emit("getGroupMembers", { botId: currentBotId, groupId: currentGroupId });
    }

    reloadMembersList();

    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    
    if (prevPageBtn) {
      prevPageBtn.addEventListener('click', () => {
        if (currentPage > 1) {
          currentPage--;
          const currentSearchTerm = searchInput.value.trim();
          if (currentSearchTerm) {
            filterMembers(currentSearchTerm);
          } else {
            renderMembers(allMembers);
          }
          membersList.scrollTop = 0;
        }
      });
    }
    
    if (nextPageBtn) {
      nextPageBtn.addEventListener('click', () => {
        const currentSearchTerm = searchInput.value.trim();
        const membersToCheck = currentSearchTerm ? 
          allMembers.filter((member) => {
            const name = (member.displayName || member.name || member.dName || member.zaloName || member.nickname || "").toLowerCase();
            const userId = String(member.id || member.userId || member.uid || member.uidFrom || "").toLowerCase();
            return name.includes(currentSearchTerm.toLowerCase()) || userId.includes(currentSearchTerm.toLowerCase());
          }) : allMembers;
        
        const totalPages = Math.ceil(membersToCheck.length / membersPerPage);
        if (currentPage < totalPages) {
          currentPage++;
          if (currentSearchTerm) {
            filterMembers(currentSearchTerm);
          } else {
            renderMembers(allMembers);
          }
          membersList.scrollTop = 0;
        }
      });
    }

    const sendAllBtn = document.getElementById('sendAllMessagesBtn');
    if (sendAllBtn) {
      sendAllBtn.addEventListener('click', async () => {
        const selectedMembers = allMembers.filter(m => m._selected === true);
        
        
        if (selectedMembers.length === 0) {
          showPopupNotification("Thông báo", "Vui lòng chọn ít nhất một thành viên");
          return;
        }

        const composerTextarea = document.querySelector('.composer #messageContent');
        const messageContent = composerTextarea ? composerTextarea.value.trim() : '';
        
        if (!messageContent) {
          showPopupNotification("Lỗi", "Vui lòng nhập nội dung tin nhắn");
          return;
        }

        if (!confirm(`Bạn có chắc muốn gửi tin nhắn đến ${selectedMembers.length} thành viên đã chọn?`)) {
          return;
        }

        let successCount = 0;
        let failCount = 0;
        const delayMs = 60000;
        const sentMessages = new Set();
        const DUPLICATE_LIMIT = 80;
        let messageVariationIndex = 0;

        const rawVariants = messageContent
          .split('---')
          .map(v => v.trim())
          .filter(v => v.length > 0);

        const messageVariants = rawVariants.slice(0, 3);

        isSendingBulkMessages = true;
        sendAllBtn.disabled = true;
        sendAllBtn.textContent = 'Đang gửi...';
        pendingMessages.clear();

        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        const waitForResponse = (userId, timeout = 10000) => {
          return new Promise((resolve) => {
            const timer = setTimeout(() => {
              pendingMessages.delete(userId);
              resolve(false);
            }, timeout);
            
            pendingMessages.set(userId, (success) => {
              clearTimeout(timer);
              pendingMessages.delete(userId);
              resolve(success);
            });
          });
        };

        const createMessageWithVariation = (baseContent, index, stt, randomId, timestamp, dateTime) => {
          if (index > 0 && index % DUPLICATE_LIMIT === 0) {
            messageVariationIndex++;
            const variationChars = ['•', '▪', '▫', '○', '●', '◆', '◇', '★', '☆'];
            const randomChar = variationChars[Math.floor(Math.random() * variationChars.length)];
            const randomSuffix = Math.random().toString(36).substring(2, 6);
            return `${randomChar} AUTO SEND - HA HUY HOANG - ${randomChar}\n${baseContent}\n\n[Batch: ${messageVariationIndex} | ID: ${randomId}-${timestamp} | ${dateTime} | ${randomSuffix}]`;
          }
          return `[ AUTO SEND BY -H H H- <${stt}> ]\n${baseContent}\n\n[ID: ${randomId}-${timestamp} | ${dateTime}]`;
        };

        const messageHandler = (data) => {
          if (data.groupId === currentGroupId) {
            const userId = String(data.userId || "");
            const originalUserId = String(data.originalUserId || "");
            const normalizedUserId = normalizeId(userId);
            const normalizedOriginalUserId = normalizeId(originalUserId);
            
            for (const [key, callback] of pendingMessages.entries()) {
              const normalizedKey = normalizeId(key);
              if (normalizedKey === normalizedUserId || 
                  normalizedKey === normalizedOriginalUserId ||
                  key === userId || 
                  key === originalUserId) {
                callback(true);
                sentMessages.add(normalizedKey);
                return;
              }
            }
          }
        };

        const errorHandler = (errorMessage) => {
          if (typeof errorMessage === 'string' && errorMessage.includes('tin nhắn')) {
            const userIdMatch = errorMessage.match(/userId[:\s]+([0-9]+)/);
            if (userIdMatch) {
              const userId = userIdMatch[1];
              const normalizedUserId = normalizeId(userId);
              
              for (const [key, callback] of pendingMessages.entries()) {
                const normalizedKey = normalizeId(key);
                if (normalizedKey === normalizedUserId || key === userId) {
                  callback(false);
                  return;
                }
              }
            }
          }
        };
        
        const timeoutHandler = (userId) => {
          const callback = pendingMessages.get(userId);
          if (callback) {
            callback(false);
          }
        };

        socket.on("privateMessageSent", messageHandler);
        socket.on("error", errorHandler);

        for (let i = 0; i < selectedMembers.length; i++) {
          const member = selectedMembers[i];
          const userId = member.id || member.userId || member.uid || "";
          const stt = i + 1;
          const randomId = Math.random().toString(36).substring(2, 8);
          const timestamp = Date.now();
          const now = new Date();
          const dateTime = now.toLocaleString('vi-VN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          }).replace(/,/g, '');
          
          const baseContentForUser = messageVariants.length > 0
            ? messageVariants[i % messageVariants.length]
            : messageContent;

          const messageWithPrefix = createMessageWithVariation(baseContentForUser, i, stt, randomId, timestamp, dateTime);
          
          if (userId) {
            try {
              const normalizedUserId = normalizeId(userId);
              const responseReceived = waitForResponse(normalizedUserId, 10000);
              
              socket.emit("sendPrivateMessage", {
                botId: currentBotId,
                userId: userId,
                message: messageWithPrefix,
                groupId: currentGroupId
              });
              
              try {
                const success = await Promise.race([
                  responseReceived,
                  new Promise((resolve) => setTimeout(() => resolve(false), 10000))
                ]);
                
                if (success) {
                  successCount++;
                } else {
                  failCount++;
                  timeoutHandler(normalizedUserId);
                }
              } catch (responseError) {
                failCount++;
                timeoutHandler(normalizedUserId);
              }
              
              sendAllBtn.textContent = `Đang gửi... (${i + 1}/${selectedMembers.length})`;
            } catch (error) {
              failCount++;
            }
          } else {
            failCount++;
          }

          if (i < selectedMembers.length - 1) {
            if (i > 0 && i % DUPLICATE_LIMIT === 0) {
              await delay(delayMs * 3);
            } else {
              await delay(delayMs);
            }
          }
        }

        socket.off("privateMessageSent", messageHandler);
        socket.off("error", errorHandler);

        isSendingBulkMessages = false;
        sendAllBtn.disabled = false;
        sendAllBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Gửi tất cả';

        selectedMembers.forEach(member => {
          member._selected = false;
        });
        
        const currentSearchTerm = searchInput.value.trim();
        if (currentSearchTerm) {
          filterMembers(currentSearchTerm);
        } else {
          renderMembers(allMembers);
        }

        sendAllBtn.disabled = false;
        sendAllBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Gửi tất cả';

        if (failCount === 0) {
          showPopupNotification("Thành công", `Đã gửi tin nhắn đến ${successCount} thành viên`);
        } else {
          showPopupNotification("Thông báo", `Đã gửi ${successCount} tin nhắn, ${failCount} tin nhắn thất bại`);
        }
      });
    }

    socket.on("groupMembers", (data) => {
      
      if (!data) {
        membersList.innerHTML = '<div class="no-members">Không nhận được dữ liệu từ server</div>';
        updatePagination(0);
        return;
      }

      currentPage = 1;

      const members = data.members || [];
      const adminIds = new Set((data.adminIds || []).map((id) => String(id)));
      const creatorId = String(data.creatorId || "");
      groupType = data.groupType || 1;
      botIsAdmin = data.botIsAdmin || false;
      botId = data.botId || null;
      isAdminLevelHighest = data.isAdminLevelHighest || false;
      friendsList = data.friendsList || [];
      blockedUsersList = (data.blockedUsersList || []).map(id => String(id));
      pendingFriendRequests = (data.pendingFriendRequests || []).map(id => String(id));
      
      const currentSearchTerm = searchInput.value.trim();

      const normalizedCreatorId = normalizeId(creatorId);
      const normalizedAdminIds = new Set(Array.from(adminIds).map(id => normalizeId(id)));
      
      allMembers = members.map((member) => {
        const memberId = normalizeId(member.id || member.userId || member.uid || "");
        const isCreator = memberId === normalizedCreatorId;
        const isAdmin = normalizedAdminIds.has(memberId);
        return {
          ...member,
          isAdmin: isAdmin || isCreator,
          isCreator: isCreator,
          sortOrder: isCreator ? 0 : (isAdmin ? 1 : 2),
          _selected: member._selected || false
        };
      }).sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) {
          return a.sortOrder - b.sortOrder;
        }
        const nameA = (a.displayName || a.name || a.dName || "").toLowerCase();
        const nameB = (b.displayName || b.name || b.dName || "").toLowerCase();
        return nameA.localeCompare(nameB);
      });
      
      updateMemberMap();

      membersCount.textContent = `${allMembers.length} thành viên`;

      if (allMembers.length === 0) {
        membersList.innerHTML = '<div class="no-members">Nhóm chưa có thành viên nào</div>';
        updatePagination(0);
        return;
      }

      if (currentSearchTerm) {
        filterMembers(currentSearchTerm);
      } else {
        renderMembers(allMembers);
      }
    });

    socket.on("friendRequestSent", (data) => {
      if (data.groupId === currentGroupId) {
        showPopupNotification("Thành công", "Đã gửi lời mời kết bạn");
        reloadMembersList();
      }
    });

    socket.on("friendRequestAccepted", (data) => {
      if (data.groupId === currentGroupId) {
        showPopupNotification("Thành công", "Đã chấp nhận lời mời kết bạn");
        reloadMembersList();
      }
    });

    socket.on("friendRemoved", (data) => {
      if (data.groupId === currentGroupId) {
        showPopupNotification("Thành công", "Đã hủy kết bạn");
        reloadMembersList();
      }
    });

    socket.on("memberKicked", (data) => {
      if (data.groupId === currentGroupId) {
        showPopupNotification("Thành công", "Đã kick thành viên khỏi nhóm");
        reloadMembersList();
      }
    });

    socket.on("memberBlocked", (data) => {
      if (data.groupId === currentGroupId) {
        showPopupNotification("Thành công", "Đã block thành viên khỏi nhóm");
        reloadMembersList();
      }
    });

    socket.on("groupLeft", (data) => {
      if (data.groupId === currentGroupId) {
        showPopupNotification("Thành công", "Đã rời khỏi nhóm");
        modal.style.display = "none";
        socket.emit("getAllGroups", { botId: currentBotId });
      }
    });

    socket.on("privateMessageBlocked", (data) => {
      if (data.groupId === currentGroupId) {
        showPopupNotification("Thành công", "Đã block tin nhắn riêng");
        reloadMembersList();
      }
    });

    socket.on("privateMessageUnblocked", (data) => {
      if (data.groupId === currentGroupId) {
        showPopupNotification("Thành công", "Đã unblock tin nhắn riêng");
        reloadMembersList();
      }
    });

    socket.on("keygoldSuccess", (data) => {
      if (data.groupId === currentGroupId) {
        showPopupNotification("Thành công", "Đã phong key vàng (nhường quyền trưởng nhóm)");
        reloadMembersList();
      }
    });

    socket.on("keysilverSuccess", (data) => {
      if (data.groupId === currentGroupId) {
        showPopupNotification("Thành công", "Đã phong key bạc (phong quản trị viên)");
        reloadMembersList();
      }
    });

    socket.on("unkeySuccess", (data) => {
      if (data.groupId === currentGroupId) {
        showPopupNotification("Thành công", "Đã xóa key (gỡ quản trị viên)");
        reloadMembersList();
      }
    });

    socket.on("privateMessageSent", (data) => {
      if (data.groupId === currentGroupId) {
        const userId = String(data.userId || "");
        const normalizedUserId = normalizeId(userId);
        
        for (const [key, callback] of pendingMessages.entries()) {
          if (key === normalizedUserId || key === userId || normalizeId(key) === normalizedUserId) {
            callback(true);
            return;
          }
        }
        
        if (!isSendingBulkMessages) {
          showPopupNotification("Thành công", "Đã gửi tin nhắn");
        }
      }
    });
    
    socket.on("error", (errorMessage) => {
      if (typeof errorMessage === 'string' && errorMessage.includes('tin nhắn')) {
        const userIdMatch = errorMessage.match(/userId[:\s]+([0-9]+)/);
        if (userIdMatch) {
          const userId = userIdMatch[1];
          const normalizedUserId = normalizeId(userId);
          
          for (const [key, callback] of pendingMessages.entries()) {
            if (key === normalizedUserId || key === userId || normalizeId(key) === normalizedUserId) {
              callback(false);
              return;
            }
          }
        }
      }
    });

    socket.on("error", (error) => {
      console.error("Error from server:", error);
      if (error.includes("kết bạn") || error.includes("kick") || error.includes("block") || error.includes("rời nhóm")) {
        showPopupNotification("Lỗi", error);
      } else if (error.includes("thành viên")) {
        membersList.innerHTML = `<div class="no-members">Lỗi: ${error}</div>`;
      }
    });

    const closeBtn = modal.querySelector(".close-modal");
    const originalCloseHandler = () => {
      modal.style.display = "none";
      socket.off("groupMembers");
      socket.off("friendRequestSent");
      socket.off("friendRemoved");
      socket.off("memberKicked");
      socket.off("memberBlocked");
      socket.off("groupLeft");
      socket.off("privateMessageBlocked");
      socket.off("privateMessageUnblocked");
      socket.off("keygoldSuccess");
      socket.off("keysilverSuccess");
      socket.off("unkeySuccess");
      socket.off("error");
    };
    
    closeBtn.onclick = originalCloseHandler;

    const originalWindowClickHandler = (e) => {
      if (e.target === modal) {
        originalCloseHandler();
      }
    };
    window.addEventListener("click", originalWindowClickHandler);
  }

  function calculateDelay() {
    const value = parseInt(document.getElementById("timeValue").value) || 0;
    const unit = document.getElementById("timeUnit").value;
    let delay = value;

    switch (unit) {
      case "minutes":
        delay *= 60;
        break;
      case "hours":
        delay *= 3600;
        break;
      case "days":
        delay *= 86400;
        break;
    }

    return delay * 1000; 
  }

  function checkContentAndAttachments() {
    const content = messageContent.value.trim();
    const hasAttachments = fileInput.files.length > 0;

    if (!content && !hasAttachments) {
      showPopupNotification("Thông báo", "Vui lòng nhập nội dung hoặc chọn file đính kèm.");
      return false;
    }
    return true;
  }

  function showPopupNotification(title, message) {
    const popup = document.getElementById("popupNotification");
    const popupTitle = document.getElementById("popupTitle");
    const popupMessage = document.getElementById("popupMessage");

    popupTitle.textContent = title;
    popupMessage.textContent = message;
    popup.style.display = "block";

    document.getElementById("closePopupNotification").onclick = () => {
      popup.style.display = "none";
    };
  }

  function showConfirmDialog(title, message, onConfirm) {
    if (window.Common) return Common.showConfirmDialog(title, message, onConfirm);
    if (confirm(message)) onConfirm && onConfirm();
  }
});
