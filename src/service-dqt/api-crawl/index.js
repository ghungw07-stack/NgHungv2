import { LRUCache } from "lru-cache";
import { handleSendTrackZingMp3 } from "./music-content/zingmp3.js";
import { removeMention } from "../../utils/format-util.js";
import { getMessageCache } from "../../utils/message-cache.js";
import { isAdmin } from "../../index.js";
import { handleSendTrackSoundCloud } from "./music-content/soundcloud.js";
import { handleSendTrackNhacCuaTui } from "./music-content/nhaccuatui.js";
import { handleSendTrackMixcloud } from "./music-content/mixcloud.js";
import { handleSendMediaYoutube } from "./youtube/youtube-service.js";
import { deleteFile } from "../../utils/util.js";
import { sendTikTokVideo } from "./tiktok/tiktok-service.js";
import { handleSendTemplateCapcut } from "./capcut/capcut-service.js";
import { processAndSendMedia } from "./api-download/aio-downlink.js";
import { PLATFORM_HH3D, processStageReply as processStageHH3DReply } from "./video-content/hh3dtq.js";
import { PLATFORM_LIEN_QUAN, processStageLienQuanReply } from "./content/info-lien-quan.js";
import { PLATFORM_LMHT, processStageLienMinhHuyenThoaiReply } from "./content/info-lmht.js";
import { PLATFORM_CLIPPHOT, processStageClipHot } from "./video-content/cliphot.js";
import { PLATFORM_MOTPHIM, processMotPhimStageReply } from "./video-content/mot-phim.js";
import { sendMessageWarningRequest } from "../chat-zalo/chat-style/chat-style.js";
import { PLATFORM_KHOPHIM, processKhoPhimStageReply } from "./video-content/kho-phim.js";
import { PLATFORM_NETTRUYEN, processNetTruyenStageReply } from "./image-content/nettruyen.js";
import { PLATFORM_CNOVEL, processCNovelTruyenChuStageReply } from "./content/cnovel-truyen-chu.js";
import { handleSendTrackSpotify } from "./music-content/spotify/spotify.js";
import { PLATFORM_TENOR, processSendTenorSticker } from "./image-content/tenor.js";
import { PLATFORM_TRUYEN_HENTAI, processTruyenHentaiStageReply } from "./image-content/hentai.js";
import { handleSendTruyenSexVLDetail } from "../../commands/send-all/truyensex.js";
import { findRecentMessages } from "../../commands/bot-manager/recent-message.js";

const TIME_TO_SELECT = 60000;
export const selectionsMapData = new LRUCache({
  max: 500,
  ttl: TIME_TO_SELECT,
});

export const getSelectionsMapData = () => selectionsMapData;
export function setSelectionsMapData(idUser, data) {
  deleteSelectionsMapData(idUser);
  selectionsMapData.set(idUser, { ...data });
}
export function deleteSelectionsMapData(idUser) {
  if (selectionsMapData.has(idUser)) {
    selectionsMapData.delete(idUser);
  }
}

