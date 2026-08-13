const TYPE = { JOIN: 1, LEAVE: 2, REMOVE_MEMBER: 3, UPDATE_SETTING: 5, UPDATE: 6, ADD_ADMIN: 8, REMOVE_ADMIN: 9 };

const SETTING_LABELS = {
  lockSendMsg: "Khóa chat",
  joinAppr: "Duyệt thành viên",
  showMember: "Hiện danh sách thành viên",
  setTopicOnly: "Chỉ quản trị viên đổi ghi chú",
  enableMsgHistory: "Lịch sử tin nhắn",
  lockViewMember: "Khóa xem thành viên",
};

function enabledText(value) {
  if (value === true || value === 1 || value === "1") return "Bật";
  if (value === false || value === 0 || value === "0") return "Tắt";
  return String(value);
}

function render(template, { user, group, member }) {
  return String(template)
    .replaceAll("{user}", user)
    .replaceAll("{group}", group)
    .replaceAll("{member}", member == null ? "?" : String(member));
}

async function memberCount(client, threadId) {
  try {
    const result = await client.api.getGroupInfo(threadId);
    const group = result?.gridInfoMap?.[threadId] || result?.data?.gridInfoMap?.[threadId];
    return group?.totalMember ?? group?.memVerList?.length;
  } catch { return undefined; }
}

export function registerGroupEvents(eventBus, { client, settings }) {
  return eventBus.on("group_event", "group-notifications", async ({ group_event: event }) => {
    const threadId = String(event.threadId);
    const config = await settings.get(threadId);
    const data = event.data || {};
    const group = data.groupName || "nhóm";

    if (config.updateGroup && event.type === TYPE.UPDATE) {
      await client.sendText(threadId, 1, `📢 Nhóm “${group}” vừa được cập nhật thông tin.`);
      return;
    }
    if (config.updateGroup && event.type === TYPE.UPDATE_SETTING) {
      const next = data.groupSetting || {};
      const previous = config.updateGroupSnapshot || {};
      const changed = Object.keys(next).filter((key) => JSON.stringify(next[key]) !== JSON.stringify(previous[key]));
      const lines = changed.length
        ? changed.map((key) => `• ${SETTING_LABELS[key] || key}: ${enabledText(next[key])}`)
        : ["• Cài đặt nhóm đã thay đổi"];
      await client.sendText(threadId, 1, `📢 Cập nhật cài đặt nhóm:\n${lines.join("\n")}`);
      await settings.patch(threadId, { updateGroupSnapshot: { ...previous, ...next } });
      return;
    }

    const members = data.updateMembers || [];
    if (!members.length) return;
    const count = await memberCount(client, threadId);
    for (const member of members) {
      const name = member.dName || member.name || String(member.id || member);
      if (event.type === TYPE.JOIN && config.welcomeGroup) {
        await client.sendText(threadId, 1, render(config.welcomeMessage || "Chào mừng {user} đến với {group}!", { user: `@${name}`, group, member: count }));
      } else if ([TYPE.LEAVE, TYPE.REMOVE_MEMBER].includes(event.type) && config.byeGroup) {
        await client.sendText(threadId, 1, render(config.leaveMessage || "Tạm biệt {user}.", { user: `@${name}`, group, member: count }));
      } else if (config.updateGroup && [TYPE.ADD_ADMIN, TYPE.REMOVE_ADMIN].includes(event.type)) {
        await client.sendText(threadId, 1, `📢 ${name} vừa được ${event.type === TYPE.ADD_ADMIN ? "thêm làm" : "gỡ khỏi vị trí"} quản trị viên.`);
      }
    }
  }, { priority: 200 });
}

export { render as renderGroupEventMessage };
