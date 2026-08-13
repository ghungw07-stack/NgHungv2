import { loadGameConfig, loadPlayerData, savePlayerData } from "./dataManager.js";
import { parseItemInput } from "./fuzzySearch.js";

export class CauCaGame {
  constructor(threadId, playerId, playerName, playerData = null) {
    this.threadId = threadId;
    this.playerId = playerId;
    this.playerName = playerName;
    
    // Load hoặc tạo playerData
    if (playerData) {
      this.playerData = playerData;
      // Đảm bảo có expToNext và fishingSlots
      if (!this.playerData.expToNext) {
        this.playerData.expToNext = this.calculateExpToNext(this.playerData.level);
      }
      if (!this.playerData.fishingSlots) {
        this.playerData.fishingSlots = this.calculateFishingSlots(this.playerData.level);
      }
      if (typeof this.playerData.activeSlots !== 'number' || this.playerData.activeSlots < 1) {
        this.playerData.activeSlots = 1;
      }
    } else {
      const allPlayers = loadPlayerData();
      this.playerData = allPlayers[playerId] || this.createNewPlayer();
      if (!this.playerData.expToNext) {
        this.playerData.expToNext = this.calculateExpToNext(this.playerData.level);
      }
      if (!this.playerData.fishingSlots) {
        this.playerData.fishingSlots = this.calculateFishingSlots(this.playerData.level);
      }
      if (typeof this.playerData.activeSlots !== 'number' || this.playerData.activeSlots < 1) {
        this.playerData.activeSlots = 1;
      }
    }

    this.isActive = true;
    this.startTime = Date.now();
    this.lastActivity = Date.now();
    this.lastSaveTime = Date.now();
  }

  createNewPlayer() {
    return {
      uid: this.playerId,
      name: this.playerName,
      level: 0,
      exp: 0,
      expToNext: 100,
      money: 200,
      currentArea: 1,
      inventory: {
        fish: {},
        baits: {},
        rods: [],
        tools: [],
        pets: [],
        potions: {},
        tickets: 0,
        skillCards: {}
      },
      activeSlots: 1,
      fishingSlots: 1, // Số slot câu cá (mặc định 1)
      equipment: {
        rods: [null], // array for rods per slot
        bait: null
      },
      redeemedCodes: {},
      stats: {
        totalFishCaught: 0,
        rareCaught: 0,
        legendaryCaught: 0,
        mythicalCaught: 0,
        bossAttacks: 0,
        bossKills: 0,
        rodsBroken: 0,
        totalSpent: 0
      }
    };
  }

  static loadData(playerId) {
    const allPlayers = loadPlayerData();
    const playerData = allPlayers[playerId];
    if (!playerData) return null;
    
    return {
      playerId,
      playerName: playerData.name,
      playerData,
      isActive: false
    };
  }

  saveData() {
    const allPlayers = loadPlayerData();
    allPlayers[this.playerId] = this.playerData;
    savePlayerData(allPlayers);
    this.lastSaveTime = Date.now();
  }

  autoSave() {
    // Auto save mỗi 30 giây
    if (Date.now() - this.lastSaveTime > 30000) {
      this.saveData();
    }
  }

  stop() {
    this.isActive = false;
    this.saveData();
  }

  // Tính toán exp cần thiết để lên cấp
  calculateExpToNext(level) {
    return Math.floor(100 * Math.pow(1.5, level));
  }

  // Tính số slot câu dựa trên level (max 3 slots)
  calculateFishingSlots(level) {
    const slotLevels = [10, 20, 30, 40, 50, 60, 70, 80, 100];
    let slots = 1;
    for (const slotLevel of slotLevels) {
      if (level >= slotLevel) {
        slots++;
      }
    }
    return Math.min(slots, 3); // Max 3 slots
  }

  // Xử lý lên cấp
  processLevelUp() {
    const expToNext = this.calculateExpToNext(this.playerData.level);
    let leveledUp = false;
    let totalTicketsBonus = 0;
    let totalMoneyBonus = 0;
    while (this.playerData.exp >= expToNext && this.playerData.level < 200) {
      this.playerData.exp -= expToNext;
      this.playerData.level += 1;
      this.playerData.expToNext = this.calculateExpToNext(this.playerData.level);
      leveledUp = true;

      // Thưởng Level Up: vé ngẫu nhiên 1-5 và 1,000 VND
      const ticketsThisLevel = 1 + Math.floor(Math.random() * 5);
      totalTicketsBonus += ticketsThisLevel;
      totalMoneyBonus += 1000;
      this.playerData.inventory.tickets = (this.playerData.inventory.tickets || 0) + ticketsThisLevel;
      this.playerData.money = (this.playerData.money || 0) + 1000;
      
      // Tăng slot câu khi đạt level mốc (max 3 slots)
      const slotLevels = [10, 20, 30, 40, 50, 60, 70, 80, 100];
      if (slotLevels.includes(this.playerData.level)) {
        this.playerData.fishingSlots = Math.min((this.playerData.fishingSlots || 1) + 1, 3);
      }
    }
    // Lưu thông điệp thưởng
    if (leveledUp) {
      this.lastLevelUpBonus = {
        tickets: totalTicketsBonus,
        money: totalMoneyBonus
      };
    } else {
      this.lastLevelUpBonus = null;
    }
    return leveledUp;
  }

