import { handleReactionConfirmJoinGroup } from "../commands/bot-manager/remote-action-group.js";
import { handleNextChapterCNovelReaction } from "../service-ngh/api-crawl/content/cnovel-truyen-chu.js";
import { handleNextChapterTruyenHentaiReaction } from "../service-ngh/api-crawl/image-content/hentai.js";
import { handleNextChapterNetTruyenReaction } from "../service-ngh/api-crawl/image-content/nettruyen.js";
import { handleTikTokReaction } from "../service-ngh/api-crawl/tiktok/tiktok-service.js";
import { handleCaroReaction } from "../service-ngh/game-service/mini-game/caro-game/caro.js";
import { handleReactionConfirmAutoJoin } from "../service-ngh/anti-service/auto-join.js";
import { handleHeartReactionDelete } from "./reaction-delete.js";
import { handleHungReaction } from "../commands/send-all/hung-reaction.js";
import { handleXiDachReaction } from "../service-ngh/game-service/xi-dach/xi-dach.js";
import { handleWerewolfReaction } from "../service-ngh/game-service/ma-soi/index.js";
import { handleHorseRaceReaction } from "../service-ngh/game-service/dua-ngua/dua-ngua.js";
import { handleCardTableReaction } from "../service-ngh/game-service/card-tables/card-tables.js";
import { handleGiveawayReaction } from "../service-ngh/game-service/giveaway/giveaway.js";
import { isUserBlocked } from "../commands/bot-manager/group-manage.js";
//Xử Lý Sự Kiện Reaction
export async function reactionEvents(api, reaction) {
  const senderId = reaction?.data?.uidFrom || reaction?.senderId;
  if (senderId && isUserBlocked(api.getBotId(), senderId)) return;
  
  // Một handler không phù hợp với loại reaction (ví dụ reaction không có rMsg)
  // không được làm mất toàn bộ lượt xử lý của các game khác.
  await Promise.allSettled([
    handleReactionConfirmJoinGroup(api, reaction),
    handleTikTokReaction(api, reaction),
    handleNextChapterNetTruyenReaction(api, reaction),
    handleNextChapterTruyenHentaiReaction(api, reaction),
    handleNextChapterCNovelReaction(api, reaction),
    handleCaroReaction(api, reaction),
    handleReactionConfirmAutoJoin(api, reaction),
    handleHungReaction(api, reaction),
    handleXiDachReaction(api, reaction),
    handleWerewolfReaction(api, reaction),
    handleHorseRaceReaction(api, reaction),
    handleCardTableReaction(api, reaction),
    handleGiveawayReaction(api, reaction),
  ]);
  // Xóa tự động chạy sau các handler game để không tranh chấp tin nhắn game.
  await handleHeartReactionDelete(api, reaction);
}
