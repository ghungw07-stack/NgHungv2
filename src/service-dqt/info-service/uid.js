function getMentionName(message, mention) {
  const content = message.data?.content;
  if (typeof content !== "string" || !mention) return "";

  const position = Number(mention.pos);
  const length = Number(mention.len);
  if (!Number.isInteger(position) || !Number.isInteger(length) || length <= 0) return "";

  return content.slice(position, position + length).replace(/^@/, "").trim();
}

function getProfileName(profile) {
  return profile?.displayName || profile?.zaloName || profile?.name || "";
}

export async function handleUidCommand(api, message) {
  const mention = message.data?.mentions?.[0];
  const targetUserId = String(mention?.uid || message.data?.uidFrom || "");
  const threadId = String(message.threadId || message.data?.idTo || "");

  let targetName = mention ? getMentionName(message, mention) : message.data?.dName || "";

  try {
    const response = await api.getInfoMembers([targetUserId]);
    targetName = getProfileName(response?.profiles?.[targetUserId]) || targetName;
  } catch (error) {
    // Tên có sẵn trong tin nhắn vẫn đủ để trả UID khi API hồ sơ tạm thời lỗi.
    console.warn(`[uid] Không lấy được hồ sơ ${targetUserId}:`, error?.message || error);
  }

  const result = `Tên: ${targetName || "Không xác định"}\nUID: ${targetUserId}\nGroupID: ${threadId}`;
  await api.sendMessage({ msg: result, ttl: 6000000 }, message.threadId, message.type);
}