  // Câu cá
  catchFish() {
    if (!this.isActive) {
      return { success: false, message: "❌ Game chưa được bắt đầu!" };
    }

    // Kiểm tra mồi - ưu tiên mồi đã trang bị
    let usedBait = null;
    const baits = this.playerData.inventory.baits || {};
    
    // Nếu có mồi đã trang bị, dùng mồi đó
    if (this.playerData.equipment?.bait && this.playerData.equipment.bait.id) {
      const equippedBaitId = this.playerData.equipment.bait.id;
      if (baits[equippedBaitId] && baits[equippedBaitId] > 0) {
        usedBait = equippedBaitId;
      }
    }
    
    // Nếu không có mồi trang bị hoặc mồi trang bị hết, tìm mồi đầu tiên có sẵn
    if (!usedBait) {
      for (const [baitId, qty] of Object.entries(baits)) {
        if (qty > 0) {
          usedBait = baitId;
          break;
        }
      }
    }
    
    if (!usedBait) {
      return { success: false, message: "❌ Bạn cần có mồi để câu cá!\n💡 Gõ \`shop\` để mua mồi hoặc \`equip\` để chọn mồi." };
    }

    // LƯU Ý: Trừ mồi sẽ thực hiện SAU khi tính được số slots hợp lệ

    const config = loadGameConfig();
    const area = config.areas.find(a => a.id === this.playerData.currentArea);
    if (!area) {
      return { success: false, message: "❌ Khu vực không hợp lệ!" };
    }

    // Lấy thông tin mồi
    const allItems = [...(config.shopItems || []), ...(config.shopItem || [])];
    const baitItem = allItems.find(it => it.id === usedBait);
    const baitName = baitItem?.name || usedBait;

    // Tính bonus từ equipment và tools (tính 1 lần)
    let bonusText = "";
    let ticketBonus = 0;
    let expBonusMultiplier = 1;
    let coinBonusMultiplier = 1;
    let rareChanceMultiplier = 1;

    // Kiểm tra hạn dùng cần câu (nếu có)
    let rodBroken = false;
    let rodExpired = false;
    if (this.playerData.equipment?.rod) {
      const invRod = (this.playerData.inventory.rods || []).find(r => r.id === this.playerData.equipment.rod.id && r.name === this.playerData.equipment.rod.name);
      if (invRod && invRod.expiresAt && Date.now() > invRod.expiresAt) {
        rodExpired = true;
        this.playerData.equipment.rod = null;
      }
    }

    // Bonus từ rod (nếu còn hiệu lực)
    if (!rodExpired && this.playerData.equipment?.rod) {
      const rod = this.playerData.equipment.rod;
      if (rod.effects?.expBonus) expBonusMultiplier += rod.effects.expBonus;
      if (rod.effects?.coinBonus) coinBonusMultiplier += rod.effects.coinBonus;
      if (rod.effects?.rareChanceBonus) rareChanceMultiplier *= (1 + rod.effects.rareChanceBonus);
      if (rod.effects?.ticketBonusChance) ticketBonus = Math.max(ticketBonus, rod.effects.ticketBonusChance);
    }

    // Bonus từ bait
    if (baitItem?.effects) {
      if (baitItem.effects.expBonus) expBonusMultiplier += baitItem.effects.expBonus;
      if (baitItem.effects.coinBonus) coinBonusMultiplier += baitItem.effects.coinBonus;
      if (baitItem.effects.rareChanceBonus) rareChanceMultiplier *= (1 + baitItem.effects.rareChanceBonus);
      if (baitItem.effects.ticketBonusChance) ticketBonus = Math.max(ticketBonus, baitItem.effects.ticketBonusChance);
    }

    // Bonus từ tools
    if (this.playerData.inventory?.tools && Array.isArray(this.playerData.inventory.tools)) {
      for (const tool of this.playerData.inventory.tools) {
        if (tool.effects?.expBonus) {
          expBonusMultiplier += tool.effects.expBonus;
        }
        if (tool.effects?.coinBonus) {
          coinBonusMultiplier += tool.effects.coinBonus;
        }
        if (tool.effects?.ticketBonusChance) {
          ticketBonus = Math.max(ticketBonus, tool.effects.ticketBonusChance);
        }
        if (tool.effects?.rareChanceBonus) {
          rareChanceMultiplier *= (1 + tool.effects.rareChanceBonus);
        }
      }
    }

    // Bonus từ pets
    if (this.playerData.inventory?.pets && Array.isArray(this.playerData.inventory.pets)) {
      for (const pet of this.playerData.inventory.pets) {
        if (pet.effects?.expBonus) {
          expBonusMultiplier += pet.effects.expBonus;
        }
        if (pet.effects?.coinBonus) {
          coinBonusMultiplier += pet.effects.coinBonus;
        }
        if (pet.effects?.ticketBonusChance) {
          ticketBonus = Math.max(ticketBonus, pet.effects.ticketBonusChance);
        }
      }
    }

    // Xử lý slot câu (câu tất cả slot đang có)
    const potentialSlots = this.playerData.fishingSlots || 1;
    let slots = Math.max(1, Math.min(this.playerData.activeSlots || 1, potentialSlots));

    // Kiểm tra đủ mồi cho tất cả slot
    const baitAvailable = this.playerData.inventory.baits[usedBait] || 0;
    if (baitAvailable < slots) {
      slots = baitAvailable > 0 ? baitAvailable : 0;
    }
    if (slots <= 0) {
      return { success: false, message: "❌ Bạn không đủ mồi cho nhiều slot! Hãy mua thêm mồi trong shop." };
    }

    // Ensure equipment.rods array has enough slots
    if (!this.playerData.equipment.rods) {
      this.playerData.equipment.rods = [];
    }
    while (this.playerData.equipment.rods.length < slots) {
      this.playerData.equipment.rods.push(null);
    }

    // Chỉ câu ở slot có cần (nếu không có cần thì chỉ câu ở slot có cần)
    let activeSlotsWithRods = 0;
    for (let i = 0; i < slots; i++) {
      if (this.playerData.equipment.rods[i]) {
        activeSlotsWithRods++;
      }
    }
    if (activeSlotsWithRods === 0) {
      return { success: false, message: "❌ Bạn chưa trang bị cần câu nào! Hãy trang bị cần câu trước khi câu." };
    }

    // Trừ mồi theo số slot có cần
    slots = activeSlotsWithRods;
    if (!this.playerData.inventory.baits[usedBait]) {
      this.playerData.inventory.baits[usedBait] = 0;
    }
    this.playerData.inventory.baits[usedBait] -= slots;
    if (this.playerData.inventory.baits[usedBait] <= 0) {
      delete this.playerData.inventory.baits[usedBait];
      if (this.playerData.equipment?.bait && this.playerData.equipment.bait.id === usedBait) {
        this.playerData.equipment.bait = null;
      }
    }

    let totalExp = 0;
    let totalMoney = 0;
    let caughtFish = {};
    let slotResults = [];
    let slotMessage = "";

    // Điều chỉnh tỷ lệ cá theo rareChanceMultiplier
    const adjustedFish = area.fish.map(f => ({ ...f }));
    const rareIdx = adjustedFish.findIndex(f => f.type === 'rare');
    if (rareIdx !== -1 && rareChanceMultiplier !== 1) {
      adjustedFish[rareIdx].chance = adjustedFish[rareIdx].chance * rareChanceMultiplier;
      const sum = adjustedFish.reduce((s, f) => s + f.chance, 0) || 100;
      for (const f of adjustedFish) {
        f.chance = (f.chance / sum) * 100;
      }
    }

    for (let i = 0; i < slots; i++) {
      const rod = this.playerData.equipment.rods[i];
      if (!rod) continue; // Skip slots without rods

      // Tính lại tỷ lệ cho mỗi slot
      const rand = Math.random() * 100;
      let slotFishType = null;
      let cumulative = 0;

      for (const fish of adjustedFish) {
        cumulative += fish.chance;
        if (rand <= cumulative) {
          slotFishType = fish;
          break;
        }
      }

      if (!slotFishType) {
        slotFishType = adjustedFish[0];
      }

      // Tính exp và tiền cho slot này
      let slotExpGain = Math.floor(Math.random() * (slotFishType.exp[1] - slotFishType.exp[0] + 1) + slotFishType.exp[0]);
      let slotMoneyGain = slotFishType.value || 0;

      // Áp dụng bonus từ rod của slot này
      let slotExpMultiplier = expBonusMultiplier;
      let slotCoinMultiplier = coinBonusMultiplier;
      if (rod.effects?.expBonus) slotExpMultiplier += rod.effects.expBonus;
      if (rod.effects?.coinBonus) slotCoinMultiplier += rod.effects.coinBonus;

      slotExpGain = Math.floor(slotExpGain * slotExpMultiplier);
      slotMoneyGain = Math.floor(slotMoneyGain * slotCoinMultiplier);

      totalExp += slotExpGain;
      totalMoney += slotMoneyGain;

      // Thêm cá vào inventory
      const slotFishName = this.getRandomFishName(slotFishType.type, area);
      if (!caughtFish[slotFishName]) {
        caughtFish[slotFishName] = 0;
      }
      caughtFish[slotFishName] += 1;

      // Lưu kết quả từng slot
      slotResults.push({
        slot: i + 1,
        rod: rod.name,
        fish: slotFishName,
        exp: slotExpGain,
        money: slotMoneyGain
      });

      // Cập nhật stats
      this.playerData.stats.totalFishCaught += 1;
      if (slotFishType.type === 'rare') this.playerData.stats.rareCaught += 1;
      if (slotFishType.type === 'legendary') this.playerData.stats.legendaryCaught += 1;
      if (slotFishType.type === 'mythical') this.playerData.stats.mythicalCaught += 1;
    }

    // Giảm độ bền cần câu: slot 1 dùng cần đang trang bị, slot 2..N dùng cần khác trong túi
    if (!rodExpired && this.playerData.equipment?.rod) {
      // slot 1
      const equipped = this.playerData.equipment.rod;
      const invIndex = (this.playerData.inventory.rods || []).findIndex(r => r.id === equipped.id && r.name === equipped.name);
      if (invIndex !== -1) {
        const invRod = this.playerData.inventory.rods[invIndex];
        invRod.uses = Math.max(0, (invRod.uses || 0) - 1);
        this.playerData.equipment.rod.uses = invRod.uses;
        const breakChance = invRod.effects?.breakChance || equipped.effects?.breakChance || 0;
        if (invRod.uses <= 0 || Math.random() < breakChance) {
          rodBroken = true;
          this.playerData.inventory.rods.splice(invIndex, 1);
          this.playerData.equipment.rod = null;
          this.playerData.stats.rodsBroken = (this.playerData.stats.rodsBroken || 0) + 1;
        }
      }
      // slots 2..N
      let remainingExtra = Math.max(0, slots - 1);
      if (remainingExtra > 0) {
        for (let i = 0; i < this.playerData.inventory.rods.length && remainingExtra > 0; i++) {
          const r = this.playerData.inventory.rods[i];
          if (equipped && r.id === equipped.id && r.name === equipped.name) continue;
          r.uses = Math.max(0, (r.uses || 0) - 1);
          const breakChance = r.effects?.breakChance || 0;
          if (r.uses <= 0 || Math.random() < breakChance) {
            this.playerData.inventory.rods.splice(i, 1);
            this.playerData.stats.rodsBroken = (this.playerData.stats.rodsBroken || 0) + 1;
            i--;
          }
          remainingExtra--;
        }
      }
    }

    // Cập nhật inventory cá
    for (const [fishName, qty] of Object.entries(caughtFish)) {
      if (!this.playerData.inventory.fish[fishName]) {
        this.playerData.inventory.fish[fishName] = 0;
      }
      this.playerData.inventory.fish[fishName] += qty;
    }

    // Cập nhật exp và tiền
    this.playerData.exp += totalExp;
    const leveledUp = this.processLevelUp();
    this.playerData.money += totalMoney;

    // Nhận vé với tỷ lệ (base 5% + bonus)
    const baseTicketChance = 0.05;
    const totalTicketChance = baseTicketChance + ticketBonus;
    let ticketGain = 0;
    if (Math.random() < totalTicketChance) {
      ticketGain = 1;
      this.playerData.inventory.tickets = (this.playerData.inventory.tickets || 0) + ticketGain;
      bonusText += `\n🎟️ +${ticketGain} Vé quay may mắn!`;
    }

    // Tạo message với chi tiết từng slot
    let slotDetails = "";
    if (slotResults.length > 0) {
      slotDetails = "\n🎯 Chi tiết từng slot:\n";
      slotResults.forEach(result => {
        slotDetails += `  Slot ${result.slot}: ${result.fish} (+${result.exp} EXP, +${result.money} VND)\n`;
      });
    }

    let fishNames = Object.keys(caughtFish).slice(0, 3).join(", ");
    if (Object.keys(caughtFish).length > 3) {
      fishNames += `... và ${Object.keys(caughtFish).length - 3} loại khác`;
    }

    let levelUpMessage = "";
    if (leveledUp) {
      levelUpMessage = `\n🎉 Level Up! Cấp ${this.playerData.level}`;
      if ([10, 20, 30, 40, 50, 60, 70, 80, 100].includes(this.playerData.level)) {
        levelUpMessage += ` - Mở khóa slot câu mới! (${this.playerData.fishingSlots} slot)`;
      }
      if (this.lastLevelUpBonus && (this.lastLevelUpBonus.tickets || this.lastLevelUpBonus.money)) {
        levelUpMessage += `\n🎟️ Thưởng: +${this.lastLevelUpBonus.tickets} vé | 💰 +${(this.lastLevelUpBonus.money || 0).toLocaleString()} VND`;
      }
    }

    this.autoSave();

    return {
      success: true,
      message: `🎣 Bạn đã câu được: ${fishNames} (${Object.values(caughtFish).reduce((a, b) => a + b, 0)} con)\n` +
        `🪱 Đã dùng: ${baitName} x${slots}${slotDetails}${rodExpired ? "\n⚠️ Cần câu đã hết hạn, đã gỡ trang bị!" : ""}${rodBroken ? "\n💥 Cần câu đã gãy!" : ""}\n` +
        `📊 Level: ${this.playerData.level} | +${totalExp} EXP | 💰 +${totalMoney} VND${bonusText}${levelUpMessage}\n` +
        `📈 Exp: ${this.playerData.exp}/${this.playerData.expToNext || this.calculateExpToNext(this.playerData.level)}`
    };
  }

