import os from 'node:os';
import { createCanvas, registerFont } from "canvas";
import { MessageType } from "../../../api-zalo/index.js";
import fs from "node:fs";
import fsp from "fs/promises";
import path from "path";
import { runRenderJob } from "./render-job.js";
import { createActionScene, createBattleScene, encodeSceneGif, loadHeroSheet } from "./cinematic-renderer.js";
import { resolveSentMessageTarget } from "../../../utils/zalo-message-target.js";
import { createShortDonationCode } from "../donation-code.js";
import { connection } from "../../../database/index.js";
import { sendMessageStateQuote } from "../../chat-zalo/chat-style/chat-style.js";
import { displayItemCode, MAX_SHOP_QUANTITY, parseShopQuantity, resolveItemCode } from "./item-input.js";
import { resolveAlchemy, resolveGuildWar, resolvePartyDungeon, resolveRoguelikeFloor, resolveTribulationChoice } from "./expansion-rules.js";
import { isAdmin, isBotLeader } from "../../../index.js";

for (const [file, family, weight] of [
  ["Poppins-Regular.ttf", "TuTienText", "normal"],
  ["Poppins-SemiBold.ttf", "TuTienText", "600"],
  ["BeVietnamPro-Bold.ttf", "TuTienText", "bold"],
]) {
  try { registerFont(path.join(process.cwd(), "assets", "fonts", file), { family, weight }); } catch {}
}

const SECTS = {
  kiem: { name: "Bổ Thiên Các", icon: "⚔️", color: "#61b6ff", atk: 1.22, def: .92, hp: .95, skill: "Vạn Kiếm Quy Tông" },
  dan: { name: "Trục Lộc Thư Viện", icon: "🔥", color: "#ff9f5b", atk: 1.02, def: 1, hp: 1.16, skill: "Cửu Chuyển Hoàn Sinh" },
  ma: { name: "Ma Linh Hồ", icon: "🌑", color: "#bd79ff", atk: 1.16, def: .96, hp: 1, skill: "Huyết Hải Thôn Thiên" },
  phat: { name: "Thạch Quốc Tổ Địa", icon: "☸️", color: "#ffd56a", atk: .94, def: 1.24, hp: 1.08, skill: "Kim Cang Phục Ma" },
  linh: { name: "Thái Cổ Thần Sơn", icon: "🦊", color: "#65e1b0", atk: 1.07, def: 1.04, hp: 1.04, skill: "Vạn Thú Triều Tông" },
};
const REALMS = [
  ["Bàn Huyết", 0], ["Động Thiên", 1600], ["Hóa Linh", 4800], ["Minh Văn", 14000],
  ["Liệt Trận", 40000], ["Tôn Giả", 110000], ["Thần Hỏa", 300000], ["Chân Nhất", 800000],
  ["Thánh Tế", 2100000], ["Thiên Thần", 5400000], ["Hư Đạo", 14000000], ["Trảm Ngã", 36000000],
  ["Độn Nhất", 90000000], ["Chí Tôn", 220000000], ["Chân Tiên", 520000000], ["Tiên Vương", 1200000000],
  ["Chuẩn Tiên Đế", 2800000000], ["Tiên Đế", 6500000000],
];
// Tiểu cảnh giới theo lộ trình truyện: Bàn Huyết có Cực Cảnh, riêng
// Động Thiên đi từ Nhất đến Thập Động Thiên; các cảnh còn lại có bốn tầng.
const DEFAULT_MINOR_REALMS = ["Sơ kỳ", "Trung kỳ", "Hậu kỳ", "Viên mãn"];
const MINOR_REALMS_BY_REALM = {
  0: ["Sơ kỳ", "Trung kỳ", "Hậu kỳ", "Cực Cảnh"],
  1: ["Nhất Động Thiên", "Nhị Động Thiên", "Tam Động Thiên", "Tứ Động Thiên", "Ngũ Động Thiên", "Lục Động Thiên", "Thất Động Thiên", "Bát Động Thiên", "Cửu Động Thiên", "Thập Động Thiên"],
};
const ITEMS = {
  tulinhdan: { name: "Tụ Linh Đan", icon: "💊", price: 120, category: "dan", rarity: "Phàm", desc: "+300 tu vi", use: p => addCultivation(p, 300) },
  hoanhuandan: { name: "Hoàn Hồn Đan", icon: "🧪", price: 260, category: "dan", rarity: "Phàm", desc: "+80 thể lực", use: p => { p.energy = Math.min(MAX_ENERGY, p.energy + 80); } },
  cuonglucdan: { name: "Cuồng Lực Đan", icon: "🔴", price: 850, category: "dan", rarity: "Linh", desc: "+1.200 tu vi", use: p => addCultivation(p, 1200) },
  ngoidaodan: { name: "Ngộ Đạo Đan", icon: "🟣", price: 4200, category: "dan", rarity: "Địa", req: 3, desc: "+8.000 tu vi", use: p => addCultivation(p, 8000) },
  phukiep: { name: "Phù Hộ Kiếp", icon: "📜", price: 650, category: "dan", rarity: "Linh", desc: "+20% đột phá", passive: true },
  tinhthach: { name: "Luyện Khí Tinh Thạch", icon: "💠", price: 480, category: "nguyenlieu", rarity: "Linh", desc: "Nguyên liệu cường hóa trang bị" },
  thucanlinhthu: { name: "Linh Thú Tiên Lương", icon: "🍖", price: 360, category: "nguyenlieu", rarity: "Linh", desc: "Dùng tăng cấp linh thú" },
  hatlinhduoc: { name: "Hạt Giống Linh Dược", icon: "🌱", price: 220, category: "nguyenlieu", rarity: "Phàm", desc: "Trồng tại động phủ" },
  hongngoc: { name: "Hồng Ngọc Công Kích", icon: "🔻", price: 1800, category: "nguyenlieu", rarity: "Địa", desc: "Khảm +45 công", gem: { atk: 45 } },
  lamngoc: { name: "Lam Ngọc Hộ Thể", icon: "🔷", price: 1800, category: "nguyenlieu", rarity: "Địa", desc: "Khảm +38 thủ", gem: { def: 38 } },
  lucngoc: { name: "Lục Ngọc Sinh Mệnh", icon: "🟢", price: 1800, category: "nguyenlieu", rarity: "Địa", desc: "Khảm +240 HP", gem: { hp: 240 } },
  kiemgo: { name: "Thanh Mộc Kiếm", icon: "🗡️", price: 900, category: "vukhi", rarity: "Phàm Khí", req: 0, slot: "weapon", desc: "+18 công", equip: { atk: 18 } },
  thanhvan: { name: "Thanh Vân Kiếm", icon: "⚔️", price: 2600, category: "vukhi", rarity: "Bảo Khí", req: 1, slot: "weapon", desc: "+48 công, +3% bạo kích", equip: { atk: 48, crit: .03 } },
  xichdiem: { name: "Xích Diễm Thương", icon: "🔱", price: 6800, category: "vukhi", rarity: "Linh Khí", req: 2, slot: "weapon", desc: "+105 công", equip: { atk: 105 } },
  uminhkiem: { name: "U Minh Huyết Kiếm", icon: "🩸", price: 18000, category: "vukhi", rarity: "Pháp Khí", req: 3, slot: "weapon", desc: "+210 công, +8% bạo kích", equip: { atk: 210, crit: .08 } },
  cuulong: { name: "Cửu Long Tiên Kiếm", icon: "🐉", price: 65000, category: "vukhi", rarity: "Thần Khí", req: 5, slot: "weapon", desc: "+480 công, +12% bạo kích", equip: { atk: 480, crit: .12 } },
  giaplinh: { name: "Linh Tê Giáp", icon: "🥋", price: 1100, category: "giap", rarity: "Phàm Khí", req: 0, slot: "armor", desc: "+22 thủ, +80 HP", equip: { def: 22, hp: 80 } },
  huyenbang: { name: "Huyền Băng Pháp Bào", icon: "🧥", price: 3600, category: "giap", rarity: "Bảo Khí", req: 1, slot: "armor", desc: "+65 thủ, +180 HP", equip: { def: 65, hp: 180 } },
  kimcanh: { name: "Kim Cang Chiến Giáp", icon: "🛡️", price: 11000, category: "giap", rarity: "Linh Khí", req: 3, slot: "armor", desc: "+145 thủ, +420 HP", equip: { def: 145, hp: 420 } },
  tinhthan: { name: "Tinh Thần Tiên Y", icon: "🌌", price: 52000, category: "giap", rarity: "Pháp Khí", req: 5, slot: "armor", desc: "+330 thủ, +950 HP", equip: { def: 330, hp: 950 } },
  tutapchau: { name: "Tụ Linh Châu", icon: "🔮", price: 2200, category: "phapbao", rarity: "Bảo Khí", req: 1, slot: "artifact", desc: "+12% tu luyện", equip: { cultivation: .12 } },
  phongloi: { name: "Phong Lôi Ấn", icon: "⚡", price: 8500, category: "phapbao", rarity: "Linh Khí", req: 2, slot: "artifact", desc: "+70 công, +55 thủ", equip: { atk: 70, def: 55 } },
  honthien: { name: "Hỗn Thiên Kính", icon: "☯️", price: 26000, category: "phapbao", rarity: "Thần Khí", req: 4, slot: "artifact", desc: "+160 công, +160 thủ, +500 HP", equip: { atk: 160, def: 160, hp: 500 } },
  sonhaky: { name: "Sơn Hà Xã Tắc Đồ", icon: "🗺️", price: 120000, category: "phapbao", rarity: "Tiên Khí", req: 7, slot: "artifact", desc: "+420 công/thủ, +1600 HP", equip: { atk: 420, def: 420, hp: 1600, cultivation: .2 } },
  longcotkhue: { name: "Long Cốt Khôi", icon: "⛑️", price: 7200, category: "mu", rarity: "Linh Khí", req: 2, slot: "helmet", desc: "+45 thủ, +260 HP", equip: { def: 45, hp: 260 } },
  tienvuongquan: { name: "Tiên Vương Quan", icon: "👑", price: 180000, category: "mu", rarity: "Tiên Khí", req: 10, slot: "helmet", desc: "+360 công, +520 thủ, +1800 HP", equip: { atk: 360, def: 520, hp: 1800 } },
  truyvanngo: { name: "Truy Vân Ngoa", icon: "🥾", price: 5200, category: "giay", rarity: "Bảo Khí", req: 2, slot: "boots", desc: "+65 công, +2% bạo kích", equip: { atk: 65, crit: .02 } },
  hukhongngo: { name: "Hư Không Ngoa", icon: "💨", price: 95000, category: "giay", rarity: "Thần Khí", req: 8, slot: "boots", desc: "+280 công, +180 thủ, +8% bạo kích", equip: { atk: 280, def: 180, crit: .08 } },
  nhatnguyetnhan: { name: "Nhật Nguyệt Thần Nhẫn", icon: "💍", price: 32000, category: "nhan", rarity: "Pháp Khí", req: 5, slot: "ring", desc: "+190 công/thủ, +6% bạo kích", equip: { atk: 190, def: 190, crit: .06 } },
  luanhoinhhan: { name: "Luân Hồi Tiên Nhẫn", icon: "⭕", price: 260000, category: "nhan", rarity: "Tiên Khí", req: 11, slot: "ring", desc: "+620 công/thủ, +2600 HP, +12% tu luyện", equip: { atk: 620, def: 620, hp: 2600, cultivation: .12 } },
  linhduoc: { name: "Linh Dược Ngàn Năm", icon: "🌿", price: 1200, category: "nguyenlieu", rarity: "Linh", desc: "Nguyên liệu luyện đan; có thể mua tại shop nguyên liệu hoặc săn Boss" },
  giaolonglinh: { name: "Giao Long Linh", icon: "🐲", price: 0, category: "loot", rarity: "Địa", desc: "Linh vật rơi từ Huyền Thủy Giao" },
  phuonghoatinh: { name: "Phượng Hỏa Tinh", icon: "🔥", price: 0, category: "loot", rarity: "Thiên", desc: "Tinh hỏa quý hiếm của Hỏa Vực" },
  tieuthienhuyet: { name: "Tiên Huyết Cổ Thú", icon: "🩸", price: 0, category: "loot", rarity: "Tiên", desc: "Huyết mạch cổ thú, dùng để đổi chí bảo" },
  batdai: { name: "Bất Diệt Tiên Kim", icon: "✨", price: 0, category: "loot", rarity: "Thần", desc: "Tiên kim từ Cửu Thiên Thập Địa" },
  hoangthienkiem: { name: "Hoang Thiên Kiếm", icon: "🗡️", price: 0, category: "loot", rarity: "Chí Tôn Khí", req: 6, slot: "weapon", desc: "+760 công, +18% bạo kích", equip: { atk: 760, crit: .18 } },
  thiengiackich: { name: "Thiên Giác Kích", icon: "🔱", price: 0, category: "loot", rarity: "Tiên Khí", req: 10, slot: "weapon", desc: "+1.150 công, +22% bạo kích", equip: { atk: 1150, crit: .22 } },
  dailatienkiem: { name: "Đại La Tiên Kiếm", icon: "⚔️", price: 0, category: "loot", rarity: "Tiên Vương Khí", req: 15, slot: "weapon", desc: "+1.800 công, +30% bạo kích", equip: { atk: 1800, crit: .3 } },
  hoangthap: { name: "Hoang Tháp", icon: "🏯", price: 0, category: "loot", rarity: "Tiên Vương Khí", req: 14, slot: "artifact", desc: "+850 công/thủ, +2.800 HP", equip: { atk: 850, def: 850, hp: 2800, cultivation: .28 } },
};
const TECHNIQUES = {
  dantho: { name: "Dẫn Khí Thuật", price: 0, req: 0, cultivation: 1, atk: 1, def: 1, hp: 1, desc: "Công pháp nhập môn cân bằng" },
  thanhvanquyet: { name: "Thanh Vân Kiếm Quyết", price: 3500, req: 1, sect: "kiem", cultivation: 1.1, atk: 1.16, def: .96, hp: 1, desc: "+16% công, +10% tu luyện" },
  cuuchuyendan: { name: "Cửu Chuyển Đan Kinh", price: 3500, req: 1, sect: "dan", cultivation: 1.2, atk: 1, def: 1, hp: 1.1, desc: "+20% tu luyện, +10% HP" },
  huyethai: { name: "Huyết Hải Ma Công", price: 3500, req: 1, sect: "ma", cultivation: 1.08, atk: 1.22, def: .92, hp: 1, desc: "+22% công, +8% tu luyện" },
  kimcang: { name: "Bất Diệt Kim Cang", price: 3500, req: 1, sect: "phat", cultivation: 1.05, atk: 1, def: 1.2, hp: 1.16, desc: "+20% thủ, +16% HP" },
  vanthu: { name: "Vạn Thú Ngự Linh Kinh", price: 3500, req: 1, sect: "linh", cultivation: 1.12, atk: 1.08, def: 1.08, hp: 1.05, desc: "Chỉ số toàn diện" },
  honnguyen: { name: "Hỗn Nguyên Đạo Điển", price: 28000, req: 4, cultivation: 1.28, atk: 1.15, def: 1.15, hp: 1.15, desc: "Thiên giai, toàn diện cực mạnh" },
  thienmenh: { name: "Thái Thượng Thiên Mệnh Kinh", price: 100000, req: 7, cultivation: 1.45, atk: 1.28, def: 1.28, hp: 1.28, desc: "Thần cấp công pháp tối thượng" },
  nguyenphap: { name: "Nguyên Thủy Chân Giải", price: 260000, req: 8, cultivation: 1.62, atk: 1.38, def: 1.38, hp: 1.38, desc: "Cổ pháp khai mở tiềm năng Bàn Huyết đến Thánh Tế" },
  thahoatutuai: { name: "Tha Hóa Tự Tại", price: 850000, req: 10, cultivation: 1.86, atk: 1.62, def: 1.55, hp: 1.55, desc: "Vô thượng pháp: hóa thân vạn cổ, toàn diện tăng mạnh" },
  daidekinh: { name: "Đại Đế Kinh", price: 1800000, req: 12, cultivation: 2.05, atk: 1.78, def: 1.72, hp: 1.72, desc: "Đế đạo truyền thừa, trấn áp chư thiên" },
  tienvuongkinh: { name: "Tiên Vương Kinh", price: 4500000, req: 15, cultivation: 2.38, atk: 2.08, def: 2.02, hp: 2.02, desc: "Chí cao tiên pháp, chỉ Tiên Vương mới vận hành được" },
};
const COMBAT_SKILLS = {
  kiem: [
    { key: "phongkiem", name: "Phong Kiếm Trảm", req: 0, mult: 1.05 }, { key: "thienngoai", name: "Thiên Ngoại Phi Tiên", req: 1, mult: 1.12 },
    { key: "vankiem", name: "Vạn Kiếm Quy Tông", req: 2, mult: 1.2 }, { key: "nhatkiem", name: "Nhất Kiếm Phá Vạn Pháp", req: 4, mult: 1.32 }, { key: "truuthien", name: "Tru Thiên Kiếm Trận", req: 6, mult: 1.48 },
  ],
  dan: [
    { key: "danhoa", name: "Đan Hỏa Chưởng", req: 0, mult: 1.05 }, { key: "xichviem", name: "Xích Viêm Phần Thiên", req: 1, mult: 1.12 },
    { key: "cuuchuyen", name: "Cửu Chuyển Hỏa Liên", req: 2, mult: 1.2 }, { key: "thienhoa", name: "Thiên Hỏa Diệt Thế", req: 4, mult: 1.32 }, { key: "deviem", name: "Đế Viêm Phần Giới", req: 6, mult: 1.48 },
  ],
  ma: [
    { key: "huyettram", name: "Huyết Ảnh Trảm", req: 0, mult: 1.05 }, { key: "umat", name: "U Minh Ma Trảo", req: 1, mult: 1.12 },
    { key: "huyethai", name: "Huyết Hải Thôn Thiên", req: 2, mult: 1.2 }, { key: "vannahon", name: "Vạn Hồn Phệ Thiên", req: 4, mult: 1.32 }, { key: "maton", name: "Ma Tôn Diệt Thế", req: 6, mult: 1.48 },
  ],
  phat: [
    { key: "lahanchuong", name: "La Hán Chưởng", req: 0, mult: 1.05 }, { key: "kimcang", name: "Kim Cang Phục Ma", req: 1, mult: 1.12 },
    { key: "daibi", name: "Đại Bi Phật Ấn", req: 2, mult: 1.2 }, { key: "nhulai", name: "Như Lai Thần Chưởng", req: 4, mult: 1.32 }, { key: "vansu", name: "Vạn Thế Phật Quang", req: 6, mult: 1.48 },
  ],
  linh: [
    { key: "linhho", name: "Linh Hồ Truy Kích", req: 0, mult: 1.05 }, { key: "bachthu", name: "Bách Thú Bôn Đằng", req: 1, mult: 1.12 },
    { key: "vanthu", name: "Vạn Thú Triều Tông", req: 2, mult: 1.2 }, { key: "thanlong", name: "Ngự Thần Long", req: 4, mult: 1.32 }, { key: "kylan", name: "Kỳ Lân Diệt Ma", req: 6, mult: 1.48 },
  ],
};
const MONSTERS = [
  ["Sơn Kê Tinh", "🐓", .62], ["Thanh Lang", "🐺", .72], ["Thiết Bì Man Ngưu", "🐂", .82],
  ["Xích Diễm Hổ", "🐯", .94], ["Kim Giáp Hùng", "🐻", 1.04], ["Huyền Thủy Giao", "🐉", 1.15],
  ["U Minh Quỷ Tướng", "👻", 1.28], ["Cửu U Ma Tướng", "👹", 1.42], ["Thôn Thiên Tước", "🦅", 1.58],
  ["Thượng Cổ Cùng Kỳ", "🦁", 1.76], ["Hỗn Độn Cổ Thú", "🦖", 1.96], ["Dị Vực Ma Tôn", "🧿", 2.18],
  ["Chân Tiên Tàn Linh", "🪽", 2.42], ["Bất Hủ Chi Vương", "👑", 2.7], ["Hắc Ám Đế Ảnh", "🌑", 3.05],
];
const BOSS_DIFFICULTIES = {
  1: { name: "Thường", power: 1, reward: 1, drop: 1, energy: 0 },
  2: { name: "Tinh Anh", power: 1.35, reward: 1.45, drop: 1.2, energy: 5 },
  3: { name: "Ác Mộng", power: 1.82, reward: 2.1, drop: 1.45, energy: 10 },
  4: { name: "Địa Ngục", power: 2.45, reward: 3.05, drop: 1.75, energy: 15 },
  5: { name: "Diệt Thế", power: 3.3, reward: 4.5, drop: 2.15, energy: 20 },
};
const DUNGEONS = {
  linhson: { name: "Linh Sơn Bí Cảnh", icon: "🌿", req: 0, floors: 12, power: .72, reward: 1, drops: [["linhduoc", .18], ["tulinhdan", .12]] },
  maquat: { name: "Vạn Ma Quật", icon: "🕳️", req: 2, floors: 15, power: 1.08, reward: 1.45, drops: [["giaolonglinh", .14], ["xichdiem", .018]] },
  thiencung: { name: "Thượng Cổ Thiên Cung", icon: "🏯", req: 5, floors: 18, power: 1.52, reward: 2.05, drops: [["phuonghoatinh", .16], ["nhatnguyetnhan", .012]] },
  hukhong: { name: "Hư Không Cổ Lộ", icon: "🌌", req: 9, floors: 21, power: 2.05, reward: 2.9, drops: [["tieuthienhuyet", .18], ["hukhongngo", .01]] },
  dequan: { name: "Đế Quan Chiến Trường", icon: "🏰", req: 13, floors: 25, power: 2.72, reward: 4.2, drops: [["batdai", .2], ["luanhoinhhan", .008], ["dailatienkiem", .003]] },
};
const SPIRIT_BEASTS = {
  linhho: { name: "Cửu Vĩ Linh Hồ", icon: "🦊", req: 0, price: 1800, atk: 9, def: 4, hp: 22, desc: "Nhanh nhẹn, thiên về công kích" },
  bachho: { name: "Bạch Hổ Chiến Linh", icon: "🐯", req: 2, price: 8500, atk: 17, def: 8, hp: 35, desc: "Sát phạt mạnh mẽ" },
  huyenquy: { name: "Huyền Vũ Linh Quy", icon: "🐢", req: 4, price: 22000, atk: 7, def: 22, hp: 85, desc: "Phòng ngự và sinh mệnh vượt trội" },
  chutuoc: { name: "Chu Tước Thần Điểu", icon: "🦜", req: 7, price: 78000, atk: 30, def: 14, hp: 70, desc: "Thần hỏa thiêu đốt vạn vật" },
  chanlong: { name: "Chân Long Ấu Thể", icon: "🐉", req: 11, price: 260000, atk: 46, def: 38, hp: 150, desc: "Huyết mạch Chân Long toàn diện" },
};
const ACHIEVEMENTS = {
  hunter: { name: "Vạn Thú Khắc Tinh", icon: "🏹", target: 100, value: p => p.kills || 0, stones: 2500 },
  boss: { name: "Kẻ Diệt Ma", icon: "👹", target: 25, value: p => p.bossKills || 0, stones: 4200 },
  dungeon: { name: "Phá Cảnh Chi Vương", icon: "🏯", target: 30, value: p => Object.values(p.dungeons || {}).reduce((a, b) => a + Number(b || 0), 0), stones: 6000 },
  pvp: { name: "Thiên Kiêu Vô Song", icon: "⚔️", target: 20, value: p => (p.wins || 0), stones: 5000 },
  power: { name: "Uy Chấn Bát Hoang", icon: "💥", target: 50000, value: p => stats(p).power, stones: 10000 },
};
const CRAFT_RECIPES = {
  cuonglucdan: { name: "Cuồng Lực Đan", output: "cuonglucdan", quantity: 1, stones: 180, materials: { linhduoc: 2, tulinhdan: 1 } },
  ngoidaodan: { name: "Ngộ Đạo Đan", output: "ngoidaodan", quantity: 1, stones: 900, materials: { linhduoc: 4, giaolonglinh: 2 } },
  xichdiem: { name: "Xích Diễm Thương", output: "xichdiem", quantity: 1, stones: 2400, materials: { giaolonglinh: 4, phuonghoatinh: 1 } },
  nhatnguyetnhan: { name: "Nhật Nguyệt Thần Nhẫn", output: "nhatnguyetnhan", quantity: 1, stones: 11000, materials: { phuonghoatinh: 5, tieuthienhuyet: 2 } },
  hukhongngo: { name: "Hư Không Ngoa", output: "hukhongngo", quantity: 1, stones: 32000, materials: { tieuthienhuyet: 6, batdai: 2 } },
  hoangthienkiem: { name: "Hoang Thiên Kiếm", output: "hoangthienkiem", quantity: 1, stones: 65000, materials: { tieuthienhuyet: 10, batdai: 5 } },
};
const WORLD_BOSSES = [
  { name: "Thôn Thiên Ma Long", icon: "🐲", hp: 650000, power: 1.1, asset: "avaras-dragon.png" },
  { name: "Kim Sí Đại Bằng Vương", icon: "🦅", hp: 760000, power: 1.18, asset: "demon-bird.png" },
  { name: "Cửu U Minh Xà", icon: "🐍", hp: 840000, power: 1.24, asset: "eldritch-idol.png" },
  { name: "Hắc Ám Cùng Kỳ", icon: "🦁", hp: 900000, power: 1.3, asset: "demon-bird.png" },
  { name: "Thái Cổ Ma Viên", icon: "🦍", hp: 1020000, power: 1.38, asset: "eldritch-idol.png" },
  { name: "Huyết Hải Tu La", icon: "👹", hp: 1140000, power: 1.47, asset: "demon-bird.png" },
  { name: "Bất Hủ Đế Ảnh", icon: "👁️", hp: 1250000, power: 1.55, asset: "eldritch-idol.png" },
  { name: "Diệt Thế Lôi Đế", icon: "⚡", hp: 1420000, power: 1.68, asset: "avaras-dragon.png" },
  { name: "Hỗn Độn Cổ Thần", icon: "🌑", hp: 1650000, power: 1.82, asset: "eldritch-idol.png" },
  { name: "Hắc Ám Chuẩn Tiên Đế", icon: "🕳️", hp: 1950000, power: 2.0, asset: "avaras-dragon.png" },
];
// Toàn bộ Boss luân phiên trong ngày: hạ con hiện tại thì lần gọi kế tiếp
// tự mở con tiếp theo. Điểm bắt đầu thay đổi theo ngày để thứ tự không nhàm.
const WORLD_BOSSES_PER_DAY = WORLD_BOSSES.length;
const STORY_CHAPTERS = ["Liễu Thần Tế Linh", "Đại Hoang Huyết Chiến", "Bách Đoạn Tranh Hùng", "Hư Thần Dương Danh", "Tam Thiên Đạo Hỏa", "Đế Quan Quyết Chiến", "Hắc Ám Đại Thanh Toán", "Độc Đoán Vạn Cổ"];
const ARENA_RANKS = [[0,"Thanh Đồng"],[100,"Bạch Ngân"],[250,"Hoàng Kim"],[500,"Tôn Giả"],[850,"Chí Tôn"],[1300,"Chân Tiên"],[1900,"Tiên Vương"],[2700,"Tiên Đế"]];
const EQUIPMENT_SETS = {
  tinhthan: { name: "Tinh Thần", items: ["cuulong", "tinhthan", "honthien"], two: { atk: 180, hp: 500 }, three: { def: 260, crit: .06 } },
  tienvuong: { name: "Tiên Vương", items: ["dailatienkiem", "hoangthap", "tienvuongquan", "luanhoinhhan"], two: { atk: 500, def: 400 }, three: { hp: 2200, cultivation: .15 } },
};
// Lộ trình lấy cảm hứng từ thế giới Hoàn Mỹ. Cảnh giới quyết định bản đồ
// được mở; Boss map cao có bảng rơi đồ riêng thay vì phần thưởng cố định.
const MAPS = {
  thachthon: { name: "Thạch Thôn", icon: "🏡", req: 0, need: 1000, level: 1, monster: "Toan Nghê Ấu Thú", multiplier: .8, drops: [["tulinhdan", .28], ["linhduoc", .35]] },
  daihoang: { name: "Đại Hoang", icon: "🌲", req: 1, need: 2500, level: 1, monster: "Thanh Lang Vương", multiplier: .92, drops: [["linhduoc", .55], ["tulinhdan", .18]] },
  bachdoan: { name: "Bách Đoạn Sơn", icon: "⛰️", req: 2, need: 10000, level: 2, monster: "Xích Diễm Hổ Vương", multiplier: 1.12, drops: [["linhduoc", .6], ["giaolonglinh", .2], ["phukiep", .1]] },
  huthangioi: { name: "Hư Thần Giới", icon: "🌀", req: 4, need: 35000, level: 3, monster: "Hư Thần Giao", multiplier: 1.35, drops: [["giaolonglinh", .65], ["phuonghoatinh", .16], ["xichdiem", .05]] },
  thuonggioi: { name: "Thượng Giới · Tam Thiên Châu", icon: "🌋", req: 6, need: 120000, level: 4, monster: "Chu Tước Tàn Hồn", multiplier: 1.62, drops: [["phuonghoatinh", .7], ["tieuthienhuyet", .16], ["uminhkiem", .05], ["hoangthienkiem", .025]] },
  cuuthien: { name: "Cửu Thiên Thập Địa", icon: "☁️", req: 10, need: 480000, level: 5, monster: "Cổ Thú Hỗn Độn", multiplier: 2.05, drops: [["tieuthienhuyet", .72], ["batdai", .2], ["thiengiackich", .05]] },
  tienvuc: { name: "Tiên Vực", icon: "🌌", req: 15, need: 1600000, level: 5, monster: "Tiên Vương Pháp Tướng", multiplier: 2.55, drops: [["batdai", .72], ["hoangthienkiem", .1], ["hoangthap", .06], ["dailatienkiem", .035]] },
};
const MAP_ORDER = Object.keys(MAPS);
// Boss được tách theo map: boss thường để farm nguyên liệu, thủ lĩnh để lấy đồ hiếm.
const BOSS_ROSTER = {
  thachthon: [
    { key: "toannghe", name: "Toan Nghê Ấu Thú", icon: "🦁", level: 1, multiplier: .82, reward: .8, cooldown: 90_000, drops: [["tulinhdan", .34], ["linhduoc", .22]] },
    { key: "thuthut", name: "Thú Thủ Thôn", icon: "🐺", level: 1, multiplier: 1.08, reward: 1.05, cooldown: 150_000, drops: [["linhduoc", .48], ["phukiep", .06]] },
  ],
  daihoang: [
    { key: "langvuong", name: "Thanh Lang Vương", icon: "🐺", level: 1, multiplier: .98, reward: 1, cooldown: 120_000, drops: [["linhduoc", .55], ["tulinhdan", .18]] },
    { key: "lyhoa", name: "Ly Hỏa Ngưu Ma", icon: "🐂", level: 2, multiplier: 1.28, reward: 1.32, cooldown: 240_000, drops: [["linhduoc", .62], ["giaolonglinh", .12], ["phukiep", .09]] },
    { key: "thachvien", name: "Thạch Viên Vương", icon: "🦍", level: 2, multiplier: 1.52, reward: 1.55, cooldown: 360_000, drops: [["linhduoc", .68], ["giaolonglinh", .2]] },
  ],
  bachdoan: [
    { key: "xichdiemho", name: "Xích Diễm Hổ Vương", icon: "🐯", level: 2, multiplier: 1.2, reward: 1.1, cooldown: 180_000, drops: [["linhduoc", .55], ["giaolonglinh", .22]] },
    { key: "thuthang", name: "Thôn Thiên Tước", icon: "🦅", level: 3, multiplier: 1.58, reward: 1.45, cooldown: 330_000, drops: [["giaolonglinh", .52], ["phuonghoatinh", .1], ["xichdiem", .035]] },
    { key: "cuulong", name: "Cửu Đầu Sư Tử", icon: "🦁", level: 3, multiplier: 1.9, reward: 1.7, cooldown: 480_000, drops: [["giaolonglinh", .68], ["phuonghoatinh", .16], ["phukiep", .15]] },
  ],
  huthangioi: [
    { key: "huthangiao", name: "Hư Thần Giao", icon: "🐉", level: 3, multiplier: 1.38, reward: 1.1, cooldown: 210_000, drops: [["giaolonglinh", .62], ["phuonghoatinh", .14]] },
    { key: "bachthong", name: "Bạch Thống Lĩnh", icon: "👺", level: 3, multiplier: 1.75, reward: 1.42, cooldown: 420_000, drops: [["giaolonglinh", .7], ["phuonghoatinh", .2], ["uminhkiem", .025]] },
    { key: "songoc", name: "Song Cốt Giả", icon: "🧿", level: 4, multiplier: 2.08, reward: 1.72, cooldown: 600_000, drops: [["phuonghoatinh", .45], ["tieuthienhuyet", .12], ["xichdiem", .06]] },
  ],
  thuonggioi: [
    { key: "chutuoc", name: "Chu Tước Tàn Hồn", icon: "🦜", level: 4, multiplier: 1.68, reward: 1.14, cooldown: 240_000, drops: [["phuonghoatinh", .66], ["tieuthienhuyet", .16]] },
    { key: "tienndien", name: "Tiên Điện Truyền Nhân", icon: "⚜️", level: 4, multiplier: 2.1, reward: 1.48, cooldown: 480_000, drops: [["phuonghoatinh", .7], ["tieuthienhuyet", .24], ["uminhkiem", .05]] },
    { key: "thienthan", name: "Thiên Thần Cổ Thi", icon: "🪽", level: 5, multiplier: 2.5, reward: 1.8, cooldown: 720_000, drops: [["tieuthienhuyet", .35], ["batdai", .08], ["hoangthienkiem", .025]] },
  ],
  cuuthien: [
    { key: "hondonthu", name: "Cổ Thú Hỗn Độn", icon: "🦖", level: 5, multiplier: 2.12, reward: 1.15, cooldown: 300_000, drops: [["tieuthienhuyet", .7], ["batdai", .18]] },
    { key: "batdai", name: "Bất Hủ Chi Vương Tàn Niệm", icon: "👑", level: 5, multiplier: 2.62, reward: 1.55, cooldown: 540_000, drops: [["tieuthienhuyet", .75], ["batdai", .28], ["thiengiackich", .035]] },
    { key: "dichquan", name: "Dị Vực Chiến Tướng", icon: "⚔️", level: 5, multiplier: 3.1, reward: 1.9, cooldown: 900_000, drops: [["batdai", .32], ["thiengiackich", .075], ["hoangthap", .025]] },
  ],
  tienvuc: [
    { key: "tienvuong", name: "Tiên Vương Pháp Tướng", icon: "🌌", level: 5, multiplier: 2.65, reward: 1.2, cooldown: 360_000, drops: [["batdai", .72], ["hoangthienkiem", .08]] },
    { key: "ngaothinh", name: "Ngao Thịnh Pháp Thân", icon: "🐉", level: 5, multiplier: 3.28, reward: 1.62, cooldown: 660_000, drops: [["batdai", .65], ["hoangthap", .055], ["dailatienkiem", .02]] },
    { key: "handich", name: "Hắc Ám Chuẩn Tiên Đế", icon: "🕳️", level: 5, multiplier: 4.05, reward: 2.1, cooldown: 1_200_000, drops: [["batdai", .5], ["hoangthap", .1], ["dailatienkiem", .05]] },
  ],
};
// Mỗi khu vực có các thế lực riêng. Người chơi có thể giữ đạo thống khởi đầu
// và gia nhập một thế lực tại từng map để nhận danh hiệu cùng một buff khu vực.
const MAP_FACTIONS = {
  thachthon: [
    { key: "thachthon", name: "Thạch Thôn", icon: "🏡", desc: "Tế linh Liễu Thần che chở", bonus: { hp: 45 } },
  ],
  daihoang: [
    { key: "butiencac", name: "Bổ Thiên Các", icon: "🏯", desc: "Thánh địa tuyển thiên tài Hạ giới", bonus: { cultivation: .05 } },
    { key: "trucloc", name: "Trục Lộc Thư Viện", icon: "📚", desc: "Thư viện cổ, trọng truyền thừa", bonus: { def: 12 } },
    { key: "thaicothanson", name: "Thái Cổ Thần Sơn", icon: "🐲", desc: "Đạo thống của di chủng Thái Cổ", bonus: { atk: 12 } },
  ],
  bachdoan: [
    { key: "bachdoan", name: "Bách Đoạn Sơn Thí Luyện Doanh", icon: "⛰️", desc: "Thế lực trấn thủ cổ địa thí luyện", bonus: { crit: .02 } },
    { key: "huyenvuc", name: "Huyền Vực Cổ Tộc", icon: "🦅", desc: "Cổ tộc săn tìm bảo cốt", bonus: { atk: 20 } },
  ],
  huthangioi: [
    { key: "huthangioi", name: "Hư Thần Giới · Sơ Thủy Địa", icon: "🌀", desc: "Nơi lưu danh và giao chiến của thiên kiêu", bonus: { cultivation: .08 } },
    { key: "thachquoc", name: "Thạch Quốc Hoàng Tộc", icon: "👑", desc: "Hoàng tộc Hạ giới, chiến ý hùng hậu", bonus: { hp: 100 } },
  ],
  thuonggioi: [
    { key: "butiengiao", name: "Bổ Thiên Giáo", icon: "🌙", desc: "Đại giáo Thượng giới, truyền thừa Bổ Thiên thuật", bonus: { def: 40 } },
    { key: "tietthiengiao", name: "Tiệt Thiên Giáo", icon: "🗡️", desc: "Đại giáo lấy sát phạt làm đạo", bonus: { atk: 42 } },
    { key: "tiendien", name: "Tiên Điện", icon: "🏛️", desc: "Thế lực cổ xưa của Tam Thiên Châu", bonus: { crit: .045 } },
  ],
  cuuthien: [
    { key: "thienshonthuvien", name: "Thiên Thần Thư Viện", icon: "📜", desc: "Nơi ba ngàn châu tuyển chọn kỳ tài", bonus: { cultivation: .12 } },
    { key: "tienvien", name: "Tiên Viện", icon: "☁️", desc: "Đạo thống tu cổ pháp", bonus: { atk: 100, hp: 240 } },
    { key: "thanhvien", name: "Thánh Viện", icon: "✨", desc: "Đạo thống tu kim thế pháp", bonus: { def: 100, hp: 240 } },
  ],
  tienvuc: [
    { key: "banvuongphu", name: "Bàn Vương Phủ", icon: "⚜️", desc: "Tiên Vương thế gia của Tiên Vực", bonus: { atk: 280, def: 180 } },
    { key: "ngaothinhphu", name: "Ngao Thịnh Tiên Vương Phủ", icon: "🐉", desc: "Tiên Vương phủ uy chấn một phương", bonus: { hp: 900, crit: .06 } },
    { key: "honnguyenphu", name: "Hỗn Nguyên Tiên Vương Phủ", icon: "☯️", desc: "Cổ phủ nghiên cứu Hỗn Nguyên tiên đạo", bonus: { cultivation: .2, def: 160 } },
  ],
};
const CD = { cultivate: 90_000, hunt: 75_000, boss: 5 * 60_000, songtu: 6 * 60 * 60_000 };
export const TU_TIEN_DONATE_TIERS = Object.freeze([
  { amount: 10_000, cultivation: 1_000_000, stones: 10_000 },
  { amount: 20_000, cultivation: 2_000_000, stones: 20_000 },
  { amount: 50_000, cultivation: 5_000_000, stones: 50_000 },
  { amount: 100_000, cultivation: 10_000_000, stones: 100_000 },
  { amount: 200_000, cultivation: 20_000_000, stones: 200_000 },
]);
const dataPath = botId => path.join(process.cwd(), "logs", String(botId), "tu-tien.json");
const sessionPath = botId => path.join(process.cwd(), "logs", String(botId), "tu-tien-sessions.json");
const SECT_INDEX = { kiem: 0, dan: 1, ma: 2, phat: 3, linh: 4 };
const MAX_ENERGY = 5000;
const playerKey = id => String(id);
const SESSION_TTL = 5 * 60_000;
const sessions = new Map();
// Map alias tin mời theo đúng mô hình xác nhận ❤️ của social kethon.
const pendingSongTuReactions = new Map();
const pendingPvPReactions = new Map();
const sessionSnapshots = new Map();
const playerSnapshots = new Map();
const pendingSnapshotWrites = new Map();
const dirtySnapshots = new Map();
const SNAPSHOT_WRITE_DEBOUNCE_MS = 300;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const fmt = n => Math.floor(Number(n) || 0).toLocaleString("vi-VN");
// Zalo đôi khi nối `_0` vào UID trong mention/reaction. Dữ liệu Tu Tiên
// luôn dùng UID chuẩn để cùng một người không bị coi thành hai nhân vật.
const normalizeUid = value => String(value ?? "").trim().replace(/_0$/u, "");

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temp, file);
}
function queueJsonWrite(file, value) {
  dirtySnapshots.set(file, value);
  if (pendingSnapshotWrites.has(file)) return;
  const timer = setTimeout(() => flushJsonWrite(file), SNAPSHOT_WRITE_DEBOUNCE_MS);
  timer.unref?.();
  pendingSnapshotWrites.set(file, timer);
}
function flushJsonWrite(file) {
  const timer = pendingSnapshotWrites.get(file);
  if (timer) clearTimeout(timer);
  pendingSnapshotWrites.delete(file);
  const value = dirtySnapshots.get(file);
  if (value === undefined) return;
  dirtySnapshots.delete(file);
  writeJson(file, value);
}
function readData(botId) {
  const key = String(botId);
  if (playerSnapshots.has(key)) return playerSnapshots.get(key);
  const data = readJson(dataPath(key), { players: {} });
  data.players ||= {}; playerSnapshots.set(key, data);
  return data;
}
function writeData(botId, data) { const key = String(botId); playerSnapshots.set(key, data); queueJsonWrite(dataPath(key), data); }
function getSessionSnapshot(botId) {
  const key = String(botId);
  if (!sessionSnapshots.has(key)) sessionSnapshots.set(key, readJson(sessionPath(key), {}));
  return sessionSnapshots.get(key);
}
function persistSessionSnapshot(botId) { queueJsonWrite(sessionPath(String(botId)), getSessionSnapshot(botId)); }
process.once("beforeExit", () => { for (const file of [...dirtySnapshots.keys()]) flushJsonWrite(file); });
function realm(p) { return REALMS[clamp(p.realm || 0, 0, REALMS.length - 1)]; }
function minorStages(p) { return MINOR_REALMS_BY_REALM[p.realm] || DEFAULT_MINOR_REALMS; }
function minorRealm(p) { return clamp(Math.floor(Number(p.minorRealm) || 0), 0, minorStages(p).length - 1); }
function realmTitle(p) { return `${realm(p)[0]} · ${minorStages(p)[minorRealm(p)]}`; }
function nextNeed(p) {
  const current = realm(p)[1], next = REALMS[p.realm + 1]?.[1];
  if (next == null) return Infinity;
  return Math.ceil(current + (next - current) * (minorRealm(p) + 1) / minorStages(p).length);
}
function advanceRealm(p) {
  if (minorRealm(p) < minorStages(p).length - 1) p.minorRealm = minorRealm(p) + 1;
  else { p.realm++; p.minorRealm = 0; }
  return realmTitle(p);
}
function stats(p) {
  const s = SECTS[p.sect], e = p.equipment || {}, r = p.realm || 0, tech = TECHNIQUES[p.activeTechnique] || TECHNIQUES.dantho;
  const realmProgress = r + minorRealm(p) / minorStages(p).length;
  const factionBonus = activeFaction(p)?.bonus || {};
  const bonus = Object.values(e).reduce((sum, item) => ({ atk: sum.atk + (item?.atk || 0), def: sum.def + (item?.def || 0), hp: sum.hp + (item?.hp || 0), crit: sum.crit + (item?.crit || 0), cultivation: sum.cultivation + (item?.cultivation || 0) }), { atk: factionBonus.atk || 0, def: factionBonus.def || 0, hp: factionBonus.hp || 0, crit: factionBonus.crit || 0, cultivation: factionBonus.cultivation || 0 });
  const guildLevel = clamp(Number(p.guildLevelSnapshot) || 0, 0, 20);
  bonus.atk += guildLevel * 10; bonus.def += guildLevel * 8; bonus.hp += guildLevel * 35; bonus.cultivation += guildLevel * .01;
  const guildRoleBonus = { pho: { atk: 60, def: 50 }, truonglao: { def: 35, hp: 160 }, de: {} }[p.guildRoleSnapshot] || {};
  bonus.atk += guildRoleBonus.atk || 0; bonus.def += guildRoleBonus.def || 0; bonus.hp += guildRoleBonus.hp || 0;
  for (const set of Object.values(EQUIPMENT_SETS)) { const count = Object.values(e).filter(item => set.items.includes(item?.key)).length; if (count >= 2) for (const [key,value] of Object.entries(set.two)) bonus[key] += value; if (count >= 3) for (const [key,value] of Object.entries(set.three)) bonus[key] += value; }
  const rebirth = clamp(Number(p.rebirth) || 0, 0, 10), rebirthMult = (1 + rebirth * .12) * (p.isHeavenlyDao ? 1000 : 1);
  const beast = SPIRIT_BEASTS[p.spiritBeast?.key], beastLevel = clamp(Number(p.spiritBeast?.level) || 0, 0, 50);
  if (beast && beastLevel) { bonus.atk += beast.atk * beastLevel; bonus.def += beast.def * beastLevel; bonus.hp += beast.hp * beastLevel; }
  const permanentBreakthroughPower = Math.max(0, Math.floor(Number(p.breakthroughPower) || 0));
  return {
    atk: Math.round((30 + realmProgress * 24 + bonus.atk) * s.atk * tech.atk * rebirthMult),
    def: Math.round((20 + realmProgress * 20 + bonus.def) * s.def * tech.def * rebirthMult),
    hp: Math.round((280 + realmProgress * 150 + bonus.hp) * s.hp * tech.hp * rebirthMult),
    crit: bonus.crit,
    cultivationRate: tech.cultivation * (1 + bonus.cultivation),
    power: Math.round((((30 + realmProgress * 24 + bonus.atk) * s.atk * tech.atk) * 5 + ((20 + realmProgress * 20 + bonus.def) * s.def * tech.def) * 4 + (280 + realmProgress * 150 + bonus.hp) * s.hp * tech.hp + p.cultivation / 18) * rebirthMult + permanentBreakthroughPower),
  };
}
function addCultivation(p, amount) { p.cultivation = Math.max(0, Math.floor((p.cultivation || 0) + amount)); }
function parseDonateAmount(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/[.,\s]/g, "");
  const match = normalized.match(/^(\d+)(k)?$/);
  if (!match) return 0;
  return Number(match[1]) * (match[2] ? 1000 : 1);
}
function donateTier(value) {
  const amount = typeof value === "number" ? value : parseDonateAmount(value);
  return TU_TIEN_DONATE_TIERS.find(tier => tier.amount === amount) || null;
}
function applyTuTienDonation(p, tier, source, reference = "") {
  addCultivation(p, tier.cultivation);
  p.stones = Math.max(0, Math.floor(Number(p.stones) || 0)) + tier.stones;
  p.donatedVnd = Math.max(0, Math.floor(Number(p.donatedVnd) || 0)) + tier.amount;
  p.donateHistory ||= [];
  p.donateHistory.push({ amount: tier.amount, cultivation: tier.cultivation, stones: tier.stones, source, reference: String(reference || ""), at: Date.now() });
  if (p.donateHistory.length > 50) p.donateHistory = p.donateHistory.slice(-50);
}
function maximizePlayer(p) {
  p.realm = REALMS.length - 1;
  p.minorRealm = minorStages(p).length - 1;
  p.cultivation = REALMS.at(-1)[1];
  p.activeMap = MAP_ORDER.at(-1);
  p.mapCultivation ||= {};
  for (const [key, map] of Object.entries(MAPS)) p.mapCultivation[key] = Math.max(map.need, Number(p.mapCultivation[key]) || 0);
}
function normalizeRealmName(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").replace(/[^a-z0-9]/gi, "").toLowerCase();
}
function resolveRealmIndex(value) {
  const normalized = normalizeRealmName(value);
  if (/^\d+$/.test(normalized)) {
    const index = Number(normalized);
    return index >= 0 && index < REALMS.length ? index : -1;
  }
  return REALMS.findIndex(([name]) => normalizeRealmName(name) === normalized);
}
function setPlayerRealm(p, realmIndex) {
  const index = clamp(Math.floor(Number(realmIndex) || 0), 0, REALMS.length - 1);
  p.realm = index; p.minorRealm = 0; p.cultivation = REALMS[index][1];
  p.mapCultivation ||= {};
  let activeMap = MAP_ORDER[0];
  for (let mapIndex = 0; mapIndex < MAP_ORDER.length; mapIndex++) {
    const key = MAP_ORDER[mapIndex], map = MAPS[key];
    if (map.req > index) break;
    activeMap = key;
    if (mapIndex > 0) {
      const previousKey = MAP_ORDER[mapIndex - 1], previous = MAPS[previousKey];
      p.mapCultivation[previousKey] = Math.max(previous.need, Number(p.mapCultivation[previousKey]) || 0);
    }
  }
  p.activeMap = activeMap;
}
function commandArgumentWithoutMention(message, commandName) {
  const raw = typeof message.data?.content === "string" ? message.data.content : message.data?.content?.title || "";
  const mention = Array.isArray(message.data?.mentions) ? message.data.mentions[0] : null;
  let cleaned = raw;
  if (mention && Number.isInteger(Number(mention.pos)) && Number(mention.len) > 0) {
    const pos = Number(mention.pos), len = Number(mention.len);
    cleaned = `${raw.slice(0, pos)} ${raw.slice(pos + len)}`;
  }
  return cleaned.replace(/^\s*\S+\s+/u, "").replace(new RegExp(`^${commandName}(?:\\s+|$)`, "iu"), "").trim();
}
function heavenlyTitleArgument(message) {
  const raw = typeof message.data?.content === "string" ? message.data.content : message.data?.content?.title || "";
  let value = String(raw).trim();
  value = value.replace(/^\s*\S+\s+/u, "").replace(/^thiendao\s+sacphong\s*/iu, "");
  // Zalo mention offsets can be byte-based on some clients. Prefer the visible
  // @ token so a multi-word title such as "gay lọ" is never truncated.
  const at = value.lastIndexOf("@");
  if (at > 0) value = value.slice(0, at);
  else {
    const mention = Array.isArray(message.data?.mentions) ? message.data.mentions[0] : null;
    const pos = Number(mention?.pos), len = Number(mention?.len);
    if (Number.isInteger(pos) && len > 0) {
      const commandOffset = String(raw).length - value.length;
      const relative = pos - commandOffset;
      if (relative > 0 && relative <= value.length) value = value.slice(0, relative);
    }
  }
  return value.trim().slice(0, 32);
}
function sentMessageIds(sent) {
  return [sent?.message?.msgId, sent?.message?.data?.msgId, sent?.msgId, sent?.messageID, sent?.cliMsgId, sent?.message?.cliMsgId, sent?.data?.msgId, sent?.data?.cliMsgId, ...(Array.isArray(sent?.data?.msgIds) ? sent.data.msgIds : []), ...(Array.isArray(sent?.msgIds) ? sent.msgIds : [])].filter(Boolean).map(String);
}
function reactionMessageIds(raw) {
  let value = raw;
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return []; }
  }
  const entries = Array.isArray(value) ? value : [value];
  return [...new Set(entries.flatMap(entry => {
    if (!entry || typeof entry !== "object") return [];
    return [entry.gMsgID, entry.gMsgId, entry.globalMsgId, entry.msgId,
      entry.cMsgID, entry.cMsgId, entry.cliMsgId, entry.clientMsgId,
      entry.message?.msgId, entry.message?.cliMsgId].filter(Boolean).map(String);
  }))];
}
async function resolveInvitationIds(api, message, sent) {
  const ids = sentMessageIds(sent);
  if (ids.length) return [...new Set(ids)];
  const target = await resolveSentMessageTarget(api, message, sent).catch(() => null);
  return [target?.data?.msgId, target?.data?.cliMsgId].filter(Boolean).map(String);
}