// Cú pháp chọn nhanh: "từ khóa >>1" hoặc "từ khóa >>1 audio".
// Khi không có >>n, handler vẫn hiển thị canvas lựa chọn như bình thường.
export function parseQuickSelection(input) {
  const value = String(input || "").trim();
  const match = value.match(/^(.*?)\s*>>(\d+)(?:\s+(\S+))?\s*$/u);
  if (!match) return { query: value, selectedIndex: null, option: null };

  return {
    query: match[1].trim(),
    selectedIndex: Number(match[2]) - 1,
    option: match[3]?.trim() || null,
  };
}
function isArrayNumericOnly(array) {
  let arrTemp = array;
  if (!Array.isArray(array)) {
    arrTemp = Object.keys(array);
  }
  return arrTemp.every((item) => {
    if (typeof item === "number") {
      return true;
    }
    if (typeof item === "string") {
      return /^\d+$/.test(item) && (item === "0" || !/^0\d+/.test(item));
    }
    return false;
  });
}
export async function checkReplySelectionsMapData(api, message, isAdminLevelHighest) {
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  if (message.data?.quote) return false;
  if (selectionsMapData.has(senderId)) {
    const data = selectionsMapData.get(senderId);
    let selection = removeMention(message);
    let [selectedIndexRaw, ...subParts] = selection.trim().split(" ");
    let selectedIndex = parseInt(selectedIndexRaw) - 1;
    const subCommand = subParts.join(" ").trim();
    let media, selectionFinal;

    const arrNoneIndex = [
      PLATFORM_MOTPHIM,
      PLATFORM_HH3D,
      PLATFORM_KHOPHIM,
      PLATFORM_NETTRUYEN,
      PLATFORM_TRUYEN_HENTAI,
      PLATFORM_CNOVEL,
    ];
    const { collection, quotedMsgId, platform, stage } = data;
    const requiresValidation = !arrNoneIndex.includes(platform) || stage === 1;

    if (requiresValidation) {
      if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= collection.length) {
        return false;
      }
      media = collection[selectedIndex];
      selectionFinal = selectedIndex;
    } else {
      media = collection[selectedIndexRaw] || collection[selection];
      selectionFinal = selectedIndexRaw;
    }

    if (!media) return;

    deleteSelectionsMapData(senderId);
    const findQuotedMsg = await findRecentMessages(api, message, quotedMsgId);
    const msgDel = {
      type: message.type,
      threadId: message.threadId,
      data: { cliMsgId: findQuotedMsg?.cliMsgId || Date.now(), msgId: quotedMsgId, uidFrom: api.getBotId() },
    };
    try {
      await api.deleteMessage(msgDel, false);
    } catch {}
    await api.addReaction("CLOCK", message);

    switch (data.platform) {
      case "truyensexvl":
        return await handleSendTruyenSexVLDetail (api, message, media);      
      case "zingmp3":
        return await handleSendTrackZingMp3(api, message, media, subCommand);
      case "soundcloud":
        return await handleSendTrackSoundCloud(api, message, media);
      case "mixcloud":
        return await handleSendTrackMixcloud(api, message, media);
      case "spotify":
        return await handleSendTrackSpotify(api, message, media);
      case "nhaccuatui":
        return await handleSendTrackNhacCuaTui(api, message, media, subCommand);
      case "youtube":
        const videoPath = null;
        try {
          await handleSendMediaYoutube(api, message, media, subCommand || "default", videoPath, isAdminLevelHighest);
        } catch (error) {
          await api.addReaction("UNDO", message);
          await api.addReaction("TIEUTAN", message);
          await sendMessageWarningRequest(api, message, { caption: error }, 30000);
          if (videoPath) await deleteFile(videoPath);
        }
        return true;
      case "tiktok":
        return await sendTikTokVideo(api, message, media, false, subCommand || "540p");
      case "capcut":
        return await handleSendTemplateCapcut(api, message, media);
      case "downlink":
        let { uniqueId, mediaType, title, duration = 0, author } = data;
        await processAndSendMedia(api, message, {
          selectedMedia: media,
          mediaType,
          uniqueId,
          duration,
          title,
          author,
          senderId,
          senderName,
        });
        return true;
      case PLATFORM_LIEN_QUAN:
        return await processStageLienQuanReply(api, message, data, selectedIndex);
      case PLATFORM_LMHT:
        return await processStageLienMinhHuyenThoaiReply(api, message, data, selectedIndex);
      case PLATFORM_HH3D:
        return await processStageHH3DReply(api, message, data, selectionFinal);
      case PLATFORM_CLIPPHOT:
        return await processStageClipHot(api, message, data, selectionFinal);
      case PLATFORM_MOTPHIM:
        return await processMotPhimStageReply(api, message, data, selectionFinal);
      case PLATFORM_KHOPHIM:
        return await processKhoPhimStageReply(api, message, data, selectionFinal);
      case PLATFORM_NETTRUYEN:
        return await processNetTruyenStageReply(api, message, data, selectionFinal);
      case PLATFORM_TRUYEN_HENTAI:
        return await processTruyenHentaiStageReply(api, message, data, selectionFinal);
      case PLATFORM_CNOVEL:
        return await processCNovelTruyenChuStageReply(api, message, data, selectionFinal);
      case PLATFORM_TENOR:
        return await processSendTenorSticker(api, message, media);
    }
  }
  return false;
}