  getRandomFishName(fishType, area) {
    if (fishType === 'junk') return 'Rác';
    const names = area.fishNames?.[fishType] || [];
    if (names.length === 0) return `Cá ${fishType}`;
    return names[Math.floor(Math.random() * names.length)];
  }

  // Mua vật phẩm
  buyItem(itemInput, quantity = 1) {
    const config = loadGameConfig();
    const shopItems = [...(config.shopItems || []), ...(config.shopItem || [])];

    let item;
    if (typeof itemInput === 'number') {
      // itemInput is an index
      item = shopItems[itemInput];
      if (!item) {
        return { success: false, message: `❌ Không tìm thấy vật phẩm số ${itemInput + 1}!` };
      }
    } else {
      // itemInput is a string
      const result = parseItemInput(itemInput, shopItems, 'shop');
      if (!result) {
        return { success: false, message: `❌ Không tìm thấy vật phẩm "${itemInput}"!` };
      }
      item = result.item;
    }

    const totalPrice = (item.price || 0) * quantity;
    if (item.price && this.playerData.money < totalPrice) {
      return { success: false, message: `❌ Không đủ tiền! Cần ${totalPrice.toLocaleString()} VND` };
    }

    if (item.levelRequired && this.playerData.level < item.levelRequired) {
      return { success: false, message: `❌ Cần cấp ${item.levelRequired} để mua vật phẩm này!` };
    }

    // Xử lý mua vật phẩm
    if (item.type === 'rod') {
      // Thêm vào inventory rods
      if (!this.playerData.inventory.rods) {
        this.playerData.inventory.rods = [];
      }
      for (let i = 0; i < quantity; i++) {
        this.playerData.inventory.rods.push({
          id: item.id,
          name: item.name,
          effects: item.effects,
          uses: item.effects?.uses || 0,
          purchasedAt: Date.now()
        });
      }
    } else if (item.type === 'bait') {
      // Thêm vào inventory baits - 1 lần mua được 15 mồi * quantity
      if (!this.playerData.inventory.baits[item.id]) {
        this.playerData.inventory.baits[item.id] = 0;
      }
      this.playerData.inventory.baits[item.id] += 15 * quantity;
    } else if (item.type === 'tool') {
      // Thêm vào inventory tools
      if (!this.playerData.inventory.tools) {
        this.playerData.inventory.tools = [];
      }
      for (let i = 0; i < quantity; i++) {
        this.playerData.inventory.tools.push({
          id: item.id,
          name: item.name,
          effects: item.effects,
          purchasedAt: Date.now()
        });
      }
    }

    this.playerData.money -= totalPrice;
    this.playerData.stats.totalSpent += totalPrice;
    this.autoSave();

    const quantityText = quantity > 1 ? ` x${quantity}` : '';
    return {
      success: true,
      message: `✅ Đã mua ${item.name}${quantityText} với giá ${totalPrice.toLocaleString()} VND!`
    };
  }

