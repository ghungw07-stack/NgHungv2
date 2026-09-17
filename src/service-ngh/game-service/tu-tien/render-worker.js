import { createActionScene, createBattleScene, createProfileScene, encodeSceneGif } from "./cinematic-renderer.js";

const SECTS = {
  kiem: { name: "Bổ Thiên Các", color: "#61b6ff", skill: "Vạn Kiếm Quy Tông" },
  dan: { name: "Trục Lộc Thư Viện", color: "#ff9f5b", skill: "Cửu Chuyển Hoàn Sinh" },
  ma: { name: "Ma Linh Hồ", color: "#bd79ff", skill: "Huyết Hải Thôn Thiên" },
  phat: { name: "Thạch Quốc Tổ Địa", color: "#ffd56a", skill: "Kim Cang Phục Ma" },
  linh: { name: "Thái Cổ Thần Sơn", color: "#65e1b0", skill: "Vạn Thú Triều Tông" },
};

process.once("message", async payload => {
  let reply;
  try {
    const sect = payload.sect || SECTS[payload.p?.sect] || SECTS.kiem;
    const realmName = payload.realmName || `Cảnh giới ${Number(payload.p?.realm || 0) + 1}`;
    let scene;
    if (payload.kind === "battle") {
      scene = await createBattleScene(payload.p, payload.enemy, payload.result, sect, realmName);
    } else if (payload.kind === "profile") {
      scene = await createProfileScene(payload.p, sect, realmName, payload.profileData);
    } else {
      scene = await createActionScene(payload.p, payload.type, payload.success, sect, realmName);
    }
    const file = await encodeSceneGif(scene);
    reply = { success: true, file };
  } catch (error) {
    reply = { success: false, error: error?.stack || error?.message || String(error) };
  }
  process.send(reply, () => process.disconnect());
});
