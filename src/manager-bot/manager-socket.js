import { apiManager, getApiManagerWithOwner, getGlobalApi, setupBotListeners } from "../index.js";
import { getUsersInfoBasic } from "../service-dqt/info-service/user-info.js";
import { formatMiliseconds } from "../utils/format-util.js";
import { getCachedFriends, getCachedGroups } from "../web-service/web-server.js";
import { getBotChildrenStore, getDataBotChildren, shutdownBotByOwnerId, startBotChildren } from "./index.js";

class ManagerBotSocket {
  constructor() {
    this.dataBot = () => getDataBotChildren();
    this.cachedGroups = () => getCachedGroups();
    this.cachedFriends = () => getCachedFriends();
    this.botChildrenStore = getBotChildrenStore();
  }

  async createBotListForWeb() {
    const apiGlobal = getGlobalApi();
    const bots = [];
    const listIdsActiveBot = [];

    const listOwnerIds = Object.keys(this.botChildrenStore.getAll());
    let infoListBotActive = {};
    try {
      infoListBotActive = (await getUsersInfoBasic(apiGlobal, listOwnerIds)) || {};
    } catch (error) {}

    for (const [id, apiMng] of Object.entries(apiManager.apiManagerObject)) {
      const botData = this.botChildrenStore.findBotWithId(id);
      if (infoListBotActive && botData && botData.ownerId && infoListBotActive[botData.ownerId])
        apiMng.ownerData = infoListBotActive[botData.ownerId];
      bots.push(this.returnDataBotInfo(apiMng, botData));
      listIdsActiveBot.push(id);
    }

    const inactiveBots = Object.entries(this.botChildrenStore.getAll())
      .filter(([_, bot]) => (bot.idBot && !listIdsActiveBot.includes(bot.idBot)) || !bot.idBot)
      .reduce((acc, [id, bot]) => {
        acc[id] = bot;
        return acc;
      }, {});

    for (const [id, botData] of Object.entries(inactiveBots)) {
      const ownerInfo = infoListBotActive[id] || {};
      bots.push(
        this.returnDataBotInfo(
          {
            apiZalo: {
              accountInfo: {
                name: botData.nameBot || botData.infoOwner?.name || ownerInfo.displayName || botData.createdBy || id,
                avatar: botData.avatarBot || ownerInfo.avatar || ownerInfo.avatarFull || null,
                uid: botData.idBot || id,
                phone: botData.numberPhone || "Khởi chạy bot để hiển thị",
              },
            },
            isMainBot: false,
            timeStart: 0,
          },
          botData
        )
      );
    }

    return bots;
  }

  getABotInfo(idBot) {
    const apiMngBot = apiManager.apiManagerObject[idBot];
    if (!apiMngBot) return null;
    const botData = this.botChildrenStore.findBotWithId(idBot) || {};
    return this.returnDataBotInfo(apiMngBot, botData);
  }

  returnDataBotInfo(apiManager, botData) {
    const api = apiManager.apiZalo;
    const accountInfo = api.accountInfo;
    const idBot = accountInfo.uid;
    return {
      id: idBot,
      info: accountInfo,
      name: accountInfo.name,
      avatar: accountInfo.avatar,
      ownerData: apiManager.ownerData || null,
      botData: apiManager.isMainBot ? null : botData,
      timeRemaining: apiManager.isMainBot ? -1 : botData?.timeRemaining || 0,
      timeExpired: apiManager.isMainBot ? Date.now() + 1000 * 60 * 60 : botData?.timeRemaining + Date.now() || 0,
      status: apiManager.isMainBot ? "active" : botData.status,
      isMainBot: apiManager.isMainBot,
      timeStart: apiManager.timeStart || null,
      groupCount: this.cachedGroups()[idBot]?.length || "Loading...",
      friendCount: this.cachedFriends()[idBot]?.length || "Loading...",
      messageCount: 0,
    };
  }

