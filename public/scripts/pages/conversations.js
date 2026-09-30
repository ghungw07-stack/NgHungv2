document.addEventListener("DOMContentLoaded", () => {
  const socket = io();
  const $ = (id) => document.getElementById(id);
  const state = {
    botId: "",
    bots: [],
    conversations: [],
    selected: null,
    messages: [],
    hasMore: false,
    filter: "all",
    friends: new Map(),
    groups: new Map(),
    sending: false,
  };

  const layout = document.querySelector(".chat-layout");
  const botSelector = $("botSelector");
  const conversationList = $("conversationList");
  const conversationStatus = $("conversationStatus");
  const messageList = $("messageList");
  const activeChat = $("activeChat");
  const emptyChat = $("emptyChat");
  const messageInput = $("messageInput");
  const sendButton = $("sendButton");
  let toastTimer = null;
  let refreshTimer = null;

  function toast(message, error = false) {
    const el = $("chatToast");
    el.textContent = message;
    el.className = `chat-toast show${error ? " error" : ""}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = "chat-toast"; }, 2600);
  }

  function normalizeTime(value) {
    const number = Number(value) || Date.now();
    return number < 1e12 ? number * 1000 : number;
  }

  function formatTime(value) {
    const date = new Date(normalizeTime(value));
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
  }

  function dayKey(value) {
    return new Date(normalizeTime(value)).toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function itemId(item, group = false) {
    return String(group
      ? item?.groupId ?? item?.id ?? item?.grid ?? ""
      : item?.userId ?? item?.uid ?? item?.id ?? item?.zaloId ?? "");
  }

  function itemName(item, fallback) {
    return String(item?.displayName || item?.name || item?.groupName || item?.dName || item?.zaloName || fallback || "Không tên");
  }

  function itemAvatar(item) {
    return item?.avatar || item?.avt || item?.fullAvt || item?.thumb || "";
  }

  function conversationInfo(conversation) {
    const group = state.groups.get(String(conversation.threadId));
    const friend = state.friends.get(String(conversation.threadId));
    const type = group ? "group" : friend ? "direct" : conversation.conversationType;
    const source = group || friend;
    return {
      ...conversation,
      type: type || "direct",
      name: source ? itemName(source, conversation.title) : conversation.title || conversation.threadId,
      avatar: source ? itemAvatar(source) : "",
    };
  }

  function directoryConversation(item, type) {
    const threadId = itemId(item, type === "group");
    return {
      threadId,
      title: itemName(item, threadId),
      lastMessage: "",
      timestamp: 0,
      conversationType: type,
      type,
      messageCount: 0,
      directoryOnly: true,
    };
  }

  // Danh sách bên trái luôn chứa toàn bộ bạn bè và nhóm của bot. Giữ các
  // thread có tin nhắn ở trên cùng, sau đó bổ sung những liên hệ chưa có lịch
  // sử theo thứ tự tên.
  function getAllConversations() {
    const recent = state.conversations.map(conversationInfo);
    const known = new Set(recent.map((item) => `${item.type}:${item.threadId}`));
    const directory = [];

    for (const item of state.groups.values()) {
      const conversation = conversationInfo(directoryConversation(item, "group"));
      const key = `group:${conversation.threadId}`;
      if (conversation.threadId && !known.has(key)) {
        known.add(key);
        directory.push(conversation);
      }
    }
    for (const item of state.friends.values()) {
      const conversation = conversationInfo(directoryConversation(item, "direct"));
      const key = `direct:${conversation.threadId}`;
      if (conversation.threadId && !known.has(key)) {
        known.add(key);
        directory.push(conversation);
      }
    }

    directory.sort((a, b) => a.name.localeCompare(b.name, "vi", { sensitivity: "base" }));
    return [...recent, ...directory];
  }

  function makeAvatar(info) {
    const avatar = document.createElement("div");
    avatar.className = `chat-avatar${info.type === "group" ? " group" : ""}`;
    if (info.avatar) {
      const image = document.createElement("img");
      image.src = info.avatar;
      image.alt = "";
      image.referrerPolicy = "no-referrer";
      image.onerror = () => { image.remove(); avatar.textContent = (info.name || "?").charAt(0).toUpperCase(); };
      avatar.appendChild(image);
    } else avatar.textContent = (info.name || "?").charAt(0).toUpperCase();
    return avatar;
  }

  async function fetchJson(url) {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (response.status === 401) {
      location.href = "/login.html";
      throw new Error("Phiên đăng nhập đã hết hạn");
    }
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || "Không thể tải dữ liệu");
    return data;
  }

  async function loadConversations({ quiet = false } = {}) {
    if (!state.botId) return;
    if (!quiet) conversationStatus.textContent = "Đang tải cuộc trò chuyện...";
    try {
      const data = await fetchJson(`/api/conversations?botId=${encodeURIComponent(state.botId)}&limit=200`);
      state.conversations = data.conversations || [];
      conversationStatus.textContent = state.conversations.length ? "" : "Chưa có lịch sử tin nhắn";
      renderConversations();
      if (state.selected) {
        const latest = state.conversations.find((item) => String(item.threadId) === String(state.selected.threadId));
        if (latest) state.selected = conversationInfo(latest);
      }
    } catch (error) {
      conversationStatus.textContent = error.message;
      if (!quiet) toast(error.message, true);
    }
  }

  function renderConversations() {
    const query = $("conversationSearch").value.trim().toLocaleLowerCase("vi");
    const selectedId = String(state.selected?.threadId || "");
    conversationList.replaceChildren();
    const allConversations = getAllConversations();
    const visible = allConversations
      .filter((item) => state.filter === "all" || item.type === state.filter)
      .filter((item) => !query || `${item.name} ${item.lastMessage} ${item.threadId}`.toLocaleLowerCase("vi").includes(query));

    visible.forEach((info) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `conversation-item${String(info.threadId) === selectedId ? " active" : ""}`;
      button.appendChild(makeAvatar(info));
      const copy = document.createElement("div");
      copy.className = "conversation-copy";
      const name = document.createElement("div");
      name.className = "conversation-name";
      name.textContent = info.name;
      const preview = document.createElement("div");
      preview.className = "conversation-preview";
      preview.textContent = info.lastMessage
        ? `${info.isSelf ? "Bạn: " : ""}${info.isUndo ? "Tin nhắn đã thu hồi" : info.lastMessage}`
        : "Chưa có lịch sử tin nhắn";
      copy.append(name, preview);
      const time = document.createElement("time");
      time.className = "conversation-time";
      time.textContent = Number(info.timestamp) > 0 ? formatTime(info.timestamp) : "";
      button.append(copy, time);
      button.addEventListener("click", () => selectConversation(info));
      conversationList.appendChild(button);
    });
    if (!visible.length && allConversations.length) conversationStatus.textContent = "Không tìm thấy cuộc trò chuyện phù hợp";
    else if (visible.length) conversationStatus.textContent = "";
  }

  async function selectConversation(info) {
    state.selected = info;
    state.messages = [];
    layout.classList.add("has-selection");
    emptyChat.hidden = true;
    activeChat.hidden = false;
    $("conversationTitle").textContent = info.name;
    $("conversationMeta").textContent = `${info.type === "group" ? "Nhóm" : "Tin nhắn cá nhân"} • ID ${info.threadId}`;
    const headerAvatar = $("headerAvatar");
    headerAvatar.replaceWith(Object.assign(makeAvatar(info), { id: "headerAvatar" }));
    renderConversations();
    await loadMessages({ scrollBottom: true });
    messageInput.focus();
  }

  async function loadMessages({ older = false, scrollBottom = false, quiet = false } = {}) {
    if (!state.botId || !state.selected) return;
    const previousHeight = messageList.scrollHeight;
    const params = new URLSearchParams({
      botId: state.botId,
      threadId: state.selected.threadId,
      type: state.selected.type,
      limit: "100",
    });
    if (older && state.messages.length) {
      params.set("before", String(state.messages[0].timestamp));
      params.set("beforeId", String(state.messages[0].id || ""));
    }
    try {
      if (!quiet) messageList.classList.add("loading");
      const data = await fetchJson(`/api/conversations/messages?${params}`);
      if (older) {
        const ids = new Set(state.messages.map((item) => item.id));
        state.messages = [...data.messages.filter((item) => !ids.has(item.id)), ...state.messages];
      } else state.messages = data.messages || [];
      state.hasMore = data.hasMore;
      $("loadOlderButton").hidden = !state.hasMore;
      renderMessages();
      requestAnimationFrame(() => {
        if (older) messageList.scrollTop = messageList.scrollHeight - previousHeight;
        else if (scrollBottom || messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight < 240) messageList.scrollTop = messageList.scrollHeight;
      });
    } catch (error) {
      if (!quiet) toast(error.message, true);
    } finally {
      messageList.classList.remove("loading");
    }
  }

  function appendMedia(bubble, media) {
    if (!media?.url && !media?.thumb) return;
    let element;
    const url = media.url || media.thumb;
    if (media.kind === "image" || media.kind === "sticker") {
      element = document.createElement("img");
      element.src = url;
      element.alt = media.name || "Hình ảnh";
      element.loading = "lazy";
      element.referrerPolicy = "no-referrer";
    } else if (media.kind === "video") {
      element = document.createElement("video");
      element.src = url;
      element.controls = true;
      if (media.thumb) element.poster = media.thumb;
    } else if (media.kind === "audio") {
      element = document.createElement("audio");
      element.src = url;
      element.controls = true;
    } else {
      element = document.createElement("a");
      element.href = url;
      element.target = "_blank";
      element.rel = "noopener noreferrer";
      element.className = "file-link";
      element.textContent = media.name || "Mở tệp đính kèm";
    }
    element.classList.add("message-media");
    bubble.appendChild(element);
  }

  function renderMessages() {
    messageList.replaceChildren();
    if (!state.messages.length) {
      const empty = document.createElement("div");
      empty.className = "message-empty";
      empty.textContent = "Chưa có lịch sử tin nhắn";
      messageList.appendChild(empty);
      return;
    }
    let lastDay = "";
    for (const message of state.messages) {
      const day = dayKey(message.timestamp);
      if (day !== lastDay) {
        const separator = document.createElement("div");
        separator.className = "day-separator";
        separator.textContent = day;
        messageList.appendChild(separator);
        lastDay = day;
      }
      const row = document.createElement("div");
      row.className = `message-row${message.isSelf ? " self" : ""}`;
      const bubble = document.createElement("div");
      bubble.className = "message-bubble";
      if (!message.isSelf && state.selected?.type === "group" && message.senderName) {
        const sender = document.createElement("div");
        sender.className = "sender-label";
        sender.textContent = message.senderName;
        bubble.appendChild(sender);
      }
      if (!message.isUndo) appendMedia(bubble, message.media);
      const content = document.createElement("div");
      content.className = `message-content${message.isUndo ? " undo" : ""}`;
      content.textContent = message.isUndo ? "Tin nhắn đã được thu hồi" : message.content;
      bubble.appendChild(content);
      const time = document.createElement("div");
      time.className = "message-time";
      time.textContent = new Date(normalizeTime(message.timestamp)).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
      bubble.appendChild(time);
      row.appendChild(bubble);
      messageList.appendChild(row);
    }
  }

  function changeBot(botId) {
    state.botId = String(botId || "");
    state.selected = null;
    state.messages = [];
    state.friends.clear();
    state.groups.clear();
    activeChat.hidden = true;
    emptyChat.hidden = false;
    layout.classList.remove("has-selection");
    if (!state.botId) {
      state.conversations = [];
      renderConversations();
      conversationStatus.textContent = "Chọn bot để xem tin nhắn";
      return;
    }
    localStorage.setItem("conversationBotId", state.botId);
    socket.emit("registerBotDashboard", { botId: state.botId });
    socket.emit("getAllFriends", { botId: state.botId });
    socket.emit("getAllGroups", { botId: state.botId });
    loadConversations();
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => loadConversations({ quiet: true }), 15000);
  }

  socket.on("connect", () => {
    socket.emit("getBotsList");
    // Socket.IO tạo socket mới sau khi mất mạng; đăng ký lại bot để tiếp tục
    // nhận tin realtime và nạp lại danh bạ dù lựa chọn bot trên UI không đổi.
    if (state.botId) {
      socket.emit("registerBotDashboard", { botId: state.botId });
      socket.emit("getAllFriends", { botId: state.botId });
      socket.emit("getAllGroups", { botId: state.botId });
      loadConversations({ quiet: true });
    }
  });
  socket.on("botsList", (bots) => {
    state.bots = Array.isArray(bots) ? bots : [];
    const wanted = botSelector.value || new URLSearchParams(location.search).get("botId") || localStorage.getItem("conversationBotId") || "";
    botSelector.innerHTML = '<option value="">-- Chọn bot --</option>';
    state.bots.forEach((bot) => {
      const option = document.createElement("option");
      option.value = String(bot.id);
      option.textContent = `${bot.name || "Bot"} (${bot.id})${bot.status === "active" ? " • online" : ""}`;
      botSelector.appendChild(option);
    });
    if (state.bots.some((bot) => String(bot.id) === String(wanted))) {
      botSelector.value = String(wanted);
      if (state.botId !== String(wanted)) changeBot(wanted);
    }
  });
  socket.on("friendsList", (items, botId) => {
    if (botId && String(botId) !== state.botId) return;
    state.friends = new Map((Array.isArray(items) ? items : []).map((item) => [itemId(item, false), item]));
    renderConversations();
  });
  socket.on("groupsList", (items, botId) => {
    if (botId && String(botId) !== state.botId) return;
    state.groups = new Map((Array.isArray(items) ? items : []).map((item) => [itemId(item, true), item]));
    renderConversations();
  });
  socket.on("newMessage", ({ message } = {}) => {
    const threadId = String(message?.threadId || "");
    setTimeout(async () => {
      await loadConversations({ quiet: true });
      if (state.selected && threadId === String(state.selected.threadId)) await loadMessages({ scrollBottom: true, quiet: true });
    }, 120);
  });
  socket.on("messageSent", () => {
    if (!state.sending) return;
    state.sending = false;
    sendButton.disabled = false;
    messageInput.value = "";
    resizeInput();
    toast("Đã gửi tin nhắn");
    setTimeout(() => {
      loadConversations({ quiet: true });
      loadMessages({ scrollBottom: true, quiet: true });
    }, 250);
  });
  socket.on("error", (message) => {
    if (state.sending) {
      state.sending = false;
      sendButton.disabled = false;
    }
    toast(String(message || "Có lỗi xảy ra"), true);
  });

  function resizeInput() {
    messageInput.style.height = "auto";
    messageInput.style.height = `${Math.min(messageInput.scrollHeight, 130)}px`;
  }

  botSelector.addEventListener("change", () => changeBot(botSelector.value));
  $("refreshButton").addEventListener("click", () => {
    socket.emit("getBotsList");
    if (state.botId) {
      socket.emit("getAllFriends", { botId: state.botId });
      socket.emit("getAllGroups", { botId: state.botId });
      loadConversations();
    }
  });
  $("reloadMessagesButton").addEventListener("click", () => loadMessages({ scrollBottom: true }));
  $("loadOlderButton").addEventListener("click", () => loadMessages({ older: true }));
  $("backButton").addEventListener("click", () => layout.classList.remove("has-selection"));
  $("conversationSearch").addEventListener("input", renderConversations);
  document.querySelectorAll(".conversation-filter button").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll(".conversation-filter button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.filter = button.dataset.filter;
    renderConversations();
  }));
  messageInput.addEventListener("input", resizeInput);
  messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      $("composer").requestSubmit();
    }
  });
  $("composer").addEventListener("submit", (event) => {
    event.preventDefault();
    const text = messageInput.value.trim();
    if (!text || !state.selected || state.sending) return;
    state.sending = true;
    sendButton.disabled = true;
    socket.emit("sendMessageToSingle", {
      botId: state.botId,
      id: state.selected.threadId,
      type: state.selected.type === "group" ? "group" : "friend",
      message: text,
      permanent: true,
      includePendingFiles: false,
    });
  });
});