export async function processTuTienDonatePayment(botId, uid, payRef, receivedAmount) {
  const normalizedBotId = String(botId || "").trim(), normalizedUid = normalizeUid(uid);
  if (!/^\d+$/.test(normalizedBotId) || !/^\d+$/.test(normalizedUid)) return { success: false, error: "Mã Tu Tiên không hợp lệ" };
  const tier = donateTier(Number(receivedAmount));
  if (!tier) return { success: false, error: "Chỉ nhận đúng các mốc 10k, 20k, 50k, 100k hoặc 200k" };
  const data = readData(normalizedBotId), player = data.players[playerKey(normalizedUid)];
  if (!player) return { success: false, error: "UID chưa tạo nhân vật Tu Tiên trên bot này" };
  const normalizedPayRef = String(payRef || "").trim();
  if (normalizedPayRef) {
    const duplicate = Object.values(data.players).some(candidate =>
      Array.isArray(candidate?.donateHistory)
      && candidate.donateHistory.some(entry => entry?.source === "webhook" && String(entry?.reference || "") === normalizedPayRef)
    );
    if (duplicate) return { success: true, duplicate: true, message: "Giao dịch Tu Tiên đã được cộng trước đó", uid: normalizedUid, botId: normalizedBotId, amount: tier.amount };
  }
  applyTuTienDonation(player, tier, "webhook", normalizedPayRef);
  // Donate được cộng thẳng vào tu vi map để không bắt người chơi đột phá mới
  // nhận đủ quyền lợi của mốc donate.
  addMapCultivationCascade(player, tier.cultivation, player.activeMap || "thachthon");
  writeData(normalizedBotId, data);
  flushJsonWrite(dataPath(normalizedBotId));
  return { success: true, message: `Đã cộng ${tier.cultivation} tu vi và ${tier.stones} linh thạch`, uid: normalizedUid, botId: normalizedBotId, amount: tier.amount, cultivation: tier.cultivation, stones: tier.stones };
}
function cooldown(p, type, duration = CD[type] ?? CD.hunt) { return Math.max(0, duration - (Date.now() - (p.actions?.[type] || 0))); }
function waitText(ms) { const s = Math.ceil(ms / 1000); return s >= 60 ? `${Math.ceil(s / 60)} phút` : `${s} giây`; }
function newPlayer(sect, gender, name, userId) {
  return { userId, name, sect, gender, realm: 0, minorRealm: 0, cultivation: 0, stones: 500, energy: MAX_ENERGY, wins: 0, losses: 0, kills: 0, bossKills: 0, activeMap: "thachthon", inventory: { tulinhdan: 1 }, equipment: {}, techniques: ["dantho"], activeTechnique: "dantho", actions: {}, createdAt: Date.now(), lastEnergyAt: Date.now(), lastIdleAt: Date.now(), dailyDate: "", quests: {} };
}
function todayVN() { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }); }
function refreshPlayer(p) {
  const now = Date.now(), elapsed = Math.max(0, now - (p.lastEnergyAt || now)), recovered = Math.floor(elapsed / 180_000);
  if (recovered > 0) { p.energy = Math.min(MAX_ENERGY, (p.energy ?? MAX_ENERGY) + recovered); p.lastEnergyAt = (p.lastEnergyAt || now) + recovered * 180_000; }
  if (p.questDate !== todayVN()) { p.questDate = todayVN(); p.quests = { cultivate: 0, hunt: 0, boss: 0 }; p.questClaims = {}; }
}
function touchQuest(p, key) { p.quests ||= {}; p.quests[key] = (p.quests[key] || 0) + 1; }
function unlockedSkills(p) { return (COMBAT_SKILLS[p.sect] || []).filter(skill => skill.req <= (p.realm || 0)); }
function selectedCombatSkill(p) { const available = unlockedSkills(p), chosen = available.find(skill => skill.key === p.activeSkill); return chosen || available[available.length - 1] || COMBAT_SKILLS[p.sect][0]; }
function mapCultivation(p, key = p.activeMap || "thachthon") { p.mapCultivation ||= {}; return Math.max(0, Number(p.mapCultivation[key]) || 0); }
function addMapCultivation(p, amount, key = p.activeMap || "thachthon") { p.mapCultivation ||= {}; p.mapCultivation[key] = Math.max(0, Math.floor(mapCultivation(p, key) + amount)); }
function addMapCultivationCascade(p, amount, startKey = p.activeMap || "thachthon") {
  let remaining = Math.max(0, Math.floor(Number(amount) || 0));
  const startIndex = Math.max(0, MAP_ORDER.indexOf(startKey)), allocations = [];
  for (let index = startIndex; index < MAP_ORDER.length && remaining > 0; index++) {
    const key = MAP_ORDER[index], map = MAPS[key], current = mapCultivation(p, key);
    const added = index === MAP_ORDER.length - 1 ? remaining : Math.min(remaining, Math.max(0, map.need - current));
    if (added > 0) { addMapCultivation(p, added, key); allocations.push({ key, amount: added }); remaining -= added; }
  }
  return allocations;
}
function mapBossKills(p, key = p.activeMap || "thachthon") { p.mapBossKills ||= {}; return Math.max(0, Number(p.mapBossKills[key]) || 0); }
function addMapBossKill(p, key = p.activeMap || "thachthon") { p.mapBossKills ||= {}; p.mapBossKills[key] = mapBossKills(p, key) + 1; }
function mapAccess(p, key) {
  const map = MAPS[key], index = MAP_ORDER.indexOf(key);
  if (!map || p.realm < map.req) return false;
  if (index <= 0) return true;
  const previous = MAPS[MAP_ORDER[index - 1]];
  return mapCultivation(p, MAP_ORDER[index - 1]) >= previous.need;
}
function mapFor(p, key) {
  const mapKey = String(key || p.activeMap || "thachthon").toLowerCase(), selected = MAPS[mapKey];
  return selected && mapAccess(p, mapKey) ? selected : null;
}
function advanceMapIfReady(p) {
  const index = MAP_ORDER.indexOf(p.activeMap), nextKey = MAP_ORDER[index + 1];
  if (!nextKey || !mapAccess(p, nextKey)) return null;
  p.activeMap = nextKey;
  return MAPS[nextKey];
}
function bossesForMap(key) { return BOSS_ROSTER[key] || []; }
function resolveBossForMap(key, value) {
  const bosses = bossesForMap(key), token = String(value || "").toLowerCase();
  return bosses.find((entry, index) => entry.key === token || String(index + 1) === token) || null;
}
function factionsForMap(key) { return MAP_FACTIONS[key] || []; }
function activeFaction(p) {
  const key = p.factions?.[p.activeMap];
  return factionsForMap(p.activeMap).find(faction => faction.key === key) || null;
}
function mapList(p) {
  return Object.entries(MAPS).map(([key, map]) => `${mapAccess(p, key) ? "✅" : "🔒"} ${map.icon} ${key} · ${map.name}\n   ${REALMS[map.req][0]} · Tu vi map ${fmt(mapCultivation(p, key))}/${fmt(map.need)} · Boss ${mapBossKills(p, key)} lần\n   👹 ${bossesForMap(key).map(boss => boss.name).join(" · ")}\n   🏯 ${factionsForMap(key).map(faction => faction.name).join(" · ")}`).join("\n\n");
}
function grantBossDrops(p, boss, chanceMultiplier = 1) {
  const drops = [];
  for (const [key, chance] of boss.drops) {
    if (Math.random() > Math.min(.92, chance * chanceMultiplier)) continue;
    p.inventory[key] = (p.inventory[key] || 0) + 1;
    drops.push(`${ITEMS[key].icon} ${ITEMS[key].name}`);
  }
  return drops;
}
function grantDrops(p, entries, chanceMultiplier = 1) {
  return grantBossDrops(p, { drops: entries }, chanceMultiplier);
}
function dungeonProgress(p, key) { p.dungeons ||= {}; return clamp(Math.floor(Number(p.dungeons[key]) || 0), 0, DUNGEONS[key]?.floors || 0); }
function teamPower(players) {
  const base = players.reduce((sum, player) => sum + stats(player).power * selectedCombatSkill(player).mult, 0);
  const sects = new Set(players.map(player => player.sect)).size;
  const roles = new Set(players.map(player => player.formationRole).filter(Boolean)).size;
  return Math.round(base * (1 + Math.max(0, sects - 1) * .035 + Math.max(0, roles - 1) * .05));
}
function shortCode(prefix = "") { return `${prefix}${Math.random().toString(36).slice(2, 7)}`.toUpperCase(); }
function playerGuild(data, userId) { return Object.entries(data.guilds || {}).find(([, guild]) => guild.members?.includes(playerKey(userId))) || null; }
function playerParty(data, userId) { return Object.entries(data.parties || {}).find(([, party]) => party.members?.includes(playerKey(userId))) || null; }
function currentWorldBoss(data) {
  const date = todayVN();
  if (data.worldBoss?.date === date) {
    data.worldBoss.stage = clamp(Math.floor(Number(data.worldBoss.stage) || 0), 0, WORLD_BOSSES_PER_DAY - 1);
    if (data.worldBoss.defeatedAt && data.worldBoss.stage < WORLD_BOSSES_PER_DAY - 1) {
      const nextStage = data.worldBoss.stage + 1;
      const baseIndex = Math.abs([...date].reduce((sum, char) => sum + char.charCodeAt(0), 0)) % WORLD_BOSSES.length;
      const template = WORLD_BOSSES[(baseIndex + nextStage) % WORLD_BOSSES.length];
      const population = Math.max(1, Object.keys(data.players || {}).length);
      const maxHp = Math.round(template.hp * (1 + Math.min(4, population / 12)));
      data.worldBoss = { date, stage: nextStage, name: template.name, icon: template.icon, power: template.power, asset: template.asset, hp: maxHp, maxHp, contributions: {}, defeatedAt: 0, rewardsGiven: false };
      return data.worldBoss;
    }
    const template = WORLD_BOSSES.find(entry => entry.name === data.worldBoss.name);
    if (template?.asset && !data.worldBoss.asset) data.worldBoss.asset = template.asset;
    return data.worldBoss;
  }
  const template = WORLD_BOSSES[Math.abs([...date].reduce((sum, char) => sum + char.charCodeAt(0), 0)) % WORLD_BOSSES.length];
  const population = Math.max(1, Object.keys(data.players || {}).length);
  const maxHp = Math.round(template.hp * (1 + Math.min(4, population / 12)));
  data.worldBoss = { date, stage: 0, name: template.name, icon: template.icon, power: template.power, asset: template.asset, hp: maxHp, maxHp, contributions: {}, defeatedAt: 0, rewardsGiven: false };
  return data.worldBoss;
}
function materialText(materials) {
  return Object.entries(materials).map(([key, quantity]) => `${ITEMS[key]?.icon || "📦"} ${ITEMS[key]?.name || key} ×${quantity}`).join(" · ");
}
function settleMarket(data) {
  data.market ||= { listings: {}, history: [] };
  data.market.listings ||= {}; data.market.history ||= [];
  const now = Date.now(), events = [];
  for (const [listingId, listing] of Object.entries(data.market.listings)) {
    if (listing.status !== "active" || listing.expiresAt > now) continue;
    const seller = data.players[playerKey(listing.sellerId)], item = ITEMS[listing.itemKey];
    if (listing.type === "auction" && listing.bidderId) {
      const buyer = data.players[playerKey(listing.bidderId)], tax = Math.floor(listing.currentBid * .05);
      if (buyer && seller && item) { buyer.inventory ||= {}; buyer.inventory[listing.itemKey] = (buyer.inventory[listing.itemKey] || 0) + listing.quantity; seller.stones += listing.currentBid - tax; listing.status = "sold"; listing.tax = tax; events.push(`🔨 ${listingId}: ${buyer.name} thắng ${item.name} ×${listing.quantity} với ${fmt(listing.currentBid)} ◈.`); }
      else { if (buyer) buyer.stones += listing.currentBid; if (seller) seller.inventory[listing.itemKey] = (seller.inventory[listing.itemKey] || 0) + listing.quantity; listing.status = "cancelled"; }
    } else { if (seller) seller.inventory[listing.itemKey] = (seller.inventory[listing.itemKey] || 0) + listing.quantity; listing.status = "expired"; events.push(`⌛ ${listingId}: hết hạn, vật phẩm đã trả lại ${seller?.name || "người bán"}.`); }
    listing.closedAt = now; data.market.history.push({ ...listing, id: listingId });
  }
  data.market.history = data.market.history.slice(-100);
  for (const [listingId, listing] of Object.entries(data.market.listings)) if (listing.status !== "active" && now - (listing.closedAt || now) > 24 * 60 * 60_000) delete data.market.listings[listingId];
  return events;
}
function breakthroughRequirement(p) {
  const r = p.realm || 0;
  const material = r < 2 ? "tulinhdan" : r < 5 ? "linhduoc" : r < 8 ? "giaolonglinh" : r < 11 ? "phuonghoatinh" : r < 14 ? "tieuthienhuyet" : "batdai";
  const map = MAPS[p.activeMap] || MAPS.thachthon;
  const majorBreak = minorRealm(p) === minorStages(p).length - 1;
  return { material, quantity: 1 + Math.floor(r / 3) + (majorBreak ? 2 : 0), bossKills: 2 + Math.floor(r / 2) + (majorBreak ? 2 : 0), map, majorBreak };
}
function missingBreakthroughRequirements(p) {
  const req = breakthroughRequirement(p), missing = [];
  if ((p.inventory?.[req.material] || 0) < req.quantity) missing.push(`${ITEMS[req.material].icon} ${ITEMS[req.material].name} ×${req.quantity}`);
  if (mapBossKills(p) < req.bossKills) missing.push(`👹 Hạ Boss tại ${req.map.name} ${req.bossKills} lần (${mapBossKills(p)}/${req.bossKills})`);
  if (req.majorBreak && mapCultivation(p) < req.map.need) missing.push(`🗺️ Hoàn thành ${req.map.name} (${fmt(mapCultivation(p))}/${fmt(req.map.need)})`);
  return { req, missing };
}
function simulateIdle(p, elapsedMs) {
  const minutes = Math.floor(Math.min(8 * 3_600_000, Math.max(0, elapsedMs)) / 60_000), mode = p.autoTrain?.mode || "tuluyen", level = clamp(p.autoTrain?.monsterLevel || 1, 1, 15);
  const result = { minutes, cultivation: 0, stones: 0, breakthroughs: [], hunts: 0, huntWins: 0, mode, level, needsManualTribulation: ["dotpha", "full"].includes(mode) };
  if (minutes < 5) return result;
  const rate = stats(p).cultivationRate;
  if (["tuluyen", "dotpha", "full"].includes(mode)) {
    result.cultivation = Math.round(minutes * (2 + p.realm) * rate); result.stones += Math.floor(minutes / 5) * (3 + p.realm); addCultivation(p, result.cultivation);
  }
  if (["san", "full"].includes(mode)) {
    result.hunts = Math.min(24, Math.floor(minutes / 12)); const monster = MONSTERS[level - 1];
    for (let i = 0; i < result.hunts; i++) { const enemyPower = Math.round((330 + level * 390 + p.realm * 165) * monster[2]), skill = selectedCombatSkill(p), myPower = stats(p).power * skill.mult; if (myPower * (.82 + Math.random() * .38) >= enemyPower * (.85 + Math.random() * .25)) { const cultivation = 55 + level * 45, stones = 22 + level * 24; addCultivation(p, cultivation); result.cultivation += cultivation; result.stones += stones; result.huntWins++; p.kills++; p.wins++; } else p.losses++; }
  }
  p.stones += result.stones;
  return result;
}
function idleSummary(result) {
  const modeNames = { tuluyen: "Tu luyện", dotpha: "Tu luyện + đột phá", san: `Săn yêu cấp ${result.level}`, full: `Toàn năng · săn cấp ${result.level}` };
  return `💤 KẾT QUẢ TREO · ${modeNames[result.mode]}\n\n⏱️ ${result.minutes} phút\n🧘 +${fmt(result.cultivation)} tu vi\n◈ +${fmt(result.stones)} linh thạch${result.hunts ? `\n🐉 Săn ${result.hunts} trận · thắng ${result.huntWins}` : ""}${result.needsManualTribulation ? "\n🌩️ Thiên kiếp không thể treo tự vượt — đủ điều kiện hãy tự gõ dotpha." : ""}`;
}