  // Bán cá
  sellFish(fishInput) {
    const fishList = Object.keys(this.playerData.inventory.fish || {});
    if (fishList.length === 0) {
      return { success: false, message: "❌ Không có cá để bán!" };
    }

    // Xử lý "sell all"
    if (fishInput.toLowerCase().trim() === 'all' || fishInput.toLowerCase().trim() === 'tất cả') {
      let totalMoney = 0;
      let totalFish = 0;
      const soldFish = [];

      for (const [fishName, quantity] of Object.entries(this.playerData.inventory.fish)) {
        const sellPrice = quantity * 50;
        totalMoney += sellPrice;
        totalFish += quantity;
        soldFish.push(`${fishName} x${quantity}`);
      }

      this.playerData.money += totalMoney;
      this.playerData.inventory.fish = {};
      this.autoSave();

      return {
        success: true,
        message: `✅ Đã bán tất cả cá!\n` +
          `📊 Tổng: ${totalFish} con cá\n` +
          `💰 Tổng tiền: ${totalMoney.toLocaleString()} VND\n` +
          `📦 Đã bán: ${soldFish.slice(0, 5).join(', ')}${soldFish.length > 5 ? `... và ${soldFish.length - 5} loại khác` : ''}`
      };
    }

    // Xử lý bán từng loại cá
    const result = parseItemInput(fishInput, fishList.map(name => ({ name, id: name })), 'inventory');
    if (!result) {
      return { success: false, message: `❌ Không tìm thấy cá "${fishInput}"!\n💡 Gõ \`sell all\` để bán tất cả cá.` };
    }

    const fishName = result.item.name;
    const quantity = this.playerData.inventory.fish[fishName] || 0;
    
    if (quantity === 0) {
      return { success: false, message: `❌ Bạn không có ${fishName}!` };
    }

    // Tính giá bán (50 VND mỗi con cá)
    const sellPrice = quantity * 50;
    this.playerData.money += sellPrice;
    delete this.playerData.inventory.fish[fishName];
    this.autoSave();

    return {
      success: true,
      message: `✅ Đã bán ${quantity} ${fishName} với giá ${sellPrice.toLocaleString()} VND!`
    };
  }