  async startBot(ownerId) {
    const dataBotStart = this.botChildrenStore.get(ownerId);
    if (!dataBotStart) return { success: false, message: "Bot không tồn tại" };

    if (dataBotStart.status === "pending") return { success: false, message: "Bot chưa được phê duyệt" };

    if (dataBotStart.timeRemaining !== -1 && dataBotStart.timeRemaining <= 1000)
      return { success: false, message: "Bot đã hết hạn, hãy tăng thêm thời gian để khởi chạy bot" };

    if (getApiManagerWithOwner(ownerId)) return { success: false, message: "Bot đang được khởi chạy" };

    try {
      const { apiBot } = await startBotChildren(getGlobalApi(), dataBotStart.ownerId);
      return {
        success: true,
        message:
          `Khởi động lại bot thành công!` +
          `\nTài khoản hoạt động: ${apiBot.accountInfo.name}` +
          `\nID tài khoản: ${apiBot.getBotId() || ownerId}`,
      };
    } catch (error) {
      return { success: false, message: "Có lỗi xảy ra khi khởi chạy bot: " + error.message };
    }
  }

  async stopBot(idBot) {
    const dataBotStop = this.botChildrenStore.findBotWithId(idBot);
    if (!dataBotStop) return { success: false, message: "Bot không tồn tại" };
    const apiManager = getApiManagerWithOwner(dataBotStop.ownerId);
    if (!apiManager) return { success: false, message: "Bot chưa được khởi chạy" };
    try {
      const msg = `Đã tắt bot ${apiManager.apiZalo.accountInfo.name} thành công!`;
      await shutdownBotByOwnerId(dataBotStop.ownerId);
      return { success: true, message: msg };
    } catch (error) {
      return { success: false, message: "Có lỗi xảy ra khi tắt bot: " + error.message };
    }
  }

  async restartBot(idBot) {
    try {
      const apiGlobal = getGlobalApi();
      const isMainBot = apiGlobal.getBotId() === idBot;
      if (isMainBot) {
        apiGlobal.listener.stop();
        await new Promise((resolve) => setTimeout(resolve, 1000));
        setupBotListeners(apiGlobal);
        return { success: true, message: `Khởi động lại [Bot Leader] ${apiGlobal.accountInfo.name} thành công!` };
      } else {
        const dataBotRestart = this.botChildrenStore.findBotWithId(idBot);
        if (!dataBotRestart) return { success: false, message: "Bot không tồn tại" };
        const apiManager = getApiManagerWithOwner(dataBotRestart.ownerId);
        if (!apiManager) return { success: false, message: "Bot chưa được khởi chạy" };
        await shutdownBotByOwnerId(dataBotRestart.ownerId);
        await new Promise((resolve) => setTimeout(resolve, 3000));
        await this.startBot(dataBotRestart.ownerId);
        return { success: true, message: `Khởi động lại bot ${dataBotRestart.nameBot || idBot} thành công!` };
      }
    } catch (error) {
      return { success: false, message: "Có lỗi xảy ra khi khởi động lại bot: " + error.message };
    }
  }

  async approveBot(ownerId, value) {
    try {
      const apiGlobal = getGlobalApi();
      const milisecond = value * 1000;
      const dataBotApprove = this.botChildrenStore.get(ownerId);
      if (!dataBotApprove) return { success: false, message: "Bot không tồn tại" };
      dataBotApprove.timeRemaining = milisecond;
      dataBotApprove.approvedAt = Date.now();
      dataBotApprove.approvedBy = apiGlobal.getBotId();
      dataBotApprove.status = "inactive";
      delete dataBotApprove.rejectAt;
      delete dataBotApprove.rejectBy;
      this.botChildrenStore.markDirty();
      const nameBot = `${dataBotApprove.createdBy || ownerId} ${
        dataBotApprove.nameBot ? `- [${dataBotApprove.nameBot}]` : ""
      }`;
      return {
        success: true,
        message: `Đã phê duyệt bot ${nameBot} thành công, thời hạn sử dụng: ${formatMiliseconds(milisecond)}!`,
      };
    } catch (error) {
      return { success: false, message: "Có lỗi xảy ra khi phê duyệt bot: " + error.message };
    }
  }