function rounded(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}
function text(ctx, value, x, y, size, color = "#fff", align = "left", weight = "normal") {
  ctx.font = `${weight} ${size}px TuTienText`; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(String(value), x, y);
}
function fitText(ctx, value, x, y, maxWidth, size, color = "#fff", align = "left", weight = "normal") {
  const raw = String(value ?? ""), family = "TuTienText";
  let fontSize = size;
  ctx.textAlign = align;
  while (fontSize > 11) {
    ctx.font = `${weight} ${fontSize}px ${family}`;
    if (ctx.measureText(raw).width <= maxWidth) break;
    fontSize -= 1;
  }
  let valueToDraw = raw;
  if (ctx.measureText(valueToDraw).width > maxWidth) {
    while (valueToDraw.length > 1 && ctx.measureText(`${valueToDraw}…`).width > maxWidth) valueToDraw = valueToDraw.slice(0, -1);
    valueToDraw = `${valueToDraw}…`;
  }
  ctx.fillStyle = color; ctx.fillText(valueToDraw, x, y);
}
function bar(ctx, x, y, w, value, color) {
  rounded(ctx, x, y, w, 16, 8, "rgba(255,255,255,.12)"); rounded(ctx, x, y, Math.max(12, w * clamp(value, 0, 1)), 16, 8, color);
}
function backdrop(ctx, W, H, color) {
  const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#07131f"); g.addColorStop(.55, "#12243a"); g.addColorStop(1, "#25162e"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = .16; ctx.fillStyle = color; for (let i = 0; i < 45; i++) { const x = (i * 173) % W, y = (i * 97) % H, r = 2 + i % 7; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1;
  const moon = ctx.createRadialGradient(W - 160, 135, 8, W - 160, 135, 100); moon.addColorStop(0, "rgba(255,244,195,.85)"); moon.addColorStop(1, "rgba(255,244,195,0)"); ctx.fillStyle = moon; ctx.fillRect(W - 280, 15, 240, 240);
}
function drawSprite(ctx, sheet, index, cx, bottom, maxW, maxH, flip = false) {
  const sw = sheet.width / 5, sh = sheet.height, scale = Math.min(maxW / sw, maxH / sh), dw = sw * scale, dh = sh * scale;
  ctx.save(); ctx.translate(cx, 0); if (flip) ctx.scale(-1, 1);
  ctx.drawImage(sheet, index * sw, 0, sw, sh, -dw / 2, bottom - dh, dw, dh); ctx.restore();
}
async function saveCanvas(canvas, tag) { const file = path.join(os.tmpdir(), `tutien-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}.png`); await fsp.writeFile(file, canvas.toBuffer("image/png")); return file; }

function profileTitle(p) {
  const title = String(p?.heavenlyTitle || "").trim();
  return title || (p?.isHeavenlyDao ? "Thiên Đạo · Chúa Tể Vạn Giới" : "");
}

export async function renderActionGif(p, type, success = true) {
  return encodeSceneGif(await createActionScene(p, type, success, SECTS[p.sect], realmTitle(p)));
}

async function renderProfileStatic(p) {
  const W = 1000, H = 1180, canvas = createCanvas(W, H), ctx = canvas.getContext("2d"), sect = SECTS[p.sect], st = stats(p), current = realm(p), next = nextNeed(p), heroes = await loadHeroSheet(p.gender);
  backdrop(ctx, W, H, sect.color); rounded(ctx, 34, 28, 932, 1118, 34, "rgba(5,12,22,.88)", `${sect.color}66`);
  ctx.fillStyle = `${sect.color}18`; ctx.fillRect(34, 28, 932, 170);
  text(ctx, "TIÊN LỘ VẤN ĐẠO", 500, 102, 36, "#f5d98b", "center", "bold"); text(ctx, p.isHeavenlyDao ? "THIÊN ĐẠO · CHÚA TỂ VẠN GIỚI" : `HỒ SƠ TU SĨ${p.rebirth ? ` · ${p.rebirth} CHUYỂN` : ""}`, 500, 140, 17, p.isHeavenlyDao ? "#ffd966" : "#8ea6bb", "center", "bold");
  const glow = ctx.createRadialGradient(175, 270, 20, 175, 270, 135); glow.addColorStop(0, `${sect.color}77`); glow.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = glow; ctx.fillRect(35, 145, 280, 245);
  drawSprite(ctx, heroes, SECT_INDEX[p.sect], 175, 378, 255, 255); fitText(ctx, p.name, 330, 230, 565, 34, "#fff", "left", "bold"); fitText(ctx, `${sect.name} · ${p.gender === "nu" ? "Nữ" : "Nam"}`, 330, 274, 565, 23, sect.color, "left", "bold"); fitText(ctx, `Tuyệt kỹ · ${sect.skill}`, 330, 312, 565, 19, "#aebccc");
  const title = profileTitle(p); if (title) { rounded(ctx, 330, 326, 565, 38, 19, p.isHeavenlyDao ? "rgba(255,217,102,.18)" : "rgba(255,255,255,.08)", p.isHeavenlyDao ? "rgba(255,217,102,.7)" : "rgba(255,255,255,.18)"); fitText(ctx, `✦ ${title}`, 350, 351, 525, 18, p.isHeavenlyDao ? "#ffe58a" : "#d9c5ff", "left", "bold"); }
  rounded(ctx, 82, 385, 836, 150, 22, "rgba(255,255,255,.065)", "rgba(255,255,255,.12)"); text(ctx, realmTitle(p), 110, 432, 28, "#f5d98b", "left", "bold"); text(ctx, p.realm >= REALMS.length - 1 ? "Đại đạo viên mãn" : `${fmt(p.cultivation)} / ${fmt(next)} tu vi`, 890, 430, 19, "#c6d2dc", "right");
  const prev = current[1], ratio = next === Infinity ? 1 : (p.cultivation - prev) / Math.max(1, next - prev); bar(ctx, 110, 462, 780, ratio, sect.color); text(ctx, `LINH THẠCH   ${fmt(p.stones)}        THỂ LỰC   ${p.energy}/${MAX_ENERGY}`, 110, 510, 18, "#b7c4cf", "left", "600");
  text(ctx, "CHIẾN LỰC", 82, 600, 18, "#7f96aa", "left", "bold"); text(ctx, fmt(st.power), 82, 652, 42, "#fff", "left", "bold");
  const cards = [["CÔNG", st.atk, "#ff7b69"], ["THỦ", st.def, "#6bbcff"], ["SINH MỆNH", st.hp, "#66d59a"]];
  cards.forEach(([label, val, color], i) => { const x = 82 + i * 278; rounded(ctx, x, 700, 248, 112, 18, "rgba(255,255,255,.065)", `${color}55`); text(ctx, label, x + 22, 738, 15, "#8097aa", "left", "bold"); text(ctx, fmt(val), x + 22, 782, 28, color, "left", "bold"); });
  text(ctx, "HÀNH TRANG & CHIẾN TÍCH", 82, 872, 18, "#7f96aa", "left", "bold"); rounded(ctx, 82, 897, 836, 225, 18, "rgba(255,255,255,.055)", "rgba(255,255,255,.11)");
  fitText(ctx, `VŨ KHÍ   ${p.equipment?.weapon?.name || "Chưa có"}        HỘ GIÁP   ${p.equipment?.armor?.name || "Chưa có"}`, 112, 942, 780, 17, "#d8e2ea", "left", "600");
  fitText(ctx, `PHÁP BẢO   ${p.equipment?.artifact?.name || "Chưa có"}        CÔNG PHÁP   ${TECHNIQUES[p.activeTechnique]?.name || "Dẫn Khí Thuật"}`, 112, 983, 780, 17, "#d8e2ea", "left", "600");
  text(ctx, `SĂN YÊU  ${p.kills}     BOSS  ${p.bossKills || 0}     THẮNG  ${p.wins}     BẠI  ${p.losses}`, 112, 1028, 17, "#9cafbe", "left", "600");
  const currentMap = MAPS[p.activeMap] || MAPS.thachthon;
  fitText(ctx, `BẢN ĐỒ   ${currentMap.name}   ·   ${fmt(mapCultivation(p))}/${fmt(currentMap.need)} tu vi map`, 112, 1060, 780, 16, "#c7b6e7", "left", "600");
  const faction = activeFaction(p);
  fitText(ctx, `ĐẠO LỮ   ${p.daoLu?.name || "Chưa kết duyên"}`, 112, 1085, 780, 16, "#c7b6e7", "left", "600");
  fitText(ctx, `THẾ LỰC KHU VỰC   ${faction?.name || "Chưa gia nhập"}`, 112, 1110, 780, 16, faction ? sect.color : "#9cafbe", "left", "600");
  text(ctx, "Ngẩng đầu ba thước có thần minh · Nghịch thiên cải mệnh", 500, 1135, 15, "#71879a", "center");
  return saveCanvas(canvas, "profile");
}

async function renderProfile(p) {
  try {
    const payload = {
      kind: "profile",
      p,
      sect: SECTS[p.sect],
      realmName: realmTitle(p),
      profileData: {
        st: stats(p),
        current: realm(p),
        next: nextNeed(p),
        title: profileTitle(p),
        currentMap: MAPS[p.activeMap] || MAPS.thachthon,
        mapCult: mapCultivation(p),
        mapBoss: mapBossKills(p),
        faction: activeFaction(p),
        techName: TECHNIQUES[p.activeTechnique]?.name || "Dẫn Khí Thuật",
      },
    };
    return await renderGifInWorker(payload);
  } catch (error) {
    console.error("[tu-tien] Không thể render profile GIF, dùng ảnh tĩnh:", error.message);
    return renderProfileStatic(p);
  }
}

export async function renderBattleGif(p, enemy, result) {
  return encodeSceneGif(await createBattleScene(p, enemy, result, SECTS[p.sect], realmTitle(p)));
}

let gifQueue = Promise.resolve();
let gifQueueDepth = 0;
function renderGifInWorker(payload) {
  if (gifQueueDepth >= 3) return Promise.reject(new Error("Hàng chờ GIF đang đầy"));
  gifQueueDepth++;
  const task = gifQueue.then(() => runRenderJob(payload));
  gifQueue = task.catch(() => {}).finally(() => { gifQueueDepth--; });
  return task;
}

async function animatedOrProfile(p, payload) {
  try { return await renderGifInWorker(payload); }
  catch (error) { console.error("[tu-tien] Không thể render GIF, dùng ảnh tĩnh:", error.message); return renderProfileStatic(p); }
}

async function sendImage(api, message, file, caption = "") { try { await api.sendMessage({ msg: caption, attachments: [file], ttl: 600000 }, message.threadId, message.type); } finally { await fsp.unlink(file).catch(() => {}); } }
async function sendTextChunks(api, message, value, maxLength = 1800) {
  const paragraphs = String(value || "").split("\n\n"), chunks = [];
  let current = "";
  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxLength) { current = candidate; continue; }
    if (current) chunks.push(current);
    if (paragraph.length <= maxLength) { current = paragraph; continue; }
    const lines = paragraph.split("\n"); current = "";
    for (const line of lines) {
      const lineCandidate = current ? `${current}\n${line}` : line;
      if (lineCandidate.length > maxLength && current) { chunks.push(current); current = line; }
      else current = lineCandidate;
    }
  }
  if (current) chunks.push(current);
  for (let index = 0; index < chunks.length; index++) {
    const heading = chunks.length > 1 ? `📖 HƯỚNG DẪN TU TIÊN · ${index + 1}/${chunks.length}\n\n` : "";
    await api.sendMessage({ msg: `${heading}${chunks[index]}` }, message.threadId, message.type);
  }
}
function help(prefix) {
  return [
    "☯️ TIÊN LỘ VẤN ĐẠO · HƯỚNG DẪN",
    "",
    "🌱 BẮT ĐẦU",
    `1. ${prefix}tt monphai — xem Ngũ Đại Môn Phái.`,
    `2. ${prefix}tt nhap <kiem|dan|ma|phat|linh> <nam|nu> <tên>`,
    `   Ví dụ: ${prefix}tt nhap kiem nu Thanh Nguyệt`,
    `3. ${prefix}tt — xem hồ sơ, cảnh giới, tu vi và chiến lực.`,
    "",
    "🧘 TU LUYỆN & ĐỘT PHÁ",
    `• ${prefix}tt tuluyen — nhận tu vi, linh thạch và hồi một ít thể lực (hồi chiêu 90 giây).`,
    `• ${prefix}tt daily — hồi đầy thể lực và nhận bổng lộc mỗi ngày.`,
    `• ${prefix}tt dung tulinhdan — dùng đan dược để hồi tu vi; ${prefix}tt tui — xem vật phẩm.`,
    "• Nếu thất bại đột phá: dùng tuluyen, daily, đan dược và săn Boss để hồi phục rồi thử lại.",
    `• ${prefix}tt dotpha — cần đủ tu vi, nguyên liệu, Boss tại map hiện tại; tầng cuối còn phải hoàn thành tu vi map.`,
    "• Đột phá tiêu hao nguyên liệu và một phần tu vi để ổn định căn cơ; thất bại mất thêm tu vi/thể lực.",
    "• Thiên đạo giáng kiếp: Tiểu Thiên Kiếp 3 lôi, Lục Hợp 6 lôi, Cửu Cửu 9 lôi. Đủ điều kiện vẫn có thể bại dưới lôi kiếp.",
    "• Phù Hộ Kiếp chỉ tăng cơ hội, không thay thế nguyên liệu hoặc Boss.",
    "",
    "⚔️ SĂN YÊU & PHẦN THƯỞNG",
    `• ${prefix}tt san [1-15] — săn 15 cấp yêu thú; cấp càng cao thưởng và đồ rơi càng tốt.`,
    `• ${prefix}tt boss — xem Boss tại map hiện tại; ${prefix}tt boss <mã_boss> để khiêu chiến.`,
    `• ${prefix}tt boss <mã_map> <mã_boss> — đánh Boss ở map đã mở; mỗi Boss có hồi chiêu, độ khó và rơi đồ riêng.`,
    `• ${prefix}tt map — xem bản đồ; hanhtrinh <mã> để di chuyển.`,
    `• ${prefix}tt tongmon — xem thế lực của map hiện tại; tongmon nhap <mã> để gia nhập một thế lực khu vực.`,
    `• ${prefix}tt daily — nhận bổng lộc mỗi ngày: linh thạch, đan dược và đầy thể lực.`,
    `• ${prefix}tt nhiemvu — làm 3 lần tu luyện, 2 trận săn và 1 Boss để nhận thưởng ngày.`,
    `• ${prefix}tt pk @người_chơi — gửi lời PK; đối thủ phải thả ❤️ đúng tin mời mới bắt đầu.`,
    `• ${prefix}tt daudoi 2v2 @đồng_đội @địch_1 @địch_2 — tất cả người được tag phải thả ❤️; 3v3 tag 5 người theo cùng thứ tự.`,
    `• ${prefix}tt phoban — xem bí cảnh; phoban <mã> để vượt ải tiếp theo, mỗi phó bản có Boss tầng cuối.`,
    `• ${prefix}tt todoi phoban <mã> — cả đội cùng vượt bí cảnh, nhận hiệp lực và tự roll vật phẩm.`,
    `• ${prefix}tt daolu @người_chơi — cầu hôn; người kia gõ daolu chapnhan để kết đạo lữ.`,
    `• ${prefix}tt songtu @người_chơi — gửi lời mời Song Tu (❤️ đồng ý · 👍 từ chối). Khi đã kết đôi, cùng map gõ songtu để tu chung.`,
    "",
    "🎒 VẬT PHẨM & TRANG BỊ",
    `• ${prefix}tt shop [vk|giap|pb|mu|giay|nhan|dan|nl] — xem cửa hàng.`,
    `• ${prefix}tt mua <mã> [số lượng|xSL] · ${prefix}tt tui — ví dụ mua ngodaodan 2000 hoặc linhduoc x5.`,
    `• ${prefix}tt dung <mã> [xSL|all] · ${prefix}tt trangbi <mã> — ví dụ: dung tulinhdan x50 hoặc dung tulinhdan all.`,
    `• ${prefix}tt luyenkhi <ô> — cường hóa đồ đang mặc; ô: weapon, armor, artifact, helmet, boots, ring.`,
    `• ${prefix}tt linhthu — thuần hóa và nuôi linh thú đồng hành tăng chiến lực.`,
    `• ${prefix}tt thamhiem — gặp sự kiện ngẫu nhiên tại map hiện tại (5 phút/lần).`,
    `• ${prefix}tt thanhtuu — xem và tự nhận thưởng thành tựu một lần.`,
    `• ${prefix}tt chetao — ghép nguyên liệu farm thành đan dược và trang bị hiếm.`,
    `• ${prefix}tt luyendan <cuonglucdan|ngoidaodan> [1-20] — Luyện Đan Sư luyện theo phẩm chất, có thể nhận thêm thành phẩm.`,
    `• ${prefix}tt thegioiboss — cùng toàn server bào HP Boss, xếp hạng sát thương và chia thưởng.`,
    `• ${prefix}tt todoi — lập tổ đội cố định, tham gia bằng mã và cùng đánh Boss map.`,
    `• ${prefix}tt banghoi — lập tông môn người chơi, góp quỹ để nâng cấp và nhận buff toàn thành viên.`,
    `• ${prefix}tt cho — chợ công khai: đăng bán, tìm kiếm, mua ngay, hủy đơn và xem lịch sử.`,
    `• ${prefix}tt daugia — ký gửi đấu giá 1-24 giờ; hệ thống giữ tiền đấu giá và tự hoàn cho người bị vượt giá.`,
    `• ${prefix}tt sudo · nghenghiep · kham · tayluyen · setdo — sư đồ, nghề và hoàn thiện trang bị.`,
    `• ${prefix}tt cottruyen · dautruong · chuyensinh · truyna — cốt truyện, PvP mùa và hậu kỳ.`,
    `• ${prefix}tt dongphu · bangchien — trồng linh dược, nâng động phủ và tranh điểm mùa, lãnh địa tông môn.`,
    `• ${prefix}tt thienkiep · ditich · bicanh · bossraid — thiên kiếp lựa chọn, di tích server, roguelike và Boss ba giai đoạn.`,
    `• ${prefix}tt danlo · traodoi · muagiai · doihinh — nâng lò, đổi đồ hai chiều, thưởng mùa và vai trò tổ đội.`,
    `• ${prefix}tt linhthu tienhoa · linhthu sinhsan @người — huyết mạch và tiến hóa linh thú.`,
    "",
    "📖 CÔNG PHÁP & CHIẾN KỸ",
    `• ${prefix}tt congphap — xem công pháp; hoc <mã> để học, chon <mã> để vận hành.`,
    `• ${prefix}tt chienky — xem chiêu đã mở; chieu <mã> — chọn chiêu khi giao chiến.`,
    `• ${prefix}tt rank — xem Tiên Bảng.`,
    `• ${prefix}tt donate [10k|20k|50k|100k|200k] — lấy QR donate và nhận tu vi tự động.`,
    `• ${prefix}tt tang <linh_thạch> @người_chơi — tặng linh thạch cho tu sĩ khác.`,
    `• ${prefix}tt trao <mã_vật_phẩm> <SL> <giá_linh_thạch> @người_mua — gửi đề nghị giao dịch.`,
    `• Người mua dùng ${prefix}tt trao chapnhan hoặc ${prefix}tt trao tuchoi trong 5 phút.`,
    "",
    "💤 TREO MÁY / OFFLINE",
    `• ${prefix}tt treo bat tuluyen`,
    `• ${prefix}tt treo bat dotpha — chỉ tích lũy tu vi; Thiên kiếp phải tự gõ dotpha để vượt.`,
    `• ${prefix}tt treo bat san 2`,
    `• ${prefix}tt treo bat full 2 — tu luyện + đột phá + săn yêu cấp 2.`,
    `• Gõ ${prefix}tt treo để nhận kết quả; ${prefix}tt treo tat để dừng. Tối đa 8 giờ, cần treo ít nhất 5 phút mới có thu hoạch.`,
    "",
    `❓ Xem lại hướng dẫn: ${prefix}tt help hoặc ${prefix}tt huongdan`,
    "Môn phái: kiem · dan · ma · phat · linh. Linh thạch chỉ dùng trong game.",
  ].join("\n");
}
function parseBody(message) { const raw = typeof message.data?.content === "string" ? message.data.content : message.data?.content?.title || ""; return raw.trim().split(/\s+/).slice(1); }
function commandPrefix(message) { const raw = typeof message.data?.content === "string" ? message.data.content.trim() : message.data?.content?.title?.trim() || ""; const token = raw.split(/\s+/, 1)[0]; return token.replace(/(?:tutien|xianxia|tt)$/i, "") || "!"; }
function sessionKey(api, message) { return `${api.getBotId()}:${message.threadId}:${message.data.uidFrom}`; }
function openSession(api, message) {
  const key = sessionKey(api, message), expiresAt = Date.now() + SESSION_TTL;
  sessions.set(key, expiresAt);
  const snapshot = getSessionSnapshot(api.getBotId());
  snapshot[key] = expiresAt;
  persistSessionSnapshot(api.getBotId());
}
function getSessionExpiry(api, key) {
  if (sessions.has(key)) return sessions.get(key);
  const value = Number(getSessionSnapshot(api.getBotId())[key] || 0);
  if (value > 0) sessions.set(key, value);
  return value;
}
function closeSession(api, key) {
  sessions.delete(key);
  const snapshot = getSessionSnapshot(api.getBotId());
  delete snapshot[key];
  persistSessionSnapshot(api.getBotId());
}
const SESSION_COMMANDS = new Set(["xem","info","hoso","tuluyen","dotpha","thienkiep","san","boss","bossraid","phoban","bicanh","ditich","ai","daudoi","2v2","3v3","doihinh","luyenkhi","cuonghoa","luyendan","danlo","linhthu","thamhiem","thanhtuu","muagiai","chetao","thegioiboss","worldboss","todoi","party","banghoi","guild","cho","market","daugia","auction","traodoi","sudo","nghenghiep","kham","tayluyen","setdo","cottruyen","dautruong","chuyensinh","truyna","dongphu","bangchien","thiendao","map","hanhtrinh","tongmon","daolu","huydaolu","songtu","pk","treo","offline","thutuvi","daily","tui","shop","mua","dung","trangbi","nhiemvu","nv","quest","rank","monphai","nhap","congphap","hoc","chon","chienky","chieu","donate","buff","tang","trao","help","huongdan"]);

export async function handleTuTienShortcut(api, message) {
  const key = sessionKey(api, message), expires = getSessionExpiry(api, key), now = Date.now();
  if (!expires || expires <= now) { closeSession(api, key); return false; }
  const raw = typeof message.data?.content === "string" ? message.data.content.trim() : "";
  if (!raw || raw.length > 100) return false;
  const first = raw.split(/\s+/, 1)[0].toLowerCase();
  if (["thoat", "exit", "dong"].includes(first)) { closeSession(api, key); await api.sendMessage({ msg: "🚪 Đã đóng phiên tu tiên. Mở lại bằng !tt", quote: message }, message.threadId, message.type); return true; }
  if (!SESSION_COMMANDS.has(first)) return false;
  sessions.set(key, now + SESSION_TTL);
  const snapshot = getSessionSnapshot(api.getBotId()); snapshot[key] = now + SESSION_TTL; persistSessionSnapshot(api.getBotId());
  const routed = { ...message, __originalQuoteMessage: message, data: { ...message.data, content: `!tt ${raw}` } };
  await handleTuTienCommand(api, routed);
  return true;
}

async function executePvPMatch(api, targetThreadId, targetMessageType, pvpInvite, data, botId) {
  const players = pvpInvite.participantIds.map(uid => data.players[playerKey(uid)]), cost = pvpInvite.mode === "PK" ? 20 : pvpInvite.size === 2 ? 24 : 28;
  if (players.some(player => !player)) {
    writeData(botId, data);
    await api.sendMessage({ msg: "⚠️ Có nhân vật không còn tồn tại; trận đã hủy." }, targetThreadId, targetMessageType);
    return true;
  }
  players.forEach(refreshPlayer);
  if (players.some(player => player.energy < cost)) {
    writeData(botId, data);
    await api.sendMessage({ msg: `⚡ Có tu sĩ không đủ ${cost} thể lực; trận tỷ thí đã hủy.` }, targetThreadId, targetMessageType);
    return true;
  }
  const teamA = pvpInvite.teamAIds.map(uid => data.players[playerKey(uid)]), teamB = pvpInvite.teamBIds.map(uid => data.players[playerKey(uid)]), powerA = teamPower(teamA), powerB = teamPower(teamB), aWins = powerA * (.86 + Math.random() * .28) >= powerB * (.86 + Math.random() * .28), winners = aWins ? teamA : teamB, losers = aWins ? teamB : teamA;
  const cultivation = 70 + Math.max(...players.map(player => player.realm || 0)) * 35 + (pvpInvite.size - 1) * 40, stones = 28 + pvpInvite.size * 25;
  for (const player of players) player.energy -= cost;
  for (const player of winners) { player.wins++; if (pvpInvite.size > 1) player.teamWins = (player.teamWins || 0) + 1; addCultivation(player, cultivation); player.stones += stones; }
  for (const player of losers) { player.losses++; if (pvpInvite.size > 1) player.teamLosses = (player.teamLosses || 0) + 1; }
  writeData(botId, data);
  const p1 = teamA[0], p2 = teamB[0];
  const skillA = selectedCombatSkill(p1), skillB = selectedCombatSkill(p2);
  const enemy = {
    name: p2.name,
    gender: p2.gender,
    sect: p2.sect,
    realm: p2.realm,
    level: (p2.realm || 0) + 1,
    equipment: p2.equipment,
    title: realmTitle(p2),
    isPlayer: true,
  };
  const result = {
    win: aWins,
    myPower: powerA,
    enemyPower: powerB,
    cultivation,
    stones,
    skillName: aWins ? skillA.name : skillB.name,
    log: aWins ? `${p1.name} thi triển ${skillA.name} áp đảo ${p2.name}!` : `${p2.name} phản kích bằng ${skillB.name} đánh lui ${p1.name}!`,
  };
  const winnerName = aWins ? (pvpInvite.size === 1 ? p1.name : "Đội Xanh") : (pvpInvite.size === 1 ? p2.name : "Đội Đỏ");
  const caption = `⚔️ ${pvpInvite.mode} · TIÊN GIẢ ĐỐI QUYẾT\n\n🔵 ${teamA.map(x=>x.name).join(" · ")} (${fmt(powerA)} CL)\n🔴 ${teamB.map(x=>x.name).join(" · ")} (${fmt(powerB)} CL)\n\n🏆 ${winnerName} chiến thắng vang dội!\n🎁 Mỗi người thắng: +${fmt(cultivation)} tu vi · +${fmt(stones)} linh thạch.`;
  try {
    const gifFile = await animatedOrProfile(p1, { kind: "battle", p: p1, enemy, result, realmName: realmTitle(p1), sect: SECTS[p1.sect] });
    await sendImage(api, { threadId: targetThreadId, type: targetMessageType }, gifFile, caption);
  } catch (err) {
    console.error("[tu-tien] Lỗi gửi GIF PK:", err);
    await api.sendMessage({ msg: caption }, targetThreadId, targetMessageType);
  }
  return true;
}