  // Quay vòng quay may mắn
  spinLucky() {
    const tickets = this.playerData.inventory.tickets || 0;
    if (tickets < 1) {
      return { success: false, message: "❌ Bạn cần ít nhất 1 vé để quay! (Nhận vé khi câu cá)" };
    }

    const config = loadGameConfig();
    const luckyConfig = config.LUCKY || {
      rewards: [
        { type: 'money', value: 5000, chance: 40, name: '💰 5,000 VND' },
        { type: 'money', value: 10000, chance: 25, name: '💰 10,000 VND' },
        { type: 'money', value: 20000, chance: 15, name: '💰 20,000 VND' },
        { type: 'exp', value: 1000, chance: 10, name: '📊 1,000 EXP' },
        { type: 'ticket', value: 1, chance: 5, name: '🎟️ 1 Vé' },
        { type: 'item', value: 'bait_rice', chance: 6, name: '🪱 Mồi cơm' },
        { type: 'item', value: 'bait_worm', chance: 4, name: '🪱 Mồi Trùng' },
        { type: 'money', value: 50000, chance: 2, name: '💰 50,000 VND' }
      ]
    };

    // Tính tỷ lệ
    const rand = Math.random() * 100;
    let reward = null;
    let cumulative = 0;

    for (const r of luckyConfig.rewards) {
      cumulative += r.chance;
      if (rand <= cumulative) {
        reward = r;
        break;
      }
    }

    if (!reward) {
      reward = luckyConfig.rewards[0]; // Fallback
    }

    // Trừ vé
    this.playerData.inventory.tickets = tickets - 1;

    // Áp dụng phần thưởng
    let rewardText = "";
    switch (reward.type) {
      case 'money':
        this.playerData.money += reward.value;
        rewardText = `💰 +${reward.value.toLocaleString()} VND`;
        break;
      case 'exp':
        this.playerData.exp += reward.value;
        this.processLevelUp();
        rewardText = `📊 +${reward.value.toLocaleString()} EXP`;
        break;
      case 'ticket':
        this.playerData.inventory.tickets = (this.playerData.inventory.tickets || 0) + reward.value;
        rewardText = `🎟️ +${reward.value} Vé`;
        break;
      case 'item':
        // Thêm item vào inventory - xử lý tất cả loại item
        const config = loadGameConfig();
        const allItems = [...(config.shopItems || []), ...(config.shopItem || []), ...(config.pets || [])];
        const itemConfig = allItems.find(it => it.id === reward.value);
        
        if (itemConfig) {
          if (itemConfig.type === 'bait') {
            if (!this.playerData.inventory.baits) {
              this.playerData.inventory.baits = {};
            }
            if (!this.playerData.inventory.baits[reward.value]) {
              this.playerData.inventory.baits[reward.value] = 0;
            }
            this.playerData.inventory.baits[reward.value] += (itemConfig.effects?.uses || 1);
            rewardText = `${itemConfig.name} x${itemConfig.effects?.uses || 1}`;
          } else if (itemConfig.type === 'rod') {
            if (!this.playerData.inventory.rods) {
              this.playerData.inventory.rods = [];
            }
            this.playerData.inventory.rods.push({
              id: itemConfig.id,
              name: itemConfig.name,
              effects: itemConfig.effects,
              uses: itemConfig.effects?.uses || 0,
              purchasedAt: Date.now()
            });
            rewardText = itemConfig.name;
          } else if (itemConfig.type === 'tool') {
            if (!this.playerData.inventory.tools) {
              this.playerData.inventory.tools = [];
            }
            this.playerData.inventory.tools.push({
              id: itemConfig.id,
              name: itemConfig.name,
              effects: itemConfig.effects,
              purchasedAt: Date.now()
            });
            rewardText = itemConfig.name;
          } else if (itemConfig.type === 'pet') {
            if (!this.playerData.inventory.pets) {
              this.playerData.inventory.pets = [];
            }
            this.playerData.inventory.pets.push({
              id: itemConfig.id,
              name: itemConfig.name,
              effects: itemConfig.effects,
              level: 1,
              exp: 0,
              purchasedAt: Date.now()
            });
            rewardText = itemConfig.name;
          } else {
            rewardText = reward.name;
          }
        } else {
          // Fallback cho bait nếu không tìm thấy config
          if (reward.value.startsWith('bait_')) {
            if (!this.playerData.inventory.baits) {
              this.playerData.inventory.baits = {};
            }
            if (!this.playerData.inventory.baits[reward.value]) {
              this.playerData.inventory.baits[reward.value] = 0;
            }
            this.playerData.inventory.baits[reward.value] += 1;
          }
          rewardText = reward.name;
        }
        break;
    }

    this.autoSave();

    return {
      success: true,
      message: `🎰 VÒNG QUAY MAY MẮN 🎰\n\n` +
        `🎁 Phần thưởng: ${reward.name}\n` +
        `✨ ${rewardText}\n\n` +
        `🎟️ Vé còn lại: ${this.playerData.inventory.tickets}`
    };
  }

