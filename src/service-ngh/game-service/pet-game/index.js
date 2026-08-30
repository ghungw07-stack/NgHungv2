import { createCanvas } from "canvas";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { getGlobalPrefix } from "../../service.js";
import { clearImagePath } from "../../../utils/canvas/index.js";

const SPECIES = {
  meo: { name: "Mèo", icon: "🐱", color: "#f1ad58" },
  cho: { name: "Chó", icon: "🐶", color: "#c98d58" },
  tho: { name: "Thỏ", icon: "🐰", color: "#eee7df" },
  gau: { name: "Gấu", icon: "🐻", color: "#9b6849" },
};
const ITEMS = {
  thit: { name: "Thịt", price: 35, hunger: 28, icon: "🥩" },
  ca: { name: "Cá", price: 30, hunger: 24, icon: "🐟" },
  sua: { name: "Sữa", price: 22, hunger: 15, health: 5, icon: "🥛" },
  thuoc: { name: "Thuốc", price: 90, health: 35, icon: "💊" },
  bong: { name: "Bóng", price: 60, durable: true, icon: "⚽" },
};
const COOLDOWN = { feed: 2 * 60_000, play: 5 * 60_000, bath: 10 * 60_000, sleep: 10 * 60_000 };
const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
const dataPath = (botId) => path.join(process.cwd(), "logs", String(botId), "pet-game.json");

function readData(botId) {
  try { return JSON.parse(fs.readFileSync(dataPath(botId), "utf8")); } catch { return { users: {} }; }
}
function writeData(botId, data) {
  const file = dataPath(botId); fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`; fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`); fs.renameSync(tmp, file);
}
function key(threadId, userId) { return `${threadId}:${userId}`; }
function updateDecay(pet) {
  const now = Date.now(), hours = Math.min(72, Math.max(0, (now - (pet.updatedAt || now)) / 3_600_000));
  pet.hunger = clamp(pet.hunger - hours * 3.2); pet.happy = clamp(pet.happy - hours * 2.1);
  pet.clean = clamp(pet.clean - hours * 1.8); pet.energy = clamp(pet.energy - hours * 2.4);
  const danger = [pet.hunger, pet.clean, pet.energy].filter((v) => v < 15).length;
  pet.health = clamp(pet.health - danger * hours * 2 + (danger === 0 && pet.hunger > 45 ? hours * 0.4 : 0));
  pet.updatedAt = now;
}
function expNeeded(level) { return 80 + level * 45; }
function addExp(pet, amount) {
  pet.exp += amount; let levels = 0;
  while (pet.exp >= expNeeded(pet.level)) { pet.exp -= expNeeded(pet.level); pet.level++; pet.coins += 40 + pet.level * 5; levels++; }
  return levels;
}
function mood(pet) {
  if (pet.health < 25) return { text: "Đang bệnh", face: "×﹏×", color: "#ef5350" };
  if (pet.energy < 20) return { text: "Buồn ngủ", face: "－ω－", color: "#90a4ae" };
  if (pet.hunger < 20) return { text: "Đang đói", face: "ಥ﹏ಥ", color: "#ffb74d" };
  if (pet.clean < 20) return { text: "Cần tắm", face: ">﹏<", color: "#8d6e63" };
  if (pet.happy > 75) return { text: "Rất vui", face: "＾▽＾", color: "#66bb6a" };
  return { text: "Ổn định", face: "•ᴗ•", color: "#42a5f5" };
}
function cooldownText(ms) { const m = Math.ceil(ms / 60_000); return `${m} phút`; }
function checkCooldown(pet, action) {
  const left = COOLDOWN[action] - (Date.now() - (pet.actions?.[action] || 0)); return left > 0 ? left : 0;
}

