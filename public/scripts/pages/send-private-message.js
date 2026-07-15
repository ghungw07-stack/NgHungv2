document.addEventListener("DOMContentLoaded", function () {
  const socket = io();
  if (window.Common) Common.attachLogout("logoutBtn");

  let currentBotId = null;
  let currentBotInfo = null;
  let allBots = [];
  let allMembers = [];
  let filteredMembers = [];
  let selectedMembers = new Set();
  let currentGroupId = null;
  let currentGroupName = "";
  let adminIds = [];
  let creatorId = null;
  let currentGroupType = 1;
  
  let currentPage = 1;
  const membersPerPage = 20;

  const botSelector = document.getElementById("botSelector");
  const refreshBotsBtn = document.getElementById("refreshBotsBtn");
  const selectedBotInfo = document.getElementById("selectedBotInfo");
  const selectedBotAvatar = document.getElementById("selectedBotAvatar");
  const selectedBotAvatarPlaceholder = document.getElementById("selectedBotAvatarPlaceholder");
  const selectedBotName = document.getElementById("selectedBotName");
  const selectedBotId = document.getElementById("selectedBotId");
  const selectedBotStatus = document.getElementById("selectedBotStatus");
  const groupInput = document.getElementById("groupInput");
  const scanGroupBtn = document.getElementById("scanGroupBtn");
  const groupInfo = document.getElementById("groupInfo");
  const groupName = document.getElementById("groupName");
  const groupMemberCount = document.getElementById("groupMemberCount");
  
  // Handle optional elements that may not exist in new layout
  if (!groupInfo) {
    // Create a dummy element to prevent errors
    const dummy = document.createElement("div");
    dummy.style.display = "none";
    document.body.appendChild(dummy);
  }
  const messageContent = document.getElementById("messageContent");
  const membersList = document.getElementById("membersList");
  const membersSearchInput = document.getElementById("membersSearchInput");
  const selectedCount = document.getElementById("selectedCount");
  const selectAllBtn = document.getElementById("selectAllBtn");
  const unselectAllBtn = document.getElementById("unselectAllBtn");
  const sendSelectedBtn = document.getElementById("sendSelectedBtn");
  const prevPageBtn = document.getElementById("prevPageBtn");
  const nextPageBtn = document.getElementById("nextPageBtn");
  const paginationInfo = document.getElementById("paginationInfo");
  const membersPagination = document.getElementById("membersPagination");
  const fileInput = document.getElementById("fileInputPrivate");
  const fileList = document.getElementById("fileListPrivate");

  socket.on("connect", () => {
    console.log("Đã kết nối tới máy chủ");
    loadBotsList();
  });

  function loadBotsList() {
    socket.emit("getBotsList");
  }

  socket.on("botsList", (bots) => {
    allBots = bots;
    botSelector.innerHTML = '<option value="">-- Chọn bot của bạn --</option>';
    bots.forEach((bot) => {
      const option = document.createElement("option");
      option.value = bot.id;
      const statusText = bot.status === "active" ? "🟢 Đang hoạt động" : bot.status === "pending" ? "🟡 Chờ phê duyệt" : bot.status === "reject" ? "🔴 Bị từ chối" : "⚪ Không hoạt động";
      option.textContent = `${bot.name || "Bot"} (${bot.id}) - ${statusText}`;
      option.setAttribute("data-status", bot.status || "inactive");
      botSelector.appendChild(option);
    });
  });

  botSelector.addEventListener("change", (e) => {
    currentBotId = e.target.value;
    currentBotInfo = allBots.find(bot => bot.id === currentBotId);
    
    if (currentBotId && currentBotInfo) {
      displaySelectedBotInfo(currentBotInfo);
    } else {
      selectedBotInfo.style.display = "none";
    }
    
    scanGroupBtn.disabled = !currentBotId || !groupInput.value.trim();
    sendSelectedBtn.disabled = !currentBotId || selectedMembers.size === 0 || !messageContent.value.trim();
    
    if (!currentBotId) {
      resetGroupData();
    }
  });

  function displaySelectedBotInfo(bot) {
    if (!bot) return;
    
    selectedBotName.textContent = bot.name || "Bot";
    selectedBotId.textContent = `ID: ${bot.id}`;
    
    let statusText = "";
    let statusClass = "";
    switch (bot.status) {
      case "active":
        statusText = "🟢 Đang hoạt động";
        statusClass = "status-active";
        break;
      case "pending":
        statusText = "🟡 Chờ phê duyệt";
        statusClass = "status-pending";
        break;
      case "reject":
        statusText = "🔴 Bị từ chối";
        statusClass = "status-reject";
        break;
      default:
        statusText = "⚪ Không hoạt động";
        statusClass = "status-inactive";
        break;
    }
    selectedBotStatus.textContent = statusText;
    selectedBotStatus.className = `bot-status ${statusClass}`;
    
    if (bot.avatar) {
      selectedBotAvatar.src = bot.avatar;
      selectedBotAvatar.style.display = "block";
      selectedBotAvatarPlaceholder.style.display = "none";
      selectedBotAvatar.onerror = () => {
        selectedBotAvatar.style.display = "none";
        selectedBotAvatarPlaceholder.textContent = (bot.name || "B").charAt(0).toUpperCase();
        selectedBotAvatarPlaceholder.style.display = "flex";
      };
    } else {
      selectedBotAvatar.style.display = "none";
      selectedBotAvatarPlaceholder.textContent = (bot.name || "B").charAt(0).toUpperCase();
      selectedBotAvatarPlaceholder.style.display = "flex";
    }
    
    selectedBotInfo.style.display = "block";
  }

  refreshBotsBtn.addEventListener("click", () => {
    loadBotsList();
  });

  groupInput.addEventListener("input", (e) => {
    scanGroupBtn.disabled = !currentBotId || !e.target.value.trim();
  });

  function sortMembers(members) {
    const normalizeId = (id) => String(id || "").replace(/_0$/, "").split("_")[0];
    
    return members.sort((a, b) => {
      const normalizeA = normalizeId(a.id || a.userId);
      const normalizeB = normalizeId(b.id || b.userId);
      
      const isACreator = creatorId && normalizeId(creatorId) === normalizeA;
      const isBCreator = creatorId && normalizeId(creatorId) === normalizeB;
      
      const isAAdmin = !isACreator && adminIds.some(adminId => normalizeId(adminId) === normalizeA);
      const isBAdmin = !isBCreator && adminIds.some(adminId => normalizeId(adminId) === normalizeB);
      
      let priorityA = 2;
      let priorityB = 2;
      
      if (isACreator) priorityA = 0;
      else if (isAAdmin) priorityA = 1;
      
      if (isBCreator) priorityB = 0;
      else if (isBAdmin) priorityB = 1;
      
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      
      const nameA = (a.displayName || a.name || "").toLowerCase();
      const nameB = (b.displayName || b.name || "").toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }

  scanGroupBtn.addEventListener("click", async () => {
    const groupInputValue = groupInput.value.trim();
    if (!groupInputValue || !currentBotId) {
      showPopupNotification("Lỗi", "Vui lòng chọn bot và nhập ID hoặc link nhóm");
      return;
    }

    scanGroupBtn.disabled = true;
    scanGroupBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang quét...';
    membersList.innerHTML = '<div class="loading-members">Đang tải thành viên...</div>';

    try {
      socket.emit("getGroupMembers", {
        botId: currentBotId,
        groupId: groupInputValue,
      });

      currentGroupId = groupInputValue;
    } catch (error) {
      console.error("Lỗi khi quét nhóm:", error);
      showPopupNotification("Lỗi", "Không thể quét thành viên nhóm. Đảm bảo bot đã tham gia nhóm trước.");
      scanGroupBtn.disabled = false;
      scanGroupBtn.innerHTML = '<i class="fas fa-search"></i> Quét thành viên';
    }
  });

  socket.on("groupMembers", (data) => {
    if (data.members && Array.isArray(data.members)) {
      allMembers = data.members.map((m) => {
        const memberId = m.id || m.userId || m.uid || m.uidFrom || String(m);
        const baseId = String(memberId).replace(/_0$/, "").split("_")[0];
        return {
          id: baseId,
          userId: baseId,
          uid: baseId,
          displayName: m.displayName || m.name || m.dName || m.zaloName || m.nickname || "Không tên",
          name: m.displayName || m.name || m.dName || m.zaloName || m.nickname || "Không tên",
          avatar: m.avatar || m.avt || m.fullAvt || "",
          _selected: false,
        };
      });

      adminIds = (data.adminIds || []).map(id => String(id).replace(/_0$/, "").split("_")[0]);
      creatorId = data.creatorId ? String(data.creatorId).replace(/_0$/, "").split("_")[0] : null;
      
      currentGroupType = data.groupType !== undefined ? data.groupType : 1;
      
      if (data.groupName) {
        currentGroupName = data.groupName;
        if (groupName) groupName.textContent = data.groupName;
      }

      if (data.groupId) {
        currentGroupId = data.groupId;
      }
      if (groupMemberCount) groupMemberCount.textContent = `${allMembers.length} thành viên`;
      if (groupInfo) groupInfo.style.display = "block";

      selectedMembers.clear();

      allMembers = sortMembers(allMembers);
      filteredMembers = [...allMembers];
      currentPage = 1;
      renderMembers();
      updateSelectedCount();
      updatePagination();

      scanGroupBtn.disabled = false;
      scanGroupBtn.innerHTML = '<i class="fas fa-search"></i> Quét thành viên';
    } else {
      showPopupNotification("Lỗi", "Không tìm thấy thành viên nào trong nhóm");
      scanGroupBtn.disabled = false;
      scanGroupBtn.innerHTML = '<i class="fas fa-search"></i> Quét thành viên';
    }
  });

  socket.on("error", (errorMessage) => {
    console.error("Socket error:", errorMessage);
    showPopupNotification("Lỗi", errorMessage || "Đã xảy ra lỗi");
    scanGroupBtn.disabled = false;
    scanGroupBtn.innerHTML = '<i class="fas fa-search"></i> Quét thành viên';
    membersList.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><p>Chưa có thành viên nào. Vui lòng quét thành viên từ nhóm.</p></div>';
  });

  membersSearchInput.addEventListener("input", (e) => {
    const searchTerm = e.target.value.trim().toLowerCase();
    if (!searchTerm) {
      filteredMembers = [...allMembers];
    } else {
      filteredMembers = allMembers.filter((member) => {
        const name = (member.displayName || member.name || "").toLowerCase();
        const id = (member.id || member.userId || "").toLowerCase();
        return name.includes(searchTerm) || id.includes(searchTerm);
      });
    }
    filteredMembers = sortMembers(filteredMembers);
    currentPage = 1;
    renderMembers();
    updatePagination();
  });

  selectAllBtn.addEventListener("click", () => {
    filteredMembers.forEach((member) => {
      member._selected = true;
      selectedMembers.add(member.id);
    });
    renderMembers();
    updateSelectedCount();
  });

  unselectAllBtn.addEventListener("click", () => {
    filteredMembers.forEach((member) => {
      member._selected = false;
      selectedMembers.delete(member.id);
    });
    renderMembers();
    updateSelectedCount();
  });

  function updatePagination() {
    if (!membersPagination) return; // Skip if pagination element doesn't exist
    
    const totalPages = Math.ceil(filteredMembers.length / membersPerPage);
    if (totalPages <= 1) {
      membersPagination.style.display = "none";
    } else {
      membersPagination.style.display = "flex";
    }
    
    if (paginationInfo) {
      paginationInfo.textContent = `Trang ${currentPage} / ${totalPages || 1}`;
    }
    
    if (prevPageBtn) {
      prevPageBtn.disabled = currentPage <= 1;
    }
    
    if (nextPageBtn) {
      nextPageBtn.disabled = currentPage >= totalPages || totalPages === 0;
    }
  }

  function getCurrentPageMembers() {
    const startIndex = (currentPage - 1) * membersPerPage;
    const endIndex = startIndex + membersPerPage;
    return filteredMembers.slice(startIndex, endIndex);
  }

  function renderMembers() {
    if (filteredMembers.length === 0) {
      membersList.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><p>Không tìm thấy thành viên nào</p></div>';
      if (membersPagination) membersPagination.style.display = "none";
      return;
    }

    const currentPageMembers = getCurrentPageMembers();
    const normalizeId = (id) => String(id || "").replace(/_0$/, "").split("_")[0];

    membersList.innerHTML = currentPageMembers
      .map((member) => {
        const avatar = member.avatar || "";
        const name = member.displayName || member.name || "Không tên";
        const userId = member.id || member.userId || "";
        const isSelected = member._selected || selectedMembers.has(member.id);
        const normalizedUserId = normalizeId(userId);
        
        const isCreator = creatorId && normalizeId(creatorId) === normalizedUserId;
        const isAdmin = !isCreator && adminIds.some(adminId => normalizeId(adminId) === normalizedUserId);

        const avatarHtml = avatar
          ? `<img src="${avatar}" class="member-avatar" alt="Avatar" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">`
          : "";

        const placeholderHtml = `<div class="member-avatar placeholder" ${avatar ? 'style="display:none;"' : ''}>${name.charAt(0).toUpperCase()}</div>`;

        let badgeHtml = "";
        const isGroup = currentGroupType === 1;
        if (isCreator) {
          const creatorText = isGroup ? "Trưởng nhóm" : "Trưởng Cộng Đồng";
          badgeHtml = `<span class="member-badge creator-badge"><i class="fas fa-crown"></i> ${creatorText}</span>`;
        } else if (isAdmin) {
          const adminText = isGroup ? "Phó nhóm" : "Phó Cộng Đồng";
          badgeHtml = `<span class="member-badge admin-badge"><i class="fas fa-shield-alt"></i> ${adminText}</span>`;
        }

        return `
          <div class="member-item ${isSelected ? "selected" : ""} ${isCreator ? "creator-member" : ""} ${isAdmin ? "admin-member" : ""}" data-user-id="${userId}">
            ${avatarHtml}
            ${placeholderHtml}
            <div class="member-info">
              <div class="member-name-row">
                <div class="member-name">${name}</div>
              </div>
              <div class="member-id">ID: ${userId}</div>
            </div>
            <div class="member-actions">
              ${badgeHtml}
              <input 
                type="checkbox" 
                class="member-checkbox" 
                ${isSelected ? "checked" : ""}
                data-user-id="${userId}"
              />
            </div>
          </div>
        `;
      })
      .join("");

    document.querySelectorAll(".member-checkbox").forEach((checkbox) => {
      checkbox.addEventListener("change", (e) => {
        const userId = e.target.getAttribute("data-user-id");
        const member = allMembers.find((m) => m.id === userId);
        if (member) {
          member._selected = e.target.checked;
          if (e.target.checked) {
            selectedMembers.add(userId);
          } else {
            selectedMembers.delete(userId);
          }
          const memberItem = e.target.closest(".member-item");
          if (memberItem) {
            memberItem.classList.toggle("selected", e.target.checked);
          }
          updateSelectedCount();
        }
      });
    });

    // Make member items clickable to toggle selection
    document.querySelectorAll(".member-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        // Don't toggle if clicking on checkbox directly
        if (e.target.type === "checkbox" || e.target.closest(".member-checkbox")) {
          return;
        }
        const checkbox = item.querySelector(".member-checkbox");
        if (checkbox) {
          checkbox.checked = !checkbox.checked;
          checkbox.dispatchEvent(new Event("change"));
        }
      });
    });
  }

  function getFileIconByExt(filename) {
    const ext = (filename.split(".").pop() || "").toLowerCase();
    if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(ext))
      return { type: "fa", icon: "far fa-file-image" };
    if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext))
      return { type: "fa", icon: "far fa-file-video" };
    return { type: "fa", icon: "far fa-file" };
  }

  function truncateName(name, max) {
    const s = String(name || "");
    return s.length > max ? s.slice(0, max) + "..." : s;
  }

  function updateFileListPrivate() {
    if (!fileInput || !fileList) return;

    const current = Array.from(fileList.querySelectorAll(".attachment-item"))
      .map((el) => el.getAttribute("data-name"));

    Array.from(fileInput.files).forEach((file) => {
      if (current.includes(file.name)) return;

      const item = document.createElement("div");
      item.className = "attachment-item";
      item.setAttribute("data-name", file.name);

      const icon = getFileIconByExt(file.name);
      const iconHtml = `<i class="attachment-icon ${icon.icon}"></i>`;

      item.innerHTML = `
        ${iconHtml}
        <div class="attachment-name" title="${file.name}">
          ${truncateName(file.name, 12)}
        </div>
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
        updateSelectedCount();
      };
    });

    updateSelectedCount();
  }

  if (fileInput) {
    fileInput.addEventListener("change", updateFileListPrivate);
  }

  async function uploadAttachmentsIfNeeded() {
    if (!fileInput || fileInput.files.length === 0) return false;

    const formData = new FormData();
    Array.from(fileInput.files).forEach((file) => {
      formData.append("files", file);
    });

    const res = await fetch("/upload", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      throw new Error("Upload thất bại");
    }
    return true;
  }

  function extractVideoUrl(text) {
    if (!text) return null;
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const candidates = text.match(urlRegex) || [];
    const videoExt = [".mp4", ".mov", ".avi", ".mkv", ".webm"];
    for (const url of candidates) {
      const lower = url.toLowerCase();
      if (videoExt.some(ext => lower.includes(ext))) {
        return url;
      }
    }
    return null;
  }

  if (prevPageBtn) {
    prevPageBtn.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage--;
        renderMembers();
        updatePagination();
        membersList.scrollTop = 0;
      }
    });
  }

  if (nextPageBtn) {
    nextPageBtn.addEventListener("click", () => {
      const totalPages = Math.ceil(filteredMembers.length / membersPerPage);
      if (currentPage < totalPages) {
        currentPage++;
        renderMembers();
        updatePagination();
        membersList.scrollTop = 0;
      }
    });
  }

  function updateSelectedCount() {
    const count = Array.from(selectedMembers).length;
    selectedCount.textContent = `Đã chọn: ${count}`;

    const hasMessage = !!messageContent.value.trim();
    const hasAttachments = fileInput && fileInput.files && fileInput.files.length > 0;

    sendSelectedBtn.disabled = count === 0 || (!hasMessage && !hasAttachments);
  }

  messageContent.addEventListener("input", () => {
    updateSelectedCount();
  });

  sendSelectedBtn.addEventListener("click", async () => {
    if (!currentBotId) {
      showPopupNotification("Lỗi", "Vui lòng chọn bot trước khi gửi tin nhắn");
      return;
    }

    const message = messageContent.value.trim();
    const hasAttachments = fileInput && fileInput.files && fileInput.files.length > 0;
    if (!message && !hasAttachments) {
      showPopupNotification("Lỗi", "Vui lòng nhập nội dung hoặc chọn file đính kèm");
      return;
    }

    const selectedIds = Array.from(selectedMembers);
    if (selectedIds.length === 0) {
      showPopupNotification("Lỗi", "Vui lòng chọn ít nhất một thành viên");
      return;
    }

    const confirmed = await showConfirmDialog(
      "Xác nhận gửi tin nhắn",
      `Bạn có chắc muốn gửi tin nhắn cho ${selectedIds.length} người đã chọn?`
    );

    if (!confirmed) return;

    sendSelectedBtn.disabled = true;
    sendSelectedBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang gửi...';

    let successCount = 0;
    let failCount = 0;

    if (hasAttachments) {
      try {
        await uploadAttachmentsIfNeeded();
      } catch (error) {
        showPopupNotification("Lỗi", "Không thể tải tệp lên. Vui lòng thử lại.");
        sendSelectedBtn.disabled = false;
        sendSelectedBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Gửi cho người đã chọn';
        return;
      }
    }

    for (const userId of selectedIds) {
      try {
        const videoUrl = extractVideoUrl(message);

        socket.emit("sendPrivateMessage", {
          botId: currentBotId,
          userId: userId,
          message: message,
          groupId: currentGroupId,
          videoUrl,
        });

        await new Promise((resolve) => setTimeout(resolve, 500));
        successCount++;
      } catch (error) {
        console.error(`Lỗi khi gửi tin nhắn cho ${userId}:`, error);
        failCount++;
      }
    }

    setTimeout(() => {
      showPopupNotification(
        "Hoàn thành",
        `Đã gửi tin nhắn: ${successCount} thành công, ${failCount} thất bại`
      );
      sendSelectedBtn.disabled = false;
      sendSelectedBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Gửi cho người đã chọn';
    }, 1000);
  });

  socket.on("privateMessageSent", (data) => {
    if (data.success) {
      console.log(`Đã gửi tin nhắn cho ${data.userId}`);
    }
  });

  function resetGroupData() {
    allMembers = [];
    filteredMembers = [];
    selectedMembers.clear();
    currentGroupId = null;
    currentGroupName = "";
    currentGroupType = 1;
    if (groupInfo) groupInfo.style.display = "none";
    membersList.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><p>Chưa có thành viên nào. Vui lòng quét thành viên từ nhóm.</p></div>';
    updateSelectedCount();
  }

  function showPopupNotification(title, message) {
    const popup = document.getElementById("popupNotification");
    const popupTitle = document.getElementById("popupTitle");
    const popupMessage = document.getElementById("popupMessage");

    popupTitle.textContent = title;
    popupMessage.textContent = message;
    popup.style.display = "flex";

    const closeBtn = document.getElementById("closePopupNotification");
    closeBtn.onclick = () => {
      popup.style.display = "none";
    };

    window.onclick = (e) => {
      if (e.target === popup) {
        popup.style.display = "none";
      }
    };
  }

  function showConfirmDialog(title, message) {
    return new Promise((resolve) => {
      const dialog = document.getElementById("confirmDialog");
      const confirmTitle = document.getElementById("confirmTitle");
      const confirmMessage = document.getElementById("confirmMessage");
      const confirmYes = document.getElementById("confirmYes");
      const confirmNo = document.getElementById("confirmNo");

      confirmTitle.textContent = title;
      confirmMessage.textContent = message;
      dialog.style.display = "flex";

      const handleYes = () => {
        dialog.style.display = "none";
        confirmYes.removeEventListener("click", handleYes);
        confirmNo.removeEventListener("click", handleNo);
        resolve(true);
      };

      const handleNo = () => {
        dialog.style.display = "none";
        confirmYes.removeEventListener("click", handleYes);
        confirmNo.removeEventListener("click", handleNo);
        resolve(false);
      };

      confirmYes.addEventListener("click", handleYes);
      confirmNo.addEventListener("click", handleNo);

      window.onclick = (e) => {
        if (e.target === dialog) {
          handleNo();
        }
      };
    });
  }
});