  // Quay n lần (giới hạn theo số vé hiện có)
  spinLuckyMany(count) {
    const tickets = this.playerData.inventory.tickets || 0;
    const spins = Math.max(1, Math.min(count || 1, tickets));
    if (spins < 1) {
      return { success: false, message: "❌ Bạn không có vé để quay!" };
    }
    let summary = [];
    for (let i = 0; i < spins; i++) {
      const r = this.spinLucky();
      summary.push(r.message.split('\n')[1]?.replace('🎁 Phần thưởng: ', '') || '—');
    }
    return {
      success: true,
      message: `🎰 QUAY ${spins} LẦN\n` + summary.slice(0, 10).map((s, idx) => `#${idx + 1} ${s}`).join('\n') + (summary.length > 10 ? `\n... ${summary.length - 10} kết quả khác` : '') + `\n\n🎟️ Vé còn lại: ${this.playerData.inventory.tickets}`
    };
  }

  // Quay tất cả vé may mắn
  spinLuckyAll() {
    const tickets = this.playerData.inventory.tickets || 0;
    if (tickets < 1) {
      return { success: false, message: "❌ Bạn không có vé nào để quay! (Nhận vé khi câu cá)" };
    }

    const config = loadGameConfig();
    const luckyConfig = config.LUCKY || {
      rewards: [
        { type: 'money', value: 5000, chance: 40, name: '💰 5,000 VND' },
        { type: 'money', value: 10000, chance: 25, name: '💰 10,000 VND' },
        { type: 'money', value: 20000, chance: 15, name: '💰 20,000 VND' },
        { type: 'exp', value: 1000, chance: 10, name: '📊 1,000 EXP' },
        { type: 'ticket', value: 1, chance: 5, name: '🎟️ 1 Vé' },
        { type: 'item', value: 'bait_rice', chance: 6, name: '🪱 Mồi cơm' },
        { type: 'item', value: 'bait_worm', chance: 4, name: '🪱 Mồi Trùng' },
        { type: 'money', value: 50000, chance: 2, name: '💰 50,000 VND' }
      ]
    };

    let totalMoney = 0;
    let totalExp = 0;
    let totalTickets = 0;
    let rewardsList = [];
    let spins = tickets;

    // Quay tất cả vé
    for (let i = 0; i < tickets; i++) {
      // Tính tỷ lệ
      const rand = Math.random() * 100;
      let reward = null;
      let cumulative = 0;

      for (const r of luckyConfig.rewards) {
        cumulative += r.chance;
        if (rand <= cumulative) {
          reward = r;
          break;
        }
      }

      if (!reward) {
        reward = luckyConfig.rewards[0]; // Fallback
      }

      // Áp dụng phần thưởng
      switch (reward.type) {
        case 'money':
          this.playerData.money += reward.value;
          totalMoney += reward.value;
          break;
        case 'exp':
          this.playerData.exp += reward.value;
          totalExp += reward.value;
          break;
        case 'ticket':
          this.playerData.inventory.tickets = (this.playerData.inventory.tickets || 0) + reward.value;
          totalTickets += reward.value;
          break;
        case 'item':
          // Thêm item vào inventory
          const allItems = [...(config.shopItems || []), ...(config.shopItem || [])];
          const itemConfig = allItems.find(it => it.id === reward.value);
          
          if (itemConfig) {
            if (itemConfig.type === 'bait') {
              if (!this.playerData.inventory.baits) {
                this.playerData.inventory.baits = {};
              }
              if (!this.playerData.inventory.baits[reward.value]) {
                this.playerData.inventory.baits[reward.value] = 0;
              }
              this.playerData.inventory.baits[reward.value] += 1;
            } else if (itemConfig.type === 'rod') {
              if (!this.playerData.inventory.rods) {
                this.playerData.inventory.rods = [];
              }
              this.playerData.inventory.rods.push({
                id: itemConfig.id,
                name: itemConfig.name,
                effects: itemConfig.effects,
                uses: itemConfig.effects?.uses || 0,
                purchasedAt: Date.now()
              });
            } else if (itemConfig.type === 'tool') {
              if (!this.playerData.inventory.tools) {
                this.playerData.inventory.tools = [];
              }
              this.playerData.inventory.tools.push({
                id: itemConfig.id,
                name: itemConfig.name,
                effects: itemConfig.effects,
                purchasedAt: Date.now()
              });
            }
          } else {
            // Fallback cho bait
            if (reward.value.startsWith('bait_')) {
              if (!this.playerData.inventory.baits) {
                this.playerData.inventory.baits = {};
              }
              if (!this.playerData.inventory.baits[reward.value]) {
                this.playerData.inventory.baits[reward.value] = 0;
              }
              this.playerData.inventory.baits[reward.value] += 1;
            }
          }
          break;
      }

      rewardsList.push(reward.name);
    }

    // Trừ tất cả vé đã dùng
    this.playerData.inventory.tickets = (this.playerData.inventory.tickets || 0) - tickets;

    // Xử lý level up nếu có exp
    if (totalExp > 0) {
      this.processLevelUp();
    }

    this.autoSave();

    // Tạo message tổng kết
    let message = `🎰 QUAY TẤT CẢ VÉ MAY MẮN 🎰\n\n`;
    message += `🎟️ Đã quay: ${spins} vé\n\n`;
    
    if (totalMoney > 0) {
      message += `💰 Tổng tiền: +${totalMoney.toLocaleString()} VND\n`;
    }
    if (totalExp > 0) {
      message += `📊 Tổng EXP: +${totalExp.toLocaleString()}\n`;
    }
    if (totalTickets > 0) {
      message += `🎟️ Vé thêm: +${totalTickets}\n`;
    }

    // Hiển thị các phần thưởng (giới hạn 10 cái đầu)
    if (rewardsList.length > 0) {
      message += `\n🎁 Phần thưởng nhận được:\n`;
      const uniqueRewards = [...new Set(rewardsList)];
      uniqueRewards.slice(0, 10).forEach(reward => {
        const count = rewardsList.filter(r => r === reward).length;
        message += `  • ${reward}${count > 1 ? ` x${count}` : ''}\n`;
      });
      if (uniqueRewards.length > 10) {
        message += `  ... và ${uniqueRewards.length - 10} loại khác\n`;
      }
    }

    message += `\n🎟️ Vé còn lại: ${this.playerData.inventory.tickets}`;

    return {
      success: true,
      message: message
    };
  }

