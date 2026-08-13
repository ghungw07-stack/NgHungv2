import fs from "fs";
import path from "path";
import { MessageMention, MessageType, Zalo, ZaloApiError } from "../api-zalo/index.js";
import { encodeAES, handleZaloResponse, makeURL, decodeAES } from "../api-zalo/utils.js";
import { getUserInfoData } from "../service-dqt/info-service/user-info.js";
import { getGroupInfoData } from "../service-dqt/info-service/group-info.js";
import * as cv from "../utils/canvas/index.js";
import { deleteFile } from "../utils/util.js";
import { getGlobalPrefix } from "../service-dqt/service.js";
import { sendMessageWarning } from "../service-dqt/chat-zalo/chat-style/chat-style.js";

// Thêm map để theo dõi hành vi tag
const tagBehaviorMap = new Map();

// Thêm hàm kiểm tra và xử lý hành vi tag
function checkTagBehavior(senderId, mentionsCount, threadId) {
  const now = Date.now();
  if (!tagBehaviorMap.has(senderId)) {
    tagBehaviorMap.set(senderId, {
      count: 1,
      timestamps: [now],
      threadId: threadId,
    });
    return false;
  }

  const userData = tagBehaviorMap.get(senderId);
  const tenSecondsAgo = now - 30000; // 30 giây tính bằng milliseconds

  // Lọc bỏ các timestamps cũ hơn 30 giây
  userData.timestamps = userData.timestamps.filter((time) => time > tenSecondsAgo);
  userData.timestamps.push(now);
  userData.count = userData.timestamps.length;

  // Kiểm tra vi phạm: 2 lần tag trong 10 giây và mỗi lần > 3 người
  if (userData.count >= 2 && mentionsCount > 3) {
    tagBehaviorMap.delete(senderId); // Reset sau khi phát hiện vi phạm
    return true;
  }

  return false;
}

export async function superCheckBox(api, message, isSelf, botIsAdminBox, isAdminBox) {
  if (isSelf || isAdminBox || !botIsAdminBox) return false;
  const threadId = message.threadId;
  const senderName = message.data.dName;
  const senderId = message.data.uidFrom;
  const mentionsCount = message.data?.mentions?.length || 0;

  if (mentionsCount > 3) {
    const shouldKick = checkTagBehavior(senderId, mentionsCount, threadId);
    if (shouldKick && botIsAdminBox && !isAdminBox) {
      try {
        await api.blockUsers(threadId, [senderId]);
        await sendMessageWarning(api, message, `Tag Nhiều À, Cút!.`, true, 86400000);
        return true;
      } catch {}
    } else {
    }
  }
  return false;
}

export async function testFutureGroup(api, message, groupInfo) {
  const threadId = message.threadId;
  const content = message.data.content;
  const idBot = api.getBotId();
  try {
    await handleEncryptedMessage(api, message, threadId);
    // const sentCount = await sendFriendRequestToGroupMembers(api, groupInfo, idBot, message);
  } catch (error) {
    // await api.sendMessage(
    //   {
    //     msg: error.message,
    //     quote: message,
    //   },
    //   threadId,
    //   message.type
    // );
  }
}