function drawPet(ctx, pet, cx, cy) {
  const spec = SPECIES[pet.species], sick = pet.health < 25, sleepy = pet.energy < 20;
  ctx.save(); ctx.translate(cx, cy); ctx.shadowColor = "rgba(30,20,15,.25)"; ctx.shadowBlur = 18; ctx.shadowOffsetY = 12;
  ctx.fillStyle = spec.color;
  if (pet.species === "tho") {
    ctx.beginPath(); ctx.ellipse(-35, -105, 25, 72, -.15, 0, Math.PI * 2); ctx.ellipse(35, -105, 25, 72, .15, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.beginPath(); ctx.arc(-65, -67, pet.species === "cho" ? 42 : 34, 0, Math.PI * 2); ctx.arc(65, -67, pet.species === "cho" ? 42 : 34, 0, Math.PI * 2); ctx.fill();
  }
  ctx.beginPath(); ctx.ellipse(0, 15, 112, 120, 0, 0, Math.PI * 2); ctx.fill(); ctx.shadowColor = "transparent";
  ctx.strokeStyle = "#382c28"; ctx.lineWidth = 8; ctx.lineCap = "round";
  if (sleepy) { ctx.beginPath(); ctx.moveTo(-55, -5); ctx.lineTo(-25, -5); ctx.moveTo(25, -5); ctx.lineTo(55, -5); ctx.stroke(); }
  else { ctx.fillStyle = "#2f2927"; ctx.beginPath(); ctx.arc(-42, -8, 10, 0, Math.PI * 2); ctx.arc(42, -8, 10, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = sick ? "#78909c" : "#9b544b"; ctx.beginPath(); ctx.ellipse(0, 22, 12, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(0, 37, 28, 0.15, Math.PI - .15); ctx.stroke();
  ctx.fillStyle = "rgba(255,130,130,.35)"; ctx.beginPath(); ctx.ellipse(-70, 35, 20, 11, 0, 0, Math.PI * 2); ctx.ellipse(70, 35, 20, 11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

async function renderProfile(pet, ownerName) {
  const W = 920, H = 1120, canvas = createCanvas(W, H), ctx = canvas.getContext("2d"), state = mood(pet), spec = SPECIES[pet.species];
  const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#82c9e8"); bg.addColorStop(.55, "#d9f0e5"); bg.addColorStop(1, "#f7dfb4"); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255,255,255,.28)"; for (const [x,y,r] of [[120,120,60],[770,145,85],[650,360,48]]) { ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2);ctx.fill(); }
  ctx.fillStyle = "#7fb36b"; ctx.beginPath(); ctx.ellipse(460, 660, 510, 180, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.roundRect(54, 42, 812, 125, 30); ctx.fillStyle = "rgba(255,255,255,.86)"; ctx.fill();
  ctx.textAlign = "left"; ctx.fillStyle = "#263746"; ctx.font = "bold 37px sans-serif"; ctx.fillText(`${spec.icon} ${pet.name}`, 88, 96);
  ctx.font = "20px sans-serif"; ctx.fillStyle = "#61717d"; ctx.fillText(`${spec.name} · Cấp ${pet.level} · Chủ: ${String(ownerName).slice(0, 22)}`, 90, 137);
  ctx.textAlign = "right"; ctx.fillStyle = "#d69520"; ctx.font = "bold 24px sans-serif"; ctx.fillText(`🪙 ${pet.coins}`, 824, 112);
  drawPet(ctx, pet, 460, 470);
  ctx.beginPath(); ctx.roundRect(310, 650, 300, 50, 25); ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.fill(); ctx.textAlign = "center"; ctx.fillStyle = state.color; ctx.font = "bold 22px sans-serif"; ctx.fillText(`${state.face}  ${state.text}`, 460, 683);
  ctx.beginPath(); ctx.roundRect(54, 730, 812, 330, 30); ctx.fillStyle = "rgba(255,255,255,.92)"; ctx.fill();
  const bars = [["No bụng", pet.hunger, "#ff9f43", "🍖"], ["Vui vẻ", pet.happy, "#ec6c9e", "🎾"], ["Sạch sẽ", pet.clean, "#48a9e6", "🛁"], ["Năng lượng", pet.energy, "#8e77d8", "⚡"], ["Sức khỏe", pet.health, "#54b96b", "❤️"]];
  bars.forEach(([label,val,color,icon], i) => { const y=772+i*51; ctx.textAlign="left";ctx.font="bold 17px sans-serif";ctx.fillStyle="#40515d";ctx.fillText(`${icon} ${label}`,82,y+18); ctx.beginPath();ctx.roundRect(250,y,520,22,11);ctx.fillStyle="#e2e8eb";ctx.fill();ctx.beginPath();ctx.roundRect(250,y,Math.max(8,520*val/100),22,11);ctx.fillStyle=color;ctx.fill();ctx.textAlign="right";ctx.fillStyle="#40515d";ctx.fillText(`${val}%`,838,y+18); });
  const ratio = pet.exp / expNeeded(pet.level); ctx.beginPath();ctx.roundRect(250,1027,520,10,5);ctx.fillStyle="#dce3e6";ctx.fill();ctx.beginPath();ctx.roundRect(250,1027,520*ratio,10,5);ctx.fillStyle="#efb93f";ctx.fill();ctx.textAlign="left";ctx.fillStyle="#667781";ctx.font="14px sans-serif";ctx.fillText(`EXP ${pet.exp}/${expNeeded(pet.level)}`,82,1038);
  const out = path.join("/tmp", `pet-${Date.now()}-${Math.random().toString(36).slice(2)}.png`); await fsp.writeFile(out, canvas.toBuffer("image/png")); return out;
}

async function sendProfile(api, message, pet, caption) {
  const file = await renderProfile(pet, message.data.dName || "Người chơi");
  try { await api.sendMessage({ msg: caption, attachments: [file], ttl: 600000 }, message.threadId, message.type); } finally { await clearImagePath(file); }
}
function newPet(species, name) { return { species, name, level:1, exp:0, coins:150, hunger:85, happy:80, clean:90, energy:85, health:100, bag:{ thit:2, sua:1 }, actions:{}, createdAt:Date.now(), updatedAt:Date.now(), dailyAt:0 }; }
function help(prefix) { return `🐾 NUÔI THÚ\n\n🎁 ${prefix}nuoithu nhan <meo|cho|tho|gau> <tên>\n🚪 ${prefix}nuoithu join | leave\n🏠 ${prefix}nuoithu — xem thú\n🍖 ${prefix}nuoithu choan <thit|ca|sua>\n🛁 ${prefix}nuoithu tam · 🎾 choi · 😴 ngu\n💊 ${prefix}nuoithu chuabenh\n🛒 ${prefix}nuoithu shop | mua <món> [số lượng]\n🎒 ${prefix}nuoithu tui · 🎁 daily\n✏️ ${prefix}nuoithu doiten <tên>\n🏆 ${prefix}nuoithu rank`; }

export async function handlePetCommand(api, message) {
  const botId=api.getBotId(), prefix=getGlobalPrefix(botId), body=typeof message.data.content==="string"?message.data.content:message.data.content?.title||"", args=body.trim().split(/\s+/).slice(1), cmd=(args[0]||"").toLowerCase();
  const data=readData(botId), id=key(message.threadId,message.data.uidFrom); let pet=data.users[id]; if (pet) updateDecay(pet);
  if (["help","huongdan"].includes(cmd)) return api.sendMessage({msg:help(prefix)},message.threadId,message.type);
  if (cmd==="rank") { const list=Object.values(data.users).filter(p=>String(p.threadId)===String(message.threadId)).sort((a,b)=>b.level-a.level||b.exp-a.exp).slice(0,10); return api.sendMessage({msg:`🏆 TOP THÚ CƯNG\n\n${list.length?list.map((p,i)=>`${i+1}. ${p.ownerName} — ${p.name} Lv.${p.level}`).join("\n"):"Chưa có dữ liệu."}`},message.threadId,message.type); }
  if (cmd==="join") {
    if (!pet) return api.sendMessage({msg:`Bạn chưa có thú. Nhận nuôi trước:\n${prefix}nuoithu nhan meo <tên>`},message.threadId,message.type);
    pet.joined=true;pet.ownerName=message.data.dName||pet.ownerName;writeData(botId,data);
    return sendProfile(api,message,pet,"✅ Đã tham gia lại game nuôi thú. Lệnh tắt đã được bật!");
  }
  if (cmd==="leave") {
    if (!pet) return api.sendMessage({msg:"Bạn chưa tham gia game nuôi thú."},message.threadId,message.type);
    pet.joined=false;writeData(botId,data);
    return api.sendMessage({msg:`🚪 Đã rời game nuôi thú. ${pet.name} và toàn bộ dữ liệu vẫn được giữ.\nVào lại: ${prefix}nuoithu join`},message.threadId,message.type);
  }
  if (!pet && cmd!=="nhan") return api.sendMessage({msg:`Bạn chưa có thú. Dùng:\n${prefix}nuoithu nhan meo <tên>`},message.threadId,message.type);
  if (cmd==="nhan") { if(pet)return api.sendMessage({msg:"Bạn đã có thú cưng rồi."},message.threadId,message.type); const species=(args[1]||"").toLowerCase(), name=args.slice(2).join(" ").trim(); if(!SPECIES[species]||!name)return api.sendMessage({msg:`Cách dùng: ${prefix}nuoithu nhan <meo|cho|tho|gau> <tên>`},message.threadId,message.type); pet=newPet(species,name.slice(0,24)); Object.assign(pet,{threadId:message.threadId,userId:message.data.uidFrom,ownerName:message.data.dName,joined:true}); data.users[id]=pet; writeData(botId,data); return sendProfile(api,message,pet,`🎉 Bạn đã nhận nuôi ${SPECIES[species].name} tên ${pet.name}!`); }
  if (pet.joined===false) return api.sendMessage({msg:`Bạn đã rời game. Vào lại bằng:\n${prefix}nuoithu join`},message.threadId,message.type);
  let reply="";
  if (!cmd || cmd==="xem" || cmd==="status") { writeData(botId,data); return sendProfile(api,message,pet,"🏠 Nhà của thú cưng"); }
  if (cmd==="shop") { writeData(botId,data); return api.sendMessage({msg:`🛒 CỬA HÀNG\n\n${Object.entries(ITEMS).map(([k,v])=>`${v.icon} ${k}: ${v.price} xu${v.durable?" · dùng vĩnh viễn":""}`).join("\n")}\n\nMua: ${prefix}nuoithu mua <món> [số lượng]`},message.threadId,message.type); }
  if (cmd==="tui") { writeData(botId,data); return api.sendMessage({msg:`🎒 TÚI ĐỒ · 🪙 ${pet.coins}\n\n${Object.entries(pet.bag).filter(([,n])=>n>0).map(([k,n])=>`${ITEMS[k]?.icon||"📦"} ${k}: ${n}`).join("\n")||"Trống"}`},message.threadId,message.type); }
  if (cmd==="mua") { const item=args[1]?.toLowerCase(), qty=Math.max(1,Math.min(20,Number(args[2])||1)), info=ITEMS[item]; if(!info)return api.sendMessage({msg:"Không có món này trong shop."},message.threadId,message.type); const cost=info.price*qty;if(pet.coins<cost)return api.sendMessage({msg:`Không đủ xu. Bạn có ${pet.coins} xu.`},message.threadId,message.type); pet.coins-=cost;pet.bag[item]=(pet.bag[item]||0)+qty;reply=`🛍 Đã mua ${qty} ${info.name} (-${cost} xu).`; }
  else if (cmd==="choan") { const item=(args[1]||"thit").toLowerCase(), info=ITEMS[item]; if(!info?.hunger)return api.sendMessage({msg:"Thức ăn: thit, ca hoặc sua."},message.threadId,message.type); const left=checkCooldown(pet,"feed");if(left)return api.sendMessage({msg:`⏳ ${pet.name} chưa đói. Chờ ${cooldownText(left)}.`},message.threadId,message.type);if(!pet.bag[item])return api.sendMessage({msg:`Bạn hết ${info.name}. Hãy mua trong shop.`},message.threadId,message.type);pet.bag[item]--;pet.hunger=clamp(pet.hunger+info.hunger);pet.health=clamp(pet.health+(info.health||1));pet.actions.feed=Date.now();addExp(pet,10);reply=`${info.icon} ${pet.name} đã ăn ngon lành!`; }
  else if (["tam","choi","ngu"].includes(cmd)) { const action={tam:"bath",choi:"play",ngu:"sleep"}[cmd],left=checkCooldown(pet,action);if(left)return api.sendMessage({msg:`⏳ Chờ ${cooldownText(left)} để làm lại.`},message.threadId,message.type);if(action==="play"&&pet.energy<15)return api.sendMessage({msg:`😴 ${pet.name} quá mệt để chơi.`},message.threadId,message.type);if(action==="bath")pet.clean=clamp(pet.clean+45);if(action==="play"){const hasBall=(pet.bag.bong||0)>0;pet.happy=clamp(pet.happy+(hasBall?48:35));pet.energy=clamp(pet.energy-12);pet.hunger=clamp(pet.hunger-6);if(hasBall)pet.coins+=5;}if(action==="sleep"){pet.energy=clamp(pet.energy+55);pet.hunger=clamp(pet.hunger-8);}pet.actions[action]=Date.now();addExp(pet,action==="play"?((pet.bag.bong||0)>0?22:15):10);reply=action==="bath"?`🛁 ${pet.name} đã sạch bóng!`:action==="play"?`🎾 ${pet.name} chơi rất vui!`:`😴 ${pet.name} đã ngủ một giấc ngon.`; }
  else if (cmd==="chuabenh") { if(!pet.bag.thuoc)return api.sendMessage({msg:"Bạn chưa có thuốc. Mua bằng: !nuoithu mua thuoc"},message.threadId,message.type);pet.bag.thuoc--;pet.health=clamp(pet.health+ITEMS.thuoc.health);addExp(pet,8);reply=`💊 ${pet.name} đã khỏe hơn.`; }
  else if (cmd==="daily") { const today=new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Ho_Chi_Minh"}),last=pet.dailyDate;if(last===today)return api.sendMessage({msg:"Bạn đã nhận quà hôm nay rồi."},message.threadId,message.type);pet.dailyDate=today;const gift=100+Math.floor(Math.random()*101);pet.coins+=gift;pet.bag.thit=(pet.bag.thit||0)+1;reply=`🎁 Daily: +${gift} xu và +1 Thịt.`; }
  else if (cmd==="doiten") { const name=args.slice(1).join(" ").trim();if(!name)return api.sendMessage({msg:"Hãy nhập tên mới."},message.threadId,message.type);pet.name=name.slice(0,24);reply=`✏️ Đã đổi tên thành ${pet.name}.`; }
  else return api.sendMessage({msg:help(prefix)},message.threadId,message.type);
  pet.ownerName=message.data.dName||pet.ownerName;writeData(botId,data);return sendProfile(api,message,pet,reply);
}

const SHORTCUT_ACTIONS = new Set(["xem", "status", "shop", "tui", "daily", "tam", "choi", "ngu", "chuabenh", "rank", "choan", "mua", "doiten"]);

export async function handlePetShortcut(api, message) {
  const raw = typeof message.data?.content === "string" ? message.data.content.trim() : "";
  const match = raw.match(/^(nt|nuoithu)([a-z]+)(?:\s+([\s\S]*))?$/i);
  if (!match) return false;
  const action = match[2].toLowerCase();
  if (!SHORTCUT_ACTIONS.has(action)) return false;
  const data = readData(api.getBotId());
  const pet = data.users[key(message.threadId, message.data.uidFrom)];
  if (!pet || pet.joined === false) return false;
  const rest = match[3]?.trim();
  const shortcutMessage = {
    ...message,
    data: { ...message.data, content: `!nuoithu ${action}${rest ? ` ${rest}` : ""}` },
  };
  await handlePetCommand(api, shortcutMessage);
  return true;
}