  // Đổi code quà tặng
  redeemCode(code) {
    const config = loadGameConfig();
    const giftCodes = config.giftCodes || {};
    const normalizedInput = (code || '').trim().toUpperCase();

    const reward = giftCodes[normalizedInput];
    if (!reward) {
      return {
        success: false,
        message: `❌ Mã quà tặng "${code}" không hợp lệ!`
      };
    }

    // Kiểm tra đã đổi chưa
    if (!this.playerData.redeemedCodes) {
      this.playerData.redeemedCodes = {};
    }
    if (this.playerData.redeemedCodes[normalizedInput]) {
      return {
        success: false,
        message: `⚠️ Bạn đã nhận mã "${normalizedInput}" trước đó rồi!`
      };
    }

    let rewardText = `🎁 Nhận được từ code "${normalizedInput}":\n`;

    // Áp dụng phần thưởng
    if (reward.tickets) {
      this.playerData.inventory.tickets = (this.playerData.inventory.tickets || 0) + reward.tickets;
      rewardText += `🎟️ +${reward.tickets} Vé quay may mắn\n`;
    }

    if (reward.money) {
      this.playerData.money += reward.money;
      rewardText += `💰 +${reward.money.toLocaleString()} VND\n`;
    }

    if (reward.items && Array.isArray(reward.items)) {
      const allItems = [...(config.shopItems || []), ...(config.shopItem || [])];
      for (const itemId of reward.items) {
        const item = allItems.find(it => it.id === itemId);
        if (!item) continue;
        if (item.type === 'rod') {
          if (!this.playerData.inventory.rods) this.playerData.inventory.rods = [];
          const newRod = {
            id: item.id,
            name: item.name,
            effects: item.effects,
            uses: item.effects?.uses || 0,
            purchasedAt: Date.now(),
            expiresAt: item.durationDays ? Date.now() + (item.durationDays * 24 * 60 * 60 * 1000) : null
          };
          this.playerData.inventory.rods.push(newRod);
          // Tự trang bị nếu chưa có cần
          if (!this.playerData.equipment?.rod) {
            this.playerData.equipment.rod = {
              id: newRod.id,
              name: newRod.name,
              effects: newRod.effects,
              uses: newRod.uses,
              equippedAt: Date.now()
            };
            rewardText += `🎣 ${item.name} (đã trang bị)\n`;
          } else {
            rewardText += `🎣 ${item.name} (đã thêm vào túi)\n`;
          }
        } else if (item.type === 'bait') {
          if (!this.playerData.inventory.baits[item.id]) this.playerData.inventory.baits[item.id] = 0;
          this.playerData.inventory.baits[item.id] += 15;
          rewardText += `🪱 ${item.name} x15\n`;
        }
      }
    }

    // Đánh dấu đã đổi
    this.playerData.redeemedCodes[normalizedInput] = Date.now();
    this.autoSave();

    return {
      success: true,
      message: rewardText
    };
  }