export async function testFutureUser(api, message, aliasCommand) {
  const threadId = message.threadId;
  try {
    const prefix = getGlobalPrefix(api.getBotId());
    const rawContent = typeof message.data.content === "string" ? message.data.content : "";
    const testType = rawContent.replace(prefix + aliasCommand, "").trim().toLowerCase();
    if (testType === "welcome" || testType === "bye" || testType === "goodbye") {
      if (message.type !== MessageType.GroupMessage) {
        await api.sendMessage({ msg: "❌ Lệnh test welcome/bye chỉ dùng trong nhóm.", quote: message }, threadId, message.type);
        return true;
      }
      let imagePath;
      try {
        const senderId = message.data.uidFrom;
        const [userInfo, groupInfo] = await Promise.all([
          getUserInfoData(api, senderId),
          getGroupInfoData(api, threadId),
        ]);
        const groupName = groupInfo?.name || "Nhóm Zalo";
        const groupType = groupInfo?.type || groupInfo?.groupType || 1;
        imagePath = testType === "welcome"
          ? await cv.createWelcomeImage(userInfo, groupName, groupType, message.data.dName || userInfo.name, false, api.getBotId())
          : await cv.createGoodbyeImage(userInfo, groupName, groupType, false, api.getBotId());
        await api.sendMessage({
          msg: testType === "welcome" ? "🧪 Test ảnh welcome" : "🧪 Test ảnh bye",
          attachments: [imagePath],
          quote: message,
          ttl: 600000,
          isUseProphylactic: true,
        }, threadId, message.type);
      } finally {
        if (imagePath) await deleteFile(imagePath);
      }
      return true;
    }
    try {
      await handleEncryptedMessage(api, message, threadId, aliasCommand);
    } catch {}
    // const msgReply = {
    //   timestampString: "09:42:02",
    //   isUndo: false,
    //   threadId: "1171582602751471930",
    //   type: 1,
    //   timestamp: "1745808122234",
    //   actionId: "10200418221676",
    //   msgId: "6549006635208",
    //   cliMsgId: "1745808122152",
    //   msgType: "webchat",
    //   uidFrom: "497039123762331805",
    //   idTo: "1171582602751471930",
    //   dName: "Nguyễn Tấn Tài",
    //   ts: "1745808122234",
    //   status: 1,
    //   content: "Tao Gay",
    //   notify: "1",
    //   ttl: 0,
    //   userId: "0",
    //   uin: "0",
    //   topOut: "0",
    //   topOutTimeOut: "0",
    //   topOutImprTimeOut: "0",
    //   propertyExt: {
    //     color: -1,
    //     size: -1,
    //     type: -1,
    //     subType: 0,
    //     ext: '{"sSrcType":-1,"sSrcStr":"","msg_warning_type":0,"emoji":{"content":0,"num":0,"uniq":0,"first":"","last":"","most":"","text":1}}',
    //   },
    //   paramsExt: {
    //     countUnread: 1,
    //     containType: 0,
    //     platformType: 0,
    //   },
    //   cmd: 521,
    //   st: 3,
    //   at: 0,
    //   realMsgId: "0",
    // };
    // msgReply.data = { ...msgReply };
    // const msgSend = `${msgReply.dName} Gay`;
    // const mention = MessageMention(msgReply.uidFrom, msgReply.dName.length, 0);
    // await api.sendMessage(
    //   {
    //     msg: msgSend,
    //     quote: msgReply,
    //     mentions: [mention],
    //   },
    //   msgReply.threadId,
    //   msgReply.type
    // );
    // await handleTestMessage(api, message, threadId, aliasCommand);
    return true;
  } catch (error) {
    // await api.sendMessage(
    //   {
    //     msg: error.message,
    //     quote: message,
    //   },
    //   threadId,
    //   message.type
    // );
    return false;
  }
}

export async function canvasTest(api, message, senderId, senderName, nameGroup, groupInfo) {
  const threadId = message.threadId;
  const userInfo = await getUserInfoData(api, senderId);
  const userActionName = senderName;
  let imagePath;
  imagePath = await cv.createWelcomeImage(userInfo, nameGroup, groupInfo.type, userActionName, false, api.getBotId());
  await api.sendMessage(
    {
      msg: ``,
      attachments: [imagePath],
      isUseProphylactic: true,
    },
    threadId,
    message.type
  );
  await deleteFile(imagePath);
  // imagePath = await cv.createKickImage(userInfo, nameGroup, groupInfo.type, userInfo.genderId, userActionName, false);
  // await api.sendMessage(
  //   {
  //     msg: ``,
  //     attachments: [imagePath],
  //   },
  //   threadId,
  //   message.type
  // );
  // await deleteFile(imagePath);
  // imagePath = await cv.createGoodbyeImage(userInfo, nameGroup, groupInfo.type, false);
  // await api.sendMessage(
  //   {
  //     msg: ``,
  //     attachments: [imagePath],
  //   },
  //   threadId,
  //   message.type
  // );
  // await deleteFile(imagePath);
  // imagePath = await cv.createBlockImage(userInfo, nameGroup, groupInfo.type, userInfo.genderId, userActionName, false);
  // await api.sendMessage(
  //   {
  //     msg: ``,
  //     attachments: [imagePath],
  //   },
  //   threadId,
  //   message.type
  // );
  // await deleteFile(imagePath);
  // imagePath = await cv.createBlockSpamImage(userInfo, nameGroup, groupInfo.type, userInfo.genderId);
  // await api.sendMessage(
  //   {
  //     msg: ``,
  //     attachments: [imagePath],
  //   },
  //   threadId,
  //   message.type
  // );
  // await deleteFile(imagePath);
  // imagePath = await cv.createBlockSpamLinkImage(userInfo, nameGroup, groupInfo.type, userInfo.genderId);
  // await api.sendMessage(
  //   {
  //     msg: ``,
  //     attachments: [imagePath],
  //   },
  //   threadId,
  //   message.type
  // );
  // await deleteFile(imagePath);
}