// Song tu được xác nhận bằng reaction trên đúng tin mời: ❤️ đồng ý, 👍 từ chối.
export async function handleTuTienReaction(api, reaction) {
  const rType = Number(reaction.data?.content?.rType);
  const rIcon = String(reaction.data?.content?.rIcon || "");
  const normalizedIcon = rIcon.replace(/\uFE0F/gu, "");
  const isHeart = rType === 5 || ["/-heart", "❤️", "❤", "/heart", "💖", "💗", "💓"].includes(rIcon) || ["❤", "💖", "💗", "💓"].includes(normalizedIcon);
  const isLike = rType === 3 || ["/-strong", "👍", "👍🏻", "/like"].includes(rIcon) || ["👍"].includes(normalizedIcon);
  if (!isHeart && !isLike) return false;
  const reactorId = String(reaction.data?.uidFrom || reaction.senderId || "");
  let rawRMsg = reaction.data?.content?.rMsg;
  if (typeof rawRMsg === "string") {
    try { rawRMsg = JSON.parse(rawRMsg); } catch {}
  }
  const rMsg = Array.isArray(rawRMsg) ? (rawRMsg[0] || {}) : (rawRMsg || {});
  // Zalo có nhiều phiên bản dùng khác nhau về kiểu chữ/tên trường ID.
  const reactedIds = reactionMessageIds(rMsg);
  // Một số phiên bản Zalo gửi reaction không kèm rMsg (hoặc chỉ gửi ID
  // cục bộ). Vẫn cho phép đối chiếu theo lời mời đang chờ trong cùng nhóm/
  // theo UID người được mời thay vì bỏ qua event ngay tại đây.
  if (!reactorId) return false;
  const botId = api.getBotId(), data = readData(botId);
  data.pvpInvites ||= {};
  const threadIdForFallback = String(reaction.threadId || reaction.data?.threadId || reaction.data?.idTo || reaction.data?.grid || reaction.data?.toId || "");
  const normalizedReactorForFallback = normalizeUid(reactorId);
  const pvpInviteId = reactedIds.map(messageId => pendingPvPReactions.get(messageId)).find(Boolean)
    || Object.keys(data.pvpInvites).find(key => data.pvpInvites[key].messageIds?.some(messageId => reactedIds.includes(String(messageId))))
    // Một số payload reaction không trả rMsg ID; Giveaway dùng idTo làm dự phòng.
    || Object.keys(data.pvpInvites).filter(key => {
      const invite = data.pvpInvites[key];
      return invite.expiresAt >= Date.now() && threadIdForFallback && String(invite.threadId) === threadIdForFallback;
    }).sort((a, b) => Number(data.pvpInvites[b].expiresAt || 0) - Number(data.pvpInvites[a].expiresAt || 0))[0]
    // Cuối cùng đối chiếu theo người được mời (payload reaction của một số
    // phiên bản Zalo không có threadId/rMsg ổn định).
    || Object.keys(data.pvpInvites).filter(key => {
      const invite = data.pvpInvites[key];
      return invite.expiresAt >= Date.now() && invite.participantIds?.some(uid => normalizeUid(uid) === normalizedReactorForFallback);
    }).sort((a, b) => Number(data.pvpInvites[b].expiresAt || 0) - Number(data.pvpInvites[a].expiresAt || 0))[0];
  const pvpInvite = pvpInviteId && data.pvpInvites[pvpInviteId];
  if (pvpInvite) {
    const clear = () => (pvpInvite.messageIds || []).forEach(messageId => pendingPvPReactions.delete(String(messageId)));
    if (pvpInvite.expiresAt < Date.now()) { clear(); delete data.pvpInvites[pvpInviteId]; writeData(botId, data); return true; }
    const normalizedReactorId = normalizeUid(reactorId);
    const reactorParticipantId = pvpInvite.participantIds.find(uid => normalizeUid(uid) === normalizedReactorId);
    if (!reactorParticipantId || normalizeUid(reactorParticipantId) === normalizeUid(pvpInvite.initiatorId)) return false;
    const reactor = data.players[playerKey(reactorParticipantId)], messageType = reaction.isGroup ? MessageType.GroupMessage : MessageType.DirectMessage;
    if (isLike) { clear(); delete data.pvpInvites[pvpInviteId]; writeData(botId, data); await api.sendMessage({ msg: `👍 ${reactor?.name || "Người được mời"} đã từ chối; trận ${pvpInvite.mode} bị hủy.` }, reaction.threadId, messageType); return true; }
    pvpInvite.acceptedIds ||= [pvpInvite.initiatorId];
    if (!pvpInvite.acceptedIds.some(uid => normalizeUid(uid) === normalizedReactorId)) pvpInvite.acceptedIds.push(reactorParticipantId);
    const waiting = pvpInvite.participantIds.filter(uid => !pvpInvite.acceptedIds.some(accepted => normalizeUid(accepted) === normalizeUid(uid)));
    if (waiting.length) { writeData(botId, data); await api.sendMessage({ msg: `❤️ ${reactor?.name || "Một tu sĩ"} đã đồng ý ${pvpInvite.mode}. Còn chờ: ${waiting.map(uid => data.players[uid]?.name || uid).join(" · ")}.` }, reaction.threadId, messageType); return true; }
    clear(); delete data.pvpInvites[pvpInviteId];
    return executePvPMatch(api, reaction.threadId, messageType, pvpInvite, data, botId);
  }
  const pending = reactedIds.map(messageId => pendingSongTuReactions.get(messageId)).find(Boolean);
  const target = pending ? data.players[playerKey(pending.targetId)] : Object.values(data.players).find(player => {
    const invite = player.pendingSongTu;
    const messageIds = Array.isArray(invite?.messageIds) ? invite.messageIds.map(String) : [];
    return normalizeUid(player.userId) === normalizeUid(reactorId) && messageIds.some(id => reactedIds.includes(id));
  });
  if (!target) return false;
  const invite = target.pendingSongTu, proposer = data.players[playerKey(invite.fromId)];
  const clearInvite = () => (invite.messageIds || []).forEach(messageId => pendingSongTuReactions.delete(String(messageId)));
  if (!proposer || invite.expiresAt < Date.now()) {
    clearInvite(); delete target.pendingSongTu; writeData(botId, data);
    return true;
  }
  clearInvite(); delete target.pendingSongTu;
  const messageType = reaction.isGroup ? MessageType.GroupMessage : MessageType.DirectMessage;
  if (isLike) {
    writeData(botId, data);
    await api.sendMessage({ msg: `👍 ${target.name} đã từ chối lời mời Song Tu của ${proposer.name}.` }, reaction.threadId, messageType);
    return true;
  }
  if (target.songTu || proposer.songTu) {
    writeData(botId, data);
    await api.sendMessage({ msg: "💔 Một trong hai đã có đạo hữu Song Tu, lời mời không còn hiệu lực." }, reaction.threadId, messageType);
    return true;
  }
  target.songTu = { userId: proposer.userId, name: proposer.name, since: Date.now() };
  proposer.songTu = { userId: target.userId, name: target.name, since: Date.now() };
  writeData(botId, data);
  await api.sendMessage({ msg: `💞 ${target.name} đã thả ❤️ chấp thuận! ${proposer.name} và ${target.name} kết thành đạo hữu Song Tu.\nCùng map, gõ songtu để song tu mỗi 6 giờ.` }, reaction.threadId, messageType);
  return true;
}