  // Trang bị vật phẩm
  equipItem(itemInput) {
    const config = loadGameConfig();
    const allItems = [...(config.shopItems || []), ...(config.shopItem || [])];

    // Tìm trong inventory
    let foundItem = null;
    let foundType = null;
    let slotNumber = null;

    const trimmed = (itemInput || '').trim();
    const lower = trimmed.toLowerCase();

    // Check for rod index and slot equipping (e.g., "rod 1 1" means equip rod index 1 to slot 1)
    const rodIndexSlotMatch = lower.match(/^rod\s+(\d+)\s+(\d+)$/);
    if (rodIndexSlotMatch) {
      const rodIndex = parseInt(rodIndexSlotMatch[1], 10) - 1; // 0-based rod index
      slotNumber = parseInt(rodIndexSlotMatch[2], 10) - 1; // 0-based slot number
      const activeSlots = this.playerData.activeSlots || 1;
      if (slotNumber < 0 || slotNumber >= activeSlots) {
        return { success: false, message: `❌ Slot ${slotNumber + 1} không khả dụng! Bạn có ${activeSlots} slot.` };
      }
      // Find rod by index in sorted list
      const rodsSorted = (this.playerData.inventory.rods || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      if (rodIndex >= 0 && rodIndex < rodsSorted.length) {
        foundItem = rodsSorted[rodIndex];
        foundType = 'rod';
      } else {
        return { success: false, message: `❌ Không tìm thấy cần câu số ${rodIndex + 1}!` };
      }
    }

    // Check for slot-specific rod equipping (e.g., "rod 1", "rod slot 2") - fallback for old syntax
    const rodSlotMatch = lower.match(/^rod\s+(?:slot\s+)?(\d+)$/);
    if (rodSlotMatch && !foundItem) {
      slotNumber = parseInt(rodSlotMatch[1], 10) - 1; // Convert to 0-based
      const activeSlots = this.playerData.activeSlots || 1;
      if (slotNumber < 0 || slotNumber >= activeSlots) {
        return { success: false, message: `❌ Slot ${slotNumber + 1} không khả dụng! Bạn có ${activeSlots} slot.` };
      }
      // For rod slot equipping, we need to find the rod by name or index
      const parts = trimmed.split(/\s+/);
      if (parts.length > 2) {
        const rodName = parts.slice(2).join(' ');
        // Find rod by name
        for (const rod of this.playerData.inventory.rods || []) {
          if (rod.name.toLowerCase().includes(rodName.toLowerCase())) {
            foundItem = rod;
            foundType = 'rod';
            break;
          }
        }
      }
    }

    const numMatch = lower.match(/^#?(?:rod\s+|bait\s+)?(\d+)$/);
    if (numMatch && !foundItem) {
      const index = parseInt(numMatch[1], 10) - 1;
      if (lower.startsWith('rod')) {
        const rodsSorted = (this.playerData.inventory.rods || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        if (index >= 0 && index < rodsSorted.length) {
          foundItem = rodsSorted[index];
          foundType = 'rod';
        }
      } else if (lower.startsWith('bait')) {
        const baitEntries = Object.entries(this.playerData.inventory.baits || {})
          .map(([id, qty]) => {
            const item = allItems.find(it => it.id === id);
            return { id, name: item?.name || id, quantity: qty };
          })
          .sort((a, b) => a.name.localeCompare(b.name));
        if (index >= 0 && index < baitEntries.length) {
          const b = baitEntries[index];
          foundItem = { id: b.id, name: b.name, quantity: b.quantity };
          foundType = 'bait';
        }
      } else {
        // Mặc định ưu tiên bait, sau đó rod
        const baitEntries = Object.entries(this.playerData.inventory.baits || {})
          .map(([id, qty]) => {
            const item = allItems.find(it => it.id === id);
            return { id, name: item?.name || id, quantity: qty };
          })
          .sort((a, b) => a.name.localeCompare(b.name));
        if (index >= 0 && index < baitEntries.length) {
          const b = baitEntries[index];
          foundItem = { id: b.id, name: b.name, quantity: b.quantity };
          foundType = 'bait';
        } else {
          const rodsSorted = (this.playerData.inventory.rods || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          const rodIndex = index - baitEntries.length;
          if (rodIndex >= 0 && rodIndex < rodsSorted.length) {
            foundItem = rodsSorted[rodIndex];
            foundType = 'rod';
          }
        }
      }
      if (!foundItem) {
        return { success: false, message: '❌ Chỉ số không hợp lệ!' };
      }
    }

    // Tìm trong rods
    if (!foundItem && this.playerData.inventory.rods && Array.isArray(this.playerData.inventory.rods)) {
      for (const rod of this.playerData.inventory.rods) {
        const rodConfig = allItems.find(it => it.id === rod.id);
        if (rodConfig && (rod.name.toLowerCase().includes(itemInput.toLowerCase()) ||
            rodConfig.name.toLowerCase().includes(itemInput.toLowerCase()))) {
          foundItem = rod;
          foundType = 'rod';
          break;
        }
      }
    }

    // Tìm trong baits
    if (!foundItem && this.playerData.inventory.baits) {
      for (const [baitId, qty] of Object.entries(this.playerData.inventory.baits)) {
        if (qty > 0) {
          const baitConfig = allItems.find(it => it.id === baitId);
          if (baitConfig && (baitConfig.name.toLowerCase().includes(itemInput.toLowerCase()) ||
              baitId.toLowerCase().includes(itemInput.toLowerCase()))) {
            foundItem = { id: baitId, name: baitConfig.name, quantity: qty };
            foundType = 'bait';
            break;
          }
        }
      }
    }

    if (!foundItem) {
      return {
        success: false,
        message: `❌ Không tìm thấy vật phẩm "${itemInput}" trong túi đồ!\n💡 Gõ \`inventory\` để xem túi đồ.`
      };
    }

    // Trang bị
    if (foundType === 'rod') {
      if (!this.playerData.equipment.rods) {
        this.playerData.equipment.rods = [];
      }
      // Ensure array has enough slots
      while (this.playerData.equipment.rods.length < (this.playerData.activeSlots || 1)) {
        this.playerData.equipment.rods.push(null);
      }

      if (slotNumber !== null) {
        // Equip to specific slot
        this.playerData.equipment.rods[slotNumber] = {
          id: foundItem.id,
          name: foundItem.name,
          effects: foundItem.effects,
          uses: foundItem.uses || 0,
          equippedAt: Date.now()
        };
        this.autoSave();
        return {
          success: true,
          message: `✅ Đã trang bị ${foundItem.name} vào slot ${slotNumber + 1}\n🎣 Slot ${slotNumber + 1}: ${foundItem.name}`
        };
      } else {
        // Equip to first available slot or slot 1
        const targetSlot = 0; // Default to slot 1 (0-based)
        this.playerData.equipment.rods[targetSlot] = {
          id: foundItem.id,
          name: foundItem.name,
          effects: foundItem.effects,
          uses: foundItem.uses || 0,
          equippedAt: Date.now()
        };
        this.autoSave();
        return {
          success: true,
          message: `✅ Đã trang bị ${foundItem.name} vào slot 1\n🎣 Slot 1: ${foundItem.name}`
        };
      }
    } else if (foundType === 'bait') {
      this.playerData.equipment.bait = {
        id: foundItem.id,
        name: foundItem.name,
        quantity: foundItem.quantity
      };
      this.autoSave();
      return {
        success: true,
        message: `✅ Đã chọn mồi: ${foundItem.name}\n🪱 Số lượng: ${foundItem.quantity}`
      };
    }

    return {
      success: false,
      message: "❌ Không thể trang bị vật phẩm này!"
    };
  }

  // Mua kích hoạt slot câu tiếp theo (50,000 VND)
  purchaseSlot() {
    const potentialSlots = this.calculateFishingSlots(this.playerData.level);
    const active = this.playerData.activeSlots || 1;
    if (active >= potentialSlots) {
      return { success: false, message: `⚠️ Đã đạt tối đa slot cho cấp hiện tại! (Hiện ${active}/${potentialSlots})` };
    }
    const cost = 50000;
    if ((this.playerData.money || 0) < cost) {
      return { success: false, message: `❌ Không đủ vàng! Cần ${cost.toLocaleString()} VND để mở slot.` };
    }
    this.playerData.money -= cost;
    this.playerData.activeSlots = active + 1;
    this.autoSave();
    return { success: true, message: `✅ Đã mở slot câu ${this.playerData.activeSlots}/${potentialSlots}!` };
  }
}



