import { MessageType } from "../../src/api-zalo/index.js";
import { isAdmin } from "../../src/index.js";
import { getUserInfoBasic } from "../service-ngh/info-service/user-info.js";

export async function typingEvents(api, typingData) {
    const threadId = typingData.groupId || null;
    const isPC = typingData.isPC;
    const type = typingData.type === "gtyping" ? MessageType.GroupMessage : MessageType.DirectMessage;
    const userId = typingData.userId;
    const idBot = api.getBotId();
    const isAdminLevelHighest = isAdmin(idBot, userId);
    if (typingData.type === "gtyping") {
        if (!isAdminLevelHighest) {
            const userInfo = await getUserInfoBasic(api, userId);
            const nameUser = userInfo.zaloName;
            await api.sendMessage(
                { msg: `${nameUser} đang định nhắn gì đó bằng ${isPC ? "Máy Tính" : "Điện Thoại"}`, ttl: 5000 },
                threadId || userId,
                type
            );
        }
    }
}