  async rejectBot(ownerId) {
    try {
      const apiGlobal = getGlobalApi();
      const dataBotReject = this.botChildrenStore.get(ownerId);
      if (!dataBotReject) return { success: false, message: "Bot không tồn tại" };
      dataBotReject.status = "reject";
      dataBotReject.timeRemaining = 0;
      dataBotReject.rejectAt = Date.now();
      dataBotReject.rejectBy = apiGlobal.getBotId();
      delete dataBotReject.approvedAt;
      delete dataBotReject.approvedBy;
      this.botChildrenStore.markDirty();
      const nameBot = `${dataBotReject.createdBy || ownerId} ${
        dataBotReject.nameBot ? `- [${dataBotReject.nameBot}]` : ""
      }`;
      return {
        success: true,
        message: `Đã từ chối bot ${nameBot} thành công!`,
      };
    } catch (error) {
      return { success: false, message: "Có lỗi xảy ra khi từ chối bot: " + error.message };
    }
  }

  async addTimeBot(ownerId, value) {
    try {
      const milisecond = value * 1000;
      const dataBotAddTime = this.botChildrenStore.get(ownerId);
      if (!dataBotAddTime) return { success: false, message: "Bot không tồn tại" };
      dataBotAddTime.timeRemaining += milisecond;
      this.botChildrenStore.markDirty();
      const nameBot = `${dataBotAddTime.createdBy || ownerId} ${
        dataBotAddTime.nameBot ? `- [${dataBotAddTime.nameBot}]` : ""
      }`;
      return {
        success: true,
        message: `Đã thêm ${formatMiliseconds(milisecond)} cho bot ${nameBot} thành công!`,
      };
    } catch (error) {
      return { success: false, message: "Có lỗi xảy ra khi thêm thời gian cho bot: " + error.message };
    }
  }

  async subTimeBot(ownerId, value) {
    try {
      const milisecond = value * 1000;
      const dataBotSubTime = this.botChildrenStore.get(ownerId);
      if (!dataBotSubTime) return { success: false, message: "Bot không tồn tại" };
      dataBotSubTime.timeRemaining -= milisecond;
      this.botChildrenStore.markDirty();
      const nameBot = `${dataBotSubTime.createdBy || ownerId} ${
        dataBotSubTime.nameBot ? `- [${dataBotSubTime.nameBot}]` : ""
      }`;
      return {
        success: true,
        message: `Đã trừ ${formatMiliseconds(milisecond)} của bot ${nameBot} thành công!`,
      };
    } catch (error) {
      return { success: false, message: "Có lỗi xảy ra khi trừ thời gian của bot: " + error.message };
    }
  }

  async setTimeBot(ownerId, value) {
    try {
      const milisecond = value !== -1 ? value * 1000 : value;
      const dataBotSetTime = this.botChildrenStore.get(ownerId);
      if (!dataBotSetTime) return { success: false, message: "Bot không tồn tại" };
      dataBotSetTime.timeRemaining = milisecond;
      this.botChildrenStore.markDirty();
      const nameBot = `${dataBotSetTime.createdBy || ownerId} ${
        dataBotSetTime.nameBot ? `- [${dataBotSetTime.nameBot}]` : ""
      }`;
      return {
        success: true,
        message: `Đã set thời gian cho bot ${nameBot} thành công, thời hạn sử dụng: ${
          value !== -1 ? formatMiliseconds(milisecond) : "vô thời hạn"
        }!`,
      };
    } catch (error) {
      return { success: false, message: "Có lỗi xảy ra khi set thời gian cho bot: " + error.message };
    }
  }

  async removeBot(ownerId) {
    try {
      const dataBotRemove = this.botChildrenStore.get(ownerId);
      if (!dataBotRemove) return { success: false, message: "Bot không tồn tại" };
      const nameBot = `${dataBotRemove.createdBy || ownerId} ${
        dataBotRemove.nameBot ? `- [${dataBotRemove.nameBot}]` : ""
      }`;
      this.botChildrenStore.delete(ownerId);
      this.botChildrenStore.markDirty();
      return { success: true, message: `Đã xóa bot ${nameBot} thành công!` };
    } catch (error) {
      return { success: false, message: "Có lỗi xảy ra khi xóa bot: " + error.message };
    }
  }
}

export const managerBotSocket = new ManagerBotSocket();