async function handleEncryptedMessage(api, message, threadId, aliasCommand) {
  const isPlainText = typeof message.data.content === "string";
  if (!isPlainText) return;
  let contentOriginal = message.data.content;
  let prefix = getGlobalPrefix(api.getBotId());
  contentOriginal = contentOriginal.replace(`${prefix + aliasCommand} `, "").trim();
  // contentOriginal = "";
  const decryptParams = decodeAES(api.appContext.secretKey, contentOriginal);
  const params = JSON.parse(decryptParams);
  const content = JSON.stringify(params);

  if (content && content !== "null") {
    await api.sendMessage(
      {
        msg: content,
        quote: message,
      },
      threadId,
      message.type
    );
  }
}

async function handleTestMessage(api, message, threadId, aliasCommand) {
  const isPlainText = typeof message.data.content === "string";
  if (!isPlainText) return;
  let contentOriginal = message.data.content;
  let prefix = getGlobalPrefix(api.getBotId());
  contentOriginal = contentOriginal.replace(`${prefix + aliasCommand} `, "");
  // const contentOriginal = "";
  const decryptParams = await api.searchGif(contentOriginal);
  const params = JSON.parse(decryptParams);
  const content = JSON.stringify(params);

  if (content && content !== "null") {
    await api.sendMessage(
      {
        msg: content,
        quote: message,
      },
      threadId,
      message.type
    );
  }
}

function encodeBase64Unicode(input) {
  return btoa(unescape(encodeURIComponent(input)));
}

function decodeBase64Unicode(encoded) {
  return decodeURIComponent(escape(atob(encoded)));
}

async function sendFriendRequestToGroupMembers(api, groupInfo, idBot, message) {
  let count = 0;
  const threadId = message.threadId;

  // Tạo mảng chứa toàn bộ id từ groupInfo.memVerList và loại bỏ '_0' ở cuối
  const memberIds = groupInfo.memVerList.map((member) => member.replace(/_0$/, ""));

  // Lặp qua từng id và gửi yêu cầu kết bạn
  for (const id of memberIds) {
    if (id == idBot) continue;
    try {
      await api.sendFriendRequest(id, "Xin Chào, Mình quen biết bạn qua nhóm chung, xin phép được kết bạn nhé");
      console.log(`Đã gửi yêu cầu kết bạn đến ${id}`);
      count++;
    } catch (error) {
      console.error(`Lỗi khi gửi yêu cầu kết bạn đến ${id}:`, error.message);
    }
  }

  // Gửi thông báo kết quả
  await api.sendMessage(
    {
      msg: `Đã gửi yêu cầu kết bạn đến ${count}/${memberIds.length - 1} thành viên trong nhóm ${groupInfo.name}`,
      quote: message,
    },
    threadId,
    message.type
  );

  return count;
}

export function checkIsValidContext(content) {
  // const checkEncContext = encodeBase64Unicode(content);
  // if (checkEncContext === "Ym90IGJ5IG5kcSBraWxsZXI=") {
  //   return true;
  // };
  // return false;
}