export async function handleTuTienCommand(api, message) {
  // Responses and rendered GIFs always quote the command that initiated them,
  // so several players can play in one group without messages being confused.
  const originalApi = api, quote = message.__originalQuoteMessage || message;
  api = Object.create(api);
  api.sendMessage = (payload, threadId, type) => originalApi.sendMessage(
    typeof payload === "string" ? { msg: payload, quote } : { ...payload, quote: payload.quote || quote },
    threadId ?? message.threadId,
    type ?? message.type,
  );
  openSession(api, message);
  const botId = api.getBotId(), prefix = commandPrefix(message), args = parseBody(message), data = readData(botId), id = playerKey(message.data.uidFrom); let cmd = (args[0] || "").toLowerCase(), p = data.players[id];
  if (p?.disciples?.length) {
    const disciple = data.players[playerKey(p.disciples[0])];
    if (disciple) { p.companionName = disciple.name; p.companionSect = disciple.sect; }
  }
  if (["help", "huongdan"].includes(cmd)) return sendTextChunks(api, message, help(prefix));
  if (cmd === "monphai") return api.sendMessage({ msg: `🏯 NGŨ ĐẠI MÔN PHÁI\n\n${Object.entries(SECTS).map(([k,s]) => `${s.icon} ${k} — ${s.name}\n   ${s.skill} · Công x${s.atk} · Thủ x${s.def} · HP x${s.hp}`).join("\n\n")}\n\nGia nhập: nhap <môn> <nam|nu> <tên>\nVí dụ: nhap kiem nu Thanh Nguyệt` }, message.threadId, message.type);
  if (cmd === "nhap") { const sect = (args[1] || "").toLowerCase(), gender = (args[2] || "").toLowerCase(), characterName = args.slice(3).join(" ").trim(); if (p) return api.sendMessage({ msg: "Bạn đã bước lên tiên lộ, không thể tùy ý phản bội sư môn." }, message.threadId, message.type); if (!SECTS[sect] || !["nam","nu"].includes(gender) || !characterName) return api.sendMessage({ msg: `Cần chọn đủ môn phái, giới tính và tên nhân vật.\nVí dụ: nhap kiem nam Vô Trần\nMôn: kiem, dan, ma, phat, linh · Giới tính: nam, nu` }, message.threadId, message.type); p = newPlayer(sect, gender, characterName.slice(0, 24), id); data.players[id] = p; writeData(botId, data); return sendImage(api, message, await renderProfile(p), `🎊 ${SECTS[sect].name} đã thu nhận ${gender === "nu" ? "nữ" : "nam"} đệ tử ${p.name}!`); }
  if (cmd === "buff") {
    const manager = originalApi.apiManager;
    const canBuff = (manager?.isMainBot === true && id === playerKey(botId))
      || id === playerKey(manager?.idBotMainWithBot)
      || isAdmin(botId, id)
      || isBotLeader(botId, id);
    if (!canBuff) return originalApi.sendMessage(
      { msg: "⛔ Chỉ quản trị viên cấp cao mới được buff Tu Tiên.", quote },
      message.threadId,
      message.type,
    );
    const mention = Array.isArray(message.data?.mentions) ? message.data.mentions[0] : null;
    const targetId = playerKey(mention?.uid || mention?.userId || mention?.id || ""), target = data.players[targetId];
    if (!target) return api.sendMessage({ msg: `Cú pháp:\n${prefix}tt buff @người_chơi — lên Tiên Đế viên mãn\n${prefix}tt buff 10k @người_chơi — cộng tay mốc donate` }, message.threadId, message.type);
    const selection = commandArgumentWithoutMention(message, "buff");
    if (selection) {
      const tier = donateTier(selection);
      if (!tier) {
        const normalizedSelection = normalizeRealmName(selection);
        const nextRealm = ["canhgioi", "canh", "realm", "len1"].includes(normalizedSelection);
        const realmIndex = nextRealm ? Math.min(REALMS.length - 1, (target.realm || 0) + 1) : resolveRealmIndex(selection);
        if (realmIndex < 0) return api.sendMessage({ msg: `Cú pháp:\n${prefix}tt buff @người_chơi canhgioi — tăng 1 đại cảnh giới\n${prefix}tt buff @người_chơi Chân Tiên — đặt cảnh giới chỉ định\n${prefix}tt buff 50k @người_chơi — cộng mốc donate` }, message.threadId, message.type);
        setPlayerRealm(target, realmIndex); writeData(botId, data); flushJsonWrite(dataPath(botId));
        console.log(`[tu-tien:buff] bot=${botId} actor=${id} target=${targetId} realm=${realmIndex}`);
        return originalApi.sendMessage({ msg: `✅ Đã đưa ${target.name} lên ${realmTitle(target)} · ${fmt(target.cultivation)} tu vi.`, quote }, message.threadId, message.type);
      }
      applyTuTienDonation(target, tier, "admin", id);
      const mapAllocations = addMapCultivationCascade(target, tier.cultivation, target.activeMap || "thachthon");
      writeData(botId, data);
      flushJsonWrite(dataPath(botId));
      console.log(`[tu-tien:buff] bot=${botId} actor=${id} target=${targetId} amount=${tier.amount} cultivation=${tier.cultivation} stones=${tier.stones}`);
      const mapSummary = mapAllocations.map(entry => `${MAPS[entry.key].name} +${fmt(entry.amount)}`).join(" · ");
      return originalApi.sendMessage({ msg: `✅ Đã cộng mốc ${fmt(tier.amount)}đ cho ${target.name}: +${fmt(tier.cultivation)} tu vi, +${fmt(tier.stones)} linh thạch.\n🗺️ Tu vi map tự chuyển phần dư: ${mapSummary || "không có"}.`, quote }, message.threadId, message.type);
    }
    maximizePlayer(target); writeData(botId, data); flushJsonWrite(dataPath(botId));
    console.log(`[tu-tien:buff] bot=${botId} actor=${id} target=${targetId} max=true`);
    return originalApi.sendMessage({ msg: `✅ Đã buff ${target.name} lên Tiên Đế · Viên mãn, ${fmt(target.cultivation)} tu vi và mở toàn bộ bản đồ.`, quote }, message.threadId, message.type);
  }
  const heavenlyDaoId = playerKey(originalApi.apiManager?.idBotMainWithBot || botId), isHeavenlyDaoAccount = id === playerKey(botId) || id === heavenlyDaoId;
  if (!p && isHeavenlyDaoAccount) { p = newPlayer("kiem", "nam", "Thiên Đạo", id); p.isHeavenlyDao = true; maximizePlayer(p); p.stones = 9_999_999_999; data.players[id] = p; writeData(botId, data); }
  if (!p) return api.sendMessage({ msg: `Bạn chưa bước lên tiên lộ.\nXem môn phái: ${prefix}tt monphai` }, message.threadId, message.type);
  if (isHeavenlyDaoAccount) { p.name = "Thiên Đạo"; p.isHeavenlyDao = true; if (!p.heavenlyInitialized) { maximizePlayer(p); p.stones = Math.max(p.stones || 0, 9_999_999_999); p.heavenlyInitialized = true; writeData(botId, data); } }
  data.guilds ||= {}; data.parties ||= {}; data.market ||= { listings: {}, history: [] };
  p.name ||= message.data.dName || "Vô Danh"; p.gender ||= "nam"; p.energy = clamp(p.energy ?? MAX_ENERGY, 0, MAX_ENERGY); p.inventory ||= {}; p.actions ||= {}; p.equipment ||= {}; p.forgedItems ||= {}; p.techniques ||= ["dantho"]; p.activeTechnique ||= "dantho"; p.activeMap ||= "thachthon"; p.mapCultivation ||= {}; p.mapBossKills ||= {}; p.factions ||= {}; p.dungeons ||= {}; p.achievements ||= {}; p.teamWins ||= 0; p.teamLosses ||= 0; p.bossKills ||= 0;
  // Nâng trần thể lực mới; các nhân vật cũ được bù đầy một lần.
  if (!p.energyCapacityMigrated) { p.energy = MAX_ENERGY; p.energyCapacityMigrated = true; }
  // Tương thích nhân vật đã chơi ở tuyến map cũ trước khi đổi sang Thế Giới Hoàn Mỹ.
  const legacyMaps = { huanthu: "huthangioi", hoavuc: "thuonggioi" };
  if (legacyMaps[p.activeMap]) p.activeMap = legacyMaps[p.activeMap];
  for (const [oldKey, newKey] of Object.entries(legacyMaps)) {
    if (p.mapCultivation[oldKey] && !p.mapCultivation[newKey]) p.mapCultivation[newKey] = p.mapCultivation[oldKey];
  }
  if (!MAPS[p.activeMap]) p.activeMap = "thachthon";
  refreshPlayer(p);
  // Các thao tác với vật phẩm đều nhận mã đúng chính tả nhưng vẫn dùng khóa
  // lưu trữ cũ ở bên trong để tương thích dữ liệu người chơi hiện tại.
  if (["dung", "trangbi"].includes(cmd) && args[1]) args[1] = resolveItemCode(args[1]);
  if (cmd === "thiendao") {
    if (!p.isHeavenlyDao) return api.sendMessage({ msg: "⛔ Chỉ Thiên Đạo của Main Bot mới vận dụng được thiên quyền." }, message.threadId, message.type);
    const action=(args[1]||"").toLowerCase(),mention=Array.isArray(message.data?.mentions)?message.data.mentions[0]:null,targetId=playerKey(mention?.uid||mention?.userId||mention?.id||""),target=data.players[targetId];
    if(action==="thienphat"){if(!target||target===p)return api.sendMessage({msg:"Dùng: thiendao thienphat @người_chơi"},message.threadId,message.type);const lost=Math.floor(target.cultivation*.05);addCultivation(target,-lost);target.energy=0;target.wanted=(target.wanted||0)+3;writeData(botId,data);return api.sendMessage({msg:`⚡ Thiên phạt giáng xuống ${target.name}: mất ${fmt(lost)} tu vi, thể lực về 0, sát khí +3.`},message.threadId,message.type);}
    if(action==="anxa"){if(!target)return api.sendMessage({msg:"Dùng: thiendao anxa @người_chơi"},message.threadId,message.type);target.wanted=0;target.sealedUntil=0;target.energy=MAX_ENERGY;writeData(botId,data);return api.sendMessage({msg:`☀️ Thiên Đạo ân xá ${target.name}: xóa truy nã, giải phong ấn và hồi đầy thể lực.`},message.threadId,message.type);}
    if(action==="phongan"){const minutes=clamp(Number(args[2])||10,1,1440);if(!target||target===p)return api.sendMessage({msg:"Dùng: thiendao phongan <phút> @người_chơi (1-1440)."},message.threadId,message.type);target.sealedUntil=Date.now()+minutes*60_000;writeData(botId,data);return api.sendMessage({msg:`🔒 Đã phong ấn ${target.name} trong ${minutes} phút.`},message.threadId,message.type);}
    if(action==="sacphong"){if(!target)return api.sendMessage({msg:"Dùng: thiendao sacphong <danh_hiệu> @người_chơi"},message.threadId,message.type);const title=heavenlyTitleArgument(message);if(!title)return api.sendMessage({msg:"Danh hiệu không được để trống."},message.threadId,message.type);target.heavenlyTitle=title;writeData(botId,data);return api.sendMessage({msg:`👑 Sắc phong ${target.name}: “${title}”.`},message.threadId,message.type);}
    if(action==="hoisinh"){const boss=currentWorldBoss(data);boss.hp=boss.maxHp;boss.defeatedAt=0;boss.rewardsGiven=false;boss.contributions={};writeData(botId,data);return api.sendMessage({msg:`🌍 Đã hồi sinh ${boss.name} với ${fmt(boss.maxHp)} HP và xóa bảng sát thương.`},message.threadId,message.type);}
    if(action==="banphuc"){if(data.lastHeavenlyBlessing&&Date.now()-data.lastHeavenlyBlessing<24*60*60_000)return api.sendMessage({msg:`⏳ Ban phúc toàn server còn hồi ${waitText(24*60*60_000-(Date.now()-data.lastHeavenlyBlessing))}.`},message.threadId,message.type);for(const player of Object.values(data.players)){player.energy=MAX_ENERGY;player.stones=(player.stones||0)+1000;addCultivation(player,2000);}data.lastHeavenlyBlessing=Date.now();writeData(botId,data);return api.sendMessage({msg:`🌈 Thiên Đạo ban phúc toàn server: mỗi tu sĩ +2.000 tu vi, +1.000 linh thạch và đầy thể lực.`},message.threadId,message.type);}
    return api.sendMessage({msg:`☯️ THIÊN QUYỀN\n• thiendao thienphat @người\n• thiendao anxa @người\n• thiendao phongan <phút> @người\n• thiendao sacphong <danh hiệu> @người\n• thiendao hoisinh — hồi sinh Boss thế giới\n• thiendao banphuc — phát quà toàn server mỗi 24 giờ\n\nThiên Đạo có chiến lực cơ sở x1.000.`},message.threadId,message.type);
  }
  if (p.sealedUntil > Date.now()) return api.sendMessage({ msg: `🔒 Bạn đang chịu Thiên Đạo phong ấn, còn ${waitText(p.sealedUntil-Date.now())}.` }, message.threadId, message.type);
  if (cmd === "thienkiep") {
    const choice = (args[1] || "").toLowerCase();
    if (!p.pendingTribulation || p.pendingTribulation.expiresAt < Date.now()) {
      const patterns = ["loi", "hoa", "tamma"], pattern = patterns[Math.floor(Math.random() * patterns.length)];
      p.pendingTribulation = { pattern, expiresAt: Date.now() + 60_000 }; writeData(botId, data);
      return api.sendMessage({ msg: `🌩️ THIÊN KIẾP REALTIME\n${pattern === "loi" ? "Lôi trụ khóa thiên địa" : pattern === "hoa" ? "Thiên hỏa phủ kín đạo đài" : "Tâm ma xâm nhập thức hải"}.\n\nTrong 60 giây chọn: thienkiep <ne|thu|phan>` }, message.threadId, message.type);
    }
    if (!["ne", "thu", "phan"].includes(choice)) return api.sendMessage({ msg: "Chọn một cách ứng kiếp: ne, thu hoặc phan." }, message.threadId, message.type);
    const result = resolveTribulationChoice(choice, p.pendingTribulation.pattern); delete p.pendingTribulation;
    if (result.success) { const gain = 250 + p.realm * 90; addCultivation(p, gain); p.breakthroughPower = (p.breakthroughPower || 0) + 25; writeData(botId, data); return api.sendMessage({ msg: `⚡ Ứng kiếp thành công! +${fmt(gain)} tu vi, +25 chiến lực căn cơ.` }, message.threadId, message.type); }
    const lost = Math.min(p.cultivation, 120 + p.realm * 45); addCultivation(p, -lost); p.energy = Math.max(0, p.energy - 30); writeData(botId, data); return api.sendMessage({ msg: `💥 Chọn sai. Cách khắc chế là “${result.counter}”; mất ${fmt(lost)} tu vi và 30 thể lực.` }, message.threadId, message.type);
  }
  if (cmd === "ditich") {
    const date = todayVN(); if (data.relic?.date !== date) data.relic = { date, progress: 0, contributors: {} };
    const action = (args[1] || "").toLowerCase();
    if (!["khampha", "danh"].includes(action)) return api.sendMessage({ msg: `🏛️ DI TÍCH LIÊN SERVER\nTiến độ ${data.relic.progress}/100 · đóng góp ${data.relic.contributors[id] || 0}.\nKhám phá: ditich khampha · cần 20 thể lực.` }, message.threadId, message.type);
    if (p.energy < 20) return api.sendMessage({ msg: "⚡ Cần 20 thể lực." }, message.threadId, message.type);
    const gain = 5 + Math.floor(Math.random() * 11); p.energy -= 20; data.relic.progress = Math.min(100, data.relic.progress + gain); data.relic.contributors[id] = (data.relic.contributors[id] || 0) + gain; const reward = 120 + gain * 18; p.stones += reward; addCultivation(p, reward * 2); writeData(botId, data);
    return api.sendMessage({ msg: `🏛️ Phá giải ${gain}% cấm chế · toàn server ${data.relic.progress}/100.\n+${fmt(reward)} linh thạch · +${fmt(reward * 2)} tu vi.${data.relic.progress >= 100 ? "\n🌠 Di tích đã mở hoàn toàn!" : ""}` }, message.threadId, message.type);
  }
  if (cmd === "danlo") {
    p.alchemyFurnace ||= { level: 1 };
    const action = (args[1] || "").toLowerCase();
    if (action === "nang") { const cost = p.alchemyFurnace.level * 6000; if (p.alchemyFurnace.level >= 10) return api.sendMessage({ msg: "🔥 Đan lô đã cấp 10 tối đa." }, message.threadId, message.type); if (p.stones < cost) return api.sendMessage({ msg: `Cần ${fmt(cost)} linh thạch.` }, message.threadId, message.type); p.stones -= cost; p.alchemyFurnace.level++; writeData(botId, data); }
    return api.sendMessage({ msg: `🔥 ĐAN LÔ CẤP ${p.alchemyFurnace.level}/10\nBonus tỷ lệ luyện đan: +${p.alchemyFurnace.level}% · giảm nguy cơ nổ lò.\nNâng cấp: danlo nang` }, message.threadId, message.type);
  }
  if (cmd === "doihinh") {
    const role = (args[1] || "").toLowerCase(), roles = { tank: "Hộ Pháp", satthuong: "Chủ Công", hotro: "Trợ Đạo" };
    if (!roles[role]) return api.sendMessage({ msg: `⚔️ ĐỘI HÌNH\n${Object.entries(roles).map(([key,name]) => `${p.formationRole === key ? "🔆" : "▫️"} ${key} · ${name}`).join("\n")}\nChọn: doihinh <tank|satthuong|hotro>` }, message.threadId, message.type);
    p.formationRole = role; writeData(botId, data); return api.sendMessage({ msg: `⚔️ Đã chọn vai trò ${roles[role]}. Tổ đội đủ 3 vai trò nhận thêm 10% hiệp lực.` }, message.threadId, message.type);
  }
  if (cmd === "muagiai") {
    const season = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).slice(0, 7); if (p.seasonPass?.season !== season) p.seasonPass = { season, claimed: 0 };
    const progress = (p.kills || 0) + (p.bossKills || 0) * 3 + (p.wins || 0), tier = Math.min(20, Math.floor(progress / 10)), claim = (args[1] || "").toLowerCase() === "nhan";
    if (claim && tier > p.seasonPass.claimed) { const levels = tier - p.seasonPass.claimed; p.stones += levels * 500; addCultivation(p, levels * 800); p.seasonPass.claimed = tier; writeData(botId, data); }
    return api.sendMessage({ msg: `🎖️ MÙA ${season}\nTiến độ ${progress} · bậc ${tier}/20 · đã nhận ${p.seasonPass.claimed}.\nMỗi bậc: 500 linh thạch + 800 tu vi. Nhận: muagiai nhan` }, message.threadId, message.type);
  }
  if (cmd === "bicanh") {
    const action = (args[1] || "").toLowerCase(); p.rogue ||= null;
    if (action === "vao") { if (p.rogue) return api.sendMessage({ msg: "Bạn đang trong bí cảnh. Gõ bicanh tien hoặc bicanh rut." }, message.threadId, message.type); p.rogue = { floor: 0, buff: 0, stones: 0, cultivation: 0 }; writeData(botId, data); return api.sendMessage({ msg: "🌀 Đã vào Bí Cảnh Vô Tận. Gõ bicanh tien để leo tầng; chết mất toàn bộ thưởng chưa mang ra." }, message.threadId, message.type); }
    if (!p.rogue) return api.sendMessage({ msg: "🌀 BÍ CẢNH ROGUELIKE\nVào: bicanh vao · mỗi tầng thắng nhận buff và thưởng; rút an toàn bằng bicanh rut." }, message.threadId, message.type);
    if (action === "rut") { p.stones += p.rogue.stones; addCultivation(p, p.rogue.cultivation); const reward = { ...p.rogue }; p.rogue = null; writeData(botId, data); return api.sendMessage({ msg: `🚪 Rút khỏi bí cảnh tầng ${reward.floor}: nhận ${fmt(reward.stones)} linh thạch và ${fmt(reward.cultivation)} tu vi.` }, message.threadId, message.type); }
    if (action !== "tien") return api.sendMessage({ msg: `🌀 Đang ở tầng ${p.rogue.floor}; buff +${Math.round(p.rogue.buff * 100)}%. Gõ bicanh tien hoặc bicanh rut.` }, message.threadId, message.type);
    if (p.energy < 12) return api.sendMessage({ msg: "⚡ Cần 12 thể lực." }, message.threadId, message.type); p.energy -= 12; const floor = p.rogue.floor + 1, battle = resolveRoguelikeFloor(stats(p).power, floor, p.rogue.buff);
    if (!battle.win) { p.rogue = null; writeData(botId, data); return api.sendMessage({ msg: `💀 Gục tại tầng ${floor} (${fmt(battle.effectivePower)}/${fmt(battle.enemyPower)}). Toàn bộ thưởng tạm mất.` }, message.threadId, message.type); }
    p.rogue.floor = floor; p.rogue.buff += .04; p.rogue.stones += 80 * floor; p.rogue.cultivation += 130 * floor; writeData(botId, data); return api.sendMessage({ msg: `🌀 Vượt tầng ${floor}! Buff tích lũy +${Math.round(p.rogue.buff * 100)}% · kho tạm ${fmt(p.rogue.stones)} ◈, ${fmt(p.rogue.cultivation)} tu vi.` }, message.threadId, message.type);
  }
  if (cmd === "bossraid") {
    const phase = clamp(Math.floor(Number(p.raidPhase) || 1), 1, 3), costs = [20, 28, 36], enemyPower = Math.round((900 + p.realm * 520) * phase * 1.35);
    if (p.energy < costs[phase - 1]) return api.sendMessage({ msg: `⚡ Giai đoạn ${phase} cần ${costs[phase - 1]} thể lực.` }, message.threadId, message.type);
    const myPower = stats(p).power * selectedCombatSkill(p).mult, win = myPower * (.84 + Math.random() * .3) >= enemyPower; p.energy -= costs[phase - 1];
    if (!win) { p.raidPhase = 1; writeData(botId, data); return api.sendMessage({ msg: `👹 Boss cuồng nộ giai đoạn ${phase}; bạn thất bại (${fmt(myPower)}/${fmt(enemyPower)}), tiến độ về đầu.` }, message.threadId, message.type); }
    if (phase < 3) { p.raidPhase = phase + 1; writeData(botId, data); return api.sendMessage({ msg: `👹 Phá giai đoạn ${phase}/3! Boss chuyển trạng thái, gõ bossraid để đánh tiếp.` }, message.threadId, message.type); }
    p.raidPhase = 1; p.stones += 3200; addCultivation(p, 6000); p.inventory.linhduoc = (p.inventory.linhduoc || 0) + 2; writeData(botId, data); return api.sendMessage({ msg: "🏆 Hạ Boss ba giai đoạn! +3.200 linh thạch, +6.000 tu vi, +2 Linh Dược." }, message.threadId, message.type);
  }
  if (cmd === "traodoi") {
    const action = (args[1] || "").toLowerCase();
    if (["chapnhan", "dongy"].includes(action)) { const offer = p.pendingSwap, owner = offer && data.players[offer.fromId]; if (!offer || !owner || offer.expiresAt < Date.now()) return api.sendMessage({ msg: "Không có đề nghị trao đổi còn hiệu lực." }, message.threadId, message.type); if ((owner.inventory[offer.giveKey] || 0) < offer.giveQty || (p.inventory[offer.wantKey] || 0) < offer.wantQty) return api.sendMessage({ msg: "Một bên không còn đủ vật phẩm." }, message.threadId, message.type); owner.inventory[offer.giveKey] -= offer.giveQty; p.inventory[offer.wantKey] -= offer.wantQty; owner.inventory[offer.wantKey] = (owner.inventory[offer.wantKey] || 0) + offer.wantQty; p.inventory[offer.giveKey] = (p.inventory[offer.giveKey] || 0) + offer.giveQty; delete p.pendingSwap; writeData(botId, data); return api.sendMessage({ msg: `🤝 Trao đổi hoàn tất: ${owner.name} ↔ ${p.name}.` }, message.threadId, message.type); }
    const giveKey = resolveItemCode(args[1]), giveQty = Math.floor(Number(args[2]) || 0), wantKey = resolveItemCode(args[3]), wantQty = Math.floor(Number(args[4]) || 0), mention = Array.isArray(message.data?.mentions) ? message.data.mentions[0] : null, targetId = playerKey(mention?.uid || mention?.userId || mention?.id || ""), target = data.players[targetId];
    if (!ITEMS[giveKey] || !ITEMS[wantKey] || giveQty < 1 || wantQty < 1 || !target || targetId === id) return api.sendMessage({ msg: "🤝 Dùng: traodoi <mã_đưa> <SL> <mã_nhận> <SL> @người" }, message.threadId, message.type);
    if ((p.inventory[giveKey] || 0) < giveQty) return api.sendMessage({ msg: `Bạn không đủ ${ITEMS[giveKey].name}.` }, message.threadId, message.type);
    target.pendingSwap = { fromId: id, giveKey, giveQty, wantKey, wantQty, expiresAt: Date.now() + 5 * 60_000 }; writeData(botId, data); return api.sendMessage({ msg: `🤝 ${p.name} đề nghị đổi ${ITEMS[giveKey].name} ×${giveQty} lấy ${ITEMS[wantKey].name} ×${wantQty}. ${target.name} dùng: traodoi chapnhan` }, message.threadId, message.type);
  }
  if (cmd === "donate") {
    const tier = donateTier(args[1]);
    const tierList = TU_TIEN_DONATE_TIERS.map(entry => `• ${fmt(entry.amount)}đ → ${fmt(entry.cultivation)} tu vi + ${fmt(entry.stones)} linh thạch`).join("\n");
    if (!args[1]) return api.sendMessage({ msg: `💎 DONATE TU TIÊN\n\n${tierList}\n\nTạo QR: ${prefix}tt donate <mốc>\nVí dụ: ${prefix}tt donate 20k\nMỗi giao dịch tối đa 200k.` }, message.threadId, message.type);
    if (!tier) return api.sendMessage({ msg: `Chỉ hỗ trợ đúng các mốc 10k, 20k, 50k, 100k và 200k.\n\n${tierList}` }, message.threadId, message.type);
    const { createDonateQR } = await import("../../../utils/canvas/game-donate-qr.js");
    const donationCode = createShortDonationCode();
    await connection.collection("donation_codes").insertOne({ code: donationCode, type: "tutien", botId: String(botId), uid: normalizeUid(id), amount: tier.amount, status: "pending", createdAt: new Date() });
    const qrPath = await createDonateQR(id, {
      amount: tier.amount,
      transferContent: donationCode,
      title: "DONATE TU TIÊN",
      subtitle: `${fmt(tier.amount)}đ · nhận quà tự động`,
      footer: `Nhận ${fmt(tier.cultivation)} tu vi và ${fmt(tier.stones)} linh thạch`,
    });
    return sendImage(api, message, qrPath, `💎 Mốc ${fmt(tier.amount)}đ\n🎁 +${fmt(tier.cultivation)} tu vi · +${fmt(tier.stones)} linh thạch\n\nQuét QR và giữ nguyên nội dung chuyển khoản. Hệ thống sẽ tự cộng vào nhân vật ${p.name}.`);
  }
  if (cmd === "tang") {
    const amount = parseDonateAmount(args[1]);
    const mention = Array.isArray(message.data?.mentions) ? message.data.mentions[0] : null;
    const targetId = playerKey(mention?.uid || mention?.userId || mention?.id || ""), target = data.players[targetId];
    if (!amount || !Number.isSafeInteger(amount) || !target) return api.sendMessage({ msg: `Cú pháp: ${prefix}tt tang <số_linh_thạch> @người_chơi\nVí dụ: ${prefix}tt tang 10k @đạo_hữu` }, message.threadId, message.type);
    if (targetId === id) return api.sendMessage({ msg: "Bạn không thể tự tặng linh thạch cho chính mình." }, message.threadId, message.type);
    if (amount > Math.floor(Number(p.stones) || 0)) return api.sendMessage({ msg: `Không đủ linh thạch. Bạn có ${fmt(p.stones)}, cần ${fmt(amount)}.` }, message.threadId, message.type);
    p.stones -= amount; target.stones = Math.max(0, Math.floor(Number(target.stones) || 0)) + amount;
    writeData(botId, data);
    return api.sendMessage({ msg: `🎁 ${p.name} đã tặng ${fmt(amount)} linh thạch cho ${target.name}.\nSố dư còn lại: ${fmt(p.stones)} linh thạch.` }, message.threadId, message.type);
  }
  if (cmd === "trao") {
    const action = String(args[1] || "").toLowerCase();
    if (["chapnhan", "nhan", "dongy"].includes(action)) {
      const offer = p.pendingTrade, seller = offer && data.players[playerKey(offer.sellerId)], item = offer && ITEMS[offer.itemKey];
      if (!offer) return api.sendMessage({ msg: "Bạn không có đề nghị giao dịch nào đang chờ." }, message.threadId, message.type);
      if (offer.expiresAt < Date.now()) { delete p.pendingTrade; writeData(botId, data); return api.sendMessage({ msg: "Đề nghị giao dịch đã hết hạn." }, message.threadId, message.type); }
      if (!seller || !item) { delete p.pendingTrade; writeData(botId, data); return api.sendMessage({ msg: "Người bán hoặc vật phẩm không còn hợp lệ." }, message.threadId, message.type); }
      const quantity = Math.max(1, Math.floor(Number(offer.quantity) || 1)), price = Math.max(0, Math.floor(Number(offer.price) || 0));
      if ((seller.inventory?.[offer.itemKey] || 0) < quantity) { delete p.pendingTrade; writeData(botId, data); return api.sendMessage({ msg: `${seller.name} không còn đủ ${item.name} để hoàn tất giao dịch.` }, message.threadId, message.type); }
      if ((p.stones || 0) < price) return api.sendMessage({ msg: `Bạn cần ${fmt(price)} linh thạch nhưng hiện chỉ có ${fmt(p.stones)}.` }, message.threadId, message.type);
      seller.inventory[offer.itemKey] -= quantity;
      p.inventory[offer.itemKey] = (p.inventory[offer.itemKey] || 0) + quantity;
      p.stones -= price; seller.stones = Math.max(0, Math.floor(Number(seller.stones) || 0)) + price;
      delete p.pendingTrade; writeData(botId, data);
      return api.sendMessage({ msg: `🤝 Giao dịch thành công!\n${p.name} nhận ${item.icon} ${item.name} ×${quantity}.\n${seller.name} nhận ${fmt(price)} linh thạch.` }, message.threadId, message.type);
    }
    if (["tuchoi", "huy", "khong"].includes(action)) {
      if (!p.pendingTrade) return api.sendMessage({ msg: "Bạn không có đề nghị giao dịch nào đang chờ." }, message.threadId, message.type);
      const seller = data.players[playerKey(p.pendingTrade.sellerId)], sellerName = seller?.name || "người bán";
      delete p.pendingTrade; writeData(botId, data);
      return api.sendMessage({ msg: `❌ ${p.name} đã từ chối đề nghị của ${sellerName}.` }, message.threadId, message.type);
    }
    const itemKey = resolveItemCode(action), item = ITEMS[itemKey], quantity = Math.floor(Number(args[2]) || 0), price = parseDonateAmount(args[3]);
    const mention = Array.isArray(message.data?.mentions) ? message.data.mentions[0] : null;
    const buyerId = playerKey(mention?.uid || mention?.userId || mention?.id || ""), buyer = data.players[buyerId];
    if (!item || quantity < 1 || quantity > 999 || !price || !Number.isSafeInteger(price) || !buyer) return api.sendMessage({ msg: `Cú pháp: ${prefix}tt trao <mã_vật_phẩm> <SL> <giá_linh_thạch> @người_mua\nVí dụ: ${prefix}tt trao tulinhdan 2 5k @đạo_hữu\nXem mã vật phẩm bằng: ${prefix}tt tui` }, message.threadId, message.type);
    if (buyerId === id) return api.sendMessage({ msg: "Bạn không thể tự giao dịch với chính mình." }, message.threadId, message.type);
    if ((p.inventory[itemKey] || 0) < quantity) return api.sendMessage({ msg: `Bạn không đủ ${item.name}. Trong túi có ${fmt(p.inventory[itemKey] || 0)}.` }, message.threadId, message.type);
    if (buyer.pendingTrade?.expiresAt > Date.now()) return api.sendMessage({ msg: `${buyer.name} đang có một đề nghị khác chờ xử lý.` }, message.threadId, message.type);
    buyer.pendingTrade = { sellerId: id, itemKey, quantity, price, expiresAt: Date.now() + 5 * 60_000 };
    writeData(botId, data);
    return api.sendMessage({ msg: `📜 ĐỀ NGHỊ GIAO DỊCH\n\n${p.name} bán ${item.icon} ${item.name} ×${quantity}\nGiá: ${fmt(price)} linh thạch\nNgười mua: ${buyer.name}\n\n${buyer.name} dùng “${prefix}tt trao chapnhan” hoặc “${prefix}tt trao tuchoi” trong 5 phút.` }, message.threadId, message.type);
  }
  if (!cmd || ["xem", "info", "hoso"].includes(cmd)) { writeData(botId, data); return sendImage(api, message, await renderProfile(p)); }
  if (cmd === "map") return api.sendMessage({ msg: `🗺️ THẾ GIỚI HOÀN MỸ\n\n${mapList(p)}\n\n📍 Đang ở: ${MAPS[p.activeMap]?.name || "Thạch Thôn"}\nDi chuyển: hanhtrinh <mã_bản_đồ>` }, message.threadId, message.type);
  if (cmd === "tongmon") {
    const map = MAPS[p.activeMap] || MAPS.thachthon, factions = factionsForMap(p.activeMap), action = (args[1] || "").toLowerCase();
    if (["nhap", "gia", "join"].includes(action)) {
      const key = (args[2] || "").toLowerCase(), faction = factions.find(entry => entry.key === key);
      if (!faction) return api.sendMessage({ msg: `🏯 Không có thế lực này tại ${map.name}. Gõ tongmon để xem mã.` }, message.threadId, message.type);
      p.factions[p.activeMap] = faction.key; writeData(botId, data);
      return api.sendMessage({ msg: `${faction.icon} ${faction.name} đã nhận ${p.name} làm khách khanh tại ${map.name}.\n${faction.desc}\n✨ Hiệu ứng chỉ hoạt động khi bạn ở map này.` }, message.threadId, message.type);
    }
    const joined = activeFaction(p);
    return api.sendMessage({ msg: `🏯 THẾ LỰC · ${map.name}\n\n${factions.map(faction => `${joined?.key === faction.key ? "🔆" : "▫️"} ${faction.icon} ${faction.key} · ${faction.name}\n   ${faction.desc}\n   ${faction.bonus.atk ? `+${faction.bonus.atk} công ` : ""}${faction.bonus.def ? `+${faction.bonus.def} thủ ` : ""}${faction.bonus.hp ? `+${faction.bonus.hp} HP ` : ""}${faction.bonus.crit ? `+${Math.round(faction.bonus.crit * 100)}% bạo kích ` : ""}${faction.bonus.cultivation ? `+${Math.round(faction.bonus.cultivation * 100)}% tu luyện` : ""}`).join("\n\n")}\n\nGia nhập/chuyển thế lực map này: tongmon nhap <mã>` }, message.threadId, message.type);
  }
  if (cmd === "hanhtrinh") {
    const key = (args[1] || "").toLowerCase(), map = mapFor(p, key);
    if (!MAPS[key]) return api.sendMessage({ msg: "🗺️ Bản đồ không tồn tại. Gõ map để xem mã." }, message.threadId, message.type);
    if (!map) { const index = MAP_ORDER.indexOf(key), previous = MAPS[MAP_ORDER[index - 1]]; return api.sendMessage({ msg: `🔒 ${MAPS[key].name} cần ${REALMS[MAPS[key].req][0]}${previous ? ` và hoàn thành tu vi ${previous.name} (${fmt(mapCultivation(p, MAP_ORDER[index - 1]))}/${fmt(previous.need)})` : ""}.` }, message.threadId, message.type); }
    p.activeMap = key; writeData(botId, data);
    const factions = factionsForMap(key).map(faction => faction.name).join(" · ");
    return api.sendMessage({ msg: `🌠 Đã đặt chân tới ${map.icon} ${map.name}.\nBoss khu vực: ${map.monster}\n🏯 Thế lực: ${factions}\nGõ tongmon để xem và gia nhập.` }, message.threadId, message.type);
  }
  if (["luyenkhi", "cuonghoa"].includes(cmd)) {
    const slotAliases = { vk: "weapon", vukhi: "weapon", weapon: "weapon", giap: "armor", armor: "armor", pb: "artifact", phapbao: "artifact", artifact: "artifact", mu: "helmet", helmet: "helmet", giay: "boots", boots: "boots", nhan: "ring", ring: "ring" };
    const slot = slotAliases[(args[1] || "").toLowerCase()], item = slot && p.equipment[slot];
    if (!item) return api.sendMessage({ msg: `🔥 LUYỆN KHÍ\n\nCường hóa trang bị đang mặc đến +15.\n${Object.values(slotAliases).filter((v, i, a) => a.indexOf(v) === i).map(code => `${p.equipment[code] ? "✅" : "▫️"} ${code}: ${p.equipment[code]?.name || "trống"} +${p.equipment[code]?.enhance || 0}`).join("\n")}\n\nDùng: ${prefix}tt luyenkhi <ô>\nCần 💠 tinhthach (mua tại shop nl); thất bại không tụt cấp.` }, message.threadId, message.type);
    const level = clamp(Math.floor(Number(item.enhance) || 0), 0, 15);
    if (level >= 15) return api.sendMessage({ msg: `🌟 ${item.name} đã đạt cường hóa tối đa +15.` }, message.threadId, message.type);
    const next = level + 1, material = Math.ceil(next / 3), cost = 300 * next * next;
    if ((p.inventory.tinhthach || 0) < material || p.stones < cost) return api.sendMessage({ msg: `🔥 Lên +${next} cần 💠 Tinh Thạch ×${material} và ${fmt(cost)} linh thạch.\nBạn có: ×${p.inventory.tinhthach || 0} · ${fmt(p.stones)} linh thạch.` }, message.threadId, message.type);
    p.inventory.tinhthach -= material; p.stones -= cost;
    const chance = clamp(.96 - level * .04, .4, .96), success = Math.random() < chance;
    if (success) { item.enhance = next; for (const stat of ["atk", "def", "hp"]) if (item[stat]) item[stat] = Math.ceil(item[stat] * 1.08); }
    writeData(botId, data);
    return api.sendMessage({ msg: `${success ? "✨ CƯỜNG HÓA THÀNH CÔNG" : "💨 CƯỜNG HÓA THẤT BẠI"}\n${item.name}: +${level} → ${success ? `+${next}` : `vẫn +${level}`}\nTỉ lệ: ${Math.round(chance * 100)}% · chiến lực: ${fmt(stats(p).power)}\nĐã tiêu 💠 ×${material} và ${fmt(cost)} linh thạch.${success && next >= 10 ? "\n🌟 Trang bị phát ra thần quang rực rỡ!" : ""}` }, message.threadId, message.type);
  }
  if (cmd === "linhthu") {
    p.spiritBeasts ||= {};
    const action = (args[1] || "").toLowerCase(), key = (args[2] || "").toLowerCase();
    if (["thuan", "bat"].includes(action)) {
      const beast = SPIRIT_BEASTS[key];
      if (!beast) return api.sendMessage({ msg: "Không có linh thú này. Gõ linhthu để xem danh sách." }, message.threadId, message.type);
      if (p.realm < beast.req) return api.sendMessage({ msg: `🔒 ${beast.name} cần ${REALMS[beast.req][0]}.` }, message.threadId, message.type);
      if (!p.spiritBeasts[key]) { if (p.stones < beast.price) return api.sendMessage({ msg: `Cần ${fmt(beast.price)} linh thạch để lập khế ước.` }, message.threadId, message.type); p.stones -= beast.price; p.spiritBeasts[key] = 1; }
      p.spiritBeast = { key, level: p.spiritBeasts[key] }; writeData(botId, data);
      return api.sendMessage({ msg: `${beast.icon} Đã triệu hồi ${beast.name} cấp ${p.spiritBeast.level}.\n${beast.desc} · chiến lực mới ${fmt(stats(p).power)}.` }, message.threadId, message.type);
    }
    if (["nuoi", "nangcap"].includes(action)) {
      if (!p.spiritBeast?.key || !SPIRIT_BEASTS[p.spiritBeast.key]) return api.sendMessage({ msg: "Bạn chưa triệu hồi linh thú." }, message.threadId, message.type);
      const owned = Math.floor(p.inventory.thucanlinhthu || 0), requested = clamp(Math.floor(Number(args[2]) || 1), 1, 50 - p.spiritBeast.level), quantity = Math.min(owned, requested);
      if (!quantity || p.spiritBeast.level >= 50) return api.sendMessage({ msg: p.spiritBeast.level >= 50 ? "🌟 Linh thú đã đạt cấp 50 tối đa." : "Cần 🍖 Linh Thú Tiên Lương; mua bằng shop nl." }, message.threadId, message.type);
      p.inventory.thucanlinhthu -= quantity; p.spiritBeast.level += quantity; p.spiritBeasts[p.spiritBeast.key] = p.spiritBeast.level; writeData(botId, data);
      return api.sendMessage({ msg: `${SPIRIT_BEASTS[p.spiritBeast.key].icon} Linh thú tăng ${quantity} cấp, hiện cấp ${p.spiritBeast.level}/50.\nChiến lực: ${fmt(stats(p).power)}.` }, message.threadId, message.type);
    }
    if (["tienhoa", "dotpha"].includes(action)) {
      if (!p.spiritBeast?.key || p.spiritBeast.level < 20) return api.sendMessage({ msg: "🐾 Linh thú cần cấp 20 để tiến hóa." }, message.threadId, message.type);
      const stage = p.spiritBeast.evolution || 0, cost = (stage + 1) * 5;
      if (stage >= 5) return api.sendMessage({ msg: "🌟 Linh thú đã tiến hóa tối đa 5 lần." }, message.threadId, message.type);
      if ((p.inventory.tieuthienhuyet || 0) < cost) return api.sendMessage({ msg: `Cần 🩸 Tiên Huyết Cổ Thú ×${cost}.` }, message.threadId, message.type);
      p.inventory.tieuthienhuyet -= cost; p.spiritBeast.evolution = stage + 1; p.spiritBeast.level += 5; p.spiritBeasts[p.spiritBeast.key] = p.spiritBeast.level; writeData(botId, data);
      return api.sendMessage({ msg: `🌟 ${SPIRIT_BEASTS[p.spiritBeast.key].name} tiến hóa bậc ${p.spiritBeast.evolution}/5, tăng 5 cấp và thức tỉnh huyết mạch.` }, message.threadId, message.type);
    }
    if (["sinhsan", "phoigiong"].includes(action)) {
      const mention = Array.isArray(message.data?.mentions) ? message.data.mentions[0] : null, targetId = playerKey(mention?.uid || mention?.userId || mention?.id || ""), target = data.players[targetId];
      if (!target?.spiritBeast?.key || !p.spiritBeast?.key || targetId === id) return api.sendMessage({ msg: "🐣 Cần tag đạo hữu khác và cả hai đang triệu hồi linh thú." }, message.threadId, message.type);
      const left = cooldown(p, "beastBreed", 24 * 60 * 60_000); if (left) return api.sendMessage({ msg: `⏳ Linh thú cần nghỉ ${waitText(left)}.` }, message.threadId, message.type);
      if ((p.inventory.thucanlinhthu || 0) < 10) return api.sendMessage({ msg: "Cần 🍖 Linh Thú Tiên Lương ×10." }, message.threadId, message.type);
      p.inventory.thucanlinhthu -= 10; p.actions.beastBreed = Date.now(); const bloodline = 1 + Math.floor(Math.random() * 5); p.spiritBeast.bloodline = Math.max(p.spiritBeast.bloodline || 0, bloodline); p.breakthroughPower = (p.breakthroughPower || 0) + bloodline * 20; writeData(botId, data);
      return api.sendMessage({ msg: `🐣 ${SPIRIT_BEASTS[p.spiritBeast.key].name} và ${SPIRIT_BEASTS[target.spiritBeast.key].name} cộng minh, thức tỉnh huyết mạch bậc ${bloodline}/5 · +${bloodline * 20} chiến lực.` }, message.threadId, message.type);
    }
    const active = p.spiritBeast && SPIRIT_BEASTS[p.spiritBeast.key];
    return api.sendMessage({ msg: `🐾 LINH THÚ\n\n${Object.entries(SPIRIT_BEASTS).map(([code, beast]) => `${p.spiritBeasts[code] ? p.spiritBeast?.key === code ? "🔆" : "✅" : p.realm >= beast.req ? "▫️" : "🔒"} ${beast.icon} ${code} · ${beast.name}\n   ${beast.desc} · ${fmt(beast.price)} ◈ · ${REALMS[beast.req][0]}`).join("\n\n")}\n\nĐang theo: ${active ? `${active.name} cấp ${p.spiritBeast.level} · tiến hóa ${p.spiritBeast.evolution || 0}/5` : "chưa có"}\nThuần hóa: linhthu thuan <mã> · Nuôi: linhthu nuoi [SL] · Tiến hóa: linhthu tienhoa` }, message.threadId, message.type);
  }
  if (cmd === "thamhiem") {
    const left = cooldown(p, "explore", 5 * 60_000), map = MAPS[p.activeMap] || MAPS.thachthon;
    if (left) return api.sendMessage({ msg: `🧭 Có thể thám hiểm lại sau ${waitText(left)}.` }, message.threadId, message.type);
    if (p.energy < 10) return api.sendMessage({ msg: "⚡ Thám hiểm cần 10 thể lực." }, message.threadId, message.type);
    p.energy -= 10; p.actions.explore = Date.now();
    const roll = Math.random(); let result;
    if (roll < .12) { const lost = Math.min(p.stones, 30 + map.level * 25); p.stones -= lost; result = `🌫️ Lạc vào mê trận, mất ${fmt(lost)} linh thạch.`; }
    else if (roll < .32) { p.energy = Math.min(MAX_ENERGY, p.energy + 25); result = "♨️ Phát hiện linh tuyền, hồi 25 thể lực."; }
    else if (roll < .72) { const gain = Math.round((90 + map.level * 80) * map.multiplier); addCultivation(p, gain); addMapCultivation(p, gain); result = `📜 Ngộ được bia đá cổ, +${fmt(gain)} tu vi.`; }
    else { const drops = grantDrops(p, map.drops, 2.4); if (!drops.length) { p.inventory.tinhthach = (p.inventory.tinhthach || 0) + 1; drops.push("💠 Luyện Khí Tinh Thạch"); } result = `🎁 Tìm thấy động phủ: ${drops.join(" · ")}.`; }
    writeData(botId, data); return api.sendMessage({ msg: `🧭 THÁM HIỂM · ${map.name}\n\n${result}\nCòn ${p.energy} thể lực.` }, message.threadId, message.type);
  }
  if (cmd === "thanhtuu") {
    let reward = 0;
    const lines = Object.entries(ACHIEVEMENTS).map(([key, achievement]) => { const value = achievement.value(p), done = value >= achievement.target; if (done && !p.achievements[key]) { p.achievements[key] = Date.now(); reward += achievement.stones; } return `${p.achievements[key] ? "✅" : done ? "🎁" : "▫️"} ${achievement.icon} ${achievement.name}: ${fmt(Math.min(value, achievement.target))}/${fmt(achievement.target)} · ${fmt(achievement.stones)} ◈`; });
    if (reward) p.stones += reward; writeData(botId, data);
    return api.sendMessage({ msg: `🏆 THÀNH TỰU · ${p.name}\n\n${lines.join("\n")}\n\n${reward ? `🎊 Vừa nhận ${fmt(reward)} linh thạch!` : "Đạt mốc sẽ tự nhận khi mở bảng."}` }, message.threadId, message.type);
  }
  if (cmd === "nghenghiep") {
    const action=(args[1]||"").toLowerCase(), jobs={luyendan:["Luyện Đan Sư","cuonglucdan"],ren:["Luyện Khí Sư","tinhthach"],linhnong:["Linh Nông","linhduoc"]};
    if (action === "chon") { const key=(args[2]||"").toLowerCase(); if(!jobs[key])return api.sendMessage({msg:"Nghề: luyendan, ren, linh-nông (mã: linhnong)."},message.threadId,message.type); if(p.profession?.key&&p.profession.key!==key)return api.sendMessage({msg:"Bạn đã chọn nghề, không thể đổi."},message.threadId,message.type); p.profession={key,xp:p.profession?.xp||0,level:p.profession?.level||1};writeData(botId,data);return api.sendMessage({msg:`🛠️ Đã trở thành ${jobs[key][0]}. Gõ nghenghiep lam để hành nghề.`},message.threadId,message.type); }
    if (action === "lam") { if(!p.profession)return api.sendMessage({msg:"Hãy chọn nghề trước: nghenghiep chon <mã>."},message.threadId,message.type);const left=cooldown(p,"profession",10*60_000);if(left)return api.sendMessage({msg:`⏳ Có thể hành nghề lại sau ${waitText(left)}.`},message.threadId,message.type);const job=jobs[p.profession.key],gain=1+Math.floor(p.profession.level/5);p.inventory[job[1]]=(p.inventory[job[1]]||0)+gain;p.profession.xp+=10;p.profession.level=Math.min(20,1+Math.floor(p.profession.xp/50));p.actions.profession=Date.now();writeData(botId,data);return api.sendMessage({msg:`🛠️ ${job[0]} chế tác thành công ${ITEMS[job[1]].icon} ${ITEMS[job[1]].name} ×${gain}. Nghề cấp ${p.profession.level}/20 · ${p.profession.xp} EXP.`},message.threadId,message.type); }
    return api.sendMessage({msg:`🛠️ NGHỀ NGHIỆP\n${Object.entries(jobs).map(([k,v])=>`• ${k}: ${v[0]}`).join("\n")}\n\n${p.profession?`Đang theo ${jobs[p.profession.key][0]} · cấp ${p.profession.level}/20`:`Chọn: nghenghiep chon <mã>`}`},message.threadId,message.type);
  }
  if (cmd === "luyendan") {
    if (p.profession?.key !== "luyendan") return api.sendMessage({ msg: "🔥 Chỉ Luyện Đan Sư dùng được đan lô. Chọn nghề: nghenghiep chon luyendan" }, message.threadId, message.type);
    const key = resolveItemCode(args[1]), recipe = CRAFT_RECIPES[key], quantity = Math.floor(Number(args[2]) || 1);
    if (!recipe || !["cuonglucdan", "ngoidaodan"].includes(recipe.output)) return api.sendMessage({ msg: `🔥 ĐAN PHƯƠNG\n\n${["cuonglucdan", "ngoidaodan"].map(code => `${ITEMS[code].icon} ${displayItemCode(code)} · ${materialText(CRAFT_RECIPES[code].materials)} · ${fmt(CRAFT_RECIPES[code].stones)} ◈`).join("\n\n")}\n\nLuyện: ${prefix}tt luyendan <mã> [1-20]` }, message.threadId, message.type);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) return api.sendMessage({ msg: "Số mẻ luyện đan phải từ 1 đến 20." }, message.threadId, message.type);
    const result = resolveAlchemy((p.profession.level || 1) + (p.alchemyFurnace?.level || 0), quantity), missing = Object.entries(recipe.materials).filter(([material, count]) => (p.inventory[material] || 0) < count * result.batches), cost = recipe.stones * result.batches;
    if (missing.length || p.stones < cost) return api.sendMessage({ msg: `🔥 Chưa đủ nguyên liệu cho ${result.batches} mẻ. Cần ${materialText(Object.fromEntries(Object.entries(recipe.materials).map(([material, count]) => [material, count * result.batches])))} · ${fmt(cost)} ◈.` }, message.threadId, message.type);
    for (const [material, count] of Object.entries(recipe.materials)) p.inventory[material] -= count * result.batches;
    p.stones -= cost;
    let successes = 0;
    for (let batch = 0; batch < result.batches; batch++) if (Math.random() < result.successRate) successes++;
    const produced = Math.floor(successes * recipe.quantity * result.multiplier);
    if (produced) p.inventory[recipe.output] = (p.inventory[recipe.output] || 0) + produced;
    p.profession.xp += result.batches * 8; p.profession.level = Math.min(20, 1 + Math.floor(p.profession.xp / 50));
    writeData(botId, data);
    const qualityName = { phamdanh: "Phàm đan", thuongpham: "Thượng phẩm", cucpham: "Cực phẩm" }[result.quality];
    return api.sendMessage({ msg: `🔥 KHAI LÒ · ${qualityName}\n\nThành công ${successes}/${result.batches} mẻ · nhận ${ITEMS[recipe.output].icon} ${ITEMS[recipe.output].name} ×${produced}.\nTỷ lệ thành công ${Math.round(result.successRate * 100)}% · Luyện Đan Sư cấp ${p.profession.level}/20.` }, message.threadId, message.type);
  }
  if (cmd === "kham") { const slots={vk:"weapon",giap:"armor",pb:"artifact",mu:"helmet",giay:"boots",nhan:"ring"},slot=slots[(args[1]||"").toLowerCase()]||(args[1]||"").toLowerCase(),gemKey=(args[2]||"").toLowerCase(),item=p.equipment[slot],gem=ITEMS[gemKey];if(!item||!gem?.gem)return api.sendMessage({msg:"Cú pháp: kham <vk|giap|pb|mu|giay|nhan> <hongngoc|lamngoc|lucngoc>."},message.threadId,message.type);item.gems||=[];if(item.gems.length>=3)return api.sendMessage({msg:"Trang bị đã đủ 3 lỗ ngọc."},message.threadId,message.type);if(!(p.inventory[gemKey]>0))return api.sendMessage({msg:`Bạn không có ${gem.name}.`},message.threadId,message.type);p.inventory[gemKey]--;item.gems.push(gemKey);for(const [stat,value] of Object.entries(gem.gem))item[stat]=(item[stat]||0)+value;writeData(botId,data);return api.sendMessage({msg:`💎 Đã khảm ${gem.name} vào ${item.name} (${item.gems.length}/3). Chiến lực ${fmt(stats(p).power)}.`},message.threadId,message.type); }
  if (cmd === "tayluyen") { const slots={vk:"weapon",giap:"armor",pb:"artifact",mu:"helmet",giay:"boots",nhan:"ring"},slot=slots[(args[1]||"").toLowerCase()]||(args[1]||"").toLowerCase(),item=p.equipment[slot];if(!item)return api.sendMessage({msg:"Cú pháp: tayluyen <ô trang bị>."},message.threadId,message.type);if((p.inventory.tinhthach||0)<3||p.stones<2500)return api.sendMessage({msg:"Tẩy luyện cần 💠 ×3 và 2.500 linh thạch."},message.threadId,message.type);if(item.refine)for(const [stat,value]of Object.entries(item.refine))item[stat]-=value;p.inventory.tinhthach-=3;p.stones-=2500;const stat=["atk","def","hp"][Math.floor(Math.random()*3)],value=stat==="hp"?100+Math.floor(Math.random()*401):25+Math.floor(Math.random()*101);item.refine={[stat]:value};item[stat]=(item[stat]||0)+value;writeData(botId,data);return api.sendMessage({msg:`✨ ${item.name} nhận thuộc tính mới: +${value} ${stat.toUpperCase()}.`},message.threadId,message.type); }
  if (cmd === "setdo") { const lines=Object.values(EQUIPMENT_SETS).map(set=>{const count=Object.values(p.equipment).filter(x=>set.items.includes(x?.key)).length;return `${count>=3?"🌟":count>=2?"✅":"▫️"} Bộ ${set.name}: ${count}/${set.items.length}\n   2 món: ${JSON.stringify(set.two)} · 3 món: ${JSON.stringify(set.three)}`});return api.sendMessage({msg:`🧿 HIỆU ỨNG BỘ\n\n${lines.join("\n\n")}`},message.threadId,message.type); }
  if (cmd === "cottruyen") { const choice=(args[1]||"").toLowerCase(),chapter=clamp(Number(p.storyChapter)||0,0,STORY_CHAPTERS.length);if(chapter>=STORY_CHAPTERS.length)return api.sendMessage({msg:`📖 Bạn đã hoàn thành cốt truyện. Đạo tâm: ${p.karma>=0?"Thiện":"Ma"} ${p.karma||0}.`},message.threadId,message.type);if(!["thien","ma"].includes(choice))return api.sendMessage({msg:`📖 CHƯƠNG ${chapter+1}: ${STORY_CHAPTERS[chapter]}\nChọn “cottruyen thien” để cứu độ hoặc “cottruyen ma” để đoạt cơ duyên. Mỗi lựa chọn chỉ thực hiện một lần.`},message.threadId,message.type);const gain=(chapter+1)*300;p.karma=(p.karma||0)+(choice==="thien"?1:-1);p.storyChapter=chapter+1;if(choice==="thien"){addCultivation(p,gain);p.inventory.linhduoc=(p.inventory.linhduoc||0)+1;}else{p.stones+=gain*2;p.wanted=(p.wanted||0)+1;}writeData(botId,data);return api.sendMessage({msg:`${choice==="thien"?"☀️ Thiện niệm":"🌑 Ma niệm"} đã định lựa chọn tại ${STORY_CHAPTERS[chapter]}. ${choice==="thien"?`+${fmt(gain)} tu vi, +1 Linh Dược`:`+${fmt(gain*2)} linh thạch, truy nã +1`}.`},message.threadId,message.type); }
  if (cmd === "chuyensinh") { if((p.rebirth||0)>=10)return api.sendMessage({msg:"Bạn đã đạt Thập Chuyển tối đa."},message.threadId,message.type);if(p.realm<REALMS.length-1||minorRealm(p)<minorStages(p).length-1)return api.sendMessage({msg:"Chuyển sinh cần Tiên Đế · Viên mãn."},message.threadId,message.type);p.rebirth=(p.rebirth||0)+1;p.realm=0;p.minorRealm=0;p.cultivation=0;p.activeMap="thachthon";p.mapCultivation={};p.mapBossKills={};p.energy=MAX_ENERGY;writeData(botId,data);return api.sendMessage({msg:`♻️ Chuyển sinh lần ${p.rebirth}/10 thành công! Cảnh giới trở về Bàn Huyết nhưng toàn bộ chiến lực cơ sở tăng ${p.rebirth*12}%. Trang bị, linh thú và tài sản được giữ nguyên.`},message.threadId,message.type); }
  if (cmd === "dautruong") {
    const season=new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Ho_Chi_Minh"}).slice(0,7);
    if(p.arena?.season!==season)p.arena={season,points:0,wins:0,losses:0};
    const mention=Array.isArray(message.data?.mentions)?message.data.mentions[0]:null,targetId=playerKey(mention?.uid||mention?.userId||mention?.id||""),target=data.players[targetId];
    if(!target||targetId===id){
      const rank=[...ARENA_RANKS].reverse().find(([need])=>p.arena.points>=need)[1];
      const top=Object.values(data.players).filter(x=>x.arena?.season===season).sort((a,b)=>b.arena.points-a.arena.points).slice(0,10);
      return api.sendMessage({msg:`🏟️ ĐẤU TRƯỜNG MÙA ${season}\nHạng ${rank} · ${p.arena.points} điểm · ${p.arena.wins} thắng/${p.arena.losses} thua\n\n${top.map((x,i)=>`${i+1}. ${x.name}: ${x.arena.points}`).join("\n")||"Chưa có xếp hạng."}\n\nĐấu: dautruong @người_chơi`},message.threadId,message.type);
    }
    if(target.arena?.season!==season)target.arena={season,points:0,wins:0,losses:0};
    if(p.energy<18||target.energy<18)return api.sendMessage({msg:"Cả hai cần 18 thể lực."},message.threadId,message.type);
    const skillA = selectedCombatSkill(p), skillB = selectedCombatSkill(target);
    const myPower = Math.round(stats(p).power * skillA.mult);
    const enemyPower = Math.round(stats(target).power * skillB.mult);
    const win = myPower*(.85+Math.random()*.3)>=enemyPower*(.85+Math.random()*.3), winner=win?p:target, loser=win?target:p;
    winner.arena.points+=25;winner.arena.wins++;
    loser.arena.points=Math.max(0,loser.arena.points-10);loser.arena.losses++;
    p.energy-=18;target.energy-=18;
    writeData(botId,data);
    const enemy = {
      name: target.name,
      gender: target.gender,
      sect: target.sect,
      realm: target.realm,
      level: (target.realm || 0) + 1,
      equipment: target.equipment,
      title: realmTitle(target),
      isPlayer: true,
    };
    const result = {
      win,
      myPower,
      enemyPower,
      cultivation: 60,
      stones: 30,
      skillName: win ? skillA.name : skillB.name,
      log: win ? `${p.name} áp đảo ${target.name} trên Đấu Trường!` : `${target.name} phản kích thắng thế!`,
    };
    return sendImage(api, message, await animatedOrProfile(p, {
      kind: "battle",
      p,
      enemy,
      result,
      realmName: realmTitle(p),
      sect: SECTS[p.sect],
    }), `🏟️ ĐẤU TRƯỜNG MÙA ${season}\n\n🔵 ${p.name} (${fmt(myPower)} CL)\n🔴 ${target.name} (${fmt(enemyPower)} CL)\n\n🏆 ${winner.name} thắng: +25 điểm · ${loser.name} -10 điểm.`);
  }
  if (cmd === "sudo") { const action=(args[1]||"").toLowerCase(),mention=Array.isArray(message.data?.mentions)?message.data.mentions[0]:null,targetId=playerKey(mention?.uid||mention?.userId||mention?.id||""),target=data.players[targetId];if(action==="nhan"){if(!target||targetId===id)return api.sendMessage({msg:"Dùng sudo nhan @người để gửi lời nhận đồ đệ."},message.threadId,message.type);if((p.disciples||[]).length>=3)return api.sendMessage({msg:"Bạn đã đủ 3 đồ đệ."},message.threadId,message.type);if(target.master)return api.sendMessage({msg:"Người này đã có sư phụ."},message.threadId,message.type);target.pendingMaster={id,name:p.name,expiresAt:Date.now()+10*60_000};writeData(botId,data);return api.sendMessage({msg:`🎓 ${p.name} muốn nhận ${target.name} làm đồ đệ. Người được mời gõ: sudo chapnhan`},message.threadId,message.type);}if(action==="truyen"){const amount=parseDonateAmount(args[2]);if(!target||!(p.disciples||[]).includes(targetId)||!amount||p.cultivation<amount)return api.sendMessage({msg:"Cú pháp: sudo truyen <tu_vi> @đồ_đệ; cần đủ tu vi."},message.threadId,message.type);const received=Math.floor(amount*.9);addCultivation(p,-amount);addCultivation(target,received);writeData(botId,data);return api.sendMessage({msg:`🧘 ${p.name} truyền ${fmt(received)} tu vi cho ${target.name}; thiên đạo tiêu tán 10%.`},message.threadId,message.type);}if(action==="chapnhan"){const offer=p.pendingMaster,master=offer&&data.players[offer.id];if(!offer||!master||offer.expiresAt<Date.now())return api.sendMessage({msg:"Không có lời thu đồ còn hiệu lực."},message.threadId,message.type);if((master.disciples||[]).length>=3)return api.sendMessage({msg:"Sư phụ đã đủ đồ đệ."},message.threadId,message.type);p.master={id:offer.id,name:master.name};master.disciples||=[];master.disciples.push(id);delete p.pendingMaster;p.stones+=500;master.stones+=500;writeData(botId,data);return api.sendMessage({msg:`🎓 ${p.name} đã bái ${master.name} làm sư phụ. Mỗi người nhận 500 linh thạch; sư phụ nhận thưởng khi đồ đệ đột phá.`},message.threadId,message.type);}return api.sendMessage({msg:`🎓 SƯ ĐỒ\nSư phụ: ${p.master?.name||"chưa có"}\nĐồ đệ: ${(p.disciples||[]).map(uid=>data.players[uid]?.name||uid).join(" · ")||"chưa có"}\n\nThu đồ: sudo nhan @người · Nhận lời: sudo chapnhan · Truyền công: sudo truyen <tu_vi> @đồ_đệ`},message.threadId,message.type); }
  if (cmd === "truyna") { const targets=Object.values(data.players).filter(x=>(x.wanted||0)>0&&x.userId!==id).sort((a,b)=>b.wanted-a.wanted);const mention=Array.isArray(message.data?.mentions)?message.data.mentions[0]:null,targetId=playerKey(mention?.uid||mention?.userId||mention?.id||""),target=data.players[targetId];if(!target||!(target.wanted>0))return api.sendMessage({msg:`📜 TRUY NÃ\n${targets.slice(0,10).map(x=>`🌑 ${x.name} · sát khí ${x.wanted} · thưởng ${fmt(x.wanted*300)} ◈`).join("\n")||"Không có ma đầu bị truy nã."}\n\nSăn: truyna @người_chơi`},message.threadId,message.type);if(p.energy<25||target.energy<25)return api.sendMessage({msg:"Hai bên cần 25 thể lực."},message.threadId,message.type);const win=stats(p).power*(.8+Math.random()*.35)>=stats(target).power*(.88+Math.random()*.25);p.energy-=25;target.energy-=25;if(win){const reward=target.wanted*300;p.stones+=reward;target.wanted=Math.max(0,target.wanted-1);p.wins++;target.losses++;}else{p.losses++;target.wins++;target.wanted++;}writeData(botId,data);return api.sendMessage({msg:win?`⚖️ Bắt giữ thành công ${target.name}, nhận ${fmt((target.wanted+1)*300)} linh thạch.`:`🌑 Truy nã thất bại; sát khí ${target.name} tăng lên ${target.wanted}.`},message.threadId,message.type); }
  if (cmd === "dongphu") { p.cave||={level:1,plots:1,crops:[]};const action=(args[1]||"").toLowerCase(),now=Date.now();if(action==="trong"){const count=clamp(Number(args[2])||1,1,p.cave.plots-p.cave.crops.length);if(count<=0||p.cave.crops.length>=p.cave.plots)return api.sendMessage({msg:"Ruộng đã kín, hãy thu hoạch trước."},message.threadId,message.type);if((p.inventory.hatlinhduoc||0)<count)return api.sendMessage({msg:`Cần Hạt Giống Linh Dược ×${count}.`},message.threadId,message.type);p.inventory.hatlinhduoc-=count;for(let i=0;i<count;i++)p.cave.crops.push(now+30*60_000);writeData(botId,data);return api.sendMessage({msg:`🌱 Đã gieo ${count} luống, thu hoạch sau 30 phút.`},message.threadId,message.type);}if(action==="thu"){const ready=p.cave.crops.filter(t=>t<=now).length;if(!ready)return api.sendMessage({msg:"Chưa có linh dược chín."},message.threadId,message.type);p.cave.crops=p.cave.crops.filter(t=>t>now);p.inventory.linhduoc=(p.inventory.linhduoc||0)+ready*(1+Math.floor(p.cave.level/3));writeData(botId,data);return api.sendMessage({msg:`🌿 Thu hoạch ${ready*(1+Math.floor(p.cave.level/3))} Linh Dược.`},message.threadId,message.type);}if(action==="nang"){const cost=p.cave.level*8000;if(p.cave.level>=10||p.stones<cost)return api.sendMessage({msg:p.cave.level>=10?"Động phủ đã cấp 10 tối đa.":`Cần ${fmt(cost)} linh thạch.`},message.threadId,message.type);p.stones-=cost;p.cave.level++;p.cave.plots=1+p.cave.level;writeData(botId,data);return api.sendMessage({msg:`🏡 Động phủ lên cấp ${p.cave.level}/10 · ${p.cave.plots} ô ruộng.`},message.threadId,message.type);}return api.sendMessage({msg:`🏡 ĐỘNG PHỦ cấp ${p.cave.level}/10 · ruộng ${p.cave.crops.length}/${p.cave.plots}\nTrồng: dongphu trong [SL] · Thu: dongphu thu · Nâng: dongphu nang`},message.threadId,message.type); }
  if (["cho", "market"].includes(cmd)) {
    const events = settleMarket(data), action = (args[1] || "").toLowerCase(), listings = data.market.listings;
    if (["dang", "ban"].includes(action)) {
      const itemKey = resolveItemCode(args[2]), item = ITEMS[itemKey], quantity = clamp(Math.floor(Number(args[3]) || 0), 1, 999), price = parseDonateAmount(args[4]);
      if (!item || !Number(args[3]) || !price) return api.sendMessage({ msg: `Cú pháp: ${prefix}tt cho dang <mã_vật_phẩm> <SL> <tổng_giá>\nVí dụ: ${prefix}tt cho dang tulinhdan 10 5k` }, message.threadId, message.type);
      if ((p.inventory[itemKey] || 0) < quantity) return api.sendMessage({ msg: `Bạn chỉ có ${fmt(p.inventory[itemKey] || 0)} ${item.name}.` }, message.threadId, message.type);
      if (p.forgedItems?.[itemKey]) return api.sendMessage({ msg: "🔥 Hãy trang bị lại món đồ đã cường hóa này; chợ thường chưa nhận đồ có cấp luyện khí." }, message.threadId, message.type);
      if (Object.values(listings).filter(x => x.status === "active" && x.sellerId === id).length >= 10) return api.sendMessage({ msg: "Bạn đã đạt giới hạn 10 đơn đang mở." }, message.threadId, message.type);
      let listingId; do listingId = shortCode("M"); while (listings[listingId]);
      p.inventory[itemKey] -= quantity; listings[listingId] = { type: "fixed", sellerId: id, itemKey, quantity, price, status: "active", createdAt: Date.now(), expiresAt: Date.now() + 24 * 60 * 60_000 };
      writeData(botId, data); return api.sendMessage({ msg: `🏪 Đã ký gửi ${item.icon} ${item.name} ×${quantity}\nMã đơn: ${listingId} · giá ${fmt(price)} linh thạch · hết hạn sau 24 giờ.\nVật phẩm đã được giữ trong chợ, không thể bán trùng.` }, message.threadId, message.type);
    }
    if (action === "mua") {
      const listingId = (args[2] || "").toUpperCase(), listing = listings[listingId], seller = listing && data.players[playerKey(listing.sellerId)], item = listing && ITEMS[listing.itemKey];
      if (!listing || listing.status !== "active" || listing.type !== "fixed" || !seller || !item) return api.sendMessage({ msg: "Đơn mua ngay không tồn tại hoặc đã đóng." }, message.threadId, message.type);
      if (listing.sellerId === id) return api.sendMessage({ msg: "Bạn không thể mua đơn của chính mình." }, message.threadId, message.type);
      if (p.stones < listing.price) return api.sendMessage({ msg: `Cần ${fmt(listing.price)} linh thạch, bạn có ${fmt(p.stones)}.` }, message.threadId, message.type);
      const tax = Math.floor(listing.price * .05); p.stones -= listing.price; seller.stones += listing.price - tax; p.inventory[listing.itemKey] = (p.inventory[listing.itemKey] || 0) + listing.quantity; listing.status = "sold"; listing.buyerId = id; listing.tax = tax; listing.closedAt = Date.now(); data.market.history.push({ ...listing, id: listingId }); writeData(botId, data);
      return api.sendMessage({ msg: `🤝 Mua thành công ${item.icon} ${item.name} ×${listing.quantity} từ ${seller.name} với ${fmt(listing.price)} linh thạch.\nThuế giao dịch 5%: ${fmt(tax)} linh thạch.` }, message.threadId, message.type);
    }
    if (action === "huy") { const listingId = (args[2] || "").toUpperCase(), listing = listings[listingId]; if (!listing || listing.status !== "active" || listing.type !== "fixed" || listing.sellerId !== id) return api.sendMessage({ msg: "Bạn không có đơn mua ngay này để hủy." }, message.threadId, message.type); p.inventory[listing.itemKey] = (p.inventory[listing.itemKey] || 0) + listing.quantity; listing.status = "cancelled"; listing.closedAt = Date.now(); data.market.history.push({ ...listing, id: listingId }); writeData(botId, data); return api.sendMessage({ msg: `↩️ Đã hủy ${listingId}; vật phẩm được trả về túi.` }, message.threadId, message.type); }
    if (action === "lichsu") { const history = data.market.history.slice(-15).reverse(); return api.sendMessage({ msg: `📜 LỊCH SỬ CHỢ\n\n${history.map(x => `${x.type === "auction" ? "🔨" : "🏪"} ${x.id} · ${ITEMS[x.itemKey]?.name || x.itemKey} ×${x.quantity} · ${x.status}`).join("\n") || "Chưa có giao dịch."}` }, message.threadId, message.type); }
    const query = action === "tim" ? (args[2] || "").toLowerCase() : "";
    const active = Object.entries(listings).filter(([,x]) => x.status === "active" && x.type === "fixed" && (!query || x.itemKey.includes(query) || ITEMS[x.itemKey]?.name.toLowerCase().includes(query))).slice(-20);
    writeData(botId, data); return api.sendMessage({ msg: `🏪 CHỢ VẠN GIỚI${query ? ` · tìm “${query}”` : ""}\n\n${active.map(([code,x]) => `${ITEMS[x.itemKey]?.icon || "📦"} ${code} · ${ITEMS[x.itemKey]?.name || x.itemKey} ×${x.quantity}\n   ${fmt(x.price)} ◈ · bán bởi ${data.players[x.sellerId]?.name || x.sellerId}`).join("\n\n") || "Không có đơn phù hợp."}\n\nĐăng: cho dang <mã> <SL> <tổng giá>\nMua: cho mua <mã_đơn> · Hủy: cho huy <mã_đơn>\nTìm: cho tim <từ_khóa>${events.length ? `\n\n${events.join("\n")}` : ""}` }, message.threadId, message.type);
  }
  if (["daugia", "auction"].includes(cmd)) {
    const events = settleMarket(data), action = (args[1] || "").toLowerCase(), listings = data.market.listings;
    if (action === "dang") {
      const itemKey = resolveItemCode(args[2]), item = ITEMS[itemKey], quantity = clamp(Math.floor(Number(args[3]) || 0), 1, 999), startPrice = parseDonateAmount(args[4]), hours = clamp(Math.floor(Number(args[5]) || 6), 1, 24);
      if (!item || !Number(args[3]) || !startPrice) return api.sendMessage({ msg: `Cú pháp: ${prefix}tt daugia dang <mã_vật_phẩm> <SL> <giá_khởi_điểm> [1-24 giờ]` }, message.threadId, message.type);
      if ((p.inventory[itemKey] || 0) < quantity) return api.sendMessage({ msg: `Bạn không đủ ${item.name}.` }, message.threadId, message.type);
      if (p.forgedItems?.[itemKey]) return api.sendMessage({ msg: "🔥 Không thể đấu giá món đang lưu cấp cường hóa bằng đơn thường." }, message.threadId, message.type);
      if (Object.values(listings).filter(x => x.status === "active" && x.sellerId === id).length >= 10) return api.sendMessage({ msg: "Bạn đã đạt giới hạn 10 đơn đang mở." }, message.threadId, message.type);
      let listingId; do listingId = shortCode("A"); while (listings[listingId]);
      p.inventory[itemKey] -= quantity; listings[listingId] = { type: "auction", sellerId: id, itemKey, quantity, startPrice, currentBid: startPrice, bidderId: "", status: "active", createdAt: Date.now(), expiresAt: Date.now() + hours * 60 * 60_000 };
      writeData(botId, data); return api.sendMessage({ msg: `🔨 Đã mở đấu giá ${listingId}: ${item.icon} ${item.name} ×${quantity}\nKhởi điểm ${fmt(startPrice)} linh thạch · kết thúc sau ${hours} giờ.` }, message.threadId, message.type);
    }
    if (["dau", "bid"].includes(action)) {
      const listingId = (args[2] || "").toUpperCase(), amount = parseDonateAmount(args[3]), listing = listings[listingId];
      if (!listing || listing.status !== "active" || listing.type !== "auction") return api.sendMessage({ msg: "Phiên đấu giá không tồn tại hoặc đã kết thúc." }, message.threadId, message.type);
      if (listing.sellerId === id) return api.sendMessage({ msg: "Người bán không được tự đấu giá." }, message.threadId, message.type);
      const minimum = listing.bidderId ? Math.ceil(listing.currentBid * 1.05) : listing.startPrice;
      if (!amount || amount < minimum) return api.sendMessage({ msg: `Giá mới tối thiểu ${fmt(minimum)} linh thạch.` }, message.threadId, message.type);
      const ownHeld = listing.bidderId === id ? listing.currentBid : 0, required = amount - ownHeld;
      if (p.stones < required) return api.sendMessage({ msg: `Bạn cần thêm ${fmt(required)} linh thạch, hiện có ${fmt(p.stones)}.` }, message.threadId, message.type);
      if (listing.bidderId && listing.bidderId !== id) { const previous = data.players[playerKey(listing.bidderId)]; if (previous) previous.stones += listing.currentBid; }
      p.stones -= required; listing.currentBid = amount; listing.bidderId = id; listing.bidAt = Date.now(); writeData(botId, data);
      return api.sendMessage({ msg: `🔨 ${p.name} đang dẫn ${listingId} với ${fmt(amount)} linh thạch.\nTiền đã được hệ thống giữ; người vừa bị vượt giá đã được hoàn tự động.` }, message.threadId, message.type);
    }
    if (action === "huy") { const listingId = (args[2] || "").toUpperCase(), listing = listings[listingId]; if (!listing || listing.type !== "auction" || listing.status !== "active" || listing.sellerId !== id) return api.sendMessage({ msg: "Bạn không sở hữu phiên đấu giá này." }, message.threadId, message.type); if (listing.bidderId) return api.sendMessage({ msg: "Không thể hủy sau khi đã có người trả giá." }, message.threadId, message.type); p.inventory[listing.itemKey] = (p.inventory[listing.itemKey] || 0) + listing.quantity; listing.status = "cancelled"; listing.closedAt = Date.now(); data.market.history.push({ ...listing, id: listingId }); writeData(botId, data); return api.sendMessage({ msg: `↩️ Đã hủy ${listingId}, vật phẩm được trả về túi.` }, message.threadId, message.type); }
    const active = Object.entries(listings).filter(([,x]) => x.status === "active" && x.type === "auction").sort((a,b) => a[1].expiresAt - b[1].expiresAt).slice(0, 20);
    writeData(botId, data); return api.sendMessage({ msg: `🔨 ĐẤU GIÁ VẠN GIỚI\n\n${active.map(([code,x]) => `${ITEMS[x.itemKey]?.icon || "📦"} ${code} · ${ITEMS[x.itemKey]?.name || x.itemKey} ×${x.quantity}\n   ${fmt(x.currentBid)} ◈${x.bidderId ? ` · dẫn bởi ${data.players[x.bidderId]?.name || x.bidderId}` : " · chưa có giá"} · còn ${waitText(x.expiresAt - Date.now())}`).join("\n\n") || "Chưa có phiên đấu giá."}\n\nĐăng: daugia dang <mã> <SL> <giá đầu> [giờ]\nTrả giá: daugia dau <mã_đơn> <giá> · Hủy: daugia huy <mã_đơn>${events.length ? `\n\n${events.join("\n")}` : ""}` }, message.threadId, message.type);
  }
  if (cmd === "chetao") {
    const key = (args[1] || "").toLowerCase(), recipe = CRAFT_RECIPES[key], quantity = clamp(Math.floor(Number(args[2]) || 1), 1, 20);
    if (!recipe) return api.sendMessage({ msg: `⚒️ LUYỆN ĐAN & RÈN KHÍ\n\n${Object.entries(CRAFT_RECIPES).map(([code, entry]) => `${ITEMS[entry.output].icon} ${code} · ${entry.name}\n   ${materialText(entry.materials)} · ${fmt(entry.stones)} ◈`).join("\n\n")}\n\nChế tạo: ${prefix}tt chetao <mã> [số lượng]` }, message.threadId, message.type);
    const missing = Object.entries(recipe.materials).filter(([material, count]) => (p.inventory[material] || 0) < count * quantity);
    const cost = recipe.stones * quantity;
    if (missing.length || p.stones < cost) return api.sendMessage({ msg: `⚒️ Chưa đủ để chế tạo ×${quantity} ${recipe.name}.\nCần: ${materialText(Object.fromEntries(Object.entries(recipe.materials).map(([k,v]) => [k, v * quantity])))} · ${fmt(cost)} ◈\nThiếu: ${missing.map(([k,v]) => `${ITEMS[k].icon} ${ITEMS[k].name} ×${v * quantity - (p.inventory[k] || 0)}`).join(" · ") || `${fmt(cost - p.stones)} linh thạch`}` }, message.threadId, message.type);
    for (const [material, count] of Object.entries(recipe.materials)) p.inventory[material] -= count * quantity;
    p.stones -= cost; p.inventory[recipe.output] = (p.inventory[recipe.output] || 0) + recipe.quantity * quantity; writeData(botId, data);
    return api.sendMessage({ msg: `✨ Chế tạo thành công ${ITEMS[recipe.output].icon} ${recipe.name} ×${recipe.quantity * quantity}.\nĐã tiêu ${materialText(Object.fromEntries(Object.entries(recipe.materials).map(([k,v]) => [k, v * quantity])))} và ${fmt(cost)} linh thạch.` }, message.threadId, message.type);
  }
  if (["thegioiboss", "worldboss"].includes(cmd)) {
    const boss = currentWorldBoss(data), action = (args[1] || "").toLowerCase();
    const ranking = Object.entries(boss.contributions).sort((a,b) => b[1] - a[1]).slice(0, 10);
    if (!["danh", "attack", "chien"].includes(action)) { writeData(botId, data); return api.sendMessage({ msg: `🌍 THẾ GIỚI BOSS ${boss.stage + 1}/${WORLD_BOSSES_PER_DAY} · ${boss.icon} ${boss.name}\n❤️ ${fmt(boss.hp)}/${fmt(boss.maxHp)} HP${boss.defeatedAt ? " · ĐÃ BỊ TIÊU DIỆT" : ""}\n\n🏆 SÁT THƯƠNG\n${ranking.map(([uid, damage], i) => `${i + 1}. ${data.players[uid]?.name || uid}: ${fmt(damage)}`).join("\n") || "Chưa có tu sĩ xuất chiến."}\n\nĐánh: ${prefix}tt thegioiboss danh · hồi chiêu 60 giây.` }, message.threadId, message.type); }
    if (boss.defeatedAt) return api.sendMessage({ msg: `👑 Đã tiêu diệt đủ ${WORLD_BOSSES_PER_DAY}/${WORLD_BOSSES_PER_DAY} Boss Thế Giới hôm nay. Ngày mai sẽ mở đợt mới.` }, message.threadId, message.type);
    const left = cooldown(p, "worldBoss", 60_000); if (left) return api.sendMessage({ msg: `⏳ Chờ ${waitText(left)} để đánh Boss thế giới tiếp.` }, message.threadId, message.type);
    if (p.energy < 15) return api.sendMessage({ msg: "⚡ Cần 15 thể lực để xuất chiến." }, message.threadId, message.type);
    const damage = Math.max(1, Math.round(stats(p).power * selectedCombatSkill(p).mult * (.72 + Math.random() * .36)));
    p.energy -= 15; p.actions.worldBoss = Date.now(); boss.hp = Math.max(0, boss.hp - damage); boss.contributions[id] = (boss.contributions[id] || 0) + damage;
    let rewardText = "";
    if (!boss.hp) { boss.defeatedAt = Date.now(); boss.rewardsGiven = true; const total = Math.max(1, Object.values(boss.contributions).reduce((a,b) => a + b, 0)); for (const [uid, dealt] of Object.entries(boss.contributions)) { const member = data.players[uid]; if (!member) continue; const share = dealt / total, stones = Math.max(300, Math.round(18000 * share)), cultivation = Math.max(500, Math.round(45000 * share)); member.stones += stones; addCultivation(member, cultivation); member.worldBossKills = (member.worldBossKills || 0) + 1; } rewardText = "\n🌠 Boss đã bị tiêu diệt! 18.000 linh thạch và 45.000 tu vi được chia theo đóng góp (mọi người có tham chiến đều có thưởng tối thiểu)."; }
    writeData(botId, data);
    const caption = `${boss.icon} ${p.name} gây ${fmt(damage)} sát thương lên ${boss.name}!\n❤️ Còn ${fmt(boss.hp)}/${fmt(boss.maxHp)} HP\nĐóng góp cá nhân: ${fmt(boss.contributions[id])}.${rewardText}`;
    try {
      const gif = await renderGifInWorker({
        kind: "battle", p, sect: SECTS[p.sect], realmName: realmTitle(p),
        enemy: { name: boss.name, title: "Boss Thế Giới", level: 5, bossAsset: boss.asset, worldBoss: true },
        result: { win: !boss.hp, worldBoss: true, damage, bossHp: boss.hp, bossMaxHp: boss.maxHp, myPower: stats(p).power, enemyPower: boss.maxHp, skillName: selectedCombatSkill(p).name, cultivation: 0, stones: 0 },
      });
      return sendImage(api, message, gif, caption);
    } catch (error) {
      console.error("[tu-tien] Không thể render GIF Boss Thế Giới:", error?.message || error);
      return api.sendMessage({ msg: caption }, message.threadId, message.type);
    }
  }
  if (["todoi", "party"].includes(cmd)) {
    const action = (args[1] || "").toLowerCase(), found = playerParty(data, id), partyCode = found?.[0], party = found?.[1];
    if (["tao", "create"].includes(action)) { if (party) return api.sendMessage({ msg: `Bạn đã ở trong tổ đội ${partyCode}.` }, message.threadId, message.type); const code = shortCode("T"); data.parties[code] = { leaderId: id, members: [id], createdAt: Date.now() }; writeData(botId, data); return api.sendMessage({ msg: `🛡️ Đã lập tổ đội ${code}. Người khác dùng: ${prefix}tt todoi vao ${code}\nTối đa 3 thành viên.` }, message.threadId, message.type); }
    if (["vao", "join"].includes(action)) { if (party) return api.sendMessage({ msg: `Bạn đã ở trong tổ đội ${partyCode}.` }, message.threadId, message.type); const code = (args[2] || "").toUpperCase(), target = data.parties[code]; if (!target) return api.sendMessage({ msg: "Không tìm thấy mã tổ đội." }, message.threadId, message.type); if (target.members.length >= 3) return api.sendMessage({ msg: "Tổ đội đã đủ 3 người." }, message.threadId, message.type); target.members.push(id); writeData(botId, data); return api.sendMessage({ msg: `🛡️ ${p.name} đã gia nhập tổ đội ${code} (${target.members.length}/3).` }, message.threadId, message.type); }
    if (["roi", "leave"].includes(action)) { if (!party) return api.sendMessage({ msg: "Bạn chưa có tổ đội." }, message.threadId, message.type); party.members = party.members.filter(uid => uid !== id); if (!party.members.length) delete data.parties[partyCode]; else if (party.leaderId === id) party.leaderId = party.members[0]; writeData(botId, data); return api.sendMessage({ msg: `🚪 Đã rời tổ đội ${partyCode}.` }, message.threadId, message.type); }
    if (["phoban", "bicanh"].includes(action)) {
      if (!party || party.leaderId !== id) return api.sendMessage({ msg: "Chỉ đội trưởng mới được mở bí cảnh tổ đội." }, message.threadId, message.type);
      const dungeonKey = (args[2] || "").toLowerCase(), dungeon = DUNGEONS[dungeonKey];
      if (!dungeon) return api.sendMessage({ msg: `🏯 BÍ CẢNH TỔ ĐỘI\n\n${Object.entries(DUNGEONS).map(([code, entry]) => `${entry.icon} ${code} · ${entry.name} · ${REALMS[entry.req][0]}`).join("\n")}\n\nĐội trưởng mở: todoi phoban <mã>` }, message.threadId, message.type);
      const members = party.members.map(uid => data.players[uid]).filter(Boolean); members.forEach(refreshPlayer);
      if (members.some(member => member.realm < dungeon.req)) return api.sendMessage({ msg: `🔒 Mọi thành viên cần đạt ${REALMS[dungeon.req][0]}.` }, message.threadId, message.type);
      if (members.some(member => member.activeMap !== p.activeMap)) return api.sendMessage({ msg: "🗺️ Mọi thành viên phải đứng cùng map với đội trưởng." }, message.threadId, message.type);
      const floor = Math.min(...members.map(member => dungeonProgress(member, dungeonKey))) + 1;
      if (floor > dungeon.floors) return api.sendMessage({ msg: `👑 Cả đội đã phá đảo ${dungeon.name}.` }, message.threadId, message.type);
      const cost = 18 + Math.ceil(floor / 4) * 3;
      if (members.some(member => member.energy < cost)) return api.sendMessage({ msg: `⚡ Mọi thành viên cần ${cost} thể lực.` }, message.threadId, message.type);
      const enemyPower = Math.round((520 + floor * 210 + dungeon.req * 360) * dungeon.power * Math.max(1, members.length * .78));
      const battle = resolvePartyDungeon(members.map(member => stats(member).power * selectedCombatSkill(member).mult), enemyPower);
      const cultivation = battle.win ? Math.round((110 + floor * 42) * dungeon.reward) : 0, stones = battle.win ? Math.round((65 + floor * 24) * dungeon.reward) : 0;
      for (const member of members) { member.energy -= cost; if (battle.win) { member.dungeons ||= {}; member.dungeons[dungeonKey] = Math.max(dungeonProgress(member, dungeonKey), floor); member.wins++; member.kills++; member.stones += stones; addCultivation(member, cultivation); grantDrops(member, dungeon.drops, 1 + members.length * .25); } else member.losses++; }
      writeData(botId, data);
      return api.sendMessage({ msg: `🏯 BÍ CẢNH TỔ ĐỘI · ${dungeon.name} ${floor}/${dungeon.floors}\n${members.map(member => member.name).join(" · ")}\n\n${battle.win ? `🏆 Vượt ải! Mỗi người +${fmt(cultivation)} tu vi, +${fmt(stones)} linh thạch và tự roll đồ.` : `💥 Thất bại (${fmt(battle.partyPower)}/${fmt(enemyPower)} chiến lực).`}\n🤝 Hiệp lực đội: +${Math.round((battle.synergy - 1) * 100)}%.` }, message.threadId, message.type);
    }
    if (action === "boss") {
      if (!party || party.leaderId !== id) return api.sendMessage({ msg: "Chỉ đội trưởng mới được mở trận Boss tổ đội." }, message.threadId, message.type);
      const bossKey = (args[2] || "").toLowerCase(), difficultyLevel = clamp(Number(args[3]) || 1, 1, 5), map = MAPS[p.activeMap], boss = resolveBossForMap(p.activeMap, bossKey), difficulty = BOSS_DIFFICULTIES[difficultyLevel];
      if (!boss) return api.sendMessage({ msg: `Boss không tồn tại tại ${map.name}. Gõ boss để xem mã.` }, message.threadId, message.type);
      const members = party.members.map(uid => data.players[uid]).filter(Boolean); members.forEach(refreshPlayer); const cost = 22 + difficultyLevel * 4;
      if (members.some(member => member.activeMap !== p.activeMap)) return api.sendMessage({ msg: "🗺️ Mọi thành viên phải đứng cùng map với đội trưởng." }, message.threadId, message.type);
      if (members.some(member => member.energy < cost)) return api.sendMessage({ msg: `⚡ Mọi thành viên cần ${cost} thể lực.` }, message.threadId, message.type);
      const myPower = teamPower(members), enemyPower = Math.round((1000 + map.level * 900 + Math.max(...members.map(x => x.realm)) * 360) * map.multiplier * boss.multiplier * difficulty.power * Math.max(1, members.length * .72)), win = myPower * (.84 + Math.random() * .28) >= enemyPower * (.88 + Math.random() * .2);
      const cultivation = win ? Math.round((180 + map.level * 130) * difficulty.reward) : 0, stones = win ? Math.round((100 + map.level * 70) * difficulty.reward) : 0;
      for (const member of members) { member.energy -= cost; if (win) { member.wins++; member.bossKills++; member.stones += stones; addCultivation(member, cultivation); addMapBossKill(member, p.activeMap); grantBossDrops(member, boss, difficulty.drop * .75); } else member.losses++; }
      writeData(botId, data); return api.sendMessage({ msg: `🛡️ BOSS TỔ ĐỘI ${members.length} NGƯỜI\n${members.map(x => x.name).join(" · ")}\n\n${win ? `🏆 Hạ ${boss.name} cấp ${difficultyLevel}! Mỗi người +${fmt(cultivation)} tu vi, +${fmt(stones)} linh thạch và tự roll đồ.` : `💥 Cả đội thất bại (${fmt(myPower)}/${fmt(enemyPower)} chiến lực).`}` }, message.threadId, message.type);
    }
    return api.sendMessage({ msg: party ? `🛡️ TỔ ĐỘI ${partyCode} · ${party.members.length}/3\n${party.members.map((uid,i) => `${uid === party.leaderId ? "👑" : "▫️"} ${data.players[uid]?.name || uid}`).join("\n")}\n\nĐội trưởng: todoi boss <mã_boss> [cấp 1-5] · todoi phoban <mã>\nRời: todoi roi` : `🛡️ Bạn chưa có tổ đội.\nTạo: todoi tao\nVào: todoi vao <mã>` }, message.threadId, message.type);
  }
  if (cmd === "bangchien") { const mine=playerGuild(data,id),targetCode=(args[1]||"").toUpperCase(),target=data.guilds[targetCode];if(!mine)return api.sendMessage({msg:"Bạn chưa thuộc tông môn người chơi."},message.threadId,message.type);if(!targetCode||!target||targetCode===mine[0]){const lands=Object.entries(data.guilds).sort((a,b)=>(b[1].warPoints||0)-(a[1].warPoints||0)||(b[1].territories||0)-(a[1].territories||0));return api.sendMessage({msg:`⚔️ BANG CHIẾN MÙA ${new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Ho_Chi_Minh"}).slice(0,7)}\n${lands.slice(0,10).map(([code,g],index)=>`${index+1}. ${g.name} [${code}] · ${g.warPoints||0} điểm · ${g.territories||0} lãnh địa · chuỗi ${g.warStreak||0}`).join("\n")||"Chưa có tông môn tham chiến."}\n\nTông chủ/Phó tông chủ khai chiến: bangchien <mã_tông_môn>`},message.threadId,message.type);}const guild=mine[1];if(guild.ownerId!==id&&guild.roles?.[id]!=="pho")return api.sendMessage({msg:"Chỉ Tông chủ hoặc Phó tông chủ được phát động bang chiến."},message.threadId,message.type);const left=Math.max(0,24*60*60_000-(Date.now()-(guild.lastWarAt||0)));if(left)return api.sendMessage({msg:`⏳ Tông môn cần nghỉ ${waitText(left)}.`},message.threadId,message.type);const power=g=>g.members.reduce((sum,uid)=>sum+(data.players[uid]?stats(data.players[uid]).power:0),0)*(1+g.level*.025),myPower=power(guild),enemyPower=power(target),result=resolveGuildWar(myPower,enemyPower,guild.warStreak);guild.lastWarAt=Date.now();target.lastWarAt=Date.now();guild.warPoints=(guild.warPoints||0)+result.points;guild.warStreak=result.nextStreak;guild.fund+=result.fund;if(result.win){guild.territories=(guild.territories||0)+1;target.territories=Math.max(0,(target.territories||0)-1);}else{target.warPoints=(target.warPoints||0)+3;target.warStreak=(target.warStreak||0)+1;target.territories=(target.territories||0)+1;guild.territories=Math.max(0,(guild.territories||0)-1);target.fund+=7500;}writeData(botId,data);return api.sendMessage({msg:`⚔️ ${guild.name} giao chiến ${target.name}\n${result.win?`🏆 ${guild.name}`:`🏆 ${target.name}`} chiến thắng và chiếm 1 lãnh địa.\n${guild.name}: +${result.points} điểm, +${fmt(result.fund)} quỹ · chuỗi ${guild.warStreak}.\nChiến lực: ${fmt(myPower)} vs ${fmt(enemyPower)}.`},message.threadId,message.type); }
  if (["banghoi", "guild"].includes(cmd)) {
    const action = (args[1] || "").toLowerCase(), found = playerGuild(data, id), guildCode = found?.[0], guild = found?.[1];
    if (action === "lap") { const name = args.slice(2).join(" ").trim().slice(0, 28); if (guild) return api.sendMessage({ msg: "Bạn đã thuộc một tông môn người chơi." }, message.threadId, message.type); if (!name || p.stones < 10000) return api.sendMessage({ msg: "Lập tông môn cần tên và 10.000 linh thạch. Ví dụ: banghoi lap Thiên Đạo Minh" }, message.threadId, message.type); const code = shortCode("B"); p.stones -= 10000; data.guilds[code] = { name, ownerId: id, members: [id], fund: 0, level: 1, createdAt: Date.now() }; p.guildLevelSnapshot = 1; writeData(botId, data); return api.sendMessage({ msg: `🏯 Đã khai sơn lập ${name} · mã ${code}.\nNgười khác dùng: banghoi vao ${code}` }, message.threadId, message.type); }
    if (action === "vao") { if (guild) return api.sendMessage({ msg: "Bạn phải rời tông môn hiện tại trước." }, message.threadId, message.type); const code = (args[2] || "").toUpperCase(), target = data.guilds[code]; if (!target) return api.sendMessage({ msg: "Không tìm thấy mã tông môn." }, message.threadId, message.type); if (target.members.length >= 30) return api.sendMessage({ msg: "Tông môn đã đủ 30 thành viên." }, message.threadId, message.type); target.members.push(id); target.roles ||= {}; target.roles[id] = "de"; p.guildLevelSnapshot = target.level; p.guildRoleSnapshot = "de"; writeData(botId, data); return api.sendMessage({ msg: `🏯 ${p.name} đã gia nhập ${target.name}.` }, message.threadId, message.type); }
    if (action === "gop") { if (!guild) return api.sendMessage({ msg: "Bạn chưa gia nhập tông môn." }, message.threadId, message.type); const amount = parseDonateAmount(args[2]); if (!amount || p.stones < amount) return api.sendMessage({ msg: `Số linh thạch không hợp lệ hoặc không đủ. Bạn có ${fmt(p.stones)}.` }, message.threadId, message.type); p.stones -= amount; guild.fund += amount; guild.contributions ||= {}; guild.contributions[id] = (guild.contributions[id] || 0) + amount; const oldLevel = guild.level, need = level => level * level * 12000; while (guild.level < 20 && guild.fund >= need(guild.level + 1)) guild.level++; for (const uid of guild.members) if (data.players[uid]) data.players[uid].guildLevelSnapshot = guild.level; writeData(botId, data); return api.sendMessage({ msg: `💰 Đã góp ${fmt(amount)} vào ${guild.name}. Quỹ: ${fmt(guild.fund)}.\nCấp ${oldLevel} → ${guild.level}${guild.level < 20 ? ` · cấp kế cần tổng ${fmt(need(guild.level + 1))}` : " · đã tối đa"}.` }, message.threadId, message.type); }
    if (action === "chuyen") { const mention = Array.isArray(message.data?.mentions) ? message.data.mentions[0] : null, targetId = playerKey(mention?.uid || mention?.userId || mention?.id || ""); if (!guild || guild.ownerId !== id) return api.sendMessage({ msg: "Chỉ tông chủ mới được chuyển quyền." }, message.threadId, message.type); if (!targetId || !guild.members.includes(targetId) || targetId === id) return api.sendMessage({ msg: "Hãy tag một thành viên khác trong tông môn." }, message.threadId, message.type); guild.ownerId = targetId; writeData(botId, data); return api.sendMessage({ msg: `👑 Đã truyền ngôi Tông chủ ${guild.name} cho ${data.players[targetId]?.name || targetId}.` }, message.threadId, message.type); }
    if (action === "chucvu") { const role = (args[2] || "").toLowerCase(), roles = { pho: "Phó Tông Chủ", truonglao: "Trưởng Lão", de: "Đệ Tử" }, mention = Array.isArray(message.data?.mentions) ? message.data.mentions[0] : null, targetId = playerKey(mention?.uid || mention?.userId || mention?.id || ""); if (!guild || guild.ownerId !== id) return api.sendMessage({ msg: "Chỉ Tông chủ được bổ nhiệm chức vụ." }, message.threadId, message.type); if (!roles[role] || !guild.members.includes(targetId) || targetId === id) return api.sendMessage({ msg: "Dùng: banghoi chucvu <pho|truonglao|de> @thành_viên" }, message.threadId, message.type); guild.roles ||= {}; guild.roles[targetId] = role; if (data.players[targetId]) data.players[targetId].guildRoleSnapshot = role; writeData(botId, data); return api.sendMessage({ msg: `🏯 Đã bổ nhiệm ${data.players[targetId]?.name || targetId} làm ${roles[role]}.` }, message.threadId, message.type); }
    if (["top", "rank"].includes(action)) { const list = Object.entries(data.guilds).sort((a,b) => b[1].level - a[1].level || b[1].fund - a[1].fund).slice(0, 10); return api.sendMessage({ msg: `🏆 TÔNG MÔN BẢNG\n\n${list.map(([code, entry], i) => `${i + 1}. ${entry.name} [${code}] · cấp ${entry.level}\n   ${entry.members.length} thành viên · ${fmt(entry.fund)} quỹ`).join("\n") || "Chưa có tông môn."}` }, message.threadId, message.type); }
    if (action === "roi") { if (!guild) return api.sendMessage({ msg: "Bạn chưa thuộc tông môn." }, message.threadId, message.type); if (guild.ownerId === id && guild.members.length > 1) return api.sendMessage({ msg: "Tông chủ phải chuyển quyền hoặc chỉ còn một mình mới có thể rời." }, message.threadId, message.type); guild.members = guild.members.filter(uid => uid !== id); if (guild.roles) delete guild.roles[id]; p.guildLevelSnapshot = 0; p.guildRoleSnapshot = ""; if (!guild.members.length) delete data.guilds[guildCode]; writeData(botId, data); return api.sendMessage({ msg: `🚪 Đã rời ${guild.name}.` }, message.threadId, message.type); }
    return api.sendMessage({ msg: guild ? `🏯 ${guild.name} · ${guildCode}\nCấp ${guild.level}/20 · ${guild.members.length}/30 thành viên · quỹ ${fmt(guild.fund)}\nBuff: +${guild.level * 10} công, +${guild.level * 8} thủ, +${guild.level * 35} HP, +${guild.level}% tu luyện.\nChức vụ: ${guild.ownerId === id ? "Tông Chủ" : ({ pho: "Phó Tông Chủ", truonglao: "Trưởng Lão", de: "Đệ Tử" }[guild.roles?.[id]] || "Đệ Tử")}\n\nGóp: banghoi gop <số> · Bổ nhiệm: banghoi chucvu <pho|truonglao|de> @người · Rời: banghoi roi · Top: banghoi top` : `🏯 TÔNG MÔN NGƯỜI CHƠI\nLập (10.000 ◈): banghoi lap <tên>\nGia nhập: banghoi vao <mã>\nXếp hạng: banghoi top` }, message.threadId, message.type);
  }
  if (cmd === "songtu") {
    const action = (args[1] || "").toLowerCase();
    if (["huy", "huybo", "tat"].includes(action)) {
      if (!p.songTu) return api.sendMessage({ msg: "Bạn chưa có đạo hữu Song Tu." }, message.threadId, message.type);
      const partner = data.players[playerKey(p.songTu.userId)], name = p.songTu.name;
      if (partner?.songTu?.userId === p.userId) delete partner.songTu;
      delete p.songTu; writeData(botId, data);
      return api.sendMessage({ msg: `💔 Đã kết thúc Song Tu với ${name}.` }, message.threadId, message.type);
    }
    const mention = Array.isArray(message.data.mentions) ? message.data.mentions[0] : null, targetId = String(mention?.uid || mention?.userId || mention?.id || "");
    if (!targetId) {
      if (!p.songTu) return api.sendMessage({ msg: "💞 Cú pháp: songtu @người_chơi\nNgười ấy thả ❤️ vào lời mời để đồng ý, 👍 để từ chối." }, message.threadId, message.type);
      const partner = data.players[playerKey(p.songTu.userId)];
      if (!partner?.songTu || partner.songTu.userId !== p.userId) { delete p.songTu; writeData(botId, data); return api.sendMessage({ msg: "💔 Đạo hữu Song Tu không còn liên kết." }, message.threadId, message.type); }
      if (partner.activeMap !== p.activeMap) return api.sendMessage({ msg: `🗺️ Song Tu cần cùng map. ${partner.name} hiện ở ${MAPS[partner.activeMap]?.name || "một nơi khác"}.` }, message.threadId, message.type);
      const left = Math.max(cooldown(p, "songtu"), cooldown(partner, "songtu"));
      if (left) return api.sendMessage({ msg: `🧘 Song Tu cần điều tức, chờ ${waitText(left)}.` }, message.threadId, message.type);
      if (p.energy < 12 || (partner.energy ?? 100) < 12) return api.sendMessage({ msg: "⚡ Cả hai cần tối thiểu 12 thể lực để Song Tu." }, message.threadId, message.type);
      const gain = 35 + Math.min(p.realm || 0, partner.realm || 0) * 14, mapKey = p.activeMap;
      p.energy -= 12; partner.energy -= 12; addCultivation(p, gain); addCultivation(partner, gain); addMapCultivation(p, gain, mapKey); addMapCultivation(partner, gain, mapKey); p.actions.songtu = Date.now(); partner.actions.songtu = Date.now(); writeData(botId, data);
      return api.sendMessage({ msg: `💞 ${p.name} và ${partner.name} Song Tu thành công tại ${MAPS[mapKey].name}.\nMỗi người +${fmt(gain)} tu vi · -12 thể lực. Lần tiếp theo sau 6 giờ.` }, message.threadId, message.type);
    }
    if (p.songTu) return api.sendMessage({ msg: `💞 Bạn đang Song Tu cùng ${p.songTu.name}. Gõ songtu không tag để cùng tu luyện, hoặc songtu huy để kết thúc.` }, message.threadId, message.type);
    const target = data.players[playerKey(targetId)];
    if (!target || targetId === id) return api.sendMessage({ msg: "💞 Người này chưa tu tiên hoặc không hợp lệ." }, message.threadId, message.type);
    if (target.songTu) return api.sendMessage({ msg: `💞 ${target.name} đã có đạo hữu Song Tu.` }, message.threadId, message.type);
    if (target.pendingSongTu?.expiresAt > Date.now()) return api.sendMessage({ msg: `💞 ${target.name} đang có lời mời Song Tu chờ phản hồi.` }, message.threadId, message.type);
    const invitation = await api.sendMessage({ msg: `💞 LỜI MỜI SONG TU\n\n${p.name} muốn cùng ${target.name} kết Song Tu.\n❤️ Thả TIM để đồng ý · 👍 Thả LIKE để từ chối\n⏳ Lời mời có hiệu lực 10 phút.` }, message.threadId, message.type);
    const messageIds = [invitation?.messageID, invitation?.msgId, invitation?.cliMsgId, invitation?.message?.messageID, invitation?.message?.msgId, invitation?.message?.cliMsgId, invitation?.data?.msgId, invitation?.data?.cliMsgId].filter(Boolean).map(String);
    if (!messageIds.length) return api.sendMessage({ msg: "⚠️ Không thể tạo lời mời Song Tu, hãy thử lại." }, message.threadId, message.type);
    target.pendingSongTu = { fromId: p.userId, fromName: p.name, messageIds, expiresAt: Date.now() + 10 * 60_000 };
    const pending = { targetId: target.userId, expiresAt: target.pendingSongTu.expiresAt };
    for (const messageId of messageIds) pendingSongTuReactions.set(messageId, pending);
    const expiry = setTimeout(() => {
      for (const messageId of messageIds) pendingSongTuReactions.delete(messageId);
    }, 10 * 60_000);
    expiry.unref?.();
    writeData(botId, data);
    return;
  }
  if (cmd === "daolu") {
    const action = (args[1] || "").toLowerCase();
    if (action === "chapnhan") {
      const proposal = p.pendingDaoLu;
      const proposer = proposal && data.players[playerKey(proposal.userId)];
      if (!proposal || !proposer || proposal.expiresAt < Date.now()) { delete p.pendingDaoLu; writeData(botId, data); return api.sendMessage({ msg: "💔 Không có lời cầu hôn còn hiệu lực." }, message.threadId, message.type); }
      if (p.daoLu || proposer.daoLu) return api.sendMessage({ msg: "💔 Một trong hai đã có đạo lữ." }, message.threadId, message.type);
      p.daoLu = { userId: proposer.userId, name: proposer.name, since: Date.now() }; proposer.daoLu = { userId: p.userId, name: p.name, since: Date.now() };
      delete p.pendingDaoLu; p.stones += 150; proposer.stones += 150; writeData(botId, data);
      return api.sendMessage({ msg: `💞 Thiên địa làm chứng: ${p.name} và ${proposer.name} đã kết thành Đạo Lữ!\nMỗi người nhận 150 linh thạch.` }, message.threadId, message.type);
    }
    const mention = Array.isArray(message.data.mentions) ? message.data.mentions[0] : null, targetId = String(mention?.uid || mention?.userId || mention?.id || "");
    if (!targetId) return api.sendMessage({ msg: "💞 Cú pháp: daolu @người_chơi\nNgười được cầu hôn gõ: daolu chapnhan" }, message.threadId, message.type);
    if (p.daoLu) return api.sendMessage({ msg: `💞 Bạn đã có đạo lữ: ${p.daoLu.name}.` }, message.threadId, message.type);
    const target = data.players[playerKey(targetId)];
    if (!target || targetId === id) return api.sendMessage({ msg: "💞 Người này chưa tu tiên hoặc không hợp lệ." }, message.threadId, message.type);
    if (target.daoLu) return api.sendMessage({ msg: `💞 ${target.name} đã có đạo lữ.` }, message.threadId, message.type);
    target.pendingDaoLu = { userId: p.userId, name: p.name, expiresAt: Date.now() + 10 * 60_000 }; writeData(botId, data);
    return api.sendMessage({ msg: `💌 ${p.name} gửi lời kết Đạo Lữ tới ${target.name}.\n${target.name} hãy gõ: daolu chapnhan (hiệu lực 10 phút).` }, message.threadId, message.type);
  }
  if (cmd === "huydaolu") {
    if (!p.daoLu) return api.sendMessage({ msg: "Bạn chưa có đạo lữ." }, message.threadId, message.type);
    const partner = data.players[playerKey(p.daoLu.userId)], name = p.daoLu.name;
    if (partner?.daoLu?.userId === p.userId) delete partner.daoLu;
    delete p.daoLu; writeData(botId, data);
    return api.sendMessage({ msg: `💔 Đã giải trừ đạo lữ với ${name}.` }, message.threadId, message.type);
  }
  if (cmd === "tuluyen") { const left = cooldown(p, "cultivate"); if (left) return api.sendMessage({ msg: `🕰️ Linh khí chưa ổn định, chờ ${waitText(left)}.` }, message.threadId, message.type); const rate = stats(p).cultivationRate, gain = Math.round((42 + p.realm * 18 + Math.floor(Math.random() * 36)) * rate), stones = 12 + Math.floor(Math.random() * 18), map = MAPS[p.activeMap] || MAPS.thachthon, mapKey = p.activeMap; addCultivation(p, gain); addMapCultivation(p, gain, mapKey); const arrived = advanceMapIfReady(p); p.stones += stones; p.energy = Math.min(MAX_ENERGY, p.energy + 6); p.actions.cultivate = Date.now(); touchQuest(p, "cultivate"); writeData(botId, data); return sendImage(api, message, await animatedOrProfile(p, { kind: "action", p, type: "cultivate", success: true }), `🧘 ${TECHNIQUES[p.activeTechnique].name}: +${gain} tu vi, +${stones} linh thạch.\n🗺️ ${map.name}: ${fmt(mapCultivation(p, mapKey))}/${fmt(map.need)} tu vi map.${arrived ? `\n🌠 Đã tiến vào ${arrived.icon} ${arrived.name}; gõ boss để gặp Boss map mới.` : ""}\n📜 Nhiệm vụ tu luyện: ${Math.min(3, p.quests.cultivate)}/3`); }
  if (cmd === "dotpha") {
    if (p.realm >= REALMS.length - 1) return api.sendMessage({ msg: "Bạn đã đứng trên đỉnh Tiên Đế." }, message.threadId, message.type);
    const need = nextNeed(p), stages = minorStages(p), requirement = missingBreakthroughRequirements(p);
    if (p.cultivation < need) return api.sendMessage({ msg: `Chưa đủ tu vi để lên ${stages[minorRealm(p) + 1] || REALMS[p.realm + 1][0]}. Cần ${fmt(need)}, hiện có ${fmt(p.cultivation)}.` }, message.threadId, message.type);
    if (requirement.missing.length) return api.sendMessage({ msg: `🔒 Chưa đủ điều kiện đột phá ${realmTitle(p)}:\n${requirement.missing.map(item => `• ${item}`).join("\n")}\n\nHạ Boss: boss · Xem map: map` }, message.threadId, message.type);
    const powerBeforeBreakthrough = stats(p).power;
    const { material, quantity } = requirement.req, charm = (p.inventory.phukiep || 0) > 0;
    p.inventory[material] -= quantity;
    const chance = clamp(.66 - p.realm * .032 + (charm ? .15 : 0), .24, .84);
    const majorBreak = requirement.req.majorBreak;
    const thunderCount = majorBreak ? 9 : p.realm >= 8 ? 6 : 3;
    const thunderNeed = Math.ceil(thunderCount * .67);
    const tribulationName = thunderCount === 9 ? "Cửu Cửu Thiên Kiếp" : thunderCount === 6 ? "Lục Hợp Thiên Kiếp" : "Tam Trọng Thiên Kiếp";
    const boltChance = clamp(.94 - p.realm * .012 + (charm ? .025 : 0), .65, .96);
    let enduredBolts = 0;
    for (let bolt = 0; bolt < thunderCount; bolt++) if (Math.random() < boltChance) enduredBolts++;
    const ok = Math.random() < chance && enduredBolts >= thunderNeed;
    if (charm) p.inventory.phukiep--;
    const before = realmTitle(p);
    const cultivationCost = Math.floor((need - REALMS[p.realm][1]) * .35);
    if (ok) {
      addCultivation(p, -cultivationCost);
      const after = advanceRealm(p);
      // Tu vi là một phần của chiến lực nhưng bị tiêu hao khi đột phá. Ghi nhận
      // phần sức mạnh đã luyện hóa để thành công luôn làm chiến lực tăng, kể cả
      // khi chỉ lên tiểu cảnh giới (trước đây tiểu cảnh giới không được tính).
      const naturalPowerAfter = stats(p).power;
      const minimumGrowth = Math.max(25, Math.round(powerBeforeBreakthrough * .01));
      const convertedPower = Math.max(0, powerBeforeBreakthrough + minimumGrowth - naturalPowerAfter);
      p.breakthroughPower = Math.max(0, Math.floor(Number(p.breakthroughPower) || 0)) + convertedPower;
      const powerAfterBreakthrough = stats(p).power;
      p.energy = MAX_ENERGY;
      p.wins++;
      p.lastBreakthrough = { before, after, at: Date.now(), tribulationName, powerBefore: powerBeforeBreakthrough, powerAfter: powerAfterBreakthrough };
      const master=p.master&&data.players[playerKey(p.master.id)];if(master){const teachingReward=Math.max(100,Math.round(need*.03));addCultivation(master,teachingReward);master.stones+=100+(p.realm||0)*30;master.teachingRewards=(master.teachingRewards||0)+1;}
    }
    else { const lost = Math.floor((need - REALMS[p.realm][1]) * (.25 + (thunderCount - enduredBolts) * .02)); addCultivation(p, -lost); p.energy = Math.max(5, p.energy - 55); p.losses++; }
    writeData(botId, data);
    const catalyst = `${ITEMS[material].icon} ${ITEMS[material].name} ×${quantity}`;
    return sendImage(api, message, await animatedOrProfile(p, { kind: "action", p, type: "breakthrough", success: ok }), ok ? `⚡ ${tribulationName} giáng xuống — bạn chịu được ${enduredBolts}/${thunderCount} đạo lôi, vượt kiếp thành công: ${p.lastBreakthrough.before} → ${p.lastBreakthrough.after}.\n💥 Chiến lực: ${fmt(p.lastBreakthrough.powerBefore)} → ${fmt(p.lastBreakthrough.powerAfter)}\nĐã tiêu hao ${catalyst}${charm ? " và Phù Hộ Kiếp" : ""}, cùng ${fmt(cultivationCost)} tu vi để ổn định căn cơ.` : `🌩️ ${tribulationName} phản phệ: chỉ chịu được ${enduredBolts}/${thunderCount} đạo lôi (cần ${thunderNeed}). Đột phá thất bại, đã tiêu hao ${catalyst}, căn cơ tổn thương nặng.`);
  }
  if (cmd === "chienky") { const all=COMBAT_SKILLS[p.sect], available=unlockedSkills(p); return api.sendMessage({msg:`⚔️ CHIẾN KỸ · ${SECTS[p.sect].name}\n\n${all.map(s=>`${p.activeSkill===s.key?"🔆":s.req<=p.realm?"✅":"🔒"} ${s.key} · ${s.name}\n   Sát thương x${s.mult.toFixed(2)} · ${REALMS[s.req][0]}`).join("\n\n")}\n\nĐã mở ${available.length}/${all.length}. Chọn: chieu <mã>`},message.threadId,message.type); }
  if (cmd === "chieu") { const key=(args[1]||"").toLowerCase(), skill=(COMBAT_SKILLS[p.sect]||[]).find(s=>s.key===key);if(!skill)return api.sendMessage({msg:"Môn phái của bạn không có chiêu này. Gõ chienky để xem."},message.threadId,message.type);if(skill.req>p.realm)return api.sendMessage({msg:`🔒 ${skill.name} cần cảnh giới ${REALMS[skill.req][0]}.`},message.threadId,message.type);p.activeSkill=key;writeData(botId,data);return api.sendMessage({msg:`⚔️ Đã chọn ${skill.name} · hệ số sát thương x${skill.mult.toFixed(2)}.`},message.threadId,message.type); }
  if (["daudoi", "2v2", "3v3"].includes(cmd)) {
    const mode = cmd === "daudoi" ? (args[1] || "").toLowerCase() : cmd, size = mode === "2v2" ? 2 : mode === "3v3" ? 3 : 0;
    const mentions = Array.isArray(message.data?.mentions) ? message.data.mentions : [];
    const ids = mentions.map(entry => playerKey(normalizeUid(entry?.uid || entry?.userId || entry?.id || ""))).filter(Boolean);
    if (!size || ids.length !== size * 2 - 1) return api.sendMessage({ msg: `⚔️ ĐẤU ĐỘI\n\n${prefix}tt daudoi 2v2 @đồng_đội @địch_1 @địch_2\n${prefix}tt daudoi 3v3 @đồng_đội_1 @đồng_đội_2 @địch_1 @địch_2 @địch_3\nTag đúng thứ tự và đủ người.` }, message.threadId, message.type);
    const allIds = [id, ...ids];
    if (new Set(allIds).size !== size * 2) return api.sendMessage({ msg: "⚠️ Mỗi tu sĩ chỉ được xuất hiện một lần trong trận." }, message.threadId, message.type);
    const players = allIds.map(uid => data.players[uid]);
    if (players.some(player => !player)) return api.sendMessage({ msg: "⚠️ Có người được tag chưa tạo nhân vật Tu Tiên." }, message.threadId, message.type);
    const teamAIds = allIds.slice(0, size), teamBIds = allIds.slice(size), inviteId = shortCode("P");
    const sent = await api.sendMessage({ msg: `⚔️ LỜI MỜI ${mode.toUpperCase()}\n\n🔵 ${teamAIds.map(uid=>data.players[uid].name).join(" · ")}\n🔴 ${teamBIds.map(uid=>data.players[uid].name).join(" · ")}\n\n❤️ Tất cả người được tag thả TIM vào tin này để đồng ý.\n👍 Chỉ cần một người thả LIKE là hủy.\n⏳ Hiệu lực 10 phút.` }, message.threadId, message.type);
    const messageIds = await resolveInvitationIds(originalApi, message, sent);
    if (!messageIds.length) return api.sendMessage({ msg: "⚠️ Không lấy được ID tin mời, hãy thử lại." }, message.threadId, message.type);
    data.pvpInvites ||= {}; data.pvpInvites[inviteId] = { mode: mode.toUpperCase(), size, initiatorId: id, participantIds: allIds, teamAIds, teamBIds, acceptedIds: [id], messageIds, threadId: String(message.threadId), expiresAt: Date.now()+10*60_000 };
    for(const messageId of messageIds)pendingPvPReactions.set(messageId,inviteId);writeData(botId,data);return;
  }
  if (["phoban", "ai"].includes(cmd)) {
    const key = (args[1] || "").toLowerCase(), dungeon = DUNGEONS[key];
    if (!key || !dungeon) return api.sendMessage({ msg: `🏯 PHÓ BẢN VẠN GIỚI\n\n${Object.entries(DUNGEONS).map(([code, entry]) => `${p.realm >= entry.req ? "✅" : "🔒"} ${entry.icon} ${code} · ${entry.name}\n   ${REALMS[entry.req][0]} · đã vượt ${dungeonProgress(p, code)}/${entry.floors} ải`).join("\n\n")}\n\nVượt ải kế: ${prefix}tt phoban <mã>` }, message.threadId, message.type);
    if (p.realm < dungeon.req) return api.sendMessage({ msg: `🔒 ${dungeon.name} yêu cầu cảnh giới ${REALMS[dungeon.req][0]}.` }, message.threadId, message.type);
    const cleared = dungeonProgress(p, key);
    if (cleared >= dungeon.floors) return api.sendMessage({ msg: `👑 Bạn đã phá đảo toàn bộ ${dungeon.floors} ải ${dungeon.name}.` }, message.threadId, message.type);
    const floor = cleared + 1, cooldownKey = `dungeon:${key}`, left = cooldown(p, cooldownKey, 45_000);
    if (left) return api.sendMessage({ msg: `⏳ Cổng phó bản đang tái tạo, chờ ${waitText(left)}.` }, message.threadId, message.type);
    const isBoss = floor % 5 === 0 || floor === dungeon.floors, cost = 16 + Math.ceil(floor / 5) * 3 + (isBoss ? 6 : 0);
    if (p.energy < cost) return api.sendMessage({ msg: `⚡ Ải ${floor} cần ${cost} thể lực.` }, message.threadId, message.type);
    const myPower = Math.round(stats(p).power * selectedCombatSkill(p).mult), enemyPower = Math.round((390 + floor * 145 + dungeon.req * 270) * dungeon.power * (isBoss ? 1.32 : 1));
    const win = myPower * (.82 + Math.random() * .3) >= enemyPower * (.88 + Math.random() * .22);
    const cultivation = win ? Math.round((75 + floor * 32) * dungeon.reward * (isBoss ? 1.65 : 1)) : 0, stones = win ? Math.round((42 + floor * 18) * dungeon.reward * (isBoss ? 1.5 : 1)) : 0;
    p.energy -= cost; p.actions[cooldownKey] = Date.now();
    let drops = [];
    if (win) { p.dungeons[key] = floor; p.wins++; p.kills++; p.stones += stones; addCultivation(p, cultivation); drops = grantDrops(p, dungeon.drops, isBoss ? 2.2 : 1); } else p.losses++;
    writeData(botId, data);
    return api.sendMessage({ msg: `${isBoss ? "👹 BOSS ẢI" : "🏯 VƯỢT ẢI"} · ${dungeon.name} ${floor}/${dungeon.floors}\n\n${win ? `🏆 Thắng! +${fmt(cultivation)} tu vi · +${fmt(stones)} linh thạch.\nTiến độ mới: ${floor}/${dungeon.floors}.${drops.length ? `\n🎁 ${drops.join(" · ")}` : ""}${floor === dungeon.floors ? "\n🌠 PHÁ ĐẢO! Bạn đã chinh phục bí cảnh này." : ""}` : `💥 Thất bại. Chiến lực ${fmt(myPower)}/${fmt(enemyPower)}; hãy nâng trang bị hoặc công pháp.`}` }, message.threadId, message.type);
  }
  if (cmd === "pk") {
    const sub = (args[1] || "").toLowerCase();
    // 1. Chấp nhận lời mời PK bằng lệnh chat
    if (["chapnhan", "dongy", "ok", "accept"].includes(sub)) {
      const pvpInviteId = Object.keys(data.pvpInvites || {}).find(k => {
        const inv = data.pvpInvites[k];
        return inv && inv.expiresAt >= Date.now() && inv.participantIds?.some(uid => normalizeUid(uid) === id) && normalizeUid(inv.initiatorId) !== id;
      });
      if (!pvpInviteId) return api.sendMessage({ msg: "⚔️ Bạn không có lời mời PK nào đang chờ chấp nhận." }, message.threadId, message.type);
      const pvpInvite = data.pvpInvites[pvpInviteId];
      const clear = () => (pvpInvite.messageIds || []).forEach(mId => pendingPvPReactions.delete(String(mId)));
      clear(); delete data.pvpInvites[pvpInviteId];
      return executePvPMatch(api, message.threadId, message.type, pvpInvite, data, botId);
    }
    // 2. Từ chối lời mời PK bằng lệnh chat
    if (["tuchoi", "huy", "cancel", "deny"].includes(sub)) {
      const pvpInviteId = Object.keys(data.pvpInvites || {}).find(k => {
        const inv = data.pvpInvites[k];
        return inv && inv.expiresAt >= Date.now() && inv.participantIds?.some(uid => normalizeUid(uid) === id) && normalizeUid(inv.initiatorId) !== id;
      });
      if (!pvpInviteId) return api.sendMessage({ msg: "⚔️ Bạn không có lời mời PK nào đang chờ từ chối." }, message.threadId, message.type);
      const pvpInvite = data.pvpInvites[pvpInviteId];
      const clear = () => (pvpInvite.messageIds || []).forEach(mId => pendingPvPReactions.delete(String(mId)));
      clear(); delete data.pvpInvites[pvpInviteId]; writeData(botId, data);
      return api.sendMessage({ msg: `👍 ${p.name} đã từ chối lời mời PK; trận đấu đã hủy.` }, message.threadId, message.type);
    }
    // 3. Gửi lời mời PK mới (tag người muốn đấu)
    const mention = Array.isArray(message.data?.mentions) ? message.data.mentions[0] : null;
    const targetId = normalizeUid(mention?.uid || mention?.userId || mention?.id || "");
    if (!targetId) return api.sendMessage({ msg: "⚔️ Cú pháp: pk @người_chơi\nTag người bạn muốn khiêu chiến.\n❤️ Người được khiêu chiến thả TIM vào tin mời (hoặc gõ: pk chapnhan) để chấp nhận và bắt đầu trận đấu có GIF!" }, message.threadId, message.type);
    if (targetId === id) return api.sendMessage({ msg: "⚔️ Không thể tự PK chính mình." }, message.threadId, message.type);
    const opponent = data.players[playerKey(targetId)];
    if (!opponent) return api.sendMessage({ msg: "⚔️ Người này chưa gia nhập Tu Tiên, chưa thể tỷ thí." }, message.threadId, message.type);
    if (p.energy < 20) return api.sendMessage({ msg: "⚡ Thể lực không đủ (cần 20 thể lực để khiêu chiến PK)." }, message.threadId, message.type);
    const inviteId = shortCode("P");
    const sent = await sendMessageStateQuote(api, message, `⚔️ LỜI MỜI PK · TIÊN GIẢ TỶ THÍ\n\n${p.name} khiêu chiến ${opponent.name}.\n❤️ ${opponent.name} thả TIM vào đúng tin này (hoặc gõ: pk chapnhan) để chấp thuận!\n👍 Thả LIKE (hoặc gõ: pk tuchoi) để từ chối.\n⏳ Hiệu lực 10 phút.`, false, 600000, false);
    const messageIds = await resolveInvitationIds(originalApi, message, sent);
    if (!messageIds.length) return api.sendMessage({ msg: "⚠️ Không lấy được ID tin mời, hãy thử lại." }, message.threadId, message.type);
    data.pvpInvites ||= {};
    data.pvpInvites[inviteId] = {
      mode: "PK",
      size: 1,
      initiatorId: id,
      participantIds: [id, targetId],
      teamAIds: [id],
      teamBIds: [targetId],
      acceptedIds: [id],
      messageIds,
      threadId: String(message.threadId),
      expiresAt: Date.now() + 10 * 60_000,
    };
    for (const messageId of messageIds) pendingPvPReactions.set(messageId, inviteId);
    writeData(botId, data);
    return;
  }
  if (cmd === "boss") {
    const first = (args[1] || "").toLowerCase(), requestedMap = MAPS[first] ? first : p.activeMap, map = mapFor(p, requestedMap), bossKey = MAPS[first] ? (args[2] || "").toLowerCase() : first;
    const difficultyArg = MAPS[first] ? args[3] : args[2], difficultyLevel = clamp(Math.floor(Number(difficultyArg) || 1), 1, 5), difficulty = BOSS_DIFFICULTIES[difficultyLevel];
    if (!map) return api.sendMessage({ msg: `🔒 ${MAPS[requestedMap]?.name || "Bản đồ"} chưa mở. Gõ map để xem điều kiện.` }, message.threadId, message.type);
    const bosses = bossesForMap(requestedMap);
    if (!bossKey) return api.sendMessage({ msg: `👹 BOSS · ${map.name}\n\n${bosses.map((boss, index) => `${index + 1}. ${boss.icon} ${boss.key} · ${boss.name}\n   Sức mạnh x${boss.multiplier.toFixed(2)} · hồi ${waitText(boss.cooldown)}`).join("\n\n")}\n\nCấp Boss: 1 Thường · 2 Tinh Anh · 3 Ác Mộng · 4 Địa Ngục · 5 Diệt Thế\nĐánh: boss <số|mã_boss> [1-5]\nMap khác: boss <mã_map> <số|mã_boss> [1-5]` }, message.threadId, message.type);
    const boss = resolveBossForMap(requestedMap, bossKey);
    if (!boss) return api.sendMessage({ msg: `👹 Không có Boss “${bossKey}” ở ${map.name}. Gõ boss để xem danh sách.` }, message.threadId, message.type);
    const bossCdKey = `boss:${requestedMap}:${boss.key}:${difficultyLevel}`, left = cooldown(p, bossCdKey, Math.round(boss.cooldown * (1 + (difficultyLevel - 1) * .22)));
    if (left) return api.sendMessage({ msg: `⏳ ${boss.name} chưa hồi sinh, chờ ${waitText(left)}.` }, message.threadId, message.type);
    const energyCost = 30 + boss.level * 5 + difficulty.energy;
    if (p.energy < energyCost) return api.sendMessage({ msg: `⚔️ Thể lực không đủ (${boss.name} cần ${energyCost}).` }, message.threadId, message.type);
    const skill = selectedCombatSkill(p), myPower = Math.round(stats(p).power * skill.mult);
    const enemyPower = Math.round((760 + map.level * 700 + p.realm * 330) * map.multiplier * boss.multiplier * difficulty.power * (1.42 + map.level * .11));
    const win = myPower * (.76 + Math.random() * .22) >= enemyPower * (.9 + Math.random() * .2);
    const cultivation = win ? Math.round((120 + map.level * 95) * map.multiplier * boss.reward * difficulty.reward) : 0;
    const stones = win ? Math.round((55 + map.level * 52) * map.multiplier * boss.reward * difficulty.reward) : 0;
    p.energy -= energyCost; p.actions[bossCdKey] = Date.now(); touchQuest(p, "boss");
    const drops = win ? grantBossDrops(p, boss, difficulty.drop) : [];
    const wasActiveMap = p.activeMap;
    if (win) { addCultivation(p, cultivation); addMapCultivation(p, cultivation, requestedMap); p.stones += stones; p.kills++; p.bossKills++; addMapBossKill(p, requestedMap); p.wins++; } else p.losses++;
    const arrived = win && wasActiveMap === requestedMap ? advanceMapIfReady(p) : null;
    writeData(botId, data);
    const enemy = { name: boss.name, icon: boss.icon, level: boss.level + difficultyLevel - 1, title: `${map.name} · ${difficulty.name}` };
    const result = { win, myPower, enemyPower, cultivation, stones, skillName: skill.name, log: win ? `${skill.name} phá tan uy áp ${boss.name}!` : `${boss.name} áp chế, bạn buộc phải rút lui.` };
    const loot = drops.length ? `\n🎁 Rơi đồ: ${drops.join(" · ")}` : win ? "\n🎁 Không rơi đồ hiếm lần này." : "";
    return sendImage(api, message, await animatedOrProfile(p, { kind: "battle", p, enemy, result }), `⚔️ ${map.icon} ${map.name} · Boss cấp ${difficultyLevel} [${difficulty.name}]\n${win ? `🏆 Hạ gục ${boss.name}: +${fmt(cultivation)} tu vi, +${fmt(stones)} linh thạch.\n🗺️ Tu vi ${map.name}: ${fmt(mapCultivation(p, requestedMap))}/${fmt(map.need)} · Boss map: ${mapBossKills(p, requestedMap)}.${arrived ? `\n🌠 Đã tiến vào ${arrived.icon} ${arrived.name}. Gõ boss để gặp Boss map mới.` : ""}` : `💥 Boss quá mạnh (${fmt(myPower)}/${fmt(enemyPower)} chiến lực), hãy hạ cấp hoặc tăng sức mạnh.`}${loot}`);
  }
  if (cmd === "san") { const left = cooldown(p, "hunt"); if (left) return api.sendMessage({ msg: `⏳ Cần dưỡng thương thêm ${waitText(left)}.` }, message.threadId, message.type); const level = clamp(Number(args[1]) || Math.min(15, p.realm + 1), 1, 15), cost = 12 + Math.ceil(level / 3); if (p.energy < cost) return api.sendMessage({ msg: `Thể lực không đủ (cần ${cost}). Dùng Hoàn Hồn Đan hoặc chờ tu luyện.` }, message.threadId, message.type); const m = MONSTERS[level - 1], skill = selectedCombatSkill(p), myPower = Math.round(stats(p).power * skill.mult), enemyPower = Math.round((240 + level * 185 + p.realm * 105) * m[2]), win = myPower * (.8 + Math.random() * .28) >= enemyPower * (.86 + Math.random() * .24), cultivation = win ? Math.round(38 + level * 31) : 0, stones = win ? Math.round(20 + level * 19) : 0; p.energy -= cost; p.actions.hunt = Date.now(); touchQuest(p, "hunt"); let drops=[]; if (win) { addCultivation(p, cultivation); addMapCultivation(p, cultivation); p.stones += stones; p.kills++; p.wins++; const pool = MAPS[p.activeMap]?.drops || [["tulinhdan", .1]]; drops = grantDrops(p, pool, .45 + level * .055); } else p.losses++; writeData(botId, data); const enemy = { name: m[0], icon: m[1], level, title: `Yêu thú cấp ${level}/15` }; const result = { win, myPower, enemyPower, cultivation, stones, skillName: skill.name, log: win ? `${skill.name} phá tan yêu khí!` : `${enemy.name} áp chế, bạn buộc phải thoái lui.` }; return sendImage(api, message, await animatedOrProfile(p, { kind: "battle", p, enemy, result }), `${win ? `🏆 Hạ ${m[0]}: +${fmt(cultivation)} tu vi · +${fmt(stones)} linh thạch.` : `💥 Thất bại trước ${m[0]} (${fmt(myPower)}/${fmt(enemyPower)} chiến lực).`}${drops.length ? `\n🎁 ${drops.join(" · ")}` : ""}\n⚔️ ${skill.name} x${skill.mult.toFixed(2)} · tốn ${cost} thể lực\n📜 Nhiệm vụ săn: ${Math.min(2,p.quests.hunt)}/2`); }
  if (["treo", "offline", "thutuvi"].includes(cmd)) {
    const action=(args[1]||"").toLowerCase(), modes=new Set(["tuluyen","dotpha","san","full"]), now=Date.now();
    if (["auto", "all"].includes(action)) { const level=clamp(Number(args[2])||1,1,15); p.autoTrain={enabled:true,mode:"full",monsterLevel:level}; p.lastIdleAt=now; writeData(botId,data); return api.sendMessage({msg:`✅ Đã bật treo AUTO toàn năng · săn yêu cấp ${level}, tự tu luyện và xử lý tiến trình.\nQuay lại gõ “treo” để nhận.`},message.threadId,message.type); }
    if (["bat","chedo"].includes(action)) { const mode=(args[2]||"full").toLowerCase(), level=clamp(Number(args[3])||1,1,15); if(!modes.has(mode))return api.sendMessage({msg:"Chế độ: tuluyen, dotpha, san hoặc full."},message.threadId,message.type);p.autoTrain={enabled:true,mode,monsterLevel:level};p.lastIdleAt=now;writeData(botId,data);return api.sendMessage({msg:`✅ Đã bật treo ${mode}${["san","full"].includes(mode)?` · yêu thú cấp ${level}`:""}.\nTối đa 8 giờ, quay lại gõ “treo” để nhận.\nĐổi: treo chedo <tuluyen|dotpha|san|full> [cấp 1-15]`},message.threadId,message.type); }
    if (action==="tat") { if(!p.autoTrain?.enabled)return api.sendMessage({msg:"Bạn chưa bật treo."},message.threadId,message.type);const result=simulateIdle(p,now-(p.lastIdleAt||now));p.autoTrain.enabled=false;p.lastIdleAt=now;writeData(botId,data);return api.sendMessage({msg:`${result.minutes>=5?idleSummary(result)+"\n\n":""}🛑 Đã tắt chế độ treo.`},message.threadId,message.type); }
    if (!p.autoTrain?.enabled) return api.sendMessage({msg:"💤 AUTO TREO\n\ntreo bat tuluyen\ntreo bat dotpha\ntreo bat san 2\ntreo bat full 2\n\nFull = tự tu luyện + đột phá + săn quái. Tối đa 8 giờ."},message.threadId,message.type);
    const result=simulateIdle(p,now-(p.lastIdleAt||now));if(result.minutes<5)return api.sendMessage({msg:`💤 Đang treo ${p.autoTrain.mode}. Còn ${5-result.minutes} phút mới có thể thu hoạch.`},message.threadId,message.type);p.lastIdleAt=now;writeData(botId,data);return sendImage(api,message,await renderProfile(p),`${idleSummary(result)}\n\n✅ Chế độ treo vẫn tiếp tục.`);
  }
  if (["nhiemvu", "nv", "quest"].includes(cmd)) {
    const defs = { cultivate: [3, "Tu luyện"], hunt: [2, "Săn yêu thường"], boss: [1, "Khiêu chiến Boss"] };
    let reward = 0;
    for (const [key, [target]] of Object.entries(defs)) {
      if ((p.quests[key] || 0) >= target && !p.questClaims[key]) { p.questClaims[key] = true; reward++; }
    }
    if (reward) { addCultivation(p, reward * 90); p.stones += reward * 150; writeData(botId, data); }

    const dailyLines = Object.entries(defs).map(([key, [target, name]]) => {
      const done = Math.min(target, p.quests[key] || 0), left = Math.max(0, target - done);
      return `${p.questClaims[key] ? "✅" : done >= target ? "🎁" : "▫️"} ${name}: ${done}/${target}${left ? ` · còn ${left}` : " · hoàn thành"}`;
    });
    const currentMapKey = p.activeMap || MAP_ORDER[0], currentMap = MAPS[currentMapKey] || MAPS.thachthon;
    const mapIndex = MAP_ORDER.indexOf(currentMapKey), nextMapKey = MAP_ORDER[mapIndex + 1], nextMap = nextMapKey && MAPS[nextMapKey];
    let breakthroughText;
    if (p.realm >= REALMS.length - 1) {
      breakthroughText = "✅ Đã đạt Tiên Đế — không còn cảnh giới cao hơn.";
    } else {
      const need = nextNeed(p), cultivationLeft = Math.max(0, need - p.cultivation);
      const { req } = missingBreakthroughRequirements(p), item = ITEMS[req.material];
      const ownedMaterial = Math.max(0, p.inventory[req.material] || 0), killedBosses = mapBossKills(p, currentMapKey);
      const targetStage = minorStages(p)[minorRealm(p) + 1] || REALMS[p.realm + 1][0];
      const lines = [
        `🎯 Mục tiêu: ${targetStage}`,
        `${cultivationLeft ? "▫️" : "✅"} Tu vi: ${fmt(p.cultivation)}/${fmt(need)} · còn ${fmt(cultivationLeft)}`,
        `${ownedMaterial >= req.quantity ? "✅" : "▫️"} ${item.icon} ${item.name}: ${ownedMaterial}/${req.quantity} · còn ${Math.max(0, req.quantity - ownedMaterial)}`,
        `${killedBosses >= req.bossKills ? "✅" : "▫️"} Boss ${currentMap.name}: ${killedBosses}/${req.bossKills} · còn ${Math.max(0, req.bossKills - killedBosses)}`,
      ];
      if (req.majorBreak) {
        const mapDone = mapCultivation(p, currentMapKey), mapLeft = Math.max(0, currentMap.need - mapDone);
        lines.push(`${mapLeft ? "▫️" : "✅"} Tu vi map: ${fmt(mapDone)}/${fmt(currentMap.need)} · còn ${fmt(mapLeft)}`);
      }
      breakthroughText = lines.join("\n");
    }

    const mapText = nextMap
      ? [
          `📍 Hiện tại: ${currentMap.icon} ${currentMap.name}`,
          `${p.realm >= nextMap.req ? "✅" : "▫️"} Cảnh giới mở ${nextMap.name}: ${REALMS[nextMap.req][0]}`,
          `${mapCultivation(p, currentMapKey) >= currentMap.need ? "✅" : "▫️"} Tu vi ${currentMap.name}: ${fmt(mapCultivation(p, currentMapKey))}/${fmt(currentMap.need)} · còn ${fmt(Math.max(0, currentMap.need - mapCultivation(p, currentMapKey)))}`,
          `➡️ Đủ điều kiện sẽ tự sang ${nextMap.icon} ${nextMap.name}; hoặc dùng ${prefix}tt hanhtrinh ${nextMapKey}.`,
        ].join("\n")
      : `✅ Đang ở bản đồ cuối: ${currentMap.icon} ${currentMap.name}.`;

    const result = [
      `📜 NHIỆM VỤ & TIẾN ĐỘ · ${p.name}`,
      "",
      "🌞 NHIỆM VỤ NGÀY",
      ...dailyLines,
      reward ? `🎁 Vừa nhận: +${fmt(reward * 90)} tu vi · +${fmt(reward * 150)} linh thạch.` : "Hoàn thành sẽ tự nhận khi mở bảng.",
      "",
      `⚡ ĐỘT PHÁ · ${realmTitle(p)}`,
      breakthroughText,
      `Đánh Boss: ${prefix}tt boss · Săn quái: ${prefix}tt san [1-15] · Vượt ải: ${prefix}tt phoban`,
      "Lưu ý: quái thường tính nhiệm vụ ngày; điều kiện đột phá dùng Boss của map hiện tại.",
      "",
      "🗺️ ĐỔI MAP",
      mapText,
    ].join("\n");
    return api.sendMessage({ msg: result }, message.threadId, message.type);
  }
  if (cmd === "daily") { const today = todayVN(); if (p.dailyDate === today) return api.sendMessage({ msg: "Hôm nay bạn đã nhận bổng lộc tông môn." }, message.threadId, message.type); p.dailyDate = today; const gift = 180 + Math.floor(Math.random() * 121); p.stones += gift; p.energy = MAX_ENERGY; p.inventory.tulinhdan = (p.inventory.tulinhdan || 0) + 1; writeData(botId, data); return api.sendMessage({ msg: `🎁 Bổng lộc: +${gift} linh thạch, +1 Tụ Linh Đan, hồi đầy thể lực.` }, message.threadId, message.type); }
  if (cmd === "shop") { const aliases = { vk: "vukhi", vukhi: "vukhi", giap: "giap", pb: "phapbao", phapbao: "phapbao", mu: "mu", giay: "giay", nhan: "nhan", dan: "dan", nl: "nguyenlieu", nguyenlieu: "nguyenlieu" }, category = aliases[(args[1] || "").toLowerCase()]; if (!category) return api.sendMessage({ msg: `🏪 BÁCH BẢO CÁC · ${fmt(p.stones)} linh thạch\n\nGõ: shop vk · shop giap · shop pb · shop mu · shop giay · shop nhan · shop dan · shop nl\nMua: mua <mã vật phẩm> [SL]\nTrang bị: trangbi <mã>` }, message.threadId, message.type); const list = Object.entries(ITEMS).filter(([,v]) => v.category === category); return api.sendMessage({ msg: `🏪 ${category.toUpperCase()} · ${fmt(p.stones)} ◈\n\n${list.map(([k,v]) => `${v.icon} ${displayItemCode(k)} · [${v.rarity}] ${fmt(v.price)} ◈${v.req ? ` · ${REALMS[v.req][0]}` : ""}\n${v.name}: ${v.desc}`).join("\n\n")}` }, message.threadId, message.type); }
  if (cmd === "mua") { const key = resolveItemCode(args[1]), item = ITEMS[key], qty = parseShopQuantity(args[2] || "1"); if (!qty) return api.sendMessage({ msg: `Số lượng phải là số nguyên từ 1 đến ${fmt(MAX_SHOP_QUANTITY)}. Ví dụ: mua ngodaodan 2000.` }, message.threadId, message.type); if (!item || !Number.isFinite(item.price) || item.price <= 0 || item.category === "loot") return api.sendMessage({ msg: "Vật phẩm này không bán trong Bách Bảo Các; hãy săn Boss hoặc vượt phó bản để tìm." }, message.threadId, message.type); if ((p.realm || 0) < (item.req || 0)) return api.sendMessage({ msg: `🔒 ${item.name} yêu cầu cảnh giới ${REALMS[item.req][0]}.` }, message.threadId, message.type); const total = item.price * qty; if (!Number.isSafeInteger(total)) return api.sendMessage({ msg: "Tổng giá trị giao dịch vượt giới hạn an toàn." }, message.threadId, message.type); if (p.stones < total) return api.sendMessage({ msg: `Không đủ linh thạch. Cần ${fmt(total)}, bạn có ${fmt(p.stones)}.` }, message.threadId, message.type); p.stones -= total; p.inventory[key] = (p.inventory[key] || 0) + qty; writeData(botId, data); return api.sendMessage({ msg: `✅ Đã mua ${fmt(qty)} [${item.rarity}] ${item.name}, tiêu ${fmt(total)} linh thạch.${item.equip ? `\nGõ: trangbi ${displayItemCode(key)}` : ""}` }, message.threadId, message.type); }
  if (cmd === "tui") return api.sendMessage({ msg: `🎒 TÚI CÀN KHÔN\n\n${Object.entries(p.inventory).filter(([,n]) => n > 0).map(([k,n]) => `${ITEMS[k]?.icon || "📦"} ${displayItemCode(k)} ×${n} — ${ITEMS[k]?.name || k}`).join("\n") || "Trống không"}\n\n🗡️ Vũ khí: ${p.equipment.weapon?.name || "Chưa có"}\n🥋 Hộ giáp: ${p.equipment.armor?.name || "Chưa có"}\n🔮 Pháp bảo: ${p.equipment.artifact?.name || "Chưa có"}\n⛑️ Mũ: ${p.equipment.helmet?.name || "Chưa có"}\n🥾 Giày: ${p.equipment.boots?.name || "Chưa có"}\n💍 Nhẫn: ${p.equipment.ring?.name || "Chưa có"}` }, message.threadId, message.type);
  if (cmd === "dung") { const key = (args[1] || "").toLowerCase(), item = ITEMS[key], amountArg = (args[2] || "").toLowerCase(); if (!item?.use) return api.sendMessage({ msg: "Vật phẩm này không thể dùng trực tiếp." }, message.threadId, message.type); const owned = Math.max(0, Math.floor(p.inventory[key] || 0)); if (!owned) return api.sendMessage({ msg: "Trong túi không có vật phẩm này." }, message.threadId, message.type); const requested = amountArg === "all" ? owned : Math.floor(Number(amountArg.replace(/^x/, "")) || 1), quantity = clamp(requested, 1, owned); for (let index = 0; index < quantity; index++) item.use(p); p.inventory[key] -= quantity; writeData(botId, data); return sendImage(api, message, await renderProfile(p), `✨ Đã dùng ${quantity}/${owned} ${item.icon} ${item.name}.\nHiệu ứng mỗi viên: ${item.desc}.`); }
  if (cmd === "trangbi") { const key = (args[1] || "").toLowerCase(), item = ITEMS[key]; if (!item?.equip || !item.slot) return api.sendMessage({ msg: "Đây không phải trang bị." }, message.threadId, message.type); if (!p.inventory[key]) return api.sendMessage({ msg: "Bạn chưa sở hữu trang bị này." }, message.threadId, message.type); if ((p.realm || 0) < (item.req || 0)) return api.sendMessage({ msg: `🔒 Cần ${REALMS[item.req][0]} để sử dụng.` }, message.threadId, message.type); const old = p.equipment[item.slot], oldKey = old?.key; if (oldKey) { p.inventory[oldKey] = (p.inventory[oldKey] || 0) + 1; if (old.enhance) p.forgedItems[oldKey] = old; } p.inventory[key]--; p.equipment[item.slot] = p.forgedItems[key] || { key, name: `[${item.rarity}] ${item.name}`, ...item.equip }; delete p.forgedItems[key]; writeData(botId, data); return sendImage(api, message, await renderProfile(p), `✨ Đã trang bị [${item.rarity}] ${item.name}${p.equipment[item.slot].enhance ? ` +${p.equipment[item.slot].enhance}` : ""}. Chiến lực: ${fmt(stats(p).power)}`); }
  if (cmd === "congphap") return api.sendMessage({ msg: `📖 CÔNG PHÁP · Đang dùng: ${TECHNIQUES[p.activeTechnique].name}\n\n${Object.entries(TECHNIQUES).map(([k,v]) => `${p.activeTechnique===k?"🔆":p.techniques.includes(k)?"✅":"▫️"} ${k} · ${v.name}${v.sect ? ` · ${SECTS[v.sect].name}` : ""}\n   ${v.desc}${v.price ? ` · ${fmt(v.price)} ◈ · ${REALMS[v.req][0]}` : ""}`).join("\n\n")}\n\nHọc: hoc <mã> · Chọn: chon <mã>` }, message.threadId, message.type);
  if (cmd === "hoc") { const key=(args[1]||"").toLowerCase(), tech=TECHNIQUES[key]; if(!tech)return api.sendMessage({msg:"Không có công pháp này."},message.threadId,message.type);if(p.techniques.includes(key))return api.sendMessage({msg:"Bạn đã học công pháp này."},message.threadId,message.type);if(tech.sect&&tech.sect!==p.sect)return api.sendMessage({msg:`Công pháp này chỉ truyền cho ${SECTS[tech.sect].name}.`},message.threadId,message.type);if(p.realm<tech.req)return api.sendMessage({msg:`Cần cảnh giới ${REALMS[tech.req][0]}.`},message.threadId,message.type);if(p.stones<tech.price)return api.sendMessage({msg:`Cần ${fmt(tech.price)} linh thạch.`},message.threadId,message.type);p.stones-=tech.price;p.techniques.push(key);writeData(botId,data);return api.sendMessage({msg:`📖 Lĩnh ngộ thành công ${tech.name}!\nGõ: chon ${key}`},message.threadId,message.type); }
  if (cmd === "chon") { const key=(args[1]||"").toLowerCase();if(!p.techniques.includes(key)||!TECHNIQUES[key])return api.sendMessage({msg:"Bạn chưa học công pháp này."},message.threadId,message.type);p.activeTechnique=key;writeData(botId,data);return sendImage(api,message,await renderProfile(p),`🔆 Đã vận hành ${TECHNIQUES[key].name}. Chiến lực: ${fmt(stats(p).power)}`); }
  if (cmd === "rank") { const list = Object.values(data.players).sort((a,b) => stats(b).power - stats(a).power).slice(0, 10); return api.sendMessage({ msg: `🏆 TIÊN BẢNG\n\n${list.map((x,i) => `${i + 1}. ${x.name} · ${realm(x)[0]}\n   ${SECTS[x.sect]?.icon || "☯️"} ${fmt(stats(x).power)} chiến lực`).join("\n") || "Chưa có tu sĩ."}` }, message.threadId, message.type); }
  return api.sendMessage({ msg: help(prefix) }, message.threadId, message.type);
}